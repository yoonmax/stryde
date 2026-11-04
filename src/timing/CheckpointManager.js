/**
 * Swept segment against an oriented box (slab method). Used for checkpoint and finish volumes so a
 * player moving at any speed cannot skip one between ticks.
 * @returns {number|null} Fraction in [0,1] of the segment where it enters, or null if it misses.
 */
export function segmentEntersZone(from, to, zone) {
  const c = Math.cos(-zone.yaw), s = Math.sin(-zone.yaw);
  const toLocal = (p, out) => {
    const x = p.x - zone.center.x, z = p.z - zone.center.z;
    out[0] = x * c + z * s;
    out[1] = p.y - zone.center.y;
    out[2] = -x * s + z * c;
  };
  const a = [0, 0, 0], b = [0, 0, 0];
  toLocal(from, a);
  toLocal(to, b);
  const half = [zone.half.x, zone.half.y, zone.half.z];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    const d = b[i] - a[i];
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(a[i]) > half[i]) return null;
      continue;
    }
    let near = (-half[i] - a[i]) / d;
    let far = (half[i] - a[i]) / d;
    if (near > far) { const tmp = near; near = far; far = tmp; }
    if (near > t0) t0 = near;
    if (far < t1) t1 = far;
    if (t0 > t1) return null;
  }
  return t0;
}

/**
 * Tracks route progress. Gates are ordered and progress only moves forward. Reaching a later gate counts
 * even if an earlier one was bypassed, so a shortcut or an unusually high line is rewarded rather than
 * voided. That earlier gate's split is simply left empty. The finish only asks for the last required gate.
 */
export class CheckpointManager {
  constructor(level) {
    this.checkpoints = level.checkpoints;
    this.spawn = level.spawn;
    this.lastRequired = -1;
    level.checkpoints.forEach((cp, i) => { if (cp.required) this.lastRequired = i; });
    this.reset();
  }

  reset() { this.current = -1; this.reached = new Array(this.checkpoints.length).fill(false); }

  /** Returns {checkpoint, fraction} for the furthest new gate this segment reaches, if any. */
  test(from, to) {
    let hit = null;
    for (let i = this.current + 1; i < this.checkpoints.length; i++) {
      const f = segmentEntersZone(from, to, this.checkpoints[i]);
      if (f !== null) hit = { checkpoint: this.checkpoints[i], fraction: f };
    }
    if (hit) {
      this.current = hit.checkpoint.index;
      this.reached[this.current] = true;
    }
    return hit;
  }

  get allRequiredReached() { return this.current >= this.lastRequired; }

  get respawn() {
    if (this.current < 0) return { pos: this.spawn.pos, yaw: this.spawn.yaw };
    const cp = this.checkpoints[this.current];
    return { pos: cp.respawn, yaw: cp.respawnYaw };
  }

  get progress() {
    return { reached: this.reached.filter(Boolean).length, total: this.checkpoints.length };
  }
}
