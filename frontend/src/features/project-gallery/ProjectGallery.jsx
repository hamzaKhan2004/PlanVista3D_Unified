import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FolderKanban, Sparkles, Box, Plus, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import ProjectCard from "../../presentation/projects/ProjectCard";
import Button from "../../presentation/ui/Button";
import Modal from "../../presentation/ui/Modal";
import { getProjects, deleteProject } from "../../lib/puter/puter.action";
import { getLocalModelProjects, deleteLocalModelProject } from "../../lib/api/modelApi";

const ProjectGallery = () => {
  const [filter, setFilter] = useState("all"); // "all" | "image" | "model"
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleDeleteConfirm = async () => {
    if (!projectToDelete || isDeleting) return;

    try {
      setIsDeleting(true);
      setDeleteError("");

      const isModel =
        projectToDelete.type === "model" ||
        projectToDelete.type === "model_3d" ||
        projectToDelete.type === "dxf" ||
        Boolean(projectToDelete.taskId) ||
        Boolean(projectToDelete.model_file);

      if (isModel) {
        const idToDelete = projectToDelete.taskId || projectToDelete.id;
        await deleteLocalModelProject(idToDelete);
      } else {
        await deleteProject({ id: projectToDelete.id });
      }

      // Remove from state only after confirmed persistence deletion
      setProjects((prev) =>
        prev.filter(
          (p) =>
            p.id !== projectToDelete.id &&
            (!projectToDelete.taskId || p.taskId !== projectToDelete.taskId)
        )
      );
      setProjectToDelete(null);
    } catch (err) {
      console.error("Deletion failed:", err);
      setDeleteError(
        err.message || "Failed to delete project from storage. Please verify your connection."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    const fetchAllProjects = async () => {
      setLoading(true);
      try {
        // Fetch Puter image projects
        const puterItems = await getProjects();
        const formattedPuterItems = (puterItems || []).map((item) => ({
          ...item,
          type: "image",
        }));

        // Fetch local 3D model projects
        const localModels = getLocalModelProjects() || [];
        const formattedLocalModels = localModels.map((item) => ({
          ...item,
          type: "model",
        }));

        // Combine and sort by timestamp descending
        const combined = [...formattedPuterItems, ...formattedLocalModels].sort(
          (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
        );

        setProjects(combined);
      } catch (err) {
        console.error("Failed to load projects:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAllProjects();
  }, []);

  const filteredProjects = projects.filter((p) => {
    if (filter === "image") return p.type === "image";
    if (filter === "model") return p.type === "model" || p.type === "dxf";
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between pb-8 mb-8 border-b border-[#eae4dc] gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="badge-warm">
              <FolderKanban className="w-3.5 h-3.5 text-orange-500" /> Unified Studio Projects
            </span>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl font-bold text-zinc-900 tracking-tight">
            Project Gallery
          </h1>
          <p className="text-sm text-zinc-500 mt-2 max-w-xl">
            Browse and manage all your synthesized architectural visualizations and interactive 3D CAD mesh models.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center p-1 bg-white border border-[#eae4dc] rounded-xl shadow-xs">
          <button
            onClick={() => setFilter("all")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filter === "all"
                ? "bg-zinc-900 text-white shadow-xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            All ({projects.length})
          </button>
          <button
            onClick={() => setFilter("image")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filter === "image"
                ? "bg-orange-500 text-white shadow-xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            AI Renders
          </button>
          <button
            onClick={() => setFilter("model")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filter === "model"
                ? "bg-purple-600 text-white shadow-xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            3D CAD Models
          </button>
        </div>
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-zinc-500 font-medium">Loading project catalog...</p>
        </div>
      ) : filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id || project.taskId}
              project={project}
              onDelete={setProjectToDelete}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white border border-dashed border-zinc-300 rounded-3xl p-12 text-center max-w-lg mx-auto space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center mx-auto">
            <Plus className="w-6 h-6" />
          </div>
          <h3 className="font-serif text-2xl font-bold text-zinc-900">
            No projects in this category
          </h3>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Upload your first floor-plan image or CAD blueprint to generate photorealistic renderings or 3D models.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link to="/generate-image">
              <Button variant="primary" size="sm" className="w-full sm:w-auto">
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Generate AI Render
              </Button>
            </Link>
            <Link to="/generate-model">
              <Button variant="secondary" size="sm" className="w-full sm:w-auto">
                <Box className="w-3.5 h-3.5 mr-1.5 text-purple-600" />
                Generate 3D Model
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Project Deletion */}
      <Modal
        isOpen={!!projectToDelete}
        onClose={() => !isDeleting && setProjectToDelete(null)}
        title="Delete Project"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900">
                Are you sure you want to delete this project?
              </p>
              <p className="text-xs text-zinc-600 mt-1">
                You are about to permanently delete{" "}
                <span className="font-semibold text-zinc-900">
                  "{projectToDelete?.name || `Project ${projectToDelete?.id}`}"
                </span>
                . This will permanently remove all associated{" "}
                {projectToDelete?.type === "model" || projectToDelete?.taskId
                  ? "3D CAD geometry, files, and project data"
                  : "rendered imagery and cloud storage data"}
                . This action cannot be undone.
              </p>
            </div>
          </div>

          {deleteError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
              {deleteError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#eae4dc]">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setProjectToDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white border-transparent"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  <span>Delete Project</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ProjectGallery;
