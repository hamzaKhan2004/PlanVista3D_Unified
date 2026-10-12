# Project Overview: Unified PlanVista3D

## 1. Vision & Strategic Objective

The overarching mission of **Unified PlanVista3D** is to create an end-to-end architectural intelligence and visualization suite. Architects, interior designers, real estate developers, and homeowners typically handle blueprints in disparate formats (ranging from hand-drawn sketches and raster floor plans to precise CAD `.dxf` vectors). 

Currently, users must use separate tools depending on whether they need:
1. **Photorealistic Marketing Visualizations**: An aesthetic 3D-looking image demonstrating furnished rooms, daylighting, materials, and textures for presentation and styling.
2. **Interactive 3D Geometric Models**: A true 3D CAD/BIM-like mesh model that can be rotated, measured, floor-isolated, textured, downloaded as `.glb`, or edited in real-time in the browser.

The unified application will merge both capabilities into a coherent web platform offering dual pipelines from a single project dashboard.

---

## 2. Original Project Profiles

### Project A: PlanVistaRoomify
- **Repository**: [https://github.com/hamzaKhan2004/PlanVistaRoomify](https://github.com/hamzaKhan2004/PlanVistaRoomify)
- **Primary Goal**: Rapid aesthetic visualization of 2D floor plans.
- **Underlying Mechanism**: Cloud-based Generative AI using the Puter.js SDK (`@heyputer/puter.js`) invoking text-to-image synthesis conditioned on the uploaded floor-plan image.
- **Architectural Footprint**: Full-stack framework built with React Router v7 in SSR mode, TypeScript, Tailwind CSS v4, and Puter Serverless infrastructure (Puter Auth, Puter KV, Puter Hosting, and Puter Workers).
- **Core Output**: High-resolution 2D raster image (`.png` / data URL) depicting a photorealistic, top-down 3D architectural render.

### Project B: PlanVista3D
- **Repository**: [https://github.com/hamzaKhan2004/PlanVista3D](https://github.com/hamzaKhan2004/PlanVista3D)
- **Primary Goal**: Deterministic geometric reconstruction of buildings and floor plans into manipulable 3D meshes.
- **Underlying Mechanism**: Local Python Flask API service coupled with Computer Vision (OpenCV) contour approximation and headless 3D modeling scripts executed via Blender 5.0 CLI (`blender.exe --background --python ...`).
- **Architectural Footprint**: Dual-tier application: Vite + React 19 client-side Single Page Application (SPA) utilizing Three.js and React Three Fiber (`@react-three/fiber`, `@react-three/drei`), communicating with a local Python Flask server (port 5000).
- **Core Output**: Standard glTF binary mesh file (`.glb`) containing vertices, faces, UV unwrapping, floor slabs, wall extrusions, door/window proxy geometries, and materials.

---

## 3. Fundamental Differentiation: 2D AI Render vs. 3D Geometric Model

A critical requirement of this audit is to clarify the sharp technical distinction between the outputs produced by both projects. These two outputs are frequently conflated by non-technical stakeholders, but they represent fundamentally distinct data structures:

| Metric / Dimension | PlanVistaRoomify Output | PlanVista3D Output |
|---|---|---|
| **Data Nature** | 2D Raster Image (`image/png`) | 3D Vector Geometry (`model/gltf-binary` / `.glb`) |
| **Coordinate Space** | Screen-space 2D pixels ($X, Y$) | World-space 3D coordinates ($X, Y, Z$) |
| **Inspection Capabilities** | Static comparison; zoom & pan only | 360° Orbit, tilt, pan, camera fov adjustment, top/side/front views |
| **Interactivity** | Before/After visual comparison slider | Selection of individual wall, door, and room meshes; color changing; wireframe toggle; item addition/deletion |
| **Material Representation** | Synthesized pixel illumination and shadows | Physically Based Rendering (PBR) Principled BSDF nodes with dynamic Three.js lights |
| **Accuracy & Tolerances** | Hallucinatory/generative; AI infers room functions, styling, and decor | Parametric; geometry directly extruded from DXF vectors or segmented OpenCV contours |
| **Downstream Compatibility**| Presentation decks, marketing websites, static image exports | CAD/BIM tools (Blender, Unity, Unreal Engine, WebGL viewers, 3D printers) |

---

## 4. Feature Audit: Confirmed vs. Partial Implementations

Each claimed capability was verified directly against the source code:

### PlanVistaRoomify Feature Verification

| Feature | Verified Status | Evidence in Code | Notes & Limitations |
|---|---|---|---|
| **Landing Page** | Fully Implemented | `app/routes/home.tsx` | Editorial hero section, announcement badge, CTA buttons. |
| **Image Upload** | Fully Implemented | `components/Upload.tsx` | Drag-and-drop file upload. **Limitation**: Enforces Puter login (`disabled={!isSignedIn}`). |
| **Puter Auth** | Fully Implemented | `app/root.tsx`, `components/Navbar.tsx` | Puter modal popup sign-in, username retrieval, sign-out. |
| **AI Generation** | Fully Implemented | `lib/ai.action.ts` | Calls `puter.ai.txt2img(ROOMIFY_RENDER_PROMPT, ...)` with base64 payload. |
| **Before/After Slider** | Fully Implemented | `app/routes/visualizer.$id.tsx` | Uses `react-compare-slider` comparing source vs. generated image. |
| **Project Saving** | Fully Implemented | `lib/puter.action.ts`, `lib/puter.worker.js` | Saves metadata to Puter KV with prefix `planVista3D_project_`. |
| **Project Listing** | Fully Implemented | `lib/puter.action.ts`, `app/routes/home.tsx` | Fetches community/user projects from Puter Worker and displays cards. |
| **Project Retrieval**| Fully Implemented | `lib/puter.action.ts` (`getProjectById`) | Fetches project by ID on route `/visualizer/:id`. |
| **Export Image** | Fully Implemented | `app/routes/visualizer.$id.tsx` (`handleExport`) | Injects temporary `<a>` anchor and downloads `rendered_image.png`. |
| **Share Project** | **Stub / Incomplete** | `app/routes/visualizer.$id.tsx` (line 159) | Share button has empty `onClick={() => {}}` callback. |

### PlanVista3D Feature Verification

| Feature | Verified Status | Evidence in Code | Notes & Limitations |
|---|---|---|---|
| **Blueprint Upload** | Fully Implemented | `frontend/src/components/Upload.jsx` | Multipart form submission supporting PNG, JPG, JPEG, and DXF. |
| **Parameter Configuration** | Fully Implemented | `Upload.jsx`, `backend/app.py` | Configurable floors (DXF), wall height, and wall thickness. |
| **Asynchronous Job Worker** | Fully Implemented | `backend/app.py` (`process_blueprint_async`) | Python threading worker with status dictionary keyed by UUID task ID. |
| **DXF Extrusion Pipeline** | Fully Implemented | `backend/generate_model.py` | Parses `ezdxf` LINE entities, centers, applies target size, extrudes walls, generates floor slabs. |
| **Image Contour Pipeline** | Fully Implemented | `backend/app.py`, `backend/generate_model_image.py` | OpenCV adaptiveThreshold + contour approximation; Blender generates curve extrusions and floor. |
| **Three.js WebGL Viewer** | Fully Implemented | `frontend/src/components/Viewer3D.jsx` | `@react-three/fiber` canvas with OrbitControls and GLB loading. |
| **Advanced 3D Editor** | Fully Implemented | `frontend/src/components/Advanced3DEditor.jsx`, `pages/ViewerPage.jsx` | Mesh click-selection, color updates, category visibility toggling, wireframe, camera views. |
| **Model Download** | Fully Implemented | `frontend/src/pages/ViewerPage.jsx` (`downloadModel`) | Fetches GLB binary from Flask `/api/download/:filename`. |
| **OpenRouter Vision Pipeline** | **Orphaned Prototype** | `backend/blueprint_to_3d.py` | Standalone script calling Molmo Vision model; not wired into Flask API. Hardcoded API key detected. |
| **Persistent Storage** | **Missing** | `backend/app.py` | Processing status is kept in an in-memory Python dictionary (`processing_status = {}`). Disappears on restart. |

---

## 5. Unified Product Direction

The planned unified product will feature:
1. **Single Responsive Hub**: A unified frontend offering an intuitive selection between **Aesthetic Render Mode** (Roomify) and **Interactive 3D CAD Mode** (PlanVista3D).
2. **Shared Blueprint Ingestion**: A robust upload portal accepting images (PNG, JPG, WEBP) and CAD files (DXF), performing immediate validation.
3. **Orchestrated Processing**:
   - Route to Cloud AI (Puter.js) for 2D render synthesis.
   - Route to Backend Service (Python/Blender) for 3D GLB mesh synthesis.
4. **Cohesive Project Management**: Unified data schemas enabling a project to store both its 2D AI render and its 3D GLB model in a single record.
5. **Unified Viewer Experience**: A unified visualizer featuring side-by-side or tabbed views for Before/After 2D image comparison and real-time Three.js 3D mesh exploration.
