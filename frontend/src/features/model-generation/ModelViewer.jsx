import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Eye,
  EyeOff,
  Download,
  Camera,
  RotateCcw,
  Sun,
  Grid as GridIcon,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Layers,
  ArrowLeft,
  SlidersHorizontal,
} from "lucide-react";
import Advanced3DEditor from "./Advanced3DEditor";
import Button from "../../components/ui/Button";
import { checkTaskStatus, getModelDownloadUrl } from "../../lib/api/modelApi";

const ModelViewer = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingMode, setEditingMode] = useState(true);
  const [selectedObject, setSelectedObject] = useState(null);
  const [showToolsPanel, setShowToolsPanel] = useState(true);

  const editorRef = useRef(null);

  // Editor configuration state
  const [editorState, setEditorState] = useState({
    wallColor: "#cccccc",
    showGrid: true,
    showWireframe: false,
    lighting: "default",
    wallsVisible: true,
    doorsVisible: true,
    windowsVisible: true,
    roomsVisible: true,
  });

  // Dynamic meshes state
  const [dynamicObjects, setDynamicObjects] = useState({
    walls: [],
    doors: [],
    windows: [],
    rooms: [],
  });

  const [nextId, setNextId] = useState({
    wall: 0,
    door: 0,
    window: 0,
    room: 0,
  });

  useEffect(() => {
    let isCancelled = false;

    const poll = async () => {
      try {
        const data = await checkTaskStatus(taskId);
        if (isCancelled) return;
        setStatus(data);

        if (data.status === "completed") {
          setLoading(false);

          if (data.analysis) {
            const walls = Array.from(
              { length: data.analysis.walls_detected || 0 },
              (_, i) => ({
                id: `wall_${i}`,
                name: `Wall ${i + 1}`,
                visible: true,
                color: "#cccccc",
                isOriginal: true,
              })
            );

            const doors = Array.from(
              { length: data.analysis.doors_detected || 0 },
              (_, i) => ({
                id: `door_${i}`,
                name: `Door ${i + 1}`,
                visible: true,
                color: "#8B4513",
                isOriginal: true,
              })
            );

            const windows = Array.from(
              { length: data.analysis.windows_detected || 0 },
              (_, i) => ({
                id: `window_${i}`,
                name: `Window ${i + 1}`,
                visible: true,
                color: "#87CEEB",
                isOriginal: true,
              })
            );

            const rooms = Array.from(
              { length: data.analysis.rooms_detected || 0 },
              (_, i) => ({
                id: `room_${i}`,
                name: `Room ${i + 1}`,
                visible: true,
                color: "#e2d9cc",
                isOriginal: true,
              })
            );

            setDynamicObjects({ walls, doors, windows, rooms });
            setNextId({
              wall: data.analysis.walls_detected || 0,
              door: data.analysis.doors_detected || 0,
              window: data.analysis.windows_detected || 0,
              room: data.analysis.rooms_detected || 0,
            });
          }
        } else if (data.status === "error") {
          setError(data.error || "Generation task encountered an error.");
          setLoading(false);
        }
      } catch (err) {
        if (!isCancelled) {
          setError("Failed to reach processing service to check task status.");
          setLoading(false);
        }
      }
    };

    const interval = setInterval(poll, 2000);
    poll();

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [taskId]);

  const addWall = () => {
    const newWallId = `wall_${nextId.wall}`;
    const newWall = {
      id: newWallId,
      name: `Wall ${nextId.wall + 1}`,
      visible: true,
      color: editorState.wallColor,
      isNew: true,
      position: [Math.random() * 4 - 2, 0, Math.random() * 4 - 2],
      scale: [2.5, 3.2, 0.25],
    };

    setDynamicObjects((prev) => ({
      ...prev,
      walls: [...prev.walls, newWall],
    }));

    setNextId((prev) => ({
      ...prev,
      wall: prev.wall + 1,
    }));

    setSelectedObject({
      id: newWallId,
      name: newWall.name,
      type: "wall",
    });
  };

  const removeSelectedObject = () => {
    if (!selectedObject) return;
    const catKey = selectedObject.type + "s";

    setDynamicObjects((prev) => ({
      ...prev,
      [catKey]: prev[catKey]?.filter((o) => o.id !== selectedObject.id) || [],
    }));

    setSelectedObject(null);
  };

  const toggleCategoryVisibility = (category) => {
    const key = `${category}Visible`;
    const nextVal = !editorState[key];
    setEditorState((prev) => ({ ...prev, [key]: nextVal }));

    setDynamicObjects((prev) => ({
      ...prev,
      [category]: prev[category].map((o) => ({ ...o, visible: nextVal })),
    }));
  };

  const updateObjectColor = (color) => {
    if (!selectedObject) return;
    const catKey = selectedObject.type + "s";

    setDynamicObjects((prev) => ({
      ...prev,
      [catKey]: prev[catKey].map((o) =>
        o.id === selectedObject.id ? { ...o, color } : o
      ),
    }));

    setEditorState((prev) => ({ ...prev, wallColor: color }));
  };

  const downloadModel = async () => {
    if (status.model_file) {
      try {
        const downloadUrl = getModelDownloadUrl(status.model_file);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.setAttribute("download", status.model_file);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        console.error("Failed to download model:", err);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-[75vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="card-warm max-w-md w-full p-8 shadow-warm flex flex-col items-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center">
            <Box className="w-7 h-7 animate-bounce" />
          </div>
          <div>
            <h2 className="font-serif text-2xl font-bold text-zinc-900">
              Generating 3D Model...
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              Task ID: <code className="text-zinc-700 bg-zinc-100 px-1 py-0.5 rounded">{taskId.slice(0, 8)}</code>
            </p>
          </div>
          <div className="w-full space-y-2">
            <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 transition-all duration-300 rounded-full"
                style={{ width: `${Math.max(status.progress || 15, 15)}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500 font-medium capitalize">
              Status: {status.status || "Executing Blender geometry pipeline..."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[75vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="card-warm max-w-md w-full p-8 shadow-warm border-red-200 bg-red-50/30 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
            <Box className="w-6 h-6" />
          </div>
          <h2 className="font-serif text-2xl font-bold text-zinc-900">
            Generation Error
          </h2>
          <p className="text-xs text-red-700 leading-relaxed bg-white/80 p-3 rounded-xl border border-red-200">
            {error}
          </p>
          <div className="pt-2">
            <Button variant="primary" size="md" onClick={() => navigate("/generate-model")}>
              Try Another Blueprint
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const modelUrl = getModelDownloadUrl(status.model_file);

  return (
    <div className="relative w-full h-[calc(100vh-4.5rem)] flex flex-col overflow-hidden bg-[#f7f5ef]">
      {/* Top Floating Control Bar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 bg-white/95 backdrop-blur-md border border-[#eae4dc] px-5 py-3 rounded-2xl shadow-warm">
        {/* Left: Title & Navigation */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="font-serif text-xl font-bold text-zinc-900 leading-none">
              3D Blueprint Model
            </h1>
            <span className="text-[10px] text-zinc-500 font-medium">
              Pipeline: {status.analysis?.pipeline?.toUpperCase() || "CAD"} • {status.analysis?.floors ? `${status.analysis.floors} Floors` : "Interactive Mesh"}
            </span>
          </div>
        </div>

        {/* Center: Camera & View Presets */}
        <div className="hidden md:flex items-center space-x-1.5 bg-[#fdfbf7] p-1 rounded-xl border border-[#eae4dc]">
          <button
            onClick={() => editorRef.current?.resetCamera()}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg text-zinc-700 hover:bg-white hover:shadow-xs transition-all cursor-pointer"
            title="Reset Perspective Camera"
          >
            Perspective
          </button>
          <button
            onClick={() => editorRef.current?.setTopView()}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg text-zinc-700 hover:bg-white hover:shadow-xs transition-all cursor-pointer"
            title="Top-Down Plan View"
          >
            Top View
          </button>
          <button
            onClick={() => editorRef.current?.setFrontView()}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg text-zinc-700 hover:bg-white hover:shadow-xs transition-all cursor-pointer"
            title="Front Elevation"
          >
            Front
          </button>
          <button
            onClick={() => editorRef.current?.setSideView()}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg text-zinc-700 hover:bg-white hover:shadow-xs transition-all cursor-pointer"
            title="Side Elevation"
          >
            Side
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center space-x-2">
          {/* Wireframe Toggle */}
          <button
            onClick={() =>
              setEditorState((prev) => ({
                ...prev,
                showWireframe: !prev.showWireframe,
              }))
            }
            className={`p-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
              editorState.showWireframe
                ? "bg-orange-50 border-orange-300 text-orange-600"
                : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50"
            }`}
            title="Toggle Wireframe Mode"
          >
            <GridIcon className="w-4 h-4" />
          </button>

          {/* Screenshot */}
          <button
            onClick={() => editorRef.current?.takeScreenshot()}
            className="p-2 rounded-xl text-xs font-medium bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
            title="Capture Canvas Screenshot"
          >
            <Camera className="w-4 h-4" />
          </button>

          {/* Download GLB */}
          <Button
            variant="primary"
            size="sm"
            onClick={downloadModel}
            className="flex items-center gap-1.5 shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export GLB</span>
          </Button>

          {/* Tool Panel Toggle */}
          <button
            onClick={() => setShowToolsPanel(!showToolsPanel)}
            className="p-2 rounded-xl bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
            title="Toggle Controls Sidebar"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main 3D Canvas Area */}
      <div className="w-full h-full">
        <Advanced3DEditor
          ref={editorRef}
          modelUrl={modelUrl}
          editingMode={editingMode}
          editorState={editorState}
          dynamicObjects={dynamicObjects}
          onObjectSelect={setSelectedObject}
          selectedObject={selectedObject}
        />
      </div>

      {/* Floating Collapsible Sidebar for Inspector & Mesh Controls */}
      {showToolsPanel && (
        <div className="absolute right-4 top-24 bottom-6 w-80 z-20 flex flex-col bg-white/95 backdrop-blur-md border border-[#eae4dc] rounded-2xl shadow-warm overflow-hidden">
          <div className="p-4 border-b border-[#eae4dc] flex items-center justify-between">
            <span className="font-serif text-lg font-bold text-zinc-900">
              3D Inspector & Tools
            </span>
            <span className="text-[10px] uppercase font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
              Interactive
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6 text-sm">
            {/* Category Visibility */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2.5">
                Category Visibility
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => toggleCategoryVisibility("walls")}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                    editorState.wallsVisible
                      ? "bg-orange-50/60 border-orange-200 text-zinc-900 font-semibold"
                      : "bg-zinc-50 border-zinc-200 text-zinc-400"
                  }`}
                >
                  <span>Walls</span>
                  {editorState.wallsVisible ? <Eye className="w-3.5 h-3.5 text-orange-600" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>

                <button
                  onClick={() => toggleCategoryVisibility("doors")}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                    editorState.doorsVisible
                      ? "bg-orange-50/60 border-orange-200 text-zinc-900 font-semibold"
                      : "bg-zinc-50 border-zinc-200 text-zinc-400"
                  }`}
                >
                  <span>Doors</span>
                  {editorState.doorsVisible ? <Eye className="w-3.5 h-3.5 text-orange-600" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>

                <button
                  onClick={() => toggleCategoryVisibility("windows")}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                    editorState.windowsVisible
                      ? "bg-orange-50/60 border-orange-200 text-zinc-900 font-semibold"
                      : "bg-zinc-50 border-zinc-200 text-zinc-400"
                  }`}
                >
                  <span>Windows</span>
                  {editorState.windowsVisible ? <Eye className="w-3.5 h-3.5 text-orange-600" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>

                <button
                  onClick={() => toggleCategoryVisibility("rooms")}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                    editorState.roomsVisible
                      ? "bg-orange-50/60 border-orange-200 text-zinc-900 font-semibold"
                      : "bg-zinc-50 border-zinc-200 text-zinc-400"
                  }`}
                >
                  <span>Floors</span>
                  {editorState.roomsVisible ? <Eye className="w-3.5 h-3.5 text-orange-600" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Selected Mesh Editor */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2.5">
                Mesh Inspector
              </h4>
              {selectedObject ? (
                <div className="bg-[#fdfbf7] p-4 rounded-xl border border-[#eae4dc] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-zinc-900 text-sm">{selectedObject.name}</p>
                      <span className="text-[10px] uppercase font-bold text-zinc-500">{selectedObject.type}</span>
                    </div>
                    <button
                      onClick={removeSelectedObject}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Delete Object"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-600 mb-1.5">Color Palette</label>
                    <div className="flex items-center gap-1.5">
                      {["#ffffff", "#cccccc", "#f97316", "#3b82f6", "#10b981", "#8b5cf6", "#1f2937"].map((color) => (
                        <button
                          key={color}
                          onClick={() => updateObjectColor(color)}
                          className="w-6 h-6 rounded-full border border-zinc-300 hover:scale-110 transition-transform cursor-pointer"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-zinc-500 italic bg-[#fdfbf7] p-3 rounded-xl border border-[#eae4dc]">
                  Click on any wall, door, or room in the 3D canvas to select and edit properties.
                </p>
              )}
            </div>

            {/* Quick Actions */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2.5">
                Model Actions
              </h4>
              <div className="space-y-2">
                <Button
                  variant="secondary"
                  size="sm"
                  fullWidth
                  onClick={addWall}
                  className="flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5 text-orange-600" />
                  <span>Insert Parametric Wall</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelViewer;
