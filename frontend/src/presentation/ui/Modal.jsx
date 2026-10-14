import React, { useEffect } from "react";
import { X } from "lucide-react";

const Modal = ({ isOpen, onClose, title, children, maxWidth = "max-w-lg" }) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent page behind modal from scrolling while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div
        className={`relative w-full ${maxWidth} max-h-[calc(100vh-1.5rem)] sm:max-h-[92vh] flex flex-col bg-[#fdfbf7] dark:bg-[#1d1b19] rounded-2xl shadow-2xl border border-[#eae4dc] dark:border-[#39342f] overflow-hidden z-10 transition-all`}
      >
        <div className="shrink-0 flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-[#eae4dc] dark:border-[#39342f]">
          <h3 className="font-serif text-lg font-bold text-zinc-900 dark:text-[#f5f0e8] truncate pr-4">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:text-[#b4ada3] dark:hover:text-[#f5f0e8] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
