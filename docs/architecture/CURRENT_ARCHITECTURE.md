# Current Architecture & System Topography

## 1. Clean Workspace Source Layout

Excluding node packages, Python virtual environments, build artifacts, test CAD/image collections, and temporary outputs, the meaningful source tree consists of the following components:

```
d:/Mern Projects/PlanVist3D/
├── PlanVistaRoomify/
│   ├── app/
│   │   ├── routes/
│   │   │   ├── home.tsx               # Landing page, hero, project grid, upload trigger
│   │   │   └── visualizer.$id.tsx     # Comparison visualizer, Puter AI render trigger, export
│   │   ├── app.css                    # Tailwind v4 theme, design tokens, component styles
│   │   ├── root.tsx                   # HTML document shell, Puter auth provider, error boundary
│   │   └── routes.ts                  # React Router v7 route declaration index
│   ├── components/
│   │   ├── ui/
│   │   │   └── Button.tsx             # Shared button component with variants & sizes
│   │   ├── Navbar.tsx                 # Header navigation bar with Puter login/logout
│   │   └── Upload.tsx                 # Drag-and-drop floor plan uploader
│   ├── lib/
│   │   ├── ai.action.ts               # puter.ai.txt2img wrapper and image formatting
│   │   ├── constants.ts               # Storage keys, render prompts, UI dimension constants
│   │   ├── puter.action.ts            # High-level Puter SDK bridge (auth, projects, hosting)
│   │   ├── puter.hosting.ts           # Puter virtual hosting configuration & file writing
│   │   ├── puter.worker.js            # Serverless worker script for CRUD project endpoints
│   │   └── utils.ts                   # Blob conversion, Base64 parsing, URL utilities
│   ├── Dockerfile                     # Multi-stage production container manifest
│   ├── package.json                   # Node dependencies and scripts
│   ├── react-router.config.ts         # React Router SSR configuration
│   ├── tsconfig.json                  # TypeScript compiler settings & path mapping
│   ├── type.d.ts                      # Ambient TypeScript type definitions
│   └── vite.config.ts                 # Vite bundler configuration
│
└── PlanVista3D/
    ├── backend/
    │   ├── app.py                     # Flask HTTP API, task scheduler, OpenCV analysis
    │   ├── blueprint_to_3d.py         # [Prototype] OpenRouter Molmo Vision pipeline script
    │   ├── generate_model.py          # Blender headless script for DXF vector extrusion
    │   ├── generate_model_image.py    # Blender headless script for raster contour geometry
    │   ├── textures/
    │   │   ├── wood_floor.jpg         # Sample floor texture asset
    │   │   └── wood_floor2.jpg        # Active floor texture asset applied in Blender
    │   └── .env                       # Commented API key and model config reference
    │
    ├── frontend/
    │   ├── src/
    │   │   ├── components/
    │   │   │   ├── Advanced3DEditor.jsx  # Interactive Three.js editor, hierarchy & toolbars
    │   │   │   ├── Layout.jsx            # Shared page shell and header
    │   │   │   ├── Upload.jsx            # Multipart upload form with wall & floor parameters
    │   │   │   └── Viewer3D.jsx          # Basic Three.js canvas viewer component
    │   │   ├── pages/
    │   │   │   ├── Home.jsx              # Landing page and blueprint upload container
    │   │   │   └── ViewerPage.jsx        # Full 3D inspection workspace, polling, edit tools
    │   │   ├── App.jsx                   # React Router DOM route definitions
    │   │   ├── index.css                 # Tailwind v4 directives and base styles
    │   │   └── main.jsx                  # React DOM root entry point
    │   ├── eslint.config.js           # ESLint flat configuration
    │   ├── index.html                 # HTML host document
    │   ├── package.json               # Frontend dependencies and scripts
    │   └── vite.config.js             # Vite configuration with `/api` proxy to port 5000
    │
    └── imp.txt                        # Reference Blender DXF addon script
```

---

## 2. Core Entry Points & Lifecycles

### PlanVistaRoomify Entry Points

1. **Development Runtime Entry**:
   - `npm run dev` executes `react-router dev`.
   - Reads `react-router.config.ts` (sets `ssr: true`) and `vite.config.ts`.
   - Loads route map from `app/routes.ts`, binding `/` to `app/routes/home.tsx` and `/visualizer/:id` to `app/routes/visualizer.$id.tsx`.
