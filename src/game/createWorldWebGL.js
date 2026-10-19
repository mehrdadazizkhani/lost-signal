import * as THREE from 'three';
import { Tree } from '@dgreenheck/ez-tree';
import { createAudio } from './audio.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';

export function createWorld(container, { onTimeUpdate = () => {}, onNavigationUpdate = () => {} } = {}) {
  const scene = new THREE.Scene();
  const daySky = new THREE.Color('#76a9c5');
  const duskSky = new THREE.Color('#e39a70');
  const nightSky = new THREE.Color('#101b31');
  // Sky is rendered by the atmospheric scattering dome; keep a dark fallback only.
  scene.background = new THREE.Color('#07101b');
  const fog = new THREE.FogExp2(daySky.clone(), 0.0045);
  scene.fog = fog;
  const sky = new Sky();
  sky.scale.setScalar(450000);
  sky.material.uniforms.turbidity.value = 3.2;
  sky.material.uniforms.rayleigh.value = 2.2;
  sky.material.uniforms.mieCoefficient.value = 0.0035;
  sky.material.uniforms.mieDirectionalG.value = 0.78;
  scene.add(sky);

  const camera = new THREE.PerspectiveCamera(72, container.clientWidth / Math.max(container.clientHeight, 1), 0.1, 1000000);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, 2, 18);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  renderer.domElement.tabIndex = 0;

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

  // Procedural sky layers: atmospheric scattering, volumetric-looking cloud field,
  // a structured Milky Way band, and a twinkling star catalog. All use a few draw calls.
  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(3.8, 20, 16),
    new THREE.MeshBasicMaterial({ color: 0xffe0a1, fog: false, depthWrite: false })
  );
  sunDisc.renderOrder = 2;
  scene.add(sunDisc);

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
  const starSizes = [];
  const starPhases = [];
  const starColors = [];
  for (let i = 0; i < 3200; i += 1) {
    const azimuth = Math.random() * Math.PI * 2;
    const y = 0.015 + Math.random() * 0.985;
    const ring = Math.sqrt(1 - y * y);
    const radius = 365;
    starPositions.push(Math.cos(azimuth) * ring * radius, y * radius, Math.sin(azimuth) * ring * radius);
    starSizes.push(0.65 + Math.pow(Math.random(), 5) * 2.4);
    starPhases.push(Math.random() * Math.PI * 2);
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
  starGeometry.setAttribute('aSize', new THREE.Float32BufferAttribute(starSizes, 1));
  starGeometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(starPhases, 1));
  starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
  const stars = new THREE.Points(starGeometry, new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 } },
    vertexShader: `
      attribute float aSize;
      attribute float aPhase;
      attribute vec3 color;
      uniform float uTime;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vColor = color;
        vTwinkle = 0.68 + 0.32 * sin(uTime * (0.65 + aPhase * 0.12) + aPhase);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (350.0 / max(1.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uNight;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vec2 p = gl_PointCoord - vec2(0.5);
        float r = length(p);
        float core = 1.0 - smoothstep(0.03, 0.22, r);
        float halo = exp(-r * 13.0) * 0.32;
        float alpha = (core + halo) * vTwinkle * uNight;
        if (alpha < 0.015) discard;
        gl_FragColor = vec4(vColor, alpha);
      }
    `
  }));
  stars.renderOrder = 3;
  scene.add(stars);

  const milkyWay = new THREE.Mesh(
    new THREE.SphereGeometry(405, 64, 48),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      uniforms: { uNight: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uNight;
        uniform float uTime;
        varying vec3 vDirection;
        float hash31(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }
        float noise3(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
                         mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
                         mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float fbm(vec3 p) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 3; i++) { v += noise3(p) * a; p *= 2.03; a *= 0.5; }
          return v;
        }
        void main() {
          vec3 d = normalize(vDirection);
          vec3 galacticNormal = normalize(vec3(0.31, 0.83, -0.46));
          float band = exp(-pow(abs(dot(d, galacticNormal)) * 7.4, 2.0));
          float structure = fbm(d * vec3(34.0, 25.0, 34.0) + vec3(0.0, 0.0, uTime * 0.00015));
          float dust = fbm(d * vec3(79.0, 62.0, 79.0));
          float core = pow(max(dot(d, normalize(vec3(-0.64, 0.2, -0.74))), 0.0), 5.0);
          float nebula = smoothstep(0.28, 0.72, structure) * (0.52 + 0.72 * dust);
          nebula = max(nebula, core * 0.8);
          float alpha = band * nebula * uNight * 0.72;
          vec3 color = mix(vec3(0.30, 0.39, 0.62), vec3(0.83, 0.73, 0.62), core * 0.7 + dust * 0.12);
          color += vec3(0.12, 0.16, 0.28) * structure;
          gl_FragColor = vec4(color, alpha);
        }
      `
    })
  );
  milkyWay.renderOrder = 1;
  scene.add(milkyWay);

  const cloudMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uDaylight: { value: 1 }, uSunHeight: { value: 0.5 } },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uDaylight;
      uniform float uSunHeight;
      varying vec3 vDirection;
      float hash31(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float noise3(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
                       mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
                       mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 3; i++) { v += noise3(p) * a; p *= 2.02; a *= 0.5; }
        return v;
      }
      void main() {
        vec3 d = normalize(vDirection);
        vec3 p = d * vec3(16.0, 8.0, 16.0) + vec3(uTime * 0.004, 0.0, uTime * 0.0022);
        float broad = fbm(p);
        float detail = fbm(p * 2.4 + vec3(7.1, 2.3, 4.8));
        float erosion = fbm(p * 5.1 + vec3(2.7, 9.2, 1.4));
        float cloudField = broad + detail * 0.22;
        float density = smoothstep(0.43, 0.66, cloudField);
        density *= smoothstep(0.28, 0.52, 1.0 - erosion * 0.75);
        density *= smoothstep(-0.16, 0.16, d.y + 0.18);
        float alpha = density * (0.16 + uDaylight * 0.60);
        vec3 nightColor = vec3(0.018, 0.029, 0.055);
        vec3 duskColor = vec3(0.70, 0.30, 0.23);
        vec3 dayColor = vec3(0.88, 0.92, 0.97);
        float sunset = 1.0 - smoothstep(0.015, 0.32, abs(uSunHeight));
        vec3 litColor = mix(dayColor, duskColor, sunset * 0.76);
        float underside = smoothstep(-0.05, 0.7, d.y);
        vec3 cloudColor = mix(nightColor, litColor * (0.66 + underside * 0.34), uDaylight);
        float edgeLight = pow(1.0 - smoothstep(0.03, 0.22, abs(cloudField - 0.55)), 2.0) * uDaylight * (0.08 + sunset * 0.12);
        cloudColor += vec3(edgeLight * 0.95, edgeLight * 0.82, edgeLight * 0.65);
        gl_FragColor = vec4(cloudColor, alpha);
      }
    `
  });
  const cloudDome = new THREE.Mesh(new THREE.SphereGeometry(292, 64, 48), cloudMaterial);
  cloudDome.renderOrder = 2;
  scene.add(cloudDome);
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
  const ocean = new Water(new THREE.PlaneGeometry(10000, 10000), {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals,
    sunDirection: new THREE.Vector3(0.4, 0.8, 0.3),
    sunColor: 0xffd9a0,
    waterColor: 0x123e4b,
    distortionScale: 2.7,
    fog: true,
  });
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -1.15;
  ocean.renderOrder = 0;
  scene.add(ocean);

  const terrainMaterial = new THREE.MeshStandardMaterial({ color: 0x536b45, roughness: 1 });
  const terrain = new THREE.Mesh(new THREE.CircleGeometry(78, 96), terrainMaterial);
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = -0.3;
  terrain.scale.set(1, 1.08, 0.18);
  terrain.receiveShadow = true;
  scene.add(terrain);

  const ridge = new THREE.Mesh(new THREE.ConeGeometry(22, 20, 7), new THREE.MeshStandardMaterial({ color: 0x405a40, roughness: 1 }));
  ridge.position.set(-18, 8, -36);
  ridge.castShadow = true;
  ridge.receiveShadow = true;
  scene.add(ridge);

  const beacon = new THREE.Group();
  beacon.position.set(2, 4, -43);
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

  const obstacles = [];
  const treePalette = [
    { bark: 0x51402e, leaves: 0x294633 },
    { bark: 0x594632, leaves: 0x34513a },
    { bark: 0x493d2c, leaves: 0x405c40 },
    { bark: 0x5b4934, leaves: 0x263d30 },
  ];
  for (let i = 0; i < 100; i += 1) {
    const x = (Math.random() - 0.5) * 120;
    const z = (Math.random() - 0.5) * 125;
    if (Math.hypot(x, z - 16) < 13 || Math.hypot(x - 2, z + 43) < 10) continue;
    const scale = 0.7 + Math.random() * 0.7;
    const presetName = i % 5 === 0 ? 'Oak Small' : i % 7 === 0 ? 'Ash Small' : 'Pine Small';
    const tree = new Tree();
    tree.loadPreset(presetName);
    tree.options.seed = 2000 + i * 7919;
    tree.options.bark.textured = false;
    tree.options.bark.tint = treePalette[i % treePalette.length].bark;
    tree.options.leaves.map = null;
    tree.options.leaves.tint = treePalette[i % treePalette.length].leaves;
    tree.options.leaves.alphaTest = 0.35;
    tree.options.trellis.enabled = false;
    tree.generate();
    tree.scale.setScalar(0.28 + Math.random() * 0.12);
    tree.position.set(x, 0, z);
    tree.rotation.y = Math.random() * Math.PI * 2;
    tree.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    scene.add(tree);
    obstacles.push({ x, z, radius: 0.65 * scale });
  }

  // Match the minimap to the actual fallback island footprint, ridge and placed trees.
  {
    const columns = 96, rows = 104;
    const minX = -100, minZ = -100;
    const cellX = 200 / columns, cellZ = 200 / rows;
    const kinds = ["water", "shore", "lowland", "forest", "upland", "summit"];
    const paths = Object.fromEntries(kinds.map((kind) => [kind, ""]));
    for (let row = 0; row < rows; row += 1) {
      const z0 = minZ + row * cellZ;
      for (let column = 0; column < columns; column += 1) {
        const x0 = minX + column * cellX;
        const x = x0 + cellX * 0.5, z = z0 + cellZ * 0.5;
        const radial = Math.sqrt((x * x) / (78 * 78) + (z * z) / (84.24 * 84.24));
        const ridgeDistance = Math.hypot(x + 18, z + 36);
        const height = radial >= 1 ? -2 : ridgeDistance < 22 ? 18 - ridgeDistance * (20 / 22) : -0.3;
        const kind = height <= -1.15 ? "water"
          : height < 1.2 ? "shore"
          : height < 5.5 ? "lowland"
          : height < 12 ? "forest"
          : height < 25 ? "upland" : "summit";
        const w = cellX + 0.035, d = cellZ + 0.035;
        paths[kind] += `M${x0.toFixed(2)} ${z0.toFixed(2)}h${w.toFixed(2)}v${d.toFixed(2)}h-${w.toFixed(2)}Z`;
      }
    }
    onWorldMapUpdate({
      layers: kinds.map((kind) => ({ kind, d: paths[kind] })),
      trees: obstacles.map(({ x, z, radius }) => ({ x, z, scale: radius / 0.65 })),
    });
  }

  const audio = createAudio();
  const keys = new Set();
  const playerRadius = 0.55;
  const islandRadiusX = 76;
  const islandRadiusZ = 81;
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
    sky.material.uniforms.sunPosition.value.copy(sunDirection).multiplyScalar(100);
    sunDisc.position.copy(sunDirection).multiplyScalar(120);
    sunDisc.visible = sunDirection.y > 0.015;
    sunDisc.material.color.setHSL(0.105, 0.78, 0.55 + daylight * 0.18);
    moonDisc.position.copy(sunDirection).multiplyScalar(-120);
    moonDisc.visible = sunDirection.y < 0.02;
    stars.material.uniforms.uTime.value = elapsed;
    stars.material.uniforms.uNight.value = 1 - daylight;
    milkyWay.material.uniforms.uTime.value = elapsed;
    milkyWay.material.uniforms.uNight.value = THREE.MathUtils.smoothstep(-sunHeight, 0.05, 0.42);
    milkyWay.visible = sunHeight < 0.45;
    cloudMaterial.uniforms.uTime.value = elapsed;
    cloudMaterial.uniforms.uDaylight.value = daylight;
    cloudMaterial.uniforms.uSunHeight.value = sunHeight;
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
    ocean.material.uniforms.time.value = elapsed * 0.45;
    ocean.material.uniforms.sunDirection.value.copy(sunDirection).normalize();
    ocean.material.uniforms.sunColor.value.setHSL(0.105, 0.68, 0.5 + daylight * 0.35);
    ocean.material.uniforms.waterColor.value.setHSL(0.53, 0.48, 0.055 + daylight * 0.105);
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
