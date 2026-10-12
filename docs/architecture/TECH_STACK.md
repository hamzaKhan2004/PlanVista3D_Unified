# Technology Stack Audit: Unified PlanVista3D

## 1. Project A: PlanVistaRoomify Technology Stack

| Category | Technology / Library | Version | File Locations / Usage | Status | Notes & Purpose |
|---|---|---|---|---|---|
| **Frontend Framework** | React | `19.2.4` | `package.json`, `app/root.tsx` | Confirmed | Component hierarchy, client rendering. |
| **DOM Renderer** | React DOM | `19.2.4` | `package.json` | Confirmed | Mounts React tree to DOM. |
| **Fullstack Framework** | React Router (v7) | `7.12.0` | `package.json`, `react-router.config.ts`, `app/routes.ts` | Confirmed | Framework mode with SSR enabled (`ssr: true`), server and client routing. |
| **Node Server Adapter** | `@react-router/node` & `@react-router/serve` | `7.12.0` | `package.json`, `Dockerfile` | Confirmed | Production Node runtime server. |
| **Language & Transpilation**| TypeScript | `^5.9.2` | `tsconfig.json`, `package.json`, `type.d.ts` | Confirmed | Type checking with `tsc` and `.react-router/types` typegen. |
| **Bundler & Dev Server** | Vite | `^7.1.7` | `vite.config.ts`, `package.json` | Confirmed | Bundles client and server code via `@react-router/dev/vite`. |
| **Path Alias Plugin** | `vite-tsconfig-paths` | `^5.1.4` | `vite.config.ts`, `tsconfig.json` | Confirmed | Resolves `~/` and root path aliases (`lib/*`, `components/*`). |
| **CSS Framework** | Tailwind CSS (v4) | `^4.1.13` | `package.json`, `app/app.css` | Confirmed | Utility classes with CSS `@theme` variables. |
| **Tailwind Vite Plugin** | `@tailwindcss/vite` | `^4.1.13` | `vite.config.ts`, `package.json` | Confirmed | Vite-native compiler integration for Tailwind v4. |
| **Icons Library** | `lucide-react` | `^0.577.0` | `app/routes/home.tsx`, `components/Navbar.tsx` | Confirmed | SVG UI icons (Box, ArrowRight, Layers, Clock, etc.). |
| **Comparison UI** | `react-compare-slider` | `^3.1.0` | `app/routes/visualizer.$id.tsx` | Confirmed | Interactive before-and-after image wipe slider. |
| **Bot Detection** | `isbot` | `^5.1.31` | `package.json` | Confirmed | React Router SSR crawler detection utility. |
| **Cloud AI & Platform SDK**| `@heyputer/puter.js` | `^2.2.12` | `lib/ai.action.ts`, `lib/puter.action.ts`, `lib/puter.hosting.ts` | Confirmed | Puter client SDK for AI (`txt2img`), auth, KV storage, hosting, and workers. |
| **Serverless Worker** | Puter Worker (JS) | N/A (Cloud) | `lib/puter.worker.js` | Confirmed | Micro-routing service handling `/api/projects/save`, `/list`, and `/get`. |
| **Database / Persistence** | Puter Key-Value Store (`puter.kv`)| N/A (Cloud) | `lib/puter.action.ts`, `lib/puter.worker.js` | Confirmed | Cloud key-value store using keys `planVista3D_project_<id>`. |
| **File Storage / CDN** | Puter Hosting (`puter.hosting`, `puter.fs`)| N/A (Cloud) | `lib/puter.hosting.ts`, `lib/utils.ts` | Confirmed | Hosts image assets on `https://roomify-*.puter.site/projects/<id>/...`. |
| **Authentication** | Puter Auth (`puter.auth`) | N/A (Cloud) | `lib/puter.action.ts`, `app/root.tsx` | Confirmed | User sign-in, session tokens, and uuid resolution. |
| **Containerization** | Docker | Dockerfile | `PlanVistaRoomify/Dockerfile` | Confirmed | Multi-stage build on `node:20-alpine`. |

---

## 2. Project B: PlanVista3D Technology Stack

### Frontend

