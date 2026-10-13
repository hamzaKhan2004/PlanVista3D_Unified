import React from "react";

const Badge = ({ variant = "default", className = "", children }) => {
  const variantStyles = {
    default: "bg-zinc-100 dark:bg-[#211f1d] text-zinc-700 dark:text-[#e6e2de] border-zinc-200 dark:border-[#39342f]",
    orange: "bg-orange-50 dark:bg-[#ff7417]/15 text-orange-700 dark:text-[#ffb691] border-orange-200 dark:border-[#ff7417]/30",
    emerald: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40",
    blue: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/40",
    purple: "bg-purple-50 dark:bg-[#9333ea]/15 text-purple-700 dark:text-[#ddb8ff] border-purple-200 dark:border-[#9333ea]/30",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${
        variantStyles[variant] || variantStyles.default
      } ${className}`}
    >
      {children}
    </span>
  );
};

export default Badge;
