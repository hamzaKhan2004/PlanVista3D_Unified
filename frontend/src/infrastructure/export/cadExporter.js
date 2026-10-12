import { downloadBlob } from "../utils/utils";
import { getModelDownloadUrl } from "../api/modelApiClient";

/**
 * Downloads the GLB model asset directly from the backend.
 * @param {string} modelFile
 */
export const downloadGlbAsset = async (modelFile) => {
  if (!modelFile) return;
  const downloadUrl = getModelDownloadUrl(modelFile);
  const response = await fetch(downloadUrl);
  if (!response.ok) throw new Error("Failed to download 3D model asset");
  const blob = await response.blob();
  downloadBlob(blob, modelFile);
};

/**
 * Exports the customized CAD project state (including transforms, materials, additions) as a JSON configuration.
 * @param {Object} projectData
 * @param {string} filename
 */
export const exportProjectJson = (projectData, filename = "planvista3d_cad_project.json") => {
  const jsonStr = JSON.stringify(projectData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  downloadBlob(blob, filename);
};
