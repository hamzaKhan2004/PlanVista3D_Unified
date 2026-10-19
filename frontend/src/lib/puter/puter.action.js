import puter from "@heyputer/puter.js";
import {
  getOrCreateHostingConfig,
  uploadImageToHosting,
} from "./puter.hosting";
import { isHostedUrl } from "../utils/utils";
import { PUTER_WORKER_URL } from "../utils/constants";
import {
  isSignedIn,
  getCurrentUser,
  signIn,
  signOut,
} from "../../infrastructure/puter/puterAuth";

export { signIn, signOut, getCurrentUser, isSignedIn };

// Lightweight in-memory cache for projects to prevent redundant requests
let _projectsCache = null;
let _projectsCacheTimestamp = 0;
let _inFlightProjectsPromise = null;
const CACHE_TTL_MS = 15000; // 15 seconds

export const invalidateProjectCache = () => {
  _projectsCache = null;
  _projectsCacheTimestamp = 0;
  _inFlightProjectsPromise = null;
};

export const createProject = async ({
  item,
  visibility = "private",
}) => {
  if (!isSignedIn()) {
    console.warn("User must be signed in to create and save a Puter project.");
    return null;
  }
  if (!PUTER_WORKER_URL) {
    console.warn("Missing PUTER_WORKER_URL; skipping remote project save.");
    return null;
  }
  const projectId = item.id;

  const hosting = await getOrCreateHostingConfig();

  const hostedSource = projectId
    ? await uploadImageToHosting({
        hosting,
        url: item.sourceImage,
        projectId,
        label: "source",
      })
    : null;

  const hostedRender =
    projectId && item.renderedImage
      ? await uploadImageToHosting({
          hosting,
          url: item.renderedImage,
          projectId,
          label: "rendered",
        })
      : null;

  const resolvedSource =
    hostedSource?.url ||
    (isHostedUrl(item.sourceImage) ? item.sourceImage : "");

  if (!resolvedSource) {
    console.warn("Failed to host source image, skipping save.");
    return null;
  }

  const resolvedRender = hostedRender?.url
    ? hostedRender?.url
    : item.renderedImage && isHostedUrl(item.renderedImage)
      ? item.renderedImage
      : undefined;

  const {
    sourcePath: _sourcePath,
    renderedPath: _renderedPath,
    publicPath: _publicPath,
    ...rest
  } = item;

  const user = await getCurrentUser();
  const payload = {
    ...rest,
    ownerId: user?.uuid || item.ownerId || undefined,
    ownerUsername: user?.username || undefined,
    sourceImage: resolvedSource,
    renderedImage: resolvedRender,
    visibility,
  };

  try {
    const response = await puter.workers.exec(
      `${PUTER_WORKER_URL}/api/projects/save`,
      {
        method: "POST",
        body: JSON.stringify({
          project: payload,
          visibility,
        }),
      }
    );

    if (!response.ok) {
      console.error("Failed to save project to Puter worker:", await response.text());
      return null;
    }

    const data = await response.json();
    invalidateProjectCache();
    return data?.project ?? null;
  } catch (e) {
    console.error("Failed to save project:", e);
    return null;
  }
};

export const getProjects = async ({ forceRefresh = false } = {}) => {
  // CRITICAL: If the user is unauthenticated, do NOT call puter.workers.exec.
  // This completely eliminates the unwanted Puter sign-in popup!
  if (!isSignedIn()) {
    return [];
  }

  if (!PUTER_WORKER_URL) {
    console.warn("Missing PUTER_WORKER_URL; skipping project listing.");
    return [];
  }

  const now = Date.now();
  if (!forceRefresh && _projectsCache && (now - _projectsCacheTimestamp < CACHE_TTL_MS)) {
    return _projectsCache;
  }

  if (_inFlightProjectsPromise) {
    return await _inFlightProjectsPromise;
  }

  _inFlightProjectsPromise = (async () => {
    try {
      const response = await puter.workers.exec(
        `${PUTER_WORKER_URL}/api/projects/list`,
        { method: "GET" }
      );

      if (!response.ok) {
        console.error("Failed to fetch project history:", await response.text());
        return [];
      }

      const data = await response.json();
      const list = Array.isArray(data?.projects) ? data.projects : [];
      _projectsCache = list;
      _projectsCacheTimestamp = Date.now();
      return list;
    } catch (e) {
      console.error("Failed to get projects from Puter:", e);
      return [];
    } finally {
      _inFlightProjectsPromise = null;
    }
  })();

  return await _inFlightProjectsPromise;
};

export const getProjectById = async ({ id }) => {
  if (!id) return null;
  if (!PUTER_WORKER_URL) {
    console.warn("Missing PUTER_WORKER_URL; skipping project fetch.");
    return null;
  }

  try {
    // If not signed in, pass x-puter-no-auth so worker exec doesn't pop up auth dialog
    const headers = {};
    if (!isSignedIn()) {
      headers["x-puter-no-auth"] = "true";
    }

    const response = await puter.workers.exec(
      `${PUTER_WORKER_URL}/api/projects/get?id=${encodeURIComponent(id)}`,
      { method: "GET", headers }
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        console.warn(`Project ${id} is private or requires authentication.`);
      } else {
        console.error("Failed to fetch project by ID:", await response.text());
      }
      return null;
    }

    const data = await response.json();
    return data?.project ?? null;
  } catch (error) {
    console.error("Failed to fetch project:", error);
    return null;
  }
};

export const deleteProject = async ({ id }) => {
  if (!id) throw new Error("Project ID is required for deletion");

  // Attempt 1: Call worker endpoint if worker URL is available
  if (PUTER_WORKER_URL) {
    try {
      const response = await puter.workers.exec(
        `${PUTER_WORKER_URL}/api/projects/delete`,
        {
          method: "POST",
          body: JSON.stringify({ id }),
        }
      );

      if (response.ok) {
        invalidateProjectCache();
        return true;
      }
      console.warn("Worker delete call did not return 200, trying direct KV fallback:", await response.text());
    } catch (workerErr) {
      console.warn("Worker delete exec error, trying direct KV fallback:", workerErr);
    }
  }

  // Attempt 2: Direct Puter KV deletion
  try {
    const user = await getCurrentUser();
    const userKey = user?.uuid ? `planVista3D_user_${user.uuid}_project_${id}` : null;
    const legacyKey = `planVista3D_project_${id}`;

    if (userKey) {
      if (puter?.kv?.del) await puter.kv.del(userKey);
      else if (puter?.kv?.delete) await puter.kv.delete(userKey);
      else if (puter?.kv?.set) await puter.kv.set(userKey, null);
    }

    if (puter?.kv?.del) await puter.kv.del(legacyKey);
    else if (puter?.kv?.delete) await puter.kv.delete(legacyKey);
    else if (puter?.kv?.set) await puter.kv.set(legacyKey, null);

    invalidateProjectCache();
    return true;
  } catch (kvErr) {
    console.error("Direct Puter KV deletion failed:", kvErr);
    throw kvErr;
  }
};
