import axios from "axios";

const MODEL_PROJECTS_STORAGE_KEY = "planvista3d_local_model_projects";

/**
 * Uploads a blueprint file (DXF or Image) to the Flask processing backend.
 */
export const uploadBlueprint = async ({ file, floors = 3, wallHeight = 3.2, wallThickness = 0.25 }) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("wall_height", Number(wallHeight));
  formData.append("wall_thickness", Number(wallThickness));

  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "dxf") {
    formData.append("floors", Number(floors));
  }

  const response = await axios.post("/api/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return response.data; // { task_id, message }
};

/**
 * Polls the job status for a given task ID.
 */
export const checkTaskStatus = async (taskId) => {
  const response = await axios.get(`/api/status/${taskId}`);
  return response.data; // { status, progress, model_file, analysis, error }
};

/**
 * Returns the download URL for a generated GLB model file.
 */
export const getModelDownloadUrl = (modelFile) => {
  return `/api/download/${modelFile}`;
};

/**
 * Performs a health check on the model generation service.
 */
export const checkModelServiceHealth = async () => {
  try {
    const response = await axios.get("/api/health");
    return response.data;
  } catch (error) {
    return { status: "unreachable", error: error.message };
  }
};

/**
 * Local project persistence for 3D geometric models.
 */
export const saveLocalModelProject = (project) => {
  try {
    const existing = getLocalModelProjects();
    const updated = [project, ...existing.filter((p) => p.id !== project.id)];
    localStorage.setItem(MODEL_PROJECTS_STORAGE_KEY, JSON.stringify(updated));
    return project;
  } catch (error) {
    console.error("Failed to save local model project:", error);
    return project;
  }
};

export const getLocalModelProjects = () => {
  try {
    const data = localStorage.getItem(MODEL_PROJECTS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const getLocalModelProjectById = (taskId) => {
  const all = getLocalModelProjects();
  return all.find((p) => p.taskId === taskId || p.id === taskId) || null;
};
