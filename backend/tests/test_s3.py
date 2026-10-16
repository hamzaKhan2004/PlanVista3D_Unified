import unittest
from unittest.mock import MagicMock, patch
import os
import sys
import io
import time
from botocore.exceptions import ClientError

# Ensure project root is on sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.services.s3_service import S3Service, S3ServiceError
from backend.services.model_service import handle_model_generation_success
from backend.repositories.task_repository import task_repository
from backend.config.config import OUTPUT_FOLDER
from backend.app import app


class TestS3ServiceUnit(unittest.TestCase):
    """Unit tests for S3Service wrapper."""

    def test_unconfigured_state(self):
        svc = S3Service(bucket_name="")
        self.assertFalse(svc.is_configured())
        with self.assertRaises(S3ServiceError) as ctx:
            svc.upload_model(b"glb_content", "user_1", "proj_1")
        self.assertIn("not configured", str(ctx.exception).lower())

        with self.assertRaises(S3ServiceError) as ctx:
            svc.generate_presigned_url("key.glb")
        self.assertIn("not configured", str(ctx.exception).lower())

        self.assertFalse(svc.delete_object("key.glb"))
        health = svc.get_health_status()
        self.assertFalse(health["configured"])
        self.assertIsNone(health["bucket"])

    def test_normalize_id(self):
        # Normal characters
        self.assertEqual(S3Service.normalize_id("user_123-abc"), "user_123-abc")
        # Traversal attempts sanitized
        self.assertEqual(S3Service.normalize_id("../../dangerous/path"), "dangerous_path")
        # Special characters sanitized
        self.assertEqual(S3Service.normalize_id("user@email#1$"), "user_email_1")
        # Empty raises error
        with self.assertRaises(S3ServiceError):
            S3Service.normalize_id("")
        with self.assertRaises(S3ServiceError):
            S3Service.normalize_id("   ")

    def test_generate_model_key(self):
        svc = S3Service(bucket_name="test-bucket", prefix="users/")
        key = svc.generate_model_key("user-abc", "proj-123", "model-999")
        self.assertEqual(key, "users/user-abc/projects/proj-123/models/model-999.glb")

        # Custom prefix
        svc_custom = S3Service(bucket_name="test-bucket", prefix="archive/")
        key_custom = svc_custom.generate_model_key("user-abc", "proj-123", "model-999")
        self.assertEqual(key_custom, "archive/users/user-abc/projects/proj-123/models/model-999.glb")

    def test_upload_nonexistent_or_empty_file_rejected(self):
        svc = S3Service(bucket_name="test-bucket", aws_access_key_id="test_key", aws_secret_access_key="test_secret")
        self.assertTrue(svc.is_configured())

        with self.assertRaises(S3ServiceError) as ctx:
            svc.upload_model("/nonexistent/path/model.glb", "user-1", "proj-1")
        self.assertIn("does not exist", str(ctx.exception).lower())

        with self.assertRaises(S3ServiceError) as ctx:
            svc.upload_model(b"", "user-1", "proj-1")
        self.assertIn("empty", str(ctx.exception).lower())

    @patch("boto3.client")
    def test_successful_model_upload(self, mock_boto_client):
        mock_client = MagicMock()
        mock_boto_client.return_value = mock_client
        mock_client.head_object.return_value = {
            "ContentLength": 1024,
            "ETag": '"etag123"',
        }

        svc = S3Service(
            bucket_name="my-models-bucket",
            region_name="us-east-1",
            aws_access_key_id="mock_key",
            aws_secret_access_key="mock_secret",
        )
        fake_glb = b"glTF_binary_mock_data"
        res = svc.upload_model(
            file_path_or_bytes=fake_glb,
            owner_id="user_alice",
            project_id="proj_101",
            model_id="model_101",
        )

        self.assertEqual(res["storage_provider"], "s3")
        self.assertEqual(res["bucket"], "my-models-bucket")
        self.assertEqual(res["key"], "users/user_alice/projects/proj_101/models/model_101.glb")
        self.assertEqual(res["size"], 1024)
        self.assertEqual(res["format"], "glb")
        self.assertEqual(res["etag"], "etag123")

        mock_client.put_object.assert_called_once()
        call_kwargs = mock_client.put_object.call_args.kwargs
        self.assertEqual(call_kwargs["Bucket"], "my-models-bucket")
        self.assertEqual(call_kwargs["ContentType"], "model/gltf-binary")
        self.assertEqual(call_kwargs["Body"], fake_glb)
        # Verify no public ACL was passed
        self.assertNotIn("ACL", call_kwargs)

    @patch("boto3.client")
    def test_upload_client_error_handling(self, mock_boto_client):
        mock_client = MagicMock()
        mock_boto_client.return_value = mock_client
        error_response = {"Error": {"Code": "AccessDenied", "Message": "Access Denied"}}
        mock_client.put_object.side_effect = ClientError(error_response, "PutObject")

        svc = S3Service(
            bucket_name="my-models-bucket",
            aws_access_key_id="mock_key",
            aws_secret_access_key="mock_secret",
        )
        with self.assertRaises(S3ServiceError) as ctx:
            svc.upload_model(b"dummy", "user_1", "proj_1")
        self.assertIn("accessdenied", str(ctx.exception).lower())
        # Verify secrets are never exposed in exception message
        self.assertNotIn("mock_secret", str(ctx.exception))

    @patch("boto3.client")
    def test_generate_presigned_url(self, mock_boto_client):
        mock_client = MagicMock()
        mock_boto_client.return_value = mock_client
        mock_client.generate_presigned_url.return_value = "https://s3.amazonaws.com/my-models-bucket/model.glb?X-Amz-Security-Token=..."

        svc = S3Service(
            bucket_name="my-models-bucket",
            aws_access_key_id="mock_key",
            aws_secret_access_key="mock_secret",
        )
        url = svc.generate_presigned_url("users/u1/projects/p1/models/m1.glb", expiry_seconds=900)
        self.assertIn("https://s3.amazonaws.com", url)
        mock_client.generate_presigned_url.assert_called_once_with(
            ClientMethod="get_object",
            Params={"Bucket": "my-models-bucket", "Key": "users/u1/projects/p1/models/m1.glb"},
            ExpiresIn=900,
        )

    @patch("boto3.client")
    def test_delete_object(self, mock_boto_client):
        mock_client = MagicMock()
        mock_boto_client.return_value = mock_client

        svc = S3Service(
            bucket_name="my-models-bucket",
            aws_access_key_id="mock_key",
            aws_secret_access_key="mock_secret",
        )
        success = svc.delete_object("users/u1/projects/p1/models/m1.glb")
        self.assertTrue(success)
        mock_client.delete_object.assert_called_once_with(
            Bucket="my-models-bucket", Key="users/u1/projects/p1/models/m1.glb"
        )


