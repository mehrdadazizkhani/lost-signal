import * as THREE from 'three';
import { createAudio } from './audio.js';

export function createWorld(container, { onTimeUpdate = () => {} } = {}) {
  const scene = new THREE.Scene();
  const daySky = new THREE.Color('#9bb7b5');
  const duskSky = new THREE.Color('#bd886b');
  const nightSky = new THREE.Color('#101b31');
  scene.background = daySky.clone();
  const fog = new THREE.FogExp2(daySky.clone(), 0.012);
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(72, container.clientWidth / Math.max(container.clientHeight, 1), 0.1, 500);
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

  const oceanMaterial = new THREE.MeshStandardMaterial({ color: 0x315e69, roughness: 0.24, metalness: 0.12 });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), oceanMaterial);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -1.15;
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

  const treeTrunk = new THREE.CylinderGeometry(0.18, 0.3, 3.2, 6);
  const treeCrown = new THREE.ConeGeometry(1.8, 4.5, 7);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x493d2c, roughness: 1 });
  const crownMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x263f31, roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: 0x3d5940, roughness: 1 }),
  ];
  const obstacles = [];
  for (let i = 0; i < 100; i += 1) {
    const x = (Math.random() - 0.5) * 120;
    const z = (Math.random() - 0.5) * 125;
    if (Math.hypot(x, z - 16) < 13 || Math.hypot(x - 2, z + 43) < 10) continue;
    const scale = 0.7 + Math.random() * 0.7;
    const trunk = new THREE.Mesh(treeTrunk, trunkMaterial);
    trunk.position.set(x, 1.3, z);
    trunk.scale.setScalar(scale);
    trunk.castShadow = true;
    scene.add(trunk);
    const crown = new THREE.Mesh(treeCrown, crownMaterials[i % crownMaterials.length]);
    crown.position.set(x, 4.5, z);
    crown.scale.setScalar(scale);
    crown.castShadow = true;
    scene.add(crown);
    obstacles.push({ x, z, radius: 0.65 * scale });
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
    const phase = (hours + minutes / 60) / 24;
    const daylight = THREE.MathUtils.clamp(Math.sin((phase - 0.25) * Math.PI * 2) * 0.5 + 0.5, 0.035, 1);
    const sunHeight = Math.sin((phase - 0.25) * Math.PI * 2);
    sun.position.set(Math.cos(phase * Math.PI * 2) * 70, sunHeight * 85, Math.sin(phase * Math.PI * 2) * 55);
    sun.intensity = 0.08 + daylight * 2.7;
    sun.color.setHSL(0.09 - daylight * 0.045, 0.58, 0.6 + daylight * 0.08);
    hemi.intensity = 0.18 + daylight * 1.7;
    moon.intensity = 0.12 + (1 - daylight) * 0.55;
    beaconLight.intensity = 25 + (1 - daylight) * 12 + Math.sin(elapsed * 2.5) * 4;
    lampMaterial.emissiveIntensity = 2.2 + Math.sin(elapsed * 2.5) * 0.5;
    if (sunHeight < -0.18) color.copy(nightSky);
    else if (sunHeight < 0.12) color.copy(nightSky).lerp(duskSky, (sunHeight + 0.18) / 0.3);
    else color.copy(duskSky).lerp(daySky, THREE.MathUtils.clamp((sunHeight - 0.12) / 0.5, 0, 1));
    scene.background.copy(color);
    fog.color.copy(color);
    oceanMaterial.color.setHSL(0.53, 0.38, 0.12 + daylight * 0.1);
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
