import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const Upload = () => {
  const [file, setFile] = useState(null);
  const [floors, setFloors] = useState("3");
  const [wallHeight, setWallHeight] = useState("3.2");
  const [wallThickness, setWallThickness] = useState("0.25");
  const [isDXF, setIsDXF] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;
    const ext = selectedFile.name.split(".").pop().toLowerCase();
    setIsDXF(ext === "dxf");
    setFile(selectedFile);
    setError("");
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file");
      return;
    }
    if (isDXF && (!floors || Number(floors) < 1)) {
      setError("Valid floors needed");
      return;
    }
    if (!wallHeight || Number(wallHeight) <= 0) {
      setError("Invalid wall height");
      return;
    }
    if (!wallThickness || Number(wallThickness) <= 0) {
      setError("Invalid wall thickness");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("wall_height", Number(wallHeight));
    formData.append("wall_thickness", Number(wallThickness));
    if (isDXF) formData.append("floors", Number(floors));

    try {
      setUploading(true);
      setError("");
      const res = await axios.post("/api/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      navigate(`/viewer/${res.data.task_id}`);
    } catch (err) {
      setError(err.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-12 max-w-md mx-auto">
      {/* Compact File Upload */}
      <div className="mb-6 text-center">
        <input
          type="file"
          accept=".dxf,.png,.jpg,.jpeg"
          onChange={handleFileChange}
          className="hidden"
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          className="block w-full p-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer transition-colors"
        >
          {file ? (
            <div className="space-y-2">
              <div className="w-12 h-12 bg-green-100 rounded-full mx-auto flex items-center justify-center">
                <span className="text-xl">✅</span>
              </div>
              <p className="text-sm font-medium text-gray-900 truncate">
                {file.name}
              </p>
              <span
                className={`text-xs ${isDXF ? "text-purple-600" : "text-blue-600"}`}
              >
                {isDXF ? "DXF" : "Image"}
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="w-12 h-12 bg-indigo-100 rounded-full mx-auto flex items-center justify-center">
                <span className="text-xl">📁</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">
                Choose Blueprint
              </p>
              <p className="text-xs text-gray-500">PNG, JPG, DXF</p>
            </div>
          )}
        </label>
      </div>

      {/* Compact Parameters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {isDXF && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Floors
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={floors}
              onChange={(e) => setFloors(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        )}

        <div className={isDXF ? "" : "md:col-span-2"}>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Wall Height (m)
          </label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            max="10"
            value={wallHeight}
            onChange={(e) => setWallHeight(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Thickness (m)
          </label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            max="2"
            value={wallThickness}
            onChange={(e) => setWallThickness(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-800">{error}</p>
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className={`w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-all ${
          file && !uploading
            ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg"
            : "bg-gray-200 text-gray-500 cursor-not-allowed"
        }`}
      >
        {uploading ? "⏳ Processing..." : "🚀 Generate 3D Model"}
      </button>
    </div>
  );
};

export default Upload;
