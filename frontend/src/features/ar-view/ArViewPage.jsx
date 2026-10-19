import React, { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import "@google/model-viewer";
import {
  Sparkles,
  Smartphone,
  Box,
  RotateCcw,
  Maximize2,
  Minimize2,
  AlertTriangle,
  Loader2,
  QrCode,
  ArrowLeft,
  Info,
  Check,
  Copy,
  ExternalLink,
} from "lucide-react";
import Button from "../../presentation/ui/Button";
import ArScannerModal from "../../presentation/cad/ArScannerModal";
import { getSharedModel } from "../../lib/api/shareApi";
import { getSecureModelUrl } from "../../lib/api/modelApi";
import { getPublicFrontendOrigin } from "../../infrastructure/config/constants";

/**
 * Normalizes a model or USDZ asset URL to ensure it can be safely loaded
 * by Google <model-viewer> and native AR viewers (Scene Viewer / Quick Look).
 * Prevents browser Mixed Content blocking and port-5000 CORS issues in local development.
 */
const resolveAbsoluteModelUrl = (rawUrl, origin) => {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const cleanUrl = rawUrl.trim();
  if (!cleanUrl) return null;

  // 1. Relative path: prefix with canonical origin
  if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
    return `${origin}${cleanUrl.startsWith("/") ? "" : "/"}${cleanUrl}`;
  }

  // 2. If current window is HTTPS and rawUrl is HTTP, prevent Mixed Content blocking
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    cleanUrl.startsWith("http://")
  ) {
    try {
      const parsed = new URL(cleanUrl);
      if (
        parsed.hostname === window.location.hostname ||
        parsed.hostname.includes("onrender.com") ||
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "0.0.0.0"
      ) {
        return `${origin}${parsed.pathname}${parsed.search}`;
      }
      return cleanUrl.replace(/^http:\/\//i, "https://");
    } catch {
      return cleanUrl.replace(/^http:\/\//i, "https://");
    }
  }

  // 3. Localhost development port redirection: if backend returned localhost:5000,
  // route through current frontend origin (e.g. localhost:5173 with Vite proxy)
  if (
    typeof window !== "undefined" &&
    (cleanUrl.includes("localhost:5000") || cleanUrl.includes("127.0.0.1:5000")) &&
    window.location.port !== "5000"
  ) {
    try {
      const parsed = new URL(cleanUrl);
      return `${origin}${parsed.pathname}${parsed.search}`;
    } catch {}
  }

  // 4. Default: return verified URL as-is (e.g. direct Amazon S3 presigned URL)
  return cleanUrl;
};

const ArViewPage = () => {
  const { identifier: routeIdentifier } = useParams();
  const [searchParams] = useSearchParams();
  const identifier = routeIdentifier || searchParams.get("share") || searchParams.get("model");

  const [modelData, setModelData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState("");
  const [canAr, setCanAr] = useState(false);
  const [arStatusMessage, setArStatusMessage] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const modelViewerRef = useRef(null);
  const containerRef = useRef(null);

  // Load model details via share token or fallback direct task id
  useEffect(() => {
    let isMounted = true;

    if (!identifier) {
      setError("No model or AR share token specified.");
      setErrorCode("MISSING_IDENTIFIER");
      setIsLoading(false);
      return;
    }

    const loadModel = async () => {
      setIsLoading(true);
      setError(null);
      setErrorCode("");
      setArStatusMessage("");

      try {
        const origin = getPublicFrontendOrigin();

        // 1. Try public share token resolution first (requires no login headers)
        try {
          const res = await getSharedModel(identifier);
          if (!isMounted) return;
          if (res.success && res.model_url) {
            const absoluteModelUrl = resolveAbsoluteModelUrl(res.model_url, origin);
            const absoluteUsdzUrl = resolveAbsoluteModelUrl(res.usdz_url, origin);

            setModelData({
              ...res,
              model_url: absoluteModelUrl,
              usdz_url: absoluteUsdzUrl,
            });
            setIsLoading(false);
            return;
          }
        } catch (shareErr) {
          const errData = shareErr.response?.data;
          const code = errData?.code;
          if (code === "SHARE_REVOKED_OR_EXPIRED") {
            setError(
              "This AR share link has expired or was revoked by the model owner."
            );
            setErrorCode("REVOKED");
            setIsLoading(false);
            return;
          } else if (code === "MODEL_FILE_NOT_FOUND") {
            setError(
              "The 3D model asset could not be located on storage. It may still be generating."
            );
            setErrorCode("MODEL_NOT_FOUND");
            setIsLoading(false);
            return;
          } else {
            console.warn("Public share token resolution attempt:", shareErr);
          }
        }

        // 2. Fallback: If user is logged in, attempt direct task-id model URL resolution
        try {
          const directRes = await getSecureModelUrl(identifier);
          if (!isMounted) return;
          if (directRes && directRes.url) {
            const absoluteModelUrl = resolveAbsoluteModelUrl(directRes.url, origin);

            setModelData({
              project_name: directRes.filename || "3D CAD Model",
              model_url: absoluteModelUrl,
              usdz_url: null,
              storage_provider: directRes.storage_provider || "s3",
              is_ar_compatible: true,
              share_token: identifier,
            });
            setIsLoading(false);
            return;
          }
        } catch (directErr) {
          console.warn("Direct model access notice:", directErr);
        }

        if (!isMounted) return;
        setError(
          "Model not found. The AR share link may be invalid, expired, or private."
        );
        setErrorCode("NOT_FOUND");
      } catch (err) {
        if (!isMounted) return;
        console.error("Failed to load AR model:", err);
        setError("Network error loading model asset. Please check your connection.");
        setErrorCode("NETWORK_ERROR");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadModel();

    return () => {
      isMounted = false;
    };
  }, [identifier]);

  // Detect AR capability and register event handlers on <model-viewer>
  useEffect(() => {
    const viewer = modelViewerRef.current;
    if (!viewer) return;

    const checkAr = () => {
      if (typeof viewer.canActivateAR === "boolean") {
        setCanAr(viewer.canActivateAR);
      } else {
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        setCanAr(isMobile);
      }
    };

    const handleArStatus = (event) => {
      const status = event.detail?.status;
      if (status === "failed") {
        setArStatusMessage(
          "Native AR launch failed on this device. Ensure camera permissions are granted and Google Play Services for AR (Android) is updated."
        );
      } else if (status === "session-started") {
        setArStatusMessage("AR session started. Point your camera at a flat floor or table surface.");
      } else if (status === "object-placed") {
        setArStatusMessage("Model placed in physical space.");
      }
    };

    const handleModelError = (event) => {
      console.error("Model viewer asset load error:", event.detail);
      setArStatusMessage(
        "Could not load 3D geometry file. The model format or storage link may be temporarily unreachable."
      );
    };

    viewer.addEventListener("load", checkAr);
    viewer.addEventListener("ar-status", handleArStatus);
    viewer.addEventListener("error", handleModelError);
    checkAr();

    return () => {
      viewer.removeEventListener("load", checkAr);
      viewer.removeEventListener("ar-status", handleArStatus);
      viewer.removeEventListener("error", handleModelError);
    };
  }, [modelData]);

  const handleResetCamera = () => {
    if (modelViewerRef.current) {
      modelViewerRef.current.cameraOrbit = "0deg 75deg 105%";
      modelViewerRef.current.resetTurntable?.();
    }
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleCopyShareLink = async () => {
    if (copied) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  };

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-[#fdfbf7] dark:bg-[#141311] text-zinc-900 dark:text-[#f5f0e8] flex flex-col justify-between overflow-x-hidden"
    >
      {/* Top Header */}
      <header className="px-4 py-3 border-b border-[#eae4dc] dark:border-[#39342f] bg-white/90 dark:bg-[#1d1b19]/90 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 truncate">
          <Link
            to="/projects"
            className="p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-[#2b2a27] text-zinc-600 dark:text-[#b4ada3] transition-colors cursor-pointer shrink-0"
            title="Back to Studio Projects"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="truncate">
            <h1 className="font-serif text-base sm:text-lg font-bold text-zinc-900 dark:text-[#f5f0e8] truncate">
              {modelData?.project_name || "3D Architectural Model"}
            </h1>
            <p className="text-[11px] text-zinc-500 dark:text-[#b4ada3] flex items-center gap-1.5 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>AR Ready • WebGL / WebXR</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyShareLink}
            className="p-2 rounded-xl border border-zinc-200 dark:border-[#39342f] hover:bg-orange-50 dark:hover:bg-[#ff7417]/20 text-zinc-700 dark:text-[#f5f0e8] transition-colors cursor-pointer text-xs font-semibold flex items-center gap-1"
            title="Copy AR Link"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="hidden sm:inline text-emerald-600 dark:text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Share</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="p-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
            title="Show QR Code"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">QR Code</span>
          </button>
        </div>
      </header>

      {/* Main 3D / AR Viewport Container */}
      <main className="flex-1 relative flex items-center justify-center p-2 sm:p-4 min-h-[60vh] overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center space-y-3 py-20">
            <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold text-zinc-800 dark:text-[#f5f0e8]">
              Loading 3D CAD Model...
            </p>
            <p className="text-xs text-zinc-500 dark:text-[#b4ada3]">
              Preparing WebGL shaders and AR anchors
            </p>
          </div>
        ) : error ? (
          <div className="max-w-md w-full mx-auto p-6 bg-white dark:bg-[#1d1b19] border border-[#eae4dc] dark:border-[#39342f] rounded-3xl shadow-lg text-center space-y-4 my-8">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="font-serif text-xl font-bold text-zinc-900 dark:text-[#f5f0e8]">
              {errorCode === "REVOKED" ? "AR Share Link Revoked" : "Model Unavailable"}
            </h2>
            <p className="text-xs text-zinc-600 dark:text-[#b4ada3] leading-relaxed">
              {error}
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
              <Link to="/projects">
                <Button variant="primary" size="sm">
                  Back to Projects
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </div>
          </div>
        ) : (
          <div className="w-full h-full min-h-[65vh] max-h-[82vh] relative rounded-3xl overflow-hidden border border-[#eae4dc] dark:border-[#39342f] bg-[#f4eee6] dark:bg-[#100f0e] shadow-inner flex items-center justify-center">
            {/* Google <model-viewer> Web Component */}
            <model-viewer
              ref={modelViewerRef}
              src={modelData.model_url}
              ios-src={modelData.usdz_url || undefined}
              alt={modelData.project_name || "3D Architectural Model"}
              ar
              ar-modes="webxr scene-viewer quick-look"
              ar-scale="auto"
              ar-placement="floor"
              camera-controls
              touch-action="pan-y"
              shadow-intensity="1.2"
              shadow-softness="0.5"
              exposure="1.0"
              environment-image="neutral"
              auto-rotate
              auto-rotate-delay="3000"
              rotation-per-second="20deg"
              interaction-prompt="auto"
              style={{
                width: "100%",
                height: "100%",
                minHeight: "450px",
                outline: "none",
                backgroundColor: "transparent",
              }}
            >
              {/* Prominent Slot: AR Launch Button (Google model-viewer native slot) */}
              <button
                slot="ar-button"
                className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 text-white font-bold text-sm shadow-xl hover:shadow-orange-500/25 active:scale-95 transition-all flex items-center gap-2.5 cursor-pointer border border-white/20 select-none animate-bounce"
                title="Launch Augmented Reality on your device"
              >
                <Sparkles className="w-4 h-4 text-amber-200" />
                <span>View in Your Space (AR)</span>
              </button>

              {/* Viewport Control Badges & Tools */}
              <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleResetCamera}
                  className="p-2.5 rounded-xl bg-white/90 dark:bg-[#1d1b19]/90 text-zinc-700 dark:text-[#f5f0e8] border border-[#eae4dc] dark:border-[#39342f] shadow-md backdrop-blur-md hover:bg-orange-50 dark:hover:bg-[#ff7417]/20 transition-all cursor-pointer"
                  title="Reset Camera View"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  className="p-2.5 rounded-xl bg-white/90 dark:bg-[#1d1b19]/90 text-zinc-700 dark:text-[#f5f0e8] border border-[#eae4dc] dark:border-[#39342f] shadow-md backdrop-blur-md hover:bg-orange-50 dark:hover:bg-[#ff7417]/20 transition-all cursor-pointer"
                  title="Toggle Fullscreen"
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* AR Status Message Toast if triggered */}
              {arStatusMessage && (
                <div className="absolute top-4 left-4 right-16 z-20 pointer-events-none select-none">
                  <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-black/80 text-white text-xs font-medium backdrop-blur-md border border-white/10 shadow-lg max-w-md">
                    <Info className="w-4 h-4 text-orange-400 shrink-0" />
                    <span>{arStatusMessage}</span>
                  </div>
                </div>
              )}

              {/* Bottom Guidance Pill */}
              <div className="absolute bottom-4 left-4 z-10 hidden sm:block pointer-events-none select-none">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-black/60 text-white backdrop-blur-md border border-white/10 shadow-sm">
                  1-finger orbit • 2-finger pan & pinch zoom • 1:1 Scale
                </span>
              </div>
            </model-viewer>
          </div>
        )}
      </main>

      {/* Bottom Info Bar / Device Capability Guidance */}
      <footer className="px-4 py-3 bg-white/90 dark:bg-[#1d1b19]/90 border-t border-[#eae4dc] dark:border-[#39342f] backdrop-blur-md z-20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500 dark:text-[#b4ada3]">
        <div className="flex items-center gap-2 text-center sm:text-left">
          <Info className="w-4 h-4 text-orange-500 shrink-0" />
          <span>
            {/iPhone|iPad|iPod/i.test(navigator.userAgent) ? (
              modelData?.usdz_url ? (
                <>
                  <strong className="text-zinc-800 dark:text-[#f5f0e8]">Apple AR Quick Look Ready:</strong> Tap <em>"View in Your Space"</em> to launch native iOS Quick Look.
                </>
              ) : (
                <>
                  <strong className="text-zinc-800 dark:text-[#f5f0e8]">iOS 3D Canvas Active:</strong> Full WebGL 3D preview active. Native iOS AR requires a USDZ asset (converting or unavailable).
                </>
              )
            ) : /Android/i.test(navigator.userAgent) ? (
              canAr ? (
                <>
                  <strong className="text-zinc-800 dark:text-[#f5f0e8]">Android AR Ready:</strong> Tap <em>"View in Your Space"</em> to launch Google Scene Viewer or WebXR.
                </>
              ) : (
                <>
                  <strong className="text-zinc-800 dark:text-[#f5f0e8]">Android 3D Preview:</strong> Ensure Google Play Services for AR is installed to place on your physical floor.
                </>
              )
            ) : (
              <>
                <strong className="text-zinc-800 dark:text-[#f5f0e8]">Desktop 3D Preview:</strong> Mobile AR requires an ARCore-compatible Android or ARKit iOS device. Scan the QR code with your phone camera to place on your floor.
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0 font-medium">
          <Link
            to="/generate-model"
            className="text-orange-600 dark:text-[#ff7417] hover:underline"
          >
            Create New Model →
          </Link>
        </div>
      </footer>

      {/* QR Code Modal for Desktop users wanting to scan onto phone */}
      {showQrModal && (
        <ArScannerModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          shareToken={modelData?.share_token || identifier}
          project={{
            taskId: identifier,
            shareToken: modelData?.share_token || identifier,
            name: modelData?.project_name,
          }}
        />
      )}
    </div>
  );
};

export default ArViewPage;
