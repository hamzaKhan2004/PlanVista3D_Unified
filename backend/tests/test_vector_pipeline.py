import unittest
import os
import sys
import json
import time

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from unittest.mock import patch
from backend.app import app
from backend.services.vector_service import (
    extract_vector_walls,
    merge_collinear_segments,
    deduplicate_parallel_walls,
    snap_wall_endpoints,
)
from backend.config.config import OUTPUT_FOLDER, UPLOAD_FOLDER

SAMPLE_DIR = os.path.abspath(os.path.join(PROJECT_ROOT, "samples", "blueprints"))

class VectorAssistedPipelineTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_options_preflight_on_vector_extract(self):
        """Test OPTIONS CORS preflight on /api/vector-extract from production origin."""
        res = self.client.options(
            "/api/vector-extract",
            headers={
                "Origin": "https://planvista3d.onrender.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization, content-type",
            },
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            res.headers.get("Access-Control-Allow-Origin"),
            "https://planvista3d.onrender.com",
        )
        allow_headers = res.headers.get("Access-Control-Allow-Headers", "").lower()
        self.assertIn("authorization", allow_headers)
        self.assertIn("content-type", allow_headers)
        allow_methods = res.headers.get("Access-Control-Allow-Methods", "")
        self.assertIn("POST", allow_methods)
        print("[PASS] OPTIONS preflight on /api/vector-extract: 200 with CORS headers")

    @patch("backend.middleware.auth.PUTER_AUTH_REQUIRED", True)
    @patch("backend.middleware.auth.verify_puter_token")
    def test_unauthenticated_vector_extract_rejected_when_auth_required(self, mock_verify):
        """Unauthenticated /api/vector-extract request must return 401 when auth is required."""
        mock_verify.return_value = None
        f1_path = os.path.join(SAMPLE_DIR, "f1.png")
        if not os.path.exists(f1_path):
            self.skipTest(f"Sample not found: {f1_path}")

        with open(f1_path, "rb") as f:
            res = self.client.post(
                "/api/vector-extract",
                data={"file": (f, "f1.png")},
                headers={"Origin": "https://planvista3d.onrender.com"},
            )
        self.assertEqual(res.status_code, 401)
        data = json.loads(res.data)
        self.assertIn("Unauthorized", data.get("error", ""))
        print("[PASS] Unauthenticated /api/vector-extract rejected (401)")

    @patch("backend.middleware.auth.PUTER_AUTH_REQUIRED", True)
    @patch("backend.middleware.auth.verify_puter_token")
    def test_authenticated_vector_extract_with_bearer_token(self, mock_verify):
        """Authenticated /api/vector-extract request with valid Bearer token returns 200."""
        mock_verify.return_value = {
            "user_id": "test_render_user",
            "username": "render_tester",
            "authenticated": True,
        }
        f1_path = os.path.join(SAMPLE_DIR, "f1.png")
        if not os.path.exists(f1_path):
            self.skipTest(f"Sample not found: {f1_path}")

        with open(f1_path, "rb") as f:
            res = self.client.post(
                "/api/vector-extract",
                data={
                    "file": (f, "f1.png"),
                    "wall_height": "3.0",
                    "wall_thickness": "0.25",
                    "target_size": "28.0",
                },
                headers={
                    "Origin": "https://planvista3d.onrender.com",
                    "Authorization": "Bearer valid_puter_token_xyz",
                },
            )
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data.get("success"))
        self.assertIn("line_segments", data)
        self.assertIn("svg_preview", data)
        self.assertEqual(
            res.headers.get("Access-Control-Allow-Origin"),
            "https://planvista3d.onrender.com",
        )
        print("[PASS] Authenticated /api/vector-extract: 200 with vectors & CORS headers")

    def test_clean_plan_extraction(self):
        """Test clean raster plan (f1.png) vector extraction and metrics."""
        f1_path = os.path.join(SAMPLE_DIR, "f1.png")
        if not os.path.exists(f1_path):
            self.skipTest(f"Sample not found: {f1_path}")

        t0 = time.time()
        res = extract_vector_walls(f1_path)
        dt = time.time() - t0

        self.assertTrue(res["success"])
        self.assertGreater(res["wall_count"], 5)
        self.assertGreater(len(res["line_segments"]), 0)
        self.assertIn("svg_preview", res)
        self.assertIn("<svg", res["svg_preview"])
        self.assertLess(dt, 2.0, f"Extraction took too long: {dt:.2f}s")
        print(f"[PASS] Clean plan (f1.png): {res['wall_count']} walls extracted in {dt:.3f}s")

    def test_noisy_plan_extraction(self):
        """Test noisy/photographed plan (b4.jpg) vector extraction."""
        b4_path = os.path.join(SAMPLE_DIR, "b4.jpg")
        if not os.path.exists(b4_path):
            self.skipTest(f"Sample not found: {b4_path}")

        t0 = time.time()
        res = extract_vector_walls(b4_path)
        dt = time.time() - t0

        self.assertTrue(res["success"])
        self.assertGreater(res["wall_count"], 5)
        self.assertLess(dt, 2.0, f"Extraction took too long: {dt:.2f}s")
        print(f"[PASS] Noisy plan (b4.jpg): {res['wall_count']} walls extracted in {dt:.3f}s")

    def test_broken_segments_collinear_merge(self):
        """Test that broken collinear segments along a wall are merged."""
        # 3 broken segments along horizontal line y = 100
        broken = [
            [10.0, 100.0, 50.0, 100.0],
            [55.0, 100.0, 120.0, 100.0],
            [130.0, 100.0, 200.0, 100.0],
            # perpendicular wall
            [200.0, 100.0, 200.0, 250.0],
        ]
        merged = merge_collinear_segments(broken, max_dist=10.0, max_gap=25.0)
        self.assertEqual(len(merged), 2)
        # Verify the merged horizontal segment spans from 10 to 200
        h_seg = [s for s in merged if abs(s[1] - s[3]) < 1.0][0]
        self.assertAlmostEqual(min(h_seg[0], h_seg[2]), 10.0, delta=1.0)
        self.assertAlmostEqual(max(h_seg[0], h_seg[2]), 200.0, delta=1.0)
        print("[PASS] Broken segments correctly merged into continuous walls")

    def test_parallel_walls_deduplication(self):
        """Test that parallel double-line wall edges are fused into a single centerline."""
        # Two parallel horizontal wall lines 12px apart representing inner/outer faces
        double_walls = [
            [50.0, 100.0, 250.0, 100.0],  # outer
            [50.0, 112.0, 250.0, 112.0],  # inner
        ]
        deduped = deduplicate_parallel_walls(double_walls, min_dist=4.0, max_dist=20.0)
        self.assertEqual(len(deduped), 1)
        # Centerline should be near y = 106.0
        self.assertAlmostEqual(deduped[0][1], 106.0, delta=2.0)
        self.assertAlmostEqual(deduped[0][3], 106.0, delta=2.0)
        print("[PASS] Parallel double-wall boundaries deduplicated into single centerline")

    def test_corner_endpoint_snapping(self):
        """Test that near endpoints at corners and T-junctions are snapped together."""
        gap_corner = [
            [50.0, 100.0, 200.0, 100.0],
            [208.0, 106.0, 208.0, 300.0],  # 10px corner gap
        ]
        snapped = snap_wall_endpoints(gap_corner, snap_radius=15.0)
        # Endpoints of corner should now coincide
        p1_end = (snapped[0][2], snapped[0][3])
        p2_start = (snapped[1][0], snapped[1][1])
        dist = ((p1_end[0] - p2_start[0]) ** 2 + (p1_end[1] - p2_start[1]) ** 2) ** 0.5
        self.assertLess(dist, 1.0)
        print("[PASS] Corner gap snapped cleanly ensuring wall continuity")

    def test_vector_extract_endpoint(self):
        """Test /api/vector-extract endpoint responses."""
        f1_path = os.path.join(SAMPLE_DIR, "f1.png")
        if not os.path.exists(f1_path):
            self.skipTest(f"Sample not found: {f1_path}")

        with open(f1_path, "rb") as f:
            res = self.client.post(
                "/api/vector-extract",
                data={
                    "file": (f, "f1.png"),
                    "wall_height": "3.2",
                    "wall_thickness": "0.22",
                    "target_size": "26.0",
                },
            )
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data.get("success"))
        self.assertIn("svg_preview", data)
        self.assertIn("line_segments", data)
        self.assertEqual(data.get("wall_height"), 3.2)
        self.assertEqual(data.get("wall_thickness"), 0.22)
        print("[PASS] /api/vector-extract API endpoint functional")

    def test_vector_assisted_e2e_generation(self):
        """Test complete end-to-end Vector-Assisted generation into Blender with valid GLB output."""
        f1_path = os.path.join(SAMPLE_DIR, "f1.png")
        if not os.path.exists(f1_path):
            self.skipTest(f"Sample not found: {f1_path}")

        # 1. Upload with vector_assisted = true
        with open(f1_path, "rb") as f:
            res = self.client.post(
                "/api/upload",
                data={
                    "file": (f, "test_vector_e2e.png"),
                    "vector_assisted": "true",
                    "wall_height": "3.0",
                    "wall_thickness": "0.25",
                    "target_size": "25.0",
                },
            )
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        task_id = data["task_id"]
        self.assertEqual(data.get("pipeline"), "vector_assisted")

        # 2. Wait for Blender execution
        completed = False
        final_status = {}
        for _ in range(45):
            time.sleep(1)
            status_res = self.client.get(f"/api/status/{task_id}")
            status_data = json.loads(status_res.data)
            if status_data.get("status") in ("completed", "error"):
                completed = True
                final_status = status_data
                break

        self.assertTrue(completed, "Generation task timed out")
        self.assertEqual(final_status.get("status"), "completed")
        self.assertIn("model_file", final_status)

        # 3. Verify generated GLB file exists and is non-empty
        model_file = final_status["model_file"]
        glb_path = os.path.join(OUTPUT_FOLDER, model_file)
        self.assertTrue(os.path.exists(glb_path))
        file_size = os.path.getsize(glb_path)
        self.assertGreater(file_size, 1000)
        print(f"[PASS] Vector-Assisted E2E generation successful! Valid GLB: {file_size} bytes")

        # Clean up test output
        if os.path.exists(glb_path):
            os.remove(glb_path)

    def test_dxf_regression(self):
        """Regression test: verify DXF generation is untouched and still functions."""
        dxf_sample = os.path.join(SAMPLE_DIR, "banglow floor plan.dxf")
        if not os.path.exists(dxf_sample):
            self.skipTest(f"DXF sample not found: {dxf_sample}")

        with open(dxf_sample, "rb") as f:
            res = self.client.post(
                "/api/upload",
                data={
                    "file": (f, "dxf_regression.dxf"),
                    "floors": "1",
                    "wall_height": "3.2",
                    "wall_thickness": "0.25",
                },
            )
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data.get("pipeline"), "dxf")
        task_id = data["task_id"]

        completed = False
        for _ in range(45):
            time.sleep(1)
            status_data = json.loads(self.client.get(f"/api/status/{task_id}").data)
            if status_data.get("status") in ("completed", "error"):
                completed = True
                self.assertEqual(status_data["status"], "completed")
                break
        self.assertTrue(completed)
        print("[PASS] DXF regression: existing DXF pipeline remains 100% operational")

if __name__ == "__main__":
    unittest.main()
