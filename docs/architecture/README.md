# Unified PlanVista3D — Technical Audit & Architecture Documentation Package

> [!WARNING]
> **READ-ONLY AUDIT NOTICE**: This documentation reflects the current state of the workspace as of October 2026. The proposed unified architecture and migration plans described herein are **proposals only** and have **NOT** been implemented. No source files, dependencies, configurations, or Git histories were modified during this audit.

---

## Executive Summary

This documentation repository serves as the definitive technical reference for unifying two complementary architectural visualization codebases currently housed in the same workspace:

1. **Project A (`PlanVistaRoomify`)**: A React Router v7 (SSR) full-stack web application that takes 2D floor plans (PNG/JPG/WEBP) and converts them into photorealistic, top-down 3D architectural visual render images via Puter's generative AI infrastructure (`puter.ai.txt2img`). It includes user authentication, project persistence in Puter KV/Cloud Storage, project listing, and a before-and-after slider comparison.
2. **Project B (`PlanVista3D`)**: A client-server system comprising a Vite React SPA with Three.js / React Three Fiber (`@react-three/fiber`, `@react-three/drei`) and a Python Flask backend. It converts blueprints (DXF CAD files and 2D floor plan images) into authentic geometric 3D mesh models (`.glb`) via OpenCV contour analysis and headless Blender 5.0 automation (`generate_model.py` and `generate_model_image.py`).

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

## Workspace Layout at Audit Time

```
d:/Mern Projects/PlanVist3D/
├── docs/
│   └── architecture/              <-- This documentation package
├── PlanVista3D/                   <-- Geometric 3D Pipeline & React Three Fiber Viewer
│   ├── Blueprint Img/             <-- Test blueprints (DXF CAD and raster images)
│   ├── backend/                   <-- Flask API, OpenCV, Blender generation scripts
│   ├── frontend/                  <-- React 19 + Vite + Three.js + Tailwind v4
│   └── imp.txt                    <-- Reference Blender DXF generator addon script
└── PlanVistaRoomify/              <-- AI Generative 2D-to-3D Visualizer
    ├── app/                       <-- React Router v7 routes (SSR) & styles
    ├── components/                <-- UI components (Navbar, Upload, Button)
    ├── lib/                       <-- Puter SDK integrations, actions, worker script
    ├── public/                    <-- Static assets
    ├── Dockerfile                 <-- Multi-stage production container build
    ├── react-router.config.ts     <-- React Router v7 SSR configuration
    ├── tsconfig.json              <-- TypeScript 5 configuration
    └── vite.config.ts             <-- Vite 7 + Tailwind 4 + React Router plugin
```
