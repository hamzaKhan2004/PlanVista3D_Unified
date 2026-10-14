import unittest
import json
import sys
import os

# Ensure project root is on sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.app import app, resolve_blender_path

class BackendRegressionTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_health_endpoint(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data.get("status"), "healthy")
        self.assertIn("blender_path", data)
        print("[PASS] Health check endpoint:", data)

    def test_upload_missing_file(self):
        response = self.client.post("/api/upload")
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertIn("error", data)
        print("[PASS] Missing file validation:", data)

    def test_status_missing_task(self):
        response = self.client.get("/api/status/invalid-task-id-12345")
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data.get("status"), "error")
        print("[PASS] Task status query:", data)

    def test_task_persistence_and_restart(self):
        from backend.repositories.task_repository import TaskRepository, task_repository
        from backend.config.config import OUTPUT_FOLDER, UPLOAD_FOLDER
        import uuid

        test_task_id = f"test_{uuid.uuid4()}"
        source_meta = {
            "filename": "sample_floor_plan.dxf",
            "type": "dxf",
            "has_source": True,
            "download_url": f"/api/source/{test_task_id}",
            "uploaded_at": 1700000000000,
        }

        # 1. Save completed task data
        task_repository.set(test_task_id, {
            "status": "completed",
            "progress": 100,
            "model_file": f"{test_task_id}_model.glb",
            "analysis": {"floors": 3, "pipeline": "dxf"},
            "source_file": source_meta,
        })

        # 2. Simulate complete backend restart by instantiating a fresh TaskRepository instance
        fresh_repo = TaskRepository()
        retrieved = fresh_repo.get(test_task_id)

        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved["status"], "completed")
        self.assertEqual(retrieved["model_file"], f"{test_task_id}_model.glb")
        self.assertEqual(retrieved["source_file"]["filename"], "sample_floor_plan.dxf")
        self.assertEqual(retrieved["source_file"]["type"], "dxf")
        print("[PASS] Task persistence & server restart survival verified:", retrieved["source_file"])

        # 3. Clean up test metadata file
        meta_file = os.path.join(OUTPUT_FOLDER, f"{test_task_id}_meta.json")
        if os.path.exists(meta_file):
            os.remove(meta_file)

    def test_source_download_endpoint_and_404(self):
        # 1. Test missing source file returns 404
        response = self.client.get("/api/source/nonexistent-task-id")
        self.assertEqual(response.status_code, 404)
        data = json.loads(response.data)
        self.assertIn("error", data)
        print("[PASS] Source download 404 for missing file:", data)

        # 2. Create a mock uploaded source file
        from backend.config.config import UPLOAD_FOLDER
        mock_task_id = "mock-source-task-123"
        mock_file_name = f"{mock_task_id}_floorplan.dxf"
        mock_path = os.path.join(UPLOAD_FOLDER, mock_file_name)
        with open(mock_path, "w", encoding="utf-8") as f:
            f.write("MOCK DXF CONTENT")

        try:
            response = self.client.get(f"/api/source/{mock_task_id}")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data.decode("utf-8"), "MOCK DXF CONTENT")
            response.close()
            print("[PASS] Source download endpoint retrieved valid file")
        finally:
            if os.path.exists(mock_path):
                try:
                    os.remove(mock_path)
                except Exception:
                    pass

    def test_project_deletion_endpoint(self):
        from backend.repositories.task_repository import task_repository
        from backend.config.config import OUTPUT_FOLDER, UPLOAD_FOLDER

        del_task_id = "test-delete-task-456"
        meta_file = os.path.join(OUTPUT_FOLDER, f"{del_task_id}_meta.json")
        glb_file = os.path.join(OUTPUT_FOLDER, f"{del_task_id}_model.glb")
        upload_file = os.path.join(UPLOAD_FOLDER, f"{del_task_id}_plan.png")

        # 1. Create test records and files
        task_repository.set(del_task_id, {"status": "completed", "progress": 100})
        from backend.db.mongo import mongo_manager
        from backend.repositories.project_repository import project_repository
        if mongo_manager.is_configured():
            try:
                project_repository.create_project({"project_id": del_task_id, "name": "del_test"}, owner_id="guest_local")
            except Exception:
                pass
        with open(glb_file, "w", encoding="utf-8") as f:
            f.write("GLB_DUMMY_DATA")
        with open(upload_file, "w", encoding="utf-8") as f:
            f.write("PNG_DUMMY_DATA")

        self.assertTrue(task_repository.exists(del_task_id))
        self.assertTrue(os.path.exists(glb_file))
        self.assertTrue(os.path.exists(upload_file))

        # 2. Call DELETE endpoint
        response = self.client.delete(f"/api/project/{del_task_id}")
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data.get("success"))

        # 3. Verify task is removed and files deleted
        self.assertFalse(task_repository.exists(del_task_id))
        self.assertFalse(os.path.exists(glb_file))
        self.assertFalse(os.path.exists(upload_file))
        self.assertFalse(os.path.exists(meta_file))
        print("[PASS] Project deletion endpoint cleanly removed task and exclusively owned files")

if __name__ == "__main__":
    unittest.main()
