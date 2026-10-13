import React from "react";
import Button from "./Button";

const EmptyState = ({
  icon: Icon,
  title = "No items found",
  description = "Get started by generating your first design or model.",
  actionLabel,
  onAction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-[#eae4dc] dark:border-[#39342f] rounded-2xl bg-[#fdfbf7]/50 dark:bg-[#1d1b19]/60 my-6">
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-orange-50 dark:bg-[#ff7417]/15 text-orange-600 dark:text-[#ff7417] flex items-center justify-center mb-4 shadow-sm border border-orange-100 dark:border-[#ff7417]/30">
          <Icon className="w-7 h-7" />
        </div>
      )}
      <h3 className="text-lg font-serif font-bold text-zinc-900 dark:text-[#f5f0e8]">{title}</h3>
      <p className="text-sm text-zinc-500 dark:text-[#b4ada3] max-w-sm mt-1.5 mb-6">{description}</p>
      {actionLabel && onAction && (
        <Button variant="primary" size="md" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};

export default EmptyState;
