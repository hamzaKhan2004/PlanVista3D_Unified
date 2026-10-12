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
} from "lucide-react";
import CadToolbar from "../../presentation/cad/CadToolbar";
import CadPropertiesPanel from "../../presentation/cad/CadPropertiesPanel";
import SceneHierarchyPanel from "../../presentation/cad/SceneHierarchyPanel";
import DimensionOverlay from "../../presentation/cad/DimensionOverlay";
import CadViewport from "./CadViewport";
import Button from "../../presentation/ui/Button";
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

          // Ensure project is registered in localStorage
          saveModelProject({
            id: activeTaskId,
            taskId: activeTaskId,
            name: localProj?.name || `Residence CAD ${activeTaskId.slice(0, 8)}`,
            model_file: modelFile,
            analysis,
            status: "completed",
          });
        } else if (statusData.status === "error") {
          setError(statusData.error || "Model generation encountered an error");
        }
      } catch (err) {
        console.warn("Status poll error in CAD editor:", err);
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
    <div className="flex flex-col h-[calc(100vh-4.5rem)] bg-[#fdfbf7] overflow-hidden">
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
          />
        </div>
      </div>
    </div>
  );
};

export default CadEditorPage;
