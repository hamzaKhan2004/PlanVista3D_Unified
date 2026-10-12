from backend.config.config import ALLOWED_EXTENSIONS

def allowed_file(filename: str) -> bool:
    """Validates that uploaded filename has a supported extension."""
    if not filename or "." not in filename:
        return False
    return filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def parse_upload_params(form_data):
    """Safely extracts and converts numeric form parameters with fallbacks."""
    try:
        floors = int(form_data.get("floors", 3))
    except (ValueError, TypeError):
        floors = 3

    try:
        wall_height = float(form_data.get("wall_height", 3.2))
    except (ValueError, TypeError):
        wall_height = 3.2

    try:
        wall_thickness = float(form_data.get("wall_thickness", 0.25))
    except (ValueError, TypeError):
        wall_thickness = 0.25

    return {
        "floors": floors,
        "wall_height": wall_height,
        "wall_thickness": wall_thickness,
    }
