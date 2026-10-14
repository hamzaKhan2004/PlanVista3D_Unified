import axios from "axios";
import { API_BASE_URL } from "../../infrastructure/config/constants";

const MODEL_PROJECTS_STORAGE_KEY = "planvista3d_local_model_projects";

/**
 * Uploads a blueprint file (DXF or Image) to the Flask processing backend.
 */
export const uploadBlueprint = async ({
  file,
  floors = 3,
  wallHeight = 3.2,
  wallThickness = 0.25,
  vectorAssisted = false,
  vectorData = null,
  targetSize = 28.0,
}) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("wall_height", Number(wallHeight));
  formData.append("wall_thickness", Number(wallThickness));

  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "dxf") {
    formData.append("floors", Number(floors));
  } else if (vectorAssisted) {
    formData.append("vector_assisted", "true");
    formData.append("target_size", Number(targetSize));
    if (vectorData) {
      formData.append("vector_data", JSON.stringify(vectorData));
    }
  }

  const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return response.data; // { task_id, message, pipeline }
};

/**
 * Preprocesses a raster floor plan and extracts clean 2D vector wall geometry for interactive preview.
 */
export const extractVectorGeometry = async ({
  file,
  minWallLength = 25,
  snapRadius = 18.0,
  wallHeight = 3.0,
  wallThickness = 0.25,
  targetSize = 28.0,
}) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("min_wall_length_px", minWallLength);
  formData.append("snap_radius", snapRadius);
  formData.append("wall_height", Number(wallHeight));
  formData.append("wall_thickness", Number(wallThickness));
  formData.append("target_size", Number(targetSize));

  const response = await axios.post(`${API_BASE_URL}/vector-extract`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return response.data;
};

/**
 * Polls the job status for a given task ID.
 */
export const checkTaskStatus = async (taskId) => {
  const response = await axios.get(`${API_BASE_URL}/status/${taskId}`);
  return response.data; // { status, progress, model_file, analysis, error }
};

/**
 * Returns the download URL for a generated GLB model file.
 */
export const getModelDownloadUrl = (modelFile) => {
  return `${API_BASE_URL}/download/${modelFile}`;
};

/**
 * Returns the download URL for the original source blueprint file.
 */
export const getSourceDownloadUrl = (taskId) => {
  return `${API_BASE_URL}/source/${taskId}`;
};

/**
 * Performs a health check on the model generation service.
 */
export const checkModelServiceHealth = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/health`);
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

export const deleteLocalModelProject = async (taskId) => {
  try {
    const existing = getLocalModelProjects();
    const target = existing.find((p) => p.id === taskId || p.taskId === taskId);
    const idToDelete = target?.taskId || taskId;

    // Call backend delete
    try {
      await axios.delete(`${API_BASE_URL}/project/${idToDelete}`);
    } catch (e) {
      console.warn("Backend deletion non-critical error:", e);
    }

    const filtered = existing.filter((p) => p.id !== taskId && p.taskId !== taskId);
    localStorage.setItem(MODEL_PROJECTS_STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error("Failed to delete local model project:", error);
    throw error;
  }
};
