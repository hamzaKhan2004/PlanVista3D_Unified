# Current Architecture & System Topography: Unified PlanVista3D

## 1. Unified Application Source Layout

The application has been unified into a single full-stack project under the application root, with preserved original repositories maintained as migration references:

```
d:/Mern Projects/PlanVist3D/
├── frontend/                          # Unified React 19 + Vite 7 SPA (JavaScript / JSX)
│   ├── public/                        # Static assets, blueprints, icons
│   │   ├── favicon.ico
│   │   └── (Sample blueprints b1.jpg - b8.png)
│   ├── src/
│   │   ├── app/                       # Application Shell & Routing
│   │   │   ├── App.jsx                # Top-level BrowserRouter wrapper
│   │   │   ├── Home.jsx               # Studio landing page with dual-mode cards & recent gallery
│   │   │   └── routes.jsx             # React Router route declarations
│   │   ├── components/                # Reusable UI Primitives & Layout
│   │   │   ├── layout/
│   │   │   │   ├── Navbar.jsx         # Header navigation bar & Puter login/logout
│   │   │   │   └── AppLayout.jsx      # Top-level shell providing AuthContext
│   │   │   ├── ui/
│   │   │   │   └── Button.jsx         # Roomify-themed button component
│   │   │   └── projects/
│   │   │       └── ProjectCard.jsx    # Dual-mode project card with dynamic badges
│   │   ├── features/                  # Business Domain Modules
│   │   │   ├── image-generation/
│   │   │   │   ├── GenerateImagePage.jsx # Dedicated 2D AI render generation view
│   │   │   │   ├── UploadFloorPlan.jsx   # Drag-and-drop floor-plan uploader
│   │   │   │   └── ImageVisualizer.jsx   # Before/After comparison slider view
│   │   │   ├── model-generation/
│   │   │   │   ├── GenerateModelPage.jsx # Dedicated 3D CAD model generation view
│   │   │   │   ├── UploadBlueprint.jsx   # Blueprint upload form with parameter inputs
│   │   │   │   ├── ModelViewer.jsx       # 3D canvas viewer, toolbars & controls
│   │   │   │   └── Advanced3DEditor.jsx  # Interactive R3F canvas, raycasting, materials
│   │   │   └── project-gallery/
│   │   │       └── ProjectGallery.jsx    # Unified project gallery with category filters
│   │   ├── lib/                       # API Clients & Utilities
│   │   │   ├── puter/
│   │   │   │   ├── puter.action.js    # Puter SDK auth & project CRUD operations
│   │   │   │   ├── puter.hosting.js   # Puter virtual hosting & file writing
│   │   │   │   └── ai.action.js       # Puter AI txt2img bridge & image formatting
│   │   │   ├── api/
│   │   │   │   └── modelApi.js        # Flask model generation API client & local persistence
│   │   │   └── utils/
│   │   │       ├── constants.js       # Render prompts, timing constants, storage paths
│   │   │       └── utils.js           # Blob, DataURL, and MIME parsing helpers
│   │   ├── styles/
│   │   │   └── index.css              # Roomify Tailwind v4 theme, design tokens, buttons
│   │   └── main.jsx                   # React 19 client entry point
│   ├── index.html                     # HTML host with Instrument Serif & Inter fonts
│   ├── package.json                   # Client dependencies (React 19, Three.js, Puter, etc.)
│   └── vite.config.js                 # Vite config with path alias and /api proxy to Flask (:5000)
│
├── backend/
│   └── model-generation/              # Python Flask 3D Reconstruction Service
│       ├── app.py                     # Flask API gateway, OpenCV contours, task scheduler
│       ├── generate_model.py          # Blender script for DXF vector extrusion
│       ├── generate_model_image.py    # Blender script for image contour geometry
│       ├── blueprint_to_3d.py         # Secure Vision LLM test prototype
│       ├── requirements.txt           # Python backend dependencies
│       ├── test_backend.py            # Unit & regression test suite for Flask endpoints
│       ├── test_e2e_pipeline.py       # End-to-end Blender 5.0 GLB generation test suite
│       ├── textures/                  # Material textures (wood_floor2.jpg)
│       ├── uploads/                   # Blueprint uploads & intermediate JSON configs
│       └── outputs/                   # Generated .glb 3D mesh files
│
├── workers/
│   └── puter/
│       └── puter.worker.js            # Puter Serverless Worker for KV project persistence
│
├── docs/
│   └── architecture/                  # Complete 12-document architecture package
│
├── PlanVistaRoomify/                  # [Preserved Reference] Original Roomify codebase
├── PlanVista3D/                       # [Preserved Reference] Original PlanVista3D codebase
├── .env.example                       # Environment configuration template
└── README.md                          # Master project documentation
```

---

## 2. Architecture Diagrams

### Diagram 1: Unified Application Architecture

