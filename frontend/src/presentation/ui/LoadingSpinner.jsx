import React from "react";
import { Loader2 } from "lucide-react";

const LoadingSpinner = ({ label = "Loading...", description = "", size = "md" }) => {
  const sizeClasses = {
    sm: "w-5 h-5",
    md: "w-8 h-8",
    lg: "w-12 h-12",
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center space-y-3">
      <div className="relative">
        <Loader2 className={`${sizeClasses[size] || sizeClasses.md} animate-spin text-orange-500`} />
      </div>
      {label && <p className="text-sm font-medium text-zinc-800 dark:text-[#f5f0e8]">{label}</p>}
      {description && <p className="text-xs text-zinc-500 dark:text-[#b4ada3] max-w-sm">{description}</p>}
    </div>
  );
};

export default LoadingSpinner;
