import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, Image as ImageIcon, UploadCloud } from "lucide-react";
import { useAuth } from "../../presentation/layout/AppLayout";
import {
  PROGRESS_INCREMENT,
  REDIRECT_DELAY_MS,
  PROGRESS_INTERVAL_MS,
} from "../../lib/utils/constants";

const UploadFloorPlan = ({ onComplete }) => {
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);

  const { isSignedIn, signIn } = useAuth();

  const intervalIdRef = useRef(null);
  const timeoutIdRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (intervalIdRef.current) clearInterval(intervalIdRef.current);
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    };
  }, []);

  const processFile = (files) => {
    if (!files || files.length === 0) return;

    if (!isSignedIn) {
      signIn();
      return;
    }

    const selectedFile = files[0];
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onerror = () => {
      setFile(null);
      setProgress(0);
    };

    reader.onload = () => {
      const base64 = reader.result;
      let currentProgress = 0;
      intervalIdRef.current = setInterval(() => {
        currentProgress += PROGRESS_INCREMENT;
        if (currentProgress >= 100) {
          if (mountedRef.current) setProgress(100);
          if (intervalIdRef.current) clearInterval(intervalIdRef.current);
          timeoutIdRef.current = setTimeout(() => {
            onComplete(base64);
          }, REDIRECT_DELAY_MS);
        } else {
          if (mountedRef.current) setProgress(currentProgress);
        }
      }, PROGRESS_INTERVAL_MS);
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    processFile(e.dataTransfer.files);
  };

  const handleFileChange = (e) => {
    processFile(e.target.files);
  };

  return (
    <div className="w-full">
      {!file ? (
        <div
          className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all cursor-pointer ${
            isDragging
              ? "border-orange-500 bg-orange-50/50 scale-[1.01]"
              : "border-zinc-300 hover:border-orange-400 hover:bg-orange-50/20 bg-white"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => {
            if (!isSignedIn) {
              signIn();
            } else {
              document.getElementById("floorplan-upload-input")?.click();
            }
          }}
        >
          <input
            id="floorplan-upload-input"
            type="file"
            className="hidden"
            accept=".jpg,.jpeg,.png,.webp"
            onChange={handleFileChange}
          />
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center shadow-sm">
              <UploadCloud className="w-7 h-7" />
            </div>
            <div>
              <p className="text-base font-semibold text-zinc-900">
                {isSignedIn
                  ? "Click to upload or drag & drop floor plan"
                  : "Sign in with Puter to upload floor plan"}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Supports JPG, PNG, WEBP architectural floor plans up to 50MB
              </p>
            </div>
            {!isSignedIn && (
              <span className="inline-block mt-2 text-xs font-semibold text-orange-600 bg-orange-50 px-3 py-1 rounded-full border border-orange-200">
                Click here to sign in with Puter
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-2xl p-8 shadow-sm text-center">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center">
              {progress === 100 ? (
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              ) : (
                <ImageIcon className="w-8 h-8" />
              )}
            </div>
            <h3 className="text-base font-semibold text-zinc-800 truncate max-w-sm">
              {file.name}
            </h3>
            <div className="w-full max-w-xs space-y-2">
              <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 transition-all duration-200 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-zinc-500 font-medium">
                {progress < 100 ? "Analyzing floor plan lines..." : "Redirecting to visualizer..."}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadFloorPlan;
