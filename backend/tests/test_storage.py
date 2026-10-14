import unittest
from unittest.mock import MagicMock, patch
import os
import sys
import time
import threading

# Ensure project root is on sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.db.mongo import MongoManager, sanitize_mongo_uri
from backend.repositories.project_repository import ProjectRepository, DatabaseUnavailableError
from backend.middleware.auth import (
    verify_puter_token,
    get_authenticated_user,
    require_auth,
    clear_token_cache,
    _TOKEN_CACHE,
    _CACHE_LOCK,
)
from backend.app import app
from flask import jsonify


class TestMongoManager(unittest.TestCase):
    """Tests for centralized MongoDB connection manager and URI sanitization."""

    def test_sanitize_mongo_uri(self):
        # 1. URI with username and password
        raw = "mongodb+srv://user123:secretpass@cluster0.p7hhicw.mongodb.net/testdb?retryWrites=true"
        sanitized = sanitize_mongo_uri(raw)
        self.assertNotIn("secretpass", sanitized)
        self.assertNotIn("user123", sanitized)
        self.assertIn("cluster0.p7hhicw.mongodb.net", sanitized)
        self.assertIn("<credentials-hidden>", sanitized)

        # 2. URI without credentials
        raw_clean = "mongodb://localhost:27017"
        self.assertEqual(sanitize_mongo_uri(raw_clean), "mongodb://localhost:27017")

        # 3. Empty URI
        self.assertEqual(sanitize_mongo_uri(""), "<unset>")

    def test_lazy_initialization_no_connection_on_import(self):
        # Instantiate with empty URI
        mgr = MongoManager(uri="", db_name="testdb")
        self.assertIsNone(mgr.get_client())
        self.assertIsNone(mgr.get_db())
        self.assertFalse(mgr.is_connected())

        status = mgr.get_health_status()
        self.assertFalse(status["configured"])
        self.assertFalse(status["connected"])
        self.assertIsNone(status["database"])

    @patch("backend.db.mongo.MongoClient")
    def test_client_creation_and_reconnect(self, mock_client_cls):
        mock_instance = MagicMock()
        mock_client_cls.return_value = mock_instance

        mgr = MongoManager(uri="mongodb://localhost:27017", db_name="testdb")
        client = mgr.get_client()

        self.assertIsNotNone(client)
        mock_client_cls.assert_called_once()

        # Calling again reuses client
        client2 = mgr.get_client()
        self.assertEqual(client, client2)
        self.assertEqual(mock_client_cls.call_count, 1)

        # Test close
        mgr.close()
        self.assertIsNone(mgr._client)

    @patch("backend.db.mongo.MongoClient")
    def test_is_connected_failure_handling(self, mock_client_cls):
        mock_instance = MagicMock()
        mock_instance.admin.command.side_effect = Exception("Connection timed out")
        mock_client_cls.return_value = mock_instance

        mgr = MongoManager(uri="mongodb://localhost:27017", db_name="testdb")
        self.assertFalse(mgr.is_connected())


