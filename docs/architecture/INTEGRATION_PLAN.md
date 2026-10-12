# Incremental Integration Plan: Unified PlanVista3D

> [!NOTE]
> This roadmap is a **phased proposal** for long-term architectural consolidation. It is designed to be executed incrementally, ensuring working software is maintained at every stage. **No phase will be executed without prior authorization.**

---

## Roadmap Overview

```
Phase 0: Audit & Baseline Verification [COMPLETED]
   │
   ▼
Phase 1: Architecture & Technology Stack Decisions
   │
   ▼
Phase 2: Common Project & Data Contracts Design
   │
   ▼
Phase 3: Unified Frontend Shell & Navigation
   │
   ├──> Phase 4: Integrate 2D AI Image Generation (Roomify)
   │
   └──> Phase 5: Integrate 3D Geometric Reconstruction (PlanVista3D)
         │
         ▼
Phase 6: Shared 3D Asset & Comparison Viewer
   │
   ▼
Phase 7: Unified Project Persistence & Storage
   │
   ▼
Phase 8: Hardening, Performance & Deployment
```

---

## Phase 0: Repository Audit & Baseline Verification (Completed)
- **Status**: Completed.
- **Deliverables**: Comprehensive audit of both repositories, technology stacks, schemas, workflows, and 12 architecture reference documents in `docs/architecture/`.
- **Exit Criteria**: All source code, dependencies, and configuration verified without modifying application files.

---

## Phase 1: Decide Unified Architecture & Target Technology Stack
- **Dependencies**: Phase 0 audit findings.
- **Key Decisions Needed**:
  1. *Frontend Strategy*: Decide between React Router v7 SSR Framework vs. Vite React 19 Client SPA. (Recommended: Vite SPA for reliable WebGL/Three.js support).
  2. *Language Standard*: Decide on timeline for TSX-to-JSX migration vs. keeping TypeScript.
  3. *Backend Strategy*: Decide whether the Python Flask server remains a standalone service or is orchestrated alongside a Node.js API gateway.
  4. *Authentication Policy*: Decide whether Puter OAuth is mandatory or optional (guest mode with local processing).
- **Deliverables**: Architecture Decision Records (ADRs) signed off by the team.
- **Risks**: Indecision on SSR vs. SPA causing rework later.
- **Acceptance Criteria**: Approved architectural blueprint documenting chosen runtimes, framework modes, and auth strategy.

---

## Phase 2: Design Common Project & Asset Contracts
- **Dependencies**: Phase 1 architectural sign-off.
- **Scope**:
  - Unify the concept of a "Project". A project should store both:
    1. Input floor plan (DXF or Image)
    2. 2D AI Render visual (PNG URL)
    3. 3D Geometric Mesh model (GLB asset path)
    4. Procedural metadata (wall height, thickness, floor count, contour analysis)
- **Deliverables**: TypeScript/JSON schemas for unified `Project`, `Asset`, and `TaskState` models.
- **Risks**: Schema rigidity failing to accommodate future model types.
- **Acceptance Criteria**: Both 2D render and 3D GLB metadata can coexist in a single JSON document without schema validation errors.

---

## Phase 3: Unify Frontend Shell & Global Navigation
- **Dependencies**: Phase 2 data models.
- **Scope**:
  - Establish a single frontend repository root (e.g., standardizing on Vite React 19 with Tailwind CSS v4).
  - Implement a global header/navbar featuring:
    - Mode Switcher: "AI Visualizer" vs. "3D Geometric CAD".
    - Unified project gallery displaying both 2D renders and 3D thumbnails.
    - Global authentication status indicator.
- **Deliverables**: Unified landing page and route structure.
- **Risks**: CSS style collisions between Roomify's warm editorial theme and PlanVista3D's dark CAD theme.
- **Acceptance Criteria**: User can navigate between pages without full page reloads or style bleeding.

---

## Phase 4: Integrate 2D AI Image Generation (Roomify)
- **Dependencies**: Phase 3 frontend shell.
- **Scope**:
  - Port `lib/ai.action.ts`, `lib/constants.ts`, and Puter SDK integrations into the unified frontend.
  - Implement the drag-and-drop floor plan uploader and before-and-after slider visualizer.
  - Enable optional guest generation if Puter credentials can be scoped per-client.
- **Deliverables**: Functional 2D AI visualization pipeline operating within the unified shell.
- **Risks**: Puter rate limits or CORS restrictions on newly hosted domain names.
- **Acceptance Criteria**: Uploading a PNG produces a photorealistic top-down render with interactive wipe slider.

---

## Phase 5: Integrate 3D Geometric Reconstruction (PlanVista3D)
- **Dependencies**: Phase 3 frontend shell.
- **Scope**:
  - Wire frontend upload forms to Flask backend `/api/upload`.
  - Refactor backend file paths: eliminate hardcoded machine paths (`C:\Program Files\Blender...` and `C:\Users\Hamza Khan...`) in favor of dynamic environment configuration (`BLENDER_PATH`, `PYTHONPATH`).
  - Implement parameter inputs (wall height, thickness, floors) with immediate client validation.
- **Deliverables**: Portable Python backend service capable of running on any developer machine with Blender installed.
- **Risks**: Blender path misconfiguration on host machines.
- **Acceptance Criteria**: Uploading a DXF or image successfully triggers headless Blender and outputs a validated GLB.

---

## Phase 6: Build Shared 3D Asset Viewer & Editor
- **Dependencies**: Phase 5 GLB generation.
- **Scope**:
  - Integrate Three.js / React Three Fiber canvas from `Advanced3DEditor.jsx` into the unified visualizer.
  - Implement tabbed viewing:
    - Tab 1: **2D Before/After AI Render Slider**
    - Tab 2: **Interactive 3D Geometric Mesh (Three.js)**
  - Retain camera presets, wireframe mode, and mesh color overrides.
- **Deliverables**: Comprehensive visualizer screen capable of displaying both output paradigms.
- **Risks**: High GPU/memory consumption when running both WebGL canvas and high-resolution comparison sliders on mobile devices.
- **Acceptance Criteria**: User can inspect the 2D visual render and then toggle to the 3D model in the same browser session.

---

## Phase 7: Unify Project Persistence & Asset Storage
- **Dependencies**: Phases 4, 5, and 6.
- **Scope**:
  - Replace ephemeral in-memory dictionary `processing_status` in Flask with a persistent database (e.g., MongoDB, SQLite, PostgreSQL, or Puter KV).
  - Persist GLB models and 2D render images to a unified storage provider (local disk or S3/Puter Cloud Hosting).
  - Implement automated cleanup for temporary uploads and expired processing tasks.
- **Deliverables**: Persistent project database with durable UUID records.
- **Risks**: Large GLB file storage costs and bandwidth constraints.
- **Acceptance Criteria**: Projects persist across backend and frontend server restarts.

---

## Phase 8: Hardening, Performance, Security & Deployment
- **Dependencies**: Phases 1–7.
- **Scope**:
  - Remove all hardcoded API keys (e.g., OpenRouter key in `blueprint_to_3d.py`).
  - Configure production Docker container orchestrating both Node client and Python/Blender workers (or separate container services via Docker Compose).
  - Add unit and integration tests for OpenCV contour analysis and Three.js canvas mounting.
- **Deliverables**: Docker Compose deployment manifest, automated CI test suite, and production operational runbook.
- **Risks**: Docker image size containing Blender 5.0 and Python CV libraries (can exceed 2GB).
- **Acceptance Criteria**: Full system builds cleanly in Docker and passes end-to-end regression tests.
