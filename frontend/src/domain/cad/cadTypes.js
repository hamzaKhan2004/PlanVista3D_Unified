// Domain types and default constants for CAD elements

export const CAD_ELEMENT_TYPES = {
  WALL: "wall",
  DOOR: "door",
  WINDOW: "window",
  ROOM: "room",
  SLAB: "slab",
  FURNITURE: "furniture",
  CUSTOM: "custom",
};

export const ARCHITECTURAL_SWATCHES = [
  { name: "Warm Off-White", hex: "#f4f1ea" },
  { name: "Alabaster Plaster", hex: "#e5ded3" },
  { name: "Slate Concrete", hex: "#8c929d" },
  { name: "Charcoal Modern", hex: "#2f3338" },
  { name: "Natural Oak", hex: "#b58d5f" },
  { name: "Rich Walnut", hex: "#634328" },
  { name: "Terracotta Brick", hex: "#b85d3f" },
  { name: "Architectural Bronze", hex: "#4a3c31" },
  { name: "Glass Azure", hex: "#87ceeb" },
  { name: "Sage Tint", hex: "#a3b19b" },
];

export const DEFAULT_DIMENSIONS = {
  [CAD_ELEMENT_TYPES.WALL]: { width: 3.0, height: 2.8, depth: 0.2 },
  [CAD_ELEMENT_TYPES.DOOR]: { width: 0.9, height: 2.1, depth: 0.15 },
  [CAD_ELEMENT_TYPES.WINDOW]: { width: 1.2, height: 1.2, depth: 0.15 },
  [CAD_ELEMENT_TYPES.SLAB]: { width: 5.0, height: 0.2, depth: 5.0 },
  [CAD_ELEMENT_TYPES.FURNITURE]: { width: 1.5, height: 0.8, depth: 0.8 },
  [CAD_ELEMENT_TYPES.CUSTOM]: { width: 1.0, height: 1.0, depth: 1.0 },
};

export const DEFAULT_MATERIAL_PROPERTIES = {
  roughness: 0.7,
  metalness: 0.1,
  opacity: 1.0,
  wireframe: false,
};

export const CAMERA_PRESETS = {
  PERSPECTIVE: "perspective",
  TOP: "top",
  FRONT: "front",
  SIDE: "side",
};

export const TRANSFORM_MODES = {
  SELECT: "select",
  TRANSLATE: "translate",
  ROTATE: "rotate",
  SCALE: "scale",
};