| Category | Technology / Library | Version | File Locations / Usage | Status | Notes & Purpose |
|---|---|---|---|---|---|
| **Frontend Framework** | React | `^19.1.1` | `frontend/package.json`, `frontend/src/main.jsx` | Confirmed | UI component hierarchy (client SPA). |
| **DOM Renderer** | React DOM | `^19.1.1` | `frontend/package.json` | Confirmed | Mounts React app to `#root` in `index.html`. |
| **Routing** | `react-router-dom` | `^7.9.3` | `frontend/src/App.jsx` | Confirmed | Client-side routing with `BrowserRouter`, `Routes`, `Route`. |
| **Bundler & Dev Server** | Vite | `^7.1.7` | `frontend/vite.config.js` | Confirmed | Client SPA build with `@vitejs/plugin-react` (`^5.0.4`). |
| **Reverse Proxy** | Vite Dev Server Proxy | Vite built-in | `frontend/vite.config.js` | Confirmed | Proxies `/api` requests to `http://localhost:5000`. |
| **3D Engine** | Three.js | `^0.180.0` | `frontend/src/components/Advanced3DEditor.jsx` | Confirmed | WebGL rendering, mesh manipulation, materials, geometry. |
| **React 3D Bridge** | `@react-three/fiber` | `^9.3.0` | `frontend/src/components/Viewer3D.jsx`, `Advanced3DEditor.jsx` | Confirmed | Declarative Three.js canvas in React. |
| **Three.js Helpers** | `@react-three/drei` | `^10.7.6` | `frontend/src/components/Viewer3D.jsx`, `Advanced3DEditor.jsx` | Confirmed | `OrbitControls`, `useGLTF`, `Environment`, `Grid`, `Html`. |
| **HTTP Client** | `axios` | `^1.12.2` | `frontend/src/components/Upload.jsx`, `pages/ViewerPage.jsx` | Confirmed | HTTP multipart uploads, polling, and BLOB downloads. |
| **CSS Framework** | Tailwind CSS (v4) | `^4.1.14` | `frontend/package.json`, `frontend/src/index.css` | Confirmed | Tailwind v4 via `@tailwindcss/vite` (`^4.1.14`). |
| **Icons Library** | `@heroicons/react` | `^2.2.0` | `frontend/src/pages/ViewerPage.jsx` | Confirmed | Heroicons outline set (BuildingStorefront, PaintBrush, etc.). |
| **Linter** | ESLint | `^9.36.0` | `frontend/eslint.config.js` | Confirmed | Flat config with React Hooks & Refresh plugins. |

### Backend & Generation Engine

| Category | Technology / Library | Version | File Locations / Usage | Status | Notes & Purpose |
|---|---|---|---|---|---|
| **Python Runtime** | Python (Virtual Env) | `3.13.9` / `3.13.14`| `backend/venv/pyvenv.cfg` | Confirmed | Local Python execution environment. |
| **Web Server Framework** | Flask | `3.1.2` | `backend/app.py` | Confirmed | HTTP server on port 5000 with multithreaded jobs. |
| **CORS Middleware** | `flask-cors` | `6.0.2` | `backend/app.py` | Confirmed | Configured for `origins=["http://localhost:5173"]`. |
| **Computer Vision** | `opencv-python` (OpenCV) | `4.12.0.88` | `backend/app.py` (`create_analysis_from_blueprint`)| Confirmed | Blueprint image preprocessing, thresholding, contours. |
| **Numerical Processing**| `numpy` | `2.2.6` | `backend/app.py` | Confirmed | Array manipulation and bounding-box bounding coordinate math. |
| **CAD DXF Parser** | `ezdxf` | `1.4.3` | `backend/app.py`, `backend/generate_model.py` | Confirmed | Extracts LINE entities from AutoCAD `.dxf` files. |
| **3D DCC / Scripting** | Blender (Foundation) | `5.0.0` | `backend/app.py`, `generate_model.py`, `generate_model_image.py` | Confirmed | Headless execution (`--background --python ...`) exporting `.glb`. |
| **Blender Internal APIs**| `bpy`, `bmesh`, `mathutils`| Blender Built-in | `generate_model.py`, `generate_model_image.py` | Confirmed | Procedural geometry construction, materials, UV unwrap, glTF export. |
| **Vision AI (Prototype)**| OpenRouter API / Molmo 2 8B | `allenai/molmo-2-8b:free`| `backend/blueprint_to_3d.py` | Confirmed (Prototype) | Orphaned test script; requires external API connection and API key. |

