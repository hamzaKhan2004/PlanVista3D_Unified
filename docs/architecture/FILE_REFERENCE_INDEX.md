# File Reference Index: Unified PlanVista3D

This index inventories all critical source files across both repositories, cataloging their responsibilities, key functions, dependencies, related documentation links, and integration disposition.

---

## 1. PlanVistaRoomify Source Files

| File Path | Responsibility | Key Symbols / Exports | Core Dependencies | Related Docs | Integration Disposition |
|---|---|---|---|---|---|
| `PlanVistaRoomify/app/root.tsx` | App shell, Puter auth state provider, and ErrorBoundary | `Layout`, `App`, `ErrorBoundary`, `links` | `react-router`, `lib/puter.action` | [ROOMIFY_WORKFLOW.md](./ROOMIFY_WORKFLOW.md) | **Modify** (Extract auth provider into unified shell) |
| `PlanVistaRoomify/app/routes.ts` | Route table mapping for React Router v7 | `default` route list | `@react-router/dev/routes` | [CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md) | **Modify** (Adapt to unified routing strategy) |
| `PlanVistaRoomify/app/routes/home.tsx` | Editorial landing page, hero banner, project list | `Home`, `meta`, `handleUploadComplete` | `react-router`, `lib/puter.action` | [ROOMIFY_WORKFLOW.md](./ROOMIFY_WORKFLOW.md) | **Modify** (Merge with 3D upload workflow) |
| `PlanVistaRoomify/app/routes/visualizer.$id.tsx` | Visualizer route, Puter render trigger, slider wipe | `VisualizerId`, `runGeneration`, `handleExport` | `react-compare-slider`, `lib/ai.action` | [ROOMIFY_WORKFLOW.md](./ROOMIFY_WORKFLOW.md) | **Reuse / Modify** (Port into unified visualizer screen) |
| `PlanVistaRoomify/app/app.css` | Editorial design tokens, Tailwind v4 theme, buttons | `@theme`, `.btn`, `.home`, `.visualizer` | `@tailwindcss/vite` | [TECH_STACK.md](./TECH_STACK.md) | **Reuse** (Serve as design base for unified UI) |
| `PlanVistaRoomify/components/Navbar.tsx` | Header bar with Puter sign-in/sign-out toggle | `Navbar`, `handleAuthClick` | `lucide-react`, `react-router` | [ROOMIFY_WORKFLOW.md](./ROOMIFY_WORKFLOW.md) | **Modify** (Expand to include mode switchers) |
| `PlanVistaRoomify/components/Upload.tsx` | Drag-and-drop floor plan uploader | `Upload`, `processFile`, `handleDrop` | `lucide-react`, `lib/constants` | [ROOMIFY_WORKFLOW.md](./ROOMIFY_WORKFLOW.md) | **Modify** (Combine with CAD parameters) |
| `PlanVistaRoomify/components/ui/Button.tsx` | Standard button component with variant classes | `Button`, `ButtonProps` | React | [TECH_STACK.md](./TECH_STACK.md) | **Reuse** (Shared UI primitive) |
| `PlanVistaRoomify/lib/ai.action.ts` | Formats payload and invokes Puter AI text-to-image | `generate3DViews`, `fetchAsDataUrl` | `@heyputer/puter.js`, `constants` | [ROOMIFY_WORKFLOW.md](./ROOMIFY_WORKFLOW.md) | **Reuse** (Core AI generation bridge) |
| `PlanVistaRoomify/lib/constants.ts` | Storage paths, timing constants, AI render prompt | `ROOMIFY_RENDER_PROMPT`, `PUTER_WORKER_URL` | None | [ROOMIFY_WORKFLOW.md](./ROOMIFY_WORKFLOW.md) | **Reuse** (Maintain prompt definitions) |
| `PlanVistaRoomify/lib/puter.action.ts` | High-level Puter bridge for auth, projects, hosting | `createProject`, `getProjects`, `getProjectById` | `@heyputer/puter.js`, `puter.hosting` | [ROOMIFY_WORKFLOW.md](./ROOMIFY_WORKFLOW.md) | **Reuse / Modify** (Adapt to unified project schemas) |
| `PlanVistaRoomify/lib/puter.hosting.ts` | Manages Puter subdomains and file writes | `getOrCreateHostingConfig`, `uploadImageToHosting` | `@heyputer/puter.js`, `utils` | [ROOMIFY_WORKFLOW.md](./ROOMIFY_WORKFLOW.md) | **Reuse** (Asset storage bridge) |
| `PlanVistaRoomify/lib/puter.worker.js` | Cloud microservice routes for CRUD project persistence| `router.post('/save')`, `get('/list')`, `get('/get')` | Puter Worker Runtime, Puter KV | [API_AND_DATA_CONTRACTS.md](./API_AND_DATA_CONTRACTS.md) | **Isolate / Reuse** (Deployable cloud worker) |
| `PlanVistaRoomify/lib/utils.ts` | DataURL/Blob conversion and image MIME type tools | `isHostedUrl`, `imageUrlToPngBlob`, `fetchBlobFromUrl`| Browser DOM APIs | [ROOMIFY_WORKFLOW.md](./ROOMIFY_WORKFLOW.md) | **Reuse** (General utility functions) |
| `PlanVistaRoomify/type.d.ts` | Ambient TypeScript definitions | `AuthState`, `DesignItem`, `VisualizerProps` | TypeScript compiler | [TSX_TO_JSX_MIGRATION.md](./TSX_TO_JSX_MIGRATION.md) | **Modify / Deprecate** (Retire if migrating to JSX) |
| `PlanVistaRoomify/react-router.config.ts` | React Router SSR framework configuration | `default Config` | `@react-router/dev/config` | [TECH_STACK.md](./TECH_STACK.md) | **Modify** (Switch to SPA if SSR abandoned) |
| `PlanVistaRoomify/vite.config.ts` | Vite bundler config with Tailwind and React Router | `default defineConfig` | `@tailwindcss/vite`, `@react-router/dev` | [TECH_STACK.md](./TECH_STACK.md) | **Modify** (Unify into root build config) |
| `PlanVistaRoomify/Dockerfile` | Production container definition | Multi-stage Docker build | `node:20-alpine` | [ENVIRONMENT_AND_SETUP.md](./ENVIRONMENT_AND_SETUP.md) | **Modify** (Expand to support Python if monolithic) |

