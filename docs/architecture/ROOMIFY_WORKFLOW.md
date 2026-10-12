# Detailed Workflow: PlanVistaRoomify

## 1. Overview & Workflow Scope

**PlanVistaRoomify** is a 2D floor-plan enhancement application. It takes a flat 2D architectural blueprint or drawing (in raster formats such as PNG, JPG, or WEBP) and synthesizes a **photorealistic, top-down 2D architectural rendering** that simulates three-dimensional depth, shadows, daylighting, and furniture arrangements.

> [!IMPORTANT]
> **OUTPUT CLARIFICATION**: PlanVistaRoomify produces a **2D raster image** (`.png` / Data URL). It does **NOT** generate a geometric 3D mesh, OBJ, GLTF, or vertex model. The output visual simulates depth via shading and lighting, but cannot be orbited, tilted, or manipulated as 3D geometry.

---

## 2. Step-by-Step Execution Lifecycle

```
[User Visits /]
       │
       ▼
[Puter Auth Check in app/root.tsx]
       │
       ▼ (Must be signed in to enable upload dropzone)
[User Drops Floor Plan in components/Upload.tsx]
       │
       ▼ (FileReader converts to Base64 data URL)
[handleUploadComplete in app/routes/home.tsx]
       │
       ├──> 1. createProject() saves initial item (sourceImage only) to Puter Worker / KV
       │
       └──> 2. navigate('/visualizer/:id', { state: { initialImage, name } })
                 │
                 ▼
[Visualizer Route in app/routes/visualizer.$id.tsx]
       │
       ├──> 3. getProjectById({ id }) loads project from Puter Worker
       │
       ├──> 4. runGeneration() triggers generate3DViews({ sourceImage }) in lib/ai.action.ts
       │          │
       │          ▼
       │     [puter.ai.txt2img(ROOMIFY_RENDER_PROMPT, { input_image, ratio })]
       │          │
       │          ▼
       │     [Returns 2D rendered image URL/Blob]
       │
       ├──> 5. Uploads rendered image to Puter Hosting (projects/:id/rendered.png)
       │
       ├──> 6. Updates project metadata in Puter Worker / KV
       │
       └──> 7. Mounts ReactCompareSlider (Before: sourceImage | After: renderedImage)
                 │
                 ▼
[User Exports Image or Browses Saved Community Projects]
```

---

## 3. Subsystem Implementation Details

