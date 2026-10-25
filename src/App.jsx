import { useEffect, useRef, useState } from 'react';
import { createWorld } from './game/createWorld.js';
import { DEFAULT_WATER_SETTINGS } from './game/waterTuning.js';

const controls = [
  { keys: ['W', 'A', 'S', 'D'], label: 'Move' },
  { keys: ['MOUSE'], label: 'Look around' },
  { keys: ['SHIFT'], label: 'Sprint' },
  { keys: ['ESC'], label: 'Pause / release mouse' },
];

const initialAudio = { master: 75, music: 38, effects: 70 };

export default function App() {
  const mountRef = useRef(null);
  const worldRef = useRef(null);
  const [started, setStarted] = useState(false);
  const [worldReady, setWorldReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasEnteredWorld, setHasEnteredWorld] = useState(false);
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volumes, setVolumes] = useState(initialAudio);
  const [gameTime, setGameTime] = useState('08:00');
  const [timeOfDay, setTimeOfDay] = useState('MORNING');
  const [navigation, setNavigation] = useState({ x: 0, z: 18, yaw: 0 });
  const [worldMap, setWorldMap] = useState(null);
  const [waterSettings, setWaterSettings] = useState({ ...DEFAULT_WATER_SETTINGS });
  const [waterPanelOpen, setWaterPanelOpen] = useState(true);
  const [waterRenderer, setWaterRenderer] = useState('loading');
  const [waterCopied, setWaterCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setWorldReady(false);

    createWorld(mountRef.current, {
      onTimeUpdate: ({ time, period }) => {
        setGameTime(time);
        setTimeOfDay(period);
      },
      onNavigationUpdate: (position) => setNavigation(position),
      onWorldMapUpdate: (mapData) => setWorldMap(mapData),
    }).then((world) => {
      if (cancelled) {
        world.dispose();
        return;
      }
      worldRef.current = world;
      setWaterRenderer(world.rendererType || 'unknown');
      setWorldReady(true);
    }).catch((error) => {
      console.error('LOST SIGNAL could not initialize its renderer.', error);
    });

    return () => {
      cancelled = true;
      worldRef.current?.dispose();
      worldRef.current = null;
      setWorldReady(false);
    };
  }, []);

  useEffect(() => {
    const handlePointerLockChange = () => {
      const locked = Boolean(document.pointerLockElement);
      setIsPointerLocked(locked);
      if (locked) setHasEnteredWorld(true);
    };
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    handlePointerLockChange();
    return () => document.removeEventListener('pointerlockchange', handlePointerLockChange);
  }, []);

  useEffect(() => {
    worldRef.current?.setAudioVolumes({
      master: volumes.master / 100,
      music: volumes.music / 100,
      effects: volumes.effects / 100,
    });
  }, [volumes]);

  useEffect(() => {
    worldRef.current?.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    if (worldReady) worldRef.current?.setWaterParameters?.(waterSettings);
  }, [waterSettings, worldReady]);

  function startGame() {
    if (!worldRef.current) return;
    worldRef.current.startAudio();
    worldRef.current?.requestPointerLock();
    setStarted(true);
    setSettingsOpen(false);
  }

  function resumeGame() {
    worldRef.current?.startAudio();
    worldRef.current?.requestPointerLock();
    setSettingsOpen(false);
  }

  function openSettings() {
    setSettingsOpen(true);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function changeVolume(key, value) {
    setVolumes((current) => ({ ...current, [key]: Number(value) }));
  }

  function changeWaterSetting(key, value) {
    setWaterSettings((current) => ({ ...current, [key]: value }));
    setWaterCopied(false);
  }

  async function copyWaterSettings() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(waterSettings, null, 2));
      setWaterCopied(true);
    } catch (error) {
      console.error('Could not copy water settings.', error);
      setWaterCopied(false);
    }
  }

  return (
    <main className="game-shell">
      <div className="world" ref={mountRef} aria-label="3D island world" />
      <div className="film-grain" />
      <div className="vignette" />

      <section className={`water-lab ${waterPanelOpen ? 'is-open' : 'is-collapsed'}`} aria-label="Live water rendering controls">
        <div className="water-lab-heading">
          <div>
            <span className="water-lab-kicker">RENDER DEBUG / LIVE TUNING</span>
            <h2>WATER <em>LAB</em></h2>
            <span className="water-lab-renderer">{waterRenderer.toUpperCase()} · CHANGES APPLY LIVE</span>
          </div>
          <button className="water-lab-collapse" onClick={() => setWaterPanelOpen((open) => !open)} aria-label={waterPanelOpen ? 'Collapse water controls' : 'Expand water controls'}>{waterPanelOpen ? '−' : '+'}</button>
        </div>
        {waterPanelOpen && (
          <>
            <div className="water-lab-group">
              <span className="water-lab-group-title">SURFACE</span>
              <WaterRange label="Sea level (Y)" value={waterSettings.level} min={-2} max={8} step={0.1} onChange={(v) => changeWaterSetting('level', v)} />
              <WaterRange label="Ocean plane size" value={waterSettings.planeSize} min={1000} max={20000} step={500} onChange={(v) => changeWaterSetting('planeSize', v)} />
              <WaterRange label="Wave detail scale" value={waterSettings.waveDetail} min={0.1} max={5} step={0.1} onChange={(v) => changeWaterSetting('waveDetail', v)} />
              <WaterRange label="Normal strength" value={waterSettings.normalStrength} min={0.2} max={8} step={0.1} onChange={(v) => changeWaterSetting('normalStrength', v)} />
            </div>
            <div className="water-lab-group">
              <span className="water-lab-group-title">LOOK &amp; REFLECTION</span>
              <WaterRange label="Distortion scale" value={waterSettings.distortionScale} min={0} max={12} step={0.1} onChange={(v) => changeWaterSetting('distortionScale', v)} />
              <WaterColor label="Water color" value={waterSettings.waterColor} onChange={(v) => changeWaterSetting('waterColor', v)} />
              <WaterColor label="Sun highlight color" value={waterSettings.sunColor} onChange={(v) => changeWaterSetting('sunColor', v)} />
              {waterRenderer === 'webgl' && <WaterSelect label="Reflection resolution" value={waterSettings.reflectionResolution} options={[128, 256, 512, 1024]} onChange={(v) => changeWaterSetting('reflectionResolution', v)} />}
              {waterRenderer === 'webgpu' && <WaterRange label="Reflection quality scale" value={waterSettings.resolutionScale} min={0.1} max={1} step={0.05} onChange={(v) => changeWaterSetting('resolutionScale', v)} />}
              <WaterRange label="Wave animation speed" value={waterSettings.waveSpeed} min={0} max={2} step={0.05} onChange={(v) => changeWaterSetting('waveSpeed', v)} />
              {waterRenderer === 'webgpu' && <p className="water-lab-note">This control scales the shader's animation time directly. Lower values slow the moving surface pattern.</p>}
            </div>
            <div className="water-lab-group">
              <span className="water-lab-group-title">LIGHT DIRECTION</span>
              <WaterRange label="Sun X" value={waterSettings.sunX} min={-1} max={1} step={0.05} onChange={(v) => changeWaterSetting('sunX', v)} />
              <WaterRange label="Sun Y" value={waterSettings.sunY} min={-1} max={1} step={0.05} onChange={(v) => changeWaterSetting('sunY', v)} />
              <WaterRange label="Sun Z" value={waterSettings.sunZ} min={-1} max={1} step={0.05} onChange={(v) => changeWaterSetting('sunZ', v)} />
            </div>
            <div className="water-lab-actions">
              <button onClick={() => setWaterSettings({ ...DEFAULT_WATER_SETTINGS })}>RESET DEFAULTS</button>
              <button className="water-lab-copy" onClick={copyWaterSettings}>{waterCopied ? 'COPIED ✓' : 'COPY SETTINGS JSON'}</button>
            </div>
            <details className="water-lab-json">
              <summary>View current values</summary>
              <pre>{JSON.stringify(waterSettings, null, 2)}</pre>
            </details>
            <p className="water-lab-note">Tune the scene first, then copy the JSON and send it back. Reflection resolution rebuilds the WebGL water surface and may briefly stutter.</p>
          </>
        )}
      </section>


      {started && (
        <>
          <header className="hud-top">
            <div className="brand">
              <span className="brand-mark">FIELD NOTES / 01</span>
              <span className="brand-sub">NORTH PACIFIC · UNKNOWN ISLAND</span>
            </div>
            <div className="hud-actions">
              <section className="time-card">
                <span className="eyebrow">{timeOfDay}</span>
                <strong>{gameTime}</strong>
              </section>
              <button className="icon-button" onClick={openSettings} aria-label="Open settings" title="Settings">
                <span aria-hidden="true">☼</span>
              </button>
            </div>
            <section className="mission-card">
              <div className="mission-heading"><span className="mission-pulse" /><span className="eyebrow">CURRENT OBJECTIVE</span><span className="mission-index">01 / 03</span></div>
              <strong>Find the signal point</strong>
              <small>Explore the island and locate the beacon.</small>
              <div className="mission-progress"><span /></div>
            </section>
          </header>
          <CompassMap navigation={navigation} worldMap={worldMap} />
          <div className="crosshair" aria-hidden="true" />
          <footer className="hud-bottom">
            <div className="player-status"><div className="player-status-label"><span className="player-status-mark">LS</span><span><strong>FIELD STATUS</strong><small>ISLAND SURVIVOR · DAY 01</small></span></div><div className="stat-row">
              <Stat label="VITALITY" value="100" />
              <Stat label="STAMINA" value="100" />
              <Stat label="SUPPLIES" value="0 / 3" />
            </div></div>
            <section className="field-log"><div className="field-log-heading"><span className="eyebrow">FIELD LOG</span><span className="log-time">08:00 / ENTRY 001</span></div>
              <p>You woke on the beach. Find supplies. Find a way out.</p>
            </section>
            <div className="hud-key-hint"><kbd>ESC</kbd><span>PAUSE</span></div>
          </footer>
        </>
      )}

      {!started && !settingsOpen && (
        <div className="main-menu">
          <div className="menu-atmosphere" />
          <div className="menu-layout">
            <section className="menu-copy">
              <div className="menu-kicker"><span className="status-dot" /> AN ISLAND SURVIVAL STORY</div>
              <h1>LOST<br /><em>SIGNAL.</em></h1>
              <p className="menu-lead">Somewhere between the wreckage and the horizon, there is still a reason to keep going.</p>
              <div className="menu-rule" />
              <p className="menu-description">A quiet journey through an unknown island. Follow the wind. Listen to the ocean. Find the light.</p>
              <button className={`play-button ${!worldReady ? 'is-loading' : ''}`} onClick={startGame} disabled={!worldReady}>
                <span className="play-button-copy"><span className="play-button-kicker">CHAPTER 01</span><strong>{worldReady ? 'BEGIN YOUR JOURNEY' : 'PREPARING THE ISLAND'}</strong></span>
                <span className="play-button-icon" aria-hidden="true">{worldReady ? '↗' : '···'}</span>
              </button>
              <div className="menu-secondary-actions"><button className="text-button" onClick={() => setSettingsOpen(true)}><span className="menu-action-icon">⚙</span> SETTINGS <span>↗</span></button><span className="menu-control-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> MOVE <i>·</i> MOUSE LOOK</span></div>
              <p className="menu-footnote"><span className="footnote-signal" /> HEADPHONES RECOMMENDED <span>·</span> BUILT FOR SOLITUDE</p>
            </section>
            <aside className="menu-side">
              <div className="side-index">01 <span>—</span> THE SHORE</div>
              <div className="side-note">THE SEA REMEMBERS<br />WHAT THE WORLD FORGETS.</div>
              <div className="side-bottom"><span>W A S D</span><span>MOVE THROUGH THE ISLAND</span></div>
            </aside>
          </div>
          <div className="menu-bottomline"><span className="bottom-brand"><span className="bottom-brand-symbol">LS</span> LOST SIGNAL <i>/</i> FIELD STUDY</span><span className="bottom-mantra">NO MAP. NO PROMISES. JUST THE LIGHT.</span><span className="bottom-version"><span className="status-dot" /> BUILD 0.2 <i>·</i> ISLAND SYSTEMS ONLINE</span></div>
        </div>
      )}

      {started && hasEnteredWorld && !isPointerLocked && !settingsOpen && (
        <div className="pause-screen">
          <div className="pause-panel">
            <div className="pause-topline"><span className="eyebrow"><span className="pause-live-dot" /> CONNECTION INTERRUPTED</span><span className="settings-mark">LS / PAUSE</span></div>
            <p className="pause-overline">TAKE A BREATH.</p>
            <h2>The island <em>can wait.</em></h2>
            <p className="pause-description">The wind is still moving. The signal is still out there.</p>
            <button className="play-button pause-resume" onClick={resumeGame}><span className="play-button-copy"><span className="play-button-kicker">RETURN TO YOUR JOURNEY</span><strong>RESUME EXPLORATION</strong></span><span className="play-button-icon" aria-hidden="true">↗</span></button>
            <button className="text-button pause-settings" onClick={openSettings}>SOUND &amp; SETTINGS <span>↗</span></button>
            <div className="pause-footer"><span>PROGRESS SAVES AS YOU EXPLORE</span><span>WASD <i>·</i> MOVE <i>·</i> MOUSE LOOK</span></div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="settings-screen">
          <div className="settings-panel">
            <div className="settings-topline"><span className="eyebrow">PERSONALIZE YOUR JOURNEY</span><span className="settings-mark">LS / 01</span></div>
            <h2>Sound &amp; <em>atmosphere.</em></h2>
            <p className="settings-intro">Keep the island close, or let the silence take over.</p>
            <div className="mute-row">
              <div><strong>MASTER SOUND</strong><small>All music and environmental audio</small></div>
              <button className={`toggle-button ${muted ? 'is-on' : ''}`} onClick={() => setMuted((value) => !value)}>{muted ? 'MUTED' : 'ON'} <span>{muted ? '×' : '●'}</span></button>
            </div>
            <VolumeControl label="MASTER VOLUME" value={volumes.master} onChange={(value) => changeVolume('master', value)} />
            <VolumeControl label="AMBIENT MUSIC" value={volumes.music} onChange={(value) => changeVolume('music', value)} detail="A slow, warm drone beneath the wind and waves" />
            <VolumeControl label="SOUND EFFECTS" value={volumes.effects} onChange={(value) => changeVolume('effects', value)} detail="Ocean, wind, birds and footsteps" />
            <div className="sound-note"><span>♫</span><p>Audio begins after you enter the island. The ambience is generated locally and needs no extra downloads.</p></div>
            <div className="settings-actions">
              <button className="text-button" onClick={() => setSettingsOpen(false)}>BACK</button>
              {started && <button className="play-button resume-button" onClick={resumeGame}>RETURN TO ISLAND <span>↗</span></button>}
              {!started && <button className="play-button resume-button" onClick={() => setSettingsOpen(false)}>SAVE SETTINGS <span>↗</span></button>}
            </div>
            <div className="settings-controls">{controls.map(({ keys, label }) => <div className="settings-control" key={label}><span>{keys.join(' / ')}</span><small>{label}</small></div>)}</div>
          </div>
        </div>
      )}
    </main>
  );
}

