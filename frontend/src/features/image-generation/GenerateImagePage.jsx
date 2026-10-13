import React from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowLeft, Layers, ShieldCheck, Check } from "lucide-react";
import UploadFloorPlan from "./UploadFloorPlan";
import { createProject } from "../../lib/puter/puter.action";

const GenerateImagePage = () => {
  const navigate = useNavigate();

  const handleUploadComplete = async (base64Image) => {
    try {
      const newId = Date.now().toString();
      const name = `Residence ${newId.slice(-4)}`;

      const newItem = {
        id: newId,
        name,
        sourceImage: base64Image,
        renderedImage: undefined,
        timestamp: Date.now(),
      };

      const saved = await createProject({
        item: newItem,
        visibility: "private",
      });

      if (!saved) {
        console.error("Failed to create project");
        return false;
      }

      navigate(`/visualizer/${newId}`, {
        state: {
          initialImage: saved.sourceImage,
          name,
        },
      });

      return true;
    } catch (error) {
      console.error("Upload error:", error);
      return false;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <button
        onClick={() => navigate("/")}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-[#b4ada3] hover:text-zinc-900 dark:hover:text-[#f5f0e8] mb-6 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Studio Home
      </button>

      <div className="text-center mb-10">
        <div className="w-12 h-12 rounded-2xl bg-orange-100 dark:bg-[#ff7417]/20 text-orange-600 dark:text-[#ff7417] flex items-center justify-center mx-auto mb-3">
          <Sparkles className="w-6 h-6" />
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl font-bold text-zinc-900 dark:text-[#f5f0e8] tracking-tight">
          Floor Plan to Photorealistic 3D Render
        </h1>
        <p className="text-sm text-zinc-600 dark:text-[#b4ada3] mt-2 max-w-lg mx-auto">
          Upload any 2D architectural layout. Puter AI will reconstruct lighting, textures, materials, and furniture layout in high resolution.
        </p>
      </div>

      <div className="card-warm p-8 sm:p-12 border border-[#eae4dc] dark:border-[#39342f] mb-10">
        <UploadFloorPlan onComplete={handleUploadComplete} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
        <div className="p-4 rounded-xl bg-white dark:bg-[#1d1b19] border border-[#eae4dc] dark:border-[#39342f] space-y-1.5">
          <h4 className="font-semibold text-sm text-zinc-900 dark:text-[#f5f0e8] flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-orange-100 dark:bg-[#ff7417]/20 text-orange-600 dark:text-[#ff7417] flex items-center justify-center text-xs font-bold">1</span>
            Upload 2D Plan
          </h4>
          <p className="text-xs text-zinc-500 dark:text-[#b4ada3] leading-relaxed">
            Drag and drop architectural floor plans in JPG, PNG, or WEBP format.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#1d1b19] border border-[#eae4dc] dark:border-[#39342f] space-y-1.5">
          <h4 className="font-semibold text-sm text-zinc-900 dark:text-[#f5f0e8] flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-orange-100 dark:bg-[#ff7417]/20 text-orange-600 dark:text-[#ff7417] flex items-center justify-center text-xs font-bold">2</span>
            Generative Synthesis
          </h4>
          <p className="text-xs text-zinc-500 dark:text-[#b4ada3] leading-relaxed">
            Puter AI strips text and synthesizes top-down daylighting, flooring, and interior decor.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#1d1b19] border border-[#eae4dc] dark:border-[#39342f] space-y-1.5">
          <h4 className="font-semibold text-sm text-zinc-900 dark:text-[#f5f0e8] flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-orange-100 dark:bg-[#ff7417]/20 text-orange-600 dark:text-[#ff7417] flex items-center justify-center text-xs font-bold">3</span>
            Compare & Export
          </h4>
          <p className="text-xs text-zinc-500 dark:text-[#b4ada3] leading-relaxed">
            Inspect the transformation with the interactive wipe slider and export print-ready PNGs.
          </p>
        </div>
      </div>
    </div>
  );
};

export default GenerateImagePage;
