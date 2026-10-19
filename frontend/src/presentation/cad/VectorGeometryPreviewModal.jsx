import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
  Spline,
  Scissors,
  Compass,
  CornerDownRight,
  Info,
} from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";

/**
 * Enhanced Vector-Assisted 2D Geometry Preview & CAD Correction Editor.
 *
 * Implements:
 * 1. Zero-lag Pointer Events & requestAnimationFrame dragging for ultra-smooth wall manipulation.
 * 2. Sticky header and footer with independent scrollable canvas & inspector inside viewport max-height.
 * 3. Curve Line tool (Spline) with draggable control handles, quadratic Bezier evaluation, and 3D extrusion.
 * 4. Scissors / Cut Segment tool for creating architectural door/window openings or splitting lines.
 * 5. Accurate real-world wall thickness scaling that visibly reflects on preview and in final 3D GLB.
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

  // Active Tool Mode: "select" | "draw" | "curve" | "scissors" | "delete" | "pan"
  const [activeTool, setActiveTool] = useState("select");
  const [selectedId, setSelectedId] = useState(null);

  // Length input for selected segment (in meters)
  const [customLengthInput, setCustomLengthInput] = useState("");

  // Scissors cutting state: null | { segId, x, y, t }
  const [scissorsState, setScissorsState] = useState(null);
  const [scissorsHover, setScissorsHover] = useState(null);

  // Drawing state for straight or curve line: null | { start: {x,y}, current: {x,y} }
  const [drawState, setDrawState] = useState(null);

  // Transient dragging state for 60fps zero-lag movement:
  // { segId, endpoint: "p1" | "p2" | "control", x, y, snapIndicator } | null
  const [activeDrag, setActiveDrag] = useState(null);

  // Intentional architectural openings metadata
  const [openings, setOpenings] = useState([]);

  const svgRef = useRef(null);
  const viewportBoxRef = useRef(null);
  const rafIdRef = useRef(null);
  const pointerDragInfoRef = useRef(null);

  // Parse initial segments from vectorData
  const initialSegments = useMemo(() => {
    if (!vectorData) return [];
    if (Array.isArray(vectorData.normalized_segments) && vectorData.normalized_segments.length > 0) {
      return vectorData.normalized_segments.map((seg, idx) => ({
        id: `wall_${idx + 1}`,
        type: "straight",
        x1: Math.round(seg[0][0] * image_width * 10) / 10,
        y1: Math.round(seg[0][1] * image_height * 10) / 10,
        x2: Math.round(seg[1][0] * image_width * 10) / 10,
        y2: Math.round(seg[1][1] * image_height * 10) / 10,
      }));
    }
    if (Array.isArray(vectorData.line_segments) && vectorData.line_segments.length > 0) {
      return vectorData.line_segments.map((seg, idx) => ({
        id: `wall_${idx + 1}`,
        type: "straight",
        x1: Math.round(seg[0][0] * 10) / 10,
        y1: Math.round((image_height - seg[0][1]) * 10) / 10,
        x2: Math.round(seg[1][0] * 10) / 10,
        y2: Math.round((image_height - seg[1][1]) * 10) / 10,
      }));
    }
    return [];
  }, [vectorData, image_width, image_height]);

  const originalSegmentsRef = useRef(initialSegments);

  // Live segments state
  const [segments, setSegments] = useState(initialSegments);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

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
      setScissorsState(null);
      setScissorsHover(null);
      setActiveDrag(null);
      setOpenings([]);
      setPan({ x: 0, y: 0 });
      setZoom(1);
    }
  }, [isOpen, initialSegments]);

  // Push new state to history
  const pushHistory = useCallback((newSegments) => {
    setHistory((prev) => {
      const next = prev.slice(0, historyIndex + 1);
      return [...next, newSegments];
    });
    setHistoryIndex((prev) => prev + 1);
    setSegments(newSegments);
  }, [historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const targetIndex = historyIndex - 1;
      setHistoryIndex(targetIndex);
      setSegments(history[targetIndex]);
      setSelectedId(null);
      setScissorsState(null);
    }
  }, [historyIndex, history]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const targetIndex = historyIndex + 1;
      setHistoryIndex(targetIndex);
      setSegments(history[targetIndex]);
      setSelectedId(null);
      setScissorsState(null);
    }
  }, [historyIndex, history]);

  const handleResetToOriginal = useCallback(() => {
    if (window.confirm("Reset all manual vector edits and restore the original OpenCV extracted geometry?")) {
      pushHistory(originalSegmentsRef.current);
      setSelectedId(null);
      setDrawState(null);
      setScissorsState(null);
      setActiveDrag(null);
      setOpenings([]);
    }
  }, [pushHistory]);

  // Conversion: Real-world scale factor (meters per pixel)
  const metersPerPixel = useMemo(() => {
    return calibratedScale / Math.max(footprintW, 1);
  }, [calibratedScale, footprintW]);

  // Visual Wall Stroke Width in SVG units (pixels) directly proportional to calibrated real-world thickness!
  const visualWallThicknessPx = useMemo(() => {
    const pxThickness = calibratedWallThickness / metersPerPixel;
    return Math.max(2.5, Math.min(35.0, pxThickness));
  }, [calibratedWallThickness, metersPerPixel]);

  // Selected segment object
  const selectedSegment = useMemo(() => {
    return segments.find((s) => s.id === selectedId) || null;
  }, [segments, selectedId]);

  // Keep length input in sync with selected segment
  useEffect(() => {
    if (selectedSegment) {
      let lenPx = 0;
      if (selectedSegment.type === "curve") {
        // Approximate quadratic bezier arc length via 10 sub-segments
        let prevX = selectedSegment.x1;
        let prevY = selectedSegment.y1;
        for (let i = 1; i <= 10; i++) {
          const t = i / 10;
          const curX = (1 - t) ** 2 * selectedSegment.x1 + 2 * (1 - t) * t * selectedSegment.cx + t ** 2 * selectedSegment.x2;
          const curY = (1 - t) ** 2 * selectedSegment.y1 + 2 * (1 - t) * t * selectedSegment.cy + t ** 2 * selectedSegment.y2;
          lenPx += Math.hypot(curX - prevX, curY - prevY);
          prevX = curX;
          prevY = curY;
        }
      } else {
        lenPx = Math.hypot(selectedSegment.x2 - selectedSegment.x1, selectedSegment.y2 - selectedSegment.y1);
      }
      const lenMeters = (lenPx * metersPerPixel).toFixed(2);
      setCustomLengthInput(lenMeters);
    } else {
      setCustomLengthInput("");
    }
  }, [selectedSegment, metersPerPixel]);

  // Helper: Convert client (mouse) event to SVG coordinates
  const getSvgCoordinates = useCallback((e) => {
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
  }, [image_width, image_height]);

  // Helper: Find magnetic snap target (node snapping within 14px)
  const findSnapTarget = useCallback((x, y, excludeSegId = null, excludePoint = null) => {
    const SNAP_RADIUS = 14;
    let closestDist = SNAP_RADIUS;
    let target = null;

    for (const s of segmentsRef.current) {
      if (!(s.id === excludeSegId && excludePoint === "p1")) {
        const d1 = Math.hypot(x - s.x1, y - s.y1);
        if (d1 < closestDist) {
          closestDist = d1;
          target = { x: s.x1, y: s.y1, type: "node", label: "Snap Node" };
        }
      }
      if (!(s.id === excludeSegId && excludePoint === "p2")) {
        const d2 = Math.hypot(x - s.x2, y - s.y2);
        if (d2 < closestDist) {
          closestDist = d2;
          target = { x: s.x2, y: s.y2, type: "node", label: "Snap Node" };
        }
      }
    }
    return target;
  }, []);

  // Helper: Orthogonal angle snapping
  const snapOrthogonal = useCallback((startX, startY, curX, curY, thresholdDeg = 6) => {
    const dx = curX - startX;
    const dy = curY - startY;
    const dist = Math.hypot(dx, dy);
    if (dist < 5) return { x: curX, y: curY, isSnapped: false };

    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

    if (Math.abs(angleDeg) < thresholdDeg || Math.abs(Math.abs(angleDeg) - 180) < thresholdDeg) {
      return { x: curX, y: startY, isSnapped: true, type: "horizontal", label: "Horizontal [H]" };
    }
    if (Math.abs(Math.abs(angleDeg) - 90) < thresholdDeg) {
      return { x: startX, y: curY, isSnapped: true, type: "vertical", label: "Vertical [O]" };
    }
    return { x: curX, y: curY, isSnapped: false };
  }, []);

  // Helper: Project point onto line segment for Scissors tool
  const projectPointOnSegment = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-4) return { x: x1, y: y1, t: 0 };
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return {
      x: Math.round((x1 + t * dx) * 10) / 10,
      y: Math.round((y1 + t * dy) * 10) / 10,
      t,
    };
  };

  // Find nearest segment point for Scissors tool
  const findNearestSegment = useCallback((px, py, maxDist = 18) => {
    let best = null;
    let minD = maxDist;
    for (const s of segmentsRef.current) {
      if (s.type === "curve") continue; // straight segments for scissors cutting
      const proj = projectPointOnSegment(px, py, s.x1, s.y1, s.x2, s.y2);
      const d = Math.hypot(px - proj.x, py - proj.y);
      if (d < minD) {
        minD = d;
        best = { seg: s, ...proj, dist: d };
      }
    }
    return best;
  }, []);

  // ----------------------------------------------------
  // Segment Actions
  // ----------------------------------------------------
  const handleDeleteSegment = useCallback((id) => {
    const next = segmentsRef.current.filter((s) => s.id !== id);
    pushHistory(next);
    if (selectedId === id) setSelectedId(null);
  }, [selectedId, pushHistory]);

  const handleAlignHorizontal = useCallback((id) => {
    const seg = segmentsRef.current.find((s) => s.id === id);
    if (!seg) return;
    const yAvg = Math.round(((seg.y1 + seg.y2) / 2) * 10) / 10;
    const next = segmentsRef.current.map((s) =>
      s.id === id ? { ...s, y1: yAvg, y2: yAvg, ...(s.type === "curve" ? { cy: yAvg } : {}) } : s
    );
    pushHistory(next);
  }, [pushHistory]);

  const handleAlignVertical = useCallback((id) => {
    const seg = segmentsRef.current.find((s) => s.id === id);
    if (!seg) return;
    const xAvg = Math.round(((seg.x1 + seg.x2) / 2) * 10) / 10;
    const next = segmentsRef.current.map((s) =>
      s.id === id ? { ...s, x1: xAvg, x2: xAvg, ...(s.type === "curve" ? { cx: xAvg } : {}) } : s
    );
    pushHistory(next);
  }, [pushHistory]);

  const handleAutoStraighten = useCallback((id) => {
    const seg = segmentsRef.current.find((s) => s.id === id);
    if (!seg) return;
    const dx = Math.abs(seg.x2 - seg.x1);
    const dy = Math.abs(seg.y2 - seg.y1);
    if (dx >= dy) {
      handleAlignHorizontal(id);
    } else {
      handleAlignVertical(id);
    }
  }, [handleAlignHorizontal, handleAlignVertical]);

  const handleToggleCurve = useCallback((id) => {
    const seg = segmentsRef.current.find((s) => s.id === id);
    if (!seg) return;
    if (seg.type === "curve") {
      // Flatten back to straight
      const next = segmentsRef.current.map((s) => (s.id === id ? { ...s, type: "straight" } : s));
      pushHistory(next);
    } else {
      // Convert straight segment to curve with midpoint perpendicular offset
      const midX = (seg.x1 + seg.x2) / 2;
      const midY = (seg.y1 + seg.y2) / 2;
      const dx = seg.x2 - seg.x1;
      const dy = seg.y2 - seg.y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const cx = Math.round((midX + nx * 25) * 10) / 10;
      const cy = Math.round((midY + ny * 25) * 10) / 10;

      const next = segmentsRef.current.map((s) =>
        s.id === id ? { ...s, type: "curve", cx, cy } : s
      );
      pushHistory(next);
    }
  }, [pushHistory]);

  const handleApplyCustomLength = useCallback(() => {
    if (!selectedSegment) return;
    const lenMeters = parseFloat(customLengthInput);
    if (isNaN(lenMeters) || lenMeters <= 0.1) return;

    const targetPx = lenMeters / metersPerPixel;
    const curPx = Math.hypot(selectedSegment.x2 - selectedSegment.x1, selectedSegment.y2 - selectedSegment.y1);
    if (curPx < 0.1) return;

    const dirX = (selectedSegment.x2 - selectedSegment.x1) / curPx;
    const dirY = (selectedSegment.y2 - selectedSegment.y1) / curPx;

    const newX2 = Math.round((selectedSegment.x1 + dirX * targetPx) * 10) / 10;
    const newY2 = Math.round((selectedSegment.y1 + dirY * targetPx) * 10) / 10;

    let updated = { ...selectedSegment, x2: newX2, y2: newY2 };
    if (selectedSegment.type === "curve") {
      updated.cx = Math.round(((selectedSegment.x1 + newX2) / 2) * 10) / 10;
      updated.cy = Math.round(((selectedSegment.y1 + newY2) / 2) * 10) / 10;
    }

    const next = segmentsRef.current.map((s) => (s.id === selectedSegment.id ? updated : s));
    pushHistory(next);
  }, [selectedSegment, customLengthInput, metersPerPixel, pushHistory]);

  // Cut opening quick action (e.g. 0.9m door or 1.2m window at segment center)
  const handleCutOpeningPreset = useCallback((openingMeters = 0.9) => {
    if (!selectedSegment || selectedSegment.type === "curve") return;
    const seg = selectedSegment;
    const lengthPx = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
    const openingPx = openingMeters / metersPerPixel;

    if (lengthPx <= openingPx + 10) {
      alert(`Wall is too short (${(lengthPx * metersPerPixel).toFixed(1)}m) to cut a ${openingMeters}m opening.`);
      return;
    }

    const halfOpenPx = openingPx / 2.0;
    const midT = 0.5;
    const halfRatio = halfOpenPx / lengthPx;
    const t1 = Math.max(0.05, midT - halfRatio);
    const t2 = Math.min(0.95, midT + halfRatio);

    const ptA = {
      x: Math.round((seg.x1 + t1 * (seg.x2 - seg.x1)) * 10) / 10,
      y: Math.round((seg.y1 + t1 * (seg.y2 - seg.y1)) * 10) / 10,
    };
    const ptB = {
      x: Math.round((seg.x1 + t2 * (seg.x2 - seg.x1)) * 10) / 10,
      y: Math.round((seg.y1 + t2 * (seg.y2 - seg.y1)) * 10) / 10,
    };

    const segA = { ...seg, id: `wall_${Date.now()}_a`, x2: ptA.x, y2: ptA.y };
    const segB = { ...seg, id: `wall_${Date.now()}_b`, x1: ptB.x, y1: ptB.y };

    const newOpenings = [
      ...openings,
      { id: `open_${Date.now()}`, x1: ptA.x, y1: ptA.y, x2: ptB.x, y2: ptB.y, widthMeters: openingMeters },
    ];
    setOpenings(newOpenings);

    const next = segmentsRef.current.flatMap((s) => (s.id === seg.id ? [segA, segB] : [s]));
    pushHistory(next);
    setSelectedId(segB.id);
  }, [selectedSegment, metersPerPixel, openings, pushHistory]);

  // ----------------------------------------------------
  // Zero-Lag Pointer Movement & Drag Handler
  // ----------------------------------------------------
  const handlePointerDownHandle = (e, segId, endpoint) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerDragInfoRef.current = {
      pointerId: e.pointerId,
      segId,
      endpoint,
      targetElem: e.currentTarget,
    };
  };

  const handlePointerMove = (e) => {
    // 1. Panning viewport
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setPan({ x: panStart.pan.x + dx, y: panStart.pan.y + dy });
      return;
    }

    const coords = getSvgCoordinates(e);

    // 2. Dragging endpoint handle (Throttle with requestAnimationFrame for 60-120fps fluid cursor tracking)
    if (pointerDragInfoRef.current) {
      const dragInfo = pointerDragInfoRef.current;

      if (rafIdRef.current) return; // Drop redundant event if next animation frame is already queued

      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        let targetX = coords.x;
        let targetY = coords.y;
        let snap = null;

        // Node snapping (within 14px)
        const nodeSnap = findSnapTarget(coords.x, coords.y, dragInfo.segId, dragInfo.endpoint);
        if (nodeSnap) {
          targetX = nodeSnap.x;
          targetY = nodeSnap.y;
          snap = nodeSnap;
        } else {
          // Orthogonal snap against anchor endpoint
          const seg = segmentsRef.current.find((s) => s.id === dragInfo.segId);
          if (seg) {
            const anchor =
              dragInfo.endpoint === "p1"
                ? { x: seg.x2, y: seg.y2 }
                : dragInfo.endpoint === "p2"
                ? { x: seg.x1, y: seg.y1 }
                : { x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 };

            const ortho = snapOrthogonal(anchor.x, anchor.y, coords.x, coords.y);
            if (ortho.isSnapped) {
              targetX = ortho.x;
              targetY = ortho.y;
              snap = { x: ortho.x, y: ortho.y, type: ortho.type, label: ortho.label };
            }
          }
        }

        setActiveDrag({
          segId: dragInfo.segId,
          endpoint: dragInfo.endpoint,
          x: targetX,
          y: targetY,
          snapIndicator: snap,
        });
      });
      return;
    }

    // 3. Drawing straight line or curve
    if ((activeTool === "draw" || activeTool === "curve") && drawState) {
      if (rafIdRef.current) return;
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        let cur = coords;
        const nodeSnap = findSnapTarget(coords.x, coords.y);
        let snap = null;

        if (nodeSnap) {
          cur = { x: nodeSnap.x, y: nodeSnap.y };
          snap = nodeSnap;
        } else {
          const ortho = snapOrthogonal(drawState.start.x, drawState.start.y, coords.x, coords.y);
          if (ortho.isSnapped) {
            cur = { x: ortho.x, y: ortho.y };
            snap = { x: ortho.x, y: ortho.y, type: ortho.type, label: ortho.label };
          }
        }

        setDrawState((prev) => (prev ? { ...prev, current: cur, snap } : null));
      });
      return;
    }

    // 4. Scissors tool hover detection
    if (activeTool === "scissors") {
      const nearest = findNearestSegment(coords.x, coords.y);
      setScissorsHover(nearest);
    }
  };

  const handlePointerUp = (e) => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    // Commit active drag movement ONCE into state and push to history
    if (pointerDragInfoRef.current) {
      const dragInfo = pointerDragInfoRef.current;
      if (dragInfo.targetElem) {
        try {
          dragInfo.targetElem.releasePointerCapture(dragInfo.pointerId);
        } catch (_) {}
      }
      pointerDragInfoRef.current = null;

      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      if (activeDrag) {
        const finalSegments = segmentsRef.current.map((s) => {
          if (s.id !== activeDrag.segId) return s;
          if (activeDrag.endpoint === "p1") return { ...s, x1: activeDrag.x, y1: activeDrag.y };
          if (activeDrag.endpoint === "p2") return { ...s, x2: activeDrag.x, y2: activeDrag.y };
          if (activeDrag.endpoint === "control") return { ...s, cx: activeDrag.x, cy: activeDrag.y };
          return s;
        });
        pushHistory(finalSegments);
        setActiveDrag(null);
      }
    }
  };

  // Canvas Mouse Down / Click Actions (Tool dispatching)
  const handleSvgMouseDown = (e) => {
    if (e.button === 1 || activeTool === "pan" || isSpacePressed) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY, pan: { ...pan } });
      return;
    }

    const coords = getSvgCoordinates(e);

    // DRAW TOOL
    if (activeTool === "draw") {
      if (!drawState) {
        const snap = findSnapTarget(coords.x, coords.y);
        const start = snap ? { x: snap.x, y: snap.y } : coords;
        setDrawState({ start, current: start });
      } else {
        const cur = drawState.current;
        const dist = Math.hypot(cur.x - drawState.start.x, cur.y - drawState.start.y);
        if (dist >= 6) {
          const newSeg = {
            id: `wall_${Date.now()}`,
            type: "straight",
            x1: Math.round(drawState.start.x * 10) / 10,
            y1: Math.round(drawState.start.y * 10) / 10,
            x2: Math.round(cur.x * 10) / 10,
            y2: Math.round(cur.y * 10) / 10,
          };
          const next = [...segmentsRef.current, newSeg];
          pushHistory(next);
          setSelectedId(newSeg.id);
        }
        setDrawState(null);
      }
      return;
    }

    // CURVE TOOL
    if (activeTool === "curve") {
      if (!drawState) {
        const snap = findSnapTarget(coords.x, coords.y);
        const start = snap ? { x: snap.x, y: snap.y } : coords;
        setDrawState({ start, current: start });
      } else {
        const cur = drawState.current;
        const dist = Math.hypot(cur.x - drawState.start.x, cur.y - drawState.start.y);
        if (dist >= 8) {
          const midX = (drawState.start.x + cur.x) / 2;
          const midY = (drawState.start.y + cur.y) / 2;
          const dx = cur.x - drawState.start.x;
          const dy = cur.y - drawState.start.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          const cx = Math.round((midX + nx * 30) * 10) / 10;
          const cy = Math.round((midY + ny * 30) * 10) / 10;

          const newCurve = {
            id: `curve_${Date.now()}`,
            type: "curve",
            x1: Math.round(drawState.start.x * 10) / 10,
            y1: Math.round(drawState.start.y * 10) / 10,
            x2: Math.round(cur.x * 10) / 10,
            y2: Math.round(cur.y * 10) / 10,
            cx,
            cy,
          };
          const next = [...segmentsRef.current, newCurve];
          pushHistory(next);
          setSelectedId(newCurve.id);
        }
        setDrawState(null);
      }
      return;
    }

    // SCISSORS / CUT TOOL
    if (activeTool === "scissors") {
      const nearest = findNearestSegment(coords.x, coords.y);
      if (!nearest) return;

      if (!scissorsState) {
        // Place first cut point
        setScissorsState({
          segId: nearest.seg.id,
          x: nearest.x,
          y: nearest.y,
          t: nearest.t,
        });
      } else {
        // Second cut point: remove opening or split line
        const origSeg = segmentsRef.current.find((s) => s.id === scissorsState.segId);
        if (!origSeg || scissorsState.segId !== nearest.seg.id) {
          // If clicked a different segment, restart first cut
          setScissorsState({
            segId: nearest.seg.id,
            x: nearest.x,
            y: nearest.y,
            t: nearest.t,
          });
          return;
        }

        const tA = Math.min(scissorsState.t, nearest.t);
        const tB = Math.max(scissorsState.t, nearest.t);
        const cutDistPx = Math.hypot(
          (origSeg.x2 - origSeg.x1) * (tB - tA),
          (origSeg.y2 - origSeg.y1) * (tB - tA)
        );

        if (cutDistPx < 6) {
          // Single cut: split segment into two contiguous connected walls
          const splitPt = {
            x: Math.round((origSeg.x1 + tA * (origSeg.x2 - origSeg.x1)) * 10) / 10,
            y: Math.round((origSeg.y1 + tA * (origSeg.y2 - origSeg.y1)) * 10) / 10,
          };
          const seg1 = { ...origSeg, id: `wall_${Date.now()}_1`, x2: splitPt.x, y2: splitPt.y };
          const seg2 = { ...origSeg, id: `wall_${Date.now()}_2`, x1: splitPt.x, y1: splitPt.y };
          const next = segmentsRef.current.flatMap((s) => (s.id === origSeg.id ? [seg1, seg2] : [s]));
          pushHistory(next);
          setSelectedId(seg2.id);
        } else {
          // Two-point cut: remove portion between A and B to create intentional door/window opening
          const ptA = {
            x: Math.round((origSeg.x1 + tA * (origSeg.x2 - origSeg.x1)) * 10) / 10,
            y: Math.round((origSeg.y1 + tA * (origSeg.y2 - origSeg.y1)) * 10) / 10,
          };
          const ptB = {
            x: Math.round((origSeg.x1 + tB * (origSeg.x2 - origSeg.x1)) * 10) / 10,
            y: Math.round((origSeg.y1 + tB * (origSeg.y2 - origSeg.y1)) * 10) / 10,
          };
          const seg1 = { ...origSeg, id: `wall_${Date.now()}_1`, x2: ptA.x, y2: ptA.y };
          const seg2 = { ...origSeg, id: `wall_${Date.now()}_2`, x1: ptB.x, y1: ptB.y };

          const openRecord = {
            id: `open_${Date.now()}`,
            x1: ptA.x,
            y1: ptA.y,
            x2: ptB.x,
            y2: ptB.y,
            widthMeters: (cutDistPx * metersPerPixel).toFixed(2),
          };
          setOpenings((prev) => [...prev, openRecord]);

          const next = segmentsRef.current.flatMap((s) => (s.id === origSeg.id ? [seg1, seg2] : [s]));
          pushHistory(next);
          setSelectedId(seg2.id);
        }
        setScissorsState(null);
      }
      return;
    }

    if (activeTool === "select") {
      setSelectedId(null);
      setScissorsState(null);
    }
  };

  // Keyboard shortcut listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      if (e.code === "Space") {
        setIsSpacePressed(true);
      } else if (e.key === "v" || e.key === "V") {
        setActiveTool("select");
      } else if (e.key === "l" || e.key === "L" || e.key === "d" || e.key === "D") {
        setActiveTool("draw");
      } else if (e.key === "c" || e.key === "C") {
        setActiveTool("curve");
      } else if (e.key === "x" || e.key === "X") {
        setActiveTool("scissors");
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
        if (drawState) setDrawState(null);
        if (scissorsState) setScissorsState(null);
        if (selectedId) setSelectedId(null);
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
  }, [
    isOpen,
    selectedId,
    handleAlignHorizontal,
    handleAlignVertical,
    handleDeleteSegment,
    handleUndo,
    handleRedo,
    drawState,
    scissorsState,
  ]);

  // Total floor perimeter calculation
  const totalLengthPx = useMemo(() => {
    return segments.reduce((sum, s) => {
      if (s.type === "curve") {
        let len = 0;
        let px = s.x1;
        let py = s.y1;
        for (let i = 1; i <= 10; i++) {
          const t = i / 10;
          const cx = (1 - t) ** 2 * s.x1 + 2 * (1 - t) * t * s.cx + t ** 2 * s.x2;
          const cy = (1 - t) ** 2 * s.y1 + 2 * (1 - t) * t * s.cy + t ** 2 * s.y2;
          len += Math.hypot(cx - px, cy - py);
          px = cx;
          py = cy;
        }
        return sum + len;
      }
      return sum + Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    }, 0);
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

    // 1. Straight lines in Blender Cartesian coordinates (Y inverted)
    const straightLines = [];
    const curvesPayload = [];

    segments.forEach((s) => {
      if (s.type === "curve") {
        curvesPayload.push({
          id: s.id,
          p1: [Math.round(s.x1 * 100) / 100, Math.round((image_height - s.y1) * 100) / 100],
          p2: [Math.round(s.x2 * 100) / 100, Math.round((image_height - s.y2) * 100) / 100],
          control: [Math.round(s.cx * 100) / 100, Math.round((image_height - s.cy) * 100) / 100],
        });

        // Also discretize into 16 sub-segments for any fallback visualizer
        const steps = 16;
        for (let i = 0; i < steps; i++) {
          const t0 = i / steps;
          const t1 = (i + 1) / steps;
          const ax = (1 - t0) ** 2 * s.x1 + 2 * (1 - t0) * t0 * s.cx + t0 ** 2 * s.x2;
          const ay = (1 - t0) ** 2 * s.y1 + 2 * (1 - t0) * t0 * s.cy + t0 ** 2 * s.y2;
          const bx = (1 - t1) ** 2 * s.x1 + 2 * (1 - t1) * t1 * s.cx + t1 ** 2 * s.x2;
          const by = (1 - t1) ** 2 * s.y1 + 2 * (1 - t1) * t1 * s.cy + t1 ** 2 * s.y2;
          straightLines.push([
            [Math.round(ax * 100) / 100, Math.round((image_height - ay) * 100) / 100],
            [Math.round(bx * 100) / 100, Math.round((image_height - by) * 100) / 100],
          ]);
        }
      } else {
        straightLines.push([
          [Math.round(s.x1 * 100) / 100, Math.round((image_height - s.y1) * 100) / 100],
          [Math.round(s.x2 * 100) / 100, Math.round((image_height - s.y2) * 100) / 100],
        ]);
      }
    });

    // 2. Normalized segments [0..1]
    const normalizedSegs = segments.map((s) => [
      [Number((s.x1 / image_width).toFixed(4)), Number((s.y1 / image_height).toFixed(4))],
      [Number((s.x2 / image_width).toFixed(4)), Number((s.y2 / image_height).toFixed(4))],
    ]);

    // 3. Recompute bounding box
    const allX = segments.flatMap((s) => (s.type === "curve" ? [s.x1, s.x2, s.cx] : [s.x1, s.x2]));
    const allY = segments.flatMap((s) => (s.type === "curve" ? [s.y1, s.y2, s.cy] : [s.y1, s.y2]));
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
      line_segments: straightLines,
      curves: curvesPayload,
      openings: openings,
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
      <div className="flex flex-col space-y-4">
        {/* Top Summary Notice Bar */}
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-orange-50/70 dark:bg-[#ff7417]/10 border border-orange-200/80 dark:border-[#ff7417]/20 text-xs text-orange-950 dark:text-[#ff9248]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-orange-600 dark:text-[#ff7417] shrink-0" />
            <span className="font-medium">
              Extracted <strong>{segments.length} walls</strong>. Select lines to move endpoints, straighten axes, cut door/window openings, or draw curved walls before 3D extrusion.
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] font-semibold text-orange-800 dark:text-[#ff9248]">
            <span>{image_width} × {image_height} px</span>
            <span>•</span>
            <span>Est. Perimeter: ~{totalLengthMeters}m</span>
          </div>
        </div>

        {/* 2-Column Responsive CAD Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Interactive 2D Vector CAD Canvas (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col space-y-2">
            {/* Viewport Control Bar */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-[#1d1b19] border border-zinc-200 dark:border-[#39342f] text-xs text-zinc-600 dark:text-[#b4ada3]">
              {/* Tool Palette */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTool("select");
                    setScissorsState(null);
                    setDrawState(null);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
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
                    setScissorsState(null);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                    activeTool === "draw"
                      ? "bg-orange-500 text-white shadow-xs"
                      : "hover:bg-zinc-200 dark:hover:bg-[#2b2a27] text-zinc-700 dark:text-[#f5f0e8]"
                  }`}
                  title="Draw Straight Wall (L / D)"
                >
                  <PenTool className="w-3.5 h-3.5" />
                  <span>Line</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTool("curve");
                    setSelectedId(null);
                    setScissorsState(null);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                    activeTool === "curve"
                      ? "bg-orange-500 text-white shadow-xs"
                      : "hover:bg-zinc-200 dark:hover:bg-[#2b2a27] text-zinc-700 dark:text-[#f5f0e8]"
                  }`}
                  title="Draw Curved Wall (C)"
                >
                  <Spline className="w-3.5 h-3.5" />
                  <span>Curve</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTool("scissors");
                    setSelectedId(null);
                    setDrawState(null);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                    activeTool === "scissors"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "hover:bg-zinc-200 dark:hover:bg-[#2b2a27] text-zinc-700 dark:text-[#f5f0e8]"
                  }`}
                  title="Cut Wall / Create Door & Window Opening (X)"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  <span>Scissors</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTool("delete");
                    setSelectedId(null);
                    setScissorsState(null);
                  }}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-all cursor-pointer ${
                    activeTool === "delete"
                      ? "bg-red-600 text-white shadow-xs"
                      : "hover:bg-zinc-200 dark:hover:bg-[#2b2a27] text-zinc-700 dark:text-[#f5f0e8]"
                  }`}
                  title="Delete Wall Segment (Del)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTool("pan");
                    setSelectedId(null);
                  }}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-all cursor-pointer ${
                    activeTool === "pan"
                      ? "bg-zinc-800 text-white shadow-xs"
                      : "hover:bg-zinc-200 dark:hover:bg-[#2b2a27] text-zinc-700 dark:text-[#f5f0e8]"
                  }`}
                  title="Pan Canvas (Space)"
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
                  className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-[#2b2a27] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={historyIndex >= history.length - 1}
                  className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-[#2b2a27] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2 className="w-4 h-4" />
                </button>

                <div className="h-4 w-px bg-zinc-300 dark:bg-[#39342f] mx-0.5" />

                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
                  className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-[#2b2a27] transition-colors cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>

                <span className="font-mono text-[11px] w-8 text-center select-none">
                  {Math.round(zoom * 100)}%
                </span>

                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(3.0, z + 0.2))}
                  className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-[#2b2a27] transition-colors cursor-pointer"
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
                  className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-[#2b2a27] transition-colors cursor-pointer"
                  title="Reset View"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 2D Canvas Viewport Box */}
            <div
              ref={viewportBoxRef}
              className={`relative aspect-4/3 w-full bg-[#141311] rounded-2xl border border-zinc-300 dark:border-[#39342f] overflow-hidden flex items-center justify-center select-none shadow-inner touch-none ${
                activeTool === "pan" || isSpacePressed
                  ? "cursor-grab active:cursor-grabbing"
                  : activeTool === "draw" || activeTool === "curve"
                  ? "cursor-crosshair"
                  : activeTool === "scissors"
                  ? "cursor-crosshair"
                  : activeTool === "delete"
                  ? "cursor-pointer"
                  : "cursor-default"
              }`}
              onPointerDown={handleSvgMouseDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
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
                    <filter id="wallGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#ff7417" floodOpacity="0.6" />
                    </filter>
                    <filter id="selectedGlow" x="-30%" y="-30%" width="160%" height="160%">
                      <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#00f0ff" floodOpacity="0.9" />
                    </filter>
                  </defs>

                  {/* 1. Unselected Wall Lines and Curves */}
                  <g
                    stroke="#FF7417"
                    strokeWidth={visualWallThicknessPx}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#wallGlow)"
                    fill="none"
                  >
                    {segments.map((seg) => {
                      if (seg.id === selectedId) return null;

                      // If this segment is being dragged live, substitute coordinates on the fly
                      const x1 = activeDrag?.segId === seg.id && activeDrag.endpoint === "p1" ? activeDrag.x : seg.x1;
                      const y1 = activeDrag?.segId === seg.id && activeDrag.endpoint === "p1" ? activeDrag.y : seg.y1;
                      const x2 = activeDrag?.segId === seg.id && activeDrag.endpoint === "p2" ? activeDrag.x : seg.x2;
                      const y2 = activeDrag?.segId === seg.id && activeDrag.endpoint === "p2" ? activeDrag.y : seg.y2;
                      const cx = activeDrag?.segId === seg.id && activeDrag.endpoint === "control" ? activeDrag.x : seg.cx;
                      const cy = activeDrag?.segId === seg.id && activeDrag.endpoint === "control" ? activeDrag.y : seg.cy;

                      return (
                        <g key={seg.id} className="cursor-pointer">
                          {/* Invisible wide hit target for effortless clicking */}
                          {seg.type === "curve" ? (
                            <path
                              d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                              stroke="transparent"
                              strokeWidth={20}
                              fill="none"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (activeTool === "delete") {
                                  handleDeleteSegment(seg.id);
                                } else if (activeTool === "select") {
                                  setSelectedId(seg.id);
                                }
                              }}
                            />
                          ) : (
                            <line
                              x1={x1}
                              y1={y1}
                              x2={x2}
                              y2={y2}
                              stroke="transparent"
                              strokeWidth={20}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (activeTool === "delete") {
                                  handleDeleteSegment(seg.id);
                                } else if (activeTool === "select") {
                                  setSelectedId(seg.id);
                                }
                              }}
                            />
                          )}

                          {/* Visible Wall Line or Curve */}
                          {seg.type === "curve" ? (
                            <path
                              d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                              fill="none"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (activeTool === "delete") {
                                  handleDeleteSegment(seg.id);
                                } else if (activeTool === "select") {
                                  setSelectedId(seg.id);
                                }
                              }}
                            />
                          ) : (
                            <line
                              x1={x1}
                              y1={y1}
                              x2={x2}
                              y2={y2}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (activeTool === "delete") {
                                  handleDeleteSegment(seg.id);
                                } else if (activeTool === "select") {
                                  setSelectedId(seg.id);
                                }
                              }}
                            />
                          )}
                        </g>
                      );
                    })}
                  </g>

                  {/* 2. Selected Wall Line / Curve (Electric Cyan Glowing Highlight) */}
                  {selectedSegment && (() => {
                    const seg = selectedSegment;
                    const x1 = activeDrag?.segId === seg.id && activeDrag.endpoint === "p1" ? activeDrag.x : seg.x1;
                    const y1 = activeDrag?.segId === seg.id && activeDrag.endpoint === "p1" ? activeDrag.y : seg.y1;
                    const x2 = activeDrag?.segId === seg.id && activeDrag.endpoint === "p2" ? activeDrag.x : seg.x2;
                    const y2 = activeDrag?.segId === seg.id && activeDrag.endpoint === "p2" ? activeDrag.y : seg.y2;
                    const cx = activeDrag?.segId === seg.id && activeDrag.endpoint === "control" ? activeDrag.x : seg.cx;
                    const cy = activeDrag?.segId === seg.id && activeDrag.endpoint === "control" ? activeDrag.y : seg.cy;

                    return (
                      <g filter="url(#selectedGlow)" fill="none">
                        {/* Outer Glow */}
                        {seg.type === "curve" ? (
                          <path
                            d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                            stroke="#00F0FF"
                            strokeWidth={Math.max(6.0, visualWallThicknessPx + 4)}
                            strokeLinecap="round"
                          />
                        ) : (
                          <line
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke="#00F0FF"
                            strokeWidth={Math.max(6.0, visualWallThicknessPx + 4)}
                            strokeLinecap="round"
                          />
                        )}

                        {/* Core White Line */}
                        {seg.type === "curve" ? (
                          <path
                            d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                            stroke="#FFFFFF"
                            strokeWidth={Math.max(2.5, visualWallThicknessPx * 0.4)}
                            strokeLinecap="round"
                          />
                        ) : (
                          <line
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke="#FFFFFF"
                            strokeWidth={Math.max(2.5, visualWallThicknessPx * 0.4)}
                            strokeLinecap="round"
                          />
                        )}

                        {/* Dashed control lines for curved segment */}
                        {seg.type === "curve" && (
                          <g stroke="#00F0FF" strokeWidth="1" strokeDasharray="3 3" opacity="0.7">
                            <line x1={x1} y1={y1} x2={cx} y2={cy} />
                            <line x1={x2} y1={y2} x2={cx} y2={cy} />
                          </g>
                        )}
                      </g>
                    );
                  })()}

                  {/* 3. Corner Nodes */}
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

                  {/* 4. Active Drawing Line or Curve Preview */}
                  {drawState && (
                    <g>
                      {activeTool === "curve" ? (
                        <>
                          <line
                            x1={drawState.start.x}
                            y1={drawState.start.y}
                            x2={drawState.current.x}
                            y2={drawState.current.y}
                            stroke="#10B981"
                            strokeWidth={visualWallThicknessPx}
                            strokeDasharray="5 3"
                            strokeLinecap="round"
                          />
                          <circle cx={drawState.start.x} cy={drawState.start.y} r="4" fill="#10B981" stroke="#FFFFFF" strokeWidth="1.5" />
                          <circle cx={drawState.current.x} cy={drawState.current.y} r="5" fill="#10B981" stroke="#FFFFFF" strokeWidth="1.5" />
                        </>
                      ) : (
                        <>
                          <line
                            x1={drawState.start.x}
                            y1={drawState.start.y}
                            x2={drawState.current.x}
                            y2={drawState.current.y}
                            stroke="#10B981"
                            strokeWidth={visualWallThicknessPx}
                            strokeDasharray="5 3"
                            strokeLinecap="round"
                          />
                          <circle cx={drawState.start.x} cy={drawState.start.y} r="4" fill="#10B981" stroke="#FFFFFF" strokeWidth="1.5" />
                          <circle cx={drawState.current.x} cy={drawState.current.y} r="5" fill="#10B981" stroke="#FFFFFF" strokeWidth="1.5" />
                        </>
                      )}
                    </g>
                  )}

                  {/* 5. Draggable Endpoint & Curve Handles for Selected Segment */}
                  {selectedSegment && (() => {
                    const seg = selectedSegment;
                    const x1 = activeDrag?.segId === seg.id && activeDrag.endpoint === "p1" ? activeDrag.x : seg.x1;
                    const y1 = activeDrag?.segId === seg.id && activeDrag.endpoint === "p1" ? activeDrag.y : seg.y1;
                    const x2 = activeDrag?.segId === seg.id && activeDrag.endpoint === "p2" ? activeDrag.x : seg.x2;
                    const y2 = activeDrag?.segId === seg.id && activeDrag.endpoint === "p2" ? activeDrag.y : seg.y2;
                    const cx = activeDrag?.segId === seg.id && activeDrag.endpoint === "control" ? activeDrag.x : seg.cx;
                    const cy = activeDrag?.segId === seg.id && activeDrag.endpoint === "control" ? activeDrag.y : seg.cy;

                    return (
                      <g>
                        {/* P1 Handle */}
                        <circle
                          cx={x1}
                          cy={y1}
                          r="6.5"
                          fill="#FFFFFF"
                          stroke="#00F0FF"
                          strokeWidth="2.5"
                          className="cursor-move hover:scale-125 transition-transform"
                          onPointerDown={(e) => handlePointerDownHandle(e, seg.id, "p1")}
                        />

                        {/* P2 Handle */}
                        <circle
                          cx={x2}
                          cy={y2}
                          r="6.5"
                          fill="#FFFFFF"
                          stroke="#00F0FF"
                          strokeWidth="2.5"
                          className="cursor-move hover:scale-125 transition-transform"
                          onPointerDown={(e) => handlePointerDownHandle(e, seg.id, "p2")}
                        />

                        {/* Curve Control Point Handle (Diamond) */}
                        {seg.type === "curve" && (
                          <g
                            className="cursor-move hover:scale-125 transition-transform"
                            onPointerDown={(e) => handlePointerDownHandle(e, seg.id, "control")}
                          >
                            <rect
                              x={cx - 6}
                              y={cy - 6}
                              width="12"
                              height="12"
                              fill="#A855F7"
                              stroke="#FFFFFF"
                              strokeWidth="2"
                              transform={`rotate(45, ${cx}, ${cy})`}
                            />
                          </g>
                        )}
                      </g>
                    );
                  })()}

                  {/* 6. Scissors Cutting Indicator and Opening Preview */}
                  {activeTool === "scissors" && (
                    <g>
                      {/* Hover cut marker */}
                      {scissorsHover && !scissorsState && (
                        <g>
                          <circle cx={scissorsHover.x} cy={scissorsHover.y} r="5" fill="#EF4444" stroke="#FFFFFF" strokeWidth="1.5" />
                          <line
                            x1={scissorsHover.x - 7}
                            y1={scissorsHover.y - 7}
                            x2={scissorsHover.x + 7}
                            y2={scissorsHover.y + 7}
                            stroke="#EF4444"
                            strokeWidth="2"
                          />
                        </g>
                      )}

                      {/* Active first cut marker and span to cursor */}
                      {scissorsState && (
                        <g>
                          <circle cx={scissorsState.x} cy={scissorsState.y} r="6" fill="#EF4444" stroke="#FFFFFF" strokeWidth="2" />
                          {scissorsHover && scissorsHover.seg.id === scissorsState.segId && (
                            <line
                              x1={scissorsState.x}
                              y1={scissorsState.y}
                              x2={scissorsHover.x}
                              y2={scissorsHover.y}
                              stroke="#EF4444"
                              strokeWidth={visualWallThicknessPx}
                              strokeDasharray="4 3"
                            />
                          )}
                        </g>
                      )}
                    </g>
                  )}

                  {/* 7. Magnetic Snap Indicator */}
                  {activeDrag?.snapIndicator && (
                    <g>
                      <circle
                        cx={activeDrag.snapIndicator.x}
                        cy={activeDrag.snapIndicator.y}
                        r="9"
                        fill="none"
                        stroke={activeDrag.snapIndicator.type === "node" ? "#10B981" : "#F59E0B"}
                        strokeWidth="2.5"
                        strokeDasharray="3 2"
                      />
                      <circle
                        cx={activeDrag.snapIndicator.x}
                        cy={activeDrag.snapIndicator.y}
                        r="3.5"
                        fill={activeDrag.snapIndicator.type === "node" ? "#10B981" : "#F59E0B"}
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
                    : activeTool === "curve"
                    ? "Click start and end points to create curved wall"
                    : activeTool === "scissors"
                    ? scissorsState
                      ? "Click second point to cut opening, or same spot to split"
                      : "Hover over a wall and click to start cut"
                    : selectedSegment
                    ? `Selected Wall: ${selectedSegment.id} (${selectedSegment.type === "curve" ? "Curved" : "Straight"})`
                    : "Click any wall to select and edit"}
                </span>

                {activeDrag?.snapIndicator && (
                  <span className="px-2 py-0.5 rounded bg-emerald-950/85 border border-emerald-500/50 text-[10px] font-mono text-emerald-300 animate-pulse">
                    {activeDrag.snapIndicator.label || "Snapped"}
                  </span>
                )}
              </div>
            </div>

            {/* Blueprint Overlay Visibility & Opacity Controls */}
            <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-[#b4ada3] px-1 pt-0.5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowImageOverlay((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 font-medium hover:text-zinc-900 dark:hover:text-[#f5f0e8] transition-colors cursor-pointer"
                >
                  {showImageOverlay ? <Eye className="w-3.5 h-3.5 text-orange-500" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>{showImageOverlay ? "Blueprint Visible" : "Blueprint Hidden"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowNodes((prev) => !prev)}
                  className="inline-flex items-center gap-1 font-medium hover:text-zinc-900 dark:hover:text-[#f5f0e8] transition-colors cursor-pointer"
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
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                  <span className="font-mono w-7 text-right">{Math.round(imageOpacity * 100)}%</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Wall Inspector & Architectural Calibration (5 Cols) */}
          <div className="lg:col-span-5 space-y-3.5">
            {/* 1. Selected Wall Inspector */}
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
                    className="px-2 py-0.5 rounded text-[11px] font-semibold text-red-600 hover:bg-red-100 dark:hover:bg-red-950/50 flex items-center gap-1 transition-colors cursor-pointer"
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
                      className="w-full px-2.5 py-1 text-xs font-mono bg-white dark:bg-[#1d1b19] border border-zinc-300 dark:border-[#39342f] rounded-lg outline-none focus:ring-1 focus:ring-orange-500 text-zinc-900 dark:text-[#f5f0e8]"
                      placeholder="e.g. 4.5"
                    />
                    <button
                      type="button"
                      onClick={handleApplyCustomLength}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-zinc-800 dark:bg-[#ff7417] text-white hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>
                </div>

                {/* Straighten & Alignment Tools */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-zinc-600 dark:text-[#b4ada3] block">
                    Straighten & Geometry Tools:
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleAlignHorizontal(selectedSegment.id)}
                      className="p-1.5 rounded-lg text-xs font-medium bg-white dark:bg-[#1d1b19] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] border border-zinc-200 dark:border-[#39342f] text-zinc-800 dark:text-[#f5f0e8] flex flex-col items-center gap-1 transition-colors cursor-pointer"
                      title="Snap to exact horizontal level [H]"
                    >
                      <MoveHorizontal className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-[10px]">Horizontal [H]</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAlignVertical(selectedSegment.id)}
                      className="p-1.5 rounded-lg text-xs font-medium bg-white dark:bg-[#1d1b19] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] border border-zinc-200 dark:border-[#39342f] text-zinc-800 dark:text-[#f5f0e8] flex flex-col items-center gap-1 transition-colors cursor-pointer"
                      title="Snap to exact vertical plumb [O]"
                    >
                      <MoveVertical className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-[10px]">Vertical [O]</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleCurve(selectedSegment.id)}
                      className={`p-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer flex flex-col items-center gap-1 ${
                        selectedSegment.type === "curve"
                          ? "bg-purple-100 dark:bg-purple-950/40 border-purple-300 text-purple-700 dark:text-purple-300"
                          : "bg-white dark:bg-[#1d1b19] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] border-zinc-200 dark:border-[#39342f] text-zinc-800 dark:text-[#f5f0e8]"
                      }`}
                      title="Toggle curved wall with control handles"
                    >
                      <Spline className="w-3.5 h-3.5 text-purple-500" />
                      <span className="text-[10px]">{selectedSegment.type === "curve" ? "To Straight" : "To Curve"}</span>
                    </button>
                  </div>
                </div>

                {/* Architectural Cut Opening Quick Actions */}
                {selectedSegment.type !== "curve" && (
                  <div className="space-y-1.5 pt-1 border-t border-orange-200/50 dark:border-[#39342f]">
                    <span className="text-[11px] font-semibold text-zinc-600 dark:text-[#b4ada3] block">
                      Cut Architectural Openings:
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleCutOpeningPreset(0.9)}
                        className="py-1 px-2 rounded-lg text-[11px] font-medium bg-white dark:bg-[#1d1b19] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] border border-zinc-200 dark:border-[#39342f] text-zinc-800 dark:text-[#f5f0e8] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        title="Cut 0.9m standard door opening at wall center"
                      >
                        <Scissors className="w-3 h-3 text-amber-500" />
                        <span>Cut 0.9m Door</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCutOpeningPreset(1.2)}
                        className="py-1 px-2 rounded-lg text-[11px] font-medium bg-white dark:bg-[#1d1b19] hover:bg-zinc-100 dark:hover:bg-[#2b2a27] border border-zinc-200 dark:border-[#39342f] text-zinc-800 dark:text-[#f5f0e8] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        title="Cut 1.2m standard window opening at wall center"
                      >
                        <Scissors className="w-3 h-3 text-amber-500" />
                        <span>Cut 1.2m Window</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="text-[10px] text-zinc-500 dark:text-[#b4ada3] pt-0.5 flex justify-between font-mono">
                  <span>P1: ({selectedSegment.x1}, {selectedSegment.y1})</span>
                  <span>P2: ({selectedSegment.x2}, {selectedSegment.y2})</span>
                </div>
              </div>
            ) : (
              /* Empty Inspector Box */
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-[#1d1b19] border border-dashed border-zinc-200 dark:border-[#39342f] text-center space-y-1">
                <MousePointer className="w-4 h-4 text-zinc-400 dark:text-[#b4ada3] mx-auto" />
                <p className="text-xs font-semibold text-zinc-700 dark:text-[#f5f0e8]">
                  No Wall Selected
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-[#b4ada3]">
                  Click any wall on the canvas to inspect coordinates, align axes, adjust length, cut openings, or convert into a curve.
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
                  className="w-full accent-orange-500 cursor-pointer"
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
                  className="w-full accent-orange-500 cursor-pointer"
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
                  max="0.80"
                  step="0.02"
                  value={calibratedWallThickness}
                  onChange={(e) => setCalibratedWallThickness(parseFloat(e.target.value))}
                  className="w-full accent-orange-500 cursor-pointer"
                />
                <span className="text-[10px] text-zinc-400 dark:text-[#b4ada3] mt-0.5 block">
                  Scales thickness in 2D preview and extruded 3D mesh ({Math.round(calibratedWallThickness * 100)} cm).
                </span>
              </div>
            </div>

            {/* 3. Extraction & Editing Metrics Audit */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-[#1d1b19] border border-[#eae4dc] dark:border-[#39342f] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-600 dark:text-[#b4ada3]">Active Walls:</span>
                <strong className="text-zinc-900 dark:text-[#f5f0e8] font-mono">{segments.length} segments</strong>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-600 dark:text-[#b4ada3]">Intentional Openings:</span>
                <span className="font-mono text-zinc-900 dark:text-[#f5f0e8]">{openings.length} cutouts</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-600 dark:text-[#b4ada3]">Floor Perimeter:</span>
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

        {/* Modal Sticky Bottom Action Footer */}
        <div className="shrink-0 sticky bottom-0 bg-[#fdfbf7] dark:bg-[#1d1b19] pt-3 pb-1 border-t border-[#eae4dc] dark:border-[#39342f] flex flex-wrap items-center justify-between gap-3 z-10">
          <div className="text-[11px] text-zinc-500 dark:text-[#b4ada3]">
            <span className="font-semibold text-zinc-700 dark:text-[#f5f0e8]">Shortcuts:</span> V: Select • L: Line • C: Curve • X: Scissors • Del: Delete • H: Horizontal • O: Vertical • Ctrl+Z: Undo
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
