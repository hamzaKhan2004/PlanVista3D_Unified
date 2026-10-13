import React from "react";
import {
  SlidersHorizontal,
  Eye,
  EyeOff,
  Trash2,
  Paintbrush,
  Maximize,
  Compass,
  Info,
} from "lucide-react";
import { ARCHITECTURAL_SWATCHES } from "../../domain/cad/cadTypes";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import SourceBlueprintPanel from "./SourceBlueprintPanel";

const CadPropertiesPanel = ({
  selectedObject,
  objectData,
  onUpdateColor,
  onUpdateProperty,
  onUpdateTransform,
  onToggleVisibility,
  onDeleteObject,
  project,
  taskId,
  onToggleCompare,
  isComparing,
  onSwitchTo2DPlan,
}) => {
  if (!selectedObject) {
    return (
      <div className="p-4 flex flex-col justify-between h-full overflow-y-auto space-y-4">
        <div className="p-4 text-center text-zinc-400 dark:text-[#746e65] flex flex-col items-center justify-center bg-zinc-50 dark:bg-[#141311] rounded-2xl border border-dashed border-zinc-200 dark:border-[#39342f]">
          <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-[#211f1d] flex items-center justify-center mb-2">
            <SlidersHorizontal className="w-5 h-5 text-zinc-400 dark:text-[#a88b7d]" />
          </div>
          <h4 className="font-serif font-bold text-zinc-800 dark:text-[#f5f0e8] text-sm">Property Inspector</h4>
          <p className="text-xs text-zinc-500 dark:text-[#b4ada3] mt-1 max-w-[200px]">
            Select an architectural element in the 3D viewport or hierarchy tree to customize properties.
          </p>
        </div>

        {/* Source Blueprint Information */}
        <SourceBlueprintPanel
          project={project}
          taskId={taskId}
          onToggleCompare={onToggleCompare}
          isComparing={isComparing}
          onSwitchTo2DPlan={onSwitchTo2DPlan}
        />
      </div>
    );
  }

  const { id, name, type } = selectedObject;
  const isVisible = objectData?.visible !== false;
  const currentColor = objectData?.color || "#cccccc";
  const roughness = objectData?.roughness !== undefined ? objectData.roughness : 0.7;
  const metalness = objectData?.metalness !== undefined ? objectData.metalness : 0.1;
  const opacity = objectData?.opacity !== undefined ? objectData.opacity : 1.0;

  const position = objectData?.position || [0, 0, 0];
  const scale = objectData?.scale || [1, 1, 1];

  const handlePositionChange = (axisIndex, value) => {
    const num = parseFloat(value) || 0;
    const nextPos = [...position];
    nextPos[axisIndex] = num;
    onUpdateTransform(id, { position: nextPos, scale });
  };

  const handleScaleChange = (axisIndex, value) => {
    const num = Math.max(0.01, parseFloat(value) || 0.1);
    const nextScale = [...scale];
    nextScale[axisIndex] = num;
    onUpdateTransform(id, { position, scale: nextScale });
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto divide-y divide-[#eae4dc] dark:divide-[#39342f] text-xs text-zinc-700 dark:text-[#e6e2de]">
      {/* Header */}
      <div className="p-4 bg-[#fdfbf7] dark:bg-[#1d1b19]">
        <div className="flex items-center justify-between mb-2">
          <Badge variant="orange" className="capitalize">
            {type || "Element"}
          </Badge>
          <button
            onClick={() => onToggleVisibility(id)}
            title={isVisible ? "Hide element" : "Show element"}
            className={`p-1.5 rounded-lg border transition-colors ${
              isVisible
                ? "bg-white dark:bg-[#211f1d] text-zinc-600 dark:text-[#b4ada3] border-zinc-200 dark:border-[#39342f] hover:text-zinc-900 dark:hover:text-[#f5f0e8]"
                : "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50 hover:bg-red-100"
            }`}
          >
            {isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
        </div>
        <h3 className="font-serif text-base font-bold text-zinc-900 dark:text-[#f5f0e8] truncate">{name}</h3>
        <span className="text-[11px] font-mono text-zinc-400 dark:text-[#746e65] block mt-0.5">{id}</span>
      </div>

      {/* Materials & Colors */}
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-1.5 font-semibold text-zinc-800 dark:text-[#b4ada3] text-[11px] uppercase tracking-wider">
          <Paintbrush className="w-3.5 h-3.5 text-orange-500" />
          <span>Material & Finish</span>
        </div>

        {/* Color picker */}
        <div>
          <label className="block text-[11px] font-medium text-zinc-600 dark:text-[#b4ada3] mb-1.5">Surface Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={currentColor}
              onChange={(e) => onUpdateColor(id, e.target.value)}
              className="w-8 h-8 rounded-lg border border-zinc-200 dark:border-[#39342f] cursor-pointer p-0.5 bg-white dark:bg-[#141311] shrink-0"
            />
            <input
              type="text"
              value={currentColor}
              onChange={(e) => onUpdateColor(id, e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-[#39342f] bg-white dark:bg-[#141311] dark:text-[#f5f0e8] font-mono text-xs uppercase focus:outline-orange-500"
            />
          </div>
        </div>

        {/* Swatches */}
        <div>
          <label className="block text-[11px] font-medium text-zinc-600 dark:text-[#b4ada3] mb-1.5">
            Architectural Presets
          </label>
          <div className="grid grid-cols-5 gap-1.5">
            {ARCHITECTURAL_SWATCHES.map((swatch) => (
              <button
                key={swatch.hex}
                onClick={() => onUpdateColor(id, swatch.hex)}
                title={swatch.name}
                style={{ backgroundColor: swatch.hex }}
                className={`w-full aspect-square rounded-md border transition-all ${
                  currentColor.toLowerCase() === swatch.hex.toLowerCase()
                    ? "ring-2 ring-orange-500 ring-offset-1 border-white dark:ring-offset-[#1d1b19]"
                    : "border-black/10 dark:border-white/10 hover:scale-105"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Roughness & Opacity Sliders */}
        <div className="space-y-3 pt-2">
          <div>
            <div className="flex justify-between text-[11px] font-medium text-zinc-600 dark:text-[#b4ada3] mb-1">
              <span>Roughness</span>
              <span className="font-mono">{Math.round(roughness * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={roughness}
              onChange={(e) => onUpdateProperty(id, "roughness", parseFloat(e.target.value))}
              className="w-full accent-orange-500"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px] font-medium text-zinc-600 dark:text-[#b4ada3] mb-1">
              <span>Metalness</span>
              <span className="font-mono">{Math.round(metalness * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={metalness}
              onChange={(e) => onUpdateProperty(id, "metalness", parseFloat(e.target.value))}
              className="w-full accent-orange-500"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px] font-medium text-zinc-600 dark:text-[#b4ada3] mb-1">
              <span>Opacity</span>
              <span className="font-mono">{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={opacity}
              onChange={(e) => onUpdateProperty(id, "opacity", parseFloat(e.target.value))}
              className="w-full accent-orange-500"
            />
          </div>
        </div>
      </div>

      {/* Position & Dimensions */}
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-1.5 font-semibold text-zinc-800 dark:text-[#b4ada3] text-[11px] uppercase tracking-wider">
          <Maximize className="w-3.5 h-3.5 text-orange-500" />
          <span>Coordinates & Dimensions</span>
        </div>

        {/* Position */}
        <div>
          <label className="block text-[11px] font-medium text-zinc-600 dark:text-[#b4ada3] mb-1.5">Position (m)</label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className="text-[10px] text-zinc-400 dark:text-[#746e65] font-mono">X</span>
              <input
                type="number"
                step="0.1"
                value={Number(position[0]).toFixed(2)}
                onChange={(e) => handlePositionChange(0, e.target.value)}
                className="w-full px-2 py-1 rounded border border-zinc-200 dark:border-[#39342f] bg-white dark:bg-[#141311] dark:text-[#f5f0e8] font-mono text-xs focus:outline-orange-500"
              />
            </div>
            <div>
              <span className="text-[10px] text-zinc-400 dark:text-[#746e65] font-mono">Y</span>
              <input
                type="number"
                step="0.1"
                value={Number(position[1]).toFixed(2)}
                onChange={(e) => handlePositionChange(1, e.target.value)}
                className="w-full px-2 py-1 rounded border border-zinc-200 dark:border-[#39342f] bg-white dark:bg-[#141311] dark:text-[#f5f0e8] font-mono text-xs focus:outline-orange-500"
              />
            </div>
            <div>
              <span className="text-[10px] text-zinc-400 dark:text-[#746e65] font-mono">Z</span>
              <input
                type="number"
                step="0.1"
                value={Number(position[2]).toFixed(2)}
                onChange={(e) => handlePositionChange(2, e.target.value)}
                className="w-full px-2 py-1 rounded border border-zinc-200 dark:border-[#39342f] bg-white dark:bg-[#141311] dark:text-[#f5f0e8] font-mono text-xs focus:outline-orange-500"
              />
            </div>
          </div>
        </div>

        {/* Dimensions / Scale */}
        <div>
          <label className="block text-[11px] font-medium text-zinc-600 dark:text-[#b4ada3] mb-1.5">Dimensions (m)</label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className="text-[10px] text-zinc-400 dark:text-[#746e65] font-mono">L (X)</span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={Number(scale[0]).toFixed(2)}
                onChange={(e) => handleScaleChange(0, e.target.value)}
                className="w-full px-2 py-1 rounded border border-zinc-200 dark:border-[#39342f] bg-white dark:bg-[#141311] dark:text-[#f5f0e8] font-mono text-xs focus:outline-orange-500"
              />
            </div>
            <div>
              <span className="text-[10px] text-zinc-400 dark:text-[#746e65] font-mono">H (Y)</span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={Number(scale[1]).toFixed(2)}
                onChange={(e) => handleScaleChange(1, e.target.value)}
                className="w-full px-2 py-1 rounded border border-zinc-200 dark:border-[#39342f] bg-white dark:bg-[#141311] dark:text-[#f5f0e8] font-mono text-xs focus:outline-orange-500"
              />
            </div>
            <div>
              <span className="text-[10px] text-zinc-400 dark:text-[#746e65] font-mono">W (Z)</span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={Number(scale[2]).toFixed(2)}
                onChange={(e) => handleScaleChange(2, e.target.value)}
                className="w-full px-2 py-1 rounded border border-zinc-200 dark:border-[#39342f] bg-white dark:bg-[#141311] dark:text-[#f5f0e8] font-mono text-xs focus:outline-orange-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Delete / Remove Action */}
      {objectData?.isNew && (
        <div className="p-4 mt-auto">
          <Button
            variant="outline"
            size="sm"
            fullWidth
            onClick={() => onDeleteObject(id)}
            className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-900/40 dark:hover:bg-red-950/20 flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove Custom Element</span>
          </Button>
        </div>
      )}

      {/* Source Blueprint Accordion/Card */}
      <div className="p-4 border-t border-[#eae4dc] dark:border-[#39342f]">
        <SourceBlueprintPanel project={project} taskId={taskId} isCompact />
      </div>
    </div>
  );
};

export default CadPropertiesPanel;
