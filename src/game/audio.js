// Procedural ambience for the first playable build.
// Audio is synthesized locally with Web Audio; no external audio assets are required.
export function createAudio() {
  let context;
  let master;
  let musicBus;
  let effectsBus;
  let started = false;
  let muted = false;
  let volumes = { master: 0.75, music: 0.38, effects: 0.7 };
  let windGain;
  let waveGain;
  let padGain;
  let birdTimer = 0;
  let footstepTimer = 0;
  let noiseBuffer;

  function makeNoiseBuffer(ctx) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function noiseSource(ctx) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    return source;
  }

  function setGain(gain, value, duration = 0.3) {
    if (!context || !gain) return;
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setTargetAtTime(value, context.currentTime, duration);
  }

  function updateVolumes() {
    if (!context) return;
    setGain(master, muted ? 0 : volumes.master, 0.08);
    setGain(musicBus, volumes.music, 0.12);
    setGain(effectsBus, volumes.effects, 0.12);
  }

  function start() {
    if (started) {
      context?.resume?.();
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    context = new AudioContextClass();
    noiseBuffer = makeNoiseBuffer(context);
    master = context.createGain();
    musicBus = context.createGain();
    effectsBus = context.createGain();
    musicBus.connect(master);
    effectsBus.connect(master);
    master.connect(context.destination);

    // A slow, warm, low-register ambient pad: hopeful, spacious, never dominant.
    padGain = context.createGain();
    padGain.gain.value = 0.0001;
    padGain.connect(musicBus);
    [55, 82.41, 110.0, 164.81].forEach((frequency, index) => {
      const osc = context.createOscillator();
      const voice = context.createGain();
      osc.type = index === 1 ? 'triangle' : 'sine';
      osc.frequency.value = frequency;
      osc.detune.value = index % 2 ? -4 : 3;
      voice.gain.value = [0.22, 0.1, 0.12, 0.045][index];
      osc.connect(voice);
      voice.connect(padGain);
      osc.start();
    });
    setGain(padGain, 0.22, 3);

    const wind = noiseSource(context);
    const windFilter = context.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 480;
    windGain = context.createGain();
    windGain.gain.value = 0.0001;
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(effectsBus);
    wind.start();
    setGain(windGain, 0.12, 2);

    const waves = noiseSource(context);
    const waveFilter = context.createBiquadFilter();
    waveFilter.type = 'bandpass';
    waveFilter.frequency.value = 390;
    waveFilter.Q.value = 0.45;
    waveGain = context.createGain();
    waveGain.gain.value = 0.0001;
    waves.connect(waveFilter);
    waveFilter.connect(waveGain);
    waveGain.connect(effectsBus);
    waves.start();
    setGain(waveGain, 0.17, 4);

    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    lfo.frequency.value = 0.075;
    lfoGain.gain.value = 0.09;
    lfo.connect(lfoGain);
    lfoGain.connect(waveGain.gain);
    lfo.start();

    started = true;
    updateVolumes();
    scheduleBird();
  }

  function scheduleBird() {
    if (!started || !context) return;
    birdTimer = window.setTimeout(() => {
      if (started && context && Math.random() > 0.2) playBird();
      scheduleBird();
    }, 9000 + Math.random() * 15000);
  }

  function playBird() {
    if (!context || !started) return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    const startFrequency = 1500 + Math.random() * 700;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFrequency, now);
    osc.frequency.exponentialRampToValueAtTime(startFrequency * (1.3 + Math.random() * 0.3), now + 0.11);
    osc.frequency.exponentialRampToValueAtTime(startFrequency * 0.82, now + 0.32);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.045, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
    osc.connect(gain);
    gain.connect(effectsBus);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  function footstep(surface = 'grass', sprinting = false) {
    if (!context || !started) return;
    const now = context.currentTime;
    const duration = surface === 'sand' ? 0.16 : 0.11;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.value = surface === 'sand' ? 750 : 1250;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(sprinting ? 0.13 : 0.075, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(effectsBus);
    source.start(now, Math.random() * 1.5, duration);
    source.stop(now + duration);
  }

  function updateVolumesPublic(next) {
    volumes = { ...volumes, ...next };
    updateVolumes();
  }

  function setMuted(value) {
    muted = value;
    updateVolumes();
  }

  function dispose() {
    started = false;
    window.clearTimeout(birdTimer);
    if (context && context.state !== 'closed') context.close();
    context = null;
  }

  return { start, footstep, setVolumes: updateVolumesPublic, setMuted, dispose };
}
