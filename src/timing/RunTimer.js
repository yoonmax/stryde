/**
 * Run time is counted in simulation ticks, not read from a wall clock. The tick accumulator is
 * driven by the monotonic performance.now(), and ticks simply do not happen while paused or
 * hidden, so pausing, tab switches and slow frames cannot corrupt a time.
 *
 * Start: the first tick after the countdown ends. Stop: the moment inside the tick at which the
 * player's swept path enters the finish volume, so resolution is finer than the 8.3 ms tick.
 */
export class RunTimer {
  constructor(dt) {
    this.dt = dt;
    this.reset();
  }

  reset() {
    this.ticks = 0;
    this.running = false;
    this.finished = false;
    this.finalTime = 0;
    this.splits = [];
  }

  start() { this.ticks = 0; this.running = true; this.finished = false; this.finalTime = 0; this.splits = []; }

  tick() { if (this.running) this.ticks++; }

  /** Elapsed seconds at the end of the current tick, or the final time once finished. */
  get elapsed() { return this.finished ? this.finalTime : this.ticks * this.dt; }

  /** Time for an event that happened at fraction `f` through the current tick. */
  timeAt(f = 1) { return Math.max(0, this.ticks - 1 + f) * this.dt; }

  split(index, f = 1) {
    const time = this.timeAt(f);
    this.splits[index] = time;
    return time;
  }

  stop(f = 1) {
    if (!this.running) return this.finalTime;
    this.finalTime = this.timeAt(f);
    this.running = false;
    this.finished = true;
    return this.finalTime;
  }
}

/** Formats seconds as m:ss.mmm, or s.mmm under a minute. */
export function formatTime(t, { sign = false, decimals = 3 } = {}) {
  if (t === null || t === undefined || !Number.isFinite(t)) return '--:--';
  const neg = t < 0;
  const abs = Math.abs(t);
  const scale = 10 ** decimals;
  const total = Math.floor(abs * scale + 1e-6);
  const minutes = Math.floor(total / (60 * scale));
  const seconds = Math.floor(total / scale) % 60;
  const frac = (total % scale).toString().padStart(decimals, '0');
  const body = minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, '0')}.${frac}` : `${seconds}.${frac}`;
  return `${neg ? '−' : sign ? '+' : ''}${body}`;
}
