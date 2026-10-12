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

// API Base
export const API_BASE_URL = "/api";

// Supported file extensions
export const SUPPORTED_MODEL_FORMATS = [".dxf", ".png", ".jpg", ".jpeg"];
export const SUPPORTED_IMAGE_FORMATS = [".png", ".jpg", ".jpeg"];
