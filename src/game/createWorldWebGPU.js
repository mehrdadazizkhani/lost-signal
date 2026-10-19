import * as THREE from 'three/webgpu';
import { Tree } from '@dgreenheck/ez-tree';
import { createAudio } from './audio.js';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { WaterMesh } from 'three/addons/objects/WaterMesh.js';

export async function createWorldWebGPU(container, { onTimeUpdate = () => {}, onNavigationUpdate = () => {}, onWorldMapUpdate = () => {} } = {}) {
  const scene = new THREE.Scene();
  const daySky = new THREE.Color('#76a9c5');
  const duskSky = new THREE.Color('#e39a70');
  const nightSky = new THREE.Color('#101b31');
  scene.background = new THREE.Color('#07101b');
  const fog = new THREE.FogExp2(daySky.clone(), 0.0045);
  scene.fog = fog;
  const sky = new SkyMesh();
  sky.scale.setScalar(10000);
  sky.turbidity.value = 3.2;
  sky.rayleigh.value = 2.2;
  sky.mieCoefficient.value = 0.0035;
  sky.mieDirectionalG.value = 0.78;
  sky.cloudCoverage.value = 0.42;
  sky.cloudDensity.value = 0.52;
  sky.cloudElevation.value = 0.46;
  sky.cloudSpeed.value = 0.000012;
  scene.add(sky);

  const camera = new THREE.PerspectiveCamera(72, container.clientWidth / Math.max(container.clientHeight, 1), 0.1, 1000000);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, 2, 18);

  const renderer = new THREE.WebGPURenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  renderer.domElement.tabIndex = 0;
  try {
    await renderer.init();
  } catch (error) {
    renderer.dispose();
    renderer.domElement.remove();
    throw error;
  }

  const hemi = new THREE.HemisphereLight(0xc9e1e3, 0x35402d, 1.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd2a0, 2.6);
  sun.position.set(-55, 75, -35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  const moon = new THREE.DirectionalLight(0x829bc9, 0.18);
  moon.position.set(45, 35, 25);
  scene.add(moon);

  // SkyMesh supplies the atmospheric scattering and solar disc.

  // A lightweight, locally generated lunar albedo map; no paid or external texture.
  const lunarCanvas = document.createElement('canvas');
  lunarCanvas.width = 512;
  lunarCanvas.height = 256;
  const lunarContext = lunarCanvas.getContext('2d');
  lunarContext.fillStyle = '#aeb8c8';
  lunarContext.fillRect(0, 0, lunarCanvas.width, lunarCanvas.height);
  for (let i = 0; i < 190; i += 1) {
    const x = Math.random() * lunarCanvas.width;
    const y = Math.random() * lunarCanvas.height;
    const radius = 2 + Math.random() * 15;
    const crater = lunarContext.createRadialGradient(x - radius * 0.2, y - radius * 0.2, radius * 0.08, x, y, radius);
    crater.addColorStop(0, 'rgba(37,45,59,0.38)');
    crater.addColorStop(0.58, 'rgba(76,87,104,0.20)');
    crater.addColorStop(0.82, 'rgba(242,246,255,0.24)');
    crater.addColorStop(1, 'rgba(60,70,88,0)');
    lunarContext.fillStyle = crater;
    lunarContext.beginPath();
    lunarContext.arc(x, y, radius, 0, Math.PI * 2);
    lunarContext.fill();
  }
  const lunarTexture = new THREE.CanvasTexture(lunarCanvas);
  lunarTexture.colorSpace = THREE.SRGBColorSpace;
  const moonDisc = new THREE.Mesh(
    new THREE.SphereGeometry(2.35, 32, 24),
    new THREE.MeshBasicMaterial({ map: lunarTexture, color: 0xdce7ff, fog: false, depthWrite: false })
  );
  moonDisc.renderOrder = 4;
  scene.add(moonDisc);

  const starPositions = [];
  const starColors = [];
  for (let i = 0; i < 3200; i += 1) {
    const azimuth = Math.random() * Math.PI * 2;
    const y = 0.015 + Math.random() * 0.985;
    const ring = Math.sqrt(1 - y * y);
    const radius = 365;
    starPositions.push(Math.cos(azimuth) * ring * radius, y * radius, Math.sin(azimuth) * ring * radius);
    const temperature = Math.random();
    const starColor = temperature < 0.12
      ? new THREE.Color(0xffc58f)
      : temperature > 0.84
        ? new THREE.Color(0xaecbff)
        : new THREE.Color(0xf0f2ff);
    starColors.push(starColor.r, starColor.g, starColor.b);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
    size: 1.5,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  }));
  stars.renderOrder = 3;
  scene.add(stars);

  // A lightweight stellar band keeps the Milky Way visible without custom GLSL,
  // so it remains compatible with WebGPURenderer.
  const galaxyPositions = [];
  const galaxyColors = [];
  const galaxyNormal = new THREE.Vector3(0.31, 0.83, -0.46).normalize();
  for (let i = 0; i < 24000 && galaxyPositions.length < 9000; i += 1) {
    const azimuth = Math.random() * Math.PI * 2;
    const y = Math.random() * 2 - 1;
    const ring = Math.sqrt(1 - y * y);
    const direction = new THREE.Vector3(Math.cos(azimuth) * ring, y, Math.sin(azimuth) * ring);
    if (Math.abs(direction.dot(galaxyNormal)) > 0.12 || direction.y < 0.015) continue;
    const radius = 360 + Math.random() * 12;
    galaxyPositions.push(direction.x * radius, direction.y * radius, direction.z * radius);
    const warmth = Math.random();
    const tint = warmth < 0.22
      ? new THREE.Color(0x9aaddd)
      : warmth > 0.82
        ? new THREE.Color(0xe4c7a8)
        : new THREE.Color(0xc7d4ee);
    galaxyColors.push(tint.r, tint.g, tint.b);
  }
  const galaxyGeometry = new THREE.BufferGeometry();
  galaxyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(galaxyPositions, 3));
  galaxyGeometry.setAttribute('color', new THREE.Float32BufferAttribute(galaxyColors, 3));
  const galaxy = new THREE.Points(galaxyGeometry, new THREE.PointsMaterial({
    size: 1.25,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  }));
  galaxy.renderOrder = 2;
  scene.add(galaxy);

  // Procedural seamless normal map keeps the water self-contained and avoids external assets.
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = 256;
  normalCanvas.height = 256;
  const normalContext = normalCanvas.getContext('2d');
  const normalImage = normalContext.createImageData(normalCanvas.width, normalCanvas.height);
  const waterHeight = (x, y) => (
    Math.sin((x / 256) * Math.PI * 2 * 3 + Math.sin((y / 256) * Math.PI * 2 * 2)) * 0.48
    + Math.sin((y / 256) * Math.PI * 2 * 5 + Math.sin((x / 256) * Math.PI * 2 * 2)) * 0.28
    + Math.sin(((x + y) / 256) * Math.PI * 2 * 9) * 0.12
  );
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const dx = (waterHeight((x + 1) % 256, y) - waterHeight((x + 255) % 256, y)) * 2.4;
      const dy = (waterHeight(x, (y + 1) % 256) - waterHeight(x, (y + 255) % 256)) * 2.4;
      const length = Math.sqrt(dx * dx + dy * dy + 1);
      const index = (y * 256 + x) * 4;
      normalImage.data[index] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
      normalImage.data[index + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255);
      normalImage.data[index + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      normalImage.data[index + 3] = 255;
    }
  }
  normalContext.putImageData(normalImage, 0, 0);
  const waterNormals = new THREE.CanvasTexture(normalCanvas);
  waterNormals.wrapS = THREE.RepeatWrapping;
  waterNormals.wrapT = THREE.RepeatWrapping;
  waterNormals.repeat.set(220, 220);
  waterNormals.colorSpace = THREE.NoColorSpace;
  const ocean = new WaterMesh(new THREE.PlaneGeometry(10000, 10000), {
    waterNormals,
    sunDirection: new THREE.Vector3(0.4, 0.8, 0.3),
    sunColor: 0xffd9a0,
    waterColor: 0x123e4b,
    distortionScale: 3.7,
    size: 1.4,
    resolutionScale: 0.35,
  });
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -1.15;
  ocean.renderOrder = 0;
  scene.add(ocean);

  // A continuous island mesh tapers below sea level at the shoreline.
  // The same height function drives the rendered terrain and player elevation.
  const islandRadiusX = 128;
  const islandRadiusZ = 142;
  const mountain = { x: -39, z: -52 };
  const ridgeAngle = -0.48;
  const smoothstep = (a, b, value) => {
    const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  // This foot-worn route is painted into the terrain, not built as a raised mesh.
  const trailWaypoints = [
    [0, 18], [7, 1], [2, -18], [-8, -34], [-18, -45], [-28, -51], [mountain.x, mountain.z],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));
  function distanceToSegment2D(px, pz, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq ? THREE.MathUtils.clamp(((px - a.x) * dx + (pz - a.z) * dz) / lengthSq, 0, 1) : 0;
    return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
  }
  function wornPathDistance(x, z) {
    let distance = Infinity;
    for (let i = 0; i < trailWaypoints.length - 1; i += 1) {
      distance = Math.min(distance, distanceToSegment2D(x, z, trailWaypoints[i], trailWaypoints[i + 1]));
    }
    return distance + Math.sin(x * 0.34 + z * 0.21) * 0.22 + Math.sin(z * 0.53 - x * 0.17) * 0.12;
  }
  function groundHeight(x, z) {
    const radial = Math.sqrt((x * x) / (islandRadiusX * islandRadiusX) + (z * z) / (islandRadiusZ * islandRadiusZ));
    const broad = Math.sin(x * 0.027 + z * 0.019) * 1.8
      + Math.sin(z * 0.041 - x * 0.033) * 1.05
      + Math.cos(x * 0.061 + z * 0.047) * 0.52;
    const fine = Math.sin(x * 0.17 + Math.sin(z * 0.12) * 1.7) * 0.22 + Math.cos(z * 0.21 - x * 0.13) * 0.17;
    const shoreDrop = smoothstep(0.87, 1.12, radial) * 7.5;
    const dx = x - mountain.x, dz = z - mountain.z;
    const along = dx * Math.cos(ridgeAngle) + dz * Math.sin(ridgeAngle);
    const across = -dx * Math.sin(ridgeAngle) + dz * Math.cos(ridgeAngle);
    const ridge = 39 * Math.exp(-(along * along) / 1900 - (across * across) / 360);
    const shoulder = 13 * Math.exp(-(((x + 68) ** 2) / 700 + ((z + 18) ** 2) / 1200));
    const knoll = 8 * Math.exp(-(((x - 46) ** 2) / 440 + ((z + 62) ** 2) / 500));
    const pathInfluence = 1 - smoothstep(0.25, 2.4, Math.max(0, wornPathDistance(x, z)));
    return 0.7 + Math.max(0, 1 - radial) * 2.6 + (broad + fine) * (1 - pathInfluence * 0.24) - shoreDrop + ridge + shoulder + knoll;
  }

  const terrainGeometry = new THREE.PlaneGeometry(330, 360, 280, 300);
  terrainGeometry.rotateX(-Math.PI / 2);
  const terrainPositions = terrainGeometry.attributes.position;
  const terrainColors = [];
  const grassLow = new THREE.Color(0x526747), grassHigh = new THREE.Color(0x7f8c61);
  const mossColor = new THREE.Color(0x66734b), rockLow = new THREE.Color(0x575a56);
  const rockHigh = new THREE.Color(0xaaa99d), screeColor = new THREE.Color(0x77776d);
  const beachColor = new THREE.Color(0x9b8c70), wornSoilColor = new THREE.Color(0x76674f);
  const vertexColor = new THREE.Color(), ridgeColor = new THREE.Color();
  for (let i = 0; i < terrainPositions.count; i += 1) {
    const x = terrainPositions.getX(i), z = terrainPositions.getZ(i);
    const height = groundHeight(x, z);
    terrainPositions.setY(i, height);
    const radial = Math.sqrt((x * x) / (islandRadiusX * islandRadiusX) + (z * z) / (islandRadiusZ * islandRadiusZ));
    const dx = x - mountain.x, dz = z - mountain.z;
    const across = -dx * Math.sin(ridgeAngle) + dz * Math.cos(ridgeAngle);
    const exposure = THREE.MathUtils.clamp((height - 9) / 30 + Math.abs(across) * 0.006, 0, 1);
    const rockAmount = smoothstep(10, 27, height) * 0.78 + smoothstep(0.55, 1, Math.abs(across) / 31) * exposure * 0.22;
    const noise = (Math.sin(x * 0.19 + z * 0.13) + Math.cos(z * 0.24 - x * 0.11)) * 0.045;
    vertexColor.copy(grassLow).lerp(grassHigh, THREE.MathUtils.clamp(0.25 + height * 0.014 + noise, 0, 0.9));
    vertexColor.lerp(mossColor, smoothstep(1.5, 7, height) * (0.16 + Math.max(0, Math.sin(x * 0.07) * Math.cos(z * 0.09)) * 0.18));
    ridgeColor.copy(rockLow).lerp(rockHigh, THREE.MathUtils.clamp((height - 14) / 35 + noise, 0, 1));
    ridgeColor.lerp(screeColor, smoothstep(0.55, 1, Math.abs(across) / 38) * 0.25);
    vertexColor.lerp(ridgeColor, THREE.MathUtils.clamp(rockAmount, 0, 0.94));
    vertexColor.lerp(beachColor, 1 - smoothstep(0.79, 0.99, radial));
    const worn = 1 - smoothstep(0.75, 2.8, Math.max(0, wornPathDistance(x, z)));
    vertexColor.lerp(wornSoilColor, worn * (0.42 + Math.sin(x * 0.7 + z * 0.5) * 0.07));
    terrainColors.push(vertexColor.r, vertexColor.g, vertexColor.b);
  }
  terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(terrainColors, 3));
  terrainGeometry.computeVertexNormals();
  const terrain = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  scene.add(terrain);

  const beacon = new THREE.Group();
  beacon.position.set(9, groundHeight(9, -72), -72);
  scene.add(beacon);
  const metal = new THREE.MeshStandardMaterial({ color: 0x323c3a, roughness: 0.7 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 7, 8), metal);
  post.position.y = 3.5;
  post.castShadow = true;
  beacon.add(post);
  const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xffd58a, emissive: 0xffa52f, emissiveIntensity: 3 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), lampMaterial);
  lamp.position.y = 7;
  beacon.add(lamp);
  const beaconLight = new THREE.PointLight(0xffbd65, 28, 48, 2);
  beaconLight.position.y = 7;
  beacon.add(beaconLight);

  camera.position.y = groundHeight(camera.position.x, camera.position.z) + 1.7;

  // Build a varied, layered conifer forest with instancing to keep draw calls low.
  // Each tree has a tapered trunk and four overlapping foliage tiers instead of one
  // simple cone, giving the silhouette a more natural evergreen shape.
  const obstacles = [];
  function nearTrail(x, z, padding = 4) {
    for (let i = 0; i < trailWaypoints.length - 1; i += 1) {
      if (distanceToSegment2D(x, z, trailWaypoints[i], trailWaypoints[i + 1]) < padding) return true;
    }
    return false;
  }

  const treeData = [];
  for (let attempt = 0; attempt < 5200 && treeData.length < 135; attempt += 1) {
    const x = (Math.random() - 0.5) * 232;
    const z = (Math.random() - 0.5) * 258;
    const radial = Math.sqrt((x * x) / (islandRadiusX * islandRadiusX) + (z * z) / (islandRadiusZ * islandRadiusZ));
    const height = groundHeight(x, z);
    const mountainDistance = Math.hypot(x - mountain.x, z - mountain.z);
    if (radial > 0.86 || height > 23 || height < -0.2) continue;
    if (nearTrail(x, z, 2.8) || Math.hypot(x, z - 18) < 11) continue;
    if (Math.hypot(x - 9, z + 72) < 13) continue;
    // Keep the forest concentrated around the mountain's lower slopes and coast.
    if (mountainDistance > 83 && Math.random() > 0.42) continue;
    // Avoid dense clumps and keep enough space to navigate between trunks.
    const minSpacing = 2.7 + Math.random() * 1.2;
    if (treeData.some((tree) => Math.hypot(x - tree.x, z - tree.z) < minSpacing)) continue;

    const scale = 0.78 + Math.random() * 0.9;
    const trunkHeight = (2.8 + Math.random() * 1.9) * scale;
    const crownRadius = (1.05 + Math.random() * 0.65) * scale;
    const yaw = Math.random() * Math.PI * 2;
    treeData.push({ x, z, height, scale, trunkHeight, crownRadius, yaw });
    obstacles.push({ x, z, radius: 0.34 * scale });
  }

  // Export a top-down map from the same height function used by the rendered terrain.
  // Grid cells are grouped by elevation into SVG paths, so the HUD stays lightweight.
  {
    const columns = 96, rows = 104;
    const minX = -165, minZ = -180;
    const cellX = 330 / columns, cellZ = 360 / rows;
    const kinds = ["water", "shore", "lowland", "forest", "upland", "summit"];
    const paths = Object.fromEntries(kinds.map((kind) => [kind, ""]));
    for (let row = 0; row < rows; row += 1) {
      const z0 = minZ + row * cellZ;
      const zCenter = z0 + cellZ * 0.5;
      for (let column = 0; column < columns; column += 1) {
        const x0 = minX + column * cellX;
        const xCenter = x0 + cellX * 0.5;
        const h = groundHeight(xCenter, zCenter);
        const kind = h <= -1.15 ? "water"
          : h < 1.2 ? "shore"
          : h < 5.5 ? "lowland"
          : h < 12 ? "forest"
          : h < 25 ? "upland" : "summit";
        const w = cellX + 0.035, d = cellZ + 0.035;
        paths[kind] += `M${x0.toFixed(2)} ${z0.toFixed(2)}h${w.toFixed(2)}v${d.toFixed(2)}h-${w.toFixed(2)}Z`;
      }
    }
    onWorldMapUpdate({
      layers: kinds.map((kind) => ({ kind, d: paths[kind] })),
      trees: treeData.map(({ x, z, scale }) => ({ x, z, scale })),
    });
  }

  // Procedural EZ-Tree forest with distance-based LODs.
  const treePalette = [
    { bark: 0x51402e, leaves: 0x294633 },
    { bark: 0x594632, leaves: 0x34513a },
    { bark: 0x493d2c, leaves: 0x405c40 },
    { bark: 0x5b4934, leaves: 0x263d30 },
  ];
  const treePresets = ['Ash Large', 'Bush 1', 'Bush 3', 'Oak Large'];
  treeData.forEach((tree, index) => {
    const presetName = treePresets[index % treePresets.length];
    const generatedTree = new Tree();
    generatedTree.loadPreset(presetName);
    generatedTree.options.seed = 1000 + index * 7919;
    generatedTree.options.bark.textured = false;
    generatedTree.options.bark.tint = treePalette[index % treePalette.length].bark;
    generatedTree.options.leaves.map = null;
    generatedTree.options.leaves.tint = treePalette[index % treePalette.length].leaves;
    generatedTree.options.leaves.alphaTest = 0.35;
    generatedTree.options.trellis.enabled = false;
    generatedTree.generate();
    generatedTree.traverse((object) => {
      if (!object.isMesh || !object.material) return;
      object.castShadow = true;
      object.receiveShadow = true;
      // EZ-Tree's wind patch uses WebGL GLSL; use its standard material on WebGPU.
      object.material.onBeforeCompile = () => {};
      object.material.customProgramCacheKey = () => 'ez-tree-webgpu-static';
      object.material.needsUpdate = true;
    });
    generatedTree.scale.setScalar(0.25 + tree.scale * 0.16);
    generatedTree.position.set(tree.x, tree.height, tree.z);
    generatedTree.rotation.y = tree.yaw;
    scene.add(generatedTree);
  });

  // Dense, low-cost fluffy grass inspired by the FluffyGrass reference.
  // Procedural curved blade tufts keep the scene self-contained and WebGPU-compatible.
  const grassPositions = [];
  const grassColors = [];
  const grassIndices = [];
  const grassPalette = [0x405b32, 0x526d3b, 0x617b43, 0x71894b, 0x344d2d];
  const grassColor = new THREE.Color();
  const bladeCount = 9;
  for (let blade = 0; blade < bladeCount; blade += 1) {
    const angle = blade * Math.PI * (3 - Math.sqrt(5));
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const width = 0.045 + (blade % 3) * 0.009;
    const height = 0.34 + (blade % 4) * 0.075;
    const lean = 0.08 + (blade % 3) * 0.035;
    const base = grassPositions.length / 3;
    // Three gently curved sections per blade, tapered to a fine tip.
    const levels = [
      { y: 0, w: width, offset: 0 },
      { y: height * 0.38, w: width * 0.72, offset: lean * 0.22 },
      { y: height * 0.72, w: width * 0.36, offset: lean * 0.62 },
      { y: height, w: 0.002, offset: lean },
    ];
    const sideX = -dz;
    const sideZ = dx;
    levels.forEach((level, levelIndex) => {
      const centerX = dx * level.offset;
      const centerZ = dz * level.offset;
      grassPositions.push(
        centerX + sideX * level.w, level.y, centerZ + sideZ * level.w,
        centerX - sideX * level.w, level.y, centerZ - sideZ * level.w
      );
      const tint = 0.82 + levelIndex * 0.105;
      const baseColor = new THREE.Color(grassPalette[blade % grassPalette.length]).multiplyScalar(tint);
      grassColors.push(baseColor.r, baseColor.g, baseColor.b, baseColor.r, baseColor.g, baseColor.b);
    });
    for (let level = 0; level < levels.length - 1; level += 1) {
      const a = base + level * 2;
      grassIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const grassTuftGeometry = new THREE.BufferGeometry();
  grassTuftGeometry.setAttribute('position', new THREE.Float32BufferAttribute(grassPositions, 3));
  grassTuftGeometry.setAttribute('color', new THREE.Float32BufferAttribute(grassColors, 3));
  grassTuftGeometry.setIndex(grassIndices);
  grassTuftGeometry.computeVertexNormals();
  const grassTuftMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0,
  });
  const grassCount = 14500;
  const grassInstances = new THREE.InstancedMesh(grassTuftGeometry, grassTuftMaterial, grassCount);
  grassInstances.castShadow = false;
  grassInstances.receiveShadow = false;
  grassInstances.frustumCulled = false;
  const grassDummy = new THREE.Object3D();
  const grassUp = new THREE.Vector3(0, 1, 0);
  const grassNormal = new THREE.Vector3();
  const grassAlign = new THREE.Quaternion();
  const grassYaw = new THREE.Quaternion();
  const grassScale = new THREE.Vector3();
  let placedGrass = 0;
  for (let attempt = 0; attempt < grassCount * 7 && placedGrass < grassCount; attempt += 1) {
    const x = (Math.random() - 0.5) * 145;
    const z = (Math.random() - 0.5) * 275;
    const radial = Math.sqrt((x * x) / (islandRadiusX * islandRadiusX) + (z * z) / (islandRadiusZ * islandRadiusZ));
    const height = groundHeight(x, z);
    if (radial > 0.87 || height < 0.05 || height > 15.5) continue;
    if (nearTrail(x, z, 1.2) || Math.hypot(x, z - 18) < 7.5) continue;
    if (Math.hypot(x - 9, z + 72) < 10) continue;
    if (treeData.some((tree) => Math.hypot(x - tree.x, z - tree.z) < 1.05 + tree.crownRadius * 0.18)) continue;
    // Avoid very steep slopes; grass is concentrated on the lower, walkable island.
    const slopeX = (groundHeight(x + 0.35, z) - groundHeight(x - 0.35, z)) / 0.7;
    const slopeZ = (groundHeight(x, z + 0.35) - groundHeight(x, z - 0.35)) / 0.7;
    if (Math.hypot(slopeX, slopeZ) > 0.82) continue;
    grassNormal.set(-slopeX, 1, -slopeZ).normalize();
    grassAlign.setFromUnitVectors(grassUp, grassNormal);
    grassYaw.setFromAxisAngle(grassUp, Math.random() * Math.PI * 2);
    grassAlign.multiply(grassYaw);
    grassDummy.position.set(x, height + 0.015, z);
    grassDummy.quaternion.copy(grassAlign);
    const size = 0.72 + Math.random() * 0.95;
    grassScale.set(size, size * (0.72 + Math.random() * 0.78), size);
    grassDummy.scale.copy(grassScale);
    grassDummy.updateMatrix();
    grassInstances.setMatrixAt(placedGrass, grassDummy.matrix);
    grassColor.setHex(grassPalette[Math.floor(Math.random() * grassPalette.length)]);
    grassInstances.setColorAt(placedGrass, grassColor);
    placedGrass += 1;
  }
  grassInstances.count = placedGrass;
  grassInstances.instanceMatrix.needsUpdate = true;
  if (grassInstances.instanceColor) grassInstances.instanceColor.needsUpdate = true;
  scene.add(grassInstances);

  camera.position.y = groundHeight(camera.position.x, camera.position.z) + 1.7;

  const audio = createAudio();
  const keys = new Set();
  const playerRadius = 0.55;
  const lookSensitivity = 0.0022;
  const moveVector = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  let yaw = 0;
  let pitch = 0;
  let frameId = 0;
  let disposed = false;
  let stamina = 100;
  let footstepClock = 0;
  let lastTimeUpdate = -1;
  let lastNavigationUpdate = -1;
  const clock = new THREE.Clock();

  function requestPointerLock() {
    if (document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock?.();
  }
  function onPointerLockChange() {
    if (document.pointerLockElement !== renderer.domElement) keys.clear();
  }
  function onMouseMove(event) {
    if (document.pointerLockElement !== renderer.domElement) return;
    yaw -= event.movementX * 0.0022;
    pitch -= event.movementY * 0.0022;
    pitch = THREE.MathUtils.clamp(pitch, -Math.PI / 2.2, Math.PI / 2.2);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }
  function onKeyDown(event) {
    const key = event.key.toLowerCase();
    if (['w','a','s','d','shift','arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)) event.preventDefault();
    keys.add(key);
  }
  function onKeyUp(event) { keys.delete(event.key.toLowerCase()); }
  function onCanvasClick() { if (document.pointerLockElement !== renderer.domElement) requestPointerLock(); }
  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('mousemove', onMouseMove);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  renderer.domElement.addEventListener('click', onCanvasClick);

  function canMoveTo(x, z) {
    const insideIsland = (x * x) / (islandRadiusX * islandRadiusX) + (z * z) / (islandRadiusZ * islandRadiusZ) < 0.94;
    if (!insideIsland || groundHeight(x, z) <= -0.95) return false;
    return !obstacles.some((tree) => Math.hypot(x - tree.x, z - tree.z) < playerRadius + tree.radius);
  }

  function updateMovement(delta) {
    if (document.pointerLockElement !== renderer.domElement) return;
    const forward = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
    const strafe = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
    if (!forward && !strafe) {
      stamina = Math.min(100, stamina + delta * 12);
      footstepClock = 0;
      return;
    }
    const sprinting = keys.has('shift') && stamina > 0;
    const speed = sprinting ? 12 : 6;
    if (sprinting) stamina = Math.max(0, stamina - delta * 24);
    else stamina = Math.min(100, stamina + delta * 10);
    moveVector.set(strafe, 0, -forward);
    if (moveVector.lengthSq() > 1) moveVector.normalize();
    moveVector.applyAxisAngle(worldUp, yaw);
    const nextX = camera.position.x + moveVector.x * speed * delta;
    const nextZ = camera.position.z + moveVector.z * speed * delta;
    const oldX = camera.position.x;
    const oldZ = camera.position.z;
    if (canMoveTo(nextX, camera.position.z)) camera.position.x = nextX;
    if (canMoveTo(camera.position.x, nextZ)) camera.position.z = nextZ;
    camera.position.y = groundHeight(camera.position.x, camera.position.z) + 1.7;
    camera.position.y = groundHeight(camera.position.x, camera.position.z) + 1.7;
    const actualDistance = Math.hypot(camera.position.x - oldX, camera.position.z - oldZ);
    if (actualDistance > 0.001) {
      footstepClock += delta;
      const interval = sprinting ? 0.32 : 0.48;
      if (footstepClock >= interval) {
        footstepClock = 0;
        const edgeRatio = (camera.position.x ** 2) / (islandRadiusX ** 2) + (camera.position.z ** 2) / (islandRadiusZ ** 2);
        audio.footstep(edgeRatio > 0.72 ? 'sand' : 'grass', sprinting);
      }
    }
  }

  function updateDayNight(elapsed) {
    // One full in-game day lasts 12 real minutes. The clock starts at 08:00.
    const totalMinutes = (8 * 60 + Math.floor(elapsed * 2)) % (24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const time = `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
    // Keep the HUD clock rounded to minutes, but move the sun continuously between updates.
    const phase = ((8 * 60 + elapsed * 2) % (24 * 60)) / (24 * 60);
    const daylight = THREE.MathUtils.clamp(Math.sin((phase - 0.25) * Math.PI * 2) * 0.5 + 0.5, 0.035, 1);
    const sunHeight = Math.sin((phase - 0.25) * Math.PI * 2);
    const sunDirection = new THREE.Vector3(Math.cos(phase * Math.PI * 2), sunHeight * 1.15, Math.sin(phase * Math.PI * 2) * 0.78).normalize();
    sun.position.copy(sunDirection).multiplyScalar(100);
    moon.position.copy(sunDirection).multiplyScalar(-80);
    sky.sunPosition.value.copy(sunDirection);
    sky.cloudCoverage.value = 0.34 + daylight * 0.12;
    sky.cloudDensity.value = 0.42 + daylight * 0.14;
    moonDisc.position.copy(sunDirection).multiplyScalar(-120);
    moonDisc.visible = sunDirection.y < 0.02;
    stars.material.opacity = THREE.MathUtils.smoothstep(1 - daylight, 0.18, 0.78);
    stars.visible = stars.material.opacity > 0.01;
    galaxy.material.opacity = THREE.MathUtils.smoothstep(-sunHeight, 0.05, 0.42) * 0.48;
    galaxy.visible = galaxy.material.opacity > 0.01;
    sun.intensity = 0.08 + daylight * 2.7;
    sun.color.setHSL(0.09 - daylight * 0.045, 0.58, 0.6 + daylight * 0.08);
    hemi.intensity = 0.18 + daylight * 1.7;
    moon.intensity = 0.12 + (1 - daylight) * 0.55;
    beaconLight.intensity = 25 + (1 - daylight) * 12 + Math.sin(elapsed * 2.5) * 4;
    lampMaterial.emissiveIntensity = 2.2 + Math.sin(elapsed * 2.5) * 0.5;
    if (sunHeight < -0.18) color.copy(nightSky);
    else if (sunHeight < 0.18) color.copy(nightSky).lerp(duskSky, THREE.MathUtils.smoothstep(sunHeight, -0.18, 0.18));
    else color.copy(duskSky).lerp(daySky, THREE.MathUtils.smoothstep(sunHeight, 0.18, 0.72));
    // Keep the atmospheric scattering sky visible; use the palette only for distant haze.
    fog.color.copy(color);
    fog.density = 0.004 + daylight * 0.0025;
    ocean.sunDirection.value.copy(sunDirection).normalize();
    ocean.sunColor.value.setHSL(0.105, 0.68, 0.5 + daylight * 0.35);
    ocean.waterColor.value.setHSL(0.53, 0.48, 0.055 + daylight * 0.105);
    if (lastTimeUpdate !== totalMinutes) {
      lastTimeUpdate = totalMinutes;
      const period = hours >= 5 && hours < 11 ? 'MORNING' : hours >= 11 && hours < 16 ? 'DAYLIGHT' : hours >= 16 && hours < 20 ? 'DUSK' : 'NIGHT';
      onTimeUpdate({ time, period });
    }
  }

  function render() {
    if (disposed) return;
    frameId = window.requestAnimationFrame(render);
    const delta = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;
    updateMovement(delta);
    updateDayNight(elapsed);
    if (elapsed - lastNavigationUpdate >= 0.12) {
      lastNavigationUpdate = elapsed;
      onNavigationUpdate({ x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw });
    }
    renderer.render(scene, camera);
  }
  render();

  function onResize() {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
  window.addEventListener('resize', onResize);

  return {
    requestPointerLock,
    startAudio: () => audio.start(),
    setAudioVolumes: (volumes) => audio.setVolumes(volumes),
    setMuted: (value) => audio.setMuted(value),
    dispose() {
      disposed = true;
      audio.dispose();
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      renderer.domElement.removeEventListener('click', onCanvasClick);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      renderer.dispose();
      waterNormals.dispose();
      lunarTexture.dispose();
      foliageTexture.dispose();
      renderer.domElement.remove();
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
    },
  };
}
