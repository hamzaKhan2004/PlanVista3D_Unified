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

        dispatch_generation_task(
            task_id=task_id,
            input_path=input_path,
            output_path=output_path,
            floors=params["floors"],
            wall_height=params["wall_height"],
            wall_thickness=params["wall_thickness"],
        )

        return (
            jsonify({"task_id": task_id, "message": "Processing started"}),
            200,
        )

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
    def health_check():
        return jsonify(
            {
                "status": "healthy",
                "blender_path": resolve_blender_path(),
                "service": "PlanVista3D Model Generation",
            }
        )
