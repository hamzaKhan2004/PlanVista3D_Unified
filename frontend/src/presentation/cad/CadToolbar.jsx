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
  Image as ImageIcon,
  Layers,
  SlidersHorizontal,
  QrCode,
} from "lucide-react";
import Button from "../ui/Button";
import { CAMERA_PRESETS, TRANSFORM_MODES } from "../../domain/cad/cadTypes";

const CadToolbar = ({
  transformMode,
  onSetTransformMode,
  isDrawingWall = false,
  onToggleDrawWall,
  cameraPreset,
  onSetCameraPreset,
  showGrid,
  onToggleGrid,
  showWireframe,
  onToggleWireframe,
  showBlueprint = true,
  onToggleBlueprint,
  blueprintOpacity = 0.65,
  onChangeBlueprintOpacity,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onTakeScreenshot,
  onSaveProject,
  onExportGlb,
  onDeleteProject,
  isSaving = false,
  isLeftPanelOpen = true,
  onToggleLeftPanel,
  isRightPanelOpen = true,
  onToggleRightPanel,
  onOpenArScanner,
}) => {
  return (
    <div className="bg-[#fdfbf7] dark:bg-[#1d1b19] border-b border-[#eae4dc] dark:border-[#39342f] px-3 sm:px-4 py-2 flex items-center justify-between gap-2 sm:gap-3 shadow-xs overflow-x-auto overflow-y-hidden scrollbar-none">
      {/* Left: Transformation Modes & Wall Placement */}
      <div className="flex items-center space-x-1 shrink-0">
        {onToggleLeftPanel && (
          <button
            type="button"
            onClick={onToggleLeftPanel}
            title={isLeftPanelOpen ? "Hide Scene Hierarchy" : "Show Scene Hierarchy"}
            className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer mr-1 ${
              isLeftPanelOpen
                ? "bg-orange-100/80 dark:bg-[#ff7417]/20 text-orange-700 dark:text-[#ff7417]"
                : "text-zinc-600 dark:text-[#b4ada3] hover:bg-zinc-100 dark:hover:bg-[#2b2a27]"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span className="hidden xl:inline">Hierarchy</span>
          </button>
        )}
        <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-[#a88b7d] mr-1.5 hidden sm:inline">
          Tools
        </span>
        <button
          onClick={() => onSetTransformMode(TRANSFORM_MODES.SELECT)}
          title="Select Tool (V)"
          className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
            transformMode === TRANSFORM_MODES.SELECT && !isDrawingWall
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
          className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
            transformMode === TRANSFORM_MODES.TRANSLATE && !isDrawingWall
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
          className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
            transformMode === TRANSFORM_MODES.ROTATE && !isDrawingWall
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
          className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
            transformMode === TRANSFORM_MODES.SCALE && !isDrawingWall
              ? "bg-orange-500 dark:bg-[#ff7417] text-white shadow-xs"
              : "text-zinc-600 dark:text-[#b4ada3] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] dark:hover:text-[#f5f0e8]"
          }`}
        >
          <Maximize2 className="w-4 h-4" />
          <span className="hidden md:inline">Scale</span>
        </button>

        <div className="h-5 w-px bg-zinc-200 dark:bg-[#39342f] mx-2" />

        {/* Dedicated Wall Placement Tool (+ Wall directly on ground) */}
        <button
          onClick={onToggleDrawWall}
          title="Draw Wall Directly on 3D Ground (+ Wall)"
          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
            isDrawingWall
              ? "bg-orange-600 text-white border-orange-600 shadow-sm animate-pulse"
              : "border-zinc-200 dark:border-[#39342f] text-zinc-700 dark:text-[#e6e2de] bg-white dark:bg-[#211f1d] hover:bg-orange-50 dark:hover:bg-[#ff7417]/15 hover:border-orange-200 dark:hover:border-[#ff7417]/30 hover:text-orange-700 dark:hover:text-[#ffb691]"
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>+ Wall</span>
          {isDrawingWall && <span className="text-[10px] bg-white/20 px-1 rounded">DRAWING</span>}
        </button>
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
            showGrid ? "text-orange-600 dark:text-[#ff7417] bg-orange-50 dark:bg-[#ff7417]/15" : "text-zinc-400 dark:text-[#b4ada3] hover:text-zinc-700 dark:hover:text-[#e6e2de]"
          }`}
        >
          <GridIcon className="w-4 h-4" />
        </button>
        <button
          onClick={onToggleWireframe}
          title="Toggle Wireframe Mode"
          className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
            showWireframe ? "text-orange-600 dark:text-[#ff7417] bg-orange-50 dark:bg-[#ff7417]/15" : "text-zinc-400 dark:text-[#b4ada3] hover:text-zinc-700 dark:hover:text-[#e6e2de]"
          }`}
        >
          <Box className="w-4 h-4" />
        </button>

        <button
          onClick={onToggleBlueprint}
          title={showBlueprint ? "Hide Blueprint Ground Overlay" : "Show Blueprint Ground Overlay"}
          className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
            showBlueprint
              ? "text-orange-600 dark:text-[#ff7417] bg-orange-50 dark:bg-[#ff7417]/15 font-semibold"
              : "text-zinc-400 dark:text-[#b4ada3] hover:text-zinc-700 dark:hover:text-[#e6e2de]"
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span className="hidden lg:inline text-[11px]">Blueprint</span>
        </button>

        {showBlueprint && onChangeBlueprintOpacity && (
          <div className="hidden xl:flex items-center gap-1.5 pl-1">
            <span className="text-[10px] text-zinc-400 dark:text-[#b4ada3] font-mono">
              {Math.round(blueprintOpacity * 100)}%
            </span>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={blueprintOpacity}
              onChange={(e) => onChangeBlueprintOpacity(parseFloat(e.target.value))}
              title="Blueprint Overlay Opacity"
              className="w-14 h-1.5 accent-orange-500 cursor-pointer"
            />
          </div>
        )}
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
        {onToggleRightPanel && (
          <button
            type="button"
            onClick={onToggleRightPanel}
            title={isRightPanelOpen ? "Hide Properties Panel" : "Show Properties Panel"}
            className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
              isRightPanelOpen
                ? "bg-orange-100/80 dark:bg-[#ff7417]/20 text-orange-700 dark:text-[#ff7417]"
                : "text-zinc-600 dark:text-[#b4ada3] hover:bg-zinc-100 dark:hover:bg-[#2b2a27]"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden xl:inline">Properties</span>
          </button>
        )}

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

        {onOpenArScanner && (
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenArScanner}
            className="text-xs font-medium flex items-center gap-1.5 dark:border-[#39342f] text-orange-600 dark:text-[#ff9d54] hover:bg-orange-50 dark:hover:bg-[#ff7417]/15"
            title="Launch mobile AR Scanner & QR Code"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span className="hidden md:inline">AR View</span>
          </Button>
        )}

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
