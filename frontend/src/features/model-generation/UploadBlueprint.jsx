import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UploadCloud, CheckCircle2, Box, Layers, AlertCircle, ArrowRight } from "lucide-react";
import Button from "../../components/ui/Button";
import { uploadBlueprint, saveLocalModelProject } from "../../lib/api/modelApi";

const UploadBlueprint = () => {
  const [file, setFile] = useState(null);
  const [floors, setFloors] = useState("3");
  const [wallHeight, setWallHeight] = useState("3.2");
  const [wallThickness, setWallThickness] = useState("0.25");
  const [isDXF, setIsDXF] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const handleFileChange = (event) => {
    const selected = event.target.files[0];
    if (!selected) return;
    const ext = selected.name.split(".").pop().toLowerCase();
    setIsDXF(ext === "dxf");
    setFile(selected);
    setError("");
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a blueprint file (DXF, PNG, or JPG)");
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
    <div className="card-warm max-w-xl mx-auto p-8 sm:p-10 border border-[#eae4dc]">
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center mx-auto mb-3">
          <Box className="w-6 h-6" />
        </div>
        <h2 className="font-serif text-3xl font-bold text-zinc-900">
          Upload Blueprint for 3D Geometry
        </h2>
        <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
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
              ? "border-green-400 bg-green-50/20"
              : "border-zinc-300 hover:border-orange-400 hover:bg-orange-50/20 bg-[#fdfbf7]"
          }`}
        >
          {file ? (
            <div className="space-y-2">
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-2xl mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-zinc-900 truncate max-w-xs mx-auto">
                {file.name}
              </p>
              <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                isDXF ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
              }`}>
                {isDXF ? "AutoCAD DXF Vector" : "Raster Blueprint Image"}
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-2xl mx-auto flex items-center justify-center">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900">
                  Select Blueprint File
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Supports AutoCAD (.DXF) and Images (.PNG, .JPG)
                </p>
              </div>
            </div>
          )}
        </label>
      </div>

      {/* Parameter Settings */}
      <div className="space-y-4 mb-6 bg-[#fdfbf7] p-5 rounded-xl border border-[#eae4dc]">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
          Geometric Parameters
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {isDXF && (
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Floors
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={floors}
                onChange={(e) => setFloors(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
              />
            </div>
          )}

          <div className={isDXF ? "" : "sm:col-span-2"}>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Wall Height (m)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.5"
              max="10"
              value={wallHeight}
              onChange={(e) => setWallHeight(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Thickness (m)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.05"
              max="1.5"
              value={wallThickness}
              onChange={(e) => setWallThickness(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-800 leading-relaxed">{error}</p>
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
            <span>Queuing Generation Task...</span>
          </>
        ) : (
          <>
            <span>Generate 3D Model</span>
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </Button>
    </div>
  );
};

export default UploadBlueprint;
