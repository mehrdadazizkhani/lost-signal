import { useEffect, useRef, useState } from 'react';
import { createWorld } from './game/createWorld.js';

const controls = [
  { keys: ['W', 'A', 'S', 'D'], label: 'Move' },
  { keys: ['MOUSE'], label: 'Look around' },
  { keys: ['SHIFT'], label: 'Sprint' },
  { keys: ['E'], label: 'Interact' },
];

export default function App() {
  const mountRef = useRef(null);
  const worldRef = useRef(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const world = createWorld(mountRef.current);
    worldRef.current = world;
    return () => {
      world.dispose();
      worldRef.current = null;
    };
  }, []);

  function startGame() {
    setStarted(true);
    // Request pointer lock directly inside the click gesture; browsers may
    // reject pointer-lock requests made later from a React effect.
    worldRef.current?.requestPointerLock();
  }

  return (
    <main className="game-shell">
      <div className="world" ref={mountRef} aria-label="3D island world" />
      <div className="vignette" />

      <header className="hud-top">
        <div className="brand">
          <span className="brand-mark">FIELD NOTES / 01</span>
          <span className="brand-sub">NORTH PACIFIC · UNKNOWN ISLAND</span>
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

      {!started && (
        <div className="start-screen">
          <section className="start-panel">
            <span className="eyebrow">SURVIVAL SIMULATION · BUILD 0.1</span>
            <h1>LOST<br /><span>SIGNAL.</span></h1>
            <p className="intro">
              A storm pushed you onto an uncharted island. The radio is dead.
              The light on the ridge may be your only chance of rescue.
            </p>
            <div className="controls">
              {controls.map(({ keys, label }) => (
                <div className="control-item" key={label}>
                  <div className="key-list">
                    {keys.map((key) => <kbd key={key}>{key}</kbd>)}
                  </div>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <button className="play-button" onClick={startGame}>
              ENTER THE ISLAND <span aria-hidden="true">↗</span>
            </button>
            <p className="hint">Desktop recommended · Click to capture the mouse. Press Esc to release it.</p>
          </section>
        </div>
      )}
    </main>
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
