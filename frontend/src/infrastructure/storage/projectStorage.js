import { LOCAL_STORAGE_CAD_PROJECTS_KEY } from "../config/constants";
import { deleteModelBackendTask } from "../api/modelApiClient";

/**
 * Loads all locally saved 3D CAD model projects from localStorage.
 * @returns {Array<Object>}
 */
export const loadModelProjects = () => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CAD_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Failed to read local CAD projects from localStorage:", err);
    return [];
  }
};

/**
 * Saves or updates a 3D CAD model project in localStorage.
 * @param {Object} project
 * @returns {Object} saved project
 */
export const saveModelProject = (project) => {
  try {
    const existing = loadModelProjects();
    const projectId = project.id || project.taskId || `cad_${Date.now()}`;
    const payload = {
      ...project,
      id: projectId,
      timestamp: project.timestamp || Date.now(),
      status: project.status || "completed",
    };

    const index = existing.findIndex(
      (p) => p.id === projectId || (p.taskId && p.taskId === project.taskId)
    );

    if (index >= 0) {
      existing[index] = { ...existing[index], ...payload };
    } else {
      existing.unshift(payload);
    }

    localStorage.setItem(
      LOCAL_STORAGE_CAD_PROJECTS_KEY,
      JSON.stringify(existing)
    );
    return payload;
  } catch (err) {
    console.error("Failed to save local CAD project:", err);
    return project;
  }
};

/**
 * Retrieves a single model project by its ID or Task ID.
 * @param {string} idOrTaskId
 * @returns {Object|null}
 */
export const getModelProjectById = (idOrTaskId) => {
  if (!idOrTaskId) return null;
  const projects = loadModelProjects();
  return (
    projects.find(
      (p) => p.id === idOrTaskId || p.taskId === idOrTaskId
    ) || null
  );
};

/**
 * Updates customization state (colors, transforms, visibility, added objects)
 * for an existing model project in a backward-compatible manner.
 * @param {string} idOrTaskId
 * @param {Object} customizationData
 * @returns {boolean}
 */
export const updateModelProjectCustomization = (idOrTaskId, customizationData) => {
  try {
    const projects = loadModelProjects();
    const index = projects.findIndex(
      (p) => p.id === idOrTaskId || p.taskId === idOrTaskId
    );
    if (index === -1) {
      // If project didn't exist in localStorage, create entry
      saveModelProject({
        id: idOrTaskId,
        taskId: idOrTaskId,
        name: `CAD Project ${idOrTaskId.slice(0, 8)}`,
        customization: customizationData,
        lastModified: Date.now(),
      });
      return true;
    }

    projects[index].customization = customizationData;
    projects[index].lastModified = Date.now();
    localStorage.setItem(
      LOCAL_STORAGE_CAD_PROJECTS_KEY,
      JSON.stringify(projects)
    );
    return true;
  } catch (err) {
    console.error("Failed to update CAD project customization:", err);
    return false;
  }
};

/**
 * Deletes a model project by ID and cleans up its backend files.
 * @param {string} id
 */
export const deleteModelProject = async (id) => {
  try {
    const existing = loadModelProjects();
    const target = existing.find((p) => p.id === id || p.taskId === id);
    const taskIdToDelete = target?.taskId || id;

    // Remove backend artifacts if task ID exists
    if (taskIdToDelete) {
      await deleteModelBackendTask(taskIdToDelete);
    }

    const filtered = existing.filter((p) => p.id !== id && p.taskId !== id);
    localStorage.setItem(
      LOCAL_STORAGE_CAD_PROJECTS_KEY,
      JSON.stringify(filtered)
    );
    return true;
  } catch (err) {
    console.error("Failed to delete CAD project:", err);
    throw err;
  }
};
