# ==============================================================================
# PlanVista3D Backend Production Dockerfile (Python + OpenCV + Blender Headless)
# ==============================================================================
FROM ubuntu:22.04 AS runtime

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PORT=5000
ENV BLENDER_PATH=/usr/bin/blender

# Install system dependencies, Python 3.11/pip, and Headless Blender runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    software-properties-common \
    curl \
    ca-certificates \
    && add-apt-repository -y ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-venv \
    python3.11-distutils \
    python3-pip \
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

# Set python3.11 as default python3
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 \
    && update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1

WORKDIR /app

# Install Python requirements
COPY backend/requirements.txt /app/backend/requirements.txt
RUN python3 -m pip install --no-cache-dir --upgrade pip setuptools wheel \
    && python3 -m pip install --no-cache-dir -r /app/backend/requirements.txt

# Also install ezdxf into Blender's bundled python if Blender uses its own site-packages
RUN /usr/bin/blender --background --python-expr "import sys, subprocess; subprocess.run([sys.executable, '-m', 'pip', 'install', 'ezdxf'])" || true

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
CMD ["gunicorn", "--workers", "2", "--threads", "4", "--bind", "0.0.0.0:5000", "--timeout", "300", "backend.wsgi:app"]