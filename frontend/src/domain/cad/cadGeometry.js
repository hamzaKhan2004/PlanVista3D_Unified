import * as THREE from "three";

/**
 * Separates a composite/merged BufferGeometry mesh into distinct, independent
 * connected-component meshes without altering vertex coordinates, normals, or geometry topology.
 * Fulfills Requirement 1 for handling imported GLBs with merged wall geometry.
 */
export function separateGeometryConnectedComponents(mesh) {
  if (!mesh || !mesh.geometry) return [mesh];

  const geometry = mesh.geometry;
  const posAttr = geometry.attributes.position;
  if (!posAttr || posAttr.count === 0) return [mesh];

  const totalVerts = posAttr.count;
  const isIndexed = !!geometry.index;
  const indexAttr = geometry.index;
  const numFaces = isIndexed ? Math.floor(indexAttr.count / 3) : Math.floor(totalVerts / 3);

  if (numFaces <= 1) return [mesh];

  const getIndex = (faceVertexIdx) =>
    isIndexed ? indexAttr.getX(faceVertexIdx) : faceVertexIdx;

  // Spatial hashing to find coincident vertices across triangles (0.5mm precision)
  const posMap = new Map();
  const vertexCanonicalId = new Int32Array(totalVerts);

  for (let i = 0; i < totalVerts; i++) {
    const x = Math.round(posAttr.getX(i) * 2000);
    const y = Math.round(posAttr.getY(i) * 2000);
    const z = Math.round(posAttr.getZ(i) * 2000);
    const key = `${x}_${y}_${z}`;
    let canon = posMap.get(key);
    if (canon === undefined) {
      canon = i;
      posMap.set(key, canon);
    }
    vertexCanonicalId[i] = canon;
  }

  // Disjoint Set Union (DSU / Union-Find) on faces
  const parent = new Int32Array(numFaces);
  for (let f = 0; f < numFaces; f++) parent[f] = f;

  const find = (i) => {
    let root = i;
    while (root !== parent[root]) {
      root = parent[root];
    }
    let curr = i;
    while (curr !== root) {
      const next = parent[curr];
      parent[curr] = root;
      curr = next;
    }
    return root;
  };

  const union = (i, j) => {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) {
      parent[rootI] = rootJ;
    }
  };

  // Map canonical vertices to faces using them
  const vertToFaces = new Map();
  for (let f = 0; f < numFaces; f++) {
    const v0 = vertexCanonicalId[getIndex(f * 3)];
    const v1 = vertexCanonicalId[getIndex(f * 3 + 1)];
    const v2 = vertexCanonicalId[getIndex(f * 3 + 2)];

    [v0, v1, v2].forEach((v) => {
      let faceList = vertToFaces.get(v);
      if (!faceList) {
        faceList = [];
        vertToFaces.set(v, faceList);
      }
      faceList.push(f);
      if (faceList.length > 1) {
        union(faceList[0], f);
      }
    });
  }

  // Group face indices by component root
  const componentFaces = new Map();
  for (let f = 0; f < numFaces; f++) {
    const root = find(f);
    let list = componentFaces.get(root);
    if (!list) {
      list = [];
      componentFaces.set(root, list);
    }
    list.push(f);
  }

  // If all faces belong to a single connected prism, no need to separate
  if (componentFaces.size <= 1) return [mesh];

  const separatedMeshes = [];
  let compIdx = 0;

  for (const faces of componentFaces.values()) {
    // Skip tiny degenerate noise fragments (< 4 faces)
    if (faces.length < 4) continue;

    const newGeo = new THREE.BufferGeometry();
    const newPositions = [];
    const newNormals = geometry.attributes.normal ? [] : null;
    const newUvs = geometry.attributes.uv ? [] : null;
    const newIndices = [];
    const oldToNewMap = new Map();

    faces.forEach((f) => {
      for (let k = 0; k < 3; k++) {
        const oldIdx = getIndex(f * 3 + k);
        let newIdx = oldToNewMap.get(oldIdx);
        if (newIdx === undefined) {
          newIdx = newPositions.length / 3;
          oldToNewMap.set(oldIdx, newIdx);
          newPositions.push(
            posAttr.getX(oldIdx),
            posAttr.getY(oldIdx),
            posAttr.getZ(oldIdx)
          );
          if (newNormals) {
            newNormals.push(
              geometry.attributes.normal.getX(oldIdx),
              geometry.attributes.normal.getY(oldIdx),
              geometry.attributes.normal.getZ(oldIdx)
            );
          }
          if (newUvs) {
            newUvs.push(
              geometry.attributes.uv.getX(oldIdx),
              geometry.attributes.uv.getY(oldIdx)
            );
          }
        }
        newIndices.push(newIdx);
      }
    });

    newGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(newPositions, 3)
    );
    if (newNormals) {
      newGeo.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(newNormals, 3)
      );
    } else {
      newGeo.computeVertexNormals();
    }
    if (newUvs) {
      newGeo.setAttribute("uv", new THREE.Float32BufferAttribute(newUvs, 2));
    }
    newGeo.setIndex(newIndices);
    newGeo.computeBoundingBox();

    // Give each separated wall its own independent material instance
    const newMat = mesh.material
      ? mesh.material.clone()
      : new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7 });

    const newMesh = new THREE.Mesh(newGeo, newMat);
    newMesh.name = `wall_${compIdx}`;
    newMesh.position.copy(mesh.position);
    newMesh.rotation.copy(mesh.rotation);
    newMesh.scale.copy(mesh.scale);
    newMesh.castShadow = true;
    newMesh.receiveShadow = true;
    newMesh.userData = { ...mesh.userData, isSeparated: true, originalId: mesh.name };

    separatedMeshes.push(newMesh);
    compIdx++;
  }

  return separatedMeshes.length > 0 ? separatedMeshes : [mesh];
}

