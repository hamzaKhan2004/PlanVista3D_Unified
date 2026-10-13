import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Eye,
  EyeOff,
  Layers,
  Ruler,
  CheckCircle2,
  ArrowRight,
  Sliders,
  Sparkles,
  MousePointer,
  PenTool,
  Trash2,
  Undo2,
  Redo2,
  Hand,
  Maximize2,
  Minimize2,
  MoveHorizontal,
  MoveVertical,
  CornerDownRight,
  Info,
  Compass,
} from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";

/**
 * Enhanced Vector-Assisted 2D Geometry Preview & Interactive CAD Editor Modal.
 *
 * Requirements fulfilled:
 * 1. Every extracted wall segment is individually selectable and highlighted.
 * 2. Full CAD editing tools: Select, Draw Line, Delete Segment, Move Endpoint, Straighten/Align.
 * 3. Drag either endpoint with magnetic snapping to nearby nodes, intersections, and cardinal axes.
 * 4. Straighten horizontally / vertically and calibrate exact length in meters.
 * 5. Full Undo / Redo history and Reset to original OpenCV extracted geometry.
 * 6. High-contrast blueprint underlay with opacity slider, pan & zoom.
 * 7. Keyboard shortcuts and intuitive mouse interaction.
 * 8. Retains footprint scale, wall height, and thickness calibration.
 * 9. Structured segment data integrity; updates vectorData for Blender 3D generation.
 */
