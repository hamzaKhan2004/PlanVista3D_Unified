import os
import shutil

try:
    from dotenv import load_dotenv
    # Search for .env in project root, backend root, or working directory
    _parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    _root_env = os.path.join(os.path.dirname(_parent_dir), ".env")
    _backend_env = os.path.join(_parent_dir, ".env")
    if os.path.exists(_root_env):
        load_dotenv(_root_env)
    elif os.path.exists(_backend_env):
        load_dotenv(_backend_env)
    else:
        load_dotenv()
except ImportError:
    pass

# Root directories (configurable via env for volume mounts in Docker / cloud deployments)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_GEN_DIR = os.path.join(BASE_DIR, "model-generation")
UPLOAD_FOLDER = os.environ.get("UPLOAD_FOLDER", os.path.join(MODEL_GEN_DIR, "uploads"))
OUTPUT_FOLDER = os.environ.get("OUTPUT_FOLDER", os.path.join(MODEL_GEN_DIR, "outputs"))
TEXTURES_FOLDER = os.environ.get("TEXTURES_FOLDER", os.path.join(MODEL_GEN_DIR, "textures"))

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "dxf"}

# Ensure runtime directories exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

PORT = int(os.environ.get("PORT", 5000))

# CORS origins
cors_origins_env = os.environ.get("CORS_ORIGIN")
if cors_origins_env:
    if cors_origins_env.strip() == "*":
        ALLOWED_ORIGINS = "*"
    else:
        ALLOWED_ORIGINS = [o.strip() for o in cors_origins_env.split(",") if o.strip()]
else:
    ALLOWED_ORIGINS = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ]

# MongoDB Atlas Database Configuration
MONGODB_URI = os.environ.get("MONGODB_URI", "").strip()
MONGODB_DB_NAME = os.environ.get("MONGODB_DB_NAME", "planvista3d").strip()

# Puter Authentication Verification Settings
PUTER_AUTH_REQUIRED = os.environ.get("PUTER_AUTH_REQUIRED", "false").lower() in ("true", "1", "yes")
PUTER_WHOAMI_URL = os.environ.get("PUTER_WHOAMI_URL", "https://api.puter.com/whoami")

# ImageKit Configuration (Private key backend-only)
IMAGEKIT_URL = os.environ.get("IMAGEKIT_URL", os.environ.get("IMAGEKIT_URL_ENDPOINT", "")).strip()
IMAGEKIT_PUBLIC_KEY = os.environ.get("IMAGEKIT_PUBLIC_KEY", "").strip()
IMAGEKIT_PRIVATE_KEY = os.environ.get("IMAGEKIT_PRIVATE_KEY", "").strip()
IMAGEKIT_BLUEPRINT_FOLDER = "planvista/blueprints/"
IMAGEKIT_GENERATED_IMAGES_FOLDER = "planvista/generated-images/"

# Amazon S3 Storage Configuration (for 3D GLB model persistence)
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1").strip() or "us-east-1"
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID", "").strip()
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "").strip()
S3_BUCKET = os.environ.get("S3_BUCKET", "").strip()
S3_PREFIX = os.environ.get("S3_PREFIX", "users/").strip()

def is_production_environment() -> bool:
    """
    Detects if the application is running in a production deployment.
    Checks Render platform flags (RENDER, RENDER_SERVICE_ID, RENDER_INSTANCE_ID),
    standard container/WSGI environment indicators, or explicit production settings.
    """
    if os.environ.get("RENDER", "").lower() in ("true", "1"):
        return True
    if bool(os.environ.get("RENDER_SERVICE_ID") or os.environ.get("RENDER_INSTANCE_ID")):
        return True
    if os.environ.get("FLASK_ENV", "").lower() == "production":
        return True
    if os.environ.get("ENVIRONMENT", "").lower() in ("production", "prod"):
        return True
    if os.environ.get("NODE_ENV", "").lower() == "production":
        return True
    return False

def validate_production_config(auth_required: bool = None) -> None:
    """
    Ensures that production deployments do not run with unauthenticated guest-local access.
    Fails fast with a clear, secret-free configuration error.
    """
    required = auth_required if auth_required is not None else PUTER_AUTH_REQUIRED
    if is_production_environment() and not required:
        raise RuntimeError(
            "CRITICAL CONFIGURATION ERROR: PUTER_AUTH_REQUIRED must be explicitly set to 'true' in production environments (Render / production WSGI). Unauthenticated guest-local mode is prohibited in production."
        )

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
