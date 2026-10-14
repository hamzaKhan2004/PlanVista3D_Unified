import unittest
from unittest.mock import MagicMock, patch
import os
import sys
import json
import time

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


if __name__ == "__main__":
    unittest.main()
