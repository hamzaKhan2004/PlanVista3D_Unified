import React from "react";
import { useNavigate } from "react-router-dom";
import { Box, ArrowLeft, Cpu, Layers } from "lucide-react";
import UploadBlueprint from "./UploadBlueprint";

const GenerateModelPage = () => {
  const navigate = useNavigate();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <button
        onClick={() => navigate("/")}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900 mb-6 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Studio Home
      </button>

      <UploadBlueprint />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left mt-12">
        <div className="p-4 rounded-xl bg-white border border-[#eae4dc] space-y-1.5">
          <h4 className="font-semibold text-sm text-zinc-900 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">1</span>
            CAD Vector Ingestion
          </h4>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Parses AutoCAD DXF wall lines or uses OpenCV contour analysis for raster blueprints.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-[#eae4dc] space-y-1.5">
          <h4 className="font-semibold text-sm text-zinc-900 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">2</span>
            Blender 3D Extrusion
          </h4>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Headless Blender procedural scripts construct wall meshes, slabs, materials, and floor stacks.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-[#eae4dc] space-y-1.5">
          <h4 className="font-semibold text-sm text-zinc-900 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">3</span>
            Interactive 3D WebGL
          </h4>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Orbit in real-time, select and recolor walls, toggle wireframe, and export standard .GLB files.
          </p>
        </div>
      </div>
    </div>
  );
};

export default GenerateModelPage;
