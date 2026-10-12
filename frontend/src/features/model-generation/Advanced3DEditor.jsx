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
import { Color, BoxGeometry, MeshStandardMaterial, Mesh } from "three";

const EditableModel = ({
  url,
  editingMode,
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
    if (scene && dynamicObjects?.walls) {
      dynamicObjects.walls.forEach((wall) => {
        if (wall.isNew && !dynamicMeshes.has(wall.id)) {
          const geometry = new BoxGeometry(
            wall.scale[0],
            wall.scale[1],
            wall.scale[2]
          );
          const material = new MeshStandardMaterial({
            color: new Color(wall.color),
          });
          const mesh = new Mesh(geometry, material);

          mesh.position.set(
            wall.position[0],
            wall.position[1],
            wall.position[2]
          );
          mesh.name = wall.id;
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          scene.add(mesh);
          setDynamicMeshes((prev) => new Map(prev.set(wall.id, mesh)));
        }
      });

      // Remove deleted objects from scene
      dynamicMeshes.forEach((mesh, id) => {
        const stillExists = [
          ...(dynamicObjects.walls || []),
          ...(dynamicObjects.doors || []),
          ...(dynamicObjects.windows || []),
          ...(dynamicObjects.rooms || []),
        ].some((obj) => obj.id === id);

        if (!stillExists) {
          scene.remove(mesh);
          mesh.geometry?.dispose();
          mesh.material?.dispose();
          setDynamicMeshes((prev) => {
            const newMap = new Map(prev);
            newMap.delete(id);
            return newMap;
          });
        }
      });
    }
  }, [scene, dynamicObjects, dynamicMeshes]);

  // Handle material and visibility updates
  useEffect(() => {
    if (scene && editingMode) {
      scene.traverse((child) => {
        if (child.isMesh) {
          const objectId = child.name;

          let objectData = null;
          let objectType = "";

          if (objectId.includes("wall")) {
            objectData = dynamicObjects?.walls?.find((w) => w.id === objectId);
            objectType = "wall";
          } else if (objectId.includes("door")) {
            objectData = dynamicObjects?.doors?.find((d) => d.id === objectId);
            objectType = "door";
          } else if (objectId.includes("window")) {
            objectData = dynamicObjects?.windows?.find((w) => w.id === objectId);
            objectType = "window";
          } else if (objectId.includes("room")) {
            objectData = dynamicObjects?.rooms?.find((r) => r.id === objectId);
            objectType = "room";
          }

          if (objectData) {
            child.visible = objectData.visible;
            if (child.material) {
              child.material.color = new Color(objectData.color);
            }
          }

          // Apply category visibility
          if (objectType === "wall" && !editorState.wallsVisible) child.visible = false;
          if (objectType === "door" && !editorState.doorsVisible) child.visible = false;
          if (objectType === "window" && !editorState.windowsVisible) child.visible = false;
          if (objectType === "room" && !editorState.roomsVisible) child.visible = false;

          // Wireframe mode
          if (child.material) {
            child.material.wireframe = editorState.showWireframe;
          }

          // Highlights for selection
          if (selectedObject && child.name === selectedObject.id) {
            if (child.material) {
              child.material.emissive = new Color(0xf97316); // Orange highlight for selection
              child.material.emissiveIntensity = 0.35;
            }
          } else if (hoveredObject === child.name) {
            if (child.material) {
              child.material.emissive = new Color(0x555555);
              child.material.emissiveIntensity = 0.15;
            }
          } else {
            if (child.material) {
              child.material.emissive = new Color(0x000000);
              child.material.emissiveIntensity = 0;
            }
          }
        }
      });
    }
  }, [
    scene,
    editingMode,
    editorState,
    selectedObject,
    hoveredObject,
    dynamicObjects,
  ]);

  const handleClick = (event) => {
    if (editingMode && event.object) {
      event.stopPropagation();
      const objectName = event.object.name;

      let objectType = "unknown";
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
      } else if (objectName.includes("room")) {
        objectType = "room";
        displayName = objectName.replace("room_", "Room ");
      }

      onObjectSelect({
        id: objectName,
        name: displayName,
        type: objectType,
        mesh: event.object,
      });
    }
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
  const { camera, gl } = useThree();
  const controlsRef = useRef();

  useImperativeHandle(ref, () => ({
    resetCamera: () => {
      camera.position.set(15, 15, 15);
      camera.lookAt(0, 0, 0);
      if (controlsRef.current) controlsRef.current.reset();
    },
    setTopView: () => {
      camera.position.set(0, 25, 0);
      camera.lookAt(0, 0, 0);
      if (controlsRef.current) controlsRef.current.update();
    },
    setFrontView: () => {
      camera.position.set(0, 5, 25);
      camera.lookAt(0, 0, 0);
      if (controlsRef.current) controlsRef.current.update();
    },
    setSideView: () => {
      camera.position.set(25, 5, 0);
      camera.lookAt(0, 0, 0);
      if (controlsRef.current) controlsRef.current.update();
    },
    takeScreenshot: () => {
      const link = document.createElement("a");
      link.setAttribute("download", `planvista-3d-cad-${Date.now()}.png`);
      link.setAttribute(
        "href",
        gl.domElement
          .toDataURL("image/png")
          .replace("image/png", "image/octet-stream")
      );
      link.click();
    },
  }));

  return (
    <OrbitControls
      ref={controlsRef}
      camera={camera}
      domElement={gl.domElement}
      enablePan={true}
      enableZoom={true}
      enableRotate={true}
      minDistance={3}
      maxDistance={120}
      enableDamping={true}
      dampingFactor={0.05}
    />
  );
});

