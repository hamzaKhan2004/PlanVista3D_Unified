# Environment & Setup Guide: Unified PlanVista3D

## 1. System Prerequisites

The development environment requires runtimes for Node.js (frontend web applications), Python (backend processing API), and Blender (headless 3D procedural modeling).

### Verified Versions on Audit System

| Runtime / Tool | Verified Version | Installation / Path Details |
|---|---|---|
| **Node.js** | `v24.3.0` | System PATH |
| **npm** | `11.7.0` | Included with Node.js |
| **System Python** | `3.13.14` | System PATH (`python.exe`) |
| **Virtualenv Python**| `3.13.9` | `PlanVista3D/backend/venv/Scripts/python.exe` |
| **Blender Foundation**| `5.0.0` | `C:\Program Files\Blender Foundation\Blender 5.0\blender.exe` |

---

## 2. Environment Variables Specification

> [!CAUTION]
> **SECRETS HYGIENE**: Never commit `.env` or `.env.local` files containing live API keys or private tokens to version control. Always include them in `.gitignore`.

### PlanVistaRoomify Environment Variables
- **Configuration File**: `PlanVistaRoomify/.env.local`
- **Variables**:
  | Variable | Status | Verified Default | Description |
  |---|---|---|---|
  | `VITE_PUTER_WORKER_URL` | Active | `"https://planvista-3d.puter.work"` | The remote URL of the Puter Serverless Worker handling project save, get, and list requests. |

### PlanVista3D Environment Variables
- **Configuration File**: `PlanVista3D/backend/.env`
- **Variables**:
  | Variable | Status | Purpose & Description |
  |---|---|---|
  | `API_KEY` | Commented Out | Used by the experimental prototype `blueprint_to_3d.py` for OpenRouter API requests. |
  | `MODEL_NAME` | Commented Out | Vision LLM identifier (e.g., `allenai/molmo-2-8b:free`). |

---

## 3. How to Run Each Project Independently

### A. Running Project A (PlanVistaRoomify)

1. **Navigate to the Directory**:
   ```powershell
   cd "d:\Mern Projects\PlanVist3D\PlanVistaRoomify"
   ```
2. **Install Node Dependencies**:
   ```powershell
   npm install
   ```
3. **Verify Environment Variable**:
   Ensure `.env.local` contains:
   ```env
   VITE_PUTER_WORKER_URL="https://planvista-3d.puter.work"
   ```
4. **Launch the Development Server**:
   ```powershell
   npm run dev
   ```
   The application will become available at `http://localhost:5173`.
5. **Usage Requirement**:
   Open the site in your browser. You must click **Log In** in the navigation header to sign in with your Puter account before the upload dropzone becomes active.

---

### B. Running Project B (PlanVista3D)

Running PlanVista3D requires starting both the Python Flask backend and the Vite frontend.

#### 1. Setup & Launch Python Backend

1. **Navigate to Backend Directory**:
   ```powershell
   cd "d:\Mern Projects\PlanVist3D\PlanVista3D\backend"
   ```
2. **Activate Existing Virtual Environment** (or create one):
   ```powershell
   # If activating existing:
   .\venv\Scripts\Activate.ps1

   # If recreating from scratch:
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   pip install Flask flask-cors opencv-python numpy ezdxf Werkzeug
   ```
3. **Install `ezdxf` for Blender's Python**:
   Because Blender runs its own isolated Python environment, `generate_model.py` imports `ezdxf` by referencing user site-packages. Ensure `ezdxf` is installed in your Python 3.11/3.13 site-packages or Blender's internal site-packages:
   ```powershell
   pip install ezdxf
   ```
4. **Verify Blender Executable Path**:
   Verify that Blender is installed at `C:\Program Files\Blender Foundation\Blender 5.0\blender.exe` or update line 199 in `backend/app.py` to point to your Blender binary.
5. **Launch Flask Server**:
   ```powershell
   python app.py
   ```
   The backend will start listening on `http://localhost:5000`.

#### 2. Setup & Launch Frontend

1. **Open a New Terminal and Navigate to Frontend Directory**:
   ```powershell
   cd "d:\Mern Projects\PlanVist3D\PlanVista3D\frontend"
   ```
2. **Install Node Dependencies**:
   ```powershell
   npm install
   ```
3. **Launch Frontend**:
   ```powershell
   npm run dev
   ```
   The frontend will become available at `http://localhost:5173` (or port 5174 if Roomify is running).

---

## 4. Known Setup Pitfalls & Troubleshooting

### Pitfall 1: Port 5173 Collision
- **Symptom**: Starting both `PlanVistaRoomify` and `PlanVista3D/frontend` concurrently causes Vite to assign the second instance to `http://localhost:5174`.
- **Impact**: In `PlanVista3D/backend/app.py`, CORS is hardcoded to:
  ```python
  CORS(app, origins=["http://localhost:5173"])
  ```
  If the frontend runs on port 5174, browser requests to `/api/upload` fail due to CORS policy rejection.
- **Remedy**: Specify explicit ports in the respective `vite.config` or start only one frontend at a time during testing.

### Pitfall 2: Blender `ezdxf` Import Error
- **Symptom**: During a DXF upload, the task fails with `ModuleNotFoundError: No module named 'ezdxf'` in Blender stderr.
- **Cause**: Blender's internal Python interpreter does not include packages installed in your project's local virtual environment (`venv`).
- **Remedy**: In `backend/generate_model.py`, line 3 contains:
  ```python
  sys.path.append(r"C:\Users\Hamza Khan\AppData\Roaming\Python\Python311\site-packages")
  ```
  This must match the user's actual site-packages path where `ezdxf` is installed.

### Pitfall 3: Subprocess Timeout on Complex Blueprints
- **Symptom**: Generation times out after 300 seconds.
- **Cause**: High-density CAD drawings with thousands of line segments take substantial CPU cycles in `ezdxf` and Blender boolean operations.
- **Remedy**: For large floor plans, ensure complex CAD layers (dimensions, hatching, text) are stripped before conversion.
