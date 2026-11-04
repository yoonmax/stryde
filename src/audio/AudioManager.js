/**
 * All audio is synthesised at runtime with the Web Audio API: noise bursts through filters, sine and
 * triangle tones with short envelopes, and looped filtered noise for wind and friction. There are no
 * sample files and so no licensing question. Buses: master, then movement, ui and ambient.
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.footSide = 0;
  }

  /** Creates the context. Browsers require a user gesture before audio can start. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.master = c.createGain();
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;
    this.master.connect(limiter).connect(c.destination);
    this.movement = c.createGain();
    this.ui = c.createGain();
    this.ambient = c.createGain();
    this.movement.connect(this.master);
    this.ui.connect(this.master);
    this.ambient.connect(this.master);

    this.noise = this.makeNoise(2);
    this.brown = this.makeBrown(4);
    this.buildLoops();
    this.enabled = true;
    if (this.pendingVolumes) this.setVolumes(this.pendingVolumes);
  }

  setVolumes({ master, movement, ui, ambient }) {
    this.pendingVolumes = { master, movement, ui, ambient };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(master, t, 0.02);
    this.movement.gain.setTargetAtTime(movement, t, 0.02);
    this.ui.gain.setTargetAtTime(ui, t, 0.02);
    this.ambient.gain.setTargetAtTime(ambient, t, 0.02);
  }

  makeNoise(seconds) {
    const c = this.ctx;
    const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  makeBrown(seconds) {
    const c = this.ctx;
    const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }

  loopNoise(buffer, filterType, freq, Q, out) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = Q;
    const gain = c.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(out);
    src.start();
    return { src, filter, gain };
  }

  buildLoops() {
    const c = this.ctx;
    this.wind = this.loopNoise(this.noise, 'bandpass', 500, 0.6, this.movement);
    this.slideLoop = this.loopNoise(this.noise, 'bandpass', 1800, 0.9, this.movement);
    this.wallLoop = this.loopNoise(this.noise, 'bandpass', 1100, 1.4, this.movement);

    // Cable tension: a filtered low saw that sits under the wind, only when the rope is taut.
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 62;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 340;
    filter.Q.value = 3;
    const gain = c.createGain();
    gain.gain.value = 0;
    osc.connect(filter).connect(gain).connect(this.movement);
    osc.start();
    this.rope = { osc, filter, gain };

    // Ambience: high-altitude air, plus two detuned low tones so slow they read as space, not music.
    this.airLoop = this.loopNoise(this.brown, 'lowpass', 420, 0.2, this.ambient);
    this.airLoop.gain.gain.value = 0.34;
    const drone = c.createGain();
    drone.gain.value = 0.02;
    drone.connect(this.ambient);
    for (const f of [73.4, 110.2, 146.6]) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.value = 0.5;
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.03 + f * 0.0002;
      const lfoGain = c.createGain();
      lfoGain.gain.value = 0.4;
      lfo.connect(lfoGain).connect(g.gain);
      o.connect(g).connect(drone);
      o.start();
      lfo.start();
    }
  }

  /** Continuous sounds follow simulation state once per frame. */
  updateLoops(state) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const { speed, sliding, wallRunning, grappleTension, attached, active } = state;
    const s = Math.min(1, speed / 42);
    const on = active ? 1 : 0;
    this.wind.gain.gain.setTargetAtTime(on * (s * s * 0.5 + (speed > 8 ? 0.012 : 0)), t, 0.08);
    this.wind.filter.frequency.setTargetAtTime(280 + s * 1500, t, 0.1);
    this.slideLoop.gain.gain.setTargetAtTime(on * (sliding ? 0.06 + s * 0.2 : 0), t, sliding ? 0.015 : 0.05);
    this.slideLoop.filter.frequency.setTargetAtTime(1200 + s * 1800, t, 0.08);
    this.wallLoop.gain.gain.setTargetAtTime(on * (wallRunning ? 0.05 + s * 0.08 : 0), t, 0.03);
    const tension = attached ? grappleTension : 0;
    this.rope.gain.gain.setTargetAtTime(on * tension * 0.05, t, 0.04);
    this.rope.osc.frequency.setTargetAtTime(58 + tension * 44, t, 0.05);
    this.rope.filter.frequency.setTargetAtTime(240 + tension * 720, t, 0.05);
  }

  burst({ buffer = this.noise, type = 'lowpass', freq = 800, Q = 0.7, gain = 0.3, attack = 0.002, decay = 0.1, sweepTo = null, out = this.movement, delay = 0 }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.loopStart = 0;
    const offset = Math.random() * 1.2;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay);
    f.Q.value = Q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(f).connect(g).connect(out);
    src.start(t, offset);
    src.stop(t + attack + decay + 0.03);
  }

  tone({ type = 'sine', freq = 440, to = null, gain = 0.2, attack = 0.002, decay = 0.2, out = this.movement, delay = 0 }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + attack + decay + 0.03);
  }

  footstep(speed) {
    const s = Math.min(1, speed / 14);
    this.footSide = 1 - this.footSide;
    const pitch = this.footSide ? 1 : 0.88;
    this.burst({ freq: 260 * pitch, gain: 0.11 + s * 0.09, decay: 0.05, Q: 0.8 });
    this.burst({ type: 'highpass', freq: 3000 * pitch, gain: 0.018 + s * 0.02, decay: 0.022 });
  }

  /** Discrete sim events. A single dispatch point keeps the mix in one place. */
  onEvent(e) {
    if (!this.ctx) return;
    switch (e.type) {
      case 'jump':
        this.burst({ type: 'bandpass', freq: 520, sweepTo: 1000, gain: 0.08, decay: 0.09, Q: 0.8 });
        if (e.hop === 'perfect') this.tone({ type: 'sine', freq: 1320, gain: 0.018, decay: 0.08 });
        break;
      case 'land': {
        const k = Math.min(1, e.impact / 24);
        this.burst({ freq: 170 + k * 60, gain: 0.14 + k * 0.32, decay: 0.08 + k * 0.1, Q: 0.7 });
        this.tone({ freq: 66 + k * 18, to: 44, gain: 0.05 + k * 0.2, decay: 0.09 + k * 0.1 });
        break;
      }
      case 'slide-start':
        this.burst({ type: 'bandpass', freq: 2400, sweepTo: 1200, gain: 0.08, attack: 0.01, decay: 0.16, Q: 0.6 });
        break;
      case 'wall-enter':
        this.burst({ freq: 700, gain: 0.08, decay: 0.05 });
        this.tone({ freq: 240, to: 180, gain: 0.04, decay: 0.05 });
        break;
      case 'wall-jump':
        this.burst({ type: 'bandpass', freq: 900, sweepTo: 2000, gain: 0.1, decay: 0.09 });
        this.burst({ freq: 200, gain: 0.1, decay: 0.05 });
        break;
      case 'vault':
        this.burst({ freq: 400, gain: 0.07, decay: 0.06 });
        break;
      case 'grapple-attach':
        // Fire then bite. Both are immediate. The bite is a small metallic tick with a short ring.
        this.burst({ type: 'bandpass', freq: 3800, sweepTo: 1200, gain: 0.08, decay: 0.05, Q: 1.2 });
        this.tone({ type: 'triangle', freq: 1760, to: 1100, gain: 0.05, decay: 0.05, delay: 0.015 });
        this.tone({ type: 'sine', freq: 830, gain: 0.05, decay: 0.2, delay: 0.02 });
        this.burst({ freq: 180, gain: 0.1, decay: 0.05, delay: 0.015 });
        break;
      case 'grapple-miss':
        this.tone({ type: 'triangle', freq: 300, to: 220, gain: 0.03, decay: 0.05 });
        break;
      case 'grapple-release':
        this.burst({ type: 'highpass', freq: 2600, gain: 0.03, decay: 0.06 });
        this.tone({ type: 'sine', freq: 620, to: 880, gain: 0.018, decay: 0.05 });
        break;
      case 'dash':
        this.burst({ type: 'bandpass', freq: 500, sweepTo: 3400, gain: 0.2, attack: 0.008, decay: 0.2, Q: 0.7 });
        this.tone({ freq: 140, to: 74, gain: 0.08, decay: 0.12 });
        break;
      case 'dash-denied':
        this.tone({ type: 'triangle', freq: 170, gain: 0.03, decay: 0.05 });
        break;
      case 'dash-refill':
        this.tone({ type: 'sine', freq: 1480, gain: 0.012, decay: 0.05 });
        break;
      case 'checkpoint':
        this.tone({ freq: 880, gain: 0.05, decay: 0.32, out: this.ui });
        this.tone({ freq: 1318.5, gain: 0.04, decay: 0.4, delay: 0.05, out: this.ui });
        this.burst({ type: 'highpass', freq: 5000, gain: 0.02, decay: 0.2, out: this.ui });
        break;
      case 'finish':
        [659.25, 880, 987.77, 1318.5].forEach((f, i) => {
          this.tone({ freq: f, gain: 0.06, decay: 0.8, delay: i * 0.07, out: this.ui });
        });
        this.burst({ type: 'highpass', freq: 3000, gain: 0.05, attack: 0.05, decay: 0.8, out: this.ui });
        break;
      case 'respawn':
        this.burst({ type: 'bandpass', freq: 1500, sweepTo: 300, gain: 0.08, attack: 0.01, decay: 0.2, Q: 0.7 });
        break;
      case 'count':
        this.tone({ freq: 660, gain: 0.05, decay: 0.09, out: this.ui });
        break;
      case 'go':
        this.tone({ freq: 1320, gain: 0.07, decay: 0.3, out: this.ui });
        break;
      default:
    }
  }

  uiHover() { this.tone({ type: 'sine', freq: 2100, gain: 0.012, decay: 0.022, out: this.ui }); }
  uiConfirm() {
    this.tone({ type: 'sine', freq: 880, gain: 0.04, decay: 0.07, out: this.ui });
    this.tone({ type: 'sine', freq: 1320, gain: 0.03, decay: 0.11, delay: 0.035, out: this.ui });
  }
  uiBack() { this.tone({ type: 'sine', freq: 660, to: 440, gain: 0.035, decay: 0.08, out: this.ui }); }

  dispose() { this.ctx?.close(); this.ctx = null; }
}
