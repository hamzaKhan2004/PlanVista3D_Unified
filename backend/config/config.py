import os
import shutil

# Root directories
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_GEN_DIR = os.path.join(BASE_DIR, "model-generation")
UPLOAD_FOLDER = os.path.join(MODEL_GEN_DIR, "uploads")
OUTPUT_FOLDER = os.path.join(MODEL_GEN_DIR, "outputs")
TEXTURES_FOLDER = os.path.join(MODEL_GEN_DIR, "textures")

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "dxf"}

# Ensure runtime directories exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

PORT = int(os.environ.get("PORT", 5000))

# CORS origins
cors_origins_env = os.environ.get("CORS_ORIGIN")
if cors_origins_env:
    ALLOWED_ORIGINS = [o.strip() for o in cors_origins_env.split(",")]
else:
    ALLOWED_ORIGINS = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ]


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
