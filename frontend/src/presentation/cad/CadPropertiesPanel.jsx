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
  Image as ImageIcon,
  ChevronRight,
} from "lucide-react";
import { ARCHITECTURAL_SWATCHES } from "../../domain/cad/cadTypes";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import SourceBlueprintPanel from "./SourceBlueprintPanel";

const CadPropertiesPanel = ({
  selectedObject,
  selectedObjects = [],
  objectData,
  allSelectedData = [],
  onUpdateColor,
  onBatchUpdateColor,
  onUpdateProperty,
  onBatchUpdateProperty,
  onUpdateTransform,
  onToggleVisibility,
  onBatchToggleVisibility,
  onDeleteObject,
  onDeleteObjects,
  onClearSelection,
  project,
  taskId,
  onToggleCompare,
  isComparing,
  onSwitchTo2DPlan,
  showBlueprint = true,
  onToggleBlueprint,
  blueprintOpacity = 0.65,
  onChangeBlueprintOpacity,
  onCollapse,
}) => {
  if (!selectedObject && (!selectedObjects || selectedObjects.length === 0)) {
    return (
      <div className="p-4 flex flex-col justify-between h-full overflow-y-auto space-y-4">
        {onCollapse && (
          <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-[#39342f]/80">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCollapse();
                }}
                title="Collapse Property Inspector (Right Panel)"
                aria-label="Collapse Property Inspector"
                className="p-1 rounded-lg text-zinc-400 dark:text-[#746e65] hover:text-zinc-700 dark:hover:text-[#f5f0e8] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-semibold text-zinc-500 dark:text-[#746e65] uppercase tracking-wider">
                Properties
              </span>
            </div>
          </div>
        )}
        <div className="p-4 text-center text-zinc-400 dark:text-[#746e65] flex flex-col items-center justify-center bg-zinc-50 dark:bg-[#141311] rounded-2xl border border-dashed border-zinc-200 dark:border-[#39342f]">
          <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-[#211f1d] flex items-center justify-center mb-2">
            <SlidersHorizontal className="w-5 h-5 text-zinc-400 dark:text-[#a88b7d]" />
          </div>
          <h4 className="font-serif font-bold text-zinc-800 dark:text-[#f5f0e8] text-sm">Property Inspector</h4>
          <p className="text-xs text-zinc-500 dark:text-[#b4ada3] mt-1 max-w-[200px]">
            Select an architectural element in the 3D viewport or hierarchy tree to customize properties.
          </p>
        </div>

        {/* Blueprint Ground Overlay Calibration Card (Req 3) */}
        <div className="p-4 bg-white dark:bg-[#211f1d] rounded-2xl border border-[#eae4dc] dark:border-[#39342f] shadow-warm-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-orange-100 dark:bg-[#ff7417]/20 text-orange-600 dark:text-[#ff7417] flex items-center justify-center">
                <ImageIcon className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-serif font-bold text-xs text-zinc-900 dark:text-[#f5f0e8] leading-none">
                  Blueprint Overlay
                </h4>
                <span className="text-[10px] text-zinc-500 dark:text-[#746e65]">
                  3D Viewport Floor Reference
                </span>
              </div>
            </div>

            <button
              onClick={onToggleBlueprint}
              title={showBlueprint ? "Hide Blueprint Ground Overlay" : "Show Blueprint Ground Overlay"}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                showBlueprint
                  ? "bg-orange-50 dark:bg-[#ff7417]/15 text-orange-600 dark:text-[#ff7417] border-orange-200 dark:border-orange-900/60"
                  : "bg-zinc-50 dark:bg-[#2b2a27] text-zinc-400 dark:text-[#746e65] border-zinc-200 dark:border-[#39342f]"
              }`}
            >
              {showBlueprint ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
          </div>

          {showBlueprint && (
            <div className="pt-2 border-t border-zinc-100 dark:border-[#39342f]/80 space-y-2">
              <div className="flex justify-between text-[11px] font-medium text-zinc-600 dark:text-[#b4ada3]">
                <span>Overlay Opacity</span>
                <span className="font-mono">{Math.round((blueprintOpacity ?? 0.65) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={blueprintOpacity ?? 0.65}
                onChange={(e) => onChangeBlueprintOpacity?.(parseFloat(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer"
              />
            </div>
          )}
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

  if (selectedObjects && selectedObjects.length > 1) {
    const selectedIds = selectedObjects.map((o) => o.id);
    const dataList = allSelectedData.length > 0 ? allSelectedData : [objectData].filter(Boolean);

    // Color analysis
    const colors = dataList.map((d) => d.color || "#cccccc");
    const isColorMixed = new Set(colors).size > 1;
    const commonColor = isColorMixed ? "" : colors[0] || "#cccccc";

    // Roughness analysis
    const roughnessVals = dataList.map((d) => d.roughness ?? 0.7);
    const isRoughnessMixed = new Set(roughnessVals.map((v) => Math.round(v * 100))).size > 1;
    const avgRoughness = roughnessVals.reduce((a, b) => a + b, 0) / (roughnessVals.length || 1);

    // Metalness analysis
    const metalnessVals = dataList.map((d) => d.metalness ?? 0.1);
    const isMetalnessMixed = new Set(metalnessVals.map((v) => Math.round(v * 100))).size > 1;
    const avgMetalness = metalnessVals.reduce((a, b) => a + b, 0) / (metalnessVals.length || 1);

    // Opacity analysis
    const opacityVals = dataList.map((d) => d.opacity ?? 1.0);
    const isOpacityMixed = new Set(opacityVals.map((v) => Math.round(v * 100))).size > 1;
    const avgOpacity = opacityVals.reduce((a, b) => a + b, 0) / (opacityVals.length || 1);

    // Visibility
    const anyVisible = dataList.some((d) => d.visible !== false);

    // Category summary (e.g., "3 Walls, 1 Floor")
    const typeCounts = {};
    selectedObjects.forEach((o) => {
      const t = o.type === "floor" ? "Floor" : o.type === "wall" ? "Wall" : o.type || "Element";
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    });
    const typeSummary = Object.entries(typeCounts)
      .map(([t, count]) => `${count} ${t}${count > 1 ? "s" : ""}`)
      .join(", ");

    return (
      <div className="flex flex-col h-full overflow-y-auto divide-y divide-[#eae4dc] dark:divide-[#39342f] text-xs text-zinc-700 dark:text-[#e6e2de]">
        {/* Header */}
        <div className="p-4 bg-[#fdfbf7] dark:bg-[#1d1b19]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {onCollapse && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCollapse();
                  }}
                  title="Collapse Property Inspector (Right Panel)"
                  aria-label="Collapse Property Inspector"
                  className="p-1 rounded-lg text-zinc-400 dark:text-[#746e65] hover:text-zinc-700 dark:hover:text-[#f5f0e8] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
              <Badge variant="orange">Multi-Selection</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onBatchToggleVisibility?.(selectedIds, !anyVisible)}
                title={anyVisible ? "Hide all selected elements" : "Show all selected elements"}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                  anyVisible
                    ? "bg-white dark:bg-[#211f1d] text-zinc-600 dark:text-[#b4ada3] border-zinc-200 dark:border-[#39342f] hover:text-zinc-900 dark:hover:text-[#f5f0e8]"
                    : "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50 hover:bg-red-100"
                }`}
              >
                {anyVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <h3 className="font-serif text-base font-bold text-zinc-900 dark:text-[#f5f0e8]">
            {selectedObjects.length} Elements Selected
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-[#746e65] mt-0.5">
            {typeSummary}
          </p>
          {onClearSelection && (
            <button
              type="button"
              onClick={onClearSelection}
              className="mt-2 text-xs text-orange-600 dark:text-[#ff7417] hover:underline font-semibold cursor-pointer block"
            >
              Clear Selection
            </button>
          )}
        </div>

        {/* Batch Material & Finish */}
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-800 dark:text-[#b4ada3] text-[11px] uppercase tracking-wider">
            <Paintbrush className="w-3.5 h-3.5 text-orange-500" />
            <span>Batch Material & Finish</span>
          </div>

          {/* Color picker */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-medium text-zinc-600 dark:text-[#b4ada3]">
                Surface Color
              </label>
              {isColorMixed && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-900/50">
                  Mixed Values
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={isColorMixed ? "#888888" : (commonColor || "#cccccc")}
                onChange={(e) => onBatchUpdateColor?.(selectedIds, e.target.value)}
                className="w-8 h-8 rounded-lg border border-zinc-200 dark:border-[#39342f] cursor-pointer p-0.5 bg-white dark:bg-[#141311] shrink-0"
              />
              <input
                type="text"
                value={isColorMixed ? "Mixed Colors" : commonColor}
                placeholder={isColorMixed ? "Mixed" : "#CCCCCC"}
                onChange={(e) => onBatchUpdateColor?.(selectedIds, e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-[#39342f] bg-white dark:bg-[#141311] dark:text-[#f5f0e8] font-mono text-xs uppercase focus:outline-orange-500"
              />
            </div>
          </div>

          {/* Swatches */}
          <div>
            <label className="block text-[11px] font-medium text-zinc-600 dark:text-[#b4ada3] mb-1.5">
              Apply Preset to All Selected
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {ARCHITECTURAL_SWATCHES.map((swatch) => (
                <button
                  key={swatch.hex}
                  onClick={() => onBatchUpdateColor?.(selectedIds, swatch.hex)}
                  title={swatch.name}
                  style={{ backgroundColor: swatch.hex }}
                  className={`w-full aspect-square rounded-md border transition-all cursor-pointer ${
                    !isColorMixed && commonColor.toLowerCase() === swatch.hex.toLowerCase()
                      ? "ring-2 ring-orange-500 ring-offset-1 border-white dark:ring-offset-[#1d1b19]"
                      : "border-black/10 dark:border-white/10 hover:scale-105"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Roughness, Metalness, Opacity */}
          <div className="space-y-3 pt-2">
            <div>
              <div className="flex justify-between text-[11px] font-medium text-zinc-600 dark:text-[#b4ada3] mb-1">
                <span>Roughness</span>
                <span className="font-mono text-[10px]">
                  {isRoughnessMixed ? "Mixed" : `${Math.round(avgRoughness * 100)}%`}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isRoughnessMixed ? 0.7 : avgRoughness}
                onChange={(e) => onBatchUpdateProperty?.(selectedIds, "roughness", parseFloat(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-medium text-zinc-600 dark:text-[#b4ada3] mb-1">
                <span>Metalness</span>
                <span className="font-mono text-[10px]">
                  {isMetalnessMixed ? "Mixed" : `${Math.round(avgMetalness * 100)}%`}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMetalnessMixed ? 0.1 : avgMetalness}
                onChange={(e) => onBatchUpdateProperty?.(selectedIds, "metalness", parseFloat(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-medium text-zinc-600 dark:text-[#b4ada3] mb-1">
                <span>Opacity</span>
                <span className="font-mono text-[10px]">
                  {isOpacityMixed ? "Mixed" : `${Math.round(avgOpacity * 100)}%`}
                </span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={isOpacityMixed ? 1.0 : avgOpacity}
                onChange={(e) => onBatchUpdateProperty?.(selectedIds, "opacity", parseFloat(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* 3D Transform Information */}
        <div className="p-4 space-y-2">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-800 dark:text-[#b4ada3] text-[11px] uppercase tracking-wider">
            <Maximize className="w-3.5 h-3.5 text-orange-500" />
            <span>Transform & Coordinates</span>
          </div>
          <div className="p-2.5 rounded-xl bg-orange-50/60 dark:bg-[#ff7417]/10 border border-orange-100 dark:border-[#ff7417]/20 text-[11px] text-zinc-600 dark:text-[#b4ada3] leading-relaxed">
            3D Gizmo transforms (Move / Rotate / Scale) are anchored to the primary selected element:{" "}
            <span className="font-semibold text-zinc-900 dark:text-[#f5f0e8]">
              {selectedObject?.name || selectedObjects[0]?.name}
            </span>
            . Material colors and surface properties apply uniformly to all {selectedObjects.length} selected elements.
          </div>
        </div>

        {/* Delete All Selected Elements */}
        <div className="p-4 mt-auto">
          <Button
            variant="outline"
            size="sm"
            fullWidth
            onClick={() => {
              if (onDeleteObjects) {
                onDeleteObjects(selectedIds);
              } else {
                selectedIds.forEach((id) => onDeleteObject(id));
              }
            }}
            className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-900/40 dark:hover:bg-red-950/20 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete {selectedObjects.length} Selected Elements</span>
          </Button>
        </div>

        {/* Source Blueprint Accordion/Card */}
        <div className="p-4 border-t border-[#eae4dc] dark:border-[#39342f]">
          <SourceBlueprintPanel project={project} taskId={taskId} isCompact />
        </div>
      </div>
    );
  }

  const { id, name, type } = selectedObject;
  const isWall = type === "wall" || id.toLowerCase().includes("wall");
  const isFloor = type === "floor" || id.toLowerCase().includes("floor") || id.toLowerCase().includes("slab");
  const isVisible = objectData?.visible !== false;
  const currentColor = objectData?.color || "#cccccc";
  const roughness = objectData?.roughness !== undefined ? objectData.roughness : 0.7;
  const metalness = objectData?.metalness !== undefined ? objectData.metalness : 0.1;
  const opacity = objectData?.opacity !== undefined ? objectData.opacity : 1.0;

  const position = objectData?.position || [0, 0, 0];
  const scale = objectData?.scale || [1, 1, 1];
  const dimensions = objectData?.dimensions || {
    length: scale[0] || 3,
    height: scale[1] || 2.8,
    thickness: scale[2] || 0.25,
  };

  const handlePositionChange = (axisIndex, value) => {
    const num = parseFloat(value) || 0;
    const nextPos = [...position];
    nextPos[axisIndex] = num;
    onUpdateTransform(id, { position: nextPos, scale });
  };

  const handleDimensionChange = (key, value) => {
    const num = Math.max(0.05, parseFloat(value) || 0.1);
    const nextDims = { ...dimensions, [key]: num };
    let nextScale = [...scale];

    if (key === "length") nextScale[0] = num;
    else if (key === "height") nextScale[1] = num;
    else if (key === "thickness") nextScale[2] = num;

    onUpdateTransform(id, { position, scale: nextScale, dimensions: nextDims });
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto divide-y divide-[#eae4dc] dark:divide-[#39342f] text-xs text-zinc-700 dark:text-[#e6e2de]">
      {/* Header */}
      <div className="p-4 bg-[#fdfbf7] dark:bg-[#1d1b19]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {onCollapse && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCollapse();
                }}
                title="Collapse Property Inspector (Right Panel)"
                aria-label="Collapse Property Inspector"
                className="p-1 rounded-lg text-zinc-400 dark:text-[#746e65] hover:text-zinc-700 dark:hover:text-[#f5f0e8] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            <Badge variant="orange" className="capitalize">
              {type || "Element"}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onToggleVisibility(id)}
              title={isVisible ? "Hide element" : "Show element"}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isVisible
                  ? "bg-white dark:bg-[#211f1d] text-zinc-600 dark:text-[#b4ada3] border-zinc-200 dark:border-[#39342f] hover:text-zinc-900 dark:hover:text-[#f5f0e8]"
                  : "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50 hover:bg-red-100"
              }`}
            >
              {isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          </div>
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
                className={`w-full aspect-square rounded-md border transition-all cursor-pointer ${
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
              className="w-full accent-orange-500 cursor-pointer"
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
              className="w-full accent-orange-500 cursor-pointer"
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
              className="w-full accent-orange-500 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Actual Dimensions & Coordinates (Req 1) */}
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-1.5 font-semibold text-zinc-800 dark:text-[#b4ada3] text-[11px] uppercase tracking-wider">
          <Maximize className="w-3.5 h-3.5 text-orange-500" />
          <span>{isWall ? "Wall Dimensions (Actual)" : isFloor ? "Floor Coordinates & Dimensions" : "Coordinates & Dimensions"}</span>
        </div>

        {/* Position */}
        <div>
          <label className="block text-[11px] font-medium text-zinc-600 dark:text-[#b4ada3] mb-1.5">Center Position (m)</label>
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

        {/* Real Dimensions: Length, Height, Thickness */}
        <div>
          <label className="block text-[11px] font-medium text-zinc-600 dark:text-[#b4ada3] mb-1.5">
            {isWall ? "Wall Geometry (m)" : isFloor ? "Floor Extents (m)" : "Dimensions (m)"}
          </label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className="text-[10px] text-zinc-400 dark:text-[#746e65] font-mono">
                {isWall ? "Length" : "L (X)"}
              </span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={Number(dimensions.length).toFixed(2)}
                onChange={(e) => handleDimensionChange("length", e.target.value)}
                className="w-full px-2 py-1 rounded border border-zinc-200 dark:border-[#39342f] bg-white dark:bg-[#141311] dark:text-[#f5f0e8] font-mono text-xs focus:outline-orange-500"
              />
            </div>
            <div>
              <span className="text-[10px] text-zinc-400 dark:text-[#746e65] font-mono">
                {isWall ? "Height" : "H (Y)"}
              </span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={Number(dimensions.height).toFixed(2)}
                onChange={(e) => handleDimensionChange("height", e.target.value)}
                className="w-full px-2 py-1 rounded border border-zinc-200 dark:border-[#39342f] bg-white dark:bg-[#141311] dark:text-[#f5f0e8] font-mono text-xs focus:outline-orange-500"
              />
            </div>
            <div>
              <span className="text-[10px] text-zinc-400 dark:text-[#746e65] font-mono">
                {isWall ? "Thickness" : "W (Z)"}
              </span>
              <input
                type="number"
                step="0.05"
                min="0.05"
                value={Number(dimensions.thickness).toFixed(2)}
                onChange={(e) => handleDimensionChange("thickness", e.target.value)}
                className="w-full px-2 py-1 rounded border border-zinc-200 dark:border-[#39342f] bg-white dark:bg-[#141311] dark:text-[#f5f0e8] font-mono text-xs focus:outline-orange-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Delete / Remove Action for any selected element (Req 1) */}
      <div className="p-4 mt-auto">
        <Button
          variant="outline"
          size="sm"
          fullWidth
          onClick={() => onDeleteObject(id)}
          className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-900/40 dark:hover:bg-red-950/20 flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>{isWall ? "Delete Wall" : isFloor ? "Delete Floor Slab" : "Delete Element"}</span>
        </Button>
      </div>

      {/* Source Blueprint Accordion/Card */}
      <div className="p-4 border-t border-[#eae4dc] dark:border-[#39342f]">
        <SourceBlueprintPanel project={project} taskId={taskId} isCompact />
      </div>
    </div>
  );
};

export default CadPropertiesPanel;
