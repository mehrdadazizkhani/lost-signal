import { useEffect, useRef, useState } from 'react';
import { createWorld } from './game/createWorld.js';

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
  const [muted, setMuted] = useState(false);
  const [volumes, setVolumes] = useState(initialAudio);
  const [gameTime, setGameTime] = useState('08:00');
  const [timeOfDay, setTimeOfDay] = useState('MORNING');
  const [navigation, setNavigation] = useState({ x: 0, z: 18, yaw: 0 });
  const [worldMap, setWorldMap] = useState(null);

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
    worldRef.current?.setAudioVolumes({
      master: volumes.master / 100,
      music: volumes.music / 100,
      effects: volumes.effects / 100,
    });
  }, [volumes]);

  useEffect(() => {
    worldRef.current?.setMuted(muted);
  }, [muted]);

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

  return (
    <main className="game-shell">
      <div className="world" ref={mountRef} aria-label="3D island world" />
      <div className="film-grain" />
      <div className="vignette" />

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
              <span className="eyebrow">PRIMARY OBJECTIVE</span>
              <strong>Find the signal point</strong>
              <small>Explore the island and locate the beacon.</small>
            </section>
          </header>
          <CompassMap navigation={navigation} worldMap={worldMap} />
          <div className="crosshair" aria-hidden="true" />
          <footer className="hud-bottom">
            <div className="stat-row">
              <Stat label="VITALITY" value="100" />
              <Stat label="STAMINA" value="100" />
              <Stat label="SUPPLIES" value="0 / 3" />
            </div>
            <section className="field-log">
              <span className="eyebrow">FIELD LOG</span>
              <p>You woke on the beach. Find supplies. Find a way out.</p>
            </section>
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
              <button className="play-button" onClick={startGame} disabled={!worldReady}>BEGIN YOUR JOURNEY <span aria-hidden="true">↗</span></button>
              <button className="text-button" onClick={() => setSettingsOpen(true)}>SETTINGS <span>＋</span></button>
              <p className="menu-footnote">HEADPHONES RECOMMENDED · BUILT FOR SOLITUDE</p>
            </section>
            <aside className="menu-side">
              <div className="side-index">01 <span>—</span> THE SHORE</div>
              <div className="side-note">THE SEA REMEMBERS<br />WHAT THE WORLD FORGETS.</div>
              <div className="side-bottom"><span>W A S D</span><span>MOVE THROUGH THE ISLAND</span></div>
            </aside>
          </div>
          <div className="menu-bottomline"><span>LOST SIGNAL / FIELD STUDY</span><span>NO MAP. NO PROMISES. JUST THE LIGHT.</span><span>VER. 0.2</span></div>
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
