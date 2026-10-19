import React from "react";
import { useNavigate } from "react-router-dom";
import { Clock, ArrowUpRight, Sparkles, Box, Layers, Trash2, QrCode } from "lucide-react";
import Badge from "../ui/Badge";

const ProjectCard = ({ project, onDelete, onOpenArScanner }) => {
  const navigate = useNavigate();

  const isModel =
    project?.type === "model" ||
    project?.type === "model_3d" ||
    project?.type === "dxf" ||
    !!project?.taskId;

  const isVectorAssisted =
    project?.pipeline === "vector_assisted" ||
    project?.analysis?.pipeline === "vector_assisted";

  const targetRoute = isModel
    ? `/cad-editor/${project.taskId || project.id}`
    : `/visualizer/${project.id}`;

  const imagePreview =
    project.sourceThumbnail || project.renderedImage || project.sourceImage || project.previewUrl || "/b1.jpg";

  return (
    <div
      onClick={() => navigate(targetRoute)}
      className="group bg-white dark:bg-[#1d1b19] border border-[#eae4dc] dark:border-[#39342f] rounded-2xl overflow-hidden shadow-warm hover:shadow-warm-lg hover:border-orange-300 dark:hover:border-[#ff7417]/50 transition-all cursor-pointer flex flex-col relative"
    >
      {/* Thumbnail */}
      <div className="relative aspect-4/3 w-full bg-[#f4eee6] dark:bg-[#141311] overflow-hidden">
        {imagePreview ? (
          <img
            src={imagePreview}
            alt={project.name || "Project Preview"}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-400 dark:text-[#b4ada3]">
            <Box className="w-12 h-12 stroke-[1.5]" />
          </div>
        )}

        {/* Badge */}
        <div className="absolute top-3 left-3">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold backdrop-blur-md shadow-xs ${isModel
              ? isVectorAssisted
                ? "bg-orange-900/85 text-orange-100 dark:bg-[#ff7417]/30 dark:text-[#ff9d54] dark:border dark:border-[#ff7417]/50"
                : "bg-purple-900/80 text-purple-100 dark:bg-[#9333ea]/30 dark:text-[#ddb8ff] dark:border dark:border-[#9333ea]/40"
              : "bg-orange-900/80 text-orange-100 dark:bg-[#ff7417]/30 dark:text-[#ffb691] dark:border dark:border-[#ff7417]/40"
              }`}
          >
            {isModel ? (
              <>
                <Layers className="w-3 h-3 text-purple-300 dark:text-[#ddb8ff]" />
                <span>{isVectorAssisted ? "Vector 3D Model" : "3D CAD Studio"}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3 text-orange-300 dark:text-[#ffb691]" />
                <span>2D AI Render</span>
              </>
            )}
          </span>
        </div>

        {/* Top-Right Quick Actions */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
          {isModel && onOpenArScanner && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenArScanner(project);
              }}
              aria-label={`Open AR Scanner for ${project.name || "model"}`}
              title="Launch AR Scanner & Mobile 3D QR Code"
              className="p-2 rounded-xl bg-white/95 dark:bg-[#211f1d]/95 hover:bg-orange-50 dark:hover:bg-[#ff7417]/25 text-orange-600 dark:text-[#ff9d54] backdrop-blur-md shadow-xs border border-zinc-200/80 dark:border-[#39342f] transition-all cursor-pointer group/btn"
            >
              <QrCode className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(project);
              }}
              aria-label={`Delete ${project.name || "project"}`}
              title="Delete project"
              className="p-2 rounded-xl bg-white/90 dark:bg-[#211f1d]/90 hover:bg-red-50 dark:hover:bg-red-950/40 text-zinc-500 dark:text-[#b4ada3] hover:text-red-600 dark:hover:text-red-400 backdrop-blur-md shadow-xs border border-zinc-200/80 dark:border-[#39342f] transition-all cursor-pointer opacity-90 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 hover:opacity-100 group/btn"
            >
              <Trash2 className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
            </button>
          )}
        </div>
      </div>

      {/* Card Content */}
      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="font-serif text-xl font-bold text-zinc-900 dark:text-[#f5f0e8] group-hover:text-orange-600 dark:group-hover:text-[#ff7417] transition-colors truncate">
            {project.name || `Project ${project.id}`}
          </h3>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-[#b4ada3] mt-2 font-mono">
            <Clock className="w-3.5 h-3.5" />
            <span>
              {project.timestamp
                ? new Date(project.timestamp).toLocaleDateString()
                : "Recently Created"}
            </span>
            {project.floors && (
              <span className="text-zinc-400 dark:text-[#b4ada3]">• {project.floors} Floors</span>
            )}
          </div>
        </div>

        <div className="pt-4 mt-2 border-t border-zinc-100 dark:border-[#39342f] flex items-center justify-between text-xs font-semibold text-zinc-600 dark:text-[#b4ada3]">
          <span className="group-hover:text-orange-600 dark:group-hover:text-[#ff7417] transition-colors">
            {isModel ? "Open in CAD Workspace" : "Open in Comparison Visualizer"}
          </span>
          {isModel && onOpenArScanner ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenArScanner(project);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-50 dark:bg-[#ff7417]/15 text-orange-600 dark:text-[#ff7417] hover:bg-orange-100 dark:hover:bg-[#ff7417]/25 transition-all cursor-pointer font-bold text-xs"
              title="Generate AR QR Code"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>AR View</span>
            </button>
          ) : (
            <ArrowUpRight className="w-4 h-4 transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectCard;

