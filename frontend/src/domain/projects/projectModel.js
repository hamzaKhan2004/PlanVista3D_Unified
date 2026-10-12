/**
 * Domain entity model and backward-compatibility normalizer for projects.
 */

export const PROJECT_TYPES = {
  IMAGE_2D: "image_2d",
  MODEL_3D: "model_3d",
};

/**
 * Normalizes project records from various sources (Puter KV or localStorage).
 * Handles backwards-compatibility for existing projects that lack new CAD customization metadata.
 * @param {Object} raw
 * @returns {Object} normalized project entity
 */
export const normalizeProject = (raw) => {
  if (!raw) return null;

  const isModel = !!(raw.taskId || raw.model_file || raw.fileName || raw.type === "dxf" || raw.type === "model_3d");

  if (isModel) {
    const id = raw.id || raw.taskId || `cad_${Date.now()}`;
    const taskId = raw.taskId || id;
    const name = raw.name || (raw.fileName ? `CAD: ${raw.fileName}` : `Model ${id.slice(0, 8)}`);

    return {
      id,
      taskId,
      name,
      fileName: raw.fileName || "",
      type: PROJECT_TYPES.MODEL_3D,
      subType: raw.type || "cad",
      floors: raw.floors || 1,
      wallHeight: raw.wallHeight || 3.2,
      wallThickness: raw.wallThickness || 0.25,
      timestamp: raw.timestamp || Date.now(),
      status: raw.status || "completed",
      modelFile: raw.model_file || raw.modelFile || (taskId ? `${taskId}_model.glb` : null),
      analysis: raw.analysis || null,
      // Backward-compatible customization metadata with defaults
      customization: raw.customization || {
        overrides: {},
        dynamicObjects: {
          walls: [],
          doors: [],
          windows: [],
          rooms: [],
        },
      },
      lastModified: raw.lastModified || raw.timestamp || Date.now(),
    };
  }

  // 2D Puter AI Image Project
  return {
    id: raw.id || String(Date.now()),
    name: raw.name || "Untitled Residence",
    type: PROJECT_TYPES.IMAGE_2D,
    sourceImage: raw.sourceImage || "",
    renderedImage: raw.renderedImage || "",
    timestamp: raw.timestamp || Date.now(),
    ownerId: raw.ownerId || "",
    isPublic: !!raw.isPublic,
    lastModified: raw.lastModified || raw.timestamp || Date.now(),
  };
};

/**
 * Creates a brand new 3D CAD project structure.
 */
export const createCadProject = ({
  taskId,
  name,
  fileName,
  type = "cad",
  floors = 3,
  wallHeight = 3.2,
  wallThickness = 0.25,
  modelFile = null,
  analysis = null,
  customization = null,
}) => {
  return normalizeProject({
    id: taskId,
    taskId,
    name: name || `Residence ${Date.now()}`,
    fileName: fileName || "",
    type,
    floors,
    wallHeight,
    wallThickness,
    model_file: modelFile,
    analysis,
    customization,
    timestamp: Date.now(),
    status: "completed",
  });
};
