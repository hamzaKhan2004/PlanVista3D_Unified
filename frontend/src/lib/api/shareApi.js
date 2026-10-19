import axios from "axios";
import { API_BASE_URL } from "../../infrastructure/config/constants";
import { getAuthHeaders } from "./modelApi";

/**
 * Creates or retrieves an active share token for a 3D CAD model project.
 * Requires user authentication.
 */
export const createOrGetModelShare = async (taskId) => {
  const response = await axios.post(
    `${API_BASE_URL}/share/model/${taskId}`,
    {},
    { headers: getAuthHeaders() }
  );
  return response.data; // { success, share_token, is_active, created_at, expires_at }
};

/**
 * Revokes (deactivates) all public AR share links for a 3D model project.
 * Requires user authentication.
 */
export const revokeModelShare = async (taskId) => {
  const response = await axios.post(
    `${API_BASE_URL}/share/model/${taskId}/revoke`,
    {},
    { headers: getAuthHeaders() }
  );
  return response.data; // { success, message, revoked }
};

/**
 * Checks if a 3D model project currently has an active share link.
 * Requires user authentication.
 */
export const getModelShareStatus = async (taskId) => {
  const response = await axios.get(
    `${API_BASE_URL}/share/model/status/${taskId}`,
    { headers: getAuthHeaders() }
  );
  return response.data; // { success, is_shared, share_token, expires_at }
};

/**
 * Public endpoint to fetch model view details using a share token.
 * Does NOT require authentication headers (allows mobile scanning).
 */
export const getSharedModel = async (shareToken) => {
  const response = await axios.get(`${API_BASE_URL}/share/model/${shareToken}`);
  return response.data; // { success, project_name, model_url, storage_provider, expires_in, is_ar_compatible }
};
