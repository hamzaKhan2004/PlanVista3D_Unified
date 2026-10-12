# Unified PlanVista3D — Technical Architecture & Integration Reference

> [!NOTE]
> **UNIFIED IMPLEMENTATION COMPLETE**: As of October 2026, the unified PlanVista3D application has been successfully established and verified in `frontend/`, `backend/model-generation/`, and `workers/puter/`. The original source directories (`PlanVistaRoomify/` and `PlanVista3D/`) are preserved intact as regression references.

---

## Executive Summary

This documentation repository serves as the definitive technical reference for the unified PlanVista3D architectural visualization platform. The application unifies two complementary generation pipelines into a single coherent user experience:

1. **Pipeline A (AI Image Visualization)**: Takes 2D floor plans (PNG/JPG/WEBP) and generates photorealistic, top-down 3D visual renders via Puter's generative AI infrastructure (`puter.ai.txt2img`). Includes Puter authentication, Puter Hosting asset storage, Puter KV project persistence, and before-and-after slider comparisons.
2. **Pipeline B (Geometric 3D CAD/Mesh Generation)**: Converts architectural blueprints (DXF CAD vector files and raster floor plan images) into interactive, authentic geometric 3D mesh models (`.glb`) via a Python Flask API, OpenCV contour analysis, headless Blender 5.0 procedural extrusion, and an interactive Three.js / React Three Fiber CAD viewer.

---

## Documentation Navigation Map

The documentation package is modularized into 12 dedicated technical documents:

| # | Document | Primary Scope & Focus | Target Audience |
|---|---|---|---|
| 01 | [README.md](./README.md) | Documentation index, navigation roadmap, and executive status. | All Developers & Agents |
| 02 | [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) | Product vision, functional boundaries, 2D render vs. 3D geometry distinctions, and strategic goals. | Product Leads & Engineers |
| 03 | [TECH_STACK.md](./TECH_STACK.md) | Comprehensive audit of frameworks, libraries, runtime engines, dependency versions, and conflicts. | Full-stack Engineers |
| 04 | [CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md) | File layouts, entry points, responsibilities, runtime boundaries, and Mermaid architecture diagrams. | Systems Architects |
| 05 | [ROOMIFY_WORKFLOW.md](./ROOMIFY_WORKFLOW.md) | End-to-end trace of PlanVistaRoomify: UI, Puter AI prompt, Puter hosting, KV persistence, and visualizer. | Frontend & AI Engineers |
| 06 | [BLUEPRINT_TO_3D_WORKFLOW.md](./BLUEPRINT_TO_3D_WORKFLOW.md) | End-to-end trace of PlanVista3D: OpenCV heuristics, DXF parsing, Blender scripts, and GLB export. | 3D & Graphics Engineers |
| 07 | [API_AND_DATA_CONTRACTS.md](./API_AND_DATA_CONTRACTS.md) | Exact HTTP specifications, schemas, Puter Worker routes, Flask endpoints, and GLB asset structures. | Backend & Integration Devs |
| 08 | [ENVIRONMENT_AND_SETUP.md](./ENVIRONMENT_AND_SETUP.md) | Prerequisites, installation, local dev commands, environment variables, Blender linking, and secrets. | DevOps & Local Developers |
| 09 | [INTEGRATION_PLAN.md](./INTEGRATION_PLAN.md) | Step-by-step phased unification roadmap (Phases 0–8), dependencies, deliverables, risks, and acceptance criteria. | Technical Project Managers |
| 10 | [TSX_TO_JSX_MIGRATION.md](./TSX_TO_JSX_MIGRATION.md) | Comprehensive evaluation of migrating Roomify from TSX/TS to JSX, risk analysis, route typegen implications, and strategy. | Frontend Engineers |
| 11 | [KNOWN_ISSUES_AND_DECISIONS.md](./KNOWN_ISSUES_AND_DECISIONS.md) | Confirmed bugs, hardcoded paths, port collisions, architectural trade-offs, and decisions requiring approval. | Lead Architects & User |
| 12 | [FILE_REFERENCE_INDEX.md](./FILE_REFERENCE_INDEX.md) | Navigable inventory of all important source files across both repositories with classification and disposition. | Pair Programmers & Agents |

---

## How to Navigate This Documentation

When working with future AI assistants or onboarding developers:
- **To understand what the systems do**: Read [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) and [CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md).
- **To understand the AI image workflow**: Read [ROOMIFY_WORKFLOW.md](./ROOMIFY_WORKFLOW.md).
- **To understand the Blender geometric pipeline**: Read [BLUEPRINT_TO_3D_WORKFLOW.md](./BLUEPRINT_TO_3D_WORKFLOW.md).
- **To review API endpoints or payloads**: Consult [API_AND_DATA_CONTRACTS.md](./API_AND_DATA_CONTRACTS.md).
- **To spin up either application independently**: Follow [ENVIRONMENT_AND_SETUP.md](./ENVIRONMENT_AND_SETUP.md).
- **To prepare for the TSX-to-JSX transition**: Review [TSX_TO_JSX_MIGRATION.md](./TSX_TO_JSX_MIGRATION.md).
- **To execute the incremental merge**: Follow [INTEGRATION_PLAN.md](./INTEGRATION_PLAN.md).

---

## Active Workspace Layout (Unified Architecture)

```
d:/Mern Projects/PlanVist3D/
├── frontend/                          <-- Unified React 19 + Vite + Tailwind v4 SPA (Port 5173)
│   ├── src/
│   │   ├── app/                       <-- App.jsx, Home.jsx, routes.jsx
│   │   ├── components/layout/         <-- Navbar.jsx, AppLayout.jsx
│   │   ├── components/ui/             <-- Button.jsx (Roomify editorial primitives)
│   │   ├── components/projects/       <-- ProjectCard.jsx (dual-mode badge card)
│   │   ├── features/image-generation/ <-- UploadFloorPlan.jsx, ImageVisualizer.jsx
│   │   ├── features/model-generation/ <-- UploadBlueprint.jsx, ModelViewer.jsx, Advanced3DEditor.jsx
│   │   ├── features/project-gallery/  <-- ProjectGallery.jsx (unified catalog)
│   │   ├── lib/                       <-- puter.action.js, modelApi.js, ai.action.js, utils.js
│   │   ├── styles/                    <-- index.css (Roomify palette, @theme tokens)
│   │   └── main.jsx
│   ├── vite.config.js                 <-- Vite config with /api proxy to Flask port 5000
│   └── package.json
├── backend/
│   └── model-generation/             <-- Independent Python Flask + Blender Service (Port 5000)
│       ├── app.py                     <-- Flask REST API, OpenCV contour analysis, multi-CORS
│       ├── generate_model.py          <-- Blender 5.0 DXF line & polyline procedural extrusion
│       ├── generate_model_image.py    <-- Blender 5.0 image contour extrusion & texturing
│       ├── blueprint_to_3d.py         <-- Secured prototype (reads OPENROUTER_API_KEY from env)
│       ├── requirements.txt           <-- Flask, flask-cors, opencv-python, numpy, ezdxf
│       ├── uploads/ & outputs/        <-- Transient file directories
│       └── textures/                  <-- wood_floor2.jpg texture asset
├── workers/
│   └── puter/
│       └── puter.worker.js            <-- Puter Cloud Serverless Worker (/api/projects router)
├── docs/
│   └── architecture/                  <-- Technical architecture documentation
├── .env.example                       <-- Safe configuration template
├── README.md                          <-- Master unified repository documentation
│
├── PlanVista3D/                       <-- Preserved reference implementation
└── PlanVistaRoomify/                  <-- Preserved reference implementation
```
