from flask import Blueprint
from backend.controllers.model_controller import ModelController

api_bp = Blueprint("api", __name__, url_prefix="/api")

api_bp.add_url_rule("/upload", view_func=ModelController.upload_file, methods=["POST"])
api_bp.add_url_rule("/status/<task_id>", view_func=ModelController.get_status, methods=["GET"])
api_bp.add_url_rule("/download/<filename>", view_func=ModelController.download_model, methods=["GET"])
api_bp.add_url_rule("/source/<task_id>", view_func=ModelController.download_source, methods=["GET"])
api_bp.add_url_rule("/project/<task_id>", view_func=ModelController.delete_project, methods=["DELETE"])
api_bp.add_url_rule("/health", view_func=ModelController.health_check, methods=["GET"])
