import sys
import os

# Add parent directory to sys.path so 'backend' package resolves cleanly
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

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

from flask import Flask
from flask_cors import CORS
from backend.config.config import (
    ALLOWED_ORIGINS,
    PORT,
    resolve_blender_path,
    validate_production_config,
)
from backend.routes.api_routes import api_bp
from backend.services.contour_service import create_analysis_from_blueprint
from backend.services.dxf_service import create_analysis_from_dxf
from backend.services.model_service import process_blueprint_async
from backend.repositories.task_repository import task_repository

# Retain processing_status dict reference for backward compatibility
processing_status = task_repository.raw_dict

def create_app():
    validate_production_config()
    application = Flask(__name__)
    CORS(
        application,
        origins=ALLOWED_ORIGINS,
        allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    )
    application.register_blueprint(api_bp)
    return application

app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", PORT))
    print(f"[STARTUP] PlanVista3D Model Generation Server starting on port {port}")
    app.run(debug=True, host="0.0.0.0", port=port)