2. **Client Hydration Root**:
   - `app/root.tsx` renders the outer HTML document (`<head>`, `<Meta>`, `<Links>`, `<body>`, `<ScrollRestoration>`, `<Scripts>`).
   - Automatically initializes authentication check by calling `getCurrentUser()` via `lib/puter.action.ts`.
3. **Puter Worker Entry**:
   - `lib/puter.worker.js` runs on Puter Cloud infrastructure, exposing route handlers for `/api/projects/save`, `/api/projects/list`, and `/api/projects/get`.

### PlanVista3D Entry Points

1. **Backend Flask Entry**:
   - `python app.py` starts Flask on `0.0.0.0:5000` with `debug=True`.
   - Initializes `uploads/` and `outputs/` directories.
   - Registers routes: `/api/upload` (POST), `/api/status/<task_id>` (GET), `/api/download/<filename>` (GET), and `/api/health` (GET).
2. **Frontend SPA Entry**:
   - `npm run dev` inside `PlanVista3D/frontend` executes `vite`.
   - Serves `index.html`, which imports `src/main.jsx`.
   - `src/main.jsx` mounts `src/App.jsx` using `BrowserRouter`.
3. **Blender Headless CLI Scripts**:
   - Invoked dynamically by `app.py` via `subprocess.run`:
     - DXF Pipeline: `blender.exe --background --python generate_model.py -- <config.json> <output.glb>`
     - Image Pipeline: `blender.exe --background --python generate_model_image.py -- <analysis.json> <output.glb>`

---

## 3. Architecture Diagrams

### Diagram 1: PlanVistaRoomify Architecture

```mermaid
graph TD
    subgraph ClientBrowser ["Client Browser (React 19 + React Router v7)"]
        UI_Home["Home Page (app/routes/home.tsx)"]
        UI_Upload["Upload Component (components/Upload.tsx)"]
        UI_Visualizer["Visualizer (app/routes/visualizer.$id.tsx)"]
        UI_Slider["Before/After Slider (ReactCompareSlider)"]
        Auth_Context["Puter Auth Context (app/root.tsx)"]
    end

    subgraph PuterCloud ["Puter Cloud Infrastructure"]
        Puter_Auth["Puter Auth Service"]
        Puter_AI["Puter AI Service (txt2img)"]
        Puter_Hosting["Puter Hosting & Storage (puter.hosting / puter.fs)"]
        Puter_Worker["Puter Worker (lib/puter.worker.js)"]
        Puter_KV["Puter KV Database (planVista3D_project_*)"]
    end

    Auth_Context -->|"1. Authenticate"| Puter_Auth
    UI_Home --> UI_Upload
    UI_Upload -->|"2. Encode Base64"| UI_Home
    UI_Home -->|"3. Save Initial Project"| Puter_Worker
    UI_Home -->|"4. Navigate to /visualizer/:id"| UI_Visualizer
    UI_Visualizer -->|"5. Generate 3D Render"| Puter_AI
    Puter_AI -->|"6. Synthesized 2D Render Image"| UI_Visualizer
    UI_Visualizer -->|"7. Upload Assets"| Puter_Hosting
    UI_Visualizer -->|"8. Persist Rendered Project"| Puter_Worker
    Puter_Worker -->|"Read/Write Project State"| Puter_KV
    UI_Visualizer --> UI_Slider
```

---

### Diagram 2: PlanVista3D Architecture

