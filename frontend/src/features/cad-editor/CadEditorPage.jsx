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
  const [editorState, setEditorState] = useState({
    showGrid: true,
    showWireframe: false,
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
        const statusData = await checkTaskStatus(activeTaskId);
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
    setDynamicObjects((prev) => ({
      ...prev,
      custom: [...prev.custom, element],
    }));
    setSelectedObject({
      id: element.id,
      name: element.name,
      type: element.type,
    });
  };

  const applyDeleteObject = (elementId) => {
    setDynamicObjects((prev) => ({
      ...prev,
      custom: prev.custom.filter((o) => o.id !== elementId),
    }));
    if (selectedObject?.id === elementId) {
      setSelectedObject(null);
    }
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
      scale: currentData?.scale || [1, 1, 1],
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

  const handleAddElement = (type) => {
    const id = `custom_${type}_${nextIdCounter.current++}`;
    const dims = DEFAULT_DIMENSIONS[type] || { width: 2, height: 2.8, depth: 0.2 };

    const newElement = {
      id,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${nextIdCounter.current - 1}`,
      type,
      isNew: true,
      visible: true,
      color: "#cccccc",
      roughness: 0.7,
      metalness: 0.1,
      opacity: 1.0,
      position: [(Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6],
      scale: [dims.width, dims.height, dims.depth],
    };

    commandManager.execute(
      new AddElementCommand({
        element: newElement,
        onAdd: applyAddObject,
        onRemove: applyDeleteObject,
      })
    );
  };

  const handleDeleteObject = (elementId) => {
    const element = dynamicObjects.custom.find((o) => o.id === elementId);
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
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#fdfbf7] overflow-hidden">
      {/* Top CAD Studio Bar */}
      <CadToolbar
        transformMode={transformMode}
        onSetTransformMode={setTransformMode}
        onAddElement={handleAddElement}
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
        {/* Left: Scene Hierarchy Tree Panel */}
        <div className="w-64 border-r border-[#eae4dc] h-full hidden md:block shrink-0">
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
            <div className="w-full h-full flex items-center justify-center bg-[#f4eee6]">
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
            <div className="w-full h-full flex items-center justify-center bg-[#f4eee6] p-6">
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
                className="absolute top-4 left-4 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/90 dark:bg-zinc-900/90 text-zinc-700 dark:text-zinc-200 border border-[#eae4dc] dark:border-zinc-800 shadow-md backdrop-blur-md hover:bg-orange-50 dark:hover:bg-zinc-800 transition-all text-xs font-semibold cursor-pointer"
                title="View original blueprint details and inspection"
              >
                <FileText className="w-3.5 h-3.5 text-orange-500" />
                <span>Source Blueprint</span>
              </button>

              <CadViewport
                ref={viewportRef}
                modelUrl={modelUrl}
                editorState={editorState}
                dynamicObjects={dynamicObjects}
                selectedObject={selectedObject}
                onObjectSelect={setSelectedObject}
              />
              <DimensionOverlay
                transformMode={transformMode}
                cameraPreset={cameraPreset}
                selectedObject={selectedObject}
                objectData={selectedData}
              />

              {/* Floating Picture-in-Picture Blueprint Comparison Card */}
              {showCompareOverlay && (modelProject?.sourceThumbnail || modelProject?.sourceDownloadUrl) && (
                <div className="absolute bottom-6 right-6 z-30 w-72 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-2xl border border-[#eae4dc] dark:border-zinc-800 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#eae4dc] dark:border-zinc-800 bg-[#fdfbf7]/80 dark:bg-zinc-900/80">
                    <div className="flex items-center gap-1.5">
                      <SplitSquareVertical className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        2D Blueprint Comparison
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCompareOverlay(false)}
                      className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="p-2 space-y-2">
                    <div className="aspect-4/3 w-full bg-[#f4eee6] dark:bg-zinc-800 rounded-xl overflow-hidden border border-zinc-200/60 dark:border-zinc-700/60">
                      <img
                        src={modelProject.sourceThumbnail || modelProject.sourceDownloadUrl}
                        alt="2D Blueprint Comparison"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="px-1 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span className="truncate max-w-[150px]">{modelProject.fileName || "Blueprint"}</span>
                      <button
                        type="button"
                        onClick={() => setShowSourceModal(true)}
                        className="text-orange-600 dark:text-orange-400 font-semibold hover:underline cursor-pointer"
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
        <div className="w-80 border-l border-[#eae4dc] h-full hidden sm:block shrink-0 bg-[#fdfbf7]">
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
            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Are you sure you want to delete this CAD project?
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                You are about to permanently delete{" "}
                <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                  "{modelProject?.name || `Project ${activeTaskId}`}"
                </span>
                . All 3D geometry meshes, source files, and project configurations will be deleted from storage. This action cannot be undone.
              </p>
            </div>
          </div>

          {deleteProjectError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
              {deleteProjectError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#eae4dc] dark:border-zinc-800">
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
