import unittest
from unittest.mock import MagicMock, patch
import os
import sys
import io
import base64
import time

# Ensure project root is on sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.services.imagekit_service import (
    ImageKitService,
    ImageKitServiceError,
    MAX_IMAGE_SIZE_BYTES,
    ALLOWED_IMAGE_EXTENSIONS,
)
from backend.repositories.project_repository import ProjectRepository
from backend.config.config import validate_production_config, is_production_environment
from backend.app import app


class TestImageKitServiceUnit(unittest.TestCase):
    """Unit tests for ImageKitService wrapper."""

    def test_unconfigured_state(self):
        svc = ImageKitService(private_key="", public_key="", url_endpoint="")
        self.assertFalse(svc.is_configured())
        with self.assertRaises(ImageKitServiceError) as ctx:
            svc.upload_file(b"test", "test.png", "folder/")
        self.assertIn("not configured", str(ctx.exception).lower())

    def test_oversized_file_rejected(self):
        svc = ImageKitService(private_key="priv_test", public_key="pub_test", url_endpoint="https://ik.test")
        self.assertTrue(svc.is_configured())
        large_data = b"0" * (MAX_IMAGE_SIZE_BYTES + 1024)
        with self.assertRaises(ImageKitServiceError) as ctx:
            svc.upload_file(large_data, "large.png", "folder/")
        self.assertIn("exceeds maximum limit", str(ctx.exception).lower())

    def test_invalid_extension_rejected(self):
        svc = ImageKitService(private_key="priv_test", public_key="pub_test", url_endpoint="https://ik.test")
        with self.assertRaises(ImageKitServiceError) as ctx:
            svc.upload_file(b"content", "dangerous.exe", "folder/")
        self.assertIn("not supported", str(ctx.exception).lower())

    @patch("imagekitio.ImageKit")
    def test_successful_blueprint_upload(self, mock_ik_cls):
        mock_client = MagicMock()
        mock_ik_cls.return_value = mock_client

        mock_resp = MagicMock()
        mock_resp.file_id = "ik_bp_999"
        mock_resp.name = "blueprint.png"
        mock_resp.url = "https://ik.imagekit.io/planvista/blueprints/blueprint.png"
        mock_resp.thumbnail_url = "https://ik.imagekit.io/planvista/blueprints/tr:n-media_library_thumbnail/blueprint.png"
        mock_resp.file_path = "/planvista/blueprints/blueprint.png"
        mock_resp.file_type = "image"
        mock_resp.size = 1024
        mock_client.files.upload.return_value = mock_resp

        svc = ImageKitService(private_key="priv_test", public_key="pub_test", url_endpoint="https://ik.imagekit.io/test")
        result = svc.upload_blueprint_image(
            file_data=b"\x89PNG\r\n\x1a\nfakeimage",
            file_name="blueprint.png",
            project_id="proj-123",
            owner_id="user-456",
        )

        self.assertEqual(result["file_id"], "ik_bp_999")
        self.assertEqual(result["url"], "https://ik.imagekit.io/planvista/blueprints/blueprint.png")
        self.assertEqual(result["folder"], "planvista/blueprints/")
        mock_client.files.upload.assert_called_once()
        kwargs = mock_client.files.upload.call_args.kwargs
        self.assertEqual(kwargs["folder"], "planvista/blueprints/")
        self.assertIn("blueprint", kwargs["tags"])
        self.assertIn("proj_proj-123", kwargs["tags"])

    @patch("imagekitio.ImageKit")
    def test_successful_generated_image_upload(self, mock_ik_cls):
        mock_client = MagicMock()
        mock_ik_cls.return_value = mock_client

        mock_resp = MagicMock()
        mock_resp.file_id = "ik_gen_111"
        mock_resp.name = "render.png"
        mock_resp.url = "https://ik.imagekit.io/planvista/generated-images/render.png"
        mock_resp.thumbnail_url = "https://ik.imagekit.io/planvista/generated-images/thumb.png"
        mock_resp.file_path = "/planvista/generated-images/render.png"
        mock_resp.file_type = "image"
        mock_resp.size = 2048
        mock_client.files.upload.return_value = mock_resp

        svc = ImageKitService(private_key="priv_test", public_key="pub_test", url_endpoint="https://ik.imagekit.io/test")
        result = svc.upload_generated_image(
            file_data="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            file_name="render.png",
            project_id="proj-789",
            owner_id="user-456",
        )

        self.assertEqual(result["file_id"], "ik_gen_111")
        self.assertEqual(result["folder"], "planvista/generated-images/")
        mock_client.files.upload.assert_called_once()
        kwargs = mock_client.files.upload.call_args.kwargs
        self.assertEqual(kwargs["folder"], "planvista/generated-images/")
        self.assertIn("generated_image", kwargs["tags"])

    @patch("imagekitio.ImageKit")
    def test_upload_service_failure(self, mock_ik_cls):
        mock_client = MagicMock()
        mock_ik_cls.return_value = mock_client
        mock_client.files.upload.side_effect = Exception("Connection refused by upstream")

        svc = ImageKitService(private_key="priv_test", public_key="pub_test", url_endpoint="https://ik.imagekit.io/test")
        with self.assertRaises(ImageKitServiceError) as ctx:
            svc.upload_blueprint_image(b"fake", "bp.png", "p1", "u1")
        self.assertIn("failed", str(ctx.exception).lower())
        # Ensure credentials are not in exception string
        self.assertNotIn("priv_test", str(ctx.exception))

    @patch("imagekitio.ImageKit")
    def test_delete_file_success_and_failure(self, mock_ik_cls):
        mock_client = MagicMock()
        mock_ik_cls.return_value = mock_client

        svc = ImageKitService(private_key="priv_test", public_key="pub_test", url_endpoint="https://ik.imagekit.io/test")
        self.assertTrue(svc.delete_file("file_abc"))
        mock_client.files.delete.assert_called_with(file_id="file_abc")

        # Client error returns False gracefully without crash
        mock_client.files.delete.side_effect = Exception("File not found")
        self.assertFalse(svc.delete_file("nonexistent_id"))

    @patch("imagekitio.ImageKit")
    def test_get_auth_parameters(self, mock_ik_cls):
        mock_client = MagicMock()
        mock_ik_cls.return_value = mock_client
        mock_client.helper.get_authentication_parameters.return_value = {
            "token": "tok_xyz",
            "expire": 1799999999,
            "signature": "sig_abc123",
        }

        svc = ImageKitService(private_key="priv_test_key", public_key="pub_test_key", url_endpoint="https://ik.endpoint")
        now = int(time.time())
        params = svc.get_auth_parameters()

        self.assertEqual(params["token"], "tok_xyz")
        self.assertEqual(params["expire"], 1799999999)
        self.assertEqual(params["signature"], "sig_abc123")
        self.assertEqual(params["publicKey"], "pub_test_key")
        self.assertEqual(params["urlEndpoint"], "https://ik.endpoint")
        # Ensure private key is never returned
        self.assertNotIn("private_key", params)
        self.assertNotIn("priv_test_key", str(params))

        # Check call args to helper.get_authentication_parameters (5 minute expiry)
        mock_client.helper.get_authentication_parameters.assert_called_once()
        call_kwargs = mock_client.helper.get_authentication_parameters.call_args.kwargs
        self.assertIn("expire", call_kwargs)
        expire_val = call_kwargs["expire"]
        self.assertTrue(abs(expire_val - (now + 300)) <= 5, f"Expiry {expire_val} is not ~300s from {now}")


