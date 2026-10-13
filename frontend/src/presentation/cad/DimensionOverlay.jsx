import React from "react";
import { Compass, Maximize, RotateCw, Move, MousePointer } from "lucide-react";
import { TRANSFORM_MODES } from "../../domain/cad/cadTypes";

const TOOL_ICONS = {
  [TRANSFORM_MODES.SELECT]: MousePointer,
  [TRANSFORM_MODES.TRANSLATE]: Move,
  [TRANSFORM_MODES.ROTATE]: RotateCw,
  [TRANSFORM_MODES.SCALE]: Maximize,
};

const DimensionOverlay = ({
  transformMode,
  cameraPreset,
  selectedObject,
  objectData,
}) => {
  const scale = objectData?.scale || [1, 1, 1];
  const position = objectData?.position || [0, 0, 0];
  const color = objectData?.color;
  const ToolIcon = TOOL_ICONS[transformMode] || MousePointer;

  return (
    <div className="absolute bottom-4 left-4 z-10 pointer-events-none flex flex-col gap-2 max-w-[calc(100%-2rem)]">
      {/* Selection Dimension HUD */}
      {selectedObject && (
        <div className="bg-black/80 backdrop-blur-md text-white text-[11px] font-mono px-3 py-2 rounded-xl border border-white/10 shadow-lg flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex items-center gap-1.5 font-semibold shrink-0">
            {color && (
              <span
                className="w-2.5 h-2.5 rounded-full border border-white/20 shrink-0"
                style={{ backgroundColor: color }}
              />
            )}
            <span className="text-orange-300 truncate max-w-[120px]">
              {selectedObject.name}
            </span>
          </div>
          <span className="text-white/30 hidden sm:inline">|</span>
          <span className="shrink-0">
            <span className="text-white/50">L×H×W </span>
            <span className="text-green-300">{Number(scale[0]).toFixed(2)}</span>
            <span className="text-white/40"> × </span>
            <span className="text-green-300">{Number(scale[1]).toFixed(2)}</span>
            <span className="text-white/40"> × </span>
            <span className="text-green-300">{Number(scale[2]).toFixed(2)}</span>
            <span className="text-white/50 ml-0.5">m</span>
          </span>
          <span className="text-white/30 hidden sm:inline">|</span>
          <span className="shrink-0">
            <span className="text-white/50">XYZ </span>
            <span className="text-sky-300">[{Number(position[0]).toFixed(1)}, {Number(position[1]).toFixed(1)}, {Number(position[2]).toFixed(1)}]</span>
          </span>
        </div>
      )}

      {/* Viewport Status HUD */}
      <div className="bg-black/65 backdrop-blur-md text-white/80 text-[10px] font-mono px-2.5 py-1.5 rounded-lg border border-white/10 self-start flex items-center gap-2">
        <Compass className="w-3 h-3 text-orange-400 shrink-0" />
        <span className="uppercase tracking-wider">
          <span className="text-white/50">View </span>
          <strong className="text-white">{cameraPreset}</strong>
        </span>
        <span className="text-white/25">•</span>
        <ToolIcon className="w-3 h-3 text-zinc-300 shrink-0" />
        <span className="uppercase tracking-wider">
          <strong className="text-white">{transformMode}</strong>
        </span>
        <span className="text-white/25">•</span>
        <span className="text-white/60">1m grid</span>
      </div>
    </div>
  );
};

export default DimensionOverlay;
