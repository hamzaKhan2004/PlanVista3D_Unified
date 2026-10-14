import React, {
  Suspense,
  useRef,
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useCallback,
  useMemo,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  useGLTF,
  Environment,
  Grid,
  Html,
  TransformControls,
} from "@react-three/drei";
import * as THREE from "three";
import { CAMERA_PRESETS, TRANSFORM_MODES } from "../../domain/cad/cadTypes";
import { useTheme } from "../../presentation/layout/AppLayout";
import {
  separateGeometryConnectedComponents,
  getMeshWallDimensions,
  collectWallSnapCandidates,
  findSnapPoint,
} from "../../domain/cad/cadGeometry";

class ModelErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.warn("Failed to load 3D GLB model in viewport:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <Html center>
          <div className="flex flex-col items-center gap-2 p-5 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-2xl border border-red-200 dark:border-red-900/50 shadow-xl max-w-sm text-center">
            <span className="text-xs font-bold text-red-600 dark:text-red-400">
              Model Artifact Unavailable
            </span>
            <span className="text-[11px] text-zinc-600 dark:text-zinc-300">
              The generated .GLB geometry artifact was not found on the server. Please verify the backend outputs directory.
            </span>
          </div>
        </Html>
      );
    }
    return this.props.children;
  }
}

/**
 * Calibrated Ground Overlay rendering the original source blueprint under 3D walls.
 * Fulfills Requirement 3.
 */
