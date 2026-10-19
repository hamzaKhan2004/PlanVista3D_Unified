import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Layers,
  SlidersHorizontal,
  FolderOpen,
  Upload,
  CheckCircle2,
  Sparkles,
  FileText,
  Trash2,
  AlertTriangle,
  Loader2,
  X,
  SplitSquareVertical,
  ChevronLeft,
  ChevronRight,
  Box,
} from "lucide-react";
import CadToolbar from "../../presentation/cad/CadToolbar";
import CadPropertiesPanel from "../../presentation/cad/CadPropertiesPanel";
import SceneHierarchyPanel from "../../presentation/cad/SceneHierarchyPanel";
import DimensionOverlay from "../../presentation/cad/DimensionOverlay";
import SourceBlueprintPanel from "../../presentation/cad/SourceBlueprintPanel";
import ArScannerModal from "../../presentation/cad/ArScannerModal";
import CadViewport from "./CadViewport";
import Button from "../../presentation/ui/Button";
import Modal from "../../presentation/ui/Modal";
import LoadingSpinner from "../../presentation/ui/LoadingSpinner";
import ErrorMessage from "../../presentation/ui/ErrorMessage";
import EmptyState from "../../presentation/ui/EmptyState";
import {
  checkTaskStatus,
  getModelDownloadUrl,
} from "../../infrastructure/api/modelApiClient";
import { getSecureModelUrl, saveProjectCustomization } from "../../lib/api/modelApi";
import {
  loadModelProjects,
  getModelProjectById,
  updateModelProjectCustomization,
  saveModelProject,
  deleteModelProject,
} from "../../infrastructure/storage/projectStorage";
import {
  downloadGlbAsset,
  exportProjectJson,
} from "../../infrastructure/export/cadExporter";
import {
  CommandManager,
  ColorChangeCommand,
  MaterialPropertyCommand,
  TransformChangeCommand,
  VisibilityChangeCommand,
  AddElementCommand,
  DeleteElementCommand,
  BatchColorChangeCommand,
  BatchMaterialPropertyCommand,
  BatchVisibilityChangeCommand,
  BatchDeleteElementsCommand,
} from "../../domain/cad/cadCommand";
import {
  CAMERA_PRESETS,
  TRANSFORM_MODES,
  DEFAULT_DIMENSIONS,
} from "../../domain/cad/cadTypes";

