import os
import sys
import json
import subprocess
from app import resolve_blender_path, create_analysis_from_dxf, create_analysis_from_blueprint

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MIGRATED_SAMPLE_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "..", "samples", "blueprints"))
LEGACY_SAMPLE_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "..", "PlanVista3D", "Blueprint Img"))
SAMPLE_DIR = MIGRATED_SAMPLE_DIR if os.path.exists(MIGRATED_SAMPLE_DIR) else LEGACY_SAMPLE_DIR

def test_dxf_generation():
    print("[TEST] Starting DXF to GLB End-to-End Pipeline Test...")
    dxf_sample = os.path.join(SAMPLE_DIR, "banglow floor plan.dxf")
    if not os.path.exists(dxf_sample):
        print(f"[SKIP] DXF sample not found at: {dxf_sample}")
        return False

    output_glb = os.path.join(BASE_DIR, "outputs", "test_dxf_output.glb")
    if os.path.exists(output_glb):
        os.remove(output_glb)

    config = create_analysis_from_dxf(dxf_sample, target_size=30.0, wall_height=3.2, wall_thickness=0.25, floors=2)
    config_file = os.path.join(BASE_DIR, "uploads", "test_dxf_config.json")
    with open(config_file, "w") as f:
        json.dump(config, f, indent=2)

    blender_path = resolve_blender_path()
    script_path = os.path.join(BASE_DIR, "generate_model.py")
    cmd = [blender_path, "--background", "--python", script_path, "--", config_file, output_glb]

    print(f"[RUNNING] {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120, shell=True)

    if result.returncode == 0 and os.path.exists(output_glb) and os.path.getsize(output_glb) > 0:
        size = os.path.getsize(output_glb)
        print(f"[PASS] DXF to GLB successful! Model size: {size} bytes at {output_glb}")
        return True
    else:
        print("[FAIL] DXF to GLB failed.")
        print("STDERR:\n", result.stderr[-800:] if result.stderr else "None")
        print("STDOUT:\n", result.stdout[-800:] if result.stdout else "None")
        return False

def test_image_generation():
    print("\n[TEST] Starting Raster Image to GLB End-to-End Pipeline Test...")
    img_sample = os.path.join(SAMPLE_DIR, "f1.png")
    if not os.path.exists(img_sample):
        print(f"[SKIP] Image sample not found at: {img_sample}")
        return False

    output_glb = os.path.join(BASE_DIR, "outputs", "test_img_output.glb")
    if os.path.exists(output_glb):
        os.remove(output_glb)

    analysis = create_analysis_from_blueprint(img_sample, wall_height=3.0)
    analysis_file = os.path.join(BASE_DIR, "uploads", "test_img_analysis.json")
    with open(analysis_file, "w") as f:
        json.dump(analysis, f, indent=2)

    blender_path = resolve_blender_path()
    script_path = os.path.join(BASE_DIR, "generate_model_image.py")
    cmd = [blender_path, "--background", "--python", script_path, "--", analysis_file, output_glb]

    print(f"[RUNNING] {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120, shell=True)

    if result.returncode == 0 and os.path.exists(output_glb) and os.path.getsize(output_glb) > 0:
        size = os.path.getsize(output_glb)
        print(f"[PASS] Image to GLB successful! Model size: {size} bytes at {output_glb}")
        return True
    else:
        print("[FAIL] Image to GLB failed.")
        print("STDERR:\n", result.stderr[-800:] if result.stderr else "None")
        print("STDOUT:\n", result.stdout[-800:] if result.stdout else "None")
        return False

if __name__ == "__main__":
    dxf_ok = test_dxf_generation()
    img_ok = test_image_generation()
    print(f"\n[SUMMARY] DXF: {'PASSED' if dxf_ok else 'FAILED'}, IMG: {'PASSED' if img_ok else 'FAILED'}")
    if not (dxf_ok and img_ok):
        sys.exit(1)
