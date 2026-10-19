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

  useEffect(() => {
    let cancelled = false;
    setWorldReady(false);

    createWorld(mountRef.current, {
      onTimeUpdate: ({ time, period }) => {
        setGameTime(time);
        setTimeOfDay(period);
      },
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
