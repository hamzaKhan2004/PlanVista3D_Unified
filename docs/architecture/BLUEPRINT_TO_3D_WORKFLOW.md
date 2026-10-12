# Detailed Workflow: PlanVista3D

## 1. Overview & Pipeline Scope

**PlanVista3D** is a geometric CAD and image reconstruction pipeline. It ingests either standard 2D raster floor-plan images (PNG, JPG, JPEG) or vector AutoCAD files (DXF) and programmatically reconstructs a fully textured, dimensional 3D architectural mesh model in glTF binary format (`.glb`).

The generated `.glb` file is loaded directly into the browser via a WebGL canvas powered by Three.js, React Three Fiber, and Drei, enabling 360-degree orbit, pan, zoom, mesh selection, color manipulation, category toggling, and file export.

---

## 2. End-to-End Pipeline Sequence

```
[User Selects File in frontend/src/components/Upload.jsx]
       │
       ▼ (Validates format: .dxf, .png, .jpg, .jpeg)
[Parameters: floors (DXF), wallHeight (m), wallThickness (m)]
       │
       ▼ (Axios POST /api/upload -> Proxied to Flask :5000)
[app.py: upload_file() creates UUID task_id]
       │
       ├──> Saves file to uploads/<task_id>_<filename>
       ├──> Spawns threading.Thread(process_blueprint_async)
       └──> Returns { task_id, message: "Processing started" }
                 │
                 ▼
[Frontend navigates to /viewer/:taskId and polls /api/status/:taskId every 2s]
                 │
  ┌──────────────┴───────────────────────────────┐
  │                                              │
  ▼ [If File is .dxf]                            ▼ [If File is .png / .jpg]
[DXF Pipeline]                                 [Raster Image Pipeline]
1. create_analysis_from_dxf()                 1. OpenCV create_analysis_from_blueprint()
   Builds JSON config with target size,          - Grayscale conversion & Gaussian blur
   floors, wall height, wall thickness           - Adaptive thresholding & Morph Close/Open
2. Saves <name>_dxf_config.json                 - findContours & approxPolyDP
3. Subprocess: blender.exe                       - Classify walls, doors, windows, rooms
   --background --python generate_model.py       - Saves <name>_analysis.json
   -- <config.json> <output.glb>              2. Subprocess: blender.exe
4. Blender execution:                            --background --python generate_model_image.py
   - ezdxf parses LINE entities                  -- <analysis.json> <output.glb>
   - bmesh extrudes wall loops                3. Blender execution:
   - Floor slab cube added & scaled              - Builds 3D curves with bevel & extrude
   - Multi-floor duplication loops               - Maps wood_floor2.jpg texture with UV unwrap
   - Applies WallDark Principled BSDF            - Adds box proxies for doors/windows
   - bpy.ops.export_scene.gltf(GLB)              - bpy.ops.export_scene.gltf(GLB)
  │                                              │
  └──────────────┬───────────────────────────────┘
                 │
                 ▼
[outputs/<task_id>_model.glb created]
                 │
                 ▼
[Worker updates processing_status[task_id] -> status: "completed"]
                 │
                 ▼
[Frontend detects "completed" -> fetches /api/download/<task_id>_model.glb]
                 │
                 ▼
[Advanced3DEditor.jsx renders 3D Canvas via useGLTF]
                 │
                 ▼
[Interactive Controls: Orbit, Mesh Hierarchy, Color Overrides, Wireframe, Download]
```

---

## 3. Subsystem Breakdown & Source Responsibilities

