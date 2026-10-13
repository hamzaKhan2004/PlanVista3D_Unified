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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div
        className={`relative w-full ${maxWidth} bg-[#fdfbf7] dark:bg-[#1d1b19] rounded-2xl shadow-2xl border border-[#eae4dc] dark:border-[#39342f] overflow-hidden z-10 transition-all`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#eae4dc] dark:border-[#39342f]">
          <h3 className="font-serif text-lg font-bold text-zinc-900 dark:text-[#f5f0e8]">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:text-[#b4ada3] dark:hover:text-[#f5f0e8] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
