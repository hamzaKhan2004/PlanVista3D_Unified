"""
Compatibility wrapper for PlanVista3D model-generation service.
Delegates to the modular backend MVC architecture in `backend/app.py`.
"""
import sys
import os

# Ensure project root is in python path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.app import (
    app,
    resolve_blender_path,
    create_analysis_from_blueprint,
    create_analysis_from_dxf,
    process_blueprint_async,
    processing_status,
)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"[STARTUP] PlanVista3D Model Generation Server starting on port {port} (via model-generation wrapper)")
    app.run(debug=True, host="0.0.0.0", port=port)
