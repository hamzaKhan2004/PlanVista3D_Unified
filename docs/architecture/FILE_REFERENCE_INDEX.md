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
