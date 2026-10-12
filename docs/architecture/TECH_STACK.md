# Technology Stack: Unified PlanVista3D

## 1. Unified Application Technology Stack

| Category | Technology / Library | Version | Location / Scope | Notes & Purpose |
|---|---|---|---|---|
| **Frontend Framework** | React | `^19.1.1` | `frontend/package.json` | Component hierarchy & state management. |
| **DOM Renderer** | React DOM | `^19.1.1` | `frontend/src/main.jsx` | Client-side DOM mounting to `#root`. |
| **Client Router** | `react-router-dom` | `^7.2.0` | `frontend/src/app/App.jsx`, `routes.jsx` | Client-side SPA navigation & URL routing. |
| **Bundler & Dev Server** | Vite | `^7.1.7` | `frontend/vite.config.js` | Fast HMR dev server & Rollup production bundling. |
| **Reverse Proxy** | Vite Proxy | Built-in | `frontend/vite.config.js` | Proxies `/api` to Flask backend (`http://localhost:5000`). |
| **Styling Framework** | Tailwind CSS (v4) | `^4.1.13` | `frontend/src/styles/index.css` | Utility styling with custom Roomify `@theme` tokens. |
| **Tailwind Vite Plugin** | `@tailwindcss/vite` | `^4.1.13` | `frontend/vite.config.js` | Native Vite integration for Tailwind v4. |
| **Typography** | Google Fonts (Instrument Serif & Inter) | Web CDN | `frontend/index.html` | Architectural editorial headings & clean UI body text. |
| **Iconography** | `lucide-react` | `^0.577.0` | Across all frontend features | Standardized icon system across both workflows. |
| **2D Comparison Slider** | `react-compare-slider` | `^3.1.0` | `frontend/src/features/image-generation/` | Interactive before/after wipe slider. |
| **3D Engine** | Three.js | `^0.180.0` | `frontend/src/features/model-generation/` | WebGL rendering, mesh manipulation, and lighting. |
| **React 3D Bridge** | `@react-three/fiber` | `^9.3.0` | `frontend/src/features/model-generation/` | Declarative Three.js canvas in React. |
| **Three.js Helpers** | `@react-three/drei` | `^10.7.6` | `frontend/src/features/model-generation/` | `OrbitControls`, `useGLTF`, `Environment`, `Grid`, `Html`. |
| **HTTP Client** | `axios` | `^1.12.2` | `frontend/src/lib/api/modelApi.js` | Multipart uploads, polling, and BLOB model downloads. |
| **Cloud AI & Platform SDK**| `@heyputer/puter.js` | `^2.2.12` | `frontend/src/lib/puter/` | Puter OAuth, Puter KV, Puter Hosting, and `puter.ai.txt2img`. |
| **Cloud Worker** | Puter Serverless Worker | JavaScript | `workers/puter/puter.worker.js` | CRUD endpoints for `/api/projects/save`, `/list`, `/get`. |
| **Backend Web Server** | Python Flask | `3.1.2` | `backend/model-generation/app.py` | Asynchronous task scheduling and file streaming on port 5000. |
| **CORS Middleware** | `flask-cors` | `6.0.2` | `backend/model-generation/app.py` | Configured for dynamic ports 5173, 5174, 3000, and env var. |
| **Computer Vision** | `opencv-python` (OpenCV) | `4.12.0.88` | `backend/model-generation/app.py` | Adaptive thresholding, morphological closing, and contours. |
| **Numerical Processing**| `numpy` | `2.2.6` | `backend/model-generation/app.py` | Contour bounding box coordinate mathematics. |
| **CAD Parser** | `ezdxf` | `1.4.3` | `backend/model-generation/generate_model.py` | Ingests LINE and LWPOLYLINE entities from AutoCAD DXF. |
| **3D Procedural Engine** | Blender Foundation | `5.0.0` | Executed via CLI | Headless procedural geometry construction & GLB export. |

---

## 2. Dependency Incompatibilities Resolved

1. **SSR Hydration Conflicts Eliminated**: By adopting a Vite React SPA model, Three.js WebGL canvas mounting issues related to Node.js server-side rendering were completely avoided.
2. **Port Collisions Eliminated**: A single frontend now runs on `http://localhost:5173`. Flask CORS was expanded to dynamically permit multiple local ports.
3. **TypeScript Build Burden Removed**: Migrated Roomify frontend components to pure JavaScript/JSX, eliminating typegen overhead while retaining full runtime functionality.
4. **Icons Standardized**: Converted all UI icons to `lucide-react`, removing redundant `@heroicons/react` package overhead.
