# API and Data Contracts: Unified PlanVista3D

## 1. Overview

This document specifies the exact communication contracts, HTTP endpoints, payloads, response schemas, and storage formats verified in the codebases.

---

## 2. PlanVista3D Backend API Contracts (Python Flask)

- **Base URL**: `http://localhost:5000` (Direct) or `http://localhost:5173/api` (via Vite proxy)
- **CORS Allowed Origins**: `http://localhost:5173`
- **Authentication**: None (Anonymous / Public)

---

### Endpoint: File Upload & Job Creation

- **Route**: `POST /api/upload`
- **Content-Type**: `multipart/form-data`
- **Purpose**: Uploads a blueprint file and queues a background 3D reconstruction task.

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
- `400 Bad Request` (No file part):
  ```json
  { "error": "No file uploaded" }
  ```
- `400 Bad Request` (Invalid extension):
  ```json
  { "error": "Invalid file" }
  ```

---

### Endpoint: Job Status Polling

- **Route**: `GET /api/status/<task_id>`
- **Content-Type**: `application/json`
- **Purpose**: Polls the execution progress of an asynchronous reconstruction task.

#### Job States:
1. `queued`: Task registered, thread not yet started (`progress: 0`).
2. `processing`: Analysis or Blender subprocess running (`progress: 10` -> `40` -> `50`).
3. `completed`: GLB file produced and verified on disk (`progress: 100`).
4. `error`: Exception thrown or Blender returned non-zero exit code (`progress: 0`).

#### Responses by State:

##### State 1: Queued / Initializing
```json
{
  "status": "queued",
  "progress": 0
}
```

##### State 2: Processing (DXF Pipeline)
```json
{
  "status": "processing",
  "progress": 40
}
```

##### State 3: Completed (DXF Pipeline)
```json
{
  "status": "completed",
  "progress": 100,
  "model_file": "934e0155-5959-46a5-a0ed-51d89a132d86_model.glb",
  "analysis": {
    "pipeline": "dxf",
    "model_size_bytes": 142856,
    "floors": 3,
    "wall_height": 3.2,
    "wall_thickness": 0.25
  }
}
```

##### State 4: Completed (Image Contour Pipeline)
```json
{
  "status": "completed",
  "progress": 100,
  "model_file": "0c7ede43-89de-44c8-ab31-cc434c7010c2_model.glb",
  "analysis": {
    "pipeline": "image",
    "walls_detected": 14,
    "doors_detected": 3,
    "windows_detected": 6,
    "rooms_detected": 1,
    "model_size_bytes": 849312,
    "scale_factor": 0.015,
    "wall_height": 3.2
  }
}
```

##### State 5: Error / Task Not Found
```json
{
  "status": "error",
  "progress": 0,
  "error": "Task not found"
}
```

---

### Endpoint: 3D Model Download / Asset Stream

- **Route**: `GET /api/download/<filename>`
- **Response Content-Type**: `model/gltf-binary` (or binary stream via `send_from_directory`)
- **Purpose**: Retrieves the compiled `.glb` binary asset for Three.js rendering or local saving.

#### Responses:
- `200 OK`: Binary stream of the GLB asset.
- `404 Not Found`:
  ```json
  { "error": "File not found" }
  ```

---

### Endpoint: Health Check

- **Route**: `GET /api/health`
- **Method**: `GET`
- **Success Response (`200 OK`)**:
  ```json
  { "status": "healthy" }
  ```

---

## 3. PlanVistaRoomify Puter Worker API Contracts

- **Base URL**: Configured by `VITE_PUTER_WORKER_URL` (e.g., `https://planvista-3d.puter.work`)
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

#### Success Response (`200 OK`):
```json
{
  "saved": true,
  "id": "1741512345678",
  "project": {
    "id": "1741512345678",
    "name": "Residence 1741512345678",
    "sourceImage": "https://roomify-xyz.puter.site/projects/1741512345678/source.png",
    "renderedImage": "https://roomify-xyz.puter.site/projects/1741512345678/rendered.png",
    "timestamp": 1741512345678,
    "ownerId": "user-uuid-1234",
    "isPublic": false,
    "updatedAt": "2026-10-12T07:30:00.000Z"
  }
}
```

#### Error Responses:
- `401 Unauthorized`:
  ```json
  { "error": "Authentication failed" }
  ```
- `400 Bad Request`:
  ```json
  { "error": "Project ID and source image are required" }
  ```

---

### Endpoint: List Projects

- **Route**: `GET /api/projects/list`
- **Authentication**: Required
- **Purpose**: Lists projects stored under key prefix `planVista3D_project_` in Puter KV.

#### Success Response (`200 OK`):
```json
{
  "projects": [
    {
      "id": "1741512345678",
      "name": "Residence 1741512345678",
      "sourceImage": "https://roomify-xyz.puter.site/projects/1741512345678/source.png",
      "renderedImage": "https://roomify-xyz.puter.site/projects/1741512345678/rendered.png",
      "timestamp": 1741512345678,
      "ownerId": "user-uuid-1234",
      "updatedAt": "2026-10-12T07:30:00.000Z",
      "isPublic": true
    }
  ]
}
```

---

### Endpoint: Get Project by ID

- **Route**: `GET /api/projects/get?id=<id>`
- **Query Parameter**: `id` (String, required)
- **Authentication**: Required

#### Success Response (`200 OK`):
```json
{
  "project": {
    "id": "1741512345678",
    "name": "Residence 1741512345678",
    "sourceImage": "https://roomify-xyz.puter.site/projects/1741512345678/source.png",
    "renderedImage": "https://roomify-xyz.puter.site/projects/1741512345678/rendered.png",
    "timestamp": 1741512345678,
    "ownerId": "user-uuid-1234",
    "updatedAt": "2026-10-12T07:30:00.000Z",
    "isPublic": false
  }
}
```

#### Error Responses:
- `400 Bad Request`: `{ "error": "Project ID is required" }`
- `404 Not Found`: `{ "error": "Project not found" }`

---

## 4. Internal Intermediate Data Schemas

### DXF Intermediate Configuration Schema (`<name>_dxf_config.json`)
```json
{
  "dxf_path": "D:\\blueprint-to-3d\\backend\\uploads\\sample.dxf",
  "target_size": 30.0,
  "wall_height": 3.2,
  "wall_thickness": 0.25,
  "floors": 3,
  "floor_height": 3.5,
  "slab_thickness": 0.3
}
```

### Image Intermediate Analysis Schema (`<name>_analysis.json`)
```json
{
  "image_width": 1024,
  "image_height": 768,
  "scale_factor": 0.015,
  "wall_height": 3.2,
  "walls": [
    {
      "id": "wall_0",
      "vertices": [
        [0.125, 0.850],
        [0.450, 0.850],
        [0.450, 0.830],
        [0.125, 0.830]
      ],
      "thickness": 0.01
    }
  ],
  "doors": [
    {
      "id": "door_0",
      "center": [0.250, 0.840],
      "width": 0.050,
      "height": 0.020,
      "area_px": 800
    }
  ],
  "windows": [
    {
      "id": "window_0",
      "center": [0.380, 0.840],
      "width": 0.080,
      "height": 0.015,
      "area_px": 600
    }
  ],
  "rooms": [
    {
      "id": "room_0",
      "bounds": {
        "x": 0.100,
        "y": 0.150,
        "width": 0.600,
        "height": 0.700
      },
      "center": [0.400, 0.500]
    }
  ]
}
```
