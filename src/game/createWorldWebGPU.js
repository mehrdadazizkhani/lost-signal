import * as THREE from 'three/webgpu';
import { createAudio } from './audio.js';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { WaterMesh } from 'three/addons/objects/WaterMesh.js';

export async function createWorldWebGPU(container, { onTimeUpdate = () => {} } = {}) {
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
  const islandRadiusX = 76;
  const islandRadiusZ = 81;
  const mountain = { x: -18, z: -30 };
  const smoothstep = (a, b, value) => {
    const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  function groundHeight(x, z) {
    const radial = Math.sqrt((x * x) / (islandRadiusX * islandRadiusX) + (z * z) / (islandRadiusZ * islandRadiusZ));
    const rolling = Math.sin(x * 0.115 + z * 0.073) * 0.28 + Math.sin(z * 0.19 - x * 0.08) * 0.16;
    const inland = 0.45 + Math.max(0, 1 - radial) * 1.35 + rolling;
    const shoreDrop = smoothstep(0.83, 1.13, radial) * 4.2;
    const mountainDistance = ((x - mountain.x) ** 2) / 540 + ((z - mountain.z) ** 2) / 760;
    const peak = 31 * Math.exp(-mountainDistance * 1.15);
    return inland - shoreDrop + peak;
  }

  const terrainGeometry = new THREE.PlaneGeometry(196, 210, 160, 170);
  terrainGeometry.rotateX(-Math.PI / 2);
  const terrainPositions = terrainGeometry.attributes.position;
  const terrainColors = [];
  const grassLow = new THREE.Color(0x59664a);
  const grassHigh = new THREE.Color(0x87906b);
  const rockLow = new THREE.Color(0x66675d);
  const rockHigh = new THREE.Color(0xaaa99a);
  const beachColor = new THREE.Color(0x8d8467);
  const vertexColor = new THREE.Color();
  for (let i = 0; i < terrainPositions.count; i += 1) {
    const x = terrainPositions.getX(i);
    const z = terrainPositions.getZ(i);
    const height = groundHeight(x, z);
    terrainPositions.setY(i, height);
    const radial = Math.sqrt((x * x) / (islandRadiusX * islandRadiusX) + (z * z) / (islandRadiusZ * islandRadiusZ));
    const rockAmount = smoothstep(7, 19, height) * 0.9;
    vertexColor.copy(grassLow).lerp(grassHigh, THREE.MathUtils.clamp(0.3 + height * 0.018, 0, 0.8));
    vertexColor.lerp(rockLow.clone().lerp(rockHigh, THREE.MathUtils.clamp((height - 18) / 16, 0, 1)), rockAmount);
    vertexColor.lerp(beachColor, 1 - smoothstep(0.78, 0.98, radial));
    terrainColors.push(vertexColor.r, vertexColor.g, vertexColor.b);
  }
  terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(terrainColors, 3));
  terrainGeometry.computeVertexNormals();
  const terrain = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  scene.add(terrain);

  // The island has exactly one marked footpath, winding from the landing shore
  // up the mountain to the summit.
  const trailWaypoints = [
    [0, 18], [2, 7], [-1, -3], [-6, -13], [-3, -20], [-10, -25], [mountain.x, mountain.z],
  ].map(([x, z]) => new THREE.Vector3(x, groundHeight(x, z) + 0.14, z));
  const roughTrailCurve = new THREE.CatmullRomCurve3(trailWaypoints);
  const trailPoints = roughTrailCurve.getPoints(150);
  trailPoints.forEach((point) => { point.y = groundHeight(point.x, point.z) + 0.14; });
  const trail = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(trailPoints), 150, 1.25, 7, false),
    new THREE.MeshStandardMaterial({ color: 0x8a7958, roughness: 1 })
  );
  trail.receiveShadow = true;
  scene.add(trail);

  const beacon = new THREE.Group();
  beacon.position.set(2, groundHeight(2, -43), -43);
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
  function distanceToSegment2D(px, pz, a, b) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq ? THREE.MathUtils.clamp(((px - a.x) * dx + (pz - a.z) * dz) / lengthSq, 0, 1) : 0;
    return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
  }
  function nearTrail(x, z, padding = 4) {
    for (let i = 0; i < trailWaypoints.length - 1; i += 1) {
      if (distanceToSegment2D(x, z, trailWaypoints[i], trailWaypoints[i + 1]) < padding) return true;
    }
    return false;
  }

  const treeData = [];
  for (let attempt = 0; attempt < 2200 && treeData.length < 210; attempt += 1) {
    const x = (Math.random() - 0.5) * 136;
    const z = (Math.random() - 0.5) * 145;
    const radial = Math.sqrt((x * x) / (islandRadiusX * islandRadiusX) + (z * z) / (islandRadiusZ * islandRadiusZ));
    const height = groundHeight(x, z);
    const mountainDistance = Math.hypot(x - mountain.x, z - mountain.z);
    if (radial > 0.83 || height > 17 || height < -0.2) continue;
    if (nearTrail(x, z, 5.1) || Math.hypot(x, z - 18) < 9) continue;
    if (Math.hypot(x - 2, z + 43) < 11) continue;
    // Keep the forest concentrated around the mountain's lower slopes and coast.
    if (mountainDistance > 58 && Math.random() > 0.42) continue;
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

  const trunkGeometry = new THREE.CylinderGeometry(0.68, 1, 1, 7, 2);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x51402e, roughness: 1 });
  const trunkInstances = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, treeData.length);
  trunkInstances.castShadow = true;
  trunkInstances.receiveShadow = true;

  const foliageGeometry = new THREE.ConeGeometry(1, 1, 9, 2);
  const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: true });
  const foliageTiers = [0, 1, 2, 3].map((tier) => {
    const mesh = new THREE.InstancedMesh(foliageGeometry, foliageMaterial, treeData.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.userData.tier = tier;
    return mesh;
  });
  const dummy = new THREE.Object3D();
  const foliagePalette = [0x1d382b, 0x294633, 0x34513a, 0x405c40, 0x263d30, 0x496344];
  const tempColor = new THREE.Color();

  treeData.forEach((tree, index) => {
    dummy.position.set(tree.x, tree.height + tree.trunkHeight * 0.5, tree.z);
    dummy.rotation.set(0, tree.yaw, 0);
    dummy.scale.set(0.15 * tree.scale, tree.trunkHeight, 0.15 * tree.scale);
    dummy.updateMatrix();
    trunkInstances.setMatrixAt(index, dummy.matrix);

    const paletteColor = new THREE.Color(foliagePalette[Math.floor(Math.random() * foliagePalette.length)]);
    const treeVariation = 0.82 + Math.random() * 0.28;
    // The lowest tier is broad; upper tiers become shorter and narrower.
    const tierSpecs = [
      { y: 0.48, radius: 1.0, height: 0.78 },
      { y: 0.67, radius: 0.79, height: 0.75 },
      { y: 0.84, radius: 0.59, height: 0.72 },
      { y: 0.99, radius: 0.39, height: 0.64 },
    ];
    foliageTiers.forEach((mesh, tier) => {
      const spec = tierSpecs[tier];
      const radius = tree.crownRadius * spec.radius * treeVariation;
      const crownHeight = tree.trunkHeight * spec.height;
      dummy.position.set(
        tree.x + Math.sin(tree.yaw + tier * 1.7) * 0.06 * tree.scale,
        tree.height + tree.trunkHeight * spec.y,
        tree.z + Math.cos(tree.yaw + tier * 1.7) * 0.06 * tree.scale
      );
      dummy.rotation.set(0, tree.yaw + tier * 0.23, 0);
      dummy.scale.set(radius, crownHeight, radius);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      tempColor.copy(paletteColor).multiplyScalar(0.88 + tier * 0.045 + Math.random() * 0.07);
      mesh.setColorAt(index, tempColor);
    });
  });
  trunkInstances.instanceMatrix.needsUpdate = true;
  scene.add(trunkInstances);
  foliageTiers.forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
  });

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
    if (!insideIsland) return false;
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