class TestProjectRepository(unittest.TestCase):
    """Tests for ProjectRepository CRUD operations, owner isolation, and strict owner requirements."""

    def setUp(self):
        self.mock_db = MagicMock()
        self.mock_manager = MagicMock()
        self.mock_manager.get_db.return_value = self.mock_db

        # In-memory storage backing mock collections
        self.projects_store = {}
        self.assets_store = {}
        self.jobs_store = {}

        # Mock collection methods for 'projects'
        def mock_replace_project(filter_dict, doc, upsert=False):
            pid = filter_dict["project_id"]
            self.projects_store[pid] = dict(doc)
            return MagicMock(upserted_id=pid)

        def mock_find_one_project(query):
            pid = query.get("project_id")
            doc = self.projects_store.get(pid)
            if not doc:
                return None
            if "owner_id" in query and doc.get("owner_id") != query["owner_id"]:
                return None
            return dict(doc)

        def mock_find_projects(query):
            owner = query.get("owner_id")
            p_type = query.get("type")
            res = []
            for doc in self.projects_store.values():
                if owner and doc.get("owner_id") != owner:
                    continue
                if p_type and doc.get("type") != p_type:
                    continue
                res.append(dict(doc))
            mock_cursor = MagicMock()
            mock_cursor.sort.return_value = mock_cursor
            mock_cursor.skip.return_value = mock_cursor
            mock_cursor.limit.return_value = res
            mock_cursor.__iter__.return_value = iter(res)
            return mock_cursor

        def mock_update_project(query, update_dict):
            pid = query.get("project_id")
            doc = self.projects_store.get(pid)
            if not doc:
                return MagicMock(matched_count=0)
            if "owner_id" in query and doc.get("owner_id") != query["owner_id"]:
                return MagicMock(matched_count=0)
            doc.update(update_dict.get("$set", {}))
            return MagicMock(matched_count=1)

        def mock_delete_project(query):
            pid = query.get("project_id")
            doc = self.projects_store.get(pid)
            if not doc:
                return MagicMock(deleted_count=0)
            if "owner_id" in query and doc.get("owner_id") != query["owner_id"]:
                return MagicMock(deleted_count=0)
            del self.projects_store[pid]
            return MagicMock(deleted_count=1)

        mock_projects_coll = MagicMock()
        mock_projects_coll.replace_one.side_effect = mock_replace_project
        mock_projects_coll.find_one.side_effect = mock_find_one_project
        mock_projects_coll.find.side_effect = mock_find_projects
        mock_projects_coll.update_one.side_effect = mock_update_project
        mock_projects_coll.delete_one.side_effect = mock_delete_project

        # Mock collection methods for 'assets'
        def mock_replace_asset(filter_dict, doc, upsert=False):
            aid = filter_dict["asset_id"]
            self.assets_store[aid] = dict(doc)
            return MagicMock(upserted_id=aid)

        def mock_find_assets(query):
            pid = query.get("project_id")
            owner = query.get("owner_id")
            res = [
                dict(a) for a in self.assets_store.values()
                if (not pid or a.get("project_id") == pid) and (not owner or a.get("owner_id") == owner)
            ]
            mock_cursor = MagicMock()
            mock_cursor.sort.return_value = res
            mock_cursor.__iter__.return_value = iter(res)
            return mock_cursor

        def mock_delete_many_assets(query):
            pid = query.get("project_id")
            owner = query.get("owner_id")
            to_del = [
                aid for aid, a in self.assets_store.items()
                if (not pid or a.get("project_id") == pid) and (not owner or a.get("owner_id") == owner)
            ]
            for aid in to_del:
                del self.assets_store[aid]
            return MagicMock(deleted_count=len(to_del))

        mock_assets_coll = MagicMock()
        mock_assets_coll.replace_one.side_effect = mock_replace_asset
        mock_assets_coll.find.side_effect = mock_find_assets
        mock_assets_coll.delete_many.side_effect = mock_delete_many_assets

        # Mock collection methods for 'generation_jobs'
        def mock_replace_job(filter_dict, doc, upsert=False):
            jid = filter_dict["job_id"]
            self.jobs_store[jid] = dict(doc)
            return MagicMock(upserted_id=jid)

        def mock_find_one_job(query):
            jid = query.get("job_id")
            doc = self.jobs_store.get(jid)
            if not doc:
                return None
            if "owner_id" in query and doc.get("owner_id") != query["owner_id"]:
                return None
            return dict(doc)

        def mock_update_job(query, update_dict):
            jid = query.get("job_id")
            doc = self.jobs_store.get(jid)
            if not doc:
                return MagicMock(matched_count=0)
            if "owner_id" in query and doc.get("owner_id") != query["owner_id"]:
                return MagicMock(matched_count=0)
            doc.update(update_dict.get("$set", {}))
            return MagicMock(matched_count=1)

        def mock_delete_many_jobs(query):
            pid = query.get("project_id")
            owner = query.get("owner_id")
            to_del = [
                jid for jid, j in self.jobs_store.items()
                if (not pid or j.get("project_id") == pid) and (not owner or j.get("owner_id") == owner)
            ]
            for jid in to_del:
                del self.jobs_store[jid]
            return MagicMock(deleted_count=len(to_del))

        mock_jobs_coll = MagicMock()
        mock_jobs_coll.replace_one.side_effect = mock_replace_job
        mock_jobs_coll.find_one.side_effect = mock_find_one_job
        mock_jobs_coll.update_one.side_effect = mock_update_job
        mock_jobs_coll.delete_many.side_effect = mock_delete_many_jobs

        self.mock_db.__getitem__.side_effect = lambda name: {
            "projects": mock_projects_coll,
            "assets": mock_assets_coll,
            "generation_jobs": mock_jobs_coll,
        }[name]

        self.repo = ProjectRepository(manager=self.mock_manager)

    def test_create_and_get_project(self):
        project = self.repo.create_project(
            {
                "project_id": "proj_100",
                "name": "Luxury Penthouse",
                "type": "model",
                "status": "completed",
                "parameters": {"floors": 2, "wall_height": 3.0},
            },
            owner_id="user_alice",
        )

        self.assertEqual(project["project_id"], "proj_100")
        self.assertEqual(project["owner_id"], "user_alice")
        self.assertEqual(project["name"], "Luxury Penthouse")

        # Query project strictly with owner_id
        retrieved = self.repo.get_project("proj_100", owner_id="user_alice")
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved["name"], "Luxury Penthouse")

    def test_mandatory_owner_id_rejection(self):
        # 1. get_project rejects missing or empty owner_id
        with self.assertRaises(ValueError):
            self.repo.get_project("p1", owner_id="")
        with self.assertRaises(ValueError):
            self.repo.get_project("p1", owner_id="   ")
        with self.assertRaises(ValueError):
            self.repo.get_project("p1", owner_id=None)

        # 2. update_project rejects missing or empty owner_id
        with self.assertRaises(ValueError):
            self.repo.update_project("p1", {"name": "New"}, owner_id="")
        with self.assertRaises(ValueError):
            self.repo.update_project("p1", {"name": "New"}, owner_id=None)

        # 3. delete_project rejects missing or empty owner_id
        with self.assertRaises(ValueError):
            self.repo.delete_project("p1", owner_id="")
        with self.assertRaises(ValueError):
            self.repo.delete_project("p1", owner_id=None)

        # 4. list_projects_by_owner rejects missing or empty owner_id
        with self.assertRaises(ValueError):
            self.repo.list_projects_by_owner(owner_id="")
        with self.assertRaises(ValueError):
            self.repo.list_projects_by_owner(owner_id=None)

        # 5. Asset and Job methods reject missing or empty owner_id
        with self.assertRaises(ValueError):
            self.repo.get_assets_by_project("p1", owner_id="")
        with self.assertRaises(ValueError):
            self.repo.delete_assets_by_project("p1", owner_id=None)
        with self.assertRaises(ValueError):
            self.repo.get_generation_job("j1", owner_id="")
        with self.assertRaises(ValueError):
            self.repo.update_generation_job("j1", {"status": "completed"}, owner_id=None)
        with self.assertRaises(ValueError):
            self.repo.delete_jobs_by_project("p1", owner_id="")

    def test_owner_isolation_on_retrieval(self):
        self.repo.create_project(
            {"project_id": "proj_secret", "name": "Alice Private"},
            owner_id="user_alice",
        )

        # Alice can access her project
        self.assertIsNotNone(self.repo.get_project("proj_secret", owner_id="user_alice"))

        # Bob CANNOT access Alice's project (returns None)
        self.assertIsNone(self.repo.get_project("proj_secret", owner_id="user_bob"))

    def test_owner_isolation_on_listing(self):
        self.repo.create_project({"project_id": "p1", "name": "P1"}, owner_id="user_alice")
        self.repo.create_project({"project_id": "p2", "name": "P2"}, owner_id="user_alice")
        self.repo.create_project({"project_id": "p3", "name": "P3"}, owner_id="user_bob")

        alice_projects = self.repo.list_projects_by_owner("user_alice")
        bob_projects = self.repo.list_projects_by_owner("user_bob")

        self.assertEqual(len(alice_projects), 2)
        self.assertEqual(len(bob_projects), 1)
        self.assertEqual(bob_projects[0]["project_id"], "p3")

    def test_owner_isolation_on_update(self):
        self.repo.create_project({"project_id": "p_upd", "name": "Original"}, owner_id="user_alice")

        # Bob tries to update Alice's project -> fails (matched_count = 0)
        bob_success = self.repo.update_project("p_upd", {"name": "Hacked"}, owner_id="user_bob")
        self.assertFalse(bob_success)

        # Alice updates her project -> succeeds
        alice_success = self.repo.update_project("p_upd", {"name": "Updated by Alice"}, owner_id="user_alice")
        self.assertTrue(alice_success)

        saved = self.repo.get_project("p_upd", owner_id="user_alice")
        self.assertEqual(saved["name"], "Updated by Alice")

    def test_owner_isolation_on_delete_and_cascade(self):
        self.repo.create_project({"project_id": "p_del", "name": "To Delete"}, owner_id="user_alice")
        self.repo.record_asset(
            {"asset_id": "a1", "project_id": "p_del", "asset_type": "blueprint"},
            owner_id="user_alice",
        )
        self.repo.create_generation_job(
            {"job_id": "j1", "project_id": "p_del", "status": "queued"},
            owner_id="user_alice",
        )

        # Bob tries to delete Alice's project -> fails
        self.assertFalse(self.repo.delete_project("p_del", owner_id="user_bob"))
        self.assertIsNotNone(self.repo.get_project("p_del", owner_id="user_alice"))

        # Alice deletes her project -> succeeds and cascades
        self.assertTrue(self.repo.delete_project("p_del", owner_id="user_alice"))
        self.assertIsNone(self.repo.get_project("p_del", owner_id="user_alice"))
        self.assertEqual(len(self.repo.get_assets_by_project("p_del", owner_id="user_alice")), 0)
        self.assertIsNone(self.repo.get_generation_job("j1", owner_id="user_alice"))

    def test_asset_and_job_standalone_owner_isolation(self):
        # Alice creates asset and job
        self.repo.record_asset(
            {"asset_id": "ast_1", "project_id": "proj_shared", "asset_type": "blueprint"},
            owner_id="user_alice",
        )
        self.repo.create_generation_job(
            {"job_id": "job_1", "project_id": "proj_shared", "status": "queued"},
            owner_id="user_alice",
        )

        # Bob cannot view Alice's assets or job
        bob_assets = self.repo.get_assets_by_project("proj_shared", owner_id="user_bob")
        self.assertEqual(len(bob_assets), 0)

        bob_job = self.repo.get_generation_job("job_1", owner_id="user_bob")
        self.assertIsNone(bob_job)

        # Bob cannot update Alice's job
        bob_update = self.repo.update_generation_job("job_1", {"status": "completed"}, owner_id="user_bob")
        self.assertFalse(bob_update)

        # Alice can view and update her job
        alice_assets = self.repo.get_assets_by_project("proj_shared", owner_id="user_alice")
        self.assertEqual(len(alice_assets), 1)

        alice_update = self.repo.update_generation_job("job_1", {"status": "completed"}, owner_id="user_alice")
        self.assertTrue(alice_update)

    def test_missing_records_return_none(self):
        self.assertIsNone(self.repo.get_project("nonexistent_id", owner_id="user_alice"))
        self.assertIsNone(self.repo.get_generation_job("nonexistent_job", owner_id="user_alice"))

    def test_database_unavailable_error_when_disconnected(self):
        unconnected_manager = MagicMock()
        unconnected_manager.get_db.return_value = None
        unconnected_repo = ProjectRepository(manager=unconnected_manager)

        with self.assertRaises(DatabaseUnavailableError):
            unconnected_repo.create_project({"name": "Test"}, owner_id="user_1")

        with self.assertRaises(DatabaseUnavailableError):
            unconnected_repo.update_project("p1", {"name": "Test"}, owner_id="user_1")

        with self.assertRaises(DatabaseUnavailableError):
            unconnected_repo.delete_project("p1", owner_id="user_1")

        # Read operations return safe empty values when DB is unavailable
        self.assertIsNone(unconnected_repo.get_project("p1", owner_id="user_1"))
        self.assertEqual(unconnected_repo.list_projects_by_owner("user_1"), [])


