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


if __name__ == "__main__":
    unittest.main()