class TestImageKitApiEndpoints(unittest.TestCase):
    """Integration tests for ImageKit-related API endpoints with mocked services."""

    def setUp(self):
        self.client = app.test_client()
        self.mongo_patcher = patch("backend.db.mongo.mongo_manager.is_configured", return_value=True)
        self.mongo_patcher.start()
        self.addCleanup(self.mongo_patcher.stop)

    @patch("backend.controllers.model_controller.imagekit_service")
    @patch("backend.controllers.model_controller.project_repository")
    def test_store_rendered_image_success(self, mock_repo, mock_ik):
        mock_ik.is_configured.return_value = True
        mock_repo.get_project_owner.return_value = None
        mock_ik.upload_generated_image.return_value = {
            "file_id": "ik_render_123",
            "name": "render_test.png",
            "url": "https://ik.imagekit.io/planvista/generated-images/render_test.png",
            "thumbnail_url": "https://ik.imagekit.io/planvista/generated-images/thumb.png",
            "size": 1500,
        }
        mock_repo.record_asset.return_value = {"asset_id": "ik_render_123", "url": "https://ik.imagekit.io/planvista/..."}
        mock_repo.get_project.return_value = None
        mock_repo.create_project.return_value = {"project_id": "proj-abc"}

        payload = {
            "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            "project_id": "proj-abc",
            "name": "render_test.png",
        }

        resp = self.client.post("/api/images/store-render", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["file_id"], "ik_render_123")
        self.assertIn("imagekit.io", data["url"])
        mock_ik.upload_generated_image.assert_called_once()
        mock_repo.record_asset.assert_called_once()

    def test_store_rendered_image_invalid_extension(self):
        payload = {
            "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            "project_id": "proj-abc",
            "name": "payload.php",
        }
        resp = self.client.post("/api/images/store-render", json=payload)
        self.assertEqual(resp.status_code, 400)
        data = resp.get_json()
        self.assertIn("Invalid file format", data["error"])

    @patch("backend.controllers.model_controller.imagekit_service")
    def test_store_rendered_image_unconfigured(self, mock_ik):
        mock_ik.is_configured.return_value = False
        payload = {
            "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            "project_id": "proj-abc",
            "name": "preview.png",
        }
        resp = self.client.post("/api/images/store-render", json=payload)
        self.assertEqual(resp.status_code, 503)
        self.assertIn("not configured", resp.get_json()["error"])

    @patch("backend.controllers.model_controller.imagekit_service")
    def test_store_rendered_image_service_failure(self, mock_ik):
        mock_ik.is_configured.return_value = True
        mock_ik.upload_generated_image.side_effect = ImageKitServiceError("ImageKit upload quota exceeded")

        payload = {
            "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            "project_id": "proj-abc",
            "name": "render_quota.png",
        }
        resp = self.client.post("/api/images/store-render", json=payload)
        self.assertEqual(resp.status_code, 422)
        self.assertIn("quota", resp.get_json()["error"])

    @patch("backend.controllers.model_controller.imagekit_service")
    @patch("backend.controllers.model_controller.project_repository")
    def test_store_rendered_image_mongo_persistence_failure_rollback(self, mock_repo, mock_ik):
        mock_ik.is_configured.return_value = True
        mock_repo.get_project_owner.return_value = None
        mock_ik.upload_generated_image.return_value = {
            "file_id": "ik_orphan_test",
            "name": "render.png",
            "url": "https://ik.imagekit.io/planvista/render.png",
        }
        mock_ik.delete_file.return_value = True
        # Simulate MongoDB error
        mock_repo.record_asset.side_effect = Exception("MongoDB connection lost")

        payload = {
            "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            "project_id": "proj-fail",
            "name": "render.png",
        }
        resp = self.client.post("/api/images/store-render", json=payload)
        self.assertEqual(resp.status_code, 500)
        self.assertIn("Failed to persist", resp.get_json()["error"])
        # Verify rollback: delete_file was called to remove the orphaned asset from ImageKit!
        mock_ik.delete_file.assert_called_with("ik_orphan_test")

    @patch("backend.controllers.model_controller.imagekit_service")
    def test_get_imagekit_auth_endpoint(self, mock_ik):
        mock_ik.is_configured.return_value = True
        mock_ik.get_auth_parameters.return_value = {
            "token": "tok_123",
            "expire": 1800000000,
            "signature": "sig_secret_mock",
            "publicKey": "public_test",
            "urlEndpoint": "https://ik.imagekit.io/test",
        }

        resp = self.client.get("/api/images/auth")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["token"], "tok_123")
        self.assertNotIn("private", str(data).lower())

    @patch("backend.controllers.model_controller.imagekit_service")
    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.controllers.model_controller.dispatch_generation_task")
    def test_blueprint_upload_success_with_imagekit(self, mock_dispatch, mock_repo, mock_ik):
        mock_ik.is_configured.return_value = True
        mock_ik.upload_blueprint_image.return_value = {
            "file_id": "ik_bp_555",
            "name": "floorplan.png",
            "url": "https://ik.imagekit.io/planvista/blueprints/floorplan.png",
            "size": 5000,
        }

        data = {
            "file": (io.BytesIO(b"\x89PNG\r\n\x1a\nfakecontent"), "floorplan.png"),
            "wall_height": "3.2",
            "wall_thickness": "0.25",
        }
        resp = self.client.post("/api/upload", data=data, content_type="multipart/form-data")
        self.assertEqual(resp.status_code, 200)
        json_data = resp.get_json()
        self.assertIn("task_id", json_data)
        mock_ik.upload_blueprint_image.assert_called_once()
        mock_repo.record_asset.assert_called_once()
        mock_repo.create_project.assert_called_once()

    @patch("backend.controllers.model_controller.imagekit_service")
    @patch("backend.controllers.model_controller.dispatch_generation_task")
    def test_blueprint_upload_service_failure(self, mock_dispatch, mock_ik):
        mock_ik.is_configured.return_value = True
        mock_ik.upload_blueprint_image.side_effect = ImageKitServiceError("Network timeout to ImageKit")

        data = {
            "file": (io.BytesIO(b"\x89PNG\r\n\x1a\nfakecontent"), "plan.png"),
        }
        resp = self.client.post("/api/upload", data=data, content_type="multipart/form-data")
        self.assertEqual(resp.status_code, 502)
        self.assertIn("upload failed", resp.get_json()["error"].lower())

    @patch("backend.controllers.model_controller.imagekit_service")
    @patch("backend.controllers.model_controller.dispatch_generation_task")
    def test_blueprint_upload_unconfigured_compatibility(self, mock_dispatch, mock_ik):
        # ImageKit unconfigured: local processing still succeeds!
        mock_ik.is_configured.return_value = False

        data = {
            "file": (io.BytesIO(b"\x89PNG\r\n\x1a\nfakecontent"), "plan.png"),
        }
        resp = self.client.post("/api/upload", data=data, content_type="multipart/form-data")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("task_id", resp.get_json())
        mock_ik.upload_blueprint_image.assert_not_called()

    @patch("backend.controllers.model_controller.imagekit_service")
    @patch("backend.controllers.model_controller.project_repository")
    def test_project_deletion_cleans_up_imagekit_asset(self, mock_repo, mock_ik):
        mock_repo.get_project_owner.return_value = "guest_local"
        mock_repo.get_assets_by_project.return_value = [
            {
                "asset_id": "ik_asset_to_delete",
                "storage_provider": "imagekit",
                "storage_key": "ik_asset_to_delete",
            }
        ]
        mock_repo.is_asset_referenced_elsewhere.return_value = False
        mock_repo.delete_project.return_value = True

        resp = self.client.delete("/api/project/proj-to-delete")
        self.assertEqual(resp.status_code, 200)
        mock_ik.delete_file.assert_called_with("ik_asset_to_delete")
        mock_repo.delete_project.assert_called_once()

    @patch("backend.controllers.model_controller.imagekit_service")
    @patch("backend.controllers.model_controller.project_repository")
    def test_project_deletion_preserves_shared_asset(self, mock_repo, mock_ik):
        mock_repo.get_project_owner.return_value = "guest_local"
        mock_repo.get_assets_by_project.return_value = [
            {
                "asset_id": "ik_shared_asset",
                "storage_provider": "imagekit",
                "storage_key": "ik_shared_asset",
            }
        ]
        # Asset is referenced by another project!
        mock_repo.is_asset_referenced_elsewhere.return_value = True
        mock_repo.delete_project.return_value = True

        resp = self.client.delete("/api/project/proj-sharing-asset")
        self.assertEqual(resp.status_code, 200)
        # Should NOT delete the shared file from ImageKit!
        mock_ik.delete_file.assert_not_called()
        mock_repo.delete_project.assert_called_once()

    # --- Fix 2 Tests: Protect local files from cross-user deletion ---

    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.controllers.model_controller.task_repository")
    def test_delete_project_cross_user_denied_does_not_delete_local_files(self, mock_task_repo, mock_repo):
        """Cross-user deletion attempt returns 403 and never deletes local files or DB records."""
        # Project is owned by 'victim_user', but caller is 'guest_user'
        mock_repo.get_project_owner.return_value = "victim_user"

        resp = self.client.delete("/api/project/proj_victim")
        self.assertEqual(resp.status_code, 403)
        self.assertIn("permission", resp.get_json()["message"].lower())

        # Crucial regression assertions: local files and DB are NOT touched
        mock_task_repo.delete.assert_not_called()
        mock_repo.delete_project.assert_not_called()

    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.controllers.model_controller.task_repository")
    def test_delete_project_absent_in_db_does_not_delete_local_files(self, mock_task_repo, mock_repo):
        """Absent project returns 404 and does not attempt local file deletion."""
        mock_repo.get_project_owner.return_value = None

        resp = self.client.delete("/api/project/proj_missing")
        self.assertEqual(resp.status_code, 404)
        mock_task_repo.delete.assert_not_called()

    @patch("backend.controllers.model_controller.mongo_manager")
    @patch("backend.controllers.model_controller.is_production_environment")
    @patch("backend.controllers.model_controller.task_repository")
    def test_delete_project_unconfigured_db_in_production_fails(self, mock_task_repo, mock_is_prod, mock_mongo):
        """Unconfigured MongoDB in production refuses deletion with 503 instead of falling back to disk delete."""
        mock_mongo.is_configured.return_value = False
        mock_is_prod.return_value = True

        resp = self.client.delete("/api/project/proj_prod_unconf")
        self.assertEqual(resp.status_code, 503)
        mock_task_repo.delete.assert_not_called()

    @patch("backend.controllers.model_controller.project_repository")
    @patch("backend.controllers.model_controller.task_repository")
    def test_delete_project_database_failure_does_not_delete_local_files(self, mock_task_repo, mock_repo):
        """Database error during deletion returns 500 and aborts local file deletion."""
        mock_repo.get_project_owner.return_value = "guest_local"
        mock_repo.get_assets_by_project.return_value = []
        mock_repo.delete_project.side_effect = Exception("MongoDB write error")

        resp = self.client.delete("/api/project/proj_db_err")
        self.assertEqual(resp.status_code, 500)
        mock_task_repo.delete.assert_not_called()

    # --- Fix 4 Tests: Partial rollback of only current operation's asset ---

    @patch("backend.controllers.model_controller.imagekit_service")
    @patch("backend.controllers.model_controller.project_repository")
    def test_store_rendered_image_partial_rollback_single_asset_cleanup(self, mock_repo, mock_ik):
        """When asset insert succeeds but project create/update fails, deletes only inserted asset and cleans up ImageKit."""
        mock_ik.is_configured.return_value = True
        mock_ik.upload_generated_image.return_value = {
            "file_id": "ik_render_single_asset",
            "name": "render_err.png",
            "url": "https://ik.imagekit.io/planvista/render_err.png",
        }
        mock_repo.get_project_owner.return_value = None
        mock_repo.record_asset.return_value = {
            "asset_id": "ik_render_single_asset",
            "project_id": "proj_single_rollback",
        }
        mock_repo.get_project.return_value = None
        mock_repo.create_project.side_effect = Exception("Write concern timeout on project doc")
        mock_repo.delete_asset.return_value = True
        mock_ik.delete_file.return_value = True

        payload = {
            "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            "project_id": "proj_single_rollback",
            "name": "render_err.png",
        }
        resp = self.client.post("/api/images/store-render", json=payload)
        self.assertEqual(resp.status_code, 500)
        data = resp.get_json()
        self.assertIn("Failed to persist", data["error"])
        self.assertTrue(data["cleanup_status"]["imagekit_cleaned"])
        self.assertTrue(data["cleanup_status"]["database_cleaned"])

        # Check single asset was deleted, not broad delete
        mock_repo.delete_asset.assert_called_once_with("ik_render_single_asset", owner_id="guest_local")
        mock_repo.delete_assets_by_project.assert_not_called()
        mock_ik.delete_file.assert_called_once_with("ik_render_single_asset")

    @patch("backend.controllers.model_controller.imagekit_service")
    @patch("backend.controllers.model_controller.project_repository")
    def test_store_rendered_image_partial_rollback_imagekit_cleanup_failure(self, mock_repo, mock_ik):
        """When ImageKit cleanup fails during rollback, it safely reports cleanup_status with imagekit_cleaned=False."""
        mock_ik.is_configured.return_value = True
        mock_ik.upload_generated_image.return_value = {
            "file_id": "ik_fail_cleanup",
            "name": "render_err.png",
            "url": "https://ik.imagekit.io/planvista/render_err.png",
        }
        mock_repo.get_project_owner.return_value = None
        mock_repo.record_asset.return_value = {
            "asset_id": "ik_fail_cleanup",
            "project_id": "proj_cleanup_fail",
        }
        mock_repo.get_project.return_value = None
        mock_repo.create_project.side_effect = Exception("Mongo failure")
        mock_repo.delete_asset.return_value = True
        # Simulate ImageKit cleanup failure
        mock_ik.delete_file.side_effect = Exception("ImageKit 500 internal server error")

        payload = {
            "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            "project_id": "proj_cleanup_fail",
            "name": "render_err.png",
        }
        resp = self.client.post("/api/images/store-render", json=payload)
        self.assertEqual(resp.status_code, 500)
        data = resp.get_json()
        self.assertFalse(data["cleanup_status"]["imagekit_cleaned"])
        self.assertTrue(data["cleanup_status"]["database_cleaned"])

    # --- Fix 1 Tests: Puter auth token handling ---

    def test_unauthorized_access_with_invalid_token(self):
        # Sending an invalid Bearer token rejects the request
        headers = {"Authorization": "Bearer invalid_token_xyz"}
        resp = self.client.post("/api/images/store-render", json={"image": "test"}, headers=headers)
        self.assertEqual(resp.status_code, 401)

    def test_upload_missing_auth_when_required(self):
        with patch("backend.middleware.auth.PUTER_AUTH_REQUIRED", True):
            resp = self.client.post("/api/upload", data={"file": (io.BytesIO(b"data"), "test.png")})
            self.assertEqual(resp.status_code, 401)

    def test_upload_expired_or_invalid_auth(self):
        with patch("backend.middleware.auth.PUTER_AUTH_REQUIRED", True):
            with patch("backend.middleware.auth.verify_puter_token", return_value=None):
                headers = {"Authorization": "Bearer expired_token"}
                resp = self.client.post("/api/upload", data={"file": (io.BytesIO(b"data"), "test.png")}, headers=headers)
                self.assertEqual(resp.status_code, 401)

    @patch("backend.controllers.model_controller.imagekit_service")
    def test_upload_valid_auth(self, mock_ik):
        mock_ik.is_configured.return_value = False
        with patch("backend.middleware.auth.PUTER_AUTH_REQUIRED", True):
            with patch("backend.middleware.auth.verify_puter_token", return_value={"user_id": "valid_user_1", "username": "valid_u1", "authenticated": True}):
                headers = {"Authorization": "Bearer valid_live_token"}
                resp = self.client.post("/api/upload", data={"file": (io.BytesIO(b"data"), "test.png")}, headers=headers)
                # Valid auth is accepted (returns 400 for bad image bytes, but not 401)
                self.assertNotEqual(resp.status_code, 401)