/**
 * Calculates actual architectural dimensions (length, height, thickness)
 * and center position from a wall mesh.
 */
export function getMeshWallDimensions(mesh, defaultHeight = 2.8, defaultThickness = 0.25) {
  if (!mesh) {
    return {
      position: [0, 0, 0],
      dimensions: { length: 3, height: defaultHeight, thickness: defaultThickness },
      bounds: { min: [0, 0, 0], max: [0, 0, 0] },
    };
  }

  const box = new THREE.Box3().setFromObject(mesh);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  const height = size.y > 0.05 ? parseFloat(size.y.toFixed(2)) : defaultHeight;

  let length;
  let thickness;
  const sx = size.x;
  const sz = size.z;

  if (Math.abs(sx - sz) < 0.08 && sx > 0.6) {
    // Diagonal or angled wall segment
    length = parseFloat(Math.hypot(sx, sz).toFixed(2));
    thickness = defaultThickness;
  } else if (sx >= sz) {
    length = parseFloat(Math.max(0.2, sx).toFixed(2));
    thickness = sz > 0.02 ? parseFloat(sz.toFixed(2)) : defaultThickness;
  } else {
    length = parseFloat(Math.max(0.2, sz).toFixed(2));
    thickness = sx > 0.02 ? parseFloat(sx.toFixed(2)) : defaultThickness;
  }

  return {
    position: [
      parseFloat(center.x.toFixed(2)),
      parseFloat(center.y.toFixed(2)),
      parseFloat(center.z.toFixed(2)),
    ],
    dimensions: {
      length: Math.max(0.1, length),
      height: Math.max(0.1, height),
      thickness: Math.max(0.05, thickness),
    },
    bounds: {
      min: [parseFloat(box.min.x.toFixed(2)), parseFloat(box.min.y.toFixed(2)), parseFloat(box.min.z.toFixed(2))],
      max: [parseFloat(box.max.x.toFixed(2)), parseFloat(box.max.y.toFixed(2)), parseFloat(box.max.z.toFixed(2))],
    },
  };
}

/**
 * Collects snap point candidates (wall endpoints and corners) from existing walls.
 */
