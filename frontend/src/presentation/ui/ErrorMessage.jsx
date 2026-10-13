import React from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import Button from "./Button";

const ErrorMessage = ({
  title = "Something went wrong",
  message = "An unexpected error occurred while processing your request.",
  onRetry,
}) => {
  return (
    <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/20 p-5 text-red-900 dark:text-red-200 my-4">
      <div className="flex items-start space-x-3">
        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="text-xs text-red-700 dark:text-red-300 mt-1">{message}</p>
          {onRetry && (
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="bg-white dark:bg-[#1d1b19] text-red-700 dark:text-red-400 border-red-300 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Try Again
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ErrorMessage;
