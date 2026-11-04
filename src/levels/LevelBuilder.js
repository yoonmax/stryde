/**
 * Authoring API for courses. A level is plain data: collision solids, visual pieces, anchors,
 * checkpoints. The simulation reads the solids and the renderer reads the visuals, so a course can
 * be loaded and played headless in tests by the same code the game runs.
 */

/** Surface rules per material. The look of a surface tells the player what it does. */
export const SURFACES = Object.freeze({
  concrete: { wallrun: true, grapple: false },
  ceramic: { wallrun: true, grapple: false },
  graphite: { wallrun: true, grapple: true },
  metal: { wallrun: false, grapple: true },
  glass: { wallrun: false, grapple: false },
});

// Rapier's shape casts lose accuracy against very large boxes (measured: past about 1.5 km).
const MAX_SOLID_DIMENSION = 700;

const DEG = Math.PI / 180;

/** Quaternion for yaw (Y), then pitch (local X), then roll (local Z). Angles in radians. */
export function quatFromEuler(yaw = 0, pitch = 0, roll = 0) {
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2);
  const cx = Math.cos(pitch / 2), sx = Math.sin(pitch / 2);
  const cz = Math.cos(roll / 2), sz = Math.sin(roll / 2);
  return {
    x: cy * sx * cz + sy * cx * sz,
    y: sy * cx * cz - cy * sx * sz,
    z: cy * cx * sz - sy * sx * cz,
    w: cy * cx * cz + sy * sx * sz,
  };
}