export function collectWallSnapCandidates(wallsList = [], sceneMeshes = []) {
  const points = [];
  const added = new Set();

  const addPoint = (x, z, label = "corner") => {
    const rx = Math.round(x * 100) / 100;
    const rz = Math.round(z * 100) / 100;
    const key = `${rx}_${rz}`;
    if (!added.has(key)) {
      added.add(key);
      points.push({ x: rx, z: rz, label });
    }
  };

  // 1. From dynamic objects (startPoint/endPoint or bounds)
  wallsList.forEach((wall) => {
    if (wall.visible === false) return;
    if (wall.startPoint && wall.endPoint) {
      addPoint(wall.startPoint[0], wall.startPoint[2], "endpoint");
      addPoint(wall.endPoint[0], wall.endPoint[2], "endpoint");
    } else if (wall.bounds) {
      addPoint(wall.bounds.min[0], wall.bounds.min[2], "corner");
      addPoint(wall.bounds.max[0], wall.bounds.min[2], "corner");
      addPoint(wall.bounds.max[0], wall.bounds.max[2], "corner");
      addPoint(wall.bounds.min[0], wall.bounds.max[2], "corner");
    } else if (wall.position && wall.scale) {
      const px = wall.position[0];
      const pz = wall.position[2];
      const hw = (wall.scale[0] || 1) / 2;
      const hl = (wall.scale[2] || 1) / 2;
      addPoint(px - hw, pz - hl, "corner");
      addPoint(px + hw, pz - hl, "corner");
      addPoint(px + hw, pz + hl, "corner");
      addPoint(px - hw, pz + hl, "corner");
    }
  });

  // 2. From scene meshes if available
  sceneMeshes.forEach((mesh) => {
    if (!mesh.visible) return;
    const box = new THREE.Box3().setFromObject(mesh);
    addPoint(box.min.x, box.min.z, "corner");
    addPoint(box.max.x, box.min.z, "corner");
    addPoint(box.max.x, box.max.z, "corner");
    addPoint(box.min.x, box.max.z, "corner");
  });

  return points;
}

/**
 * Snaps a 3D raycasted ground coordinate to the nearest wall corner, endpoint, or grid line.
 */
export function findSnapPoint(
  rawPoint,
  snapCandidates = [],
  gridStep = 0.5,
  snapThreshold = 0.35,
  startPoint = null,
  isShiftPressed = false
) {
  let targetX = rawPoint.x;
  let targetZ = rawPoint.z;
  let snapType = null;
  let snappedDist = Infinity;

  // 1. Check nearby wall endpoints & corners
  for (const cand of snapCandidates) {
    const dist = Math.hypot(rawPoint.x - cand.x, rawPoint.z - cand.z);
    if (dist <= snapThreshold && dist < snappedDist) {
      targetX = cand.x;
      targetZ = cand.z;
      snapType = cand.label || "endpoint";
      snappedDist = dist;
    }
  }

  // 2. If not snapped to a corner, check grid snapping
  if (!snapType && gridStep > 0) {
    const gridX = Math.round(rawPoint.x / gridStep) * gridStep;
    const gridZ = Math.round(rawPoint.z / gridStep) * gridStep;
    const distToGrid = Math.hypot(rawPoint.x - gridX, rawPoint.z - gridZ);
    if (distToGrid <= snapThreshold * 0.75) {
      targetX = gridX;
      targetZ = gridZ;
      snapType = "grid";
    }
  }

  // 3. Orthogonal angle snapping if startPoint exists (Shift or near-axis alignment)
  if (startPoint) {
    const dx = Math.abs(targetX - startPoint.x);
    const dz = Math.abs(targetZ - startPoint.z);

    if (isShiftPressed || dx < 0.25 || dz < 0.25) {
      if (dx >= dz) {
        // Horizontal wall along X axis
        targetZ = startPoint.z;
        if (!snapType) snapType = "axis-x";
      } else {
        // Vertical wall along Z axis
        targetX = startPoint.x;
        if (!snapType) snapType = "axis-z";
      }
    }
  }

  return {
    point: new THREE.Vector3(targetX, 0, targetZ),
    snapType,
  };
}