```mermaid
graph TD
    subgraph ClientFrontend ["PlanVista3D Frontend (React 19 + Three.js)"]
        FE_Home["Home View (pages/Home.jsx)"]
        FE_Upload["Upload Form (components/Upload.jsx)"]
        FE_ViewerPage["Viewer Page (pages/ViewerPage.jsx)"]
        FE_Editor["Advanced 3D Editor (components/Advanced3DEditor.jsx)"]
        FE_R3F["Three.js / React Three Fiber Canvas"]
    end

    subgraph LocalBackend ["Local Backend (Python Flask Server :5000)"]
        API_Upload["/api/upload Endpoint"]
        API_Status["/api/status/:id Endpoint"]
        API_Download["/api/download/:filename Endpoint"]
        Task_Queue["In-Memory Task Status (processing_status)"]
        Worker_Thread["Background Thread (process_blueprint_async)"]
        CV_Analyzer["OpenCV Image Contour Analyzer"]
    end

    subgraph BlenderEngine ["Headless Blender 5.0 Engine"]
        Blender_CLI["Blender Process (--background)"]
        Script_DXF["generate_model.py (ezdxf + Extrusions)"]
        Script_IMG["generate_model_image.py (Curve Meshes + Textures)"]
        GLB_Exporter["glTF 2.0 Binary Exporter"]
    end

    subgraph LocalStorage ["Local File Storage"]
        Dir_Uploads["uploads/ (Input files & JSON configs)"]
        Dir_Outputs["outputs/ (Generated .glb models)"]
    end

    FE_Home --> FE_Upload
    FE_Upload -->|"1. POST multipart/form-data"| API_Upload
    API_Upload -->|"Save Input"| Dir_Uploads
    API_Upload -->|"2. Spawn Daemon Thread"| Worker_Thread
    API_Upload -->|"Return Task ID"| FE_Upload
    FE_Upload -->|"Navigate to /viewer/:taskId"| FE_ViewerPage
    FE_ViewerPage -->|"3. Poll GET /api/status/:taskId (every 2s)"| API_Status
    API_Status --> Task_Queue

    Worker_Thread -->|"If Image: Analyze Contours"| CV_Analyzer
    Worker_Thread -->|"Write Config/Analysis JSON"| Dir_Uploads
    Worker_Thread -->|"4. Subprocess Execution"| Blender_CLI

    Blender_CLI -->|"DXF Mode"| Script_DXF
    Blender_CLI -->|"Image Mode"| Script_IMG
    Script_DXF --> GLB_Exporter
    Script_IMG --> GLB_Exporter
    GLB_Exporter -->|"5. Save Model"| Dir_Outputs
    Worker_Thread -->|"Update Status: completed"| Task_Queue

    FE_ViewerPage -->|"6. GET /api/download/:model"| API_Download
    API_Download --> Dir_Outputs
    FE_ViewerPage --> FE_Editor
    FE_Editor --> FE_R3F
    FE_R3F -->|"7. Load and Render GLB"| FE_R3F
```

---

### Diagram 3: End-to-End User Workflows

```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant Roomify as PlanVistaRoomify Frontend
    participant Puter as Puter Cloud Infrastructure
    participant P3D_FE as PlanVista3D Frontend
    participant P3D_BE as Flask Backend
    participant Blender as Blender 5.0 CLI

    Note over User, Puter: Workflow A: PlanVistaRoomify (2D AI Visualization)
    User->>Roomify: Visit / and Sign in with Puter
    Roomify->>Puter: puter.auth.signIn()
    Puter-->>Roomify: User authenticated
    User->>Roomify: Drop 2D floor plan image
    Roomify->>Puter: Upload to Puter Hosting & Save initial project
    Roomify->>Roomify: Navigate to /visualizer/:id
    Roomify->>Puter: puter.ai.txt2img(ROOMIFY_RENDER_PROMPT, base64)
    Puter-->>Roomify: Return photorealistic 2D render (PNG Data URL)
    Roomify->>Puter: Save updated project with renderedImage
    Roomify->>User: Display Before/After comparison slider & Export PNG

    Note over User, Blender: Workflow B: PlanVista3D (3D Geometric Model)
    User->>P3D_FE: Visit / and Select Blueprint (DXF or PNG/JPG)
    User->>P3D_FE: Configure wall height, thickness, floor count
    P3D_FE->>P3D_BE: POST /api/upload (FormData)
    P3D_BE-->>P3D_FE: Return task_id, status: queued
    P3D_FE->>P3D_FE: Navigate to /viewer/:taskId
    
    rect rgb(240, 248, 255)
        Note over P3D_BE, Blender: Background Worker Execution
        alt Input is DXF CAD File
            P3D_BE->>Blender: Execute generate_model.py with DXF config
            Blender->>Blender: Parse LINEs, extrude walls, duplicate floors
        else Input is Raster Image
            P3D_BE->>P3D_BE: OpenCV contours & bounding boxes
            P3D_BE->>Blender: Execute generate_model_image.py with analysis JSON
            Blender->>Blender: Build wall curves, floor mesh, wood textures
        end
        Blender-->>P3D_BE: Export .glb to outputs/
    end

    loop Polling Status
        P3D_FE->>P3D_BE: GET /api/status/:taskId
        P3D_BE-->>P3D_FE: Return progress / status
    end

    P3D_FE->>P3D_BE: GET /api/download/:model_file
    P3D_BE-->>P3D_FE: Binary GLB stream
    P3D_FE->>User: Mount Interactive 3D Canvas (Orbit, Edit, Color, Export GLB)
```

