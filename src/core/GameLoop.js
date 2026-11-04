import { TICK_DT } from '../config/movement.js';

const MAX_FRAME = 0.1;

/**
 * requestAnimationFrame loop with an optional frame cap and a fixed-step accumulator. rAF cannot run
 * faster than the display. "Uncapped" means this code adds no limit of its own, and that is all it means.
 */
export class GameLoop {
  constructor({ onTick, onFrame }) {
    this.onTick = onTick;
    this.onFrame = onFrame;
    this.running = false;
    this.accumulator = 0;
    this.last = 0;
    this.nextFrameAt = 0;
    this.fpsCap = 0;
    this.tickingEnabled = false;
    this.frameTimes = new Float32Array(240);
    this.frameIndex = 0;
    this.frameCount = 0;
    this.lastPresent = 0;
    this.loop = this.loop.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.nextFrameAt = this.last;
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Drops accumulated time. Called on resume, so a pause can never turn into a burst of ticks. */
  resetClock() {
    this.last = performance.now();
    this.accumulator = 0;
  }

  loop(now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);

    if (this.fpsCap > 0) {
      if (now < this.nextFrameAt - 0.5) return;
      const interval = 1000 / this.fpsCap;
      this.nextFrameAt = Math.max(this.nextFrameAt + interval, now - interval);
    }

    const real = (now - this.last) / 1000;
    this.last = now;
    // Long stalls (a hidden tab, a debugger) are dropped rather than simulated.
    const frame = Math.min(real, MAX_FRAME);

    if (this.lastPresent) {
      this.frameTimes[this.frameIndex] = now - this.lastPresent;
      this.frameIndex = (this.frameIndex + 1) % this.frameTimes.length;
      this.frameCount = Math.min(this.frameCount + 1, this.frameTimes.length);
    }
    this.lastPresent = now;

    if (this.tickingEnabled) {
      this.accumulator += frame;
      while (this.accumulator >= TICK_DT) {
        this.onTick();
        this.accumulator -= TICK_DT;
      }
    } else {
      this.accumulator = 0;
    }
    this.onFrame(frame, this.accumulator / TICK_DT);
  }

  /** Mean, 1% worst and max over the recent window, from measured presentation times. */
  frameStats() {
    const n = this.frameCount;
    if (!n) return { fps: 0, avg: 0, p99: 0, max: 0, n: 0 };
    const sorted = Array.from(this.frameTimes.subarray(0, n)).sort((a, b) => a - b);
    const avg = sorted.reduce((a, b) => a + b, 0) / n;
    return { fps: 1000 / avg, avg, p99: sorted[Math.min(n - 1, Math.floor(n * 0.99))], max: sorted[n - 1], n };
  }
}