---

## 3. Dependency and Configuration Incompatibilities

When merging the two codebases, several conflicting architectural assumptions must be reconciled:

```
+---------------------------------------------------------------------------------------+
|                                    CONFLICT MATRIX                                    |
+------------------------------------+--------------------------+-----------------------+
| Architectural Dimension            | PlanVistaRoomify         | PlanVista3D           |
+------------------------------------+--------------------------+-----------------------+
| React Framework Strategy           | React Router v7 SSR      | Vite React 19 SPA     |
| Language Standard                  | TypeScript 5.9 (.tsx/.ts)| JavaScript JSX (.jsx) |
| Routing Mechanism                  | Framework routes.ts (SSR)| react-router-dom (SPA)|
| Iconography System                 | lucide-react             | @heroicons/react      |
| HTTP Communication                 | fetch / Puter SDK exec   | axios                 |
| Default Vite Port                  | 5173                     | 5173 (Port collision) |
| Persistence Philosophy             | Puter Cloud (KV + CDN)   | Ephemeral (in-memory) |
| Auth Dependency                    | Hard requirement (Puter) | None (Anonymous)      |
| Primary Output Type                | 2D Raster PNG            | 3D Polygonal GLB      |
+------------------------------------+--------------------------+-----------------------+
```

### Detailed Incompatibility Breakdown

1. **React Router v7 Fullstack SSR vs. Vite React SPA**:
   - `PlanVistaRoomify` relies on React Router v7 framework mode with server-side rendering (`ssr: true`), `@react-router/node`, and `@react-router/dev/vite`.
   - `PlanVista3D` relies on standard Vite client SPA mode with `@vitejs/plugin-react` and `react-router-dom` v7.
   - *Impact*: In a single frontend, running both simultaneously in one Vite build is incompatible without selecting either the SSR model or SPA model.

2. **TypeScript Compilation vs. Plain JavaScript**:
   - `PlanVistaRoomify` enforces strict TypeScript (`tsconfig.json` with `strict: true`, `verbatimModuleSyntax: true`).
   - `PlanVista3D` frontend has no TypeScript configuration and relies on standard Babel/Vite JSX transpilation with ESLint.

3. **Vite Development Port Collision**:
   - Both `PlanVistaRoomify/package.json` (`react-router dev`) and `PlanVista3D/frontend/package.json` (`vite`) bind by default to `http://localhost:5173`. Running both concurrently leads to an automatic port increment (e.g., port 5174), breaking the hardcoded Flask CORS configuration (`origins=["http://localhost:5173"]`) and Vite proxy.

4. **UI Icon Libraries**:
   - `lucide-react` is used in Roomify; `@heroicons/react` is used in PlanVista3D. Maintaining both introduces duplicate bundle bloat (~150KB extra icons).

5. **Authentication and File Upload Gatekeeping**:
   - Roomify blocks users from uploading floor plans unless signed into Puter (`disabled={!isSignedIn}`).
   - PlanVista3D has no user concept; uploads start immediately and assign anonymous UUID task IDs.

---

## 4. Provisional Target Stack (Proposed Direction)

> [!NOTE]
> This target stack is a **provisional architectural proposal** designed to minimize friction while maximizing stability. It is subject to user review and approval.

- **Frontend Core**: React 19 + Vite 7 Single Page Application (SPA).
  - *Rationale*: Three.js and React Three Fiber rely extensively on WebGL browser contexts, DOM canvas mounts, and client-side memory. Running React Router v7 in pure SPA mode or standard Vite SPA avoids SSR hydration mismatch errors with WebGL canvases.
- **Language**: Gradual convergence to JavaScript/JSX (per user request) or unified TypeScript.
- **Styling**: Tailwind CSS v4 (shared across both already).
- **Icons**: Standardize on `lucide-react` (richer icon selection for architectural/CAD tooling).
- **Client Routing**: React Router v7 (`react-router` client-side declarative routes).
- **3D Visualization**: Three.js + `@react-three/fiber` + `@react-three/drei`.
- **2D Visualizer**: `react-compare-slider`.
- **Backend API**: Python Flask (handling OpenCV and Blender geometry) + Express/Node or Puter Cloud adapter for project persistence.
