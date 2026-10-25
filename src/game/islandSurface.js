import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const WATER_LEVEL = 1.5;
const SAND_LEVEL = 4;
const VEGETATION_TOP = 13;
const GRID_SIZE = 2.5;

function addTriangleToGrid(grid, triangle) {
  const minX = Math.min(triangle.a.x, triangle.b.x, triangle.c.x);
  const maxX = Math.max(triangle.a.x, triangle.b.x, triangle.c.x);
  const minZ = Math.min(triangle.a.z, triangle.b.z, triangle.c.z);
  const maxZ = Math.max(triangle.a.z, triangle.b.z, triangle.c.z);
  const minCellX = Math.floor(minX / GRID_SIZE);
  const maxCellX = Math.floor(maxX / GRID_SIZE);
  const minCellZ = Math.floor(minZ / GRID_SIZE);
  const maxCellZ = Math.floor(maxZ / GRID_SIZE);
  const cellCount = (maxCellX - minCellX + 1) * (maxCellZ - minCellZ + 1);
  if (cellCount > 512) return;
  for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      const key = `${cellX},${cellZ}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(triangle);
    }
  }
}

function triangleHeightAt(x, z, { a, b, c }) {
  const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
  if (Math.abs(denominator) < 1e-8) return null;
  const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / denominator;
  const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / denominator;
  const w = 1 - u - v;
  if (u < -1e-5 || v < -1e-5 || w < -1e-5) return null;
  return u * a.y + v * b.y + w * c.y;
}

export async function loadIslandSurface(THREE, scene) {
  const island = await new OBJLoader().loadAsync('/assets/island/island.obj');
  const initialBounds = new THREE.Box3().setFromObject(island);
  const center = initialBounds.getCenter(new THREE.Vector3());
  // The OBJ is Y-up already. Center only the horizontal X/Z footprint; never recenter Y,
  // because the authored elevation thresholds and sea level are expressed in model units.
  island.position.x -= center.x;
  island.position.z -= center.z;
  island.updateMatrixWorld(true);

  const beach = new THREE.Color(0xb8a27a);
  const grass = new THREE.Color(0x587b42);
  const rock = new THREE.Color(0x777a78);
  const color = new THREE.Color();
  const grid = new Map();

  island.traverse((object) => {
    if (!object.isMesh || !object.geometry?.attributes?.position) return;
    const geometry = object.geometry;
    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const vertex = new THREE.Vector3();
    for (let i = 0; i < positions.count; i += 1) {
      vertex.fromBufferAttribute(positions, i);
      object.localToWorld(vertex);
      if (vertex.y < SAND_LEVEL) color.copy(beach);
      else if (vertex.y <= VEGETATION_TOP) color.copy(grass);
      else color.copy(rock);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    object.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0,
    });
    object.castShadow = true;
    object.receiveShadow = true;

    const indices = geometry.index;
    const vertexCount = indices ? indices.count : positions.count;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i + 2 < vertexCount; i += 3) {
      const ia = indices ? indices.getX(i) : i;
      const ib = indices ? indices.getX(i + 1) : i + 1;
      const ic = indices ? indices.getX(i + 2) : i + 2;
      a.fromBufferAttribute(positions, ia); object.localToWorld(a);
      b.fromBufferAttribute(positions, ib); object.localToWorld(b);
      c.fromBufferAttribute(positions, ic); object.localToWorld(c);
      addTriangleToGrid(grid, { a: a.clone(), b: b.clone(), c: c.clone() });
    }
  });

  const bounds = new THREE.Box3().setFromObject(island);
  const size = bounds.getSize(new THREE.Vector3());
  const sampleHeight = (x, z) => {
    const candidates = grid.get(`${Math.floor(x / GRID_SIZE)},${Math.floor(z / GRID_SIZE)}`);
    if (!candidates) return null;
    let highest = -Infinity;
    for (const triangle of candidates) {
      const height = triangleHeightAt(x, z, triangle);
      if (height !== null && height > highest) highest = height;
    }
    return Number.isFinite(highest) ? highest : null;
  };

  scene.add(island);
  return { island, bounds, size, sampleHeight, waterLevel: WATER_LEVEL };
}
