# Known Issues & Architectural Decisions: Status Report

## 1. Resolved Issues & Bug Fixes

The following issues identified during the initial audit have been resolved in the unified implementation:

| Issue ID | Severity | Component | Problem Statement | Resolution Implemented |
|---|---|---|---|---|
| **FIX-01** | **CRITICAL** | `backend/model-generation/blueprint_to_3d.py` | Plaintext OpenRouter API key committed in source code. | Isolated: replaced with `os.environ.get("OPENROUTER_API_KEY", "")` and documented in `.env.example`. |
| **FIX-02** | **HIGH** | `backend/model-generation/generate_model.py` | Hardcoded author Windows path (`C:\Users\Hamza Khan\...`) in `sys.path`. | Dynamic: uses `site.getusersitepackages()`, `PYTHON_SITE_PACKAGES` env var, and system fallback. |
| **FIX-03** | **HIGH** | `backend/model-generation/app.py` | Hardcoded Blender 5.0 executable path. | Dynamic: implemented `resolve_blender_path()` querying `BLENDER_PATH` env var, standard paths, or PATH. |
| **FIX-04** | **HIGH** | `backend/model-generation/app.py` | Windows console `cp1252` crash when printing Unicode emojis. | Fixed: added `sys.stdout.reconfigure(encoding="utf-8")` and standardized logging to ASCII bracketed tags (`[UPLOAD]`, `[SUCCESS]`). |
| **FIX-05** | **MEDIUM** | System-wide Networking | Vite port collision on `5173` causing CORS rejections on `5174`. | Consolidated: single unified frontend runs on `5173` with Vite proxy; Flask CORS expanded to permit multiple local dev ports. |
| **FIX-06** | **LOW** | `frontend/src/features/image-generation/ImageVisualizer.jsx` | Stubbed Share button had empty `onClick` handler. | Implemented: copies project URL to clipboard via `navigator.clipboard.writeText` with visual feedback. |
| **FIX-07** | **LOW** | `backend/model-generation/generate_model.py` | DXF parser rejected CAD files that used polylines for walls. | Enhanced: added support for `LWPOLYLINE` vertex pairs in addition to `LINE` entities. |

---

## 2. Architectural Decisions Signed Off

1. **Vite React Single Page Application (SPA)**:
   - Selected over React Router SSR to eliminate WebGL hydration mismatches with Three.js.
2. **JavaScript / JSX for Unified Frontend**:
   - Stripped TypeScript annotations, satisfying the user's migration directive while maintaining clean modular code.
3. **Roomify Aesthetic as Global Standard**:
   - Replaced PlanVista3D's dark theme with Roomify's warm `#fdfbf7` palette, serif typography, and orange action accents.
4. **Independent Python / Blender Processing Service**:
   - Kept Flask and headless Blender 5.0 as an autonomous geometry engine on port 5000, proxied via Vite.
5. **Dual-Registry Project Gallery**:
   - Puter KV persists AI render projects; `localStorage` persists 3D CAD model projects, unified in `ProjectGallery.jsx`.

---

## 3. Remaining Operational Limitations

1. **Blender Host Requirement**:
   - Generating 3D CAD meshes requires a local installation of Blender 3.6+ or 5.0. If Blender is not installed, the geometric pipeline cannot execute.
2. **CAD Complexity Thresholds**:
   - Very large CAD drawings (over 10,000 line entities) require considerable CPU extrusion time. A 300-second subprocess timeout is enforced to protect server resources.
3. **Puter Worker Hosting**:
   - AI render project persistence relies on the remote Puter worker at `https://planvista-3d.puter.work`. If offline, projects are not saved to the cloud.
