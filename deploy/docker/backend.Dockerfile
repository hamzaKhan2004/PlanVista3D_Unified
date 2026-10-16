# ==============================================================================
# PlanVista3D Backend Production Dockerfile (Python + OpenCV + Blender Headless)
# ==============================================================================
FROM ubuntu:22.04 AS runtime

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PORT=5000
ENV BLENDER_PATH=/usr/bin/blender

ENV PYTHON_SITE_PACKAGES=/usr/local/lib/python3.10/dist-packages
ENV PYTHONPATH=/usr/local/lib/python3.10/dist-packages

# Install system dependencies, native Python 3.10, and Headless Blender runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    python3 \
    python3-pip \
    python3-venv \
    blender \
    libgl1 \
    libegl1 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libglu1-mesa \
    libxkbcommon0 \
    && rm -rf /var/lib/apt/lists/*

# Symlink python to python3
RUN ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app

# Install Python requirements
COPY backend/requirements.txt /app/backend/requirements.txt
RUN python3 -m pip install --no-cache-dir --upgrade pip setuptools wheel \
    && python3 -m pip install --no-cache-dir -r /app/backend/requirements.txt

# Verify Blender installation and that Blender can import all required dependencies for model generation
RUN /usr/bin/blender --version \
    && /usr/bin/blender --background --python-expr "import bpy, bmesh, mathutils, ezdxf, json; print('[DOCKER_BUILD] Blender environment verified. ezdxf version:', ezdxf.__version__)"

# Copy backend source code
COPY backend/ /app/backend/
COPY workers/ /app/workers/

# Create persistent storage directories for uploads and generated outputs
RUN mkdir -p /app/backend/model-generation/uploads /app/backend/model-generation/outputs /app/backend/model-generation/textures

# Declare volumes for persistent blueprints & GLB models
VOLUME ["/app/backend/model-generation/uploads", "/app/backend/model-generation/outputs"]

EXPOSE 5000

# Health check to ensure service is operational
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || exit 1

# Run with Gunicorn production WSGI server (2 workers, 4 threads, 300s timeout for large CAD jobs)
CMD ["sh", "-c", "gunicorn --workers 2 --threads 4 --bind 0.0.0.0:${PORT:-5000} --timeout 300 backend.wsgi:app"]

