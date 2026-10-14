import React, { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import CadToolbar from "../../presentation/cad/CadToolbar";
import CadPropertiesPanel from "../../presentation/cad/CadPropertiesPanel";
import SceneHierarchyPanel from "../../presentation/cad/SceneHierarchyPanel";
import DimensionOverlay from "../../presentation/cad/DimensionOverlay";
import SourceBlueprintPanel from "../../presentation/cad/SourceBlueprintPanel";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saveSuccessMsg, setSaveSuccessMsg] = useState("");
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [deleteProjectError, setDeleteProjectError] = useState("");
  const [showCompareOverlay, setShowCompareOverlay] = useState(false);

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
  const [commandManager] = useState(() => new CommandManager());
  const [commandState, setCommandState] = useState(commandManager.getState());

  const viewportRef = useRef(null);
  const nextIdCounter = useRef(1);

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

      setLoading(true);
      setError("");

      try {
        // Check local storage first
        const localProj = getModelProjectById(activeTaskId);
        if (localProj) {
          setModelProject(localProj);
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

          // Initialize elements from analysis if dynamicObjects is empty
          const initialWalls = Array.from(
            { length: analysis.walls_detected || 0 },
            (_, i) => ({
              id: `wall_${i}`,
              name: `Wall ${i + 1}`,
              visible: true,
              color: "#cccccc",
              isOriginal: true,
              position: [0, 0, 0],
              scale: [3, 2.8, 0.25],
            })
          );

          const initialDoors = Array.from(
            { length: analysis.doors_detected || 0 },
            (_, i) => ({
              id: `door_${i}`,
              name: `Door ${i + 1}`,
              visible: true,
              color: "#8B4513",
              isOriginal: true,
              position: [0, 0, 0],
              scale: [0.9, 2.1, 0.15],
            })
          );

          const initialWindows = Array.from(
            { length: analysis.windows_detected || 0 },
            (_, i) => ({
              id: `window_${i}`,
              name: `Window ${i + 1}`,
              visible: true,
              color: "#87CEEB",
              isOriginal: true,
              position: [0, 0, 0],
              scale: [1.2, 1.2, 0.15],
            })
          );

          const initialRooms = Array.from(
            { length: analysis.rooms_detected || 0 },
            (_, i) => ({
              id: `room_${i}`,
              name: `Room ${i + 1}`,
              visible: true,
              color: "#8B4513",
              isOriginal: true,
              position: [0, 0, 0],
              scale: [5, 0.2, 5],
            })
          );

          // Restore previously saved customizations if present
          const savedCustom = localProj?.customization;
          if (savedCustom?.editorState) {
            setEditorState((prev) => ({ ...prev, ...savedCustom.editorState }));
          }
          if (savedCustom?.dynamicObjects) {
            setDynamicObjects(savedCustom.dynamicObjects);
          } else {
            setDynamicObjects({
              walls: initialWalls,
              doors: initialDoors,
              windows: initialWindows,
              rooms: initialRooms,
              custom: [],
            });
          }

          // Ensure project is registered in localStorage with source metadata
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
          };
          saveModelProject(updatedProject);
          setModelProject(updatedProject);
        } else if (statusData.status === "error") {
          // If we already have local project or completed model file, do NOT block reopening
          if (localProj?.model_file || localProj?.status === "completed") {
            console.warn("Backend reported task error, but local project is completed. Proceeding with saved artifact.");
            setModelProject(localProj);
          } else {
            setError(statusData.error || "Model generation encountered an error");
          }
        }
      } catch (err) {
        console.warn("Status poll error in CAD editor:", err);
        const localProj = getModelProjectById(activeTaskId);
        if (localProj?.model_file || localProj?.status === "completed") {
          setModelProject(localProj);
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

  // Model file URL
  const modelFile = modelProject?.model_file || (activeTaskId ? `${activeTaskId}_model.glb` : null);
  const modelUrl = modelFile ? getModelDownloadUrl(modelFile) : null;

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

  // Internal state modifiers (called by commands)
  const applyColor = (objectId, color) => {
    setDynamicObjects((prev) => {
      const updateList = (list) =>
        list.map((o) => (o.id === objectId ? { ...o, color } : o));
      return {
        walls: updateList(prev.walls),
        doors: updateList(prev.doors),
        windows: updateList(prev.windows),
        rooms: updateList(prev.rooms),
        custom: updateList(prev.custom),
      };
    });
  };

  const applyProperty = (objectId, property, value) => {
    setDynamicObjects((prev) => {
      const updateList = (list) =>
        list.map((o) => (o.id === objectId ? { ...o, [property]: value } : o));
      return {
        walls: updateList(prev.walls),
        doors: updateList(prev.doors),
        windows: updateList(prev.windows),
        rooms: updateList(prev.rooms),
        custom: updateList(prev.custom),
      };
    });
  };

  const applyTransform = (objectId, transform) => {
    setDynamicObjects((prev) => {
      const updateList = (list) =>
        list.map((o) => (o.id === objectId ? { ...o, ...transform } : o));
      return {
        walls: updateList(prev.walls),
        doors: updateList(prev.doors),
        windows: updateList(prev.windows),
        rooms: updateList(prev.rooms),
        custom: updateList(prev.custom),
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
      };
    });
  };

  const applyAddObject = (element) => {
    const category = element.type === "wall" ? "walls" : "custom";
    setDynamicObjects((prev) => ({
      ...prev,
      [category]: [...(prev[category] || []), element],
    }));
    setSelectedObject({
      id: element.id,
      name: element.name,
      type: element.type,
    });
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
      };
    });
    if (selectedObject?.id === elementId) {
      setSelectedObject(null);
    }
  };

  // Synchronize discovered scene meshes from loaded GLB with project state (Req 1)
  const handleModelLoaded = (discovered) => {
    if (!discovered) return;

    const savedCustom = modelProject?.customization?.dynamicObjects;

    setDynamicObjects((prev) => {
      const mergeCategory = (discItems, savedItems) => {
        if (!savedItems || savedItems.length === 0) return discItems;
        const savedMap = new Map(savedItems.map((item) => [item.id, item]));
        const merged = discItems.map((item) => {
          const override = savedMap.get(item.id);
          return override ? { ...item, ...override } : item;
        });
        savedItems.forEach((item) => {
          if (item.isNew && !merged.some((m) => m.id === item.id)) {
            merged.push(item);
          }
        });
        return merged;
      };

      return {
        walls: mergeCategory(discovered.walls || [], savedCustom?.walls),
        doors: mergeCategory(discovered.doors || [], savedCustom?.doors),
        windows: mergeCategory(discovered.windows || [], savedCustom?.windows),
        rooms: mergeCategory(discovered.rooms || [], savedCustom?.rooms),
        custom: savedCustom?.custom || prev.custom || [],
      };
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

    commandManager.execute(
      new TransformChangeCommand({
        objectId,
        prevTransform,
        newTransform,
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

  // Universal deletion for any architectural element or wall (Req 1)
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

    commandManager.execute(
      new DeleteElementCommand({
        element,
        onAdd: applyAddObject,
        onRemove: applyDeleteObject,
      })
    );
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
  const handleSaveProject = () => {
    if (!activeTaskId) return;
    const customizationData = {
      dynamicObjects,
      editorState,
      savedAt: Date.now(),
    };
    updateModelProjectCustomization(activeTaskId, customizationData);
    setSaveSuccessMsg("Customization saved to project!");
    setTimeout(() => setSaveSuccessMsg(""), 3000);
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

  // Keyboard shortcuts (Ctrl+Z, Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e) => {
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
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commandManager]);

  const selectedData = getSelectedObjectData();

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#fdfbf7] dark:bg-[#141311] overflow-hidden">
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
      />

      {/* Save Toast Notification */}
      {saveSuccessMsg && (
        <div className="absolute top-20 right-6 z-50 bg-emerald-800 text-white text-xs px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-300" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile Viewport Guard: 3D CAD Editing Unavailable on Mobile */}
        <div className="sm:hidden absolute inset-0 z-50 bg-[#fdfbf7]/98 dark:bg-[#141311]/98 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-orange-100 dark:bg-[#ff7417]/15 text-orange-600 dark:text-[#ff7417] flex items-center justify-center mb-4 border border-orange-200 dark:border-[#ff7417]/30">
            <Layers className="w-7 h-7" />
          </div>
          <h3 className="font-serif text-lg font-bold text-zinc-900 dark:text-[#f5f0e8] mb-2">
            3D CAD Editor Requires Desktop or Tablet
          </h3>
          <p className="text-xs text-zinc-600 dark:text-[#b4ada3] max-w-xs leading-relaxed mb-6">
            Precision 3D modeling, coordinate manipulation, and CAD scene outliner tools require a viewport width of 640px or higher. Please use a tablet or desktop browser to edit this model.
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/projects")}
              className="text-xs"
            >
              Back to Projects
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate("/")}
              className="text-xs"
            >
              Overview
            </Button>
          </div>
        </div>

        {/* Left: Scene Hierarchy Tree Panel */}
        <div className="w-64 border-r border-[#eae4dc] dark:border-[#39342f] h-full hidden md:block shrink-0 dark:bg-[#1d1b19]">
          <SceneHierarchyPanel
            dynamicObjects={dynamicObjects}
            selectedObjectId={selectedObject?.id}
            onSelectObject={setSelectedObject}
            onToggleVisibility={handleToggleVisibility}
            onToggleCategoryVisibility={handleToggleCategoryVisibility}
            categoryVisibility={editorState}
          />
        </div>

        {/* Center: 3D Viewport */}
        <div className="flex-1 h-full relative">
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
                className="absolute top-4 left-4 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/90 dark:bg-[#1d1b19]/90 text-zinc-700 dark:text-[#f5f0e8] border border-[#eae4dc] dark:border-[#39342f] shadow-md backdrop-blur-md hover:bg-orange-50 dark:hover:bg-[#2b2a27] transition-all text-xs font-semibold cursor-pointer"
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
                onObjectSelect={setSelectedObject}
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
                    <div className="px-1 flex items-center justify-between text-[11px] text-zinc-500 dark:text-[#746e65]">
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

        {/* Right: Property Inspector Panel */}
        <div className="w-80 border-l border-[#eae4dc] dark:border-[#39342f] h-full hidden sm:block shrink-0 bg-[#fdfbf7] dark:bg-[#1d1b19]">
          <CadPropertiesPanel
            selectedObject={selectedObject}
            objectData={selectedData}
            onUpdateColor={handleUpdateColor}
            onUpdateProperty={handleUpdateProperty}
            onUpdateTransform={handleUpdateTransform}
            onToggleVisibility={handleToggleVisibility}
            onDeleteObject={handleDeleteObject}
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
          />
        </div>
      </div>

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
    </div>
  );
};

export default CadEditorPage;