class TestPuterAuthenticationMiddleware(unittest.TestCase):
    """Tests for server-side Puter token verification, thread safety, and auth decorator."""

    def setUp(self):
        clear_token_cache()

    @patch("backend.middleware.auth.requests.get")
    def test_verify_puter_token_success_and_caching(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "uuid": "puter_uid_12345",
            "username": "architect_bob",
        }
        mock_get.return_value = mock_resp

        # 1. First call hits Puter API
        user = verify_puter_token("valid_token_xyz")
        self.assertIsNotNone(user)
        self.assertEqual(user["user_id"], "puter_uid_12345")
        self.assertEqual(user["username"], "architect_bob")
        self.assertTrue(user["authenticated"])
        self.assertEqual(mock_get.call_count, 1)

        # 2. Second call uses cache (does not hit API)
        cached_user = verify_puter_token("valid_token_xyz")
        self.assertEqual(cached_user, user)
        self.assertEqual(mock_get.call_count, 1)

    @patch("backend.middleware.auth.requests.get")
    def test_verify_puter_token_invalid_or_expired(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_get.return_value = mock_resp

        user = verify_puter_token("expired_token")
        self.assertIsNone(user)

    @patch("backend.middleware.auth.requests.get")
    def test_concurrent_token_cache_thread_safety(self, mock_get):
        """
        Simulates 20 concurrent threads reading, writing, and evicting from the cache.
        Proves that no RuntimeError (dictionary changed size during iteration) occurs.
        """
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.side_effect = lambda: {
            "uuid": f"uid_{threading.get_ident()}",
            "username": "worker_user",
        }
        mock_get.return_value = mock_resp

        errors = []

        def worker(thread_idx):
            try:
                for i in range(25):
                    tok = f"token_thread_{thread_idx}_{i % 5}"
                    res = verify_puter_token(tok)
                    self.assertIsNotNone(res)
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(t,)) for t in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(errors), 0, f"Thread safety errors occurred: {errors}")

    def test_require_auth_decorator_on_flask_client(self):
        """Tests that @require_auth correctly enforces authentication on protected Flask routes."""
        from flask import Flask, request
        test_app = Flask("test_auth_app")

        @test_app.route("/api/test_auth_guard", methods=["GET"])
        @require_auth
        def protected_view():
            return jsonify({
                "success": True,
                "user_id": request.authenticated_user["user_id"],
            }), 200

        test_client = test_app.test_client()

        # 1. Test missing Authorization header with PUTER_AUTH_REQUIRED=True
        with patch("backend.middleware.auth.PUTER_AUTH_REQUIRED", True):
            resp = test_client.get("/api/test_auth_guard")
            self.assertEqual(resp.status_code, 401)
            data = resp.get_json()
            self.assertEqual(data.get("error"), "Unauthorized")

        # 2. Test invalid Bearer token
        with patch("backend.middleware.auth.verify_puter_token", return_value=None):
            resp = test_client.get("/api/test_auth_guard", headers={"Authorization": "Bearer bad_token"})
            self.assertEqual(resp.status_code, 401)

        # 3. Test valid Bearer token
        mock_user = {"user_id": "valid_user_999", "username": "valid_alice", "authenticated": True}
        with patch("backend.middleware.auth.verify_puter_token", return_value=mock_user):
            resp = test_client.get("/api/test_auth_guard", headers={"Authorization": "Bearer good_token"})
            self.assertEqual(resp.status_code, 200)
            data = resp.get_json()
            self.assertTrue(data.get("success"))
            self.assertEqual(data.get("user_id"), "valid_user_999")


class TestHealthCheckEndpoint(unittest.TestCase):
    """Tests for the /api/health endpoint reporting sanitized database status."""

    def setUp(self):
        self.client = app.test_client()

    def test_health_check_reports_safe_db_status(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()

        self.assertEqual(data.get("status"), "healthy")
        self.assertIn("blender_path", data)
        self.assertIn("database", data)
        self.assertIn("mongodb", data["database"])

        # Ensure credentials/URI are NEVER leaked in health endpoint
        raw_text = response.data.decode("utf-8")
        self.assertNotIn("mongodb+srv", raw_text)
        self.assertNotIn("password", raw_text)


if __name__ == "__main__":
    unittest.main()
