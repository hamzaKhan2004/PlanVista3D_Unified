import React from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import Button from "./Button";

const ErrorMessage = ({
  title = "Something went wrong",
  message = "An unexpected error occurred while processing your request.",
  onRetry,
}) => {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/70 p-5 text-red-900 my-4">
      <div className="flex items-start space-x-3">
        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="text-xs text-red-700 mt-1">{message}</p>
          {onRetry && (
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="bg-white text-red-700 border-red-300 hover:bg-red-50 text-xs"
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