```mermaid
graph TD
    subgraph ClientBrowser ["Unified Client Frontend (React 19 + Vite 7 SPA)"]
        Nav["Global Navbar (components/layout/Navbar.jsx)"]
        Router["Client Router (app/routes.jsx)"]
        View_Home["Studio Landing Page (app/Home.jsx)"]
        
        subgraph Mode_Image ["AI Visualization Mode"]
            Page_ImgGen["Generate Image View (GenerateImagePage.jsx)"]
            Upload_Img["Floor Plan Uploader (UploadFloorPlan.jsx)"]
            Visualizer_2D["Before/After Visualizer (ImageVisualizer.jsx)"]
            Slider["ReactCompareSlider Component"]
        end
        
        subgraph Mode_Model ["3D CAD Modeling Mode"]
            Page_ModelGen["Generate Model View (GenerateModelPage.jsx)"]
            Upload_CAD["CAD / Blueprint Uploader (UploadBlueprint.jsx)"]
            Viewer_3D["3D Model Studio (ModelViewer.jsx)"]
            Canvas_R3F["Three.js / React Three Fiber Canvas"]
            Editor_Controls["Scene Controls & Mesh Inspector"]
        end
        
        Gallery["Unified Project Gallery (ProjectGallery.jsx)"]
    end

    subgraph PuterCloud ["Puter Cloud Infrastructure"]
        Puter_Auth["Puter Authentication (OAuth)"]
        Puter_AI["Puter AI Service (txt2img)"]
        Puter_Hosting["Puter Virtual Hosting (roomify-*.puter.site)"]
        Puter_Worker["Puter Serverless Worker (puter.worker.js)"]
        Puter_KV["Puter KV Storage (planVista3D_project_*)"]
    end

    subgraph LocalBackend ["Local Model-Generation Service (Flask :5000)"]
        API_Upload["/api/upload Endpoint"]
        API_Status["/api/status/:taskId Endpoint"]
        API_Download["/api/download/:filename Endpoint"]
        CV_Engine["OpenCV Contour Analyzer"]
        Blender_CLI["Headless Blender 5.0 Engine"]
        Scripts_3D["generate_model.py / generate_model_image.py"]
    end

    Nav --> Router
    Router --> View_Home
    Router --> Mode_Image
    Router --> Mode_Model
    Router --> Gallery

    Mode_Image -->|"Puter AI txt2img"| Puter_AI
    Mode_Image -->|"Save Assets"| Puter_Hosting
    Mode_Image -->|"Save Project"| Puter_Worker
    Puter_Worker --> Puter_KV

    Mode_Model -->|"Vite Proxy /api/upload"| API_Upload
    API_Upload --> CV_Engine
    API_Upload --> Blender_CLI
    Blender_CLI --> Scripts_3D
    Scripts_3D -->|"Export .glb"| API_Download
    API_Download -->|"Stream .glb"| Canvas_R3F

    Gallery -->|"Fetch AI Projects"| Puter_Worker
    Gallery -->|"Fetch CAD Projects"| Mode_Model
```

---

### Diagram 2: Dual Pipeline Processing Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor User as Architect / Designer
    participant UI as Unified Frontend (Vite :5173)
    participant Puter as Puter Cloud Infrastructure
    participant Flask as Flask Backend (:5000)
    participant Blender as Blender 5.0 CLI

    alt Pipeline A: Photorealistic AI Render
        User->>UI: Uploads 2D Floor Plan (.png/.jpg)
        UI->>Puter: puter.ai.txt2img(ROOMIFY_RENDER_PROMPT, base64)
        Puter-->>UI: Returns photorealistic top-down 2D image
        UI->>Puter: Uploads image to Puter Hosting & saves project to Puter KV
        UI->>User: Displays interactive Before/After comparison slider
    else Pipeline B: Geometric 3D CAD Reconstruction
        User->>UI: Uploads Blueprint (.dxf/.png) with wall height/thickness
        UI->>Flask: POST /api/upload (Multipart FormData)
        Flask-->>UI: Returns task_id, status: queued
        UI->>UI: Navigates to /model-viewer/:taskId & polls /api/status/:taskId
        
        par Processing
            alt Input is DXF CAD File
                Flask->>Blender: Execute generate_model.py (LINE/LWPOLYLINE extrusion)
            else Input is Raster Blueprint
                Flask->>Flask: OpenCV adaptiveThreshold & contour extraction
                Flask->>Blender: Execute generate_model_image.py (Curve meshes & textures)
            end
            Blender-->>Flask: Outputs binary .glb to outputs/
        end
        
        Flask-->>UI: Status completed, model_file ready
        UI->>Flask: GET /api/download/:model_file
        Flask-->>UI: Binary GLB stream
        UI->>User: Mounts interactive 3D Three.js canvas (Orbit, Mesh recolor, Wireframe, GLB export)
    end
```
