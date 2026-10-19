import React, { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import {
  QrCode,
  Download,
  Copy,
  Check,
  ExternalLink,
  Shield,
  ShieldAlert,
  Loader2,
  Smartphone,
  Sparkles,
  RefreshCw,
  X,
} from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { getPublicFrontendOrigin } from "../../infrastructure/config/constants";
import { createOrGetModelShare, revokeModelShare } from "../../lib/api/shareApi";

const sanitizeFilename = (name) => {
  return (name || "model")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
};

const ArScannerModal = ({ isOpen, onClose, project, shareToken: propShareToken }) => {
  const [shareToken, setShareToken] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isRevoked, setIsRevoked] = useState(false);
  const canvasRef = useRef(null);

  const existingShareToken = propShareToken || project?.shareToken;
  const rawTaskId = project?.taskId || project?.id;
  // If the identifier itself is already a share token (starts with ar_)
  const isIdentifierShareToken = typeof rawTaskId === "string" && rawTaskId.startsWith("ar_");
  const taskId = isIdentifierShareToken ? rawTaskId : rawTaskId;
  const projectName = project?.name || (taskId ? `Model ${taskId.slice(0, 8)}` : "3D CAD Model");
  const origin = getPublicFrontendOrigin();
  const shareUrl = shareToken ? `${origin}/ar-view/${shareToken}` : "";

  // Fetch or resolve share link on modal open
  useEffect(() => {
    let isMounted = true;

    if (!isOpen) {
      setShareToken("");
      setQrDataUrl("");
      setError("");
      setIsRevoked(false);
      return;
    }

    // 1. If an authoritative shareToken is already provided, use it directly
    if (existingShareToken) {
      setShareToken(existingShareToken);
      setIsRevoked(false);
      setIsLoading(false);
      return;
    }

    // 2. If the taskId is already a shareToken
    if (isIdentifierShareToken) {
      setShareToken(rawTaskId);
      setIsRevoked(false);
      setIsLoading(false);
      return;
    }

    if (!taskId) {
      setError("No project identifier available to generate AR share link.");
      setIsLoading(false);
      return;
    }

    const initShare = async () => {
      setIsLoading(true);
      setError("");
      try {
        const res = await createOrGetModelShare(taskId);
        if (!isMounted) return;
        if (res.success && res.share_token) {
          setShareToken(res.share_token);
          setIsRevoked(false);
        } else {
          setError("Unable to generate AR share token. Please check your connection.");
        }
      } catch (err) {
        if (!isMounted) return;
        console.error("Failed to initialize model AR share:", err);
        const code = err.response?.data?.code;
        if (code === "AUTH_REQUIRED") {
          setError("Please sign in to your PlanVista3D account to generate shareable AR links.");
        } else if (code === "FORBIDDEN") {
          setError("You do not have permission to share this CAD model. Only the model creator can generate share links.");
        } else if (code === "PROJECT_NOT_FOUND") {
          setError("3D CAD model could not be found. Please ensure generation has finished.");
        } else {
          setError(
            err.response?.data?.error ||
              err.message ||
              "Unable to generate AR share link for this model."
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    initShare();

    return () => {
      isMounted = false;
    };
  }, [isOpen, taskId, existingShareToken, isIdentifierShareToken, rawTaskId]);

  // Generate crisp QR code canvas & data URL when shareUrl updates
  useEffect(() => {
    if (!shareUrl) {
      setQrDataUrl("");
      return;
    }

    QRCode.toDataURL(shareUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: "#141311",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        setQrDataUrl(url);
      })
      .catch((err) => {
        console.error("Error generating QR data URL:", err);
      });
  }, [shareUrl]);

  const handleCopyLink = async () => {
    if (!shareUrl || copied) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const safeName = sanitizeFilename(projectName);
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `planvista3d-${safeName}-qr.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRevoke = async () => {
    if (!taskId || isRevoking) return;
    setIsRevoking(true);
    try {
      await revokeModelShare(taskId);
      setIsRevoked(true);
      setShareToken("");
      setQrDataUrl("");
    } catch (err) {
      console.error("Failed to revoke share link:", err);
      setError("Failed to revoke link. Please verify your connection.");
    } finally {
      setIsRevoking(false);
    }
  };

  const handleRecreate = async () => {
    if (!taskId || isLoading) return;
    setIsLoading(true);
    setError("");
    try {
      const res = await createOrGetModelShare(taskId);
      if (res.success && res.share_token) {
        setShareToken(res.share_token);
        setIsRevoked(false);
      }
    } catch (err) {
      setError("Failed to re-enable AR link.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="AR Scanner & 3D Viewer" size="lg">
      <div className="space-y-6">
        {/* Header Summary */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-[#eae4dc] dark:border-[#39342f]">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 dark:bg-[#ff7417]/20 text-orange-700 dark:text-[#ff9d54]">
                <Sparkles className="w-3 h-3 text-orange-500 dark:text-[#ff7417]" />
                Augmented Reality Ready
              </span>
            </div>
            <h3 className="font-serif text-lg font-bold text-zinc-900 dark:text-[#f5f0e8] mt-1 truncate max-w-sm sm:max-w-md">
              {projectName}
            </h3>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-[#b4ada3]">
            <Smartphone className="w-4 h-4 text-orange-500" />
            <span>iOS AR Quick Look • Android Scene Viewer</span>
          </div>
        </div>

        {/* Content Body */}
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            <p className="text-xs text-zinc-600 dark:text-[#b4ada3]">
              Generating secure AR sharing link...
            </p>
          </div>
        ) : error ? (
          <div className="p-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-2xl text-center space-y-3">
            <ShieldAlert className="w-8 h-8 text-red-500 mx-auto" />
            <p className="text-sm font-semibold text-red-900 dark:text-red-200">{error}</p>
            <Button variant="outline" size="sm" onClick={handleRecreate}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
            </Button>
          </div>
        ) : isRevoked ? (
          <div className="p-6 bg-zinc-50 dark:bg-[#1d1b19] border border-[#eae4dc] dark:border-[#39342f] rounded-2xl text-center space-y-3">
            <Shield className="w-8 h-8 text-zinc-400 mx-auto" />
            <p className="text-sm font-semibold text-zinc-800 dark:text-[#f5f0e8]">
              AR Share Link Revoked
            </p>
            <p className="text-xs text-zinc-500 dark:text-[#b4ada3] max-w-sm mx-auto">
              This model is no longer accessible via public QR code scans. You can re-enable public AR sharing at any time.
            </p>
            <Button variant="primary" size="sm" onClick={handleRecreate}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Re-enable AR Link
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* Left: High-contrast QR Code Card */}
            <div className="flex flex-col items-center justify-center p-4 bg-white dark:bg-[#211f1d] rounded-2xl border border-[#eae4dc] dark:border-[#39342f] shadow-sm">
              <div className="p-3 bg-white rounded-xl shadow-xs border border-zinc-100 flex items-center justify-center">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR Code for ${projectName}`}
                    className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
                  />
                ) : (
                  <div className="w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center bg-zinc-50">
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                  </div>
                )}
              </div>
              <p className="text-[11px] font-mono text-zinc-500 dark:text-[#b4ada3] mt-3 flex items-center gap-1.5 text-center">
                <QrCode className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                <span>Scan with phone camera to launch AR</span>
              </p>
            </div>

            {/* Right: Instructions & Action Buttons */}
            <div className="space-y-4">
              <div className="bg-[#fdfbf7] dark:bg-[#1d1b19] p-4 rounded-2xl border border-[#eae4dc] dark:border-[#39342f] space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-[#f5f0e8] flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-orange-500" />
                  How to view in AR
                </h4>
                <ol className="text-xs text-zinc-600 dark:text-[#b4ada3] space-y-1.5 list-decimal list-inside leading-relaxed">
                  <li>Open the Camera app on an iPhone (iOS 12+) or Android device (with ARCore).</li>
                  <li>Point your camera at the QR code and tap the notification link.</li>
                  <li>Tap <strong>"View in Your Space"</strong> to place the 3D floor plan in your room.</li>
                </ol>
              </div>

              {/* Share URL copy pill */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-zinc-500 dark:text-[#b4ada3]">
                  Stable AR Share URL
                </span>
                <div className="flex items-center gap-2 p-1.5 bg-zinc-100 dark:bg-[#141311] border border-zinc-200 dark:border-[#39342f] rounded-xl">
                  <span className="text-xs font-mono text-zinc-700 dark:text-[#b4ada3] truncate flex-1 px-2 select-all">
                    {shareUrl || "Generating..."}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    disabled={!shareUrl}
                    className="p-1.5 rounded-lg bg-white dark:bg-[#211f1d] hover:bg-orange-50 dark:hover:bg-[#ff7417]/20 text-zinc-700 dark:text-[#f5f0e8] hover:text-orange-600 dark:hover:text-[#ff7417] transition-colors cursor-pointer shrink-0 shadow-xs text-xs font-semibold flex items-center gap-1"
                    title="Copy Link"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span className="text-[11px]">Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleDownloadQr}
                  disabled={!qrDataUrl}
                  className="flex-1 flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download QR Code</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(shareUrl, "_blank")}
                  disabled={!shareUrl}
                  className="flex items-center justify-center gap-1.5 dark:border-[#39342f] dark:text-[#e6e2de]"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Preview Model</span>
                </Button>
              </div>

              {/* Security & Revoke control */}
              <div className="pt-2 border-t border-zinc-100 dark:border-[#39342f] flex items-center justify-between text-[11px] text-zinc-500 dark:text-[#b4ada3]">
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <Shield className="w-3 h-3" /> Encrypted Link Token
                </span>
                <button
                  type="button"
                  onClick={handleRevoke}
                  disabled={isRevoking}
                  className="text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer underline text-[11px]"
                >
                  {isRevoking ? "Revoking..." : "Revoke Access"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-end pt-3 border-t border-[#eae4dc] dark:border-[#39342f]">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ArScannerModal;
