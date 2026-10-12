import unittest
import json
import os
import sys

from app import app, resolve_blender_path

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

    def test_blender_discovery(self):
        blender_path = resolve_blender_path()
        self.assertTrue(len(blender_path) > 0)
        print("[PASS] Blender path discovery:", blender_path)

if __name__ == "__main__":
    unittest.main()
