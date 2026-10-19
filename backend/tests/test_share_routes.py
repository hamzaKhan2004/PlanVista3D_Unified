import os
import unittest
from unittest.mock import patch, MagicMock
from backend.app import app
from backend.config.config import OUTPUT_FOLDER
from backend.repositories.task_repository import task_repository
from backend.repositories.share_repository import share_repository


class TestShareRoutes(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.task_id = "test-share-task-123"
        self.owner_id = "user_owner"
        self.attacker_id = "user_attacker"

        # Create a mock task and local model file
        os.makedirs(OUTPUT_FOLDER, exist_ok=True)
        self.model_filename = f"{self.task_id}_model.glb"
        self.model_path = os.path.join(OUTPUT_FOLDER, self.model_filename)
        with open(self.model_path, "wb") as f:
            f.write(b"glTF-binary-test-model-bytes")

        task_repository.set(self.task_id, {
            "status": "completed",
            "progress": 100,
            "owner_id": self.owner_id,
            "model_file": self.model_filename,
        })

    def tearDown(self):
        if os.path.exists(self.model_path):
            try:
                os.remove(self.model_path)
            except Exception:
                pass
        task_repository.delete(self.task_id)

    @patch("backend.controllers.model_controller.get_authenticated_user")
    def test_share_creation_requires_authentication(self, mock_auth):
        mock_auth.return_value = None
        resp = self.client.post(f"/api/share/model/{self.task_id}")
        self.assertEqual(resp.status_code, 401)

    @patch("backend.controllers.model_controller.get_authenticated_user")
    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.controllers.model_controller.mongo_manager")
    def test_share_creation_enforces_ownership(self, mock_mongo, mock_repo, mock_auth):
        mock_auth.return_value = {"user_id": self.attacker_id, "username": "attacker"}
        mock_mongo.is_configured.return_value = True
        mock_repo.get_project_owner.return_value = self.owner_id

        resp = self.client.post(f"/api/share/model/{self.task_id}")
        self.assertEqual(resp.status_code, 403)
        self.assertIn("permission", resp.get_json()["message"].lower())

    @patch("backend.controllers.model_controller.get_authenticated_user")
    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.controllers.model_controller.mongo_manager")
    def test_owner_can_create_and_retrieve_share(self, mock_mongo, mock_repo, mock_auth):
        mock_auth.return_value = {"user_id": self.owner_id, "username": "owner"}
        mock_mongo.is_configured.return_value = True
        mock_repo.get_project_owner.return_value = self.owner_id
        mock_repo.get_project.return_value = {"name": "Test CAD Model", "project_id": self.task_id}

        # 1. Create share
        resp = self.client.post(f"/api/share/model/{self.task_id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(data["success"])
        self.assertTrue(data["is_active"])
        share_token = data["share_token"]
        self.assertIsInstance(share_token, str)
        self.assertGreater(len(share_token), 20)

        # 2. Check share status
        status_resp = self.client.get(f"/api/share/model/status/{self.task_id}")
        self.assertEqual(status_resp.status_code, 200)
        status_data = status_resp.get_json()
        self.assertTrue(status_data["is_shared"])
        self.assertEqual(status_data["share_token"], share_token)

        # 3. Public access via share token (NO auth header required)
        public_resp = self.client.get(f"/api/share/model/{share_token}")
        self.assertEqual(public_resp.status_code, 200)
        public_data = public_resp.get_json()
        self.assertTrue(public_data["success"])
        self.assertTrue(public_data["is_ar_compatible"])
        self.assertIn("model_url", public_data)
        # Verify private owner details are NOT leaked
        self.assertNotIn("owner_id", public_data)
        self.assertNotIn("user_owner", str(public_data))

        # 4. Stream model via public share route
        download_resp = self.client.get(f"/api/share/model/{share_token}/download")
        self.assertEqual(download_resp.status_code, 200)
        self.assertEqual(download_resp.data, b"glTF-binary-test-model-bytes")
        download_resp.close()

        # 5. Revoke share link
        revoke_resp = self.client.post(f"/api/share/model/{self.task_id}/revoke")
        self.assertEqual(revoke_resp.status_code, 200)
        self.assertTrue(revoke_resp.get_json()["success"])

        # 6. Verify subsequent public access is blocked (404)
        revoked_public_resp = self.client.get(f"/api/share/model/{share_token}")
        self.assertEqual(revoked_public_resp.status_code, 404)
        self.assertIn("SHARE_REVOKED_OR_EXPIRED", revoked_public_resp.get_json()["code"])

    def test_invalid_share_token_returns_404(self):
        resp = self.client.get("/api/share/model/completely_invalid_random_token_xyz")
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.get_json()["code"], "SHARE_NOT_FOUND")

    @patch("backend.controllers.model_controller.get_authenticated_user")
    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.controllers.model_controller.mongo_manager")
    def test_idempotent_share_creation_with_share_token(self, mock_mongo, mock_repo, mock_auth):
        """
        Verifies that passing an already active share_token to create_model_share
        returns the existing share rather than failing with 'Project not found'.
        """
        mock_auth.return_value = {"user_id": self.owner_id, "username": "owner"}
        mock_mongo.is_configured.return_value = True
        mock_repo.get_project_owner.return_value = self.owner_id

        # 1. Create original share
        resp = self.client.post(f"/api/share/model/{self.task_id}")
        self.assertEqual(resp.status_code, 200)
        token = resp.get_json()["share_token"]

        # 2. Call share creation again using the share_token itself
        token_resp = self.client.post(f"/api/share/model/{token}")
        self.assertEqual(token_resp.status_code, 200)
    @patch("backend.controllers.model_controller.get_authenticated_user")
    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.controllers.model_controller.mongo_manager")
    def test_usdz_streaming_endpoint(self, mock_mongo, mock_repo, mock_auth):
        """
        Verifies USDZ streaming endpoint returns USDZ file with correct MIME type and CORS headers.
        """
        mock_auth.return_value = {"user_id": self.owner_id, "username": "owner"}
        mock_mongo.is_configured.return_value = True
        mock_repo.get_project_owner.return_value = self.owner_id

        # Create share
        resp = self.client.post(f"/api/share/model/{self.task_id}")
        token = resp.get_json()["share_token"]

        # Create mock USDZ file
        usdz_path = os.path.join(OUTPUT_FOLDER, f"{self.task_id}_model.usdz")
        with open(usdz_path, "wb") as f:
            f.write(b"mock-usdz-zip-data")

        try:
            usdz_resp = self.client.get(f"/api/share/model/{token}/usdz")
            self.assertEqual(usdz_resp.status_code, 200)
            self.assertEqual(usdz_resp.data, b"mock-usdz-zip-data")
            self.assertIn("usdz", usdz_resp.headers.get("Content-Type", "").lower())
            self.assertEqual(usdz_resp.headers.get("Access-Control-Allow-Origin"), "*")
            usdz_resp.close()
        finally:
            if os.path.exists(usdz_path):
                try:
                    os.remove(usdz_path)
                except Exception:
                    pass

    @patch("backend.controllers.model_controller.get_authenticated_user")
    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.controllers.model_controller.mongo_manager")
    def test_missing_model_file_returns_404_code(self, mock_mongo, mock_repo, mock_auth):
        """
        Verifies that an active share token referencing a nonexistent model
        returns 404 with MODEL_FILE_NOT_FOUND rather than crashing.
        """
        mock_auth.return_value = {"user_id": self.owner_id, "username": "owner"}
        mock_mongo.is_configured.return_value = True
        mock_repo.get_project_owner.return_value = self.owner_id
        mock_repo.get_project.return_value = {"name": "Test CAD Model", "project_id": self.task_id}

        # Create share
        resp = self.client.post(f"/api/share/model/{self.task_id}")
        token = resp.get_json()["share_token"]

        # Delete local file and remove s3_key from task
        if os.path.exists(self.model_path):
            os.remove(self.model_path)
        task_repository.set(self.task_id, {
            "status": "completed",
            "progress": 100,
            "owner_id": self.owner_id,
            "model_file": "nonexistent_model.glb",
        })

        # Query public share
        public_resp = self.client.get(f"/api/share/model/{token}")
        self.assertEqual(public_resp.status_code, 404)
        self.assertEqual(public_resp.get_json()["code"], "MODEL_FILE_NOT_FOUND")

        # Query download endpoint
        dl_resp = self.client.get(f"/api/share/model/{token}/download")
        self.assertEqual(dl_resp.status_code, 404)
        self.assertEqual(dl_resp.get_json()["code"], "MODEL_FILE_NOT_FOUND")

    @patch("backend.controllers.model_controller.get_authenticated_user")
    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.controllers.model_controller.mongo_manager")
    def test_cors_options_preflight_on_share_endpoints(self, mock_mongo, mock_repo, mock_auth):
        """
        Verifies OPTIONS preflight requests on public share and download endpoints
        return 200 with permissive CORS headers for Scene Viewer and WebXR.
        """
        mock_auth.return_value = {"user_id": self.owner_id, "username": "owner"}
        mock_mongo.is_configured.return_value = True
        mock_repo.get_project_owner.return_value = self.owner_id

        resp = self.client.post(f"/api/share/model/{self.task_id}")
        token = resp.get_json()["share_token"]

        # Test OPTIONS on /api/share/model/<token>
        opt_share = self.client.open(f"/api/share/model/{token}", method="OPTIONS", headers={"Origin": "https://planvista3d.onrender.com"})
        self.assertEqual(opt_share.status_code, 200)
        self.assertIn("Access-Control-Allow-Origin", opt_share.headers)

        # Test OPTIONS on /api/share/model/<token>/download
        opt_dl = self.client.open(f"/api/share/model/{token}/download", method="OPTIONS", headers={"Origin": "https://planvista3d.onrender.com"})
        self.assertEqual(opt_dl.status_code, 200)
        self.assertIn("Access-Control-Allow-Origin", opt_dl.headers)
        self.assertIn("GET", opt_dl.headers.get("Allow", "") + opt_dl.headers.get("Access-Control-Allow-Methods", ""))

        # Test OPTIONS on /api/share/model/<token>/usdz
        opt_usdz = self.client.open(f"/api/share/model/{token}/usdz", method="OPTIONS", headers={"Origin": "https://planvista3d.onrender.com"})
        self.assertEqual(opt_usdz.status_code, 200)
        self.assertIn("Access-Control-Allow-Origin", opt_usdz.headers)

    @patch("backend.controllers.model_controller.s3_service")
    @patch("backend.controllers.model_controller.get_authenticated_user")
    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.controllers.model_controller.mongo_manager")
    def test_s3_shared_model_and_redirect_cors(self, mock_mongo, mock_repo, mock_auth, mock_s3):
        """
        Verifies that S3-backed shared models return presigned URLs in JSON
        and attach CORS headers to the 302 redirect on the streaming route.
        """
        mock_auth.return_value = {"user_id": self.owner_id, "username": "owner"}
        mock_mongo.is_configured.return_value = True
        mock_repo.get_project_owner.return_value = self.owner_id
        mock_repo.get_project.return_value = {
            "name": "S3 CAD Model",
            "project_id": self.task_id,
            "model_ref": {"storage_provider": "s3", "key": "users/user_owner/projects/proj/model.glb"},
        }

        mock_s3.is_configured.return_value = True
        mock_s3.object_exists.return_value = True
        mock_s3.generate_presigned_url.return_value = "https://my-bucket.s3.amazonaws.com/model.glb?sig=123"

        # Create share
        resp = self.client.post(f"/api/share/model/{self.task_id}")
        token = resp.get_json()["share_token"]

        # Remove local file so S3 is exercised
        if os.path.exists(self.model_path):
            os.remove(self.model_path)

        # 1. get_shared_model should return presigned URL directly
        share_resp = self.client.get(f"/api/share/model/{token}")
        self.assertEqual(share_resp.status_code, 200)
        data = share_resp.get_json()
        self.assertEqual(data["storage_provider"], "s3")
        self.assertTrue(data["model_url"].startswith("https://my-bucket.s3.amazonaws.com"))

        # 2. download_shared_model should redirect (302) with CORS headers
        dl_resp = self.client.get(f"/api/share/model/{token}/download")
        self.assertEqual(dl_resp.status_code, 302)
        self.assertEqual(dl_resp.headers.get("Location"), "https://my-bucket.s3.amazonaws.com/model.glb?sig=123")
        self.assertEqual(dl_resp.headers.get("Access-Control-Allow-Origin"), "*")

    @patch("backend.controllers.model_controller.get_authenticated_user")
    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.controllers.model_controller.mongo_manager")
    def test_shared_model_respects_x_forwarded_proto_and_host(self, mock_mongo, mock_repo, mock_auth):
        """
        Verifies that behind an HTTPS reverse proxy (like Render),
        download and USDZ URLs use https:// and the forwarded host.
        """
        mock_auth.return_value = {"user_id": self.owner_id, "username": "owner"}
        mock_mongo.is_configured.return_value = True
        mock_repo.get_project_owner.return_value = self.owner_id
        mock_repo.get_project.return_value = {"name": "Test CAD Model", "project_id": self.task_id}

        resp = self.client.post(f"/api/share/model/{self.task_id}")
        token = resp.get_json()["share_token"]

        # Call with Render reverse proxy headers
        headers = {
            "X-Forwarded-Proto": "https",
            "X-Forwarded-Host": "planvista3d.onrender.com",
        }
        res = self.client.get(f"/api/share/model/{token}", headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["model_url"].startswith("https://planvista3d.onrender.com/api/share/model/"))
        self.assertTrue(data["usdz_url"].startswith("https://planvista3d.onrender.com/api/share/model/"))


if __name__ == "__main__":
    unittest.main()
