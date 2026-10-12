from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import sys
import os
import shutil
import subprocess
import uuid
from werkzeug.utils import secure_filename
import threading
import json
import cv2
import numpy as np

# Ensure Windows console encoding compatibility
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

app = Flask(__name__)

# Determine allowed CORS origins
cors_origins_env = os.environ.get("CORS_ORIGIN")
if cors_origins_env:
    allowed_origins = [o.strip() for o in cors_origins_env.split(",")]
else:
    allowed_origins = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ]

CORS(app, origins=allowed_origins)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
OUTPUT_FOLDER = os.path.join(BASE_DIR, "outputs")

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "dxf"}

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["OUTPUT_FOLDER"] = OUTPUT_FOLDER

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

processing_status = {}


def resolve_blender_path():
    """Dynamically resolves Blender executable path from env, standard paths, or PATH."""
    env_path = os.environ.get("BLENDER_PATH")
    if env_path and os.path.exists(env_path):
        return env_path

    known_paths = [
        r"C:\Program Files\Blender Foundation\Blender 5.0\blender.exe",
        r"C:\Program Files\Blender Foundation\Blender 4.3\blender.exe",
        r"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe",
        r"C:\Program Files\Blender Foundation\Blender 4.0\blender.exe",
        r"C:\Program Files\Blender Foundation\Blender 3.6\blender.exe",
    ]
    for p in known_paths:
        if os.path.exists(p):
            return p

    which_blender = shutil.which("blender")
    if which_blender:
        return which_blender

    return "blender"


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


# ---------- IMAGE ANALYSIS PIPELINE ----------