### A. Python Backend Server (`app.py`)
- **Location**: [backend/app.py](file:///d:/Mern%20Projects/PlanVist3D/PlanVista3D/backend/app.py)
- **Role**: API Gateway, parameter validation, asynchronous job manager, and image contour extractor.
- **Key Functions**:
  1. `allowed_file(filename)`: Validates extension against `{"png", "jpg", "jpeg", "dxf"}`.
  2. `create_analysis_from_blueprint(image_path, ...)`:
     - Reads image in grayscale via `cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)`.
     - Applies `cv2.GaussianBlur` followed by `cv2.adaptiveThreshold` (`ADAPTIVE_THRESH_MEAN_C`, `THRESH_BINARY_INV`).
     - Performs morphological closing and opening to connect broken wall strokes.
     - Detects contours with `cv2.findContours(morph, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)`.
     - Approximates polygon lines via `cv2.approxPolyDP`.
     - Classifies bounding rectangles: contours with specific aspect ratios and small areas become `doors` or `windows`; other larger loops become `walls`.
     - Normalizes all $(X, Y)$ coordinates to $[0, 1]$ relative to image dimensions.
  3. `create_analysis_from_dxf(dxf_path, ...)`:
     - Assembles target size ($30.0$m default), wall height, wall thickness, floor count, floor height ($3.5$m), and slab thickness ($0.3$m).
  4. `process_blueprint_async(task_id, input_path, output_path, ...)`:
     - Runs in a background daemon thread.
     - Resolves Blender binary at `C:\Program Files\Blender Foundation\Blender 5.0\blender.exe` or falls back to system PATH.
     - Invokes headless Blender subprocess with a 300-second timeout.
     - Updates in-memory dictionary `processing_status[task_id]`.
  5. HTTP Routes:
     - `POST /api/upload`: Ingests multipart files, extracts `floors`, `wall_height`, and `wall_thickness`.
     - `GET /api/status/<task_id>`: Returns task state, percentage progress, analysis metrics, and model filename.
     - `GET /api/download/<filename>`: Serves the binary `.glb` model from `outputs/`.
     - `GET /api/health`: Health-check probe.

---

### B. CAD Vector Extrusion Script (`generate_model.py`)
- **Location**: [backend/generate_model.py](file:///d:/Mern%20Projects/PlanVist3D/PlanVista3D/backend/generate_model.py)
- **Execution**: `blender.exe --background --python generate_model.py -- <config.json> <output.glb>`
- **Geometry Generation Steps**:
  1. `sys.path.append(...)`: Injects user Python site-packages to ensure `ezdxf` is importable inside Blender's internal Python interpreter.
  2. `clear_scene()`: Deletes default cubes, lights, and orphan meshes.
  3. `ezdxf.readfile(dxf_path)`: Iterates through modelspace entities where `e.dxftype() == "LINE"`.
  4. For each line between $p_1$ and $p_2$:
     - Calculates perpendicular normal vector $n = (-d_y, d_x, 0) \times (\text{wall\_thickness} / 2)$.
     - Constructs a 4-vertex quad face in `bmesh` (`v1, v2, v3, v4`).
  5. Centering & Normalization: Centers all vertices around the origin $(0, 0, 0)$ and auto-scales geometry so the bounding dimension equals `target_size` ($30$m default).
  6. Wall Extrusion: Uses `bpy.ops.mesh.extrude_region_move` along the Z-axis by `wall_height`.
  7. Floor Slab: Adds a tightly bounded primitive cube (`FloorSlab`) scaled to the bounding box $(S_x, S_y)$ with thickness `slab_thickness`.
  8. Multi-Floor Duplication: Duplicates wall objects and floor slabs along the Z-axis:
     $$\Delta Z = i \times \text{floor\_height}$$
  9. Material Setup: Creates Principled BSDF material (`WallDark`, dark charcoal `(0.1, 0.1, 0.1)`, roughness `0.7`).
  10. Lighting & Camera: Adds a Sun light (energy 4) and an isometric-style camera at $(25, -25, 25)$.
  11. Export: Calls `bpy.ops.export_scene.gltf(filepath=output_path, export_format="GLB", export_apply=True)`.

---

### C. Raster Image Extrusion Script (`generate_model_image.py`)
- **Location**: [backend/generate_model_image.py](file:///d:/Mern%20Projects/PlanVist3D/PlanVista3D/backend/generate_model_image.py)
- **Execution**: `blender.exe --background --python generate_model_image.py -- <analysis.json> <output.glb>`
- **Geometry & Texturing Steps**:
  1. Loads JSON produced by OpenCV containing normalized vertices for walls, doors, windows, and rooms.
  2. `create_wall()`:
     - Instantiates a 3D Blender curve (`bpy.data.curves.new(name, "CURVE")`).
     - Adds a cyclic `POLY` spline using the $(X, Y)$ vertices mapped to real-world scale:
       $$X = (n_x - 0.5) \cdot w \cdot \text{scale}, \quad Y = (0.5 - n_y) \cdot h \cdot \text{scale}$$
     - Sets `bevel_depth` to wall thickness and `extrude` to `wall_height`.
     - Converts curve to mesh (`bpy.ops.object.convert(target="MESH")`) and runs `smart_project` UV unwrapping.
  3. `create_box()`: Creates primitive cubes representing door frames and window glass proxies at detected centers.
  4. `create_floor()`: Creates a floor mesh connecting room bounding corners with UV unwrapping.
  5. Materials Applied:
     - `wall_material()`: Procedural procedural noise texture with bump mapping (strength 0.2, off-white `0.88, 0.88, 0.88`).
     - `floor_material()`: Image texture node loading `textures/wood_floor2.jpg` mapped with a $6 \times 6$ UV scale.
     - `door_material()`: Warm brown Principled BSDF (`0.55, 0.32, 0.15`).
     - `window_material()`: Light blue transmission glass (`0.7, 0.85, 1.0`, transmission 1.0, roughness 0.05).
  6. Scene Lighting: Adds a Sun light (energy 4.5) and an Area light (energy 700).
  7. Export: Exports to binary `.glb`.

---

### D. Standalone Prototype Script (`blueprint_to_3d.py`)
- **Location**: [backend/blueprint_to_3d.py](file:///d:/Mern%20Projects/PlanVist3D/PlanVista3D/backend/blueprint_to_3d.py)
- **Role**: Experimental prototype evaluating Vision LLMs for floor-plan parsing.
- **Workflow**: Sends a blueprint image URL to OpenRouter API (`allenai/molmo-2-8b:free`), prompting the model to output structured JSON with walls, doors, windows, and rooms, then calls Blender.
- **Current State**: Not imported or invoked by `app.py`. Contains a hardcoded OpenRouter API key that must be secured.

---

### E. Frontend Three.js Viewer & 3D Editor
- **Source Files**: 
  - [frontend/src/pages/ViewerPage.jsx](file:///d:/Mern%20Projects/PlanVist3D/PlanVista3D/frontend/src/pages/ViewerPage.jsx)
  - [frontend/src/components/Advanced3DEditor.jsx](file:///d:/Mern%20Projects/PlanVist3D/PlanVista3D/frontend/src/components/Advanced3DEditor.jsx)
  - [frontend/src/components/Viewer3D.jsx](file:///d:/Mern%20Projects/PlanVist3D/PlanVista3D/frontend/src/components/Viewer3D.jsx)
- **Viewer Capabilities**:
  - **Asset Loading**: Uses `@react-three/drei`'s `useGLTF('/api/download/:model')` within a React `Suspense` boundary.
  - **Interactive Selection**: Uses Three.js raycasting via R3F `onClick` events. Hovering highlights meshes with emissive grey; selecting applies an emissive blue glow (`0x0066ff`).
  - **Mesh Color Customization**: Allows dynamically overriding mesh colors (walls, doors, floors).
  - **Visibility Filtering**: Toggles category-wide visibility (hide/show all walls, doors, windows, or rooms).
  - **Wireframe Mode**: Toggles wireframe rendering across all meshes.
  - **Camera Controls**: Imperative camera control via `OrbitControls`:
    - Top View: $(0, 25, 0)$ looking at $(0, 0, 0)$.
    - Front View: $(0, 5, 25)$ looking at $(0, 0, 0)$.
    - Side View: $(25, 5, 0)$ looking at $(0, 0, 0)$.
    - Reset View: $(15, 15, 15)$.
  - **Dynamic Object Addition**: Can programmatically instantiate and insert new wall meshes into the scene at runtime.
  - **Screenshot Capture**: Extracts canvas buffer via `gl.domElement.toDataURL("image/png")` and downloads a timestamped PNG.
  - **Model Download**: Triggers a binary download of the source `.glb` file.

---

## 4. Current Limitations of PlanVista3D

1. **In-Memory Task Management**: `processing_status` in `app.py` is an in-memory dictionary. If Flask restarts, all active and historical task statuses are erased.
2. **DXF Primitive Limitations**: `generate_model.py` only extracts `LINE` entities from the DXF modelspace. `LWPOLYLINE`, `POLYLINE`, `ARC`, `CIRCLE`, and 3D solids are ignored.
3. **OpenCV Contour Heuristics**: The image contour pipeline relies on hardcoded thresholds (e.g., `min_wall_area = 400`, aspect ratio > 1.5 for doors). Noisy blueprints with text annotations or faint lines can produce inaccurate wall geometry.
4. **Hardcoded Machine Paths**:
   - `backend/app.py`: Hardcoded path `C:\Program Files\Blender Foundation\Blender 5.0\blender.exe`.
   - `backend/generate_model.py`: Hardcoded Python site-packages path `C:\Users\Hamza Khan\AppData\Roaming\Python\Python311\site-packages`.
5. **No File Cleanup**: Uploaded blueprints in `uploads/` and generated models in `outputs/` are never purged, resulting in unbounded disk usage over time.