export function rotateByQuat(v, q) {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

const P = (a) => ({ x: a[0], y: a[1], z: a[2] });
const surfaceFor = (mat, opt = {}) => ({
  ...(SURFACES[mat] ?? SURFACES.concrete),
  ...(opt.wallrun !== undefined ? { wallrun: opt.wallrun } : {}),
  ...(opt.grapple !== undefined ? { grapple: opt.grapple } : {}),
  mat,
});

export class LevelBuilder {
  constructor(meta) {
    this.meta = meta;
    this.solids = [];
    this.visuals = [];
    this.anchors = [];
    this.checkpoints = [];
    this.movers = [];
    this.finishZone = null;
    this.spawn = null;
    this.spawnPoints = [];
    this.hints = [];
    this.routeLine = [];
    this.killY = meta.killY ?? -60;
  }

  /** Axis-aligned or rotated block. `at` is the centre. */
  box(at, size, opt = {}) {
    const mat = opt.mat ?? 'concrete';
    const dims = Array.isArray(size) ? size : [size, size, size];
    if (Math.max(...dims) > MAX_SOLID_DIMENSION) throw new Error(`Solid too large for reliable sweeps: ${dims}`);
    const quat = opt.quat ?? (opt.yaw || opt.pitch || opt.roll
      ? quatFromEuler((opt.yaw ?? 0) * DEG, (opt.pitch ?? 0) * DEG, (opt.roll ?? 0) * DEG)
      : null);
    const pos = P(at);
    const sizeV = P(dims);
    if (!opt.visualOnly) {
      this.solids.push({ shape: 'box', pos, size: sizeV, quat: quat ?? undefined, surface: surfaceFor(mat, opt) });
    }
    if (!opt.noVisual) this.visuals.push({ kind: 'box', pos, size: sizeV, quat, mat, chamfer: opt.chamfer ?? 0.05 });
    return this;
  }

  /** Flat slab given its top height and x/z extents. */
  slab(x0, x1, z0, z1, top, opt = {}) {
    const thick = opt.thick ?? 3;
    return this.box(
      [(x0 + x1) / 2, top - thick / 2, (z0 + z1) / 2],
      [Math.abs(x1 - x0), thick, Math.abs(z1 - z0)],
      // The edge of a floor is never a wall to run on. Latching one by accident costs a player the run.
      { wallrun: false, ...opt },
    );
  }

  /** Vertical wall between two ground points. `y0`, `y1` are bottom and top. */
  wall(from, to, y0, y1, opt = {}) {
    const thick = opt.thick ?? 1.2;
    const dx = to[0] - from[0], dz = to[1] - from[1];
    const len = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz) / DEG;
    return this.box(
      [(from[0] + to[0]) / 2, (y0 + y1) / 2, (from[1] + to[1]) / 2],
      [thick, y1 - y0, len],
      { ...opt, yaw },
    );
  }

  /** Sloped slab whose top surface runs exactly from `from` to `to` (centre line). */
  ramp(from, to, width, opt = {}) {
    const thick = opt.thick ?? 2;
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
    const len = Math.hypot(dx, dy, dz);
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.asin(dy / len);
    const quat = quatFromEuler(yaw, pitch, opt.bank ? opt.bank * DEG : 0);
    const n = rotateByQuat({ x: 0, y: 1, z: 0 }, quat);
    return this.box(
      [(from[0] + to[0]) / 2 - n.x * thick / 2, (from[1] + to[1]) / 2 - n.y * thick / 2, (from[2] + to[2]) / 2 - n.z * thick / 2],
      [width, thick, len],
      { ...opt, quat },
    );
  }

  /** Solid cylinder. `at` is the centre of its base. */
  cyl(at, radius, height, opt = {}) {
    const mat = opt.mat ?? 'concrete';
    const pos = { x: at[0], y: at[1] + height / 2, z: at[2] };
    if (!opt.visualOnly) this.solids.push({ shape: 'cylinder', radius, height, pos, surface: surfaceFor(mat, opt) });
    this.visuals.push({ kind: 'cyl', pos, radius, height, mat, segments: opt.segments ?? 64 });
    return this;
  }

  /**
   * Curved wall or curved walkway. One smooth visual; several convex hull colliders.
   * Angles in degrees, measured from +X toward -Z (so increasing angle turns left when seen from above).
   * y may ramp from `y0` to `y1` along the arc, with `height` measured downward from the top surface.
   */
  arc(center, rInner, rOuter, a0, a1, y0, y1, height, opt = {}) {
    const mat = opt.mat ?? 'concrete';
    const span = Math.abs(a1 - a0);
    const segs = opt.segs ?? Math.max(4, Math.ceil(span / 7));
    const point = (r, ang, y) => {
      const t = ang * DEG;
      return [center[0] + Math.cos(t) * r, y, center[1] - Math.sin(t) * r];
    };
    for (let i = 0; i < segs; i++) {
      const u0 = i / segs, u1 = (i + 1) / segs;
      const a = a0 + (a1 - a0) * u0, b = a0 + (a1 - a0) * u1;
      const ya = y0 + (y1 - y0) * u0, yb = y0 + (y1 - y0) * u1;
      const pts = [
        point(rInner, a, ya), point(rOuter, a, ya), point(rInner, b, yb), point(rOuter, b, yb),
        point(rInner, a, ya - height), point(rOuter, a, ya - height), point(rInner, b, yb - height), point(rOuter, b, yb - height),
      ].flat();
      if (!opt.visualOnly) {
        this.solids.push({ shape: 'hull', points: new Float32Array(pts), pos: { x: 0, y: 0, z: 0 }, surface: surfaceFor(mat, opt) });
      }
    }
    this.visuals.push({ kind: 'arc', center, rInner, rOuter, a0, a1, y0, y1, height, mat, segments: Math.max(segs * 3, 24) });
    return this;
  }

  /**
   * Grapple anchor node. A small sphere the assist can lock to.
   * The `mount` describes what the node visually hangs from, purely for looks.
   */
  anchor(at, opt = {}) {
    const radius = opt.radius ?? 0.7;
    const pos = P(at);
    const surface = { grapple: true, wallrun: false, node: true, nodeCenter: pos, mat: 'anchor' };
    this.solids.push({ shape: 'sphere', radius, pos, surface });
    this.anchors.push({ x: pos.x, y: pos.y, z: pos.z, radius, surface, id: this.anchors.length });
    this.visuals.push({ kind: 'anchor', pos, radius, mount: opt.mount ?? 'hanger', mountLength: opt.mountLength ?? 14 });
    return this;
  }

  /** Solid that moves along a closed path as a pure function of simulation time. */
  mover(at, size, path, opt = {}) {
    const mat = opt.mat ?? 'metal';
    const pos = P(at);
    const solid = { shape: 'box', pos, size: P(size), surface: surfaceFor(mat, opt) };
    const mover = { solid, path, mat, anchor: opt.anchor ?? null };
    this.movers.push(mover);
    return this;
  }

  /** @param {number[]} at Point on the floor at the centre of the gate. */
  checkpoint(at, opt = {}) {
    const yaw = (opt.yaw ?? 0) * DEG;
    const width = opt.width ?? 16, height = opt.height ?? 8, depth = opt.depth ?? 2.5;
    const index = this.checkpoints.length;
    this.checkpoints.push({
      index,
      center: { x: at[0], y: at[1] + height / 2, z: at[2] },
      half: { x: width / 2, y: height / 2, z: depth / 2 },
      yaw,
      floorY: at[1],
      respawn: { x: opt.respawn?.[0] ?? at[0], y: (opt.respawn?.[1] ?? at[1]) + 0.05, z: opt.respawn?.[2] ?? at[2] },
      respawnYaw: opt.respawnYaw !== undefined ? opt.respawnYaw * DEG : yaw,
      required: opt.required ?? true,
      label: opt.label ?? null,
    });
    this.visuals.push({ kind: 'gate', pos: P(at), width, height, yaw, role: 'checkpoint', index });
    return this;
  }

  finish(at, opt = {}) {
    const yaw = (opt.yaw ?? 0) * DEG;
    const width = opt.width ?? 18, height = opt.height ?? 10, depth = opt.depth ?? 4;
    this.finishZone = {
      center: { x: at[0], y: at[1] + height / 2, z: at[2] },
      half: { x: width / 2, y: height / 2, z: depth / 2 },
      yaw,
    };
    this.visuals.push({ kind: 'gate', pos: P(at), width, height, yaw, role: 'finish' });
    return this;
  }

  start(at, yawDeg = 0) {
    this.spawn = { pos: { x: at[0], y: at[1] + 0.05, z: at[2] }, yaw: yawDeg * DEG };
    return this;
  }

  /** Named free-run spawn. */
  spawnPoint(name, at, yawDeg = 0) {
    this.spawnPoints.push({ name, pos: { x: at[0], y: at[1] + 0.05, z: at[2] }, yaw: yawDeg * DEG });
    return this;
  }

  /** Text shown once the player reaches this spot in Play mode. */
  hint(at, radius, text) {
    this.hints.push({ pos: P(at), radius, text, keys: extractKeys(text) });
    return this;
  }

  // Decoration: no collision, purely for composition.
  beam(from, to, thickness = 0.35, opt = {}) {
    this.visuals.push({ kind: 'beam', from: P(from), to: P(to), thickness, mat: opt.mat ?? 'metal', round: opt.round ?? false });
    return this;
  }
  cable(from, to, opt = {}) {
    this.visuals.push({ kind: 'beam', from: P(from), to: P(to), thickness: opt.thickness ?? 0.05, mat: 'metal', round: true });
    return this;
  }
  column(at, height, radius = 0.6, opt = {}) {
    this.visuals.push({ kind: 'cyl', pos: { x: at[0], y: at[1] + height / 2, z: at[2] }, radius, height, mat: opt.mat ?? 'concrete', segments: 28 });
    return this;
  }
  mass(at, size, opt = {}) { return this.box(at, size, { ...opt, visualOnly: true, chamfer: opt.chamfer ?? 0.1 }); }
  ring(center, radius, tube, opt = {}) {
    this.visuals.push({ kind: 'ring', center: P(center), radius, tube, yaw: (opt.yaw ?? 0) * DEG, tilt: (opt.tilt ?? 0) * DEG, mat: opt.mat ?? 'concrete', spin: opt.spin ?? 0, section: opt.section ?? 'round' });
    return this;
  }
  /** Thin pale-blue inlay along a line: guidance only. */
  guide(from, to, opt = {}) {
    this.visuals.push({ kind: 'guide', from: P(from), to: P(to), width: opt.width ?? 0.08 });
    return this;
  }

  /** Waypoints for the level-select elevation profile. Purely descriptive. */
  route(points) { this.routeLine = points.map(P); return this; }

  build() {
    if (!this.spawn) throw new Error(`Level ${this.meta.id} has no start`);
    if (!this.meta.freeRun && !this.finishZone) throw new Error(`Level ${this.meta.id} has no finish`);
    return {
      ...this.meta,
      solids: this.solids,
      visuals: this.visuals,
      anchors: this.anchors,
      checkpoints: this.checkpoints,
      movers: this.movers,
      finishZone: this.finishZone,
      spawn: this.spawn,
      spawnPoints: this.spawnPoints,
      hints: this.hints,
      routeLine: this.routeLine,
      killY: this.killY,
    };
  }
}

const extractKeys = (text) => [...text.matchAll(/\[([a-zA-Z]+)\]/g)].map((m) => m[1]);

/** Path helpers for movers. Each returns (t, out) that writes a position. */
export const sinePath = (origin, axis, amplitude, period, phase = 0) => (t, out) => {
  const s = Math.sin((t / period) * Math.PI * 2 + phase) * amplitude;
  out.x = origin[0] + axis[0] * s;
  out.y = origin[1] + axis[1] * s;
  out.z = origin[2] + axis[2] * s;
  return out;
};