const BlueprintGroundOverlay = ({
  imageUrl,
  bounds,
  opacity = 0.65,
  visible = true,
}) => {
  const [texture, setTexture] = useState(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!imageUrl) {
      setTexture(null);
      return;
    }
    setHasError(false);
    const loader = new THREE.TextureLoader();
    loader.load(
      imageUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        setTexture(tex);
      },
      undefined,
      (err) => {
        console.warn("Source blueprint texture failed to load:", err);
        setHasError(true);
      }
    );
  }, [imageUrl]);

  if (!visible || !texture || hasError) return null;

  const minX = bounds?.min?.[0] ?? -10;
  const maxX = bounds?.max?.[0] ?? 10;
  const minZ = bounds?.min?.[2] ?? -10;
  const maxZ = bounds?.max?.[2] ?? 10;

  const modelWidth = Math.max(2, maxX - minX);
  const modelDepth = Math.max(2, maxZ - minZ);
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

  const imgAspect = texture.image ? texture.image.width / texture.image.height : 1;
  const modelAspect = modelWidth / modelDepth;

  let planeW = modelWidth * 1.05;
  let planeH = modelDepth * 1.05;

  if (imgAspect > modelAspect) {
    planeW = planeH * imgAspect;
  } else {
    planeH = planeW / imgAspect;
  }

  return (
    <mesh
      position={[centerX, -0.015, centerZ]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[planeW, planeH]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
};

/**
 * Interactive Floor Raycaster & Snapping Controller for Wall Drawing (+ Wall).
 * Fulfills Requirement 2.
 */
const WallDrawingController = ({
  isDrawing,
  snapCandidates,
  wallHeight = 2.8,
  wallThickness = 0.25,
  onCreateWall,
  onCancel,
}) => {
  const { camera, raycaster, gl } = useThree();
  const [startPoint, setStartPoint] = useState(null);
  const [currentPoint, setCurrentPoint] = useState(null);
  const [snapType, setSnapType] = useState(null);
  const [isShiftDown, setIsShiftDown] = useState(false);

  const groundPlane = useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    []
  );

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Shift") setIsShiftDown(true);
      if (e.key === "Escape") {
        setStartPoint(null);
        setCurrentPoint(null);
        onCancel?.();
      }
    };
    const handleKeyUp = (e) => {
      if (e.key === "Shift") setIsShiftDown(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [onCancel]);

  const handlePointerMove = useCallback(
    (e) => {
      if (!isDrawing) return;
      const rect = gl.domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      const intersectPoint = new THREE.Vector3();
      const hit = raycaster.ray.intersectPlane(groundPlane, intersectPoint);

      if (hit) {
        const snap = findSnapPoint(
          intersectPoint,
          snapCandidates,
          0.5,
          0.38,
          startPoint,
          isShiftDown
        );
        setCurrentPoint(snap.point);
        setSnapType(snap.snapType);
      }
    },
    [isDrawing, gl, raycaster, camera, groundPlane, snapCandidates, startPoint, isShiftDown]
  );

  const handleClick = useCallback(
    (e) => {
      if (!isDrawing || e.button !== 0 || !currentPoint) return;
      e.stopPropagation();

      if (!startPoint) {
        setStartPoint(currentPoint.clone());
      } else {
        const length = startPoint.distanceTo(currentPoint);
        if (length >= 0.2) {
          onCreateWall?.({
            startPoint: [startPoint.x, 0, startPoint.z],
            endPoint: [currentPoint.x, 0, currentPoint.z],
            length: parseFloat(length.toFixed(2)),
            height: wallHeight,
            thickness: wallThickness,
          });
        }
        setStartPoint(null);
      }
    },
    [isDrawing, currentPoint, startPoint, wallHeight, wallThickness, onCreateWall]
  );

  if (!isDrawing) return null;

  // Active wall preview calculation
  let previewData = null;
  if (startPoint && currentPoint) {
    const length = startPoint.distanceTo(currentPoint);
    if (length > 0.05) {
      const mid = new THREE.Vector3()
        .addVectors(startPoint, currentPoint)
        .multiplyScalar(0.5);
      const angle = Math.atan2(
        currentPoint.x - startPoint.x,
        currentPoint.z - startPoint.z
      );
      previewData = {
        position: [mid.x, wallHeight / 2, mid.z],
        rotation: [0, angle, 0],
        scale: [wallThickness, wallHeight, length],
        length,
      };
    }
  }

  return (
    <group onPointerMove={handlePointerMove} onClick={handleClick}>
      {/* Invisible raycast receiver plane */}
      <mesh
        visible={false}
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[1000, 1000]} />
        <meshBasicMaterial />
      </mesh>

      {/* Snap Marker */}
      {currentPoint && (
        <group position={[currentPoint.x, 0.02, currentPoint.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.08, 0.22, 32]} />
            <meshBasicMaterial
              color={snapType === "endpoint" ? "#ff7417" : snapType === "grid" ? "#00e5ff" : "#ffffff"}
              side={THREE.DoubleSide}
              transparent
              opacity={0.85}
            />
          </mesh>
          <mesh position={[0, 0.05, 0]}>
            <sphereGeometry args={[0.04, 16, 16]} />
            <meshBasicMaterial
              color={snapType === "endpoint" ? "#ff7417" : snapType === "grid" ? "#00e5ff" : "#ffffff"}
            />
          </mesh>
        </group>
      )}

      {/* Dynamic 3D Preview Wall */}
      {previewData && (
        <group>
          <mesh
            position={previewData.position}
            rotation={previewData.rotation}
            scale={previewData.scale}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial
              color="#ff7417"
              transparent
              opacity={0.65}
              roughness={0.4}
            />
          </mesh>

          {/* Real-time Length Measurement Tag */}
          <Html position={[previewData.position[0], wallHeight + 0.35, previewData.position[2]]} center>
            <div className="px-2.5 py-1 rounded-lg bg-zinc-900/90 text-[#f5f0e8] text-xs font-mono font-bold shadow-lg border border-[#ff7417]/40 pointer-events-none whitespace-nowrap">
              {previewData.length.toFixed(2)} m
            </div>
          </Html>
        </group>
      )}
    </group>
  );
};

