import React from "react";
import {
  MousePointer,
  Move,
  RotateCw,
  Maximize2,
  Plus,
  Undo2,
  Redo2,
  Camera,
  Grid as GridIcon,
  Box,
  Eye,
  EyeOff,
  Download,
  Save,
  Compass,
  Sparkles,
  Trash2,
} from "lucide-react";
import Button from "../ui/Button";
import { CAMERA_PRESETS, TRANSFORM_MODES } from "../../domain/cad/cadTypes";

const CadToolbar = ({
  transformMode,
  onSetTransformMode,
  onAddElement,
  cameraPreset,
  onSetCameraPreset,
  showGrid,
  onToggleGrid,
  showWireframe,
  onToggleWireframe,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onTakeScreenshot,
  onSaveProject,
  onExportGlb,
  onDeleteProject,
  isSaving = false,
}) => {
  return (
    <div className="bg-[#fdfbf7] dark:bg-[#1d1b19] border-b border-[#eae4dc] dark:border-[#39342f] px-4 py-2 flex flex-wrap items-center justify-between gap-3 shadow-xs">
      {/* Left: Transformation Modes */}
      <div className="flex items-center space-x-1">
        <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-[#a88b7d] mr-1.5 hidden sm:inline">
          Tools
        </span>
        <button
          onClick={() => onSetTransformMode(TRANSFORM_MODES.SELECT)}
          title="Select Tool (V)"
          className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
            transformMode === TRANSFORM_MODES.SELECT
              ? "bg-orange-500 dark:bg-[#ff7417] text-white shadow-xs"
              : "text-zinc-600 dark:text-[#b4ada3] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] dark:hover:text-[#f5f0e8]"
          }`}
        >
          <MousePointer className="w-4 h-4" />
          <span className="hidden md:inline">Select</span>
        </button>
        <button
          onClick={() => onSetTransformMode(TRANSFORM_MODES.TRANSLATE)}
          title="Translate / Move (M)"
          className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
            transformMode === TRANSFORM_MODES.TRANSLATE
              ? "bg-orange-500 dark:bg-[#ff7417] text-white shadow-xs"
              : "text-zinc-600 dark:text-[#b4ada3] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] dark:hover:text-[#f5f0e8]"
          }`}
        >
          <Move className="w-4 h-4" />
          <span className="hidden md:inline">Move</span>
        </button>
        <button
          onClick={() => onSetTransformMode(TRANSFORM_MODES.ROTATE)}
          title="Rotate (R)"
          className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
            transformMode === TRANSFORM_MODES.ROTATE
              ? "bg-orange-500 dark:bg-[#ff7417] text-white shadow-xs"
              : "text-zinc-600 dark:text-[#b4ada3] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] dark:hover:text-[#f5f0e8]"
          }`}
        >
          <RotateCw className="w-4 h-4" />
          <span className="hidden md:inline">Rotate</span>
        </button>
        <button
          onClick={() => onSetTransformMode(TRANSFORM_MODES.SCALE)}
          title="Scale / Resize (S)"
          className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
            transformMode === TRANSFORM_MODES.SCALE
              ? "bg-orange-500 dark:bg-[#ff7417] text-white shadow-xs"
              : "text-zinc-600 dark:text-[#b4ada3] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] dark:hover:text-[#f5f0e8]"
          }`}
        >
          <Maximize2 className="w-4 h-4" />
          <span className="hidden md:inline">Scale</span>
        </button>

        <div className="h-5 w-px bg-zinc-200 dark:bg-[#39342f] mx-2" />

        {/* Add Elements Dropdown/Buttons */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => onAddElement("wall")}
            title="Add Wall Segment"
            className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-[#39342f] text-zinc-700 dark:text-[#e6e2de] bg-white dark:bg-[#211f1d] hover:bg-orange-50 dark:hover:bg-[#ff7417]/15 hover:border-orange-200 dark:hover:border-[#ff7417]/30 hover:text-orange-700 dark:hover:text-[#ffb691] text-xs font-medium flex items-center gap-1 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Wall</span>
          </button>
          <button
            onClick={() => onAddElement("slab")}
            title="Add Floor Slab"
            className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-[#39342f] text-zinc-700 dark:text-[#e6e2de] bg-white dark:bg-[#211f1d] hover:bg-orange-50 dark:hover:bg-[#ff7417]/15 hover:border-orange-200 dark:hover:border-[#ff7417]/30 hover:text-orange-700 dark:hover:text-[#ffb691] text-xs font-medium flex items-center gap-1 transition-all hidden lg:flex"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Slab</span>
          </button>
          <button
            onClick={() => onAddElement("box")}
            title="Add Custom Box Placeholder"
            className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-[#39342f] text-zinc-700 dark:text-[#e6e2de] bg-white dark:bg-[#211f1d] hover:bg-orange-50 dark:hover:bg-[#ff7417]/15 hover:border-orange-200 dark:hover:border-[#ff7417]/30 hover:text-orange-700 dark:hover:text-[#ffb691] text-xs font-medium flex items-center gap-1 transition-all hidden xl:flex"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Box</span>
          </button>
        </div>
      </div>

      {/* Center: Camera Presets & View Controls */}
      <div className="flex items-center space-x-1">
        <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-[#a88b7d] mr-1.5 hidden sm:inline">
          View
        </span>
        <button
          onClick={() => onSetCameraPreset(CAMERA_PRESETS.PERSPECTIVE)}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
            cameraPreset === CAMERA_PRESETS.PERSPECTIVE
              ? "bg-zinc-200 dark:bg-[#2b2a27] text-zinc-900 dark:text-[#f5f0e8] font-semibold"
              : "text-zinc-600 dark:text-[#b4ada3] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] dark:hover:text-[#f5f0e8]"
          }`}
        >
          3D
        </button>
        <button
          onClick={() => onSetCameraPreset(CAMERA_PRESETS.TOP)}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
            cameraPreset === CAMERA_PRESETS.TOP
              ? "bg-zinc-200 dark:bg-[#2b2a27] text-zinc-900 dark:text-[#f5f0e8] font-semibold"
              : "text-zinc-600 dark:text-[#b4ada3] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] dark:hover:text-[#f5f0e8]"
          }`}
        >
          Top
        </button>
        <button
          onClick={() => onSetCameraPreset(CAMERA_PRESETS.FRONT)}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
            cameraPreset === CAMERA_PRESETS.FRONT
              ? "bg-zinc-200 dark:bg-[#2b2a27] text-zinc-900 dark:text-[#f5f0e8] font-semibold"
              : "text-zinc-600 dark:text-[#b4ada3] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] dark:hover:text-[#f5f0e8]"
          }`}
        >
          Front
        </button>
        <button
          onClick={() => onSetCameraPreset(CAMERA_PRESETS.SIDE)}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
            cameraPreset === CAMERA_PRESETS.SIDE
              ? "bg-zinc-200 dark:bg-[#2b2a27] text-zinc-900 dark:text-[#f5f0e8] font-semibold"
              : "text-zinc-600 dark:text-[#b4ada3] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] dark:hover:text-[#f5f0e8]"
          }`}
        >
          Side
        </button>

        <div className="h-5 w-px bg-zinc-200 dark:bg-[#39342f] mx-1.5" />

        {/* Viewport Toggles */}
        <button
          onClick={onToggleGrid}
          title="Toggle Grid"
          className={`p-1.5 rounded-lg text-xs transition-colors ${
            showGrid ? "text-orange-600 dark:text-[#ff7417] bg-orange-50 dark:bg-[#ff7417]/15" : "text-zinc-400 dark:text-[#746e65] hover:text-zinc-700 dark:hover:text-[#e6e2de]"
          }`}
        >
          <GridIcon className="w-4 h-4" />
        </button>
        <button
          onClick={onToggleWireframe}
          title="Toggle Wireframe Mode"
          className={`p-1.5 rounded-lg text-xs transition-colors ${
            showWireframe ? "text-orange-600 dark:text-[#ff7417] bg-orange-50 dark:bg-[#ff7417]/15" : "text-zinc-400 dark:text-[#746e65] hover:text-zinc-700 dark:hover:text-[#e6e2de]"
          }`}
        >
          <Box className="w-4 h-4" />
        </button>
      </div>

      {/* Right: Undo/Redo & Actions */}
      <div className="flex items-center space-x-1.5">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className={`p-2 rounded-lg text-xs transition-colors ${
            canUndo
              ? "text-zinc-700 dark:text-[#e6e2de] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] hover:text-zinc-900 dark:hover:text-[#f5f0e8]"
              : "text-zinc-300 dark:text-[#39342f] cursor-not-allowed"
          }`}
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          className={`p-2 rounded-lg text-xs transition-colors ${
            canRedo
              ? "text-zinc-700 dark:text-[#e6e2de] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] hover:text-zinc-900 dark:hover:text-[#f5f0e8]"
              : "text-zinc-300 dark:text-[#39342f] cursor-not-allowed"
          }`}
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <button
          onClick={onTakeScreenshot}
          title="Capture Viewport Screenshot"
          className="p-2 rounded-lg text-zinc-700 dark:text-[#b4ada3] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] hover:text-zinc-900 dark:hover:text-[#f5f0e8] text-xs transition-colors hidden sm:block"
        >
          <Camera className="w-4 h-4" />
        </button>

        <div className="h-5 w-px bg-zinc-200 dark:bg-[#39342f] mx-1" />

        <Button
          variant="outline"
          size="sm"
          onClick={onSaveProject}
          loading={isSaving}
          className="text-xs font-medium flex items-center gap-1.5 dark:border-[#39342f] dark:text-[#e6e2de] dark:hover:bg-[#211f1d]"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Save</span>
        </Button>

        <Button
          variant="primary"
          size="sm"
          onClick={onExportGlb}
          className="text-xs font-medium flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export GLB</span>
        </Button>

        {onDeleteProject && (
          <button
            type="button"
            onClick={onDeleteProject}
            title="Delete this CAD project"
            aria-label="Delete this CAD project"
            className="p-2 rounded-xl text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer border border-transparent hover:border-red-200 dark:hover:border-red-900/40"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default CadToolbar;
