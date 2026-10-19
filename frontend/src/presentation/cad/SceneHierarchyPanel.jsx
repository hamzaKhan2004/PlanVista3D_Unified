import React, { useState } from "react";
import {
  Layers,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Eye,
  EyeOff,
  Search,
  Box,
  DoorClosed,
  AppWindow,
  Square,
  PlusCircle,
} from "lucide-react";
import Badge from "../ui/Badge";

const SceneHierarchyPanel = ({
  dynamicObjects,
  selectedObjectId,
  selectedObjectIds = [],
  onSelectObject,
  onClearSelection,
  onToggleVisibility,
  onToggleCategoryVisibility,
  categoryVisibility,
  onCollapse,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState({
    walls: true,
    doors: true,
    windows: true,
    rooms: true,
    custom: true,
  });

  const toggleCategory = (cat) => {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const deletedSet = new Set(dynamicObjects?.deletedIds || []);

  const categories = [
    {
      key: "walls",
      label: "Walls",
      icon: Square,
      items: (dynamicObjects?.walls || []).filter((item) => !deletedSet.has(item.id)),
    },
    {
      key: "doors",
      label: "Doors",
      icon: DoorClosed,
      items: (dynamicObjects?.doors || []).filter((item) => !deletedSet.has(item.id)),
    },
    {
      key: "windows",
      label: "Windows",
      icon: AppWindow,
      items: (dynamicObjects?.windows || []).filter((item) => !deletedSet.has(item.id)),
    },
    {
      key: "rooms",
      label: "Rooms & Floors",
      icon: Layers,
      items: [
        ...(dynamicObjects?.rooms || []),
        ...(dynamicObjects?.floors || []),
      ].filter((item) => !deletedSet.has(item.id)),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#fdfbf7] dark:bg-[#1d1b19] text-xs text-zinc-700 dark:text-[#b4ada3] divide-y divide-[#eae4dc] dark:divide-[#39342f]">
      {/* Search & Collapse Header */}
      <div className="p-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-zinc-400 dark:text-[#b4ada3] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search scene elements..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 dark:border-[#39342f] bg-white dark:bg-[#141311] text-xs dark:text-[#f5f0e8] placeholder:text-zinc-400 dark:placeholder:text-[#8e867b] focus:outline-orange-500"
          />
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            title="Collapse Scene Outliner (Left Panel)"
            aria-label="Collapse Scene Outliner"
            className="p-1.5 rounded-lg text-zinc-400 dark:text-[#b4ada3] hover:text-zinc-700 dark:hover:text-[#f5f0e8] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] transition-colors cursor-pointer shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Active Multi-Selection Bar */}
      {selectedObjectIds.length > 0 && (
        <div className="px-3 py-1.5 bg-orange-50 dark:bg-[#ff7417]/10 flex items-center justify-between border-b border-orange-100 dark:border-[#ff7417]/20 text-[11px]">
          <span className="font-semibold text-orange-800 dark:text-[#ff7417]">
            {selectedObjectIds.length} element{selectedObjectIds.length > 1 ? "s" : ""} selected
          </span>
          {onClearSelection && (
            <button
              type="button"
              onClick={onClearSelection}
              className="text-orange-600 dark:text-[#ff7417] hover:underline font-semibold cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Hierarchy Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {categories.map(({ key, label, icon: Icon, items }) => {
          const isCategoryVisible = categoryVisibility ? categoryVisibility[`${key}Visible`] !== false : true;
          const filteredItems = items.filter((item) =>
            (item.name || item.id).toLowerCase().includes(searchQuery.toLowerCase())
          );

          if (searchQuery && filteredItems.length === 0) return null;

          return (
            <div key={key} className="rounded-xl border border-zinc-200/80 dark:border-[#39342f] bg-white dark:bg-[#211f1d] overflow-hidden shadow-2xs">
              {/* Category Header */}
              <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#fbf9f5] dark:bg-[#24211f] border-b border-zinc-100 dark:border-[#39342f]">
                <button
                  onClick={() => toggleCategory(key)}
                  className="flex items-center gap-1.5 font-medium text-zinc-800 dark:text-[#f5f0e8] hover:text-orange-600 dark:hover:text-[#ff7417] transition-colors"
                >
                  {expandedCategories[key] ? (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400 dark:text-[#b4ada3]" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400 dark:text-[#b4ada3]" />
                  )}
                  <Icon className="w-3.5 h-3.5 text-zinc-500 dark:text-[#b4ada3]" />
                  <span>{label}</span>
                  <span className="text-[10px] text-zinc-400 dark:text-[#b4ada3] font-mono">({items.length})</span>
                </button>

                <button
                  onClick={() => onToggleCategoryVisibility(key)}
                  title={isCategoryVisible ? `Hide all ${label}` : `Show all ${label}`}
                  className="p-1 text-zinc-400 dark:text-[#b4ada3] hover:text-zinc-700 dark:hover:text-[#f5f0e8] rounded transition-colors"
                >
                  {isCategoryVisible ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-zinc-300 dark:text-[#524d46]" />
                  )}
                </button>
              </div>

              {/* Items List */}
              {expandedCategories[key] && (
                <div className="divide-y divide-zinc-50 dark:divide-[#2b2a27]">
                  {filteredItems.length === 0 ? (
                    <div className="p-2 text-center text-zinc-400 dark:text-[#b4ada3] text-[11px]">
                      No elements in this category
                    </div>
                  ) : (
                    filteredItems.map((item) => {
                      const isMulti = selectedObjectIds.includes(item.id);
                      const isPrimary = selectedObjectId === item.id;
                      const isSelected = isPrimary || isMulti;
                      const isVisible = item.visible !== false;

                      return (
                        <div
                          key={item.id}
                          className={`flex items-center justify-between px-3 py-1.5 transition-colors cursor-pointer ${
                            isPrimary
                              ? "bg-orange-100/90 dark:bg-[#ff7417]/25 text-orange-950 dark:text-[#f5f0e8] font-semibold border-l-2 border-orange-500"
                              : isSelected
                              ? "bg-orange-50 dark:bg-[#ff7417]/15 text-orange-900 dark:text-[#ff7417] font-medium border-l-2 border-orange-400"
                              : "hover:bg-zinc-50 dark:hover:bg-[#2b2a27]/60 text-zinc-600 dark:text-[#e6e2de]"
                          }`}
                          onClick={(e) => {
                            const isModifierDown = Boolean(e.ctrlKey || e.metaKey);
                            onSelectObject(
                              {
                                id: item.id,
                                name: item.name || item.id,
                                type: item.type || (key === "rooms" ? "floor" : key.slice(0, -1)),
                              },
                              isModifierDown
                            );
                          }}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10 dark:border-white/10"
                              style={{ backgroundColor: item.color || "#cccccc" }}
                            />
                            <span className="truncate">{item.name || item.id}</span>
                            {item.isNew && (
                              <span className="text-[9px] px-1 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded font-medium">
                                NEW
                              </span>
                            )}
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleVisibility(item.id);
                            }}
                            className="p-0.5 text-zinc-400 dark:text-[#b4ada3] hover:text-zinc-700 dark:hover:text-[#f5f0e8]"
                          >
                            {isVisible ? (
                              <Eye className="w-3 h-3" />
                            ) : (
                              <EyeOff className="w-3 h-3 text-red-400 dark:text-red-400/80" />
                            )}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SceneHierarchyPanel;
