import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UploadCloud, CheckCircle2, Box, Layers, AlertCircle, ArrowRight, Sparkles } from "lucide-react";
import Button from "../../presentation/ui/Button";
import { uploadBlueprint, extractVectorGeometry, saveLocalModelProject } from "../../lib/api/modelApi";
import VectorGeometryPreviewModal from "../../presentation/cad/VectorGeometryPreviewModal";

const UploadBlueprint = () => {
  const [file, setFile] = useState(null);
  const [floors, setFloors] = useState("3");
  const [wallHeight, setWallHeight] = useState("3.2");
  const [wallThickness, setWallThickness] = useState("0.25");
  const [targetSize, setTargetSize] = useState("28.0");
  const [isDXF, setIsDXF] = useState(false);
  const [isVectorAssisted, setIsVectorAssisted] = useState(true);
  const [sourceThumbnail, setSourceThumbnail] = useState(null);
  const [vectorPreviewData, setVectorPreviewData] = useState(null);
  const [isVectorModalOpen, setIsVectorModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const handleFileChange = (event) => {
    const selected = event.target.files[0];
    if (!selected) return;
    const ext = selected.name.split(".").pop().toLowerCase();
    const isDxfFile = ext === "dxf";
    setIsDXF(isDxfFile);
    setFile(selected);
    setError("");
    setVectorPreviewData(null);

    if (!isDxfFile) {
      try {
        const reader = new FileReader();
        reader.onload = (e) => setSourceThumbnail(e.target.result);
        reader.readAsDataURL(selected);
      } catch (_) {}
    } else {
      setSourceThumbnail(null);
    }
  };

  const handleExtractVectorPreview = async () => {
    if (!file) {
      setError("Please select a floor plan image (PNG, JPG)");
      return;
    }

    try {
      setUploading(true);
      setError("");

      const data = await extractVectorGeometry({
        file,
        wallHeight,
        wallThickness,
        targetSize,
      });

      setVectorPreviewData(data);
      setIsVectorModalOpen(true);
    } catch (err) {
      console.error("Vector extraction failed:", err);
      setError(
        err.response?.data?.error ||
          "Could not extract clean wall geometry from the image. Please verify wall line contrast or toggle standard generation."
      );
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmVectorGenerate = async ({ vectorData, targetSize: calScale, wallHeight: calHeight, wallThickness: calThick }) => {
    try {
      setUploading(true);
      setError("");

      const res = await uploadBlueprint({
        file,
        wallHeight: calHeight,
        wallThickness: calThick,
        targetSize: calScale,
        vectorAssisted: true,
        vectorData,
      });

      saveLocalModelProject({
        id: res.task_id,
        taskId: res.task_id,
        name: file.name.replace(/\.[^/.]+$/, ""),
        fileName: file.name,
        type: "image",
        pipeline: "vector_assisted",
        floors: 1,
        wallHeight: Number(calHeight),
        wallThickness: Number(calThick),
        targetSize: Number(calScale),
        timestamp: Date.now(),
        sourceThumbnail,
        sourceDownloadUrl: `/api/source/${res.task_id}`,
        status: "processing",
        analysis: {
          pipeline: "vector_assisted",
          walls_detected: vectorData?.wall_count || vectorData?.line_segments?.length || 0,
        },
      });

      setIsVectorModalOpen(false);
      navigate(`/model-viewer/${res.task_id}`);
    } catch (err) {
      console.error("Vector generation failed:", err);
      setError(
        err.response?.data?.error ||
          "Failed to initiate 3D model generation. Please check backend service status."
      );
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a blueprint file (DXF, PNG, or JPG)");
      return;
    }

    // When vector-assisted generation is enabled for raster images, show the 2D preview & calibration first
    if (!isDXF && isVectorAssisted) {
      await handleExtractVectorPreview();
      return;
    }

    if (isDXF && (!floors || Number(floors) < 1)) {
      setError("Please enter a valid number of floors (minimum 1)");
      return;
    }
    if (!wallHeight || Number(wallHeight) <= 0) {
      setError("Please enter a valid wall height in meters");
      return;
    }
    if (!wallThickness || Number(wallThickness) <= 0) {
      setError("Please enter a valid wall thickness in meters");
      return;
    }

    try {
      setUploading(true);
      setError("");

      let thumbnail = sourceThumbnail;
      if (!isDXF && file && !thumbnail) {
        try {
          thumbnail = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          });
        } catch (_) {}
      }

      const res = await uploadBlueprint({
        file,
        floors,
        wallHeight,
        wallThickness,
      });

      // Save to local model projects registry
      saveLocalModelProject({
        id: res.task_id,
        taskId: res.task_id,
        name: file.name.replace(/\.[^/.]+$/, ""),
        fileName: file.name,
        type: isDXF ? "dxf" : "image",
        floors: isDXF ? Number(floors) : 1,
        wallHeight: Number(wallHeight),
        wallThickness: Number(wallThickness),
        timestamp: Date.now(),
        sourceThumbnail: thumbnail,
        sourceDownloadUrl: `/api/source/${res.task_id}`,
        status: "processing",
      });

      navigate(`/model-viewer/${res.task_id}`);
    } catch (err) {
      console.error("Upload failed:", err);
      setError(
        err.response?.data?.error ||
          "Failed to upload blueprint to processing service. Ensure the backend server is running."
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="card-warm max-w-xl mx-auto p-8 sm:p-10 border border-[#eae4dc] dark:border-[#39342f]">
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-2xl bg-orange-100 dark:bg-[#ff7417]/20 text-orange-600 dark:text-[#ff7417] flex items-center justify-center mx-auto mb-3">
          <Box className="w-6 h-6" />
        </div>
        <h2 className="font-serif text-3xl font-bold text-zinc-900 dark:text-[#f5f0e8]">
          Upload Blueprint for 3D Geometry
        </h2>
        <p className="text-xs text-zinc-500 dark:text-[#b4ada3] mt-1 max-w-md mx-auto">
          Convert CAD vector drawings or raster floor plans into an authentic 3D mesh model (.GLB)
        </p>
      </div>

      {/* File Dropzone */}
      <div className="mb-6">
        <input
          type="file"
          accept=".dxf,.png,.jpg,.jpeg"
          onChange={handleFileChange}
          className="hidden"
          id="cad-blueprint-upload"
        />
        <label
          htmlFor="cad-blueprint-upload"
          className={`block w-full p-8 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all ${
            file
              ? "border-green-400 dark:border-green-600/60 bg-green-50/20 dark:bg-green-950/20"
              : "border-zinc-300 dark:border-[#39342f] hover:border-orange-400 dark:hover:border-[#ff7417] hover:bg-orange-50/20 dark:hover:bg-[#ff7417]/5 bg-[#fdfbf7] dark:bg-[#141311]"
          }`}
        >
          {file ? (
            <div className="space-y-2">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-950/40 text-green-600 dark:text-green-400 rounded-2xl mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-[#f5f0e8] truncate max-w-xs mx-auto">
                {file.name}
              </p>
              <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                isDXF ? "bg-purple-100 dark:bg-[#9333ea]/20 text-purple-700 dark:text-[#ddb8ff]" : "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
              }`}>
                {isDXF ? "AutoCAD DXF Vector" : "Raster Blueprint Image"}
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-12 h-12 bg-orange-100 dark:bg-[#ff7417]/20 text-orange-600 dark:text-[#ff7417] rounded-2xl mx-auto flex items-center justify-center">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-[#f5f0e8]">
                  Select Blueprint File
                </p>
                <p className="text-xs text-zinc-500 dark:text-[#b4ada3] mt-0.5">
                  Supports AutoCAD (.DXF) and Images (.PNG, .JPG)
                </p>
              </div>
            </div>
          )}
        </label>
      </div>

      {/* Vector-Assisted Mode Toggle (For Images only) */}
      {!isDXF && (
        <div className="mb-6 p-4 rounded-xl border border-orange-200 dark:border-orange-900/40 bg-orange-50/40 dark:bg-[#1f1b16] transition-all">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-[#ff7417]/20 text-orange-600 dark:text-[#ff7417] mt-0.5">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="vector-assisted-toggle"
                    className="text-sm font-semibold text-zinc-900 dark:text-[#f5f0e8] cursor-pointer"
                  >
                    Vector-Assisted Generation
                  </label>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-100 dark:bg-[#ff7417]/20 text-orange-700 dark:text-[#ff9d54]">
                    Enhanced
                  </span>
                </div>
                <p className="text-xs text-zinc-600 dark:text-[#b4ada3] mt-1 leading-relaxed">
                  Cleans floor plan noise, extracts clean 2D wall vectors, eliminates parallel duplicate edges, and provides an interactive 2D geometry preview before 3D extrusion.
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
              <input
                id="vector-assisted-toggle"
                type="checkbox"
                checked={isVectorAssisted}
                onChange={(e) => setIsVectorAssisted(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-[#2d2925] peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-zinc-600 peer-checked:bg-[#ff7417]"></div>
            </label>
          </div>
        </div>
      )}

      {/* Parameter Settings */}
      <div className="space-y-4 mb-6 bg-[#fdfbf7] dark:bg-[#141311] p-5 rounded-xl border border-[#eae4dc] dark:border-[#39342f]">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-[#a88b7d]">
          Geometric Parameters
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {isDXF ? (
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-[#e6e2de] mb-1">
                Floors
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={floors}
                onChange={(e) => setFloors(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-[#1d1b19] border border-zinc-200 dark:border-[#39342f] text-zinc-900 dark:text-[#f5f0e8] font-mono rounded-lg focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-[#e6e2de] mb-1">
                Plan Scale (m)
              </label>
              <input
                type="number"
                step="1"
                min="5"
                max="200"
                value={targetSize}
                onChange={(e) => setTargetSize(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-[#1d1b19] border border-zinc-200 dark:border-[#39342f] text-zinc-900 dark:text-[#f5f0e8] font-mono rounded-lg focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
                placeholder="28.0"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-[#e6e2de] mb-1">
              Wall Height (m)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.5"
              max="10"
              value={wallHeight}
              onChange={(e) => setWallHeight(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-[#1d1b19] border border-zinc-200 dark:border-[#39342f] text-zinc-900 dark:text-[#f5f0e8] font-mono rounded-lg focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-[#e6e2de] mb-1">
              Thickness (m)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.05"
              max="1.5"
              value={wallThickness}
              onChange={(e) => setWallThickness(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-[#1d1b19] border border-zinc-200 dark:border-[#39342f] text-zinc-900 dark:text-[#f5f0e8] font-mono rounded-lg focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-800 dark:text-red-300 leading-relaxed">{error}</p>
        </div>
      )}

      {/* Action Button */}
      <Button
        variant="primary"
        size="lg"
        fullWidth
        onClick={handleUpload}
        disabled={!file || uploading}
        className="flex items-center justify-center gap-2"
      >
        {uploading ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>
              {!isDXF && isVectorAssisted
                ? "Extracting Vector Geometry..."
                : "Queuing Generation Task..."}
            </span>
          </>
        ) : (
          <>
            <span>
              {!isDXF && isVectorAssisted
                ? "Preview Vector Geometry"
                : "Generate 3D Model"}
            </span>
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </Button>

      {/* 2D Vector Geometry Preview & Calibration Modal */}
      <VectorGeometryPreviewModal
        isOpen={isVectorModalOpen}
        onClose={() => setIsVectorModalOpen(false)}
        onConfirm={handleConfirmVectorGenerate}
        vectorData={vectorPreviewData}
        sourceImage={sourceThumbnail}
        initialTargetSize={targetSize}
        initialWallHeight={wallHeight}
        initialWallThickness={wallThickness}
        isLoading={uploading}
      />
    </div>
  );
};

export default UploadBlueprint;
