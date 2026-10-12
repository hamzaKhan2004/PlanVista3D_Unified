import React from "react";
import { useNavigate } from "react-router-dom";
import { Clock, ArrowUpRight, Sparkles, Box } from "lucide-react";

const ProjectCard = ({ project }) => {
  const navigate = useNavigate();

  const isModel = project?.type === "model" || project?.type === "dxf" || !!project?.taskId;
  const targetRoute = isModel
    ? `/model-viewer/${project.taskId || project.id}`
    : `/visualizer/${project.id}`;

  const imagePreview =
    project.renderedImage || project.sourceImage || project.previewUrl || "/b1.jpg";

  return (
    <div
      onClick={() => navigate(targetRoute)}
      className="group bg-white border border-[#eae4dc] rounded-2xl overflow-hidden shadow-warm hover:shadow-warm-lg hover:border-orange-300 transition-all cursor-pointer flex flex-col"
    >
      {/* Thumbnail */}
      <div className="relative aspect-4/3 w-full bg-[#f4eee6] overflow-hidden">
        {imagePreview ? (
          <img
            src={imagePreview}
            alt={project.name || "Project Preview"}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-400">
            <Box className="w-12 h-12 stroke-[1.5]" />
          </div>
        )}

        {/* Badge */}
        <div className="absolute top-3 left-3">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold backdrop-blur-md shadow-xs ${
              isModel
                ? "bg-purple-900/80 text-purple-100"
                : "bg-orange-900/80 text-orange-100"
            }`}
          >
            {isModel ? (
              <>
                <Box className="w-3 h-3 text-purple-300" />
                <span>3D CAD Model</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3 text-orange-300" />
                <span>3D AI Render</span>
              </>
            )}
          </span>
        </div>
      </div>

      {/* Card Content */}
      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="font-serif text-xl font-bold text-zinc-900 group-hover:text-orange-600 transition-colors truncate">
            {project.name || `Project ${project.id}`}
          </h3>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 mt-2">
            <Clock className="w-3.5 h-3.5" />
            <span>
              {project.timestamp
                ? new Date(project.timestamp).toLocaleDateString()
                : "Recently Created"}
            </span>
            {project.floors && (
              <span className="text-zinc-400">• {project.floors} Floors</span>
            )}
          </div>
        </div>

        <div className="pt-4 mt-2 border-t border-zinc-100 flex items-center justify-between text-xs font-semibold text-zinc-600 group-hover:text-orange-600">
          <span>{isModel ? "Open 3D Canvas" : "Open Visualizer"}</span>
          <ArrowUpRight className="w-4 h-4 transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </div>
      </div>
    </div>
  );
};

export default ProjectCard;