function WaterRange({ label, value, min, max, step, onChange }) {
  const formatted = Number(value).toFixed(step < 1 ? 2 : 0);
  return (
    <label className="water-lab-control">
      <span><strong>{label}</strong><output>{String(Number(formatted))}</output></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function WaterColor({ label, value, onChange }) {
  return (
    <label className="water-lab-color">
      <span>{label}<code>{value.toUpperCase()}</code></span>
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function WaterSelect({ label, value, options, onChange }) {
  return (
    <label className="water-lab-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {options.map((option) => <option key={option} value={option}>{option}px</option>)}
      </select>
    </label>
  );
}

function CompassMap({ navigation, worldMap }) {
  const yawDegrees = navigation.yaw * 180 / Math.PI;
  const heading = Math.round(((360 - yawDegrees) % 360 + 360) % 360);
  const [smoothYaw, setSmoothYaw] = useState(0);
  const previousHeading = useRef(0);
  const accumulatedHeading = useRef(0);
  useEffect(() => {
    const delta = ((yawDegrees - previousHeading.current + 540) % 360) - 180;
    accumulatedHeading.current += delta;
    previousHeading.current = yawDegrees;
    setSmoothYaw(accumulatedHeading.current);
  }, [yawDegrees]);

  const scale = 0.55;
  const x = navigation.x || 0;
  const z = navigation.z ?? 18;
  const elevation = Number.isFinite(navigation.y) ? Math.max(0, navigation.y - 1.7) : 0;


  return (
    <section className="compass-map" aria-label={`Compass and terrain minimap, heading ${heading} degrees`}>
      <div className="compass-heading"><span className="compass-live-dot" /><span>HEADING</span><strong>{String(heading).padStart(3, '0')}°</strong><span className="compass-elevation">ELEV {Math.round(elevation)}m</span></div>
      <div className="minimap-frame">
        <div className="minimap-cardinals" style={{ transform: `rotate(${smoothYaw}deg)` }} aria-hidden="true">
          <span className="cardinal-n">N</span><span className="cardinal-e">E</span><span className="cardinal-s">S</span><span className="cardinal-w">W</span>
        </div>
        <svg className="minimap-svg" viewBox="0 0 200 200" role="img" aria-label="Topographic island map with irregular coastline, elevation contours, rocky ridges and trees">
          <defs>
            <clipPath id="minimap-clip"><circle cx="100" cy="100" r="94" /></clipPath>
            <radialGradient id="minimap-water"><stop offset="0%" stopColor="#173b3b" /><stop offset="100%" stopColor="#06100e" /></radialGradient>
            <linearGradient id="minimap-land" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#87916a" /><stop offset="45%" stopColor="#667b58" /><stop offset="100%" stopColor="#3d5d48" />
            </linearGradient>
            <linearGradient id="minimap-relief" x1="0" y1="0" x2="0.9" y2="1">
              <stop offset="0%" stopColor="#c0bca0" stopOpacity=".88" /><stop offset="48%" stopColor="#777e70" stopOpacity=".44" /><stop offset="100%" stopColor="#2e493a" stopOpacity=".06" />
            </linearGradient>
          </defs>
          <circle cx="100" cy="100" r="98" className="minimap-rim" />
          <g clipPath="url(#minimap-clip)">
            <circle cx="100" cy="100" r="94" fill="url(#minimap-water)" />
            <g className="minimap-rotating-layer" transform={`rotate(${smoothYaw} 100 100) translate(${-x * scale} ${-z * scale})`}>
              <g transform={`translate(100 100) scale(${scale})`}>
                {worldMap?.layers?.map((layer) => (
                  <path key={layer.kind} d={layer.d} className={`minimap-height-layer minimap-layer-${layer.kind}`} />
                ))}
                {worldMap?.trees?.map((tree, i) => (
                  <circle key={i} cx={tree.x} cy={tree.z} r={0.75 + tree.scale * 0.16} className={i % 4 === 0 ? "minimap-tree-light" : "minimap-tree"} />
                ))}
              </g>
            </g>
          </g>
          <circle cx="100" cy="100" r="93" className="minimap-inner-rim" />
        </svg>
      </div>
    </section>
  );
}

function VolumeControl({ label, value, onChange, detail }) {
  return (
    <label className="volume-control">
      <span className="volume-heading"><strong>{label}</strong><span>{value}%</span></span>
      <input type="range" min="0" max="100" step="1" value={value} onChange={(event) => onChange(event.target.value)} />
      {detail && <small>{detail}</small>}
    </label>
  );
}

function Stat({ label, value }) {
  return (
    <section className="stat-card">
      <div className="stat-label"><span>{label}</span><span>{value}</span></div>
      <div className="stat-track"><span /></div>
    </section>
  );
}
