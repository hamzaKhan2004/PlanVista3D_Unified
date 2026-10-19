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
import { storeRenderedImage, deleteLocalModelProject } from "../../lib/api/modelApi";

const ImageVisualizer = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userId } = useAuth();

  const [project, setProject] = useState(null);
  const [isProjectLoading, setIsProjectLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentImage, setCurrentImage] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const [shareFeedback, setShareFeedback] = useState(null); // { type: 'success' | 'error', text: string }
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const hasInitialGenerated = useRef(false);

  // Helper to sanitize project name for filesystem downloads
  const sanitizeFilename = (name) => {
    return (name || "render")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]/g, "_")
      .replace(/_+/g, "_");
  };

  // Helper to fetch/convert image into a Blob with Canvas CORS fallback
  const getImageBlob = async (imageUrl) => {
    if (!imageUrl) throw new Error("No image source provided");
    if (imageUrl.startsWith("data:")) {
      const res = await fetch(imageUrl);
      return await res.blob();
    }

    try {
      const res = await fetch(imageUrl, { mode: "cors" });
      if (!res.ok) throw new Error(`HTTP fetch status: ${res.status}`);
      return await res.blob();
    } catch (corsErr) {
      // Offscreen canvas fallback if direct fetch is blocked by CORS headers
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => {
              if (blob) resolve(blob);
              else reject(new Error("Canvas to Blob conversion failed"));
            }, "image/png");
          } catch (canvasErr) {
            reject(canvasErr);
          }
        };
        img.onerror = () => reject(new Error("Image failed to load for export/share"));
        img.src = imageUrl;
      });
    }
  };

  const runGeneration = async (item) => {
    if (!id || !item?.sourceImage) return;

    try {
      setIsProcessing(true);
      const result = await generate3DViews({ sourceImage: item.sourceImage });

      if (result.renderedImage) {
        setCurrentImage(result.renderedImage);

        // Stage 4: Persist newly generated 2D preview image in ImageKit / MongoDB
        let ikUrl = null;
        try {
          const stored = await storeRenderedImage({
            image: result.renderedImage,
            projectId: id,
            name: `render_${id}.png`,
          });
          if (stored?.url) {
            ikUrl = stored.url;
          }
        } catch (ikErr) {
          console.warn("Notice: ImageKit storage unavailable for 2D render", ikErr);
        }

        const updatedItem = {
          ...item,
          renderedImage: ikUrl || result.renderedImage,
          imagekitUrl: ikUrl || undefined,
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

  const handleExport = async () => {
    if (!currentImage || isExporting) return;

    try {
      setIsExporting(true);
      setExportError("");

      const blob = await getImageBlob(currentImage);
      const pngBlob = blob.type === "image/png" ? blob : new Blob([blob], { type: "image/png" });
      const objectUrl = URL.createObjectURL(pngBlob);

      const baseName = sanitizeFilename(project?.name || `render_${id || Date.now()}`);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `planvista_${baseName}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 2000);

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 2500);
    } catch (err) {
      console.error("Export Image failed:", err);
      setExportError("Unable to download image. Please check your network connection.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleShare = async () => {
    if (!currentImage || isSharing) return;

    setIsSharing(true);
    setShareFeedback(null);

    const baseName = sanitizeFilename(project?.name || `render_${id || Date.now()}`);
    const fileName = `planvista_${baseName}.png`;

    try {
      // 1. Try native Web Share API with File
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        let blob = null;
        try {
          blob = await getImageBlob(currentImage);
        } catch (blobErr) {
          console.warn("Could not retrieve image blob for file sharing:", blobErr);
        }

        if (blob) {
          const file = new File([blob], fileName, { type: blob.type || "image/png" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: project?.name || "PlanVista3D Render",
              text: "Architectural 3D render generated with PlanVista3D",
            });
            setShareFeedback({ type: "success", text: "Image shared!" });
            setTimeout(() => setShareFeedback(null), 3000);
            return;
          }
        }
      }

      // 2. Fallback: Copy direct image URL to clipboard if it's an accessible web link
      if (currentImage.startsWith("http://") || currentImage.startsWith("https://")) {
        await navigator.clipboard.writeText(currentImage);
        setShareFeedback({ type: "success", text: "Image link copied!" });
        setTimeout(() => setShareFeedback(null), 3000);
        return;
      }

      // 3. Fallback: For base64 data URLs or unsupported browsers, trigger download with helpful guidance
      await handleExport();
      setShareFeedback({
        type: "success",
        text: "Image downloaded! You can attach or send the saved file.",
      });
      setTimeout(() => setShareFeedback(null), 4000);

    } catch (err) {
      if (err.name === "AbortError") {
        // User closed the native share dialog, not an error
        return;
      }
      console.error("Share failed:", err);

      // Attempt fallback clipboard copy of image URL if available
      if (currentImage.startsWith("http://") || currentImage.startsWith("https://")) {
        try {
          await navigator.clipboard.writeText(currentImage);
          setShareFeedback({ type: "success", text: "Image link copied!" });
          setTimeout(() => setShareFeedback(null), 3000);
          return;
        } catch (_) {}
      }

      setShareFeedback({
        type: "error",
        text: "Sharing unavailable. Use Export Image to save.",
      });
      setTimeout(() => setShareFeedback(null), 3500);
    } finally {
      setIsSharing(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!id || isDeleting) return;

    try {
      setIsDeleting(true);
      setDeleteError("");

      await deleteProject({ id });

      // Clean up backend ImageKit assets & MongoDB references
      try {
        await deleteLocalModelProject(id);
      } catch (backendCleanupErr) {
        console.warn("Backend project cleanup notice:", backendCleanupErr);
      }

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

  if (!project) {
    return (
      <div className="max-w-2xl mx-auto py-20 px-4 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="font-serif text-2xl font-bold text-zinc-900 dark:text-[#f5f0e8]">
          Project Unavailable
        </h2>
        <p className="text-sm text-zinc-600 dark:text-[#b4ada3] max-w-md mx-auto">
          This visualization project could not be found or requires authentication.
        </p>
        <div className="pt-2">
          <Button variant="primary" size="sm" onClick={() => navigate("/projects")}>
            Back to Projects
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-6 mb-8 border-b border-[#eae4dc] dark:border-[#39342f] gap-4">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-[#b4ada3] hover:text-zinc-900 dark:hover:text-[#f5f0e8] mb-2 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Studio
          </button>
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-3xl font-bold text-zinc-900 dark:text-[#f5f0e8] tracking-tight">
              {project?.name || `Residence ${id}`}
            </h1>
            <span className="badge-warm">
              <Sparkles className="w-3 h-3 text-orange-500 dark:text-[#ff7417]" /> AI Visualization
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-[#b4ada3] mt-1 font-mono">
            Created {project?.timestamp ? new Date(project.timestamp).toLocaleDateString() : "Recently"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleShare}
            disabled={!currentImage || isSharing}
            className="flex items-center gap-1.5 dark:border-[#39342f] dark:text-[#e6e2de] dark:hover:bg-[#211f1d] cursor-pointer"
          >
            {isSharing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Preparing...</span>
              </>
            ) : shareFeedback?.type === "success" ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                <span className="text-green-700 dark:text-green-300 font-semibold">{shareFeedback.text}</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                <span>Share Image</span>
              </>
            )}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => project && runGeneration(project)}
            disabled={isProcessing || isExporting}
            className="flex items-center gap-1.5 dark:bg-[#24211f] dark:border-[#39342f] dark:text-[#f5f0e8] dark:hover:bg-[#2c2825]"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isProcessing ? "animate-spin" : ""}`} />
            <span>Re-render</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleExport}
            disabled={!currentImage || isProcessing || isExporting}
            className="flex items-center gap-1.5 shadow-sm"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Downloading...</span>
              </>
            ) : exportSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-white" />
                <span>Downloaded!</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Export Image</span>
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDeleteError("");
              setShowDeleteModal(true);
            }}
            disabled={isProcessing || isDeleting}
            className="flex items-center gap-1.5 text-zinc-600 dark:text-[#b4ada3] hover:text-red-600 dark:hover:text-red-400 dark:border-[#39342f] dark:hover:bg-red-950/20"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Project</span>
          </Button>
        </div>
      </div>

      {/* Share / Export Notification Banners */}
      {shareFeedback && (
        <div
          className={`mb-6 p-3 rounded-xl text-xs font-medium flex items-center justify-between border ${
            shareFeedback.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40"
              : "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-900/40"
          }`}
        >
          <div className="flex items-center gap-2">
            {shareFeedback.type === "success" ? (
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
            )}
            <span>{shareFeedback.text}</span>
          </div>
          <button
            onClick={() => setShareFeedback(null)}
            className="text-xs font-semibold hover:underline cursor-pointer ml-3"
          >
            Dismiss
          </button>
        </div>
      )}

      {exportError && (
        <div className="mb-6 p-3 rounded-xl text-xs font-medium flex items-center justify-between bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900/40">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
            <span>{exportError}</span>
          </div>
          <button
            onClick={() => setExportError("")}
            className="text-xs font-semibold hover:underline cursor-pointer ml-3"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Visualizer Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Comparison Stage (8 Cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white dark:bg-[#1d1b19] border border-[#eae4dc] dark:border-[#39342f] rounded-2xl overflow-hidden shadow-sm relative flex flex-col items-center justify-center">
            {isProcessing ? (
              <div className="absolute inset-0 bg-[#fdfbf7]/95 dark:bg-[#141311]/95 z-20 flex flex-col items-center justify-center p-8 text-center backdrop-blur-sm">
                <div className="w-16 h-16 rounded-2xl bg-orange-100 dark:bg-[#ff7417]/20 text-orange-600 dark:text-[#ff7417] flex items-center justify-center mb-6 shadow-sm">
                  <Sparkles className="w-8 h-8 animate-pulse" />
                </div>
                <h3 className="font-serif text-2xl font-bold text-zinc-900 dark:text-[#f5f0e8] mb-2">
                  Rendering 3D Visualization...
                </h3>
                <p className="text-sm text-zinc-500 dark:text-[#b4ada3] max-w-sm">
                  Applying photorealistic materials, daylighting, and spatial furnishings based on your floor plan lines.
                </p>
                <div className="w-48 h-1.5 bg-zinc-200 dark:bg-[#2b2a27] rounded-full mt-6 overflow-hidden">
                  <div className="h-full bg-orange-500 dark:bg-[#ff7417] animate-pulse rounded-full w-2/3" />
                </div>
              </div>
            ) : null}

            {project?.sourceImage && currentImage ? (
              <div className="w-full flex flex-col items-center p-3 sm:p-4">
                <div className="w-full relative rounded-xl border border-zinc-200 dark:border-[#39342f] bg-zinc-100/70 dark:bg-[#141311] overflow-hidden shadow-xs h-[340px] sm:h-[460px] md:h-[540px] lg:h-[600px] max-h-[75vh]">
                  {/* Corner Badges */}
                  <div className="absolute top-3 left-3 z-10 pointer-events-none select-none">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-black/75 text-white backdrop-blur-md border border-white/15 shadow-sm">
                      Original 2D Blueprint
                    </span>
                  </div>
                  <div className="absolute top-3 right-3 z-10 pointer-events-none select-none">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-orange-600/90 text-white backdrop-blur-md border border-white/20 shadow-sm">
                      3D Render Result
                    </span>
                  </div>

                  <ReactCompareSlider
                    defaultValue={50}
                    style={{ width: "100%", height: "100%" }}
                    className="w-full h-full select-none"
                    itemOne={
                      <ReactCompareSliderImage
                        src={project.sourceImage}
                        alt="Original 2D Blueprint"
                        style={{
                          objectFit: "contain",
                          objectPosition: "center",
                          width: "100%",
                          height: "100%",
                        }}
                      />
                    }
                    itemTwo={
                      <ReactCompareSliderImage
                        src={currentImage}
                        alt="3D Photorealistic Render"
                        style={{
                          objectFit: "contain",
                          objectPosition: "center",
                          width: "100%",
                          height: "100%",
                        }}
                      />
                    }
                  />
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-between w-full px-2 pt-3 text-xs text-zinc-500 dark:text-[#b4ada3] gap-1.5">
                  <span className="font-medium text-zinc-600 dark:text-[#b4ada3]">
                    ← Original 2D Blueprint
                  </span>
                  <span className="font-semibold text-orange-600 dark:text-[#ff7417] text-center">
                    Drag slider to compare • Touch, mouse, or arrow keys
                  </span>
                  <span className="font-medium text-zinc-600 dark:text-[#b4ada3]">
                    3D Render Result →
                  </span>
                </div>
              </div>
            ) : project?.sourceImage ? (
              <div className="p-6 text-center w-full">
                <img
                  src={project.sourceImage}
                  alt="Original Blueprint"
                  className="max-h-[500px] max-w-full mx-auto object-contain rounded-lg shadow-sm border border-zinc-200 dark:border-[#39342f]"
                />
              </div>
            ) : (
              <p className="text-sm text-zinc-400 dark:text-[#b4ada3] p-12">No image data found for this project.</p>
            )}
          </div>
        </div>

        {/* Sidebar Info & Controls (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="card-warm space-y-4">
            <h3 className="font-serif text-xl font-bold text-zinc-900 dark:text-[#f5f0e8] border-b border-zinc-100 dark:border-[#39342f] pb-3">
              Render Details
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-[#39342f]">
                <span className="text-zinc-500 dark:text-[#b4ada3]">Model Engine</span>
                <span className="font-medium text-zinc-800 dark:text-[#f5f0e8]">Puter Generative AI</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-[#39342f]">
                <span className="text-zinc-500 dark:text-[#b4ada3]">Output Format</span>
                <span className="font-medium text-zinc-800 dark:text-[#f5f0e8]">1024 × 1024 PNG</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-[#39342f]">
                <span className="text-zinc-500 dark:text-[#b4ada3]">View Angle</span>
                <span className="font-medium text-zinc-800 dark:text-[#f5f0e8]">Orthographic Top-Down</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-[#39342f]">
                <span className="text-zinc-500 dark:text-[#b4ada3]">Text Annotations</span>
                <span className="font-medium text-zinc-800 dark:text-[#f5f0e8]">Stripped / Synthesized</span>
              </div>
            </div>

            <div className="pt-2">
              <p className="text-xs text-zinc-500 dark:text-[#b4ada3] leading-relaxed bg-[#fdfbf7] dark:bg-[#141311] p-3 rounded-xl border border-[#eae4dc] dark:border-[#39342f]">
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
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-[#f5f0e8]">
                Are you sure you want to delete this project?
              </p>
              <p className="text-xs text-zinc-600 dark:text-[#b4ada3] mt-1">
                You are about to permanently delete{" "}
                <span className="font-semibold text-zinc-900 dark:text-[#f5f0e8]">
                  "{project?.name || `Project ${id}`}"
                </span>
                . This will remove the source blueprint, rendered output, and project records from cloud storage.
              </p>
            </div>
          </div>

          {deleteError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs">
              {deleteError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#eae4dc] dark:border-[#39342f]">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteModal(false)}
              disabled={isDeleting}
              className="dark:border-[#39342f] dark:text-[#e6e2de]"
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