const EditableModel = ({
  url,
  editingMode = true,
  editorState,
  dynamicObjects,
  onObjectSelect,
  selectedObject,
  onModelLoaded,
  onTransformChange,
  transformMode,
  controlsRef,
  blueprintUrl,
  isDrawingWall,
  onCreateWall,
  onCancelDrawWall,
  wallHeight = 2.8,
  wallThickness = 0.25,
}) => {
  const { scene } = useGLTF(url);
  const modelRef = useRef();
  const [hoveredObject, setHoveredObject] = useState(null);
  const [dynamicMeshes, setDynamicMeshes] = useState(new Map());
  const [sceneBounds, setSceneBounds] = useState({ min: [-10, 0, -10], max: [10, 3, 10] });
  const [activeSelectedMesh, setActiveSelectedMesh] = useState(null);
  const hasParsedScene = useRef(false);

  // 1. Initial Scene Setup: Separation of merged geometry & unique materials
  useEffect(() => {
    if (!scene) return;

    // A. Separate composite merged wall geometry into distinct editable CAD objects (Req 1)
    const compositeMeshes = [];
    scene.traverse((child) => {
      if (child.isMesh) {
        const lower = child.name.toLowerCase();
        if (lower === "walls" || lower === "wall_group" || lower === "composite_walls") {
          compositeMeshes.push(child);
        }
      }
    });

    compositeMeshes.forEach((mergedMesh) => {
      const separated = separateGeometryConnectedComponents(mergedMesh);
      if (separated.length > 1) {
        const parent = mergedMesh.parent || scene;
        separated.forEach((m) => parent.add(m));
        parent.remove(mergedMesh);
        mergedMesh.geometry?.dispose();
      }
    });

    // B. Ensure every mesh has its own cloned, independent material instance and local origin at center
    scene.traverse((child) => {
      if (child.isMesh) {
        if (child.material && !child.userData._materialCloned) {
          child.material = child.material.clone();
          child.userData._materialCloned = true;
        }
        child.castShadow = true;
        child.receiveShadow = true;

        // Center buffer geometry to local origin and set position to geometric center.
        // This prevents double-translation when position is updated/synced from dynamicObjects,
        // and ensures TransformControls gizmo is anchored directly at the wall's center.
        if (child.geometry && child.geometry.attributes?.position && !child.userData._geometryCentered) {
          const box = new THREE.Box3().setFromObject(child);
          const center = new THREE.Vector3();
          box.getCenter(center);

          child.geometry.center();
          child.position.copy(center);
          child.userData._geometryCentered = true;
        }
      }
    });

    // C. Discover scene elements and notify parent editor state
    const discovered = {
      walls: [],
      doors: [],
      windows: [],
      rooms: [],
      bounds: { min: [-5, 0, -5], max: [5, 3, 5] },
    };

    const overallBox = new THREE.Box3().setFromObject(scene);
    discovered.bounds = {
      min: [overallBox.min.x, overallBox.min.y, overallBox.min.z],
      max: [overallBox.max.x, overallBox.max.y, overallBox.max.z],
    };
    setSceneBounds(discovered.bounds);

    let wallCounter = 0;
    scene.traverse((child) => {
      if (child.isMesh) {
        const name = child.name;
        const lower = name.toLowerCase();

        let cat = "custom";
        if (lower.includes("wall")) cat = "walls";
        else if (lower.includes("door")) cat = "doors";
        else if (lower.includes("window")) cat = "windows";
        else if (lower.includes("room") || lower.includes("floor")) cat = "rooms";

        const dims = getMeshWallDimensions(child, wallHeight, wallThickness);
        const displayName = lower.includes("wall")
          ? `Wall ${++wallCounter}`
          : name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

        const colorHex = child.material?.color
          ? `#${child.material.color.getHexString()}`
          : "#cccccc";

        discovered[cat]?.push({
          id: name,
          name: displayName,
          type: cat === "walls" ? "wall" : cat === "rooms" ? "room" : cat.slice(0, -1),
          visible: child.visible !== false,
          color: colorHex,
          roughness: child.material?.roughness ?? 0.7,
          metalness: child.material?.metalness ?? 0.1,
          opacity: child.material?.opacity ?? 1.0,
          position: dims.position,
          rotation: [
            parseFloat(child.rotation.x.toFixed(2)),
            parseFloat(child.rotation.y.toFixed(2)),
            parseFloat(child.rotation.z.toFixed(2)),
          ],
          scale: [
            parseFloat(child.scale.x.toFixed(2)),
            parseFloat(child.scale.y.toFixed(2)),
            parseFloat(child.scale.z.toFixed(2)),
          ],
          dimensions: dims.dimensions,
          bounds: dims.bounds,
          isOriginal: true,
        });
      }
    });

    if (!hasParsedScene.current && onModelLoaded) {
      hasParsedScene.current = true;
      onModelLoaded(discovered);
    }
  }, [scene, wallHeight, wallThickness, onModelLoaded]);

  // 2. Track selected mesh instance in scene
  useEffect(() => {
    if (!scene || !selectedObject) {
      setActiveSelectedMesh(null);
      return;
    }
    const mesh = scene.getObjectByName(selectedObject.id);
    setActiveSelectedMesh(mesh || null);
  }, [scene, selectedObject]);

  // 3. Handle adding dynamic newly created meshes
  useEffect(() => {
    if (!scene) return;

    const allDynamicList = [
      ...(dynamicObjects?.walls || []),
      ...(dynamicObjects?.doors || []),
      ...(dynamicObjects?.windows || []),
      ...(dynamicObjects?.rooms || []),
      ...(dynamicObjects?.custom || []),
    ];

    allDynamicList.forEach((item) => {
      if (item.isNew && !dynamicMeshes.has(item.id)) {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(item.color || "#cccccc"),
          roughness: item.roughness !== undefined ? item.roughness : 0.7,
          metalness: item.metalness !== undefined ? item.metalness : 0.1,
          transparent: item.opacity !== undefined && item.opacity < 1.0,
          opacity: item.opacity !== undefined ? item.opacity : 1.0,
        });
        const mesh = new THREE.Mesh(geometry, material);

        const pos = item.position || [0, 0, 0];
        const rot = item.rotation || [0, 0, 0];
        const scale = item.scale || [1, 1, 1];

        mesh.position.set(pos[0], pos[1], pos[2]);
        mesh.rotation.set(rot[0], rot[1], rot[2]);
        mesh.scale.set(scale[0], scale[1], scale[2]);
        mesh.name = item.id;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        scene.add(mesh);
        setDynamicMeshes((prev) => new Map(prev.set(item.id, mesh)));
      } else if (dynamicMeshes.has(item.id)) {
        const mesh = dynamicMeshes.get(item.id);
        if (mesh) {
          if (item.position) mesh.position.set(...item.position);
          if (item.rotation) mesh.rotation.set(...item.rotation);
          if (item.scale) mesh.scale.set(...item.scale);
          if (mesh.material) {
            mesh.material.color = new THREE.Color(item.color || "#cccccc");
            if (item.roughness !== undefined) mesh.material.roughness = item.roughness;
            if (item.metalness !== undefined) mesh.material.metalness = item.metalness;
            if (item.opacity !== undefined) {
              mesh.material.transparent = item.opacity < 1.0;
              mesh.material.opacity = item.opacity;
            }
            mesh.material.wireframe = !!editorState.showWireframe;
          }
        }
      }
    });

    // Remove deleted objects from scene
    dynamicMeshes.forEach((mesh, id) => {
      const stillExists = allDynamicList.some((obj) => obj.id === id);
      if (!stillExists) {
        scene.remove(mesh);
        mesh.geometry?.dispose();
        mesh.material?.dispose();
        setDynamicMeshes((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      }
    });
  }, [scene, dynamicObjects, dynamicMeshes, editorState.showWireframe]);

  // 4. Update material and visibility across all objects
  useEffect(() => {
    if (!scene) return;

    const allObjectsMap = new Map();
    [
      ...(dynamicObjects?.walls || []),
      ...(dynamicObjects?.doors || []),
      ...(dynamicObjects?.windows || []),
      ...(dynamicObjects?.rooms || []),
      ...(dynamicObjects?.custom || []),
    ].forEach((o) => allObjectsMap.set(o.id, o));

    scene.traverse((child) => {
      if (child.isMesh) {
        const objectId = child.name;
        const objectData = allObjectsMap.get(objectId);

        let objectType = "unknown";
        const lower = objectId.toLowerCase();
        if (lower.includes("wall")) objectType = "wall";
        else if (lower.includes("door")) objectType = "door";
        else if (lower.includes("window")) objectType = "window";
        else if (lower.includes("room") || lower.includes("floor")) objectType = "room";

        let categoryVisible = true;
        if (objectType === "wall" && editorState.wallsVisible === false) categoryVisible = false;
        if (objectType === "door" && editorState.doorsVisible === false) categoryVisible = false;
        if (objectType === "window" && editorState.windowsVisible === false) categoryVisible = false;
        if (objectType === "room" && editorState.roomsVisible === false) categoryVisible = false;

        // Apply visibility
        if (objectData && objectData.visible === false) {
          child.visible = false;
        } else {
          child.visible = categoryVisible;
        }

        // Apply transforms if altered in inspector
        if (objectData) {
          if (objectData.position) {
            child.position.set(objectData.position[0], objectData.position[1], objectData.position[2]);
          }
          if (objectData.rotation) {
            child.rotation.set(objectData.rotation[0], objectData.rotation[1], objectData.rotation[2]);
          }
        }

        // Apply materials
        if (child.material) {
          if (objectData && objectData.color) {
            child.material.color = new THREE.Color(objectData.color);
          }
          if (objectData && objectData.roughness !== undefined) {
            child.material.roughness = objectData.roughness;
          }
          if (objectData && objectData.metalness !== undefined) {
            child.material.metalness = objectData.metalness;
          }
          if (objectData && objectData.opacity !== undefined) {
            child.material.transparent = objectData.opacity < 1.0;
            child.material.opacity = objectData.opacity;
          }

          child.material.wireframe = !!editorState.showWireframe;

          // Emissive selection highlight (only the selected wall glows blue)
          if (selectedObject && child.name === selectedObject.id) {
            child.material.emissive = new THREE.Color(0x0088ff);
            child.material.emissiveIntensity = 0.55;
          } else if (hoveredObject === child.name) {
            child.material.emissive = new THREE.Color(0x334455);
            child.material.emissiveIntensity = 0.25;
          } else {
            child.material.emissive = new THREE.Color(0x000000);
            child.material.emissiveIntensity = 0;
          }
        }
      }
    });
  }, [
    scene,
    editingMode,
    editorState,
    selectedObject,
    hoveredObject,
    dynamicObjects,
  ]);

  const handleClick = (event) => {
    if (!editingMode || isDrawingWall || !event.object) return;
    event.stopPropagation();
    const objectName = event.object.name;

    let objectType = "element";
    let displayName = objectName;
    const lower = objectName.toLowerCase();

    if (lower.includes("wall")) {
      objectType = "wall";
      displayName = objectName.replace("wall_", "Wall ").replace("custom_wall_", "Custom Wall ");
    } else if (lower.includes("door")) {
      objectType = "door";
      displayName = objectName.replace("door_", "Door ");
    } else if (lower.includes("window")) {
      objectType = "window";
      displayName = objectName.replace("window_", "Window ");
    } else if (lower.includes("room") || lower.includes("floor")) {
      objectType = "room";
      displayName = objectName.replace("room_", "Room ");
    }

    onObjectSelect({
      id: objectName,
      name: displayName,
      type: objectType,
      mesh: event.object,
    });
  };

  const handlePointerOver = (event) => {
    if (editingMode && !isDrawingWall && event.object) {
      setHoveredObject(event.object.name);
      document.body.style.cursor = "pointer";
    }
  };

  const handlePointerOut = () => {
    if (editingMode && !isDrawingWall) {
      setHoveredObject(null);
      document.body.style.cursor = "default";
    }
  };

  // Collect snap candidates for interactive wall drawing
  const snapCandidates = useMemo(() => {
    const sceneMeshes = [];
    if (scene) {
      scene.traverse((c) => {
        if (c.isMesh && c.name.toLowerCase().includes("wall")) {
          sceneMeshes.push(c);
        }
      });
    }
    return collectWallSnapCandidates(dynamicObjects?.walls || [], sceneMeshes);
  }, [scene, dynamicObjects]);

  return (
    <>
      <primitive
        ref={modelRef}
        object={scene}
        scale={1}
        position={[0, 0, 0]}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      />

      {/* Blueprint Ground Overlay (Req 3) */}
      <BlueprintGroundOverlay
        imageUrl={blueprintUrl}
        bounds={sceneBounds}
        opacity={editorState.blueprintOpacity ?? 0.65}
        visible={editorState.showBlueprintOverlay !== false}
      />

      {/* Interactive Transform Gizmo for Move / Rotate / Scale (Req 1) */}
      {activeSelectedMesh &&
        (transformMode === TRANSFORM_MODES.TRANSLATE ||
          transformMode === TRANSFORM_MODES.ROTATE ||
          transformMode === TRANSFORM_MODES.SCALE) && (
          <TransformControls
            object={activeSelectedMesh}
            mode={
              transformMode === TRANSFORM_MODES.ROTATE
                ? "rotate"
                : transformMode === TRANSFORM_MODES.SCALE
                ? "scale"
                : "translate"
            }
            onMouseDown={() => {
              if (controlsRef.current) controlsRef.current.enabled = false;
            }}
            onMouseUp={() => {
              if (controlsRef.current) controlsRef.current.enabled = true;
              if (activeSelectedMesh) {
                onTransformChange?.(activeSelectedMesh.name, {
                  position: [
                    parseFloat(activeSelectedMesh.position.x.toFixed(2)),
                    parseFloat(activeSelectedMesh.position.y.toFixed(2)),
                    parseFloat(activeSelectedMesh.position.z.toFixed(2)),
                  ],
                  rotation: [
                    parseFloat(activeSelectedMesh.rotation.x.toFixed(2)),
                    parseFloat(activeSelectedMesh.rotation.y.toFixed(2)),
                    parseFloat(activeSelectedMesh.rotation.z.toFixed(2)),
                  ],
                  scale: [
                    parseFloat(activeSelectedMesh.scale.x.toFixed(2)),
                    parseFloat(activeSelectedMesh.scale.y.toFixed(2)),
                    parseFloat(activeSelectedMesh.scale.z.toFixed(2)),
                  ],
                });
              }
            }}
          />
        )}

      {/* Interactive Wall Drawing Plane & Snapper (+ Wall) (Req 2) */}
      <WallDrawingController
        isDrawing={isDrawingWall}
        snapCandidates={snapCandidates}
        wallHeight={wallHeight}
        wallThickness={wallThickness}
        onCreateWall={onCreateWall}
        onCancel={onCancelDrawWall}
      />
    </>
  );
};

