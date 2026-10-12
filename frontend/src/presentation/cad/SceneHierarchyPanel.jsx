import React, { useState } from "react";
import {
  Layers,
  ChevronDown,
  ChevronRight,
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
  onSelectObject,
  onToggleVisibility,
  onToggleCategoryVisibility,
  categoryVisibility,
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

  const categories = [
    {
      key: "walls",
      label: "Walls",
      icon: Square,
      items: dynamicObjects?.walls || [],
    },
    {
      key: "doors",
      label: "Doors",
      icon: DoorClosed,
      items: dynamicObjects?.doors || [],
    },
    {
      key: "windows",
      label: "Windows",
      icon: AppWindow,
      items: dynamicObjects?.windows || [],
    },
    {
      key: "rooms",
      label: "Rooms & Floors",
      icon: Layers,
      items: dynamicObjects?.rooms || [],
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#fdfbf7] text-xs text-zinc-700 divide-y divide-[#eae4dc]">
      {/* Search Header */}
      <div className="p-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search scene elements..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 bg-white text-xs placeholder:text-zinc-400 focus:outline-orange-500"
          />
        </div>
      </div>

      {/* Hierarchy Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {categories.map(({ key, label, icon: Icon, items }) => {
          const isCategoryVisible = categoryVisibility ? categoryVisibility[`${key}Visible`] !== false : true;
          const filteredItems = items.filter((item) =>
            (item.name || item.id).toLowerCase().includes(searchQuery.toLowerCase())
          );

          if (searchQuery && filteredItems.length === 0) return null;

          return (
            <div key={key} className="rounded-xl border border-zinc-200/80 bg-white overflow-hidden shadow-2xs">
              {/* Category Header */}
              <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#fbf9f5] border-b border-zinc-100">
                <button
                  onClick={() => toggleCategory(key)}
                  className="flex items-center gap-1.5 font-medium text-zinc-800 hover:text-orange-600 transition-colors"
                >
                  {expandedCategories[key] ? (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                  )}
                  <Icon className="w-3.5 h-3.5 text-zinc-500" />
                  <span>{label}</span>
                  <span className="text-[10px] text-zinc-400">({items.length})</span>
                </button>

                <button
                  onClick={() => onToggleCategoryVisibility(key)}
                  title={isCategoryVisible ? `Hide all ${label}` : `Show all ${label}`}
                  className="p-1 text-zinc-400 hover:text-zinc-700 rounded transition-colors"
                >
                  {isCategoryVisible ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-zinc-300" />
                  )}
                </button>
              </div>

              {/* Items List */}
              {expandedCategories[key] && (
                <div className="divide-y divide-zinc-50">
                  {filteredItems.length === 0 ? (
                    <div className="p-2 text-center text-zinc-400 text-[11px]">
                      No elements in this category
                    </div>
                  ) : (
                    filteredItems.map((item) => {
                      const isSelected = selectedObjectId === item.id;
                      const isVisible = item.visible !== false;

                      return (
                        <div
                          key={item.id}
                          className={`flex items-center justify-between px-3 py-1.5 transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-orange-50/80 text-orange-900 font-semibold"
                              : "hover:bg-zinc-50 text-zinc-600"
                          }`}
                          onClick={() =>
                            onSelectObject({
                              id: item.id,
                              name: item.name || item.id,
                              type: key.slice(0, -1),
                            })
                          }
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10"
                              style={{ backgroundColor: item.color || "#cccccc" }}
                            />
                            <span className="truncate">{item.name || item.id}</span>
                            {item.isNew && (
                              <span className="text-[9px] px-1 bg-emerald-100 text-emerald-800 rounded font-medium">
                                NEW
                              </span>
                            )}
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleVisibility(item.id);
                            }}
                            className="p-0.5 text-zinc-400 hover:text-zinc-700"
                          >
                            {isVisible ? (
                              <Eye className="w-3 h-3" />
                            ) : (
                              <EyeOff className="w-3 h-3 text-red-400" />
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
