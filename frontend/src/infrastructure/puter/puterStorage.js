import puter from "@heyputer/puter.js";
import { getOrCreateHostingConfig, uploadImageToHosting } from "./puterHosting";
import { isHostedUrl } from "../utils/utils";
import { PUTER_WORKER_URL } from "../config/constants";

export const createProject = async ({
  item,
  visibility = "private",
}) => {
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

  const payload = {
    ...rest,
    sourceImage: resolvedSource,
    renderedImage: resolvedRender,
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
    return data?.project ?? null;
  } catch (e) {
    console.error("Failed to save project:", e);
    return null;
  }
};

export const getProjects = async () => {
  if (!PUTER_WORKER_URL) {
    console.warn("Missing PUTER_WORKER_URL; skipping project listing.");
    return [];
  }

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
    return Array.isArray(data?.projects) ? data.projects : [];
  } catch (e) {
    console.error("Failed to get projects from Puter:", e);
    return [];
  }
};

export const getProjectById = async ({ id }) => {
  if (!PUTER_WORKER_URL) {
    console.warn("Missing PUTER_WORKER_URL; skipping project fetch.");
    return null;
  }

  try {
    const response = await puter.workers.exec(
      `${PUTER_WORKER_URL}/api/projects/get?id=${encodeURIComponent(id)}`,
      { method: "GET" }
    );

    if (!response.ok) {
      console.error("Failed to fetch project by ID:", await response.text());
      return null;
    }

    const data = await response.json();
    return data?.project ?? null;
  } catch (error) {
    console.error("Failed to fetch project:", error);
    return null;
  }
};