class TestS3ApiEndpoints(unittest.TestCase):
    """Integration tests for S3 model access, retrieval, and deletion API endpoints."""

    def setUp(self):
        self.client = app.test_client()
        self.mongo_patcher = patch("backend.db.mongo.mongo_manager.is_configured", return_value=True)
        self.mongo_patcher.start()
        self.addCleanup(self.mongo_patcher.stop)

    def test_get_model_url_unauthorized_when_auth_required(self):
        with patch("backend.middleware.auth.PUTER_AUTH_REQUIRED", True):
            resp = self.client.get("/api/project/proj-test-123/model-url")
            self.assertEqual(resp.status_code, 401)

    @patch("backend.controllers.model_controller.project_repository")
    def test_get_model_url_cross_user_forbidden(self, mock_repo):
        # Project owned by victim_user, caller is guest_local
        mock_repo.get_project_owner.return_value = "victim_user"

        resp = self.client.get("/api/project/proj-victim/model-url")
        self.assertEqual(resp.status_code, 403)
        self.assertIn("permission", resp.get_json()["message"].lower())

    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.controllers.model_controller.is_production_environment", return_value=True)
    def test_get_model_url_missing_project_404_in_production(self, mock_is_prod, mock_repo):
        mock_repo.get_project_owner.return_value = None

        resp = self.client.get("/api/project/proj-missing/model-url")
        self.assertEqual(resp.status_code, 404)

    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.controllers.model_controller.s3_service")
    def test_get_model_url_s3_presigned_success(self, mock_s3, mock_repo):
        mock_repo.get_project_owner.return_value = "guest_local"
        mock_repo.get_assets_by_project.return_value = [
            {
                "asset_id": "s3_model_proj-999",
                "asset_type": "3d_model",
                "storage_provider": "s3",
                "storage_key": "users/guest_local/projects/proj-999/models/proj-999.glb",
                "filename": "proj-999_model.glb",
            }
        ]
        mock_s3.is_configured.return_value = True
        mock_s3.generate_presigned_url.return_value = "https://s3.amazonaws.com/test-bucket/model.glb?presigned=1"

        resp = self.client.get("/api/project/proj-999/model-url")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["storage_provider"], "s3")
        self.assertIn("presigned=1", data["url"])
        self.assertEqual(data["expires_in"], 900)
        mock_s3.generate_presigned_url.assert_called_once_with(
            "users/guest_local/projects/proj-999/models/proj-999.glb", expiry_seconds=900
        )

    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.controllers.model_controller.task_repository")
    @patch("backend.controllers.model_controller.s3_service")
    def test_get_model_url_local_fallback_when_s3_unconfigured(self, mock_s3, mock_task_repo, mock_repo):
        mock_repo.get_project_owner.return_value = "guest_local"
        mock_repo.get_assets_by_project.return_value = []
        mock_s3.is_configured.return_value = False

        # Simulate local model file on disk
        local_filename = "test_local_model.glb"
        local_path = os.path.join(OUTPUT_FOLDER, local_filename)
        with open(local_path, "wb") as f:
            f.write(b"LOCAL_GLB_DATA")

        try:
            mock_task_repo.get.return_value = {
                "status": "completed",
                "model_file": local_filename,
            }

            resp = self.client.get("/api/project/proj-local/model-url")
            self.assertEqual(resp.status_code, 200)
            data = resp.get_json()
            self.assertTrue(data["success"])
            self.assertEqual(data["storage_provider"], "local")
            self.assertEqual(data["url"], f"/api/download/{local_filename}")
        finally:
            if os.path.exists(local_path):
                os.remove(local_path)

    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.controllers.model_controller.s3_service")
    @patch("backend.controllers.model_controller.imagekit_service")
    def test_project_deletion_cleans_up_s3_model_object(self, mock_ik, mock_s3, mock_repo):
        mock_repo.get_project_owner.return_value = "guest_local"
        mock_repo.get_assets_by_project.return_value = [
            {
                "asset_id": "s3_model_del",
                "storage_provider": "s3",
                "storage_key": "users/guest_local/projects/p-del/models/p-del.glb",
            }
        ]
        mock_repo.is_asset_referenced_elsewhere.return_value = False
        mock_repo.delete_project.return_value = True

        resp = self.client.delete("/api/project/p-del")
        self.assertEqual(resp.status_code, 200)
        mock_s3.delete_object.assert_called_once_with("users/guest_local/projects/p-del/models/p-del.glb")
        mock_repo.delete_project.assert_called_once_with("p-del", owner_id="guest_local")

    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.controllers.model_controller.s3_service")
    def test_project_deletion_preserves_shared_s3_asset(self, mock_s3, mock_repo):
        mock_repo.get_project_owner.return_value = "guest_local"
        mock_repo.get_assets_by_project.return_value = [
            {
                "asset_id": "s3_shared_model",
                "storage_provider": "s3",
                "storage_key": "users/guest_local/projects/shared/models/shared.glb",
            }
        ]
        mock_repo.is_asset_referenced_elsewhere.return_value = True
        mock_repo.delete_project.return_value = True

        resp = self.client.delete("/api/project/shared")
        self.assertEqual(resp.status_code, 200)
        # Shared object is never deleted
        mock_s3.delete_object.assert_not_called()

    def test_health_check_reports_s3_status(self):
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn("storage", data)
        self.assertIn("s3", data["storage"])
        self.assertIn(data["storage"]["s3"], ["configured", "unconfigured"])
        # Ensure credentials/secrets never returned
        raw_text = resp.data.decode("utf-8")
        self.assertNotIn("AWS_SECRET_ACCESS_KEY", raw_text)
        self.assertNotIn("AWS_ACCESS_KEY_ID", raw_text)