---

### Diagram 4: Proposed Unified Architecture (PROPOSAL ONLY)

> [!IMPORTANT]
> The following diagram represents a **proposed architecture** for future development. It is **NOT** currently implemented.

```mermaid
graph TD
    subgraph UnifiedFrontend ["Unified Frontend (React 19 + Vite SPA)"]
        Nav["Global Navigation & Mode Switcher"]
        subgraph ModeA ["Aesthetic Visualization Mode (Roomify)"]
            Upload_2D["Floor Plan Ingestion"]
            Slider_View["Before / After 2D Slider"]
            Puter_Client["Puter AI Client Integration"]
        end
        subgraph ModeB ["Geometric 3D CAD Mode (PlanVista3D)"]
            Upload_CAD["Blueprint / CAD Ingestion (DXF + Image)"]
            Param_Controls["Wall & Floor Param Controls"]
            Viewer_3D["React Three Fiber 3D Canvas"]
            Mesh_Editor["Interactive Mesh & Material Editor"]
        end
        Shared_Project_UI["Unified Project Dashboard & History"]
    end

    subgraph GatewayOrchestrator ["Common API & Orchestration Layer (Node / Express or Python)"]
        Auth_Middleware["Authentication & Session Middleware"]
        Project_Service["Unified Project & Metadata Service"]
        Job_Dispatcher["Task Queue & Job State Manager"]
    end

    subgraph GenerationServices ["Independent Processing Services"]
        subgraph CloudAI ["Cloud AI Provider"]
            Puter_API["Puter.js / Puter Cloud AI"]
        end
        subgraph LocalGeometry ["Local / Server Geometry Engine"]
            Flask_Service["Python Processing API"]
            CV_Service["OpenCV Geometry Extractor"]
            Blender_Headless["Blender Headless Renderer"]
        end
    end

    subgraph UnifiedStorage ["Unified Persistence & Asset Layer"]
        DB["Project Metadata Database (MongoDB, PostgreSQL, or Puter KV)"]
        Asset_Store["Object Storage (S3, Puter Hosting, or Local Assets)"]
    end

    Nav --> ModeA
    Nav --> ModeB
    Nav --> Shared_Project_UI

    ModeA -->|"AI Render Request"| Puter_Client
    Puter_Client --> Puter_API
    Puter_API -->|"2D Visual PNG"| ModeA

    ModeB -->|"3D Geometry Request"| Job_Dispatcher
    Job_Dispatcher --> Flask_Service
    Flask_Service --> CV_Service
    Flask_Service --> Blender_Headless
    Blender_Headless -->|"3D Model (.glb)"| Asset_Store

    ModeA -->|"Save Project"| Project_Service
    ModeB -->|"Save Model Reference"| Project_Service
    Project_Service --> DB
    Project_Service --> Asset_Store

    Asset_Store -->|"Stream GLB"| Viewer_3D
    Asset_Store -->|"Stream 2D Render"| Slider_View
```

---

## 4. Runtime and Deployment Boundaries

| Boundary | PlanVistaRoomify | PlanVista3D |
|---|---|---|
| **Client Execution** | Runs in modern browser with Web Workers | Runs in WebGL-capable browser |
| **Server Runtime** | Node.js (via `@react-router/serve` in container) | Python 3.13 (Flask) + Blender 5.0 executable |
| **External Network Dependency** | Requires active internet access to connect to `puter.com` and `puter.work` | Completely local offline execution (excluding the orphaned `blueprint_to_3d.py`) |
| **Operating System Coupling** | Platform-independent Node container (`node:20-alpine`) | Strongly coupled to Windows host paths (`C:\Program Files\Blender Foundation\...`, `C:\Users\Hamza Khan\...`) |
| **Memory & Concurrency** | Stateless server; processing offloaded to Puter Cloud | Local CPU/GPU spikes during Blender headless sub-processes (takes ~5–20s per build) |