### A. Authentication & Session Initialization
- **Source Files**: [app/root.tsx](file:///d:/Mern%20Projects/PlanVist3D/PlanVistaRoomify/app/root.tsx#L56-L95), [components/Navbar.tsx](file:///d:/Mern%20Projects/PlanVist3D/PlanVistaRoomify/components/Navbar.tsx#L6-L26), [lib/puter.action.ts](file:///d:/Mern%20Projects/PlanVist3D/PlanVistaRoomify/lib/puter.action.ts#L9-L19)
- **Mechanism**:
  - `app/root.tsx` defines a top-level `AuthState` (`isSignedIn`, `userName`, `userId`).
  - On mount, `useEffect` executes `refreshAuth()` which calls `getCurrentUser()` from `lib/puter.action.ts` (`puter.auth.getUser()`).
  - Exposes an `AuthContext` through React Router's `<Outlet context={{ ...authState, refreshAuth, signIn, signOut }} />`.
  - In `components/Navbar.tsx`, clicking "Log In" executes `puter.auth.signIn()`, opening Puter's OAuth modal.

### B. Image Upload & Preprocessing
- **Source Files**: [components/Upload.tsx](file:///d:/Mern%20Projects/PlanVist3D/PlanVistaRoomify/components/Upload.tsx#L37-L86), [lib/constants.ts](file:///d:/Mern%20Projects/PlanVist3D/PlanVistaRoomify/lib/constants.ts#L12-L18)
- **Validation**:
  - Drag-and-drop or file input accepts: `.jpg, .jpeg, .png, .webp`. Maximum stated size: 50MB.
  - **Hard Gate**: If `isSignedIn` is false, `disabled={!isSignedIn}` locks the input element and shows "Sign In or Sign Up with Puter to upload".
- **Processing**:
  - Reads selected file via browser `FileReader.readAsDataURL(selectedFile)`.
  - Simulates an upload progress bar using a `setInterval` ticker (`PROGRESS_INCREMENT = 15`, `PROGRESS_INTERVAL_MS = 100`).
  - Upon reaching 100%, invokes the `onComplete(base64)` callback after a delay of `REDIRECT_DELAY_MS` (600ms).

### C. Project Creation & Initial Hosting
- **Source Files**: [app/routes/home.tsx](file:///d:/Mern%20Projects/PlanVist3D/PlanVistaRoomify/app/routes/home.tsx#L22-L63), [lib/puter.action.ts](file:///d:/Mern%20Projects/PlanVist3D/PlanVistaRoomify/lib/puter.action.ts#L21-L104), [lib/puter.hosting.ts](file:///d:/Mern%20Projects/PlanVist3D/PlanVistaRoomify/lib/puter.hosting.ts#L12-L72)
- **Execution**:
  - `home.tsx` generates a unique timestamp-based ID (`Date.now().toString()`) and project name (`Residence <id>`).
  - Calls `createProject({ item: newItem, visibility: "private" })`.
  - `createProject`:
    1. Obtains or creates a Puter subdomain (`getOrCreateHostingConfig()` creates `roomify-<timestamp>-<rand>.puter.site`).
    2. Uploads the raw base64 source image to Puter filesystem via `puter.fs.write('projects/<id>/source.<ext>', uploadFile)`.
    3. Resolves the public hosted URL (`https://roomify-*.puter.site/projects/<id>/source.png`).
    4. Posts the project payload to the Puter Worker endpoint:
       `POST ${PUTER_WORKER_URL}/api/projects/save` via `puter.workers.exec`.
  - Navigates immediately to `/visualizer/:newId`.

### D. Prompt Engineering & AI Image Generation
- **Source Files**: [lib/ai.action.ts](file:///d:/Mern%20Projects/PlanVist3D/PlanVistaRoomify/lib/ai.action.ts#L21-L48), [lib/constants.ts](file:///d:/Mern%20Projects/PlanVist3D/PlanVistaRoomify/lib/constants.ts#L29-L58)
- **API Invocation**:
  ```typescript
  const response = await puter.ai.txt2img(ROOMIFY_RENDER_PROMPT, {
    input_image: base64Data,
    input_image_mime_type: mimeType,
    ratio: { w: 1024, h: 1024 },
  });
  ```
- **Prompt Specifications (`ROOMIFY_RENDER_PROMPT`)**:
  - **Constraint 1 (Text Removal)**: Remove all dimensions, labels, room titles, numbers.
  - **Constraint 2 (Geometry Preservation)**: Walls, rooms, doors, and windows must strictly follow blueprint lines without shifting.
  - **Constraint 3 (Camera Angle)**: Orthographic top-down only. No perspective tilt.
  - **Constraint 4 (Clean Photorealism)**: High-clarity daylight, crisp edges, realistic materials (wood, tile, stone).
  - **Constraint 5 (Furniture Synthesis)**: Automatically synthesizes 3D-looking furnishings based on floor plan layout (beds with duvets, sofas, kitchen sinks and stoves, bathroom fixtures, study desks).
- **Return Value**: Returns an `HTMLImageElement` containing the synthesized image `src` URL or base64 string.

### E. Visualizer & Before/After Comparison
- **Source Files**: [app/routes/visualizer.$id.tsx](file:///d:/Mern%20Projects/PlanVist3D/PlanVistaRoomify/app/routes/visualizer.$id.tsx#L129-L238)
- **UI Architecture**:
  - Displays project title (`Residence <id>`) and status badges.
  - While generating: Displays an animated loader overlay with a spinning icon and "Generating your 3D visualization".
  - Upon completion:
    - Left Panel: Displays the full rendered image.
    - Right Panel: Embeds `ReactCompareSlider` with draggable divider handle (50% default split):
      - `itemOne`: Original floor plan (`sourceImage`).
      - `itemTwo`: Synthesized architectural rendering (`renderedImage`).
  - Export: `handleExport()` creates an invisible `<a>` element with `href=currentImage`, downloading `rendered_image.png`.
  - Sharing: `Share2` button is rendered in the top bar but contains an empty callback `onClick={() => {}}`.

### F. Persistence Layer
- **Source Files**: [lib/puter.worker.js](file:///d:/Mern%20Projects/PlanVist3D/PlanVistaRoomify/lib/puter.worker.js#L22-L119)
- **Database Model**:
  - Stored in Puter KV with key `planVista3D_project_<id>`.
  - Schema:
    ```typescript
    {
      id: string;
      name: string;
      sourceImage: string;        // Hosted URL on puter.site
      renderedImage?: string;      // Hosted URL on puter.site
      timestamp: number;
      ownerId: string;
      updatedAt: string;          // ISO Date string
      isPublic: boolean;
    }
    ```
- **Project Listing**:
  - `GET /api/projects/list` executes `userPuter.kv.list('planVista3D_project_', true)`.
  - Normalizes the result into an array of `DesignItem` objects displayed on the home page under "Projects".

---

## 4. Current Limitations of PlanVistaRoomify

1. **Authentication Requirement**: Users cannot try the application without authenticating via a third-party Puter account.
2. **Fixed Prompt Parameters**: Prompt tuning, room style selection (e.g., minimalist, modern, industrial), or material selection are hardcoded in `constants.ts`; the user cannot configure styles in the UI.
3. **2D Representation Only**: The output cannot be imported into CAD or 3D software for spatial planning.
4. **Puter Worker Dependency**: Relies on a hosted worker at `VITE_PUTER_WORKER_URL="https://planvista-3d.puter.work"`. If the worker is offline, project history and saving fail silently.
5. **Share Feature Incomplete**: UI displays a "Share" button, but no sharing link generation or permission update logic is implemented.
