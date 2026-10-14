import time
import os
import uuid
from flask import request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from backend.config.config import UPLOAD_FOLDER, OUTPUT_FOLDER, resolve_blender_path
from backend.schemas.validation import allowed_file, parse_upload_params
from backend.repositories.task_repository import task_repository
from backend.services.model_service import dispatch_generation_task

class ModelController:
    """Controller handling blueprint uploads, job polling, model streaming, and health checks."""

    @staticmethod
    def upload_file():
        print("[UPLOAD] Received upload request")

        if "file" not in request.files:
            return jsonify({"error": "No file uploaded"}), 400

        file = request.files["file"]
        if not file or not allowed_file(file.filename):
            return jsonify({"error": "Invalid file format. Supported: PNG, JPG, JPEG, DXF"}), 400

        params = parse_upload_params(request.form)
        print(f"[PARAMS] floors={params['floors']}, wall_height={params['wall_height']}, wall_thickness={params['wall_thickness']}")

        task_id = str(uuid.uuid4())
        filename = secure_filename(file.filename)
        input_filename = f"{task_id}_{filename}"
        output_filename = f"{task_id}_model.glb"

        input_path = os.path.join(UPLOAD_FOLDER, input_filename)
        output_path = os.path.join(OUTPUT_FOLDER, output_filename)

        file.save(input_path)

        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

        # Check if vector-assisted mode is requested for raster images
        is_vector_assisted = request.form.get("vector_assisted", "").lower() in ("true", "1", "yes")
        raw_vector_data = request.form.get("vector_data")
        vector_data = None
        target_size = float(request.form.get("target_size", 28.0))

        if is_vector_assisted and ext != "dxf":
            if raw_vector_data:
                try:
                    import json
                    vector_data = json.loads(raw_vector_data)
                except Exception as e:
                    print(f"[WARN] Failed to parse vector_data JSON: {e}")

            if not vector_data:
                try:
                    from backend.services.vector_service import extract_vector_walls
                    vector_data = extract_vector_walls(
                        input_path,
                        wall_height=params["wall_height"],
                        wall_thickness=params["wall_thickness"],
                        target_size=target_size,
                    )
                except Exception as e:
                    return jsonify({"error": f"Vector-assisted extraction failed: {str(e)}"}), 422

        source_info = {
            "filename": filename,
            "type": ext,
            "has_source": True,
            "download_url": f"/api/source/{task_id}",
            "uploaded_at": int(time.time() * 1000),
            "pipeline": "vector_assisted" if vector_data else ("dxf" if ext == "dxf" else "image"),
        }

        task_repository.set(task_id, {
            "status": "queued",
            "progress": 0,
            "source_file": source_info,
        })

        dispatch_generation_task(
            task_id=task_id,
            input_path=input_path,
            output_path=output_path,
            floors=params["floors"],
            wall_height=float(vector_data.get("wall_height", params["wall_height"])) if vector_data else params["wall_height"],
            wall_thickness=float(vector_data.get("wall_thickness", params["wall_thickness"])) if vector_data else params["wall_thickness"],
            vector_data=vector_data,
            target_size=float(vector_data.get("target_size", target_size)) if vector_data else target_size,
        )

        return (
            jsonify({"task_id": task_id, "message": "Processing started", "pipeline": source_info["pipeline"]}),
            200,
        )

    @staticmethod
    def extract_vectors():
        """
        Endpoint for Vector-Assisted 2D geometry extraction and preview.
        Preprocesses raster floor plan, cleans noise, deduplicates walls, and returns 2D vectors & SVG.
        """
        print("[VECTOR_EXTRACT] Received vector extraction request")
        if "file" not in request.files:
            return jsonify({"error": "No file uploaded for vector extraction"}), 400

        file = request.files["file"]
        if not file or not allowed_file(file.filename):
            return jsonify({"error": "Invalid file format. Supported: PNG, JPG, JPEG"}), 400

        ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        if ext == "dxf":
            return jsonify({"error": "Vector-assisted extraction is for raster images (PNG, JPG). DXF uses direct CAD ingestion."}), 400

        temp_id = str(uuid.uuid4())
        safe_name = secure_filename(file.filename)
        temp_path = os.path.join(UPLOAD_FOLDER, f"temp_vec_{temp_id}_{safe_name}")

        try:
            file.save(temp_path)

            min_wall_len = float(request.form.get("min_wall_length_px", 25))
            snap_radius = float(request.form.get("snap_radius", 18.0))
            wall_height = float(request.form.get("wall_height", 3.0))
            wall_thickness = float(request.form.get("wall_thickness", 0.25))
            target_size = float(request.form.get("target_size", 28.0))

            from backend.services.vector_service import extract_vector_walls
            result = extract_vector_walls(
                temp_path,
                min_wall_length_px=min_wall_len,
                snap_radius=snap_radius,
                wall_height=wall_height,
                wall_thickness=wall_thickness,
                target_size=target_size,
            )

            result["temp_file_id"] = temp_id
            return jsonify(result), 200

        except ValueError as ve:
            return jsonify({"error": str(ve)}), 422
        except Exception as e:
            return jsonify({"error": f"Vector extraction failed: {str(e)}"}), 500
        finally:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass

    @staticmethod
    def get_status(task_id: str):
        task_data = task_repository.get(task_id)
        if not task_data:
            return jsonify({"status": "error", "progress": 0, "error": "Task not found"}), 200
        return jsonify(task_data)

    @staticmethod
    def download_model(filename: str):
        try:
            return send_from_directory(
                OUTPUT_FOLDER, filename, as_attachment=False
            )
        except FileNotFoundError:
            return jsonify({"error": "File not found"}), 404

    @staticmethod
    def download_source(task_id: str):
        """Streams the original uploaded blueprint file (DXF or Image) without exposing server paths."""
        if not os.path.exists(UPLOAD_FOLDER):
            return jsonify({"error": "Source file not found"}), 404

        for fname in os.listdir(UPLOAD_FOLDER):
            if fname.startswith(f"{task_id}_"):
                orig_filename = fname[len(task_id) + 1:]
                return send_from_directory(
                    UPLOAD_FOLDER,
                    fname,
                    download_name=orig_filename,
                    as_attachment=False,
                )

        return jsonify({"error": "Source file not found"}), 404

    @staticmethod
    def delete_project(task_id: str):
        """Deletes task metadata and exclusively owned files for a 3D model project."""
        try:
            task_repository.delete(task_id)
            return jsonify({"success": True, "message": f"Project {task_id} deleted"}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @staticmethod
    def health_check():
        return jsonify(
            {
                "status": "healthy",
                "blender_path": resolve_blender_path(),
                "service": "PlanVista3D Model Generation",
            }
        )
