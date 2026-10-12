# PlanVista3D — Unified Architectural Visualization & 3D CAD Studio

PlanVista3D is an integrated, end-to-end architectural intelligence and visualization suite combining two complementary engineering workflows into a single cohesive web application:

1. **Photorealistic AI Visualization Mode**: Converts flat 2D architectural floor-plan images into realistic, top-down 3D visualizations with daylighting, materials, and furnishings using Puter Generative AI. Features an interactive before-and-after slider comparison.
2. **Geometric 3D CAD Modeling Mode**: Programmatically reconstructs real 3D building meshes (`.glb`) from vector AutoCAD (`.dxf`) files and raster blueprints using OpenCV computer vision and headless Blender automation. Features an interactive WebGL Three.js canvas with 360° orbit, raycasted mesh selection, and color customization.

---

## Architecture Topography

```
PlanVista3D/
├── frontend/                          # Unified React 19 + Vite 7 SPA (JavaScript / JSX)
│   ├── public/                        # Static assets, blueprints, icons
│   ├── src/
│   │   ├── app/                       # Application shell & React Router routes
│   │   │   ├── App.jsx
│   │   │   ├── Home.jsx               # Unified studio landing page
│   │   │   └── routes.jsx             # Client-side route declarations
│   │   ├── components/                # Reusable UI & Layout components
│   │   │   ├── layout/                # Navbar & AppLayout (with Puter AuthContext)
│   │   │   ├── ui/                    # Button and UI primitives
│   │   │   └── projects/              # ProjectCard with dual-mode badges
│   │   ├── features/                  # Business domain modules
│   │   │   ├── image-generation/      # Puter AI floor-plan upload & comparison slider
│   │   │   ├── model-generation/      # Blueprint upload, parameters & Three.js 3D editor
│   │   │   └── project-gallery/       # Unified project catalog with category filters
│   │   ├── lib/                       # API clients & utilities
│   │   │   ├── puter/                 # Puter SDK, AI actions, hosting, and auth
│   │   │   ├── api/                   # Flask backend API client & local persistence
│   │   │   └── utils/                 # Constants, prompts, and blob formatting
│   │   ├── styles/                    # Roomify design tokens & Tailwind CSS v4
│   │   └── main.jsx                   # React root entry point
│   ├── index.html
│   ├── package.json
│   └── vite.config.js                 # Vite config with /api proxy to Flask (:5000)
│
├── backend/
│   └── model-generation/              # Python Flask 3D Reconstruction Service
│       ├── app.py                     # Flask API gateway & OpenCV contour analysis
│       ├── generate_model.py          # Headless Blender script for DXF vector extrusion
│       ├── generate_model_image.py    # Headless Blender script for image contour geometry
│       ├── blueprint_to_3d.py         # [Prototype] Vision LLM floor-plan parser
│       ├── requirements.txt           # Python package requirements
│       ├── textures/                  # Material textures (e.g., wood floor)
│       ├── uploads/                   # Temporary blueprint uploads
│       └── outputs/                   # Generated .glb binary models
│
├── workers/
│   └── puter/
│       └── puter.worker.js            # Serverless worker for Puter KV project CRUD
│
├── docs/
│   └── architecture/                  # Full 12-document architecture & audit package
│
├── .env.example                       # Environment configuration template
└── README.md                          # Master documentation (this file)
```

---

## Prerequisites

- **Node.js**: `v20.0.0` or newer (Tested with `v24.3.0`)
- **Python**: `3.11` to `3.13` (Tested with `3.13.9`)
- **Blender Foundation**: Blender 3.6, 4.x, or 5.0 (Tested with Blender 5.0 at `C:\Program Files\Blender Foundation\Blender 5.0\blender.exe`)
- **Puter Account**: Optional for guest browsing; required for saving image renders to Puter Cloud.

---

## Quickstart Guide

### 1. Launch the Backend Model-Generation Service

Open a terminal in `backend/model-generation`:

```powershell
cd backend/model-generation

# Create and activate virtual environment (if not already created)
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Start the Flask service
python app.py
```

The service will start on `http://localhost:5000`.

### 2. Launch the Unified Frontend

Open a second terminal in `frontend`:

```powershell
cd frontend

# Install Node dependencies
npm install

# Start Vite development server
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Studio Navigation Map

| Route | View Name | Description |
|---|---|---|
| `/` | **Overview / Home** | Studio landing page presenting both primary pipelines, quick floor-plan upload, and recent projects. |
| `/generate-image` | **Generate AI Render** | Upload 2D floor plans (PNG/JPG/WEBP) for photorealistic top-down rendering via Puter AI. |
| `/generate-model` | **Generate 3D Model** | Upload CAD DXF or raster blueprints, configure wall height/thickness/floors, and build a 3D mesh. |
| `/visualizer/:id` | **Image Visualizer** | Interactive Before/After comparison slider between original blueprint and 3D visual render. |
| `/model-viewer/:taskId`| **3D CAD Canvas** | Interactive WebGL Three.js canvas with 360° orbit, camera elevation presets, and mesh tools. |
| `/projects` | **Project Gallery** | Unified gallery displaying both AI visualizations and 3D CAD mesh models with category filters. |

---

## Environment Configuration

Copy `.env.example` to `frontend/.env.local` or set environment variables:

| Variable | Default Value | Description |
|---|---|---|
| `VITE_PUTER_WORKER_URL` | `https://planvista-3d.puter.work` | Puter Serverless Worker endpoint for project persistence. |
| `BLENDER_PATH` | System discovery | Path to Blender executable if not installed in standard location. |
| `PORT` | `5000` | Port for the Python Flask backend service. |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origins for the Flask API. |

---

## Design System

The unified application standardizes on the **PlanVistaRoomify design system**:
- **Color Palette**: Warm off-white (`#fdfbf7`), crisp white surfaces, and vibrant orange accents (`#f97316` / `#ea580c`).
- **Typography**: Editorial serif headings (`Instrument Serif`) and clean UI sans-serif (`Inter`).
- **Components**: Rounded pill badges, soft warm shadows (`--shadow-warm`), and minimalistic card layouts.