class TestModelGenerationS3Persistence(unittest.TestCase):
    """Tests for post-generation S3 model upload and MongoDB asset synchronization."""

    def setUp(self):
        self.test_task_id = "test-gen-task-s3"
        self.test_output = os.path.join(OUTPUT_FOLDER, f"{self.test_task_id}_model.glb")
        with open(self.test_output, "wb") as f:
            f.write(b"GLB_BINARY_GENERATED_CONTENT")

    def tearDown(self):
        if os.path.exists(self.test_output):
            try:
                os.remove(self.test_output)
            except Exception:
                pass
        task_repository.delete(self.test_task_id)

    @patch("backend.services.model_service.s3_service")
    @patch("backend.services.model_service.project_repository")
    @patch("backend.services.model_service.mongo_manager")
    def test_generation_success_uploads_to_s3_and_records_mongodb(
        self, mock_mongo, mock_repo, mock_s3
    ):
        mock_s3.is_configured.return_value = True
        mock_mongo.is_configured.return_value = True
        mock_s3.upload_model.return_value = {
            "storage_provider": "s3",
            "bucket": "planvista3d-models-bucket",
            "key": f"users/guest_local/projects/{self.test_task_id}/models/{self.test_task_id}.glb",
            "size": len(b"GLB_BINARY_GENERATED_CONTENT"),
            "format": "glb",
        }

        handle_model_generation_success(
            task_id=self.test_task_id,
            output_path=self.test_output,
            pipeline="vector_assisted",
            analysis_details={"walls_detected": 10},
            owner_id="guest_local",
        )

        # 1. Local task updated
        task_data = task_repository.get(self.test_task_id)
        self.assertEqual(task_data["status"], "completed")
        self.assertEqual(task_data["storage_provider"], "s3")
        self.assertIn("users/guest_local", task_data["s3_key"])

        # 2. Local file is preserved!
        self.assertTrue(os.path.exists(self.test_output))

        # 3. S3 upload called
        mock_s3.upload_model.assert_called_once_with(
            file_path_or_bytes=self.test_output,
            owner_id="guest_local",
            project_id=self.test_task_id,
            model_id=self.test_task_id,
        )

        # 4. MongoDB asset recorded and project updated
        mock_repo.record_asset.assert_called_once()
        asset_call = mock_repo.record_asset.call_args[0][0]
        self.assertEqual(asset_call["storage_provider"], "s3")
        self.assertEqual(asset_call["asset_type"], "3d_model")
        mock_repo.update_project.assert_called_once()
        mock_repo.update_generation_job.assert_called_once()

    @patch("backend.services.model_service.s3_service")
    def test_generation_s3_failure_preserves_local_file(self, mock_s3):
        mock_s3.is_configured.return_value = True
        mock_s3.upload_model.side_effect = S3ServiceError("Network timeout connecting to S3")

        handle_model_generation_success(
            task_id=self.test_task_id,
            output_path=self.test_output,
            pipeline="dxf",
            analysis_details={"walls_detected": 5},
            owner_id="guest_local",
        )

        # Local task is still completed locally
        task_data = task_repository.get(self.test_task_id)
        self.assertEqual(task_data["status"], "completed")
        # Local file is completely preserved
        self.assertTrue(os.path.exists(self.test_output))

    @patch("backend.services.model_service.s3_service")
    @patch("backend.services.model_service.project_repository")
    @patch("backend.services.model_service.mongo_manager")
    def test_generation_s3_mongodb_write_failure_handled_safely(
        self, mock_mongo, mock_repo, mock_s3
    ):
        mock_s3.is_configured.return_value = True
        mock_mongo.is_configured.return_value = True
        mock_s3.upload_model.return_value = {
            "storage_provider": "s3",
            "bucket": "planvista3d-models-bucket",
            "key": "users/guest_local/p1/m1.glb",
            "size": 100,
        }
        # Simulate MongoDB record_asset failure
        mock_repo.record_asset.side_effect = Exception("MongoDB write error")

        # Must not raise/crash
        handle_model_generation_success(
            task_id=self.test_task_id,
            output_path=self.test_output,
            pipeline="image",
            analysis_details={"walls_detected": 4},
            owner_id="guest_local",
        )

        # Local file preserved
        self.assertTrue(os.path.exists(self.test_output))
        task_data = task_repository.get(self.test_task_id)
        self.assertEqual(task_data["status"], "completed")


if __name__ == "__main__":
    unittest.main()
