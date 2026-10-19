import axios from "axios";
import puter from "@heyputer/puter.js";
import { API_BASE_URL } from "../../infrastructure/config/constants";

const MODEL_PROJECTS_STORAGE_KEY = "planvista3d_local_model_projects";

/**
 * Safely extracts the current Puter session authentication token if available.
 * Never logs or persists the token to localStorage.
 */
export const getPuterAuthToken = () => {
  try {
    if (typeof puter === "undefined" || !puter) return null;
    const token = puter.authToken || puter.auth?.token || null;
    return typeof token === "string" && token.trim().length > 0 ? token.trim() : null;
  } catch {
    return null;
  }
};

/**
 * Generates authorization headers with Puter bearer token when available.
 * Preserves custom headers and allows Axios to set multipart boundaries automatically.
 */
export const getAuthHeaders = (customHeaders = {}) => {
  const token = getPuterAuthToken();
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
  return {
    ...authHeader,
    ...customHeaders,
  };
};

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
    headers: getAuthHeaders(),
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
    headers: getAuthHeaders(),
  });

  return response.data;
};

/**
 * Polls the job status for a given task ID.
 */
export const checkTaskStatus = async (taskId) => {
  const response = await axios.get(`${API_BASE_URL}/status/${taskId}`, {
    headers: getAuthHeaders(),
  });
  return response.data; // { status, progress, model_file, analysis, error }
};

/**
 * Returns the download URL for a generated GLB model file.
 */
export const getModelDownloadUrl = (modelFile) => {
  return `${API_BASE_URL}/download/${modelFile}`;
};

/**
 * Retrieves a secure, short-lived presigned download URL for a 3D model.
 * Falls back to local endpoint URL if S3 is unconfigured.
 */
export const getSecureModelUrl = async (taskId) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/project/${taskId}/model-url`, {
      headers: getAuthHeaders(),
    });
    return response.data; // { success: true, url, storage_provider, expires_in, filename }
  } catch (error) {
    console.warn("Secure model URL retrieval notice:", error.response?.data?.error || error.message);
    return null;
  }
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
 * Stores newly generated 2D preview/render images in ImageKit and records metadata in MongoDB.
 */
export const storeRenderedImage = async ({ image, projectId, name }) => {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/images/store-render`,
      {
        image,
        project_id: projectId,
        name,
      },
      {
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
      }
    );
    return response.data; // { success: true, url, file_id, thumbnail_url, asset }
  } catch (error) {
    console.warn("ImageKit rendered image storage notice:", error.response?.data?.error || error.message);
    return null;
  }
};

/**
 * Retrieves ImageKit client upload authorization parameters.
 */
export const getImageKitAuth = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/images/auth`, {
      headers: getAuthHeaders(),
    });
    return response.data;
  } catch (error) {
    console.warn("ImageKit auth fetch notice:", error.response?.data?.error || error.message);
    return null;
  }
};

/**
 * Local project persistence for 3D geometric models.
 * Scoped by authenticated userId to ensure multi-user privacy and prevent cross-account leakage.
 */
export const saveLocalModelProject = (project, userId = null) => {
  try {
    const raw = localStorage.getItem(MODEL_PROJECTS_STORAGE_KEY);
    const existing = raw ? JSON.parse(raw) : [];
    const projectId = project.id || project.taskId || `model_${Date.now()}`;
    const ownerId = userId || project.ownerId || null;
    const payload = {
      ...project,
      id: projectId,
      ownerId,
      timestamp: project.timestamp || Date.now(),
      status: project.status || "completed",
    };
    const updated = [
      payload,
      ...existing.filter(
        (p) => p.id !== projectId && (!project.taskId || p.taskId !== project.taskId)
      ),
    ];
    localStorage.setItem(MODEL_PROJECTS_STORAGE_KEY, JSON.stringify(updated));
    return payload;
  } catch (error) {
    console.error("Failed to save local model project:", error);
    return project;
  }
};

export const getLocalModelProjects = (userId = null) => {
  // If unauthenticated, private models must NOT be exposed
  if (!userId) {
    return [];
  }
  try {
    const data = localStorage.getItem(MODEL_PROJECTS_STORAGE_KEY);
    if (!data) return [];
    const list = JSON.parse(data);
    if (!Array.isArray(list)) return [];
    // Only return projects belonging to this authenticated user or legacy unclaimed items
    return list.filter((p) => !p.ownerId || p.ownerId === userId);
  } catch {
    return [];
  }
};

export const clearLocalModelProjectsCache = () => {
  // Can be used for runtime cache clearing upon logout
};

export const getLocalModelProjectById = (taskId, userId = null) => {
  const all = getLocalModelProjects(userId);
  return all.find((p) => p.taskId === taskId || p.id === taskId) || null;
};

export const deleteLocalModelProject = async (taskId, userId = null) => {
  try {
    const raw = localStorage.getItem(MODEL_PROJECTS_STORAGE_KEY);
    const existing = raw ? JSON.parse(raw) : [];
    const target = existing.find((p) => p.id === taskId || p.taskId === taskId);
    const idToDelete = target?.taskId || taskId;

    // Call backend delete with verified auth headers
    try {
      await axios.delete(`${API_BASE_URL}/project/${idToDelete}`, {
        headers: getAuthHeaders(),
      });
    } catch (e) {
      console.warn("Backend deletion notice:", e);
    }

    const filtered = existing.filter((p) => p.id !== taskId && p.taskId !== taskId);
    localStorage.setItem(MODEL_PROJECTS_STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error("Failed to delete local model project:", error);
    throw error;
  }
};

/**
 * Persists project customization settings and/or edited 3D model geometry to backend storage.
 * Enforces Puter authentication headers.
 */
export const saveProjectCustomization = async (taskId, customization, file = null) => {
  try {
    let response;
    if (file) {
      const formData = new FormData();
      formData.append("customization", typeof customization === "string" ? customization : JSON.stringify(customization));
      formData.append("file", file);
      response = await axios.put(`${API_BASE_URL}/project/${taskId}`, formData, {
        headers: getAuthHeaders(),
      });
    } else {
      response = await axios.put(
        `${API_BASE_URL}/project/${taskId}`,
        { customization },
        { headers: getAuthHeaders({ "Content-Type": "application/json" }) }
      );
    }
    return response.data;
  } catch (error) {
    console.error("Failed to save project customization to backend:", error);
    throw error;
  }
};
