import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ReactCompareSlider,
  ReactCompareSliderImage,
} from "react-compare-slider";
import {
  Download,
  ArrowLeft,
  RotateCcw,
  Sparkles,
  Layers,
  Share2,
  Check,
  Trash2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import Button from "../../presentation/ui/Button";
import Modal from "../../presentation/ui/Modal";
import { useAuth } from "../../presentation/layout/AppLayout";
import { generate3DViews } from "../../lib/puter/ai.action";
import { createProject, getProjectById, deleteProject } from "../../lib/puter/puter.action";

const ImageVisualizer = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userId } = useAuth();

  const [project, setProject] = useState(null);
  const [isProjectLoading, setIsProjectLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentImage, setCurrentImage] = useState(null);
  const [copiedShare, setCopiedShare] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const hasInitialGenerated = useRef(false);

  const runGeneration = async (item) => {
    if (!id || !item?.sourceImage) return;

    try {
      setIsProcessing(true);
      const result = await generate3DViews({ sourceImage: item.sourceImage });

      if (result.renderedImage) {
        setCurrentImage(result.renderedImage);

        const updatedItem = {
          ...item,
          renderedImage: result.renderedImage,
          renderedPath: result.renderedPath,
          timestamp: Date.now(),
          ownerId: item.ownerId ?? userId ?? null,
          isPublic: item.isPublic ?? false,
        };

        const saved = await createProject({
          item: updatedItem,
          visibility: "private",
        });

        if (saved) {
          setProject(saved);
          setCurrentImage(saved.renderedImage || result.renderedImage);
        }
      }
    } catch (error) {
      console.error("AI Generation Failed: ", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = () => {
    if (!currentImage) return;

    const link = document.createElement("a");
    link.href = currentImage;
    link.download = `planvista_render_${id || Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  const handleDeleteProject = async () => {
    if (!id || isDeleting) return;

    try {
      setIsDeleting(true);
      setDeleteError("");

      await deleteProject({ id });

      navigate("/projects");
    } catch (err) {
      console.error("Failed to delete project:", err);
      setDeleteError(
        err.message || "Failed to delete project from storage. Please verify your connection."
      );
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadProject = async () => {
      if (!id) {
        setIsProjectLoading(false);
        return;
      }

      setIsProjectLoading(true);
      const fetched = await getProjectById({ id });

      if (!isMounted) return;

      setProject(fetched);
      setCurrentImage(fetched?.renderedImage || null);
      setIsProjectLoading(false);
      hasInitialGenerated.current = false;
    };

    loadProject();

    return () => {
      isMounted = false;
    };
  }, [id]);

  useEffect(() => {
    if (isProjectLoading || hasInitialGenerated.current || !project?.sourceImage) {
      return;
    }

    if (project.renderedImage) {
      setCurrentImage(project.renderedImage);
      hasInitialGenerated.current = true;
      return;
    }

    hasInitialGenerated.current = true;
    runGeneration(project);
  }, [project, isProjectLoading]);

  if (isProjectLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-zinc-600">Loading project data...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-6 mb-8 border-b border-[#eae4dc] gap-4">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900 mb-2 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Studio
          </button>
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-3xl font-bold text-zinc-900 tracking-tight">
              {project?.name || `Residence ${id}`}
            </h1>
            <span className="badge-warm">
              <Sparkles className="w-3 h-3 text-orange-500" /> AI Visualization
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Created {project?.timestamp ? new Date(project.timestamp).toLocaleDateString() : "Recently"}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleShare}
            className="flex items-center gap-1.5"
          >
            {copiedShare ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-600" />
                <span className="text-green-700">Link Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </>
            )}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => project && runGeneration(project)}
            disabled={isProcessing}
            className="flex items-center gap-1.5"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isProcessing ? "animate-spin" : ""}`} />
            <span>Re-render</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleExport}
            disabled={!currentImage || isProcessing}
            className="flex items-center gap-1.5 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Image</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDeleteError("");
              setShowDeleteModal(true);
            }}
            disabled={isProcessing || isDeleting}
            className="flex items-center gap-1.5 text-zinc-600 hover:text-red-600 hover:border-red-200"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Project</span>
          </Button>
        </div>
      </div>

      {/* Main Visualizer Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Comparison Stage (8 Cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white border border-[#eae4dc] rounded-2xl overflow-hidden shadow-sm relative min-h-[500px] flex items-center justify-center">
            {isProcessing ? (
              <div className="absolute inset-0 bg-[#fdfbf7]/95 z-20 flex flex-col items-center justify-center p-8 text-center backdrop-blur-sm">
                <div className="w-16 h-16 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center mb-6 shadow-sm">
                  <Sparkles className="w-8 h-8 animate-pulse" />
                </div>
                <h3 className="font-serif text-2xl font-bold text-zinc-900 mb-2">
                  Rendering 3D Visualization...
                </h3>
                <p className="text-sm text-zinc-500 max-w-sm">
                  Applying photorealistic materials, daylighting, and spatial furnishings based on your floor plan lines.
                </p>
                <div className="w-48 h-1.5 bg-zinc-200 rounded-full mt-6 overflow-hidden">
                  <div className="h-full bg-orange-500 animate-pulse rounded-full w-2/3" />
                </div>
              </div>
            ) : null}

            {project?.sourceImage && currentImage ? (
              <div className="w-full h-full flex flex-col items-center p-4">
                <div className="w-full overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
                  <ReactCompareSlider
                    defaultValue={50}
                    className="w-full max-h-[640px] object-contain"
                    itemOne={
                      <ReactCompareSliderImage
                        src={project.sourceImage}
                        alt="Original 2D Blueprint"
                      />
                    }
                    itemTwo={
                      <ReactCompareSliderImage
                        src={currentImage}
                        alt="3D Photorealistic Render"
                      />
                    }
                  />
                </div>
                <div className="flex items-center justify-between w-full px-2 pt-3 text-xs text-zinc-500">
                  <span className="flex items-center gap-1 font-medium">
                    ← Original 2D Blueprint
                  </span>
                  <span className="font-semibold text-orange-600">
                    Drag slider to compare
                  </span>
                  <span className="flex items-center gap-1 font-medium">
                    3D Render Result →
                  </span>
                </div>
              </div>
            ) : project?.sourceImage ? (
              <div className="p-6 text-center">
                <img
                  src={project.sourceImage}
                  alt="Original Blueprint"
                  className="max-h-[500px] mx-auto rounded-lg shadow-sm border border-zinc-200"
                />
              </div>
            ) : (
              <p className="text-sm text-zinc-400">No image data found for this project.</p>
            )}
          </div>
        </div>

        {/* Sidebar Info & Controls (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="card-warm space-y-4">
            <h3 className="font-serif text-xl font-bold text-zinc-900 border-b border-zinc-100 pb-3">
              Render Details
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="text-zinc-500">Model Engine</span>
                <span className="font-medium text-zinc-800">Puter Generative AI</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="text-zinc-500">Output Format</span>
                <span className="font-medium text-zinc-800">1024 × 1024 PNG</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="text-zinc-500">View Angle</span>
                <span className="font-medium text-zinc-800">Orthographic Top-Down</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="text-zinc-500">Text Annotations</span>
                <span className="font-medium text-zinc-800">Stripped / Synthesized</span>
              </div>
            </div>

            <div className="pt-2">
              <p className="text-xs text-zinc-500 leading-relaxed bg-[#fdfbf7] p-3 rounded-xl border border-[#eae4dc]">
                💡 <strong>Need real 3D meshes?</strong> If you want to orbit, inspect wall geometries, or download an interactive <strong>.GLB</strong> file, try our <strong>Generate Model</strong> pipeline.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => !isDeleting && setShowDeleteModal(false)}
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
                  "{project?.name || `Project ${id}`}"
                </span>
                . This will remove the source blueprint, rendered output, and project records from cloud storage.
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
              onClick={() => setShowDeleteModal(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleDeleteProject}
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

export default ImageVisualizer;
