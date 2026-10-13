import React, {
  Suspense,
  useRef,
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  useGLTF,
  Environment,
  Grid,
  Html,
} from "@react-three/drei";
import { Color, BoxGeometry, MeshStandardMaterial, Mesh, Vector3 } from "three";
import { CAMERA_PRESETS } from "../../domain/cad/cadTypes";
import { useTheme } from "../../presentation/layout/AppLayout";

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

const EditableModel = ({
  url,
  editingMode = true,
  editorState,
  dynamicObjects,
  onObjectSelect,
  selectedObject,
}) => {
  const { scene } = useGLTF(url);
  const modelRef = useRef();
  const [hoveredObject, setHoveredObject] = useState(null);
  const [dynamicMeshes, setDynamicMeshes] = useState(new Map());

  // Handle adding new objects to the scene
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
        // Create unit geometry; actual dimensions driven via mesh.scale for easy updates
        const geometry = new BoxGeometry(1, 1, 1);
        const material = new MeshStandardMaterial({
          color: new Color(item.color || "#cccccc"),
          roughness: item.roughness !== undefined ? item.roughness : 0.7,
          metalness: item.metalness !== undefined ? item.metalness : 0.1,
          transparent: item.opacity !== undefined && item.opacity < 1.0,
          opacity: item.opacity !== undefined ? item.opacity : 1.0,
        });
        const mesh = new Mesh(geometry, material);

        const pos = item.position || [0, 0, 0];
        const scale = item.scale || [1, 1, 1];
        mesh.position.set(pos[0], pos[1], pos[2]);
        mesh.scale.set(scale[0], scale[1], scale[2]);
        mesh.name = item.id;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        scene.add(mesh);
        setDynamicMeshes((prev) => new Map(prev.set(item.id, mesh)));
      } else if (item.isNew && dynamicMeshes.has(item.id)) {
        // Update existing dynamic mesh transform and material
        const mesh = dynamicMeshes.get(item.id);
        if (mesh) {
          if (item.position) mesh.position.set(...item.position);
          // Apply scale directly to the mesh transform (geometry was created at unit size reference)
          if (item.scale) mesh.scale.set(item.scale[0], item.scale[1], item.scale[2]);
          if (mesh.material) {
            mesh.material.color = new Color(item.color || "#cccccc");
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

  // Handle material and visibility updates across both original GLB and dynamic meshes
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
        if (objectId.includes("wall")) objectType = "wall";
        else if (objectId.includes("door")) objectType = "door";
        else if (objectId.includes("window")) objectType = "window";
        else if (objectId.includes("room") || objectId.includes("Floor")) objectType = "room";

        // Category visibility overrides
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

        // Apply color & material properties
        if (child.material) {
          if (objectData && objectData.color) {
            child.material.color = new Color(objectData.color);
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

          // Wireframe mode
          child.material.wireframe = !!editorState.showWireframe;

          // Selection highlight: blue emissive glow
          if (selectedObject && child.name === selectedObject.id) {
            child.material.emissive = new Color(0x0088ff);
            child.material.emissiveIntensity = 0.45;
          } else if (hoveredObject === child.name) {
            child.material.emissive = new Color(0x334455);
            child.material.emissiveIntensity = 0.2;
          } else {
            child.material.emissive = new Color(0x000000);
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
    if (!editingMode || !event.object) return;
    event.stopPropagation();
    const objectName = event.object.name;

    let objectType = "element";
    let displayName = objectName;

    if (objectName.includes("wall")) {
      objectType = "wall";
      displayName = objectName.replace("wall_", "Wall ");
    } else if (objectName.includes("door")) {
      objectType = "door";
      displayName = objectName.replace("door_", "Door ");
    } else if (objectName.includes("window")) {
      objectType = "window";
      displayName = objectName.replace("window_", "Window ");
    } else if (objectName.includes("room") || objectName.includes("Floor")) {
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
    if (editingMode && event.object) {
      setHoveredObject(event.object.name);
      document.body.style.cursor = "pointer";
    }
  };

  const handlePointerOut = () => {
    if (editingMode) {
      setHoveredObject(null);
      document.body.style.cursor = "default";
    }
  };

  return (
    <primitive
      ref={modelRef}
      object={scene}
      scale={1}
      position={[0, 0, 0]}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    />
  );
};

const CameraController = forwardRef((props, ref) => {
  const { camera, gl, scene } = useThree();
  const controlsRef = useRef();

  useImperativeHandle(ref, () => ({
    resetCamera: () => {
      camera.position.set(15, 15, 15);
      camera.lookAt(0, 0, 0);
      if (controlsRef.current) controlsRef.current.reset();
    },
    setTopView: () => {
      camera.position.set(0, 30, 0);
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
    />
  );
});

const CadViewport = forwardRef(
  (
    {
      modelUrl,
      editorState,
      dynamicObjects,
      selectedObject,
      onObjectSelect,
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
        <Canvas
          shadows
          camera={{ position: [15, 15, 15], fov: 45 }}
          gl={{ preserveDrawingBuffer: true, antialias: true }}
          className="w-full h-full"
        >
          {/* Ambient and Studio Lighting */}
          <ambientLight intensity={isDark ? 0.8 : 0.7} />
          <directionalLight
            position={[20, 30, 20]}
            intensity={1.2}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          <directionalLight position={[-15, 20, -15]} intensity={0.5} />

          {/* Grid Helper */}
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
                  editorState={editorState}
                  dynamicObjects={dynamicObjects}
                  selectedObject={selectedObject}
                  onObjectSelect={onObjectSelect}
                />
              </ModelErrorBoundary>
            )}
            <Environment preset="apartment" />
          </Suspense>

          <CameraController ref={cameraRef} />
        </Canvas>
      </div>
    );
  }
);

export default CadViewport;