class TestProductionAuthConfig(unittest.TestCase):
    """Tests enforcement of PUTER_AUTH_REQUIRED in production environments (Fix 3)."""

    def test_production_render_missing_auth_raises_error(self):
        with patch.dict(os.environ, {"RENDER": "true"}, clear=False):
            with self.assertRaises(RuntimeError) as ctx:
                validate_production_config(auth_required=False)
            self.assertIn("PUTER_AUTH_REQUIRED", str(ctx.exception))
            self.assertIn("prohibited in production", str(ctx.exception))

    def test_production_flask_env_missing_auth_raises_error(self):
        with patch.dict(os.environ, {"FLASK_ENV": "production", "RENDER": ""}, clear=False):
            with self.assertRaises(RuntimeError) as ctx:
                validate_production_config(auth_required=False)
            self.assertIn("PUTER_AUTH_REQUIRED", str(ctx.exception))
            self.assertIn("prohibited in production", str(ctx.exception))

    def test_production_valid_auth_succeeds(self):
        with patch.dict(os.environ, {"RENDER": "true"}, clear=False):
            # Should not raise exception
            validate_production_config(auth_required=True)

    def test_local_dev_missing_auth_allowed(self):
        env_clean = {k: v for k, v in os.environ.items() if k not in ("RENDER", "RENDER_SERVICE_ID", "RENDER_INSTANCE_ID", "FLASK_ENV", "NODE_ENV")}
        with patch.dict(os.environ, env_clean, clear=True):
            # Should not raise in local dev
            validate_production_config(auth_required=False)


if __name__ == "__main__":
    unittest.main()