const LoadingFallback = () => (
  <mesh>
    <boxGeometry args={[1, 1, 1]} />
    <meshStandardMaterial color="#f0ede6" />
    <Html center>
      <div className="bg-white/95 px-5 py-3 rounded-2xl shadow-lg border border-[#eae4dc] text-center min-w-[160px] backdrop-blur-md">
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <span className="text-xs font-semibold text-zinc-800">Loading 3D Model...</span>
      </div>
    </Html>
  </mesh>
);

const Advanced3DEditor = forwardRef(
  (
    {
      modelUrl,
      editingMode = true,
      editorState = {},
      dynamicObjects = { walls: [], doors: [], windows: [], rooms: [] },
      onObjectSelect = () => {},
      selectedObject = null,
    },
    ref
  ) => {
    const cameraControlsRef = useRef();

    useImperativeHandle(ref, () => ({
      resetCamera: () => cameraControlsRef.current?.resetCamera(),
      setTopView: () => cameraControlsRef.current?.setTopView(),
      setFrontView: () => cameraControlsRef.current?.setFrontView(),
      setSideView: () => cameraControlsRef.current?.setSideView(),
      takeScreenshot: () => cameraControlsRef.current?.takeScreenshot(),
    }));

    const getLightingIntensity = () => {
      switch (editorState?.lighting) {
        case "bright":
          return { ambient: 0.9, directional: 2.2 };
        case "soft":
          return { ambient: 0.6, directional: 1.2 };
        case "dramatic":
          return { ambient: 0.2, directional: 3.0 };
        default:
          return { ambient: 0.5, directional: 1.6 };
      }
    };

    const lightIntensity = getLightingIntensity();

    return (
      <div className="w-full h-full relative">
        <Canvas
          camera={{ position: [15, 15, 15], fov: 60 }}
          shadows
          gl={{ preserveDrawingBuffer: true, antialias: true }}
        >
          <Suspense fallback={<LoadingFallback />}>
            {/* Dynamic Lighting */}
            <ambientLight intensity={lightIntensity.ambient} />
            <directionalLight
              position={[10, 20, 10]}
              intensity={lightIntensity.directional}
              castShadow
              shadow-mapSize-width={2048}
              shadow-mapSize-height={2048}
            />
            <pointLight position={[0, 0, 10]} intensity={0.4} />

            {/* City Preset Environment */}
            <Environment preset="city" />

            {/* Architectural Grid */}
            {editorState?.showGrid !== false && (
              <Grid
                infiniteGrid
                fadeDistance={60}
                fadeStrength={4}
                cellColor="#cccccc"
                sectionColor="#999999"
                cellThickness={0.6}
                sectionThickness={1.2}
              />
            )}

            {/* 3D Model with Dynamic Elements */}
            <EditableModel
              url={modelUrl}
              editingMode={editingMode}
              editorState={editorState}
              dynamicObjects={dynamicObjects}
              onObjectSelect={onObjectSelect}
              selectedObject={selectedObject}
            />

            {/* Camera Controls */}
            <CameraController ref={cameraControlsRef} />
          </Suspense>
        </Canvas>
      </div>
    );
  }
);

export default Advanced3DEditor;