const CadEditorPage = () => {
  const { taskId: routeTaskId } = useParams();
  const navigate = useNavigate();

  const [activeTaskId, setActiveTaskId] = useState(routeTaskId || null);
  const [modelProject, setModelProject] = useState(null);
  const [loading, setLoading] = useState(Boolean(routeTaskId));
  const [error, setError] = useState("");
  const [saveSuccessMsg, setSaveSuccessMsg] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showArScannerModal, setShowArScannerModal] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [deleteProjectError, setDeleteProjectError] = useState("");
  const [showCompareOverlay, setShowCompareOverlay] = useState(false);

  // Collapsible side panels state: default closed on mobile (<1024px) for full 3D viewport, open on desktop (>=1024px)
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(
    () => (typeof window !== "undefined" ? window.innerWidth >= 1024 : true)
  );
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(
    () => (typeof window !== "undefined" ? window.innerWidth >= 1024 : true)
  );
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 1024
  );

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Object deletion confirmation state (Req 3)
  const [objectToDelete, setObjectToDelete] = useState(null);
  const [showDeleteElementModal, setShowDeleteElementModal] = useState(false);

  // Editor viewport settings
  const [transformMode, setTransformMode] = useState(TRANSFORM_MODES.SELECT);
  const [cameraPreset, setCameraPreset] = useState(CAMERA_PRESETS.PERSPECTIVE);
  const [isDrawingWall, setIsDrawingWall] = useState(false);
  const [editorState, setEditorState] = useState({
    showGrid: true,
    showWireframe: false,
    showBlueprintOverlay: true,
    blueprintOpacity: 0.65,
    wallsVisible: true,
    doorsVisible: true,
    windowsVisible: true,
    roomsVisible: true,
  });

  // Scene elements state
  const [dynamicObjects, setDynamicObjects] = useState({
    walls: [],
    doors: [],
    windows: [],
    rooms: [],
    custom: [],
  });

  const [selectedObject, setSelectedObject] = useState(null);
  const [selectedObjects, setSelectedObjects] = useState([]);
  const [elementsToDelete, setElementsToDelete] = useState([]);
  const [commandManager] = useState(() => new CommandManager());
  const [commandState, setCommandState] = useState(commandManager.getState());

  const selectedObjectIds = useMemo(
    () => selectedObjects.map((o) => o.id),
    [selectedObjects]
  );

  const viewportRef = useRef(null);
  const nextIdCounter = useRef(1);

  // Development-only diagnostic logging helper (never logs query strings or presigned tokens)
  const sanitizeUrlForLog = (url) => {
    if (!url) return "none";
    try {
      if (url.startsWith("http://") || url.startsWith("https://")) {
        const parsed = new URL(url);
        return `[S3] ${parsed.origin}${parsed.pathname}`;
      }
      return `[Local] ${url}`;
    } catch {
      return "[Invalid URL]";
    }
  };

  // Diagnostic log for active project ID and model file reference
  useEffect(() => {
    console.log(
      `[CAD_DIAGNOSTIC] Active Project ID: ${activeTaskId || "none"}, Selected model asset: ${
        modelProject?.model_file || (activeTaskId ? `${activeTaskId}_model.glb` : "none")
      }`
    );
  }, [activeTaskId, modelProject?.model_file]);

  // Subscribe to command manager updates
  useEffect(() => {
    return commandManager.subscribe((state) => {
      setCommandState(state);
    });
  }, [commandManager]);

  // Load project or task
  useEffect(() => {
    let isCancelled = false;

    const initProject = async () => {
      if (!activeTaskId) {
        // If no active task in URL, look for recent CAD project
        const projects = loadModelProjects();
        if (projects.length > 0) {
          const first = projects[0];
          setActiveTaskId(first.taskId || first.id);
        }
        return;
      }

      console.log(`[CAD_DIAGNOSTIC] initProject starting for activeTaskId: ${activeTaskId}`);
      setLoading(true);
      setError("");

      try {
        // Check local storage first
        let localProj = getModelProjectById(activeTaskId);
        if (localProj) {
          setModelProject(localProj);
        }

        // Retrieve fresh secure presigned S3 model URL upfront
        let secureUrl = null;
        let storageProvider = null;
        try {
          const secureRes = await getSecureModelUrl(activeTaskId);
          if (secureRes?.url) {
            secureUrl = secureRes.url;
            storageProvider = secureRes.storage_provider || "s3";
            console.log(
              `[CAD_DIAGNOSTIC] Retrieved secure model URL upfront: ${sanitizeUrlForLog(
                secureUrl
              )} (storage: ${storageProvider})`
            );
            if (localProj) {
              localProj = { ...localProj, model_url: secureUrl, storage_provider: storageProvider };
              saveModelProject(localProj);
              setModelProject(localProj);
            }
          }
        } catch (secErr) {
          console.warn("Notice checking secure model URL at init:", secErr);
        }

        // Poll / query Flask backend status
        let statusData = await checkTaskStatus(activeTaskId);
        let attempts = 0;
        const maxAttempts = 45; // 60+ seconds maximum wait for Blender headless execution

        while (
          (statusData.status === "processing" ||
            statusData.status === "pending" ||
            statusData.status === "queued") &&
          attempts < maxAttempts &&
          !isCancelled
        ) {
          attempts++;
          await new Promise((res) => setTimeout(res, 1500));
          if (isCancelled) return;
          try {
            statusData = await checkTaskStatus(activeTaskId);
          } catch (pollErr) {
            console.warn("Retrying task status poll...", pollErr);
          }
        }

        if (isCancelled) return;

        if (statusData.status === "completed") {
          const analysis = statusData.analysis || {};
          const modelFile = statusData.model_file;

          // Restore previously saved customizations if present
          const savedCustom = localProj?.customization || statusData?.customization;
          if (savedCustom?.editorState) {
            console.log("[CAD_DIAGNOSTIC] Restoring saved editorState from customization");
            setEditorState((prev) => ({ ...prev, ...savedCustom.editorState }));
          }

          // Apply saved customizations safely without overwriting real discovered scene meshes
          if (savedCustom?.dynamicObjects) {
            console.log("[CAD_DIAGNOSTIC] Restoring saved dynamicObjects customization");
            setDynamicObjects((prev) => {
              const currentDeletedIds = savedCustom.dynamicObjects.deletedIds || [];
              const deletedSet = new Set(currentDeletedIds);

              if (prev.walls.length > 0) {
                // Base meshes are already discovered; merge saved edits over them
                const savedWallMap = new Map(
                  (savedCustom.dynamicObjects.walls || []).map((w) => [w.id, w])
                );
                const updatedWalls = prev.walls
                  .filter((w) => !deletedSet.has(w.id))
                  .map((w) => {
                    const ov = savedWallMap.get(w.id);
                    if (!ov) return w;
                    const isUserEdit = ov.isEdited === true;
                    return {
                      ...w,
                      ...(ov.color ? { color: ov.color } : {}),
                      ...(ov.visible !== undefined ? { visible: ov.visible } : {}),
                      ...(isUserEdit ? { position: ov.position, rotation: ov.rotation, scale: ov.scale, isEdited: true } : {}),
                    };
                  });

                const savedRoomMap = new Map(
                  (savedCustom.dynamicObjects.rooms || []).map((r) => [r.id, r])
                );
                const updatedRooms = prev.rooms
                  .filter((r) => !deletedSet.has(r.id))
                  .map((r) => {
                    const ov = savedRoomMap.get(r.id);
                    if (!ov) return r;
                    const isUserEdit = ov.isEdited === true;
                    return {
                      ...r,
                      ...(ov.color ? { color: ov.color } : {}),
                      ...(ov.visible !== undefined ? { visible: ov.visible } : {}),
                      ...(isUserEdit ? { position: ov.position, rotation: ov.rotation, scale: ov.scale, isEdited: true } : {}),
                    };
                  });

                return {
                  ...prev,
                  walls: updatedWalls,
                  rooms: updatedRooms,
                  custom: (savedCustom.dynamicObjects.custom || prev.custom || []).filter((c) => !deletedSet.has(c.id)),
                  deletedIds: currentDeletedIds,
                };
              }
              // If model meshes haven't finished discovery yet, store savedCustom for handleModelLoaded
              return savedCustom.dynamicObjects;
            });
          } else {
            console.log(
              "[CAD_DIAGNOSTIC] No saved customizations found. Preserving real GLB base geometry."
            );
          }

          // Ensure project is registered in localStorage with source metadata and customization
          const updatedProject = {
            id: activeTaskId,
            taskId: activeTaskId,
            name: localProj?.name || `Residence CAD ${activeTaskId.slice(0, 8)}`,
            model_file: modelFile,
            analysis,
            status: "completed",
            fileName: localProj?.fileName || statusData?.source_file?.filename,
            type: localProj?.type || statusData?.source_file?.type,
            pipeline: localProj?.pipeline || analysis?.pipeline || "standard",
            floors: localProj?.floors || analysis?.floors || 1,
            wallHeight: localProj?.wallHeight || analysis?.wall_height,
            wallThickness: localProj?.wallThickness || analysis?.wall_thickness,
            timestamp: localProj?.timestamp || statusData?.source_file?.uploaded_at || Date.now(),
            sourceThumbnail: localProj?.sourceThumbnail,
            sourceDownloadUrl: localProj?.sourceDownloadUrl || statusData?.source_file?.download_url || `/api/source/${activeTaskId}`,
            source_file: statusData?.source_file || localProj?.source_file,
            storage_provider: storageProvider || statusData?.storage_provider || (statusData?.s3_uploaded ? "s3" : localProj?.storage_provider),
            s3_uploaded: statusData?.s3_uploaded ?? localProj?.s3_uploaded ?? (storageProvider === "s3"),
            customization: savedCustom || null,
          };

          // Re-verify secure URL if not fetched upfront
          if (!secureUrl) {
            try {
              const secureRes = await getSecureModelUrl(activeTaskId);
              if (secureRes?.url) {
                secureUrl = secureRes.url;
                if (secureRes.storage_provider) {
                  updatedProject.storage_provider = secureRes.storage_provider;
                }
              }
            } catch (secErr) {
              console.warn("Notice checking secure model URL:", secErr);
            }
          }

          if (secureUrl) {
            updatedProject.model_url = secureUrl;
            setError("");
          } else if (updatedProject.storage_provider === "s3" || updatedProject.s3_uploaded) {
            setError("Failed to retrieve secure 3D model URL from storage.");
          }

          saveModelProject(updatedProject);
          setModelProject(updatedProject);
        } else if (statusData.status === "error") {
          // If we have secure URL or local project, do NOT block reopening
          if (secureUrl || localProj?.model_file || localProj?.status === "completed") {
            console.warn("Backend reported task error, but S3 model or local project is available. Proceeding with model.");
            const fallbackProj = localProj
              ? {
                  ...localProj,
                  customization: savedCustom || localProj.customization || null,
                  ...(secureUrl ? { model_url: secureUrl } : {}),
                }
              : {
                  id: activeTaskId,
                  taskId: activeTaskId,
                  name: `Residence CAD ${activeTaskId.slice(0, 8)}`,
                  model_file: `${activeTaskId}_model.glb`,
                  model_url: secureUrl,
                  status: "completed",
                  customization: savedCustom || null,
                };
            saveModelProject(fallbackProj);
            setModelProject(fallbackProj);
          } else {
            setError(statusData.error || "Model generation encountered an error");
          }
        }
      } catch (err) {
        console.warn("Status poll error in CAD editor:", err);
        const localProj = getModelProjectById(activeTaskId);
        if (localProj?.model_file || localProj?.status === "completed") {
          setModelProject(localProj);
          if (localProj.customization?.dynamicObjects) {
            setDynamicObjects(localProj.customization.dynamicObjects);
          }
        } else {
          setError("Failed to connect to model generation service.");
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    initProject();

    return () => {
      isCancelled = true;
    };
  }, [activeTaskId]);

  // Model file URL (prefers secure S3 presigned URL when available, with authenticated local fallback)
  const modelFile = modelProject?.model_file || (activeTaskId ? `${activeTaskId}_model.glb` : null);
  const modelUrl = useMemo(() => {
    // 1. If we have a validated model_url on modelProject, use it
    if (modelProject?.model_url) {
      return modelProject.model_url;
    }
    // 2. While loading / resolving secure model URL, DO NOT start GLB loading or fall back
    if (loading) {
      return null;
    }
    // 3. If loading is done, check whether this project is S3-backed
    const isS3 =
      modelProject?.storage_provider === "s3" ||
      modelProject?.s3_uploaded === true;
    if (isS3) {
      // S3-backed project must not fall back to local URL
      return null;
    }
    // 4. For confirmed local-only projects, fall back to authenticated local download
    return modelFile ? getModelDownloadUrl(modelFile) : null;
  }, [
    modelProject?.model_url,
    modelProject?.storage_provider,
    modelProject?.s3_uploaded,
    modelFile,
    loading,
  ]);

  // Diagnostic tracker for modelUrl changes after initial load (never logs presigned tokens)
  const prevModelUrlRef = useRef(null);
  useEffect(() => {
    if (modelUrl) {
      if (prevModelUrlRef.current && prevModelUrlRef.current !== modelUrl) {
        console.log(
          `[CAD_DIAGNOSTIC] Model URL changed after first load: ${sanitizeUrlForLog(
            prevModelUrlRef.current
          )} -> ${sanitizeUrlForLog(modelUrl)}`
        );
      } else if (!prevModelUrlRef.current) {
        console.log(
          `[CAD_DIAGNOSTIC] Initial Model URL loaded: ${sanitizeUrlForLog(modelUrl)}`
        );
      }
      prevModelUrlRef.current = modelUrl;
    }
  }, [modelUrl]);

  // Find object data in state
  const getSelectedObjectData = () => {
    if (!selectedObject) return null;
    const all = [
      ...dynamicObjects.walls,
      ...dynamicObjects.doors,
      ...dynamicObjects.windows,
      ...dynamicObjects.rooms,
      ...dynamicObjects.custom,
    ];
    return all.find((o) => o.id === selectedObject.id) || null;
  };

  const allSelectedData = useMemo(() => {
    if (!selectedObjects || selectedObjects.length === 0) return [];
    const all = [
      ...dynamicObjects.walls,
      ...dynamicObjects.doors,
      ...dynamicObjects.windows,
      ...dynamicObjects.rooms,
      ...dynamicObjects.custom,
    ];
    const map = new Map(all.map((o) => [o.id, o]));
    return selectedObjects.map((o) => map.get(o.id)).filter(Boolean);
  }, [selectedObjects, dynamicObjects]);

  // Object selection handler (supports single click & ctrl/cmd multi-select)
  const handleObjectSelect = (element, isMulti = false) => {
    if (!element) {
      setSelectedObject(null);
      setSelectedObjects([]);
      return;
    }

    if (isMulti) {
      setSelectedObjects((prev) => {
        const exists = prev.some((o) => o.id === element.id);
        let next;
        if (exists) {
          next = prev.filter((o) => o.id !== element.id);
        } else {
          next = [...prev, element];
        }
        if (next.length > 0) {
          setSelectedObject(next[next.length - 1]);
        } else {
          setSelectedObject(null);
        }
        return next;
      });
    } else {
      setSelectedObject(element);
      setSelectedObjects([element]);
    }
  };

  const handleClearSelection = () => {
    setSelectedObject(null);
    setSelectedObjects([]);
  };

  // Internal state modifiers (called by commands)
  const applyColor = (objectId, color) => {
    setDynamicObjects((prev) => {
      const updateList = (list) =>
        list.map((o) => (o.id === objectId ? { ...o, color, isEdited: true } : o));
      return {
        walls: updateList(prev.walls),
        doors: updateList(prev.doors),
        windows: updateList(prev.windows),
        rooms: updateList(prev.rooms),
        custom: updateList(prev.custom),
        deletedIds: prev.deletedIds || [],
      };
    });
  };

  const applyBatchColors = (colorUpdates) => {
    const colorMap = new Map(colorUpdates.map((u) => [u.id, u.color]));
    setDynamicObjects((prev) => {
      const updateList = (list) =>
        list.map((o) => (colorMap.has(o.id) ? { ...o, color: colorMap.get(o.id), isEdited: true } : o));
      return {
        walls: updateList(prev.walls),
        doors: updateList(prev.doors),
        windows: updateList(prev.windows),
        rooms: updateList(prev.rooms),
        custom: updateList(prev.custom),
        deletedIds: prev.deletedIds || [],
      };
    });
  };

  const applyProperty = (objectId, property, value) => {
    setDynamicObjects((prev) => {
      const updateList = (list) =>
        list.map((o) => (o.id === objectId ? { ...o, [property]: value, isEdited: true } : o));
      return {
        walls: updateList(prev.walls),
        doors: updateList(prev.doors),
        windows: updateList(prev.windows),
        rooms: updateList(prev.rooms),
        custom: updateList(prev.custom),
        deletedIds: prev.deletedIds || [],
      };
    });
  };

  const applyBatchProperty = (property, valueUpdates) => {
    const valMap = new Map(valueUpdates.map((u) => [u.id, u.value]));
    setDynamicObjects((prev) => {
      const updateList = (list) =>
        list.map((o) => (valMap.has(o.id) ? { ...o, [property]: valMap.get(o.id), isEdited: true } : o));
      return {
        walls: updateList(prev.walls),
        doors: updateList(prev.doors),
        windows: updateList(prev.windows),
        rooms: updateList(prev.rooms),
        custom: updateList(prev.custom),
        deletedIds: prev.deletedIds || [],
      };
    });
  };

  const applyTransform = (objectId, transform) => {
    setDynamicObjects((prev) => {
      const updateList = (list) =>
        list.map((o) => (o.id === objectId ? { ...o, ...transform, isEdited: true } : o));
      return {
        walls: updateList(prev.walls),
        doors: updateList(prev.doors),
        windows: updateList(prev.windows),
        rooms: updateList(prev.rooms),
        custom: updateList(prev.custom),
        deletedIds: prev.deletedIds || [],
      };
    });
  };

  const applyVisibility = (objectId, visible) => {
    setDynamicObjects((prev) => {
      const updateList = (list) =>
        list.map((o) => (o.id === objectId ? { ...o, visible } : o));
      return {
        walls: updateList(prev.walls),
        doors: updateList(prev.doors),
        windows: updateList(prev.windows),
        rooms: updateList(prev.rooms),
        custom: updateList(prev.custom),
        deletedIds: prev.deletedIds || [],
      };
    });
  };

  const applyBatchVisibility = (visibilityUpdates) => {
    const visMap = new Map(visibilityUpdates.map((u) => [u.id, u.visible]));
    setDynamicObjects((prev) => {
      const updateList = (list) =>
        list.map((o) => (visMap.has(o.id) ? { ...o, visible: visMap.get(o.id) } : o));
      return {
        walls: updateList(prev.walls),
        doors: updateList(prev.doors),
        windows: updateList(prev.windows),
        rooms: updateList(prev.rooms),
        custom: updateList(prev.custom),
        deletedIds: prev.deletedIds || [],
      };
    });
  };

  const applyAddObject = (element) => {
    const category =
      element.type === "wall"
        ? "walls"
        : (element.type === "floor" || element.type === "room" || element.type === "foundation")
        ? "rooms"
        : element.type === "door"
        ? "doors"
        : element.type === "window"
        ? "windows"
        : "custom";

    setDynamicObjects((prev) => {
      const nextCategoryList = [...(prev[category] || [])];
      if (!nextCategoryList.some((item) => item.id === element.id)) {
        nextCategoryList.push(element);
      }
      return {
        ...prev,
        [category]: nextCategoryList,
        deletedIds: (prev.deletedIds || []).filter((id) => id !== element.id),
      };
    });
    setSelectedObject({
      id: element.id,
      name: element.name,
      type: element.type,
    });
    setSelectedObjects([
      {
        id: element.id,
        name: element.name,
        type: element.type,
      },
    ]);
  };

  const applyDeleteObject = (elementId) => {
    setDynamicObjects((prev) => {
      const filterOut = (list) => (list || []).filter((o) => o.id !== elementId);
      return {
        ...prev,
        walls: filterOut(prev.walls),
        doors: filterOut(prev.doors),
        windows: filterOut(prev.windows),
        rooms: filterOut(prev.rooms),
        custom: filterOut(prev.custom),
        deletedIds: Array.from(new Set([...(prev.deletedIds || []), elementId])),
      };
    });
    if (selectedObject?.id === elementId) {
      setSelectedObject(null);
    }
    setSelectedObjects((prev) => prev.filter((o) => o.id !== elementId));
  };

  // Synchronize discovered scene meshes from loaded GLB with project state (Req 1)
  const handleModelLoaded = (discovered) => {
    if (!discovered) return;

    console.log(
      `[CAD_DIAGNOSTIC] handleModelLoaded received scene meshes: ${
        discovered.walls?.length || 0
      } walls, ${discovered.doors?.length || 0} doors, ${
        discovered.windows?.length || 0
      } windows, ${discovered.rooms?.length || 0} rooms, ${
        discovered.foundation?.length || 0
      } foundation`
    );

    const savedCustom =
      modelProject?.customization?.dynamicObjects ||
      getModelProjectById(activeTaskId)?.customization?.dynamicObjects;

    const savedDeletedIds = savedCustom?.deletedIds || [];
    const deletedSet = new Set(savedDeletedIds);

    setDynamicObjects((prev) => {
      let hiddenCount = 0;
      let replacedCount = 0;
      let addedCount = 0;

      const mergeCategory = (discItems, savedItems) => {
        const activeDiscItems = (discItems || []).filter((item) => !deletedSet.has(item.id));
        if (!savedItems || savedItems.length === 0) return activeDiscItems;

        const savedMap = new Map(savedItems.map((item) => [item.id, item]));
        const merged = activeDiscItems.map((item) => {
          const override = savedMap.get(item.id);
          if (!override) return item;

          // Only apply overrides that represent intentional user customizations,
          // never dummy [0,0,0] placeholders from obsolete initialWalls
          const hasTransformEdit =
            override.isEdited === true ||
            (override.position &&
              (override.position[0] !== 0 ||
                override.position[1] !== 0 ||
                override.position[2] !== 0));

          if (override.visible === false) hiddenCount++;
          if (hasTransformEdit || (override.color && override.color !== item.color)) replacedCount++;

          return {
            ...item,
            ...(override.color ? { color: override.color } : {}),
            ...(override.roughness !== undefined ? { roughness: override.roughness } : {}),
            ...(override.metalness !== undefined ? { metalness: override.metalness } : {}),
            ...(override.opacity !== undefined ? { opacity: override.opacity } : {}),
            ...(override.visible !== undefined ? { visible: override.visible } : {}),
            ...(hasTransformEdit
              ? {
                  position: override.position,
                  rotation: override.rotation || item.rotation,
                  scale: override.scale || item.scale,
                  isEdited: true,
                }
              : {}),
          };
        });

        savedItems.forEach((item) => {
          if (item.isNew && !deletedSet.has(item.id) && !merged.some((m) => m.id === item.id)) {
            merged.push(item);
            addedCount++;
          }
        });
        return merged;
      };

      const allDiscoveredRooms = [
        ...(discovered.rooms || []),
        ...(discovered.foundation || []),
      ];

      const nextObjects = {
        walls: mergeCategory(discovered.walls || [], savedCustom?.walls),
        doors: mergeCategory(discovered.doors || [], savedCustom?.doors),
        windows: mergeCategory(discovered.windows || [], savedCustom?.windows),
        rooms: mergeCategory(allDiscoveredRooms, savedCustom?.rooms),
        custom: (savedCustom?.custom || prev.custom || []).filter((item) => !deletedSet.has(item.id)),
        deletedIds: savedDeletedIds,
      };

      console.log(
        `[CAD_DIAGNOSTIC] Customization hydration complete. Meshes: ${nextObjects.walls.length} walls, ${nextObjects.rooms.length} rooms/floors. Hidden: ${hiddenCount}, Customized/Replaced: ${replacedCount}, Added: ${addedCount}`
      );

      return nextObjects;
    });
  };

  // Command-wrapped actions
  const handleUpdateColor = (objectId, newColor) => {
    const currentData = getSelectedObjectData();
    const prevColor = currentData?.color || "#cccccc";
    if (prevColor === newColor) return;

    commandManager.execute(
      new ColorChangeCommand({
        objectId,
        prevColor,
        newColor,
        onApply: applyColor,
      })
    );
  };

  const handleUpdateProperty = (objectId, property, newValue) => {
    const currentData = getSelectedObjectData();
    const prevValue = currentData?.[property] ?? 0.7;
    if (prevValue === newValue) return;

    commandManager.execute(
      new MaterialPropertyCommand({
        objectId,
        property,
        prevValue,
        newValue,
        onApply: applyProperty,
      })
    );
  };

  const handleUpdateTransform = (objectId, newTransform) => {
    const currentData = getSelectedObjectData();
    const prevTransform = {
      position: currentData?.position || [0, 0, 0],
      rotation: currentData?.rotation || [0, 0, 0],
      scale: currentData?.scale || [1, 1, 1],
      dimensions: currentData?.dimensions || { length: 3, height: 2.8, thickness: 0.25 },
    };

    const newTransformWithFlag = {
      ...newTransform,
      isEdited: true,
    };

    commandManager.execute(
      new TransformChangeCommand({
        objectId,
        prevTransform,
        newTransform: newTransformWithFlag,
        onApply: applyTransform,
      })
    );
  };

  const handleToggleVisibility = (objectId) => {
    const currentData = [
      ...dynamicObjects.walls,
      ...dynamicObjects.doors,
      ...dynamicObjects.windows,
      ...dynamicObjects.rooms,
      ...dynamicObjects.custom,
    ].find((o) => o.id === objectId);

    const prevVisible = currentData?.visible !== false;
    const newVisible = !prevVisible;

    commandManager.execute(
      new VisibilityChangeCommand({
        objectId,
        prevVisible,
        newVisible,
        onApply: applyVisibility,
      })
    );
  };

  const handleBatchUpdateColor = (objectIds, newColor) => {
    if (!objectIds || objectIds.length === 0) return;
    const all = [
      ...dynamicObjects.walls,
      ...dynamicObjects.doors,
      ...dynamicObjects.windows,
      ...dynamicObjects.rooms,
      ...dynamicObjects.custom,
    ];
    const allMap = new Map(all.map((o) => [o.id, o]));
    const objectChanges = objectIds.map((id) => ({
      objectId: id,
      prevColor: allMap.get(id)?.color || "#cccccc",
      newColor,
    }));

    commandManager.execute(
      new BatchColorChangeCommand({
        objectChanges,
        onApply: applyBatchColors,
      })
    );
  };

  const handleBatchUpdateProperty = (objectIds, property, newValue) => {
    if (!objectIds || objectIds.length === 0) return;
    const all = [
      ...dynamicObjects.walls,
      ...dynamicObjects.doors,
      ...dynamicObjects.windows,
      ...dynamicObjects.rooms,
      ...dynamicObjects.custom,
    ];
    const allMap = new Map(all.map((o) => [o.id, o]));
    const objectChanges = objectIds.map((id) => ({
      objectId: id,
      prevValue: allMap.get(id)?.[property] ?? 0.7,
      newValue,
    }));

    commandManager.execute(
      new BatchMaterialPropertyCommand({
        property,
        objectChanges,
        onApply: applyBatchProperty,
      })
    );
  };

  const handleBatchToggleVisibility = (objectIds, newVisible) => {
    if (!objectIds || objectIds.length === 0) return;
    const all = [
      ...dynamicObjects.walls,
      ...dynamicObjects.doors,
      ...dynamicObjects.windows,
      ...dynamicObjects.rooms,
      ...dynamicObjects.custom,
    ];
    const allMap = new Map(all.map((o) => [o.id, o]));
    const objectChanges = objectIds.map((id) => ({
      objectId: id,
      prevVisible: allMap.get(id)?.visible !== false,
      newVisible,
    }));

    commandManager.execute(
      new BatchVisibilityChangeCommand({
        objectChanges,
        onApply: applyBatchVisibility,
      })
    );
  };

  // Interactive Wall Creation (+ Wall placed directly on ground) (Req 2)
  const handleCreateWall = ({ startPoint, endPoint, length, height, thickness }) => {
    const id = `custom_wall_${Date.now()}`;
    const wallNum = dynamicObjects.walls.length + 1;
    const center = [
      parseFloat(((startPoint[0] + endPoint[0]) / 2).toFixed(2)),
      parseFloat((height / 2).toFixed(2)),
      parseFloat(((startPoint[2] + endPoint[2]) / 2).toFixed(2)),
    ];
    const angle = Math.atan2(endPoint[0] - startPoint[0], endPoint[2] - startPoint[2]);

    const newWall = {
      id,
      name: `Wall ${wallNum}`,
      type: "wall",
      isNew: true,
      visible: true,
      color: "#cccccc",
      roughness: 0.7,
      metalness: 0.1,
      opacity: 1.0,
      position: center,
      rotation: [0, parseFloat(angle.toFixed(3)), 0],
      scale: [thickness, height, length],
      dimensions: {
        length: parseFloat(length.toFixed(2)),
        height: parseFloat(height.toFixed(2)),
        thickness: parseFloat(thickness.toFixed(2)),
      },
      startPoint,
      endPoint,
    };

    commandManager.execute(
      new AddElementCommand({
        element: newWall,
        onAdd: applyAddObject,
        onRemove: applyDeleteObject,
      })
    );
    setIsDrawingWall(false);
  };

  // Universal deletion for any architectural element or wall (Req 1 & Req 3)
  const handleDeleteObject = (elementId) => {
    const all = [
      ...dynamicObjects.walls,
      ...dynamicObjects.doors,
      ...dynamicObjects.windows,
      ...dynamicObjects.rooms,
      ...dynamicObjects.custom,
    ];
    const element = all.find((o) => o.id === elementId);
    if (!element) return;

    // Check if the element is an important foundation / floor element requiring confirmation
    const isImportant =
      element.type === "floor" ||
      element.type === "foundation" ||
      element.id.toLowerCase().includes("slab") ||
      element.id.toLowerCase().includes("floor");

    if (isImportant) {
      setElementsToDelete([]);
      setObjectToDelete(element);
      setShowDeleteElementModal(true);
    } else {
      executeDeleteElement(element);
    }
  };

  const handleDeleteMultipleObjects = (elementIds) => {
    if (!elementIds || elementIds.length === 0) return;
    const all = [
      ...dynamicObjects.walls,
      ...dynamicObjects.doors,
      ...dynamicObjects.windows,
      ...dynamicObjects.rooms,
      ...dynamicObjects.custom,
    ];
    const elements = all.filter((o) => elementIds.includes(o.id));
    if (elements.length === 0) return;

    const hasImportant = elements.some(
      (e) =>
        e.type === "floor" ||
        e.type === "foundation" ||
        e.id.toLowerCase().includes("slab") ||
        e.id.toLowerCase().includes("floor")
    );

    if (hasImportant) {
      setElementsToDelete(elements);
      setObjectToDelete(elements[0]);
      setShowDeleteElementModal(true);
    } else {
      executeBatchDeleteElements(elements);
    }
  };

  const executeDeleteElement = (element) => {
    commandManager.execute(
      new DeleteElementCommand({
        element,
        onAdd: applyAddObject,
        onRemove: applyDeleteObject,
      })
    );
  };

  const executeBatchDeleteElements = (elements) => {
    commandManager.execute(
      new BatchDeleteElementsCommand({
        elements,
        onBatchAdd: (addedElements) => {
          setDynamicObjects((prev) => {
            const nextWalls = [...prev.walls];
            const nextDoors = [...prev.doors];
            const nextWindows = [...prev.windows];
            const nextRooms = [...prev.rooms];
            const nextCustom = [...prev.custom];
            const addedIds = new Set(addedElements.map((e) => e.id));

            addedElements.forEach((el) => {
              if (el.type === "wall") nextWalls.push(el);
              else if (el.type === "floor" || el.type === "room") nextRooms.push(el);
              else if (el.type === "door") nextDoors.push(el);
              else if (el.type === "window") nextWindows.push(el);
              else nextCustom.push(el);
            });

            return {
              walls: nextWalls,
              doors: nextDoors,
              windows: nextWindows,
              rooms: nextRooms,
              custom: nextCustom,
              deletedIds: (prev.deletedIds || []).filter((id) => !addedIds.has(id)),
            };
          });
        },
        onBatchRemove: (removedIds) => {
          const idSet = new Set(removedIds);
          setDynamicObjects((prev) => ({
            walls: prev.walls.filter((o) => !idSet.has(o.id)),
            doors: prev.doors.filter((o) => !idSet.has(o.id)),
            windows: prev.windows.filter((o) => !idSet.has(o.id)),
            rooms: prev.rooms.filter((o) => !idSet.has(o.id)),
            custom: prev.custom.filter((o) => !idSet.has(o.id)),
            deletedIds: Array.from(new Set([...(prev.deletedIds || []), ...removedIds])),
          }));
          setSelectedObjects((prev) => prev.filter((o) => !idSet.has(o.id)));
          setSelectedObject((prev) => (prev && idSet.has(prev.id) ? null : prev));
        },
      })
    );
  };

  const handleConfirmDeleteObject = () => {
    if (elementsToDelete && elementsToDelete.length > 0) {
      executeBatchDeleteElements(elementsToDelete);
      setElementsToDelete([]);
      setObjectToDelete(null);
      setShowDeleteElementModal(false);
    } else if (objectToDelete) {
      executeDeleteElement(objectToDelete);
      setObjectToDelete(null);
      setShowDeleteElementModal(false);
    }
  };

  // Category visibility toggle
  const handleToggleCategoryVisibility = (category) => {
    const key = `${category}Visible`;
    const nextVal = !editorState[key];
    setEditorState((prev) => ({ ...prev, [key]: nextVal }));
  };

  // Camera preset handler
  const handleSetCameraPreset = (preset) => {
    setCameraPreset(preset);
    if (preset === CAMERA_PRESETS.TOP) viewportRef.current?.setTopView();
    else if (preset === CAMERA_PRESETS.FRONT) viewportRef.current?.setFrontView();
    else if (preset === CAMERA_PRESETS.SIDE) viewportRef.current?.setSideView();
    else viewportRef.current?.resetCamera();
  };

  // Save customization action
  const handleSaveProject = async () => {
    if (!activeTaskId || isSaving) return;
    setIsSaving(true);
    setSaveError("");
    setSaveSuccessMsg("");

    const customizationData = {
      dynamicObjects,
      editorState,
      savedAt: Date.now(),
    };

    try {
      // 1. Persist to backend MongoDB & task repository
      await saveProjectCustomization(activeTaskId, customizationData);

      // 2. Persist locally to localStorage
      updateModelProjectCustomization(activeTaskId, customizationData);

      // 3. Update current modelProject in React state
      setModelProject((prev) => (prev ? { ...prev, customization: customizationData } : prev));

      setSaveSuccessMsg("Customization saved to project!");
      setTimeout(() => setSaveSuccessMsg(""), 3000);
    } catch (err) {
      console.error("Failed to persist project customization:", err);
      setSaveError(err.message || "Failed to save project customization to server.");
      setTimeout(() => setSaveError(""), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  // Export action
  const handleExportGlb = () => {
    if (modelFile) {
      downloadGlbAsset(modelFile);
    } else {
      exportProjectJson({ activeTaskId, dynamicObjects, editorState });
    }
  };

  // Delete Project Confirmation Handler
  const handleDeleteProjectConfirm = async () => {
    if (!activeTaskId || isDeletingProject) return;
    try {
      setIsDeletingProject(true);
      setDeleteProjectError("");
      await deleteModelProject(activeTaskId);
      navigate("/projects");
    } catch (err) {
      console.error("Failed to delete project:", err);
      setDeleteProjectError(err.message || "Failed to delete CAD project from storage.");
      setIsDeletingProject(false);
    }
  };

  // Keyboard shortcuts (Ctrl+Z, Ctrl+Y, Delete / Backspace)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isInput = activeTag === "input" || activeTag === "textarea" || activeTag === "select";

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          commandManager.redo();
        } else {
          commandManager.undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        commandManager.redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && !isInput) {
        if (selectedObjects.length > 1) {
          e.preventDefault();
          handleDeleteMultipleObjects(selectedObjects.map((o) => o.id));
        } else if (selectedObject) {
          e.preventDefault();
          handleDeleteObject(selectedObject.id);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commandManager, selectedObject, selectedObjects, dynamicObjects]);

  const selectedData = getSelectedObjectData();

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#fdfbf7] dark:bg-[#141311] overflow-hidden pb-14 lg:pb-0 relative">
      {/* Top CAD Studio Bar */}
      <CadToolbar
        transformMode={transformMode}
        onSetTransformMode={setTransformMode}
        isDrawingWall={isDrawingWall}
        onToggleDrawWall={() => {
          setIsDrawingWall((prev) => !prev);
          if (!isDrawingWall) {
            setSelectedObject(null);
          }
        }}
        cameraPreset={cameraPreset}
        onSetCameraPreset={handleSetCameraPreset}
        showGrid={editorState.showGrid}
        onToggleGrid={() =>
          setEditorState((prev) => ({ ...prev, showGrid: !prev.showGrid }))
        }
        showWireframe={editorState.showWireframe}
        onToggleWireframe={() =>
          setEditorState((prev) => ({ ...prev, showWireframe: !prev.showWireframe }))
        }
        showBlueprint={editorState.showBlueprintOverlay !== false}
        onToggleBlueprint={() =>
          setEditorState((prev) => ({
            ...prev,
            showBlueprintOverlay: prev.showBlueprintOverlay === false,
          }))
        }
        blueprintOpacity={editorState.blueprintOpacity ?? 0.65}
        onChangeBlueprintOpacity={(opacity) =>
          setEditorState((prev) => ({ ...prev, blueprintOpacity: opacity }))
        }
        canUndo={commandState.canUndo}
        canRedo={commandState.canRedo}
        onUndo={() => commandManager.undo()}
        onRedo={() => commandManager.redo()}
        onTakeScreenshot={() => viewportRef.current?.takeScreenshot()}
        onSaveProject={handleSaveProject}
        onExportGlb={handleExportGlb}
        onDeleteProject={() => setShowDeleteModal(true)}
        onOpenArScanner={() => setShowArScannerModal(true)}
        isLeftPanelOpen={isLeftPanelOpen}
        onToggleLeftPanel={() => setIsLeftPanelOpen((prev) => !prev)}
        isRightPanelOpen={isRightPanelOpen}
        onToggleRightPanel={() => setIsRightPanelOpen((prev) => !prev)}
      />

      {/* Save Toast Notification */}
      {saveSuccessMsg && (
        <div className="absolute top-20 right-6 z-50 bg-emerald-800 text-white text-xs px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-300" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* Save Error Notification */}
      {saveError && (
        <div className="absolute top-20 right-6 z-50 bg-red-800 text-white text-xs px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <AlertTriangle className="w-4 h-4 text-red-300" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left: Scene Hierarchy Tree Panel (Responsive slide-over drawer on <lg, static column on lg+) */}
        {isLeftPanelOpen && (
          <>
            <div
              className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-xs z-30 transition-opacity cursor-pointer"
              onClick={() => setIsLeftPanelOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 z-40 w-80 max-w-[85vw] shadow-2xl lg:static lg:w-64 lg:shadow-none lg:z-auto border-r border-[#eae4dc] dark:border-[#39342f] h-full shrink-0 bg-[#fdfbf7] dark:bg-[#1d1b19] transition-transform">
              <SceneHierarchyPanel
                dynamicObjects={dynamicObjects}
                selectedObjectId={selectedObject?.id}
                selectedObjectIds={selectedObjectIds}
                onSelectObject={handleObjectSelect}
                onClearSelection={handleClearSelection}
                onToggleVisibility={handleToggleVisibility}
                onToggleCategoryVisibility={handleToggleCategoryVisibility}
                categoryVisibility={editorState}
                onCollapse={() => setIsLeftPanelOpen(false)}
              />
            </div>
          </>
        )}

        {/* Center: 3D Viewport */}
        <div className="flex-1 min-w-0 h-full relative">
          {/* Persistent Expand Left Panel Button (when collapsed on desktop) */}
          {!isLeftPanelOpen && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsLeftPanelOpen(true);
              }}
              title="Expand Scene Hierarchy (Left Panel)"
              aria-label="Expand Scene Hierarchy"
              className="hidden lg:flex absolute top-4 left-4 z-30 p-2 rounded-xl bg-white/95 dark:bg-[#1d1b19]/95 text-zinc-700 dark:text-[#f5f0e8] border border-[#eae4dc] dark:border-[#39342f] shadow-md backdrop-blur-md hover:bg-orange-50 dark:hover:bg-[#2b2a27] hover:text-orange-600 dark:hover:text-[#ff7417] transition-all cursor-pointer items-center justify-center pointer-events-auto"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {/* Persistent Expand Right Panel Button (when collapsed on desktop) */}
          {!isRightPanelOpen && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsRightPanelOpen(true);
              }}
              title="Expand Property Inspector (Right Panel)"
              aria-label="Expand Property Inspector"
              className="hidden lg:flex absolute top-4 right-4 z-30 p-2 rounded-xl bg-white/95 dark:bg-[#1d1b19]/95 text-zinc-700 dark:text-[#f5f0e8] border border-[#eae4dc] dark:border-[#39342f] shadow-md backdrop-blur-md hover:bg-orange-50 dark:hover:bg-[#2b2a27] hover:text-orange-600 dark:hover:text-[#ff7417] transition-all cursor-pointer items-center justify-center pointer-events-auto"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}

          {loading ? (
            <div className="w-full h-full flex items-center justify-center bg-[#f4eee6] dark:bg-[#141311]">
              <LoadingSpinner
                label="Preparing CAD Workspace..."
                description="Loading geometry meshes and material shaders"
              />
            </div>
          ) : error ? (
            <div className="p-8 max-w-md mx-auto">
              <ErrorMessage
                title="Model Load Error"
                message={error}
                onRetry={() => window.location.reload()}
              />
            </div>
          ) : !modelUrl ? (
            <div className="w-full h-full flex items-center justify-center bg-[#f4eee6] dark:bg-[#141311] p-6">
              <EmptyState
                icon={Layers}
                title="No 3D Model Loaded"
                description="Upload a blueprint or select an existing project from the gallery to begin customizable CAD editing."
                actionLabel="Generate 3D Model"
                onAction={() => navigate("/generate-model")}
              />
            </div>
          ) : (
            <>

              {/* Floating Source Blueprint Button for rapid inspection */}
              <button
                type="button"
                onClick={() => setShowSourceModal(true)}
                className={`absolute top-4 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/90 dark:bg-[#1d1b19]/90 text-zinc-700 dark:text-[#f5f0e8] border border-[#eae4dc] dark:border-[#39342f] shadow-md backdrop-blur-md hover:bg-orange-50 dark:hover:bg-[#2b2a27] transition-all text-xs font-semibold cursor-pointer ${
                  !isLeftPanelOpen ? "left-16" : "left-4"
                }`}
                title="View original blueprint details and inspection"
              >
                <FileText className="w-3.5 h-3.5 text-orange-500" />
                <span>Source Blueprint</span>
              </button>

              <CadViewport
                ref={viewportRef}
                modelUrl={modelUrl}
                blueprintUrl={
                  modelProject?.sourceThumbnail ||
                  modelProject?.sourceDownloadUrl ||
                  (activeTaskId ? `/api/source/${activeTaskId}` : null)
                }
                editorState={editorState}
                dynamicObjects={dynamicObjects}
                selectedObject={selectedObject}
                selectedObjectIds={selectedObjectIds}
                onObjectSelect={handleObjectSelect}
                onModelLoaded={handleModelLoaded}
                onTransformChange={handleUpdateTransform}
                transformMode={transformMode}
                isDrawingWall={isDrawingWall}
                onCreateWall={handleCreateWall}
                onCancelDrawWall={() => setIsDrawingWall(false)}
                wallHeight={modelProject?.wallHeight || modelProject?.analysis?.wall_height || 2.8}
                wallThickness={modelProject?.wallThickness || modelProject?.analysis?.wall_thickness || 0.25}
              />
              <DimensionOverlay
                transformMode={transformMode}
                cameraPreset={cameraPreset}
                selectedObject={selectedObject}
                objectData={selectedData}
              />

              {/* Floating Picture-in-Picture Blueprint Comparison Card */}
              {showCompareOverlay && (modelProject?.sourceThumbnail || modelProject?.sourceDownloadUrl) && (
                <div className="absolute bottom-6 right-6 z-30 w-72 bg-white/95 dark:bg-[#1d1b19]/95 backdrop-blur-md rounded-2xl border border-[#eae4dc] dark:border-[#39342f] shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#eae4dc] dark:border-[#39342f] bg-[#fdfbf7]/80 dark:bg-[#24211f]/90">
                    <div className="flex items-center gap-1.5">
                      <SplitSquareVertical className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-xs font-bold text-zinc-900 dark:text-[#f5f0e8]">
                        2D Blueprint Comparison
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCompareOverlay(false)}
                      className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-[#f5f0e8] transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="p-2 space-y-2">
                    <div className="aspect-4/3 w-full bg-[#f4eee6] dark:bg-[#141311] rounded-xl overflow-hidden border border-zinc-200/60 dark:border-[#39342f]">
                      <img
                        src={modelProject.sourceThumbnail || modelProject.sourceDownloadUrl}
                        alt="2D Blueprint Comparison"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="px-1 flex items-center justify-between text-[11px] text-zinc-500 dark:text-[#b4ada3]">
                      <span className="truncate max-w-[150px]">{modelProject.fileName || "Blueprint"}</span>
                      <button
                        type="button"
                        onClick={() => setShowSourceModal(true)}
                        className="text-orange-600 dark:text-[#ff7417] font-semibold hover:underline cursor-pointer"
                      >
                        Inspect
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: Property Inspector Panel (Responsive slide-over drawer on <lg, static column on lg+) */}
        {isRightPanelOpen && (
          <>
            <div
              className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-xs z-30 transition-opacity cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setIsRightPanelOpen(false);
              }}
            />
            <div
              onClick={(e) => e.stopPropagation()}
              className="fixed inset-y-0 right-0 z-40 w-84 max-w-[88vw] shadow-2xl lg:static lg:w-80 lg:shadow-none lg:z-auto border-l border-[#eae4dc] dark:border-[#39342f] h-full shrink-0 bg-[#fdfbf7] dark:bg-[#1d1b19] transition-transform"
            >
              <CadPropertiesPanel
                selectedObject={selectedObject}
                selectedObjects={selectedObjects}
                objectData={selectedData}
                allSelectedData={allSelectedData}
                onUpdateColor={handleUpdateColor}
                onBatchUpdateColor={handleBatchUpdateColor}
                onUpdateProperty={handleUpdateProperty}
                onBatchUpdateProperty={handleBatchUpdateProperty}
                onUpdateTransform={handleUpdateTransform}
                onToggleVisibility={handleToggleVisibility}
                onBatchToggleVisibility={handleBatchToggleVisibility}
                onDeleteObject={handleDeleteObject}
                onDeleteObjects={handleDeleteMultipleObjects}
                onClearSelection={handleClearSelection}
                project={modelProject}
                taskId={activeTaskId}
                onToggleCompare={() => setShowCompareOverlay((prev) => !prev)}
                isComparing={showCompareOverlay}
                onSwitchTo2DPlan={() => handleSetCameraPreset(CAMERA_PRESETS.TOP)}
                showBlueprint={editorState.showBlueprintOverlay !== false}
                onToggleBlueprint={() =>
                  setEditorState((prev) => ({
                    ...prev,
                    showBlueprintOverlay: prev.showBlueprintOverlay === false,
                  }))
                }
                blueprintOpacity={editorState.blueprintOpacity ?? 0.65}
                onChangeBlueprintOpacity={(opacity) =>
                  setEditorState((prev) => ({ ...prev, blueprintOpacity: opacity }))
                }
                onCollapse={() => setIsRightPanelOpen(false)}
              />
            </div>
          </>
        )}
      </div>

      {/* Mobile Floating Selection Pill */}
      {selectedObject && !isLeftPanelOpen && !isRightPanelOpen && (
        <div className="lg:hidden absolute bottom-16 inset-x-4 z-20 flex justify-center pointer-events-none">
          <button
            type="button"
            onClick={() => setIsRightPanelOpen(true)}
            className="pointer-events-auto max-w-sm px-4 py-2 bg-white/95 dark:bg-[#211f1d]/95 backdrop-blur-md rounded-2xl border border-orange-200 dark:border-orange-500/30 shadow-lg flex items-center justify-between gap-3 text-xs text-zinc-800 dark:text-[#f5f0e8] hover:border-orange-400 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2 truncate">
              <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
              <span className="truncate font-semibold">
                {selectedObject.name || selectedObject.type || "Selected Element"}
              </span>
            </div>
            <span className="shrink-0 text-orange-600 dark:text-[#ff7417] font-bold text-[11px]">
              Properties →
            </span>
          </button>
        </div>
      )}

      {/* Mobile CAD Studio Bottom Navigation Bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-[#1d1b19]/95 backdrop-blur-md border-t border-[#eae4dc] dark:border-[#39342f] px-3 py-1.5 flex items-center justify-around pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-lg">
        <button
          type="button"
          onClick={() => {
            setIsLeftPanelOpen(false);
            setIsRightPanelOpen(false);
          }}
          className={`flex-1 py-1 px-2 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
            !isLeftPanelOpen && !isRightPanelOpen
              ? "text-orange-600 dark:text-[#ff7417] font-semibold bg-orange-50 dark:bg-[#ff7417]/10"
              : "text-zinc-500 dark:text-[#b4ada3] hover:text-zinc-800 dark:hover:text-[#f5f0e8]"
          }`}
          aria-label="3D Viewport mode"
        >
          <Box className="w-4 h-4" />
          <span className="text-[11px]">Viewport</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setIsLeftPanelOpen((prev) => !prev);
            setIsRightPanelOpen(false);
          }}
          className={`flex-1 py-1 px-2 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer relative ${
            isLeftPanelOpen
              ? "text-orange-600 dark:text-[#ff7417] font-semibold bg-orange-50 dark:bg-[#ff7417]/10"
              : "text-zinc-500 dark:text-[#b4ada3] hover:text-zinc-800 dark:hover:text-[#f5f0e8]"
          }`}
          aria-label="Open Elements Hierarchy"
        >
          <Layers className="w-4 h-4" />
          <span className="text-[11px]">Elements</span>
          {Object.values(dynamicObjects).flat().length > 0 && (
            <span className="absolute top-1 right-1/4 w-2 h-2 rounded-full bg-orange-500" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setIsRightPanelOpen((prev) => !prev);
            setIsLeftPanelOpen(false);
          }}
          className={`flex-1 py-1 px-2 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer relative ${
            isRightPanelOpen
              ? "text-orange-600 dark:text-[#ff7417] font-semibold bg-orange-50 dark:bg-[#ff7417]/10"
              : "text-zinc-500 dark:text-[#b4ada3] hover:text-zinc-800 dark:hover:text-[#f5f0e8]"
          }`}
          aria-label="Open Properties Inspector"
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span className="text-[11px]">Properties</span>
          {selectedObject && (
            <span className="absolute top-1 right-1/4 w-2 h-2 rounded-full bg-emerald-500" />
          )}
        </button>
      </div>

      {/* Delete Architectural Element Confirmation Modal (e.g. FloorSlab or Batch) */}
      <Modal
        isOpen={showDeleteElementModal}
        onClose={() => {
          setShowDeleteElementModal(false);
          setObjectToDelete(null);
          setElementsToDelete([]);
        }}
        title="Delete Architectural Element"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-[#f5f0e8]">
                {elementsToDelete && elementsToDelete.length > 1
                  ? `Delete ${elementsToDelete.length} elements?`
                  : `Delete ${objectToDelete?.name || "Foundation Slab"}?`}
              </p>
              <p className="text-xs text-zinc-600 dark:text-[#b4ada3] mt-1 leading-relaxed">
                {elementsToDelete && elementsToDelete.length > 1
                  ? `Are you sure you want to delete these ${elementsToDelete.length} selected elements? This will remove them from your project's editable scene. The original 3D asset in storage will remain unchanged, and you can undo this action at any time.`
                  : `Are you sure you want to delete this ${objectToDelete?.type || "element"}? This will remove it from your project's editable scene and reveal underlying layers. The original 3D model asset in storage will not be modified, and you can undo this action at any time.`}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#eae4dc] dark:border-[#39342f]">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowDeleteElementModal(false);
                setObjectToDelete(null);
                setElementsToDelete([]);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmDeleteObject}
              className="bg-red-600 hover:bg-red-700 text-white border-transparent"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              <span>
                {elementsToDelete && elementsToDelete.length > 1
                  ? `Delete ${elementsToDelete.length} Elements`
                  : `Delete ${objectToDelete?.type === "floor" ? "Floor Slab" : "Element"}`}
              </span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* Source Blueprint Modal */}
      <Modal
        isOpen={showSourceModal}
        onClose={() => setShowSourceModal(false)}
        title="Original Blueprint"
      >
        <SourceBlueprintPanel
          project={modelProject}
          taskId={activeTaskId}
          onToggleCompare={() => setShowCompareOverlay((prev) => !prev)}
          isComparing={showCompareOverlay}
          onSwitchTo2DPlan={() => handleSetCameraPreset(CAMERA_PRESETS.TOP)}
        />
      </Modal>

      {/* Delete CAD Project Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => !isDeletingProject && setShowDeleteModal(false)}
        title="Delete CAD Project"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-[#f5f0e8]">
                Are you sure you want to delete this CAD project?
              </p>
              <p className="text-xs text-zinc-600 dark:text-[#b4ada3] mt-1">
                You are about to permanently delete{" "}
                <span className="font-semibold text-zinc-900 dark:text-[#f5f0e8]">
                  "{modelProject?.name || `Project ${activeTaskId}`}"
                </span>
                . All 3D geometry meshes, source files, and project configurations will be deleted from storage. This action cannot be undone.
              </p>
            </div>
          </div>

          {deleteProjectError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 text-xs">
              {deleteProjectError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#eae4dc] dark:border-[#39342f]">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteModal(false)}
              disabled={isDeletingProject}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleDeleteProjectConfirm}
              disabled={isDeletingProject}
              className="bg-red-600 hover:bg-red-700 text-white border-transparent"
            >
              {isDeletingProject ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  <span>Delete Project</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* AR Scanner & QR Code Modal */}
      {showArScannerModal && (
        <ArScannerModal
          isOpen={showArScannerModal}
          onClose={() => setShowArScannerModal(false)}
          project={{
            taskId: activeTaskId,
            id: activeTaskId,
            name: modelProject?.name || `Model ${activeTaskId?.slice(0, 8) || ""}`,
          }}
        />
      )}
    </div>
  );
};

export default CadEditorPage;
