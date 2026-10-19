// Application-wide configuration and constants

export const ROOMIFY_RENDER_PROMPT = `
Professional architectural photography, photorealistic modern interior visualization, 
high-end luxury design, clean lines, natural ambient lighting, 8k resolution, 
detailed architectural floor plan transformed into a realistic furnished space. 
Top-down isometric architectural rendering, highly detailed textures, wood floors, 
warm ambient daylight through large windows, modern minimal aesthetic.
`.trim();

// Default Puter Serverless Worker endpoint (overridden by VITE_PUTER_WORKER_URL if present)
export const DEFAULT_PUTER_WORKER_URL = "https://planvista-3d.puter.work";
export const PUTER_WORKER_URL = import.meta.env.VITE_PUTER_WORKER_URL || DEFAULT_PUTER_WORKER_URL;

// LocalStorage Persistence Keys
export const LOCAL_STORAGE_CAD_PROJECTS_KEY = "planvista3d_local_model_projects";
export const LOCAL_STORAGE_CAD_HISTORY_KEY = "planvista3d_cad_history";

// Polling and Timing Constants
export const POLL_INTERVAL_MS = 1500;
export const MAX_POLL_ATTEMPTS = 120; // 3 minutes timeout

// API Base URL (configurable via VITE_API_BASE_URL for decoupled production deployment)
const rawApiBase = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "/api"
).trim().replace(/\/+$/, "");

// Normalize API base URL: ensure it routes to '/api' matching the backend blueprint route prefix
export const API_BASE_URL = !rawApiBase || rawApiBase === "/api"
  ? "/api"
  : rawApiBase.endsWith("/api")
  ? rawApiBase
  : `${rawApiBase}/api`;

// Supported file extensions
export const SUPPORTED_MODEL_FORMATS = [".dxf", ".png", ".jpg", ".jpeg"];
export const SUPPORTED_IMAGE_FORMATS = [".png", ".jpg", ".jpeg"];

/**
 * Canonical public frontend origin for share links and QR codes.
 * Respects VITE_PUBLIC_URL or VITE_APP_URL if defined,
 * falls back to window.location.origin in browser,
 * and defaults to production deployment URL (https://planvista3d.onrender.com).
 */
export const getPublicFrontendOrigin = () => {
  const envUrl = (
    import.meta.env.VITE_PUBLIC_URL ||
    import.meta.env.VITE_APP_URL ||
    ""
  ).trim().replace(/\/+$/, "");
  if (envUrl) return envUrl;
  if (typeof window !== "undefined" && window.location && window.location.origin) {
    return window.location.origin;
  }
  return "https://planvista3d.onrender.com";
};
