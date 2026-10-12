import os
import json
import subprocess
import threading
from backend.config.config import MODEL_GEN_DIR, resolve_blender_path
from backend.repositories.task_repository import task_repository
from backend.services.contour_service import create_analysis_from_blueprint
from backend.services.dxf_service import create_analysis_from_dxf

def process_blueprint_async(
    task_id, input_path, output_path, floors=3, wall_height=3.2, wall_thickness=0.25
):
    """
    Background worker thread orchestrating Blender 5.0 3D geometry reconstruction.
    Dispatches either DXF vector extrusion or OpenCV contour-based mesh generation.
    """
    print(f"[PROCESSING_START] Task ID: {task_id}")
    try:
        task_repository.set(task_id, {
            "status": "processing",
            "progress": 10,
        })

        ext = os.path.splitext(input_path)[1].lower()
        blender_path = resolve_blender_path()
        print(f"[BLENDER] Executable path: {blender_path}")

        if ext == ".dxf":
            analysis_data = create_analysis_from_dxf(
                input_path,
                target_size=30.0,
                wall_height=wall_height,
                wall_thickness=wall_thickness,
                floors=floors,
                floor_height=3.5,
                slab_thickness=0.3,
            )

            analysis_file = input_path.rsplit(".", 1)[0] + "_dxf_config.json"
            with open(analysis_file, "w") as f:
                json.dump(analysis_data, f, indent=2)

            print(f"[DXF_CONFIG] Saved to {analysis_file}")
            task_repository.update(task_id, {"progress": 40})

            script_path = os.path.join(MODEL_GEN_DIR, "generate_model.py")
            cmd = [
                blender_path,
                "--background",
                "--python",
                script_path,
                "--",
                analysis_file,
                output_path,
            ]

            print(f"[SUBPROCESS] Running: {' '.join(cmd)}")
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300,
                shell=True,
            )

            print(f"[SUBPROCESS_RETURN] Exit code: {result.returncode}")
            if result.stdout:
                print("STDOUT:\n", result.stdout[-500:])
            if result.stderr:
                print("STDERR:\n", result.stderr[-500:])

            if result.returncode == 0 and os.path.exists(output_path):
                file_size = os.path.getsize(output_path)
                task_repository.set(task_id, {
                    "status": "completed",
                    "progress": 100,
                    "model_file": os.path.basename(output_path),
                    "analysis": {
                        "pipeline": "dxf",
                        "model_size_bytes": file_size,
                        "floors": analysis_data["floors"],
                        "wall_height": analysis_data["wall_height"],
                        "wall_thickness": analysis_data["wall_thickness"],
                    },
                })
                print(f"[SUCCESS_DXF] {output_path} created ({file_size} bytes)")
            else:
                error_msg = f"Failed: {result.stderr or 'Blender export failed'}"
                task_repository.set(task_id, {
                    "status": "error",
                    "progress": 0,
                    "error": error_msg,
                })

        # IMAGE branch (png/jpg/jpeg)
        else:
            analysis_data = create_analysis_from_blueprint(
                input_path,
                wall_height=wall_height,
                scale_factor=0.015,
                min_wall_area=400,
                morph_kernel_size=5,
            )
            task_repository.update(task_id, {"progress": 40})

            analysis_file = input_path.rsplit(".", 1)[0] + "_analysis.json"
            with open(analysis_file, "w") as f:
                json.dump(analysis_data, f, indent=2)

            print(f"[IMG_CONFIG] Saved to {analysis_file}")
            task_repository.update(task_id, {"progress": 50})

            script_path = os.path.join(MODEL_GEN_DIR, "generate_model_image.py")
            cmd = [
                blender_path,
                "--background",
                "--python",
                script_path,
                "--",
                analysis_file,
                output_path,
            ]

            print(f"[SUBPROCESS] Running: {' '.join(cmd)}")
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300,
                shell=True,
            )

            print(f"[SUBPROCESS_RETURN] Exit code: {result.returncode}")
            if result.stdout:
                print("STDOUT:\n", result.stdout[-500:])
            if result.stderr:
                print("STDERR:\n", result.stderr[-500:])

            if result.returncode == 0 and os.path.exists(output_path):
                file_size = os.path.getsize(output_path)
                task_repository.set(task_id, {
                    "status": "completed",
                    "progress": 100,
                    "model_file": os.path.basename(output_path),
                    "analysis": {
                        "pipeline": "image",
                        "walls_detected": len(analysis_data["walls"]),
                        "doors_detected": len(analysis_data["doors"]),
                        "windows_detected": len(analysis_data["windows"]),
                        "rooms_detected": len(analysis_data["rooms"]),
                        "model_size_bytes": file_size,
                        "scale_factor": analysis_data["scale_factor"],
                        "wall_height": analysis_data["wall_height"],
                    },
                })
                print(f"[SUCCESS_IMG] {output_path} created ({file_size} bytes)")
            else:
                error_msg = f"Failed: {result.stderr or 'Blender export failed'}"
                task_repository.set(task_id, {
                    "status": "error",
                    "progress": 0,
                    "error": error_msg,
                })

    except Exception as e:
        error_msg = f"Error: {str(e)}"
        print(f"[ERROR] {error_msg}")
        task_repository.set(task_id, {
            "status": "error",
            "progress": 0,
            "error": error_msg,
        })


def dispatch_generation_task(task_id, input_path, output_path, floors, wall_height, wall_thickness):
    """Starts the background worker thread for a given task."""
    thread = threading.Thread(
        target=process_blueprint_async,
        args=(
            task_id,
            input_path,
            output_path,
            floors,
            wall_height,
            wall_thickness,
        ),
    )
    thread.daemon = True
    thread.start()
    task_repository.set(task_id, {"status": "queued", "progress": 0})
    return thread
