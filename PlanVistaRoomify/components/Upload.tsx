import { CheckCircle, CheckCircle2, ImageIcon, UploadIcon } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router";
import {
  PROGRESS_INCREMENT,
  REDIRECT_DELAY_MS,
  PROGRESS_INTERVAL_MS,
} from "../lib/constants";

interface UploadProps {
  onComplete: (data: string) => void;
}

const Upload: React.FC<UploadProps> = ({ onComplete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);

  const { isSignedIn } = useOutletContext<AuthContext>();

  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
      }
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }
    };
  }, []);

  const processFile = (files: FileList | null) => {
    if (!files || files.length === 0 || !isSignedIn) return;
    const selectedFile = files[0];

    setFile(selectedFile);

    const reader = new FileReader();
    reader.onerror = () => {
      setFile(null);
      setProgress(0);
    };

    reader.onload = () => {
      const base64 = reader.result as string;
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

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isSignedIn) setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (isSignedIn) processFile(e.dataTransfer.files);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isSignedIn) processFile(e.target.files);
  };

  return (
    <div className="upload">
      {!file ? (
        <div
          className={`dropzone ${isDragging ? "is-dragging" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            className="drop-input"
            accept=".jpg, .jpeg, .png, .webp"
            disabled={!isSignedIn}
            onChange={handleFileChange}
          />
          <div className="drop-content">
            <div className="drop-icon">
              <UploadIcon size={20} />
            </div>
            <p>
              {isSignedIn
                ? "Click to upload or just drag and drop"
                : "Sign In or Sign Up with Puter to upload"}
            </p>
            <p className="help">Maximum file size 50 MB.</p>
          </div>
        </div>
      ) : (
        <div className="upload-status">
          <div className="status-content">
            <div className="status-icon">
              {progress === 100 ? (
                <CheckCircle className="check" />
              ) : (
                <ImageIcon className="image" />
              )}
            </div>
            <h3>{file.name}</h3>
            <div className="progress">
              <div className="bar" style={{ width: `${progress}%` }} />

              <p className="status-text">
                {progress < 100 ? "Analyzing Floor Plan..." : "Redirecting..."}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Upload;