---

## 2. PlanVista3D Source Files

| File Path | Responsibility | Key Symbols / Exports | Core Dependencies | Related Docs | Integration Disposition |
|---|---|---|---|---|---|
| `PlanVista3D/backend/app.py` | Flask API, thread scheduler, OpenCV contour analysis | `upload_file`, `create_analysis_from_blueprint`, `process_blueprint_async` | Flask, flask-cors, OpenCV, numpy | [BLUEPRINT_TO_3D_WORKFLOW.md](./BLUEPRINT_TO_3D_WORKFLOW.md) | **Reuse / Modify** (Make file paths configurable) |
| `PlanVista3D/backend/generate_model.py` | Headless Blender script for DXF vector extrusion | `generate_building_from_dxf`, `main` | Blender `bpy`, `bmesh`, `ezdxf` | [BLUEPRINT_TO_3D_WORKFLOW.md](./BLUEPRINT_TO_3D_WORKFLOW.md) | **Reuse / Modify** (Remove hardcoded sys.path) |
| `PlanVista3D/backend/generate_model_image.py` | Headless Blender script for image contour geometry | `create_wall`, `create_floor`, `floor_material`, `main` | Blender `bpy`, `bmesh` | [BLUEPRINT_TO_3D_WORKFLOW.md](./BLUEPRINT_TO_3D_WORKFLOW.md) | **Reuse** (Core geometry generation script) |
| `PlanVista3D/backend/blueprint_to_3d.py` | Prototype script for OpenRouter Vision LLM analysis | `analyze_blueprint`, `generate_3d_model` | `requests`, OpenRouter API | [KNOWN_ISSUES_AND_DECISIONS.md](./KNOWN_ISSUES_AND_DECISIONS.md) | **Deprecate / Secure** (Remove hardcoded API key) |
| `PlanVista3D/backend/textures/wood_floor2.jpg`| Texture asset applied to floor meshes in Blender | Binary JPEG image | Blender Image Texture Node | [BLUEPRINT_TO_3D_WORKFLOW.md](./BLUEPRINT_TO_3D_WORKFLOW.md) | **Reuse** (Required asset for material mapping) |
| `PlanVista3D/frontend/src/App.jsx` | React Router DOM configuration | `App` | `react-router-dom` | [CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md) | **Modify** (Merge with Roomify routes) |
| `PlanVista3D/frontend/src/main.jsx` | DOM entry point mounting React tree | `createRoot` | `react-dom/client` | [TECH_STACK.md](./TECH_STACK.md) | **Reuse / Modify** (Base SPA entry) |
| `PlanVista3D/frontend/src/components/Upload.jsx` | Multipart blueprint upload form with parameter fields | `Upload`, `handleUpload`, `handleFileChange` | `axios`, `react-router-dom` | [BLUEPRINT_TO_3D_WORKFLOW.md](./BLUEPRINT_TO_3D_WORKFLOW.md) | **Modify** (Merge parameter inputs into unified form) |
| `PlanVista3D/frontend/src/components/Viewer3D.jsx` | Basic Three.js canvas viewer component | `Viewer3D`, `Model` | `@react-three/fiber`, `@react-three/drei` | [BLUEPRINT_TO_3D_WORKFLOW.md](./BLUEPRINT_TO_3D_WORKFLOW.md) | **Reuse** (Lightweight 3D model viewer) |
| `PlanVista3D/frontend/src/components/Advanced3DEditor.jsx` | Interactive 3D scene editor with mesh selection & tools | `Advanced3DEditor`, `EditableModel`, `CameraController` | `@react-three/fiber`, `@react-three/drei`, Three.js | [BLUEPRINT_TO_3D_WORKFLOW.md](./BLUEPRINT_TO_3D_WORKFLOW.md) | **Reuse** (Primary 3D inspection component) |
| `PlanVista3D/frontend/src/components/Layout.jsx` | Basic page layout wrapper | `Layout` | React | [CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md) | **Deprecate** (Replace with Roomify's superior design) |
| `PlanVista3D/frontend/src/pages/Home.jsx` | Landing view with feature highlights and upload form | `Home` | `Upload` | [BLUEPRINT_TO_3D_WORKFLOW.md](./BLUEPRINT_TO_3D_WORKFLOW.md) | **Modify** (Merge with Roomify's home page) |
| `PlanVista3D/frontend/src/pages/ViewerPage.jsx` | Full-screen 3D viewer, polling status, toolbars | `ViewerPage`, `downloadModel`, `addWall`, `removeSelectedObject` | `axios`, `@heroicons/react`, `Advanced3DEditor` | [BLUEPRINT_TO_3D_WORKFLOW.md](./BLUEPRINT_TO_3D_WORKFLOW.md) | **Reuse / Modify** (Integrate into unified visualizer) |
| `PlanVista3D/frontend/vite.config.js` | Vite config with `/api` proxy to Flask on port 5000 | `defineConfig` | `@vitejs/plugin-react`, `@tailwindcss/vite` | [TECH_STACK.md](./TECH_STACK.md) | **Reuse / Modify** (Retain proxy setup) |
| `PlanVista3D/imp.txt` | Reference Blender DXF generator addon script | `BP_OT_Generate`, `generate_building` | Blender `bpy`, `ezdxf` | [BLUEPRINT_TO_3D_WORKFLOW.md](./BLUEPRINT_TO_3D_WORKFLOW.md) | **Reference** (Reference script for future DXF features) |

---

## 3. Unified PlanVista3D Source Files (Production Application)

| File Path | Responsibility | Key Symbols / Exports | Core Dependencies | Related Docs | Verification Status |
|---|---|---|---|---|---|
| `backend/model-generation/app.py` | Flask REST API, thread scheduler, OpenCV contour analysis, dynamic Blender discovery | `upload_file`, `get_status`, `download_file`, `health_check`, `resolve_blender_path` | Flask, flask-cors, OpenCV, numpy | [API_AND_DATA_CONTRACTS.md](./API_AND_DATA_CONTRACTS.md) | **Verified** (Unit tests 4/4 passed, port 5000) |
| `backend/model-generation/generate_model.py` | Headless Blender 5.0 script for DXF vector extrusion | `generate_building_from_dxf`, `main` | Blender `bpy`, `bmesh`, `ezdxf` | [BLUEPRINT_TO_3D_WORKFLOW.md](./BLUEPRINT_TO_3D_WORKFLOW.md) | **Verified** (E2E DXF GLB generation passed) |
| `backend/model-generation/generate_model_image.py` | Headless Blender 5.0 script for image contour geometry | `create_wall`, `create_floor`, `floor_material`, `main` | Blender `bpy`, `bmesh` | [BLUEPRINT_TO_3D_WORKFLOW.md](./BLUEPRINT_TO_3D_WORKFLOW.md) | **Verified** (E2E Image GLB generation passed) |
| `backend/model-generation/blueprint_to_3d.py` | Secured prototype reading OPENROUTER_API_KEY from environment | `analyze_blueprint`, `generate_3d_model` | `requests`, OpenRouter API | [KNOWN_ISSUES_AND_DECISIONS.md](./KNOWN_ISSUES_AND_DECISIONS.md) | **Secured** (No hardcoded credentials) |
| `backend/model-generation/requirements.txt` | Backend dependency manifest | Flask, flask-cors, opencv-python, numpy, ezdxf, Werkzeug, requests | pip | [ENVIRONMENT_AND_SETUP.md](./ENVIRONMENT_AND_SETUP.md) | **Verified** |
| `backend/model-generation/textures/wood_floor2.jpg` | Texture applied to Blender floor meshes | Binary JPEG image | Blender Image Texture Node | [BLUEPRINT_TO_3D_WORKFLOW.md](./BLUEPRINT_TO_3D_WORKFLOW.md) | **Verified** |
| `workers/puter/puter.worker.js` | Puter Cloud Serverless Worker router for project CRUD | `router.post('/save')`, `get('/list')`, `get('/get')` | Puter Worker Runtime, Puter KV | [API_AND_DATA_CONTRACTS.md](./API_AND_DATA_CONTRACTS.md) | **Verified** (Route contract preserved) |
| `frontend/src/app/App.jsx` | Top-level application shell with React Router `RouterProvider` | `App` | `react-router-dom`, `routes.jsx` | [CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md) | **Verified** (Clean Vite SPA shell) |
| `frontend/src/app/Home.jsx` | Editorial landing page with hero, dual-mode action cards, and recent projects | `Home` | `react-router-dom`, `lucide-react`, `ProjectCard` | [ROOMIFY_WORKFLOW.md](./ROOMIFY_WORKFLOW.md) | **Verified** (Roomify design system) |
| `frontend/src/app/routes.jsx` | Declarative route definition table | `router` | `react-router-dom` | [CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md) | **Verified** (Client-side routing) |
| `frontend/src/components/layout/Navbar.jsx` | Header navigation with dual-mode links and Puter auth toggle | `Navbar` | `react-router-dom`, `lucide-react` | [TECH_STACK.md](./TECH_STACK.md) | **Verified** (Roomify navigation) |
| `frontend/src/components/layout/AppLayout.jsx` | Shared shell providing `AuthContext` and footer | `AppLayout`, `useAuth` | React Context, `Navbar` | [CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md) | **Verified** |
| `frontend/src/components/ui/Button.jsx` | Roomify editorial button primitive with variants and states | `Button` | React | [TECH_STACK.md](./TECH_STACK.md) | **Verified** (Warm styling, loading spinners) |
| `frontend/src/components/projects/ProjectCard.jsx` | Project gallery card with dual-mode badges and visualizer routing | `ProjectCard` | `react-router-dom`, `lucide-react` | [API_AND_DATA_CONTRACTS.md](./API_AND_DATA_CONTRACTS.md) | **Verified** (Supports both image and model modes) |
| `frontend/src/features/image-generation/UploadFloorPlan.jsx` | Pure JSX drag-and-drop floor plan uploader | `UploadFloorPlan` | `lucide-react`, `Button` | [ROOMIFY_WORKFLOW.md](./ROOMIFY_WORKFLOW.md) | **Verified** (TSX converted to JSX) |
| `frontend/src/features/image-generation/ImageVisualizer.jsx` | Puter AI generation runner, comparison slider, export | `ImageVisualizer` | `react-compare-slider`, `puter.action` | [ROOMIFY_WORKFLOW.md](./ROOMIFY_WORKFLOW.md) | **Verified** (Before/After slider) |
| `frontend/src/features/image-generation/GenerateImagePage.jsx` | Route view for 2D AI image generation workflow | `GenerateImagePage` | `UploadFloorPlan`, `ImageVisualizer` | [ROOMIFY_WORKFLOW.md](./ROOMIFY_WORKFLOW.md) | **Verified** |
| `frontend/src/features/model-generation/UploadBlueprint.jsx` | Blueprint upload form with wall height/thickness and floor parameters | `UploadBlueprint` | `lucide-react`, `Button`, `modelApi` | [BLUEPRINT_TO_3D_WORKFLOW.md](./BLUEPRINT_TO_3D_WORKFLOW.md) | **Verified** (Roomify styled form) |
| `frontend/src/features/model-generation/ModelViewer.jsx` | Model viewer container, polling status, download, editor host | `ModelViewer` | `Advanced3DEditor`, `modelApi` | [BLUEPRINT_TO_3D_WORKFLOW.md](./BLUEPRINT_TO_3D_WORKFLOW.md) | **Verified** (Warm Roomify theme) |
| `frontend/src/features/model-generation/Advanced3DEditor.jsx` | Three.js / React Three Fiber interactive scene editor | `Advanced3DEditor`, `ModelMesh`, `CameraController` | `@react-three/fiber`, `@react-three/drei`, Three.js | [BLUEPRINT_TO_3D_WORKFLOW.md](./BLUEPRINT_TO_3D_WORKFLOW.md) | **Verified** (Raycast selection, wireframe, color picker) |
| `frontend/src/features/model-generation/GenerateModelPage.jsx` | Route view for geometric blueprint-to-3D workflow | `GenerateModelPage` | `UploadBlueprint`, `ModelViewer` | [BLUEPRINT_TO_3D_WORKFLOW.md](./BLUEPRINT_TO_3D_WORKFLOW.md) | **Verified** |
| `frontend/src/features/project-gallery/ProjectGallery.jsx` | Unified project catalog with category filtering tabs | `ProjectGallery` | `ProjectCard`, `puter.action`, `modelApi` | [API_AND_DATA_CONTRACTS.md](./API_AND_DATA_CONTRACTS.md) | **Verified** (Merges Puter and model projects) |
| `frontend/src/lib/puter.action.js` | Puter SDK bridge for auth, KV persistence, and hosting | `signIn`, `signOut`, `getCurrentUser`, `createProject`, `getProjects` | `@heyputer/puter.js` | [ROOMIFY_WORKFLOW.md](./ROOMIFY_WORKFLOW.md) | **Verified** (Pure JS implementation) |
| `frontend/src/lib/puter.hosting.js` | Subdomain creation and asset upload to Puter hosting | `getOrCreateHostingConfig`, `uploadImageToHosting` | `@heyputer/puter.js` | [ROOMIFY_WORKFLOW.md](./ROOMIFY_WORKFLOW.md) | **Verified** |
| `frontend/src/lib/ai.action.js` | Puter text-to-image AI prompt generator | `generate3DViews`, `fetchAsDataUrl` | `@heyputer/puter.js` | [ROOMIFY_WORKFLOW.md](./ROOMIFY_WORKFLOW.md) | **Verified** |
| `frontend/src/lib/modelApi.js` | Flask REST API client and localStorage model project registry | `uploadBlueprint`, `getTaskStatus`, `getModelDownloadUrl`, `saveModelProject` | `axios` | [API_AND_DATA_CONTRACTS.md](./API_AND_DATA_CONTRACTS.md) | **Verified** (Vite proxy integration) |
| `frontend/src/lib/constants.js` | Prompts, storage directories, status enums | `ROOMIFY_RENDER_PROMPT`, `PUTER_WORKER_URL`, `POLL_INTERVAL_MS` | None | [TECH_STACK.md](./TECH_STACK.md) | **Verified** |
| `frontend/src/lib/utils.js` | Utility helper functions for URLs, blobs, and classes | `cn`, `isHostedUrl`, `imageUrlToPngBlob` | `clsx`, `tailwind-merge` | [TECH_STACK.md](./TECH_STACK.md) | **Verified** |
| `frontend/src/styles/index.css` | Global styling, Instrument Serif headings, `@theme` tokens | CSS variables, utility classes | Tailwind CSS v4 | [TECH_STACK.md](./TECH_STACK.md) | **Verified** (Roomify design tokens) |
| `frontend/src/main.jsx` | React 19 DOM root mounting point | `createRoot` | `react-dom/client` | [TECH_STACK.md](./TECH_STACK.md) | **Verified** |
| `frontend/vite.config.js` | Vite 7 configuration with `@` alias and `/api` Flask proxy | `defineConfig` | `@vitejs/plugin-react`, `@tailwindcss/vite` | [TECH_STACK.md](./TECH_STACK.md) | **Verified** |
| `frontend/package.json` | Unified frontend dependency manifest | React 19, Vite 7, Three.js, R3F, Puter.js, etc. | npm | [TECH_STACK.md](./TECH_STACK.md) | **Verified** (Clean build, 0 errors) |
