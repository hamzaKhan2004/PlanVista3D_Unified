# Known Issues, Risks & Architectural Decisions

## 1. Confirmed Issues & Defects (Verified from Source Code)

The following bugs, security vulnerabilities, and brittle configurations were confirmed during the codebase audit:

| # | Severity | Location | Defect Description & Evidence | Impact |
|---|---|---|---|---|
| **01** | **CRITICAL (Security)** | `PlanVista3D/backend/blueprint_to_3d.py` (Line 7) | **Hardcoded API Key**: An active or historical OpenRouter API key (`sk-or-v1-2143...`) is committed in plain text. | High security exposure; key must be revoked and replaced with environment variables. |
| **02** | **HIGH (Portability)** | `PlanVista3D/backend/generate_model.py` (Line 3) | **Hardcoded User System Path**: `sys.path.append(r"C:\Users\Hamza Khan\AppData\Roaming\Python\Python311\site-packages")`. | DXF generation crashes on any machine other than the original author's computer where this path does not exist. |
| **03** | **HIGH (Portability)** | `PlanVista3D/backend/app.py` (Line 199) | **Hardcoded Blender Installation Path**: `blender_path = r"C:\Program Files\Blender Foundation\Blender 5.0\blender.exe"`. | Fails on Linux, macOS, or systems where Blender is installed on another drive or in standard PATH. |
| **04** | **MEDIUM (Networking)** | `PlanVista3D/backend/app.py` (Line 13) | **Hardcoded CORS Origin**: `CORS(app, origins=["http://localhost:5173"])`. | If both frontend dev servers are launched simultaneously, the second server runs on port 5174, causing all browser API requests to fail with CORS errors. |
| **05** | **MEDIUM (State)** | `PlanVista3D/backend/app.py` (Line 26) | **In-Memory Job State**: `processing_status = {}` stores all task IDs in a volatile Python dictionary. | Restarting the Flask server causes active and historical task lookups (`/api/status/:id`) to return "Task not found". |
| **06** | **MEDIUM (UX/Auth)** | `PlanVistaRoomify/components/Upload.tsx` (Line 100) | **Strict Auth Gate on Upload**: `disabled={!isSignedIn}` completely blocks file selection unless logged into Puter. | Prevents anonymous testing, demos, or guest exploration. |
| **07** | **LOW (Incomplete UI)**| `PlanVistaRoomify/app/routes/visualizer.$id.tsx` (Line 159) | **Stubbed Share Action**: The "Share" button has an empty callback `onClick={() => {}}`. | Clicking "Share" in Roomify visualizer performs no action. |
| **08** | **LOW (CAD Parsing)** | `PlanVista3D/backend/generate_model.py` (Line 41) | **Entity Filter**: `if e.dxftype() != "LINE": continue`. | Blueprint files created with `LWPOLYLINE`, `POLYLINE`, `ARC`, or `SPLINE` entities will fail to render walls or produce empty 3D models. |
| **09** | **LOW (Disk Bloat)** | `PlanVista3D/backend/uploads/` & `outputs/` | **No Storage Purge Policy**: Files saved to `uploads/` and `outputs/` are never cleaned up. | Unbounded disk growth over extended usage. |

---

## 2. Potential Issues Requiring Further Verification

1. **Blender Subprocess Timeout**:
   - `subprocess.run(..., timeout=300)` terminates jobs after 5 minutes. While adequate for test blueprints, dense production CAD drawings with complex topology may trigger timeouts on low-power machines.
2. **OpenCV Contour False Positives**:
   - `create_analysis_from_blueprint()` uses contour area and aspect ratios to differentiate doors from windows. In low-contrast floor plans or plans with decorative textures (such as rug patterns or bathroom tile lines), OpenCV may incorrectly identify furniture as structural walls.
3. **Puter Worker Rate Limits**:
   - `lib/ai.action.ts` relies on Puter's free/hosted tier for `puter.ai.txt2img`. High-concurrency usage or large batch submissions may hit Puter cloud rate limits.

---

## 3. Existing Inherent Limitations

- **Roomify Output**: Generates only a flat 2D raster image (`.png`). Cannot be converted to 3D geometry without running through the PlanVista3D pipeline.
- **PlanVista3D Output**: Generates raw 3D mesh geometry (`.glb`), but lacks photorealistic rendering (lighting is basic WebGL shaders; materials are simple solid colors and tiling textures).

---

## 4. Key Architectural Decisions Matrix

```
+---------------------------------------------------------------------------------------------------------+
|                                    ARCHITECTURAL DECISIONS MATRIX                                       |
+------------------------------+---------------------------+----------------------------------------------+
| Decision Topic               | Options Evaluated         | Trade-offs & Recommendation                  |
+------------------------------+---------------------------+----------------------------------------------+
| 1. Frontend Runtime Model    | A. React Router v7 SSR    | Option B is recommended. Three.js canvases   |
|                              | B. Vite React 19 SPA      | require browser DOM and WebGL context. SSR  |
|                              |                           | adds hydration complexity with no WebGL gain.|
|                              |                           |                                              |
| 2. Language Standard         | A. Retain TypeScript      | Option B was requested by user for Roomify.  |
|                              | B. Migrate to JSX/JS      | Option A provides compile-time safety, but   |
|                              |                           | Option B aligns with user's long-term plan.  |
|                              |                           |                                              |
| 3. Backend Architecture      | A. Single Flask Service   | Option B is recommended. Node/Express handles|
|                              | B. Dual Services (Node +  | auth, projects, and Puter proxy; Python      |
|                              |    Flask Python)          | handles heavy OpenCV and Blender processing. |
|                              |                           |                                              |
| 4. Persistence Layer         | A. Puter Cloud KV         | Option B or C recommended for full offline   |
|                              | B. Local SQLite / JSON    | capability; Option A for seamless web cloud. |
|                              | C. MongoDB / PostgreSQL   |                                              |
+------------------------------+---------------------------+----------------------------------------------+
```

---

## 5. Decisions Requiring User Approval Before Next Phase

Before starting Phase 1 of the integration plan, the user must provide decisions on the following questions:

1. **Frontend Architecture Choice**: Do you prefer to keep the unified application as a **Vite React Single Page Application (SPA)**, or as a **React Router v7 SSR** application?
2. **TSX-to-JSX Timing**: Should the TSX-to-JSX conversion be performed *before* unifying the frontends, or *after* the unified frontend shell is created?
3. **Authentication Strategy**: Should the unified app require Puter login for all features, or should it offer an **Anonymous / Guest Mode** for local 3D blueprint processing?
4. **Backend Placement**: Should the Python Flask server remain an independent microservice on port 5000, or would you like to introduce an Express.js API gateway to manage both pipelines?