def create_analysis_from_blueprint(
    image_path,
    wall_height=2.0,
    scale_factor=0.015,
    min_wall_area=400,
    morph_kernel_size=5,
):
    print(f"[ANALYSIS] Analyzing blueprint: {image_path}")
    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise FileNotFoundError(f"Failed to load image for analysis: {image_path}")

    h, w = img.shape[:2]

    blur = cv2.GaussianBlur(img, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(
        blur,
        255,
        cv2.ADAPTIVE_THRESH_MEAN_C,
        cv2.THRESH_BINARY_INV,
        15,
        5,
    )

    kernel = np.ones((morph_kernel_size, morph_kernel_size), np.uint8)
    morph = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)
    morph = cv2.morphologyEx(morph, cv2.MORPH_OPEN, kernel, iterations=1)

    contours, hierarchy = cv2.findContours(
        morph, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    print(f"[CONTOURS] Found {len(contours)} raw contours")

    walls = []
    doors = []
    windows = []
    all_wall_points = []

    def norm_pt(pt):
        x, y = pt
        return [float(x) / w, float(y) / h]

    for i, cnt in enumerate(contours):
        area = cv2.contourArea(cnt)
        if area < min_wall_area:
            continue

        peri = cv2.arcLength(cnt, True)
        eps = max(2.0, 0.01 * peri)
        approx = cv2.approxPolyDP(cnt, eps, True)
        pts = [tuple(p[0]) for p in approx]

        x, y, w_rect, h_rect = cv2.boundingRect(approx)
        rect_area = w_rect * h_rect

        if (
            len(pts) == 4
            and rect_area < area * 0.6
            and rect_area < 5000
            and (min(w_rect, h_rect) < max(w_rect, h_rect) * 0.35)
        ):
            if max(w_rect, h_rect) / float(min(w_rect, h_rect) + 1e-6) > 1.5:
                center = (x + w_rect / 2.0, y + h_rect / 2.0)
                doors.append(
                    {
                        "id": f"door_{len(doors)}",
                        "center": [center[0] / w, center[1] / h],
                        "width": w_rect / float(w),
                        "height": h_rect / float(h),
                        "area_px": rect_area,
                    }
                )
                continue
            else:
                center = (x + w_rect / 2.0, y + h_rect / 2.0)
                windows.append(
                    {
                        "id": f"window_{len(windows)}",
                        "center": [center[0] / w, center[1] / h],
                        "width": w_rect / float(w),
                        "height": h_rect / float(h),
                        "area_px": rect_area,
                    }
                )
                continue

        norm_poly = [norm_pt(p) for p in pts]
        walls.append(
            {
                "id": f"wall_{len(walls)}",
                "vertices": norm_poly,
                "thickness": 0.01,
            }
        )
        all_wall_points.extend(pts)

    if len(all_wall_points) > 0:
        all_pts_arr = np.array(all_wall_points)
        min_x, min_y = np.min(all_pts_arr, axis=0)
        max_x, max_y = np.max(all_pts_arr, axis=0)
        room_bounds = {
            "id": "room_0",
            "bounds": {
                "x": float(min_x) / w,
                "y": float(min_y) / h,
                "width": float(max_x - min_x) / w,
                "height": float(max_y - min_y) / h,
            },
            "center": [
                (min_x + max_x) / (2.0 * w),
                (min_y + max_y) / (2.0 * h),
            ],
        }
        rooms = [room_bounds]
    else:
        rooms = []

    analysis = {
        "image_width": w,
        "image_height": h,
        "scale_factor": scale_factor,
        "wall_height": wall_height,
        "walls": walls,
        "doors": doors,
        "windows": windows,
        "rooms": rooms,
    }

    print(
        f"[ANALYSIS_OK] walls={len(walls)}, doors={len(doors)}, "
        f"windows={len(windows)}, rooms={len(rooms)}"
    )
    return analysis


# ---------- DXF CONFIG PIPELINE ----------

def create_analysis_from_dxf(
    dxf_path,
    target_size=30.0,
    wall_height=3.2,
    wall_thickness=0.25,
    floors=3,
    floor_height=3.5,
    slab_thickness=0.3,
):
    return {
        "dxf_path": os.path.abspath(dxf_path),
        "target_size": float(target_size),
        "wall_height": float(wall_height),
        "wall_thickness": float(wall_thickness),
        "floors": int(floors),
        "floor_height": float(floor_height),
        "slab_thickness": float(slab_thickness),
    }


# ---------- BACKGROUND WORKER ----------

def process_blueprint_async(
    task_id, input_path, output_path, floors=3, wall_height=3.2, wall_thickness=0.25
):
    print(f"[PROCESSING_START] Task ID: {task_id}")
    try:
        processing_status[task_id] = {
            "status": "processing",
            "progress": 10,
        }

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
            processing_status[task_id]["progress"] = 40

            script_path = os.path.join(BASE_DIR, "generate_model.py")
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
                processing_status[task_id] = {
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
                }
                print(f"[SUCCESS_DXF] {output_path} created ({file_size} bytes)")
            else:
                error_msg = f"Failed: {result.stderr or 'Blender export failed'}"
                processing_status[task_id] = {
                    "status": "error",
                    "progress": 0,
                    "error": error_msg,
                }

        # IMAGE branch (png/jpg/jpeg)
        else:
            analysis_data = create_analysis_from_blueprint(
                input_path,
                wall_height=wall_height,
                scale_factor=0.015,
                min_wall_area=400,
                morph_kernel_size=5,
            )
            processing_status[task_id]["progress"] = 40

            analysis_file = input_path.rsplit(".", 1)[0] + "_analysis.json"
            with open(analysis_file, "w") as f:
                json.dump(analysis_data, f, indent=2)

            print(f"[IMG_CONFIG] Saved to {analysis_file}")
            processing_status[task_id]["progress"] = 50

            script_path = os.path.join(BASE_DIR, "generate_model_image.py")
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
                processing_status[task_id] = {
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
                }
                print(f"[SUCCESS_IMG] {output_path} created ({file_size} bytes)")
            else:
                error_msg = f"Failed: {result.stderr or 'Blender export failed'}"
                processing_status[task_id] = {
                    "status": "error",
                    "progress": 0,
                    "error": error_msg,
                }

    except Exception as e:
        error_msg = f"Error: {str(e)}"
        print(f"[ERROR] {error_msg}")
        processing_status[task_id] = {
            "status": "error",
            "progress": 0,
            "error": error_msg,
        }


# ---------- HTTP ROUTES ----------

@app.route("/api/upload", methods=["POST"])
def upload_file():
    print("[UPLOAD] Received upload request")

    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]

    floors = int(request.form.get("floors", 3))
    wall_height = float(request.form.get("wall_height", 3.2))
    wall_thickness = float(request.form.get("wall_thickness", 0.25))

    print(
        f"[PARAMS] floors={floors}, wall_height={wall_height}, wall_thickness={wall_thickness}"
    )

    if file and allowed_file(file.filename):
        task_id = str(uuid.uuid4())
        filename = secure_filename(file.filename)
        input_filename = f"{task_id}_{filename}"
        output_filename = f"{task_id}_model.glb"

        input_path = os.path.join(app.config["UPLOAD_FOLDER"], input_filename)
        output_path = os.path.join(app.config["OUTPUT_FOLDER"], output_filename)

        file.save(input_path)

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

        processing_status[task_id] = {"status": "queued", "progress": 0}
        return (
            jsonify({"task_id": task_id, "message": "Processing started"}),
            200,
        )

    return jsonify({"error": "Invalid file format. Supported: PNG, JPG, JPEG, DXF"}), 400


@app.route("/api/status/<task_id>", methods=["GET"])
def get_status(task_id):
    if task_id not in processing_status:
        return jsonify({"status": "error", "progress": 0, "error": "Task not found"}), 200
    return jsonify(processing_status[task_id])


@app.route("/api/download/<filename>", methods=["GET"])
def download_model(filename):
    try:
        return send_from_directory(
            app.config["OUTPUT_FOLDER"], filename, as_attachment=False
        )
    except FileNotFoundError:
        return jsonify({"error": "File not found"}), 404


@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify(
        {
            "status": "healthy",
            "blender_path": resolve_blender_path(),
            "service": "PlanVista3D Model Generation",
        }
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"[STARTUP] PlanVista3D Model Generation Server starting on port {port}")
    app.run(debug=True, host="0.0.0.0", port=port)