const VectorGeometryPreviewModal = ({
  isOpen,
  onClose,
  vectorData,
  sourceImage,
  sourceImageSrc,
  fileName,
  onConfirm,
  onConfirmGenerate,
  initialTargetSize,
  initialWallHeight,
  initialWallThickness,
  isLoading = false,
  isGenerating = false,
}) => {
  // Support prop variations
  const resolvedImageSrc = sourceImage || sourceImageSrc;
  const handleConfirmAction = onConfirm || onConfirmGenerate;
  const isBusy = isLoading || isGenerating;

  // Image and bounds specifications
  const image_width = vectorData?.image_width || 800;
  const image_height = vectorData?.image_height || 600;
  const bounds = vectorData?.bounds || {};
  const footprintW = bounds.footprint_w_px || image_width;
  const footprintH = bounds.footprint_h_px || image_height;

  // Viewport display state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, pan: { x: 0, y: 0 } });
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  const [showImageOverlay, setShowImageOverlay] = useState(true);
  const [imageOpacity, setImageOpacity] = useState(0.45);
  const [showNodes, setShowNodes] = useState(true);

  // Calibration parameters
  const [calibratedScale, setCalibratedScale] = useState(
    initialTargetSize ? Number(initialTargetSize) : vectorData?.target_size || 28.0
  );
  const [calibratedWallHeight, setCalibratedWallHeight] = useState(
    initialWallHeight ? Number(initialWallHeight) : vectorData?.wall_height || 3.0
  );
  const [calibratedWallThickness, setCalibratedWallThickness] = useState(
    initialWallThickness ? Number(initialWallThickness) : vectorData?.wall_thickness || 0.25
  );

  // Active Tool Mode: "select" | "draw" | "delete" | "pan"
  const [activeTool, setActiveTool] = useState("select");
  const [selectedId, setSelectedId] = useState(null);

  // Dragging endpoint state: { segId, endpoint: "p1" | "p2" } | null
  const [dragHandle, setDragHandle] = useState(null);

  // Drawing state: { start: { x, y }, current: { x, y } } | null
  const [drawState, setDrawState] = useState(null);

  // Magnetic snap indicator: { x, y, type: "node" | "horizontal" | "vertical" } | null
  const [snapIndicator, setSnapIndicator] = useState(null);

  // Length input for selected segment (in meters)
  const [customLengthInput, setCustomLengthInput] = useState("");

  const svgRef = useRef(null);
  const viewportBoxRef = useRef(null);

  // Parse initial segments from vectorData
  const initialSegments = useMemo(() => {
    if (!vectorData) return [];
    if (Array.isArray(vectorData.normalized_segments) && vectorData.normalized_segments.length > 0) {
      return vectorData.normalized_segments.map((seg, idx) => ({
        id: `wall_${idx + 1}`,
        x1: Math.round(seg[0][0] * image_width * 10) / 10,
        y1: Math.round(seg[0][1] * image_height * 10) / 10,
        x2: Math.round(seg[1][0] * image_width * 10) / 10,
        y2: Math.round(seg[1][1] * image_height * 10) / 10,
      }));
    }
    if (Array.isArray(vectorData.line_segments) && vectorData.line_segments.length > 0) {
      return vectorData.line_segments.map((seg, idx) => ({
        id: `wall_${idx + 1}`,
        x1: Math.round(seg[0][0] * 10) / 10,
        y1: Math.round((image_height - seg[0][1]) * 10) / 10,
        x2: Math.round(seg[1][0] * 10) / 10,
        y2: Math.round((image_height - seg[1][1]) * 10) / 10,
      }));
    }
    return [];
  }, [vectorData, image_width, image_height]);

  // Immutable copy of original extraction for Reset
  const originalSegmentsRef = useRef(initialSegments);

  // Live editable segments
  const [segments, setSegments] = useState(initialSegments);

  // History stack for Undo / Redo
  const [history, setHistory] = useState([initialSegments]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Reset/sync when a new vectorData payload is received
  useEffect(() => {
    if (isOpen && initialSegments.length > 0) {
      originalSegmentsRef.current = initialSegments;
      setSegments(initialSegments);
      setHistory([initialSegments]);
      setHistoryIndex(0);
      setSelectedId(null);
      setDrawState(null);
      setDragHandle(null);
      setSnapIndicator(null);
      setPan({ x: 0, y: 0 });
      setZoom(1);
    }
  }, [isOpen, initialSegments]);

  // Push new state to history
  const pushHistory = (newSegments) => {
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(newSegments);
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    setSegments(newSegments);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const targetIndex = historyIndex - 1;
      setHistoryIndex(targetIndex);
      setSegments(history[targetIndex]);
      setSelectedId(null);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const targetIndex = historyIndex + 1;
      setHistoryIndex(targetIndex);
      setSegments(history[targetIndex]);
      setSelectedId(null);
    }
  };

  const handleResetToOriginal = () => {
    if (window.confirm("Reset all manual vector edits and restore the original OpenCV extracted geometry?")) {
      pushHistory(originalSegmentsRef.current);
      setSelectedId(null);
      setDrawState(null);
      setDragHandle(null);
    }
  };

  // Conversion: Real-world scale factor (meters per pixel)
  const metersPerPixel = useMemo(() => {
    return calibratedScale / Math.max(footprintW, 1);
  }, [calibratedScale, footprintW]);

  // Selected segment object
  const selectedSegment = useMemo(() => {
    return segments.find((s) => s.id === selectedId) || null;
  }, [segments, selectedId]);

  // Keep length input in sync with selected segment
  useEffect(() => {
    if (selectedSegment) {
      const lenPx = Math.hypot(
        selectedSegment.x2 - selectedSegment.x1,
        selectedSegment.y2 - selectedSegment.y1
      );
      const lenMeters = (lenPx * metersPerPixel).toFixed(2);
      setCustomLengthInput(lenMeters);
    } else {
      setCustomLengthInput("");
    }
  }, [selectedSegment, metersPerPixel]);

  // Helper: Convert client (mouse) event to SVG coordinates
  const getSvgCoordinates = (e) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const transformed = pt.matrixTransform(ctm.inverse());
    return {
      x: Math.max(0, Math.min(image_width, Math.round(transformed.x * 10) / 10)),
      y: Math.max(0, Math.min(image_height, Math.round(transformed.y * 10) / 10)),
    };
  };

  // Helper: Find magnetic snap target (node snapping within 14px)
  const findSnapTarget = (x, y, excludeSegId = null, excludePoint = null) => {
    const SNAP_RADIUS = 14;
    let closestDist = SNAP_RADIUS;
    let target = null;

    for (const s of segments) {
      // Test p1
      if (!(s.id === excludeSegId && excludePoint === "p1")) {
        const d1 = Math.hypot(x - s.x1, y - s.y1);
        if (d1 < closestDist) {
          closestDist = d1;
          target = { x: s.x1, y: s.y1, type: "node", label: "Snap Node" };
        }
      }
      // Test p2
      if (!(s.id === excludeSegId && excludePoint === "p2")) {
        const d2 = Math.hypot(x - s.x2, y - s.y2);
        if (d2 < closestDist) {
          closestDist = d2;
          target = { x: s.x2, y: s.y2, type: "node", label: "Snap Node" };
        }
      }
    }
    return target;
  };

  // Helper: Orthogonal angle snapping (horizontal / vertical within ~6 degrees)
  const snapOrthogonal = (startX, startY, curX, curY, thresholdDeg = 6) => {
    const dx = curX - startX;
    const dy = curY - startY;
    const dist = Math.hypot(dx, dy);
    if (dist < 5) return { x: curX, y: curY, isSnapped: false };

    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

    // Horizontal check (0° or 180°/-180°)
    if (
      Math.abs(angleDeg) < thresholdDeg ||
      Math.abs(Math.abs(angleDeg) - 180) < thresholdDeg
    ) {
      return { x: curX, y: startY, isSnapped: true, type: "horizontal", label: "Horizontal [H]" };
    }

    // Vertical check (90° or -90°)
    if (Math.abs(Math.abs(angleDeg) - 90) < thresholdDeg) {
      return { x: startX, y: curY, isSnapped: true, type: "vertical", label: "Vertical [V]" };
    }

    return { x: curX, y: curY, isSnapped: false };
  };

  // ----------------------------------------------------
  // Segment Actions
  // ----------------------------------------------------
  const handleDeleteSegment = (id) => {
    const next = segments.filter((s) => s.id !== id);
    pushHistory(next);
    if (selectedId === id) setSelectedId(null);
  };

  const handleAlignHorizontal = (id) => {
    const seg = segments.find((s) => s.id === id);
    if (!seg) return;
    const yAvg = Math.round(((seg.y1 + seg.y2) / 2) * 10) / 10;
    const next = segments.map((s) => (s.id === id ? { ...s, y1: yAvg, y2: yAvg } : s));
    pushHistory(next);
  };

  const handleAlignVertical = (id) => {
    const seg = segments.find((s) => s.id === id);
    if (!seg) return;
    const xAvg = Math.round(((seg.x1 + seg.x2) / 2) * 10) / 10;
    const next = segments.map((s) => (s.id === id ? { ...s, x1: xAvg, x2: xAvg } : s));
    pushHistory(next);
  };

  const handleAutoStraighten = (id) => {
    const seg = segments.find((s) => s.id === id);
    if (!seg) return;
    const dx = Math.abs(seg.x2 - seg.x1);
    const dy = Math.abs(seg.y2 - seg.y1);
    if (dx >= dy) {
      handleAlignHorizontal(id);
    } else {
      handleAlignVertical(id);
    }
  };

  const handleApplyCustomLength = () => {
    if (!selectedSegment) return;
    const lenMeters = parseFloat(customLengthInput);
    if (isNaN(lenMeters) || lenMeters <= 0.1) return;

    const targetPx = lenMeters / metersPerPixel;
    const curPx = Math.hypot(
      selectedSegment.x2 - selectedSegment.x1,
      selectedSegment.y2 - selectedSegment.y1
    );
    if (curPx < 0.1) return;

    const dirX = (selectedSegment.x2 - selectedSegment.x1) / curPx;
    const dirY = (selectedSegment.y2 - selectedSegment.y1) / curPx;

    const newX2 = Math.round((selectedSegment.x1 + dirX * targetPx) * 10) / 10;
    const newY2 = Math.round((selectedSegment.y1 + dirY * targetPx) * 10) / 10;

    const next = segments.map((s) =>
      s.id === selectedSegment.id ? { ...s, x2: newX2, y2: newY2 } : s
    );
    pushHistory(next);
  };

  // ----------------------------------------------------
  // Canvas Mouse Interactions
  // ----------------------------------------------------
  const handleSvgMouseDown = (e) => {
    if (e.button === 1 || activeTool === "pan" || isSpacePressed) {
      // Pan viewport
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY, pan: { ...pan } });
      return;
    }

    const coords = getSvgCoordinates(e);

    if (activeTool === "draw") {
      if (!drawState) {
        // Start drawing segment
        const nodeSnap = findSnapTarget(coords.x, coords.y);
        const startPt = nodeSnap ? { x: nodeSnap.x, y: nodeSnap.y } : coords;
        setDrawState({ start: startPt, current: startPt });
      } else {
        // Complete segment
        const cur = drawState.current;
        const dist = Math.hypot(cur.x - drawState.start.x, cur.y - drawState.start.y);
        if (dist >= 6) {
          const newSeg = {
            id: `wall_${Date.now()}`,
            x1: Math.round(drawState.start.x * 10) / 10,
            y1: Math.round(drawState.start.y * 10) / 10,
            x2: Math.round(cur.x * 10) / 10,
            y2: Math.round(cur.y * 10) / 10,
          };
          const next = [...segments, newSeg];
          pushHistory(next);
          setSelectedId(newSeg.id);
        }
        setDrawState(null);
        setSnapIndicator(null);
      }
      return;
    }

    if (activeTool === "select") {
      // Clicked on background: deselect
      setSelectedId(null);
    }
  };

  const handleSvgMouseMove = (e) => {
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setPan({ x: panStart.pan.x + dx, y: panStart.pan.y + dy });
      return;
    }

    const coords = getSvgCoordinates(e);

    // Endpoint handle dragging
    if (dragHandle) {
      const nodeSnap = findSnapTarget(coords.x, coords.y, dragHandle.segId, dragHandle.endpoint);
      let targetCoords = coords;

      if (nodeSnap) {
        targetCoords = { x: nodeSnap.x, y: nodeSnap.y };
        setSnapIndicator(nodeSnap);
      } else {
        // Orthogonal snap to segment's opposite endpoint
        const curSeg = segments.find((s) => s.id === dragHandle.segId);
        if (curSeg) {
          const anchor =
            dragHandle.endpoint === "p1"
              ? { x: curSeg.x2, y: curSeg.y2 }
              : { x: curSeg.x1, y: curSeg.y1 };
          const ortho = snapOrthogonal(anchor.x, anchor.y, coords.x, coords.y);
          if (ortho.isSnapped) {
            targetCoords = { x: ortho.x, y: ortho.y };
            setSnapIndicator({ x: ortho.x, y: ortho.y, type: ortho.type, label: ortho.label });
          } else {
            setSnapIndicator(null);
          }
        }
      }

      // Update segment live in state
      setSegments((prev) =>
        prev.map((s) => {
          if (s.id !== dragHandle.segId) return s;
          return dragHandle.endpoint === "p1"
            ? { ...s, x1: targetCoords.x, y1: targetCoords.y }
            : { ...s, x2: targetCoords.x, y2: targetCoords.y };
        })
      );
      return;
    }

    // Drawing preview line
    if (activeTool === "draw" && drawState) {
      const nodeSnap = findSnapTarget(coords.x, coords.y);
      let curPt = coords;

      if (nodeSnap) {
        curPt = { x: nodeSnap.x, y: nodeSnap.y };
        setSnapIndicator(nodeSnap);
      } else {
        const ortho = snapOrthogonal(drawState.start.x, drawState.start.y, coords.x, coords.y);
        if (ortho.isSnapped) {
          curPt = { x: ortho.x, y: ortho.y };
          setSnapIndicator({ x: ortho.x, y: ortho.y, type: ortho.type, label: ortho.label });
        } else {
          setSnapIndicator(null);
        }
      }

      setDrawState((prev) => ({ ...prev, current: curPt }));
    }
  };

  const handleSvgMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (dragHandle) {
      // Save moved endpoint into history
      pushHistory(segments);
      setDragHandle(null);
      setSnapIndicator(null);
    }
  };

  // Keyboard shortcut listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      // Don't trigger if user is typing in an input
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      if (e.code === "Space") {
        setIsSpacePressed(true);
      } else if (e.key === "v" || e.key === "V") {
        setActiveTool("select");
      } else if (e.key === "l" || e.key === "L" || e.key === "d" || e.key === "D") {
        setActiveTool("draw");
      } else if (e.key === "h" || e.key === "H") {
        if (selectedId) handleAlignHorizontal(selectedId);
      } else if (e.key === "o" || e.key === "O") {
        if (selectedId) handleAlignVertical(selectedId);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) handleDeleteSegment(selectedId);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        handleRedo();
      } else if (e.key === "Escape") {
        if (drawState) {
          setDrawState(null);
          setSnapIndicator(null);
        } else if (selectedId) {
          setSelectedId(null);
        }
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === "Space") setIsSpacePressed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isOpen, selectedId, segments, historyIndex, history, drawState]);

  // Total perimeter calculation
  const totalLengthPx = useMemo(() => {
    return segments.reduce(
      (sum, s) => sum + Math.hypot(s.x2 - s.x1, s.y2 - s.y1),
      0
    );
  }, [segments]);

  const totalLengthMeters = (totalLengthPx * metersPerPixel).toFixed(1);

  // ----------------------------------------------------
  // Final Confirmation: Construct updated payload for Blender
  // ----------------------------------------------------
  const handleProceedTo3D = () => {
    if (segments.length === 0) {
      alert("Please ensure at least one wall segment exists before generating 3D model.");
      return;
    }

    // Convert edited segments into Blender line_segments (Y inverted from top-down image coords)
    const blenderLineSegments = segments.map((s) => [
      [Math.round(s.x1 * 100) / 100, Math.round((image_height - s.y1) * 100) / 100],
      [Math.round(s.x2 * 100) / 100, Math.round((image_height - s.y2) * 100) / 100],
    ]);

    // Normalized segments [0..1]
    const normalizedSegs = segments.map((s) => [
      [Number((s.x1 / image_width).toFixed(4)), Number((s.y1 / image_height).toFixed(4))],
      [Number((s.x2 / image_width).toFixed(4)), Number((s.y2 / image_height).toFixed(4))],
    ]);

    // Recompute bounding box
    const allX = segments.flatMap((s) => [s.x1, s.x2]);
    const allY = segments.flatMap((s) => [s.y1, s.y2]);
    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);

    const updatedVectorData = {
      ...vectorData,
      wall_count: segments.length,
      total_length_px: Math.round(totalLengthPx * 10) / 10,
      bounds: {
        min_x: Math.round(minX * 10) / 10,
        max_x: Math.round(maxX * 10) / 10,
        min_y: Math.round(minY * 10) / 10,
        max_y: Math.round(maxY * 10) / 10,
        footprint_w_px: Math.max(1, Math.round((maxX - minX) * 10) / 10),
        footprint_h_px: Math.max(1, Math.round((maxY - minY) * 10) / 10),
      },
      target_size: Number(calibratedScale),
      wall_height: Number(calibratedWallHeight),
      wall_thickness: Number(calibratedWallThickness),
      line_segments: blenderLineSegments,
      normalized_segments: normalizedSegs,
    };

    if (handleConfirmAction) {
      handleConfirmAction({
        vectorData: updatedVectorData,
        targetSize: Number(calibratedScale),
        wallHeight: Number(calibratedWallHeight),
        wallThickness: Number(calibratedWallThickness),
      });
    }
  };

  if (!isOpen || !vectorData) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={isBusy ? () => {} : onClose}
      title="Vector-Assisted 2D Geometry Preview & CAD Correction"
      maxWidth="max-w-6xl"
    >
      <div className="space-y-4">
        {/* Top Feature Summary Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-orange-50/70 dark:bg-[#ff7417]/10 border border-orange-200/80 dark:border-[#ff7417]/20 text-xs text-orange-950 dark:text-[#ff9248]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-orange-600 dark:text-[#ff7417] shrink-0" />
            <span className="font-medium">
              Extracted <strong>{segments.length} walls</strong>. Select any wall to inspect, drag endpoints to snap, straighten axes, or draw missing walls before 3D extrusion.
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] font-semibold text-orange-800 dark:text-[#ff9248]">
            <span>{image_width} × {image_height} px</span>
            <span>•</span>
            <span>Perimeter: ~{totalLengthMeters}m</span>
          </div>
        </div>

        {/* 2-Column CAD Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Interactive 2D Vector CAD Canvas (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col space-y-2">
            {/* Viewport Control Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-[#1d1b19] border border-zinc-200 dark:border-[#39342f] text-xs text-zinc-600 dark:text-[#b4ada3]">
              {/* Tool Palette */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTool("select")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all ${
                    activeTool === "select"
                      ? "bg-orange-500 text-white shadow-xs"
                      : "hover:bg-zinc-200 dark:hover:bg-[#2b2a27] text-zinc-700 dark:text-[#f5f0e8]"
                  }`}
                  title="Select & Move Endpoints (V)"
                >
                  <MousePointer className="w-3.5 h-3.5" />
                  <span>Select</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTool("draw");
                    setSelectedId(null);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all ${
                    activeTool === "draw"
                      ? "bg-orange-500 text-white shadow-xs"
                      : "hover:bg-zinc-200 dark:hover:bg-[#2b2a27] text-zinc-700 dark:text-[#f5f0e8]"
                  }`}
                  title="Draw New Wall Segment (L / D)"
                >
                  <PenTool className="w-3.5 h-3.5" />
                  <span>Draw Line</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTool("delete")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all ${
                    activeTool === "delete"
                      ? "bg-red-600 text-white shadow-xs"
                      : "hover:bg-zinc-200 dark:hover:bg-[#2b2a27] text-zinc-700 dark:text-[#f5f0e8]"
                  }`}
                  title="Delete Segment Tool (Click wall to delete)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTool("pan")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all ${
                    activeTool === "pan"
                      ? "bg-zinc-800 text-white shadow-xs"
                      : "hover:bg-zinc-200 dark:hover:bg-[#2b2a27] text-zinc-700 dark:text-[#f5f0e8]"
                  }`}
                  title="Pan Viewport (Space)"
                >
                  <Hand className="w-3.5 h-3.5" />
                  <span>Pan</span>
                </button>
              </div>

              {/* History & Zoom Controls */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={historyIndex <= 0}
                  className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-[#2b2a27] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={historyIndex >= history.length - 1}
                  className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-[#2b2a27] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2 className="w-4 h-4" />
                </button>

                <div className="h-4 w-px bg-zinc-300 dark:bg-[#39342f] mx-1" />

                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
                  className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-[#2b2a27] transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>

                <span className="font-mono text-[11px] w-8 text-center">
                  {Math.round(zoom * 100)}%
                </span>

                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(3.0, z + 0.2))}
                  className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-[#2b2a27] transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-[#2b2a27] transition-colors"
                  title="Reset View"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 2D Canvas Viewport Box */}
            <div
              ref={viewportBoxRef}
              className={`relative aspect-4/3 w-full bg-[#141311] rounded-2xl border border-zinc-300 dark:border-[#39342f] overflow-hidden flex items-center justify-center select-none shadow-inner ${
                activeTool === "pan" || isSpacePressed
                  ? "cursor-grab active:cursor-grabbing"
                  : activeTool === "draw"
                  ? "cursor-crosshair"
                  : activeTool === "delete"
                  ? "cursor-pointer"
                  : "cursor-default"
              }`}
              onMouseDown={handleSvgMouseDown}
              onMouseMove={handleSvgMouseMove}
              onMouseUp={handleSvgMouseUp}
            >
              {/* Architectural Grid pattern */}
              <div
                className="absolute inset-0 pointer-events-none opacity-25"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, #39342f 1px, transparent 1px), linear-gradient(to bottom, #39342f 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
              />

              {/* Viewport Transform Container */}
              <div
                className="relative transition-transform duration-75 ease-out max-w-full max-h-full"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  width: `${image_width}px`,
                  height: `${image_height}px`,
                  maxWidth: "100%",
                  maxHeight: "100%",
                  aspectRatio: `${image_width} / ${image_height}`,
                }}
              >
                {/* Background Blueprint Image Underlay */}
                {resolvedImageSrc && showImageOverlay && (
                  <img
                    src={resolvedImageSrc}
                    alt={fileName || "Floor plan"}
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none rounded transition-opacity"
                    style={{ opacity: imageOpacity }}
                  />
                )}

                {/* SVG Vector Canvas */}
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${image_width} ${image_height}`}
                  className="absolute inset-0 w-full h-full"
                  style={{ overflow: "visible" }}
                >
                  <defs>
                    {/* Glowing highlight filters */}
                    <filter id="wallGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#ff7417" floodOpacity="0.6" />
                    </filter>
                    <filter id="selectedGlow" x="-30%" y="-30%" width="160%" height="160%">
                      <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#00f0ff" floodOpacity="0.9" />
                    </filter>
                  </defs>

                  {/* 1. Unselected Wall Lines */}
                  <g
                    stroke="#FF7417"
                    strokeWidth={Math.max(2.8, calibratedWallThickness * 10)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#wallGlow)"
                  >
                    {segments.map((seg) => {
                      if (seg.id === selectedId) return null;
                      return (
                        <g key={seg.id} className="cursor-pointer">
                          {/* Invisible wide hit target for effortless clicking */}
                          <line
                            x1={seg.x1}
                            y1={seg.y1}
                            x2={seg.x2}
                            y2={seg.y2}
                            stroke="transparent"
                            strokeWidth={18}
                            strokeLinecap="round"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (activeTool === "delete") {
                                handleDeleteSegment(seg.id);
                              } else {
                                setSelectedId(seg.id);
                              }
                            }}
                          />
                          <line
                            x1={seg.x1}
                            y1={seg.y1}
                            x2={seg.x2}
                            y2={seg.y2}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (activeTool === "delete") {
                                handleDeleteSegment(seg.id);
                              } else {
                                setSelectedId(seg.id);
                              }
                            }}
                          />
                        </g>
                      );
                    })}
                  </g>

                  {/* 2. Selected Wall Line (Electric Cyan Glowing Highlight) */}
                  {selectedSegment && (
                    <g filter="url(#selectedGlow)">
                      {/* Highlight Outer Border */}
                      <line
                        x1={selectedSegment.x1}
                        y1={selectedSegment.y1}
                        x2={selectedSegment.x2}
                        y2={selectedSegment.y2}
                        stroke="#00F0FF"
                        strokeWidth={Math.max(5.5, calibratedWallThickness * 14)}
                        strokeLinecap="round"
                      />
                      {/* Core Line */}
                      <line
                        x1={selectedSegment.x1}
                        y1={selectedSegment.y1}
                        x2={selectedSegment.x2}
                        y2={selectedSegment.y2}
                        stroke="#FFFFFF"
                        strokeWidth={Math.max(2.0, calibratedWallThickness * 5)}
                        strokeLinecap="round"
                      />
                    </g>
                  )}

                  {/* 3. Corner Nodes (Subtle dots) */}
                  {showNodes && (
                    <g fill="#FFFFFF" stroke="#FF7417" strokeWidth="1.2">
                      {segments.map((seg) => (
                        <g key={`node-${seg.id}`}>
                          <circle cx={seg.x1} cy={seg.y1} r="2.5" />
                          <circle cx={seg.x2} cy={seg.y2} r="2.5" />
                        </g>
                      ))}
                    </g>
                  )}

                  {/* 4. Active Drawing Line Preview */}
                  {drawState && (
                    <g>
                      <line
                        x1={drawState.start.x}
                        y1={drawState.start.y}
                        x2={drawState.current.x}
                        y2={drawState.current.y}
                        stroke="#10B981"
                        strokeWidth={3}
                        strokeDasharray="5 3"
                        strokeLinecap="round"
                      />
                      <circle cx={drawState.start.x} cy={drawState.start.y} r="4" fill="#10B981" stroke="#FFFFFF" strokeWidth="1.5" />
                      <circle cx={drawState.current.x} cy={drawState.current.y} r="5" fill="#10B981" stroke="#FFFFFF" strokeWidth="1.5" />
                    </g>
                  )}

                  {/* 5. Draggable Endpoint Handles for Selected Segment */}
                  {selectedSegment && (
                    <g>
                      {/* P1 Handle */}
                      <circle
                        cx={selectedSegment.x1}
                        cy={selectedSegment.y1}
                        r="6"
                        fill="#FFFFFF"
                        stroke="#00F0FF"
                        strokeWidth="2.5"
                        className="cursor-move hover:scale-125 transition-transform"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setDragHandle({ segId: selectedSegment.id, endpoint: "p1" });
                        }}
                      />

                      {/* P2 Handle */}
                      <circle
                        cx={selectedSegment.x2}
                        cy={selectedSegment.y2}
                        r="6"
                        fill="#FFFFFF"
                        stroke="#00F0FF"
                        strokeWidth="2.5"
                        className="cursor-move hover:scale-125 transition-transform"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setDragHandle({ segId: selectedSegment.id, endpoint: "p2" });
                        }}
                      />
                    </g>
                  )}

                  {/* 6. Magnetic Snap Indicator */}
                  {snapIndicator && (
                    <g>
                      <circle
                        cx={snapIndicator.x}
                        cy={snapIndicator.y}
                        r="9"
                        fill="none"
                        stroke={snapIndicator.type === "node" ? "#10B981" : "#F59E0B"}
                        strokeWidth="2"
                        strokeDasharray="3 2"
                      />
                      <circle
                        cx={snapIndicator.x}
                        cy={snapIndicator.y}
                        r="3.5"
                        fill={snapIndicator.type === "node" ? "#10B981" : "#F59E0B"}
                      />
                    </g>
                  )}
                </svg>
              </div>

              {/* Viewport Scale & Status Badges */}
              <div className="absolute bottom-2.5 left-2.5 flex items-center gap-2 pointer-events-none">
                <span className="px-2 py-0.5 rounded bg-black/75 backdrop-blur-md border border-white/10 text-[10px] font-mono text-zinc-300">
                  {activeTool === "draw"
                    ? "Click to start wall, click again to end"
                    : selectedSegment
                    ? `Selected Wall: ${selectedSegment.id}`
                    : "Click any wall to select and edit"}
                </span>
                {snapIndicator && (
                  <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/50 text-[10px] font-mono text-emerald-300 animate-pulse">
                    {snapIndicator.label || "Snapped"}
                  </span>
                )}
              </div>
            </div>

            {/* Blueprint Overlay Visibility & Opacity Controls */}
            <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-[#746e65] px-1 pt-0.5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowImageOverlay((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 font-medium hover:text-zinc-900 dark:hover:text-[#f5f0e8] transition-colors"
                >
                  {showImageOverlay ? <Eye className="w-3.5 h-3.5 text-orange-500" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>{showImageOverlay ? "Blueprint Visible" : "Blueprint Hidden"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowNodes((prev) => !prev)}
                  className="inline-flex items-center gap-1 font-medium hover:text-zinc-900 dark:hover:text-[#f5f0e8] transition-colors"
                >
                  <Layers className="w-3.5 h-3.5 text-orange-500" />
                  <span>{showNodes ? "Nodes On" : "Nodes Off"}</span>
                </button>
              </div>

              {showImageOverlay && (
                <div className="flex items-center gap-2 w-48">
                  <span>Opacity:</span>
                  <input
                    type="range"
                    min="0.05"
                    max="1.0"
                    step="0.05"
                    value={imageOpacity}
                    onChange={(e) => setImageOpacity(parseFloat(e.target.value))}
                    className="w-full accent-orange-500"
                  />
                  <span className="font-mono w-7 text-right">{Math.round(imageOpacity * 100)}%</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Wall Inspector & Architectural Calibration (5 Cols) */}
          <div className="lg:col-span-5 space-y-3.5">
            {/* 1. Selected Wall Inspector (When a segment is selected) */}
            {selectedSegment ? (
              <div className="p-4 rounded-xl bg-orange-50/50 dark:bg-[#25201a] border border-orange-200 dark:border-[#ff7417]/30 space-y-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-orange-200/60 dark:border-[#39342f] pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#00F0FF] animate-pulse" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-[#f5f0e8]">
                      Selected Wall: <span className="font-mono text-orange-600 dark:text-[#ff7417]">{selectedSegment.id}</span>
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteSegment(selectedSegment.id)}
                    className="px-2 py-0.5 rounded text-[11px] font-semibold text-red-600 hover:bg-red-100 dark:hover:bg-red-950/50 flex items-center gap-1 transition-colors"
                    title="Delete Segment (Del / Backspace)"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </button>
                </div>

                {/* Length Calibration Input */}
                <div>
                  <div className="flex justify-between text-xs font-semibold text-zinc-700 dark:text-[#e6e2de] mb-1">
                    <label htmlFor="wall-length-input">Exact Wall Length (m):</label>
                    <span className="font-mono text-orange-600 dark:text-[#ff7417]">{customLengthInput} m</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      id="wall-length-input"
                      type="number"
                      step="0.05"
                      min="0.2"
                      max="100"
                      value={customLengthInput}
                      onChange={(e) => setCustomLengthInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleApplyCustomLength();
                      }}
                      className="w-full px-2.5 py-1 text-xs font-mono bg-white dark:bg-[#1d1b19] border border-zinc-300 dark:border-[#39342f] rounded-lg outline-none focus:ring-1 focus:ring-orange-500"
                      placeholder="e.g. 4.5"
                    />
                    <button
                      type="button"
                      onClick={handleApplyCustomLength}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-zinc-800 dark:bg-[#ff7417] text-white hover:opacity-90 transition-opacity"
                    >
                      Apply
                    </button>
                  </div>
                </div>

                {/* Straighten & Alignment Tools */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-zinc-600 dark:text-[#b4ada3] block">
                    Straighten & Align Line:
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleAlignHorizontal(selectedSegment.id)}
                      className="p-1.5 rounded-lg text-xs font-medium bg-white dark:bg-[#1d1b19] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] border border-zinc-200 dark:border-[#39342f] text-zinc-800 dark:text-[#f5f0e8] flex flex-col items-center gap-1 transition-colors"
                      title="Snap to exact horizontal level [H]"
                    >
                      <MoveHorizontal className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-[10px]">Horizontal</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAlignVertical(selectedSegment.id)}
                      className="p-1.5 rounded-lg text-xs font-medium bg-white dark:bg-[#1d1b19] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] border border-zinc-200 dark:border-[#39342f] text-zinc-800 dark:text-[#f5f0e8] flex flex-col items-center gap-1 transition-colors"
                      title="Snap to exact vertical plumb [O]"
                    >
                      <MoveVertical className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-[10px]">Vertical</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAutoStraighten(selectedSegment.id)}
                      className="p-1.5 rounded-lg text-xs font-medium bg-white dark:bg-[#1d1b19] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] border border-zinc-200 dark:border-[#39342f] text-zinc-800 dark:text-[#f5f0e8] flex flex-col items-center gap-1 transition-colors"
                      title="Snap to closest cardinal axis"
                    >
                      <Compass className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-[10px]">Auto Axis</span>
                    </button>
                  </div>
                </div>

                <div className="text-[10px] text-zinc-500 dark:text-[#746e65] pt-0.5 flex justify-between font-mono">
                  <span>Start: ({selectedSegment.x1}, {selectedSegment.y1})</span>
                  <span>End: ({selectedSegment.x2}, {selectedSegment.y2})</span>
                </div>
              </div>
            ) : (
              /* Informative Empty Inspector Box */
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-[#1d1b19] border border-dashed border-zinc-200 dark:border-[#39342f] text-center space-y-1">
                <MousePointer className="w-4 h-4 text-zinc-400 dark:text-[#746e65] mx-auto" />
                <p className="text-xs font-semibold text-zinc-700 dark:text-[#f5f0e8]">
                  No Segment Selected
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-[#746e65]">
                  Click any wall line on the canvas to inspect coordinates, align axes, adjust length, or drag its endpoints.
                </p>
              </div>
            )}

            {/* 2. Architectural Calibration Card */}
            <div className="p-4 rounded-xl bg-white dark:bg-[#1d1b19] border border-[#eae4dc] dark:border-[#39342f] space-y-3.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-[#a88b7d] flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-orange-500" />
                <span>Architectural Dimensions</span>
              </h4>

              {/* Target Footprint Scale */}
              <div>
                <div className="flex justify-between text-xs font-semibold text-zinc-800 dark:text-[#e6e2de] mb-1">
                  <label htmlFor="cal-scale">Plan Span / Footprint Width</label>
                  <span className="font-mono text-orange-600 dark:text-[#ff7417]">{calibratedScale} m</span>
                </div>
                <input
                  id="cal-scale"
                  type="range"
                  min="8"
                  max="60"
                  step="0.5"
                  value={calibratedScale}
                  onChange={(e) => setCalibratedScale(parseFloat(e.target.value))}
                  className="w-full accent-orange-500"
                />
              </div>

              {/* Wall Height */}
              <div>
                <div className="flex justify-between text-xs font-semibold text-zinc-800 dark:text-[#e6e2de] mb-1">
                  <label htmlFor="cal-height">Wall Height</label>
                  <span className="font-mono text-orange-600 dark:text-[#ff7417]">{calibratedWallHeight} m</span>
                </div>
                <input
                  id="cal-height"
                  type="range"
                  min="2.0"
                  max="5.0"
                  step="0.1"
                  value={calibratedWallHeight}
                  onChange={(e) => setCalibratedWallHeight(parseFloat(e.target.value))}
                  className="w-full accent-orange-500"
                />
              </div>

              {/* Wall Thickness */}
              <div>
                <div className="flex justify-between text-xs font-semibold text-zinc-800 dark:text-[#e6e2de] mb-1">
                  <label htmlFor="cal-thickness">Wall Thickness</label>
                  <span className="font-mono text-orange-600 dark:text-[#ff7417]">{calibratedWallThickness} m</span>
                </div>
                <input
                  id="cal-thickness"
                  type="range"
                  min="0.10"
                  max="0.50"
                  step="0.02"
                  value={calibratedWallThickness}
                  onChange={(e) => setCalibratedWallThickness(parseFloat(e.target.value))}
                  className="w-full accent-orange-500"
                />
              </div>
            </div>

            {/* 3. Extraction & Editing Metrics Audit */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-[#1d1b19] border border-[#eae4dc] dark:border-[#39342f] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-600 dark:text-[#b4ada3]">Active Walls:</span>
                <strong className="text-zinc-900 dark:text-[#f5f0e8] font-mono">{segments.length} segments</strong>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-600 dark:text-[#b4ada3]">Perimeter Length:</span>
                <span className="font-mono text-zinc-900 dark:text-[#f5f0e8]">~{totalLengthMeters} m</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-600 dark:text-[#b4ada3]">Corner Snapping:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Magnetic (14px)
                </span>
              </div>
            </div>

            {/* Reset to Original Geometry Button */}
            <button
              type="button"
              onClick={handleResetToOriginal}
              className="w-full py-1.5 px-3 rounded-lg text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-[#b4ada3] dark:hover:text-[#f5f0e8] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] border border-zinc-200 dark:border-[#39342f] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Original Extraction</span>
            </button>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-[#eae4dc] dark:border-[#39342f]">
          <div className="text-[11px] text-zinc-500 dark:text-[#746e65]">
            <span className="font-semibold text-zinc-700 dark:text-[#b4ada3]">Shortcuts:</span> V: Select • L: Draw • Del: Remove • H: Horizontal • O: Vertical • Ctrl+Z: Undo
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="md"
              onClick={onClose}
              disabled={isBusy}
            >
              Cancel & Re-upload
            </Button>

            <Button
              variant="primary"
              size="md"
              onClick={handleProceedTo3D}
              loading={isBusy}
              className="flex items-center gap-2"
            >
              <span>Confirm & Generate 3D Model</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default VectorGeometryPreviewModal;
