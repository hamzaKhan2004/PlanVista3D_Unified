import axios from "axios";
import { API_BASE_URL } from "../config/constants";

/**
 * Uploads a blueprint file (DXF, PNG, JPG) to the Flask backend.
 * @param {File} file
 * @param {Object} options { floors, wall_height, wall_thickness }
 * @returns {Promise<{ task_id: string, message: string }>}
 */
export const uploadBlueprint = async (file, options = {}) => {
  const formData = new FormData();
  formData.append("file", file);

  if (options.floors !== undefined) formData.append("floors", options.floors);
  if (options.wall_height !== undefined) formData.append("wall_height", options.wall_height);
  if (options.wall_thickness !== undefined) formData.append("wall_thickness", options.wall_thickness);

  const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
};

/**
 * Polls the current processing status of a 3D reconstruction task.
 * @param {string} taskId
 * @returns {Promise<{ status: string, progress: number, model_file?: string, analysis?: object, error?: string }>}
 */
export const checkTaskStatus = async (taskId) => {
  const response = await axios.get(`${API_BASE_URL}/status/${taskId}`);
  return response.data;
};

/**
 * Returns the download URL for a generated GLB model.
 * @param {string} filename
 * @returns {string}
 */
export const getModelDownloadUrl = (filename) => {
  if (!filename) return "";
  return `${API_BASE_URL}/download/${filename}`;
};

/**
 * Returns the download URL for the original source blueprint file.
 * @param {string} taskId
 * @returns {string}
 */
export const getSourceDownloadUrl = (taskId) => {
  if (!taskId) return "";
  return `${API_BASE_URL}/source/${taskId}`;
};

/**
 * Fetches the raw binary blob for a model file.
 * @param {string} filename
 * @returns {Promise<Blob>}
 */
export const fetchModelBlob = async (filename) => {
  const response = await axios.get(getModelDownloadUrl(filename), {
    responseType: "blob",
  });
  return response.data;
};

/**
 * Checks backend health and Blender status.
 * @returns {Promise<{ status: string, blender_path: string, service: string }>}
 */
export const checkBackendHealth = async () => {
  const response = await axios.get(`${API_BASE_URL}/health`);
  return response.data;
};

/**
 * Deletes a backend task and its exclusively owned files.
 * @param {string} taskId
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
export const deleteModelBackendTask = async (taskId) => {
  if (!taskId) return { success: true };
  try {
    const response = await axios.delete(`${API_BASE_URL}/project/${taskId}`);
    return response.data;
  } catch (err) {
    console.warn(`Backend project deletion failed for task ${taskId}:`, err);
    // Don't crash if task had no backend files, but rethrow if server error
    return { success: false, error: err.message };
  }
};
