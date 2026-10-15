from flask import Blueprint
from backend.controllers.model_controller import ModelController

api_bp = Blueprint("api", __name__, url_prefix="/api")

api_bp.add_url_rule("/upload", view_func=ModelController.upload_file, methods=["POST"])
api_bp.add_url_rule("/vector-extract", view_func=ModelController.extract_vectors, methods=["POST"])
api_bp.add_url_rule("/status/<task_id>", view_func=ModelController.get_status, methods=["GET"])
api_bp.add_url_rule("/download/<filename>", view_func=ModelController.download_model, methods=["GET"])
api_bp.add_url_rule("/source/<task_id>", view_func=ModelController.download_source, methods=["GET"])
api_bp.add_url_rule("/project/<task_id>/model-url", view_func=ModelController.get_model_url, methods=["GET"])
api_bp.add_url_rule("/model/<task_id>/url", view_func=ModelController.get_model_url, methods=["GET"])
api_bp.add_url_rule("/project/<task_id>", view_func=ModelController.save_project, methods=["PUT", "POST"])
api_bp.add_url_rule("/project/<task_id>", view_func=ModelController.delete_project, methods=["DELETE"])
api_bp.add_url_rule("/images/store-render", view_func=ModelController.store_rendered_image, methods=["POST"])
api_bp.add_url_rule("/images/auth", view_func=ModelController.get_imagekit_auth, methods=["GET"])
api_bp.add_url_rule("/health", view_func=ModelController.health_check, methods=["GET"])
