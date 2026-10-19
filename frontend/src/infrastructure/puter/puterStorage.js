/**
 * Unified Puter Storage infrastructure module.
 * Delegates to puter.action.js to ensure consistent caching, owner scoping, and auth checks.
 */
export {
  createProject,
  getProjects,
  getProjectById,
  deleteProject,
  invalidateProjectCache,
} from "../../lib/puter/puter.action";
