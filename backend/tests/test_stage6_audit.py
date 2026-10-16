import unittest
from unittest.mock import MagicMock, patch
import os
import sys
import json
import time
import io

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.app import app
from backend.repositories.task_repository import task_repository
from backend.config.config import (
    validate_production_config,
    OUTPUT_FOLDER,
    UPLOAD_FOLDER,
)
from backend.services.model_service import handle_model_generation_success


class TestStage6SecurityAndIntegrityAudit(unittest.TestCase):
    """
    Stage 6 Integration Audit and Security Regression Suite.
    Verifies that all endpoints enforce server-side authentication and owner isolation,
    production configuration blocks unauthenticated mode, partial failures roll back cleanly,
    and storage cleanup status is reported accurately.
    """

    def setUp(self):
        self.client = app.test_client()
        self.mongo_patcher = patch("backend.db.mongo.mongo_manager.is_configured", return_value=True)
        self.mongo_patcher.start()
        self.addCleanup(self.mongo_patcher.stop)

    @patch("backend.middleware.auth.verify_puter_token")
    def test_unauthenticated_request_rejected_when_auth_required(self, mock_verify):
        """Endpoints must reject requests when authentication fails or token is missing/invalid."""
        mock_verify.return_value = None  # Invalid token

        invalid_headers = {"Authorization": "Bearer invalid_or_expired_token"}

        # 1. Status endpoint
        res = self.client.get("/api/status/task-123", headers=invalid_headers)
        self.assertEqual(res.status_code, 401)
        self.assertIn("Unauthorized", json.loads(res.data)["error"])

        # 2. Source download endpoint
        res = self.client.get("/api/source/task-123", headers=invalid_headers)
        self.assertEqual(res.status_code, 401)

        # 3. Model download endpoint
        res = self.client.get("/api/download/task-123_model.glb", headers=invalid_headers)
        self.assertEqual(res.status_code, 401)

        # 4. Model URL endpoint
        res = self.client.get("/api/project/task-123/model-url", headers=invalid_headers)
        self.assertEqual(res.status_code, 401)

        # 5. Delete project endpoint
        res = self.client.delete("/api/project/task-123", headers=invalid_headers)
        self.assertEqual(res.status_code, 401)

    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.middleware.auth.verify_puter_token")
    def test_cross_user_access_blocked_on_all_endpoints(self, mock_verify, mock_repo):
        """User Bob must be strictly blocked (403 Forbidden) from accessing User Alice's resources."""
        # Authenticate as Bob
        mock_verify.return_value = {"user_id": "user_bob", "username": "bob", "authenticated": True}
        bob_headers = {"Authorization": "Bearer bob_token"}

        alice_task_id = "alice-task-999"
        # Alice is the recorded owner in MongoDB
        mock_repo.get_project_owner.return_value = "user_alice"

        # Also record Alice as owner in task_repository
        task_repository.set(alice_task_id, {
            "status": "completed",
            "progress": 100,
            "owner_id": "user_alice",
            "model_file": f"{alice_task_id}_model.glb",
        })

        try:
            # 1. Status query by Bob on Alice's task -> 403
            res = self.client.get(f"/api/status/{alice_task_id}", headers=bob_headers)
            self.assertEqual(res.status_code, 403)
            self.assertIn("Forbidden", json.loads(res.data)["error"])

            # 2. Source blueprint download by Bob -> 403
            res = self.client.get(f"/api/source/{alice_task_id}", headers=bob_headers)
            self.assertEqual(res.status_code, 403)
            self.assertIn("Forbidden", json.loads(res.data)["error"])

            # 3. Model GLB download by Bob -> 403
            res = self.client.get(f"/api/download/{alice_task_id}_model.glb", headers=bob_headers)
            self.assertEqual(res.status_code, 403)
            self.assertIn("Forbidden", json.loads(res.data)["error"])

            # 4. Model URL retrieval by Bob -> 403
            res = self.client.get(f"/api/project/{alice_task_id}/model-url", headers=bob_headers)
            self.assertEqual(res.status_code, 403)
            self.assertIn("Forbidden", json.loads(res.data)["error"])

            # 5. Project deletion by Bob -> 403
            res = self.client.delete(f"/api/project/{alice_task_id}", headers=bob_headers)
            self.assertEqual(res.status_code, 403)
            self.assertIn("Forbidden", json.loads(res.data)["error"])
        finally:
            task_repository.delete(alice_task_id)

    def test_production_startup_validation(self):
        """Production environments must refuse to start without PUTER_AUTH_REQUIRED=true."""
        # Simulate Render production environment
        with patch.dict(os.environ, {"RENDER": "true"}, clear=False):
            # When auth is disabled, must raise RuntimeError
            with self.assertRaises(RuntimeError) as ctx:
                validate_production_config(auth_required=False)
            self.assertIn("PUTER_AUTH_REQUIRED must be explicitly set to 'true'", str(ctx.exception))

            # When auth is enabled, validation passes cleanly
            try:
                validate_production_config(auth_required=True)
            except RuntimeError:
                self.fail("validate_production_config raised RuntimeError unexpectedly with auth enabled")

    @patch("backend.services.model_service.s3_service")
    @patch("backend.services.model_service.project_repository")
    @patch("backend.services.model_service.mongo_manager")
    def test_s3_rollback_when_mongo_persistence_fails(self, mock_mongo, mock_repo, mock_s3):
        """If S3 upload succeeds but MongoDB metadata write fails, S3 object is rolled back."""
        mock_s3.is_configured.return_value = True
        mock_mongo.is_configured.return_value = True

        mock_s3.upload_model.return_value = {
            "key": "users/alice/projects/task-roll/models/task-roll.glb",
            "bucket": "test-bucket",
            "size": 512,
        }

        # MongoDB write fails
        mock_repo.record_asset.side_effect = Exception("MongoDB connection drop")

        # Create dummy GLB
        dummy_glb = os.path.join(OUTPUT_FOLDER, "task-roll_model.glb")
        with open(dummy_glb, "wb") as f:
            f.write(b"glTF_dummy_binary")

        try:
            handle_model_generation_success(
                task_id="task-roll",
                output_path=dummy_glb,
                pipeline="standard",
                analysis_details={},
                owner_id="user_alice",
            )

            # 1. S3 delete_object must have been called to clean up orphaned object
            mock_s3.delete_object.assert_called_once_with("users/alice/projects/task-roll/models/task-roll.glb")

            # 2. Task repository must not claim S3 durable storage
            task_data = task_repository.get("task-roll")
            self.assertEqual(task_data["storage_provider"], "local")
            self.assertIsNone(task_data.get("s3_key"))

            # 3. Local GLB must remain intact for local recovery
            self.assertTrue(os.path.exists(dummy_glb))
        finally:
            if os.path.exists(dummy_glb):
                os.remove(dummy_glb)
            task_repository.delete("task-roll")

    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.controllers.model_controller.s3_service")
    @patch("backend.controllers.model_controller.imagekit_service")
    @patch("backend.middleware.auth.verify_puter_token")
    def test_delete_project_reports_partial_storage_cleanup_failures(
        self, mock_verify, mock_ik, mock_s3, mock_repo
    ):
        """delete_project must not claim 100% full deletion if S3 or ImageKit deletion fails."""
        mock_verify.return_value = {"user_id": "user_owner", "username": "owner", "authenticated": True}
        headers = {"Authorization": "Bearer owner_token"}

        task_id = "test-partial-cleanup"
        mock_repo.get_project_owner.return_value = "user_owner"
        mock_repo.get_assets_by_project.return_value = [
            {"asset_type": "3d_model", "storage_provider": "s3", "storage_key": "users/owner/model.glb"},
            {"asset_type": "blueprint", "storage_provider": "imagekit", "storage_key": "ik_bp_123"},
        ]
        mock_repo.is_asset_referenced_elsewhere.return_value = False
        mock_repo.delete_project.return_value = True

        # S3 delete succeeds, ImageKit delete fails
        mock_s3.delete_object.return_value = True
        mock_ik.delete_file.side_effect = Exception("ImageKit 503 Service Unavailable")

        res = self.client.delete(f"/api/project/{task_id}", headers=headers)

        # Status must reflect partial failure (207 Multi-Status) rather than claiming 200 full success
        self.assertEqual(res.status_code, 207)
        data = json.loads(res.data)
        self.assertFalse(data["success"])
        self.assertTrue(data["partial"])
        self.assertIn("storage_errors", data)
        self.assertTrue(any("ImageKit" in err for err in data["storage_errors"]))

    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.controllers.model_controller.s3_service")
    @patch("backend.middleware.auth.verify_puter_token")
    def test_s3_model_retrieval_without_local_file(self, mock_verify, mock_s3, mock_repo):
        """Production S3-backed project must open and return presigned URL when local GLB is absent."""
        mock_verify.return_value = {"user_id": "user_s3_owner", "username": "s3_owner", "authenticated": True}
        headers = {"Authorization": "Bearer owner_token"}
        task_id = "task-cloud-only"

        # Ensure local file does NOT exist
        local_path = os.path.join(OUTPUT_FOLDER, f"{task_id}_model.glb")
        if os.path.exists(local_path):
            os.remove(local_path)

        mock_repo.get_project_owner.return_value = "user_s3_owner"
        mock_repo.get_assets_by_project.return_value = [
            {
                "asset_id": f"s3_model_{task_id}",
                "asset_type": "3d_model",
                "storage_provider": "s3",
                "storage_key": f"users/user_s3_owner/projects/{task_id}/models/{task_id}.glb",
                "filename": f"{task_id}_model.glb",
            }
        ]
        mock_s3.is_configured.return_value = True
        mock_s3.object_exists.return_value = True
        mock_s3.generate_presigned_url.return_value = "https://s3.amazonaws.com/test-bucket/model.glb?X-Amz-Signature=xyz"

        res = self.client.get(f"/api/project/{task_id}/model-url", headers=headers)
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["storage_provider"], "s3")
        self.assertIn("X-Amz-Signature", data["url"])
        self.assertFalse(os.path.exists(local_path), "Test invariant: local GLB must not exist on disk")

    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.controllers.model_controller.s3_service")
    @patch("backend.middleware.auth.verify_puter_token")
    def test_missing_s3_object_returns_404_not_fabricated_url(self, mock_verify, mock_s3, mock_repo):
        """When an S3 object is missing from the bucket, backend must return 404 rather than fabricating a URL."""
        mock_verify.return_value = {"user_id": "user_s3_owner", "username": "s3_owner", "authenticated": True}
        headers = {"Authorization": "Bearer owner_token"}
        task_id = "task-missing-s3"

        mock_repo.get_project_owner.return_value = "user_s3_owner"
        mock_repo.get_assets_by_project.return_value = [
            {
                "asset_id": f"s3_model_{task_id}",
                "asset_type": "3d_model",
                "storage_provider": "s3",
                "storage_key": f"users/user_s3_owner/projects/{task_id}/models/{task_id}.glb",
                "filename": f"{task_id}_model.glb",
            }
        ]
        mock_s3.is_configured.return_value = True
        # Simulate object missing from S3 bucket
        mock_s3.object_exists.return_value = False

        res = self.client.get(f"/api/project/{task_id}/model-url", headers=headers)
        self.assertEqual(res.status_code, 404)
        data = json.loads(res.data)
        self.assertEqual(data.get("code"), "OBJECT_NOT_FOUND")
        mock_s3.generate_presigned_url.assert_not_called()

    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.controllers.model_controller.mongo_manager")
    @patch("backend.middleware.auth.verify_puter_token")
    def test_ephemeral_restart_status_recovery_from_mongodb(self, mock_verify, mock_mongo, mock_repo):
        """When in-memory task repository is empty after restart, get_status reconstructs task from MongoDB."""
        mock_verify.return_value = {"user_id": "user_restart", "username": "restart_user", "authenticated": True}
        headers = {"Authorization": "Bearer restart_token"}
        task_id = "task-restarted-server"

        mock_mongo.is_configured.return_value = True
        mock_repo.get_project_owner.return_value = "user_restart"
        mock_repo.get_project.return_value = {
            "project_id": task_id,
            "status": "completed",
            "owner_id": "user_restart",
            "model_ref": {
                "key": f"users/user_restart/projects/{task_id}/models/{task_id}.glb",
                "bucket": "planvista3d-models-bucket",
            },
            "analysis": {"walls_detected": 4, "doors_detected": 1, "pipeline": "dxf"},
        }

        # Clear task from in-memory task repository if present
        task_repository.delete(task_id)

        res = self.client.get(f"/api/status/{task_id}", headers=headers)
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data["status"], "completed")
        self.assertEqual(data["progress"], 100)
        self.assertEqual(data.get("storage_provider"), "s3")
        self.assertEqual(data.get("s3_key"), f"users/user_restart/projects/{task_id}/models/{task_id}.glb")

    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.controllers.model_controller.s3_service")
    @patch("backend.middleware.auth.verify_puter_token")
    def test_download_model_stream_fallback_to_s3_when_local_file_absent(
        self, mock_verify, mock_s3, mock_repo
    ):
        """/api/download/{filename} streams from S3 if local GLB is absent from disk."""
        mock_verify.return_value = {"user_id": "user_stream", "username": "stream_user", "authenticated": True}
        headers = {"Authorization": "Bearer stream_token"}
        task_id = "task-stream-s3"
        filename = f"{task_id}_model.glb"

        local_path = os.path.join(OUTPUT_FOLDER, filename)
        if os.path.exists(local_path):
            os.remove(local_path)

        mock_repo.get_project_owner.return_value = "user_stream"
        mock_repo.get_assets_by_project.return_value = [
            {
                "asset_id": f"s3_model_{task_id}",
                "asset_type": "3d_model",
                "storage_provider": "s3",
                "storage_key": f"users/user_stream/models/{task_id}.glb",
            }
        ]
        mock_s3.is_configured.return_value = True
        mock_s3.get_object_bytes.return_value = b"GLTF_BINARY_STREAM_CONTENT_FROM_S3"

        res = self.client.get(f"/api/download/{filename}", headers=headers)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.mimetype, "model/gltf-binary")
        self.assertEqual(res.data, b"GLTF_BINARY_STREAM_CONTENT_FROM_S3")

    @patch("backend.middleware.auth.PUTER_AUTH_REQUIRED", True)
    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.middleware.auth.verify_puter_token")
    def test_unauthorized_user_cannot_read_or_overwrite_another_users_model(
        self, mock_verify, mock_repo
    ):
        """Unauthorized requests are rejected (401) and cross-user save/read attempts are forbidden (403)."""
        # 1. Unauthenticated PUT /api/project/<task_id> -> 401
        mock_verify.return_value = None
        res = self.client.put("/api/project/task-123", json={"customization": {}})
        self.assertEqual(res.status_code, 401)

        # 2. Authenticate as Bob
        mock_verify.return_value = {"user_id": "user_bob", "username": "bob", "authenticated": True}
        bob_headers = {"Authorization": "Bearer bob_token"}

        # Alice owns project alice-task-001
        mock_repo.get_project_owner.return_value = "user_alice"

        # Bob attempts to save/overwrite Alice's project -> 403 Forbidden
        res = self.client.put("/api/project/alice-task-001", json={"customization": {"dynamicObjects": {}}}, headers=bob_headers)
        self.assertEqual(res.status_code, 403)
        self.assertIn("Forbidden", json.loads(res.data)["error"])

        # Bob attempts to get Alice's model URL -> 403 Forbidden
        res = self.client.get("/api/project/alice-task-001/model-url", headers=bob_headers)
        self.assertEqual(res.status_code, 403)

        # Bob attempts to download Alice's GLB model directly -> 403 Forbidden
        res = self.client.get("/api/download/alice-task-001_model.glb", headers=bob_headers)
        self.assertEqual(res.status_code, 403)

    @patch("backend.middleware.auth.PUTER_AUTH_REQUIRED", True)
    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.middleware.auth.verify_puter_token")
    def test_local_only_projects_load_with_authenticated_requests(
        self, mock_verify, mock_repo
    ):
        """Local-only projects return a local download URL and load successfully with authenticated requests."""
        mock_verify.return_value = {"user_id": "user_local_alice", "username": "alice", "authenticated": True}
        headers = {"Authorization": "Bearer alice_token"}
        task_id = "local-proj-999"
        filename = f"{task_id}_model.glb"
        local_path = os.path.join(OUTPUT_FOLDER, filename)

        # Create dummy local file
        os.makedirs(OUTPUT_FOLDER, exist_ok=True)
        with open(local_path, "wb") as f:
            f.write(b"LOCAL_ONLY_GLTF_BINARY_MODEL")

        try:
            mock_repo.get_project_owner.return_value = "user_local_alice"
            mock_repo.get_project.return_value = {
                "project_id": task_id,
                "owner_id": "user_local_alice",
                "status": "completed",
                "model_ref": {
                    "storage_provider": "local",
                    "model_file": filename,
                },
            }
            mock_repo.get_assets_by_project.return_value = []

            # 1. Model URL endpoint returns authenticated local download URL
            res = self.client.get(f"/api/project/{task_id}/model-url", headers=headers)
            self.assertEqual(res.status_code, 200)
            data = json.loads(res.data)
            self.assertEqual(data["storage_provider"], "local")
            self.assertEqual(data["url"], f"/api/download/{filename}")

            # 2. Authenticated download returns the file
            res_dl = self.client.get(f"/api/download/{filename}", headers=headers)
            self.assertEqual(res_dl.status_code, 200)
            self.assertEqual(res_dl.data, b"LOCAL_ONLY_GLTF_BINARY_MODEL")
            res_dl.close()

            # 3. Unauthenticated download is rejected with 401
            mock_verify.return_value = None
            res_unauth = self.client.get(f"/api/download/{filename}")
            self.assertEqual(res_unauth.status_code, 401)
            res_unauth.close()
        finally:
            if os.path.exists(local_path):
                try:
                    os.remove(local_path)
                except Exception:
                    pass

    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.middleware.auth.verify_puter_token")
    def test_saving_customization_and_reopening_retrieves_saved_version(
        self, mock_verify, mock_repo
    ):
        """Saving CAD customization persists dynamic objects and reopen retrieves the saved customization."""
        mock_verify.return_value = {"user_id": "user_cad_editor", "username": "cad_user", "authenticated": True}
        headers = {"Authorization": "Bearer cad_token"}
        task_id = "task-custom-save-01"

        mock_repo.get_project_owner.return_value = "user_cad_editor"
        project_state = {
            "project_id": task_id,
            "owner_id": "user_cad_editor",
            "status": "completed",
            "customization": None,
        }
        mock_repo.get_project.return_value = project_state

        def fake_update(pid, updates, owner_id=None):
            project_state.update(updates)
            return True

        mock_repo.update_project.side_effect = fake_update

        custom_payload = {
            "customization": {
                "dynamicObjects": {
                    "walls": [
                        {
                            "id": "wall_0",
                            "name": "Wall 1",
                            "color": "#ff5500",
                            "position": [2.5, 1.4, -3.2],
                        },
                        {
                            "id": "custom_wall_12345",
                            "name": "Custom Wall 2",
                            "isNew": True,
                            "position": [0, 1.4, 0],
                        },
                    ],
                },
                "editorState": {"showGrid": False, "showWireframe": True},
                "savedAt": 1700000000000,
            }
        }

        # 1. Save project customization via PUT /api/project/<task_id>
        res = self.client.put(f"/api/project/{task_id}", json=custom_payload, headers=headers)
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data.get("success"))

        # Verify MongoDB repository was called with customization
        self.assertIn("customization", project_state)
        self.assertEqual(len(project_state["customization"]["dynamicObjects"]["walls"]), 2)

        # 2. Status poll on reopen retrieves saved customization
        res_status = self.client.get(f"/api/status/{task_id}", headers=headers)
        self.assertEqual(res_status.status_code, 200)
        status_data = json.loads(res_status.data)
        self.assertIn("customization", status_data)
        saved_walls = status_data["customization"]["dynamicObjects"]["walls"]
        self.assertEqual(saved_walls[0]["color"], "#ff5500")
        self.assertEqual(saved_walls[1]["id"], "custom_wall_12345")

    @patch("backend.controllers.model_controller.s3_service")
    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.middleware.auth.verify_puter_token")
    def test_saving_edited_geometry_and_reopening_retrieves_edited_version_not_original(
        self, mock_verify, mock_repo, mock_s3
    ):
        """Saving edited GLB uploads under owner-scoped key and reopen retrieves the edited model rather than original."""
        mock_verify.return_value = {"user_id": "user_cad_editor", "username": "cad_user", "authenticated": True}
        headers = {"Authorization": "Bearer cad_token"}
        task_id = "task-edited-glb-01"

        original_key = f"users/user_cad_editor/projects/{task_id}/models/{task_id}.glb"
        edited_key = f"users/user_cad_editor/projects/{task_id}/models/{task_id}_edited_9999.glb"

        project_doc = {
            "project_id": task_id,
            "owner_id": "user_cad_editor",
            "status": "completed",
            "model_ref": {
                "key": original_key,
                "bucket": "planvista3d-models-bucket",
                "storage_provider": "s3",
            },
        }

        mock_repo.get_project_owner.return_value = "user_cad_editor"
        mock_repo.get_project.return_value = project_doc

        mock_s3.is_configured.return_value = True
        mock_s3.object_exists.return_value = True
        mock_s3.upload_model.return_value = {
            "storage_provider": "s3",
            "key": edited_key,
            "bucket": "planvista3d-models-bucket",
            "size": 54321,
        }
        mock_s3.generate_presigned_url.side_effect = lambda k, **kw: f"https://s3.amazonaws.com/{k}?signature=valid"

        def fake_update(pid, updates, owner_id=None):
            project_doc.update(updates)
            return True

        mock_repo.update_project.side_effect = fake_update

        # Upload edited GLB file
        file_data = {
            "file": (io.BytesIO(b"NEW_EDITED_GLTF_GEOMETRY_BYTES"), "edited_model.glb"),
            "customization": json.dumps({"editorState": {"showWireframe": True}}),
        }

        res = self.client.put(
            f"/api/project/{task_id}",
            data=file_data,
            content_type="multipart/form-data",
            headers=headers,
        )
        self.assertEqual(res.status_code, 200)

        # Verify S3 upload called under owner-scoped key and MongoDB model_ref updated
        mock_s3.upload_model.assert_called_once()
        self.assertEqual(project_doc["model_ref"]["key"], edited_key)

        # Verify reopening retrieves the EDITED model presigned URL, not original
        res_url = self.client.get(f"/api/project/{task_id}/model-url", headers=headers)
        self.assertEqual(res_url.status_code, 200)
        url_data = json.loads(res_url.data)
        self.assertIn(edited_key, url_data["url"])
        self.assertNotIn(original_key, url_data["url"])

    @patch("backend.controllers.model_controller.s3_service")
    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.middleware.auth.verify_puter_token")
    def test_failed_save_preserves_previous_valid_model(
        self, mock_verify, mock_repo, mock_s3
    ):
        """Failed save aborts without claiming success and preserves the previous valid model in storage."""
        mock_verify.return_value = {"user_id": "user_cad_editor", "username": "cad_user", "authenticated": True}
        headers = {"Authorization": "Bearer cad_token"}
        task_id = "task-save-fail-01"

        original_key = f"users/user_cad_editor/projects/{task_id}/models/{task_id}_original.glb"
        project_doc = {
            "project_id": task_id,
            "owner_id": "user_cad_editor",
            "status": "completed",
            "model_ref": {
                "key": original_key,
                "bucket": "planvista3d-models-bucket",
                "storage_provider": "s3",
            },
        }

        mock_repo.get_project_owner.return_value = "user_cad_editor"
        mock_repo.get_project.return_value = project_doc
        mock_s3.is_configured.return_value = True
        mock_s3.generate_presigned_url.side_effect = lambda k, **kw: f"https://s3.amazonaws.com/{k}?signature=valid"

        # Simulate S3 upload failure
        mock_s3.upload_model.side_effect = Exception("S3 Service Network Timeout")

        file_data = {
            "file": (io.BytesIO(b"CRASHED_GLB_UPLOAD"), "corrupted.glb"),
        }

        res = self.client.put(
            f"/api/project/{task_id}",
            data=file_data,
            content_type="multipart/form-data",
            headers=headers,
        )
        # Must return 500 and not claim success
        self.assertEqual(res.status_code, 500)
        self.assertIn("Failed to upload edited model to S3", json.loads(res.data)["error"])

        # Model ref was NOT updated in MongoDB
        self.assertEqual(project_doc["model_ref"]["key"], original_key)

        # Model URL endpoint still safely returns previous valid model
        mock_s3.object_exists.return_value = True
        res_url = self.client.get(f"/api/project/{task_id}/model-url", headers=headers)
        self.assertEqual(res_url.status_code, 200)
        url_data = json.loads(res_url.data)
        self.assertIn(original_key, url_data["url"])


if __name__ == "__main__":
    unittest.main()