const CameraController = forwardRef(({ isDrawingWall }, ref) => {
  const { camera, gl, scene } = useThree();
  const controlsRef = useRef();

  useImperativeHandle(ref, () => ({
    controls: controlsRef.current,
    resetCamera: () => {
      camera.position.set(15, 15, 15);
      camera.lookAt(0, 0, 0);
      if (controlsRef.current) controlsRef.current.reset();
    },
    setTopView: () => {
      camera.position.set(0, 32, 0);
      camera.lookAt(0, 0, 0);
      if (controlsRef.current) controlsRef.current.update();
    },
    setFrontView: () => {
      camera.position.set(0, 0, 25);
      camera.lookAt(0, 0, 0);
      if (controlsRef.current) controlsRef.current.update();
    },
    setSideView: () => {
      camera.position.set(25, 0, 0);
      camera.lookAt(0, 0, 0);
      if (controlsRef.current) controlsRef.current.update();
    },
    takeScreenshot: () => {
      gl.render(scene, camera);
      const dataUrl = gl.domElement.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `planvista3d_render_${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    },
  }));

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.8}
      panSpeed={0.8}
      zoomSpeed={1.0}
      minDistance={1}
      maxDistance={150}
      makeDefault
      mouseButtons={{
        LEFT: isDrawingWall ? -1 : THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
    />
  );
});

const CadViewport = forwardRef(
  (
    {
      modelUrl,
      blueprintUrl,
      editorState,
      dynamicObjects,
      selectedObject,
      onObjectSelect,
      transformMode,
      isDrawingWall,
      onCreateWall,
      onCancelDrawWall,
      onTransformChange,
      onModelLoaded,
      wallHeight = 2.8,
      wallThickness = 0.25,
    },
    ref
  ) => {
    const cameraRef = useRef();
    const { theme } = useTheme();
    const isDark = theme === "dark";

    useImperativeHandle(ref, () => ({
      resetCamera: () => cameraRef.current?.resetCamera(),
      setTopView: () => cameraRef.current?.setTopView(),
      setFrontView: () => cameraRef.current?.setFrontView(),
      setSideView: () => cameraRef.current?.setSideView(),
      takeScreenshot: () => cameraRef.current?.takeScreenshot(),
    }));

    return (
      <div className="relative w-full h-full bg-[#f4eee6] dark:bg-[#141311]">
        {/* Wall Drawing Status HUD Banner */}
        {isDrawingWall && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2 rounded-xl bg-orange-600 text-white shadow-xl animate-in fade-in slide-in-from-top-2 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            <span>Click ground to anchor wall start, move cursor to set length, click again to finish.</span>
            <button
              onClick={onCancelDrawWall}
              className="ml-2 px-2 py-0.5 rounded-lg bg-orange-700 hover:bg-orange-800 text-[11px] font-bold cursor-pointer"
            >
              Cancel (Esc)
            </button>
          </div>
        )}

        <Canvas
          shadows
          camera={{ position: [15, 15, 15], fov: 45 }}
          gl={{ preserveDrawingBuffer: true, antialias: true }}
          className="w-full h-full"
        >
          {/* Studio Lighting */}
          <ambientLight intensity={isDark ? 0.8 : 0.7} />
          <directionalLight
            position={[20, 30, 20]}
            intensity={1.2}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          <directionalLight position={[-15, 20, -15]} intensity={0.5} />

          {/* Reference Grid */}
          {editorState.showGrid && (
            <Grid
              infiniteGrid
              cellSize={1}
              sectionSize={5}
              cellColor={isDark ? "#2b2a27" : "#d3c7b5"}
              sectionColor={isDark ? "#39342f" : "#a39682"}
              fadeDistance={60}
              fadeStrength={1.5}
            />
          )}

          <Suspense
            fallback={
              <Html center>
                <div className="flex flex-col items-center gap-2 p-4 bg-white/90 dark:bg-[#1d1b19]/90 backdrop-blur-md rounded-2xl border border-zinc-200 dark:border-[#39342f] shadow-xl">
                  <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-semibold text-zinc-800 dark:text-[#f5f0e8]">
                    Mounting 3D Geometry...
                  </span>
                </div>
              </Html>
            }
          >
            {modelUrl && (
              <ModelErrorBoundary>
                <EditableModel
                  url={modelUrl}
                  blueprintUrl={blueprintUrl}
                  editorState={editorState}
                  dynamicObjects={dynamicObjects}
                  selectedObject={selectedObject}
                  onObjectSelect={onObjectSelect}
                  onModelLoaded={onModelLoaded}
                  onTransformChange={onTransformChange}
                  transformMode={transformMode}
                  controlsRef={cameraRef}
                  isDrawingWall={isDrawingWall}
                  onCreateWall={onCreateWall}
                  onCancelDrawWall={onCancelDrawWall}
                  wallHeight={wallHeight}
                  wallThickness={wallThickness}
                />
              </ModelErrorBoundary>
            )}
            <Environment preset="apartment" />
          </Suspense>

          <CameraController ref={cameraRef} isDrawingWall={isDrawingWall} />
        </Canvas>
      </div>
    );
  }
);

export default CadViewport;
