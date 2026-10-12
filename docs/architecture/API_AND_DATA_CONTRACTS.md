# API and Data Contracts: Unified PlanVista3D

## 1. Overview

This document specifies the communication contracts, HTTP endpoints, payloads, response schemas, and storage formats of the unified application.

---

## 2. Model-Generation Service (Python Flask)

- **Base URL**: `http://localhost:5000` (Direct) or `http://localhost:5173/api` (via Vite proxy)
- **CORS Allowed Origins**: `http://localhost:5173`, `http://localhost:5174`, `http://localhost:3000`, `http://127.0.0.1:5173`, `http://127.0.0.1:5174` (or configured via `CORS_ORIGIN`)
- **Authentication**: None (Anonymous / Public)

---

### Endpoint: File Upload & Task Creation

- **Route**: `POST /api/upload`
- **Content-Type**: `multipart/form-data`
- **Purpose**: Uploads a blueprint file and queues an asynchronous 3D reconstruction task.

#### Request Form Fields:
| Field Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `file` | File Binary | Yes | None | Blueprint file (`.png`, `.jpg`, `.jpeg`, or `.dxf`). |
| `wall_height` | Float (String)| No | `3.2` | Wall height in meters. |
| `wall_thickness`| Float (String)| No | `0.25` | Wall thickness in meters. |
| `floors` | Integer (String)| No (DXF only)| `3` | Number of building floors to generate. |

#### Success Response (`200 OK`):
```json
{
  "task_id": "934e0155-5959-46a5-a0ed-51d89a132d86",
  "message": "Processing started"
}
```

#### Error Responses:
- `400 Bad Request` (No file uploaded): `{ "error": "No file uploaded" }`
- `400 Bad Request` (Invalid file format): `{ "error": "Invalid file format. Supported: PNG, JPG, JPEG, DXF" }`

---

### Endpoint: Job Status Polling

- **Route**: `GET /api/status/<task_id>`
- **Content-Type**: `application/json`
- **Purpose**: Polls execution progress and retrieves final model metadata.

#### Responses by State:

##### State: Processing
```json
{
  "status": "processing",
  "progress": 40
}
```

##### State: Completed (DXF Pipeline)
```json
{
  "status": "completed",
  "progress": 100,
  "model_file": "934e0155-5959-46a5-a0ed-51d89a132d86_model.glb",
  "analysis": {
    "pipeline": "dxf",
    "model_size_bytes": 1100132,
    "floors": 3,
    "wall_height": 3.2,
    "wall_thickness": 0.25
  }
}
```

##### State: Completed (Image Contour Pipeline)
```json
{
  "status": "completed",
  "progress": 100,
  "model_file": "0c7ede43-89de-44c8-ab31-cc434c7010c2_model.glb",
  "analysis": {
    "pipeline": "image",
    "walls_detected": 9,
    "doors_detected": 0,
    "windows_detected": 0,
    "rooms_detected": 1,
    "model_size_bytes": 452048,
    "scale_factor": 0.015,
    "wall_height": 3.0
  }
}
```

##### State: Error / Not Found
```json
{
  "status": "error",
  "progress": 0,
  "error": "Task not found"
}
```

---

### Endpoint: Model Asset Stream

- **Route**: `GET /api/download/<filename>`
- **Response Content-Type**: `model/gltf-binary` (or binary stream via `send_from_directory`)
- **Purpose**: Serves the compiled `.glb` binary asset for Three.js rendering or local saving.

---

### Endpoint: Health Check

- **Route**: `GET /api/health`
- **Method**: `GET`
- **Success Response (`200 OK`)**:
```json
{
  "status": "healthy",
  "blender_path": "C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe",
  "service": "PlanVista3D Model Generation"
}
```

---

## 3. Puter Serverless Worker API Contracts

- **Base URL**: Configured by `VITE_PUTER_WORKER_URL` (`https://planvista-3d.puter.work`)
- **Invoker**: `puter.workers.exec(url, options)`
- **Authentication**: Evaluates `user?.puter` session injected by Puter runtime.

---

### Endpoint: Save Project

- **Route**: `POST /api/projects/save`
- **Authentication**: Required (`user?.puter.auth.getUser()`)

#### Request Body (`application/json`):
```json
{
  "project": {
    "id": "1741512345678",
    "name": "Residence 1741512345678",
    "sourceImage": "https://roomify-xyz.puter.site/projects/1741512345678/source.png",
    "renderedImage": "https://roomify-xyz.puter.site/projects/1741512345678/rendered.png",
    "timestamp": 1741512345678,
    "ownerId": "user-uuid-1234",
    "isPublic": false
  },
  "visibility": "private"
}
```

---

### Endpoint: List Projects

- **Route**: `GET /api/projects/list`
- **Authentication**: Required
- **Returns**: Array of `DesignItem` objects stored under prefix `planVista3D_project_` in Puter KV.

---

### Endpoint: Get Project by ID

- **Route**: `GET /api/projects/get?id=<id>`
- **Authentication**: Required
- **Returns**: Single `DesignItem` matching project ID.

---

## 4. Local Persistence Contract: 3D CAD Models

Stored in browser `localStorage` under key `planvista3d_local_model_projects`:

```json
[
  {
    "id": "934e0155-5959-46a5-a0ed-51d89a132d86",
    "taskId": "934e0155-5959-46a5-a0ed-51d89a132d86",
    "name": "Banglow Floor Plan",
    "fileName": "banglow_floor_plan.dxf",
    "type": "dxf",
    "floors": 3,
    "wallHeight": 3.2,
    "wallThickness": 0.25,
    "timestamp": 1741512345678,
    "status": "completed"
  }
]
```
This enables newly generated geometric models to appear in the unified project gallery alongside Puter AI renders.
