import React from "react";
import { Compass, Maximize, Move } from "lucide-react";

const DimensionOverlay = ({
  transformMode,
  cameraPreset,
  selectedObject,
  objectData,
}) => {
  const scale = objectData?.scale || [1, 1, 1];
  const position = objectData?.position || [0, 0, 0];

  return (
    <div className="absolute bottom-4 left-4 z-10 pointer-events-none flex flex-col gap-2">
      {/* Selection Dimension HUD */}
      {selectedObject && (
        <div className="bg-black/75 backdrop-blur-md text-white text-[11px] font-mono px-3 py-1.5 rounded-lg border border-white/10 shadow-lg flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-orange-300 font-semibold">
            <Maximize className="w-3.5 h-3.5" />
            <span>{selectedObject.name}:</span>
          </div>
          <div className="flex items-center gap-2">
            <span>
              Dim: <span className="text-zinc-200">{Number(scale[0]).toFixed(2)}m</span> ×{" "}
              <span className="text-zinc-200">{Number(scale[1]).toFixed(2)}m</span> ×{" "}
              <span className="text-zinc-200">{Number(scale[2]).toFixed(2)}m</span>
            </span>
            <span className="text-white/30">|</span>
            <span>
              Pos: [
              <span className="text-zinc-200">{Number(position[0]).toFixed(2)}</span>,{" "}
              <span className="text-zinc-200">{Number(position[1]).toFixed(2)}</span>,{" "}
              <span className="text-zinc-200">{Number(position[2]).toFixed(2)}</span>
              ]
            </span>
          </div>
        </div>
      )}

      {/* Viewport Status HUD */}
      <div className="bg-black/60 backdrop-blur-md text-white/80 text-[10px] font-mono px-2.5 py-1 rounded-md border border-white/10 self-start flex items-center gap-2">
        <Compass className="w-3 h-3 text-orange-400" />
        <span className="uppercase tracking-wider">
          View: <strong className="text-white">{cameraPreset}</strong>
        </span>
        <span className="text-white/30">•</span>
        <span className="uppercase tracking-wider">
          Tool: <strong className="text-white">{transformMode}</strong>
        </span>
        <span className="text-white/30">•</span>
        <span>Grid: 1m</span>
      </div>
    </div>
  );
};

export default DimensionOverlay;
