/**
 * Reusable architectural moves. These are visual masses with no collision unless stated: the route's
 * collision stays simple and readable, while the buildings around it provide scale and landmarks.
 * Everything takes an existing LevelBuilder, so a course reads as a list of decisions.
 */

/** The deck far below everything. Piers run down past it, so structures appear to rise from cloud. */
const FOUNDATION = -240;

/** Massive pier from under a slab to below the clouds. Stepped once, like a load path made visible. */
export function pier(b, x, z, top, w = 8, d = 8, opt = {}) {
  const mat = opt.mat ?? 'concrete';
  const shoulder = top - (opt.shoulder ?? 46);
  b.mass([x, (top + shoulder) / 2, z], [w, top - shoulder, d], { mat });
  b.mass([x, (shoulder + FOUNDATION) / 2, z], [w * 1.3, shoulder - FOUNDATION, d * 1.3], { mat, chamfer: 0.2 });
}

/** Slender round columns in a line. */
export function colonnade(b, from, to, count, top, radius = 0.55, opt = {}) {
  const base = opt.base ?? top - 60;
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0;
    const x = from[0] + (to[0] - from[0]) * t, z = from[1] + (to[1] - from[1]) * t;
    b.column([x, base, z], top - base, radius);
  }
}

/** Monolith: a tower with one tall dark slot cut in its face, the main landmark vocabulary. */
export function monolith(b, x, z, w, d, top, opt = {}) {
  const yaw = opt.yaw ?? 0;
  b.mass([x, (top + FOUNDATION) / 2, z], [w, top - FOUNDATION, d], { mat: opt.mat ?? 'concrete', yaw, chamfer: 0.3 });
  if (opt.slot !== false) {
    const rad = (yaw * Math.PI) / 180;
    const sw = w * (opt.slotWidth ?? 0.09);
    const off = (d / 2 + 0.05);
    const nx = Math.sin(rad) * off, nz = Math.cos(rad) * off;
    const h = (opt.slotHeight ?? 0.5) * (top - FOUNDATION);
    b.mass([x + nx, top - h / 2 - 8, z + nz], [sw, h, 0.5], { mat: 'graphite', yaw });
    b.mass([x - nx, top - h / 2 - 8, z - nz], [sw, h, 0.5], { mat: 'graphite', yaw });
  }
}

/** A thin fin wall, used in series to give speed parallax beside a route. */
export function fins(b, from, to, count, y0, y1, opt = {}) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len, nz = dx / len;
  const depth = opt.depth ?? 4;
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0;
    const x = from[0] + dx * t, z = from[1] + dz * t;
    const h = opt.vary ? y1 - (y1 - y0) * 0.45 * (0.5 + 0.5 * Math.sin(i * 1.7)) : y1;
    b.mass([x + (nx * depth) / 2, (y0 + h) / 2, z + (nz * depth) / 2], [0.4, h - y0, depth], { mat: opt.mat ?? 'concrete', yaw: (Math.atan2(nx, nz) * 180) / Math.PI });
  }
}

/** Open steel truss between two points: two chords with diagonal webbing. */
export function truss(b, from, to, depth = 2, panels = 12, opt = {}) {
  const thick = opt.thickness ?? 0.16;
  const at = (t, off) => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t + off, from[2] + (to[2] - from[2]) * t];
  b.beam(at(0, 0), at(1, 0), thick * 1.4);
  b.beam(at(0, -depth), at(1, -depth), thick * 1.4);
  for (let i = 0; i < panels; i++) {
    const a = i / panels, c = (i + 1) / panels;
    b.beam(at(a, 0), at(c, -depth), thick);
    b.beam(at(c, -depth), at(c, 0), thick);
  }
}

/** Suspension cables fanning from a mast point down to a deck edge. */
export function cableFan(b, mast, deckPoints) {
  for (const p of deckPoints) b.cable(mast, p, { thickness: 0.05 });
}

/** Low parapet line along an edge: no collision, thin ceramic cap, reads as a built edge. */
export function parapet(b, from, to, y, opt = {}) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const yaw = (Math.atan2(dx, dz) * 180) / Math.PI;
  b.mass([(from[0] + to[0]) / 2, y - 0.1, (from[1] + to[1]) / 2], [opt.width ?? 0.35, 0.2, len], { mat: opt.mat ?? 'ceramic', yaw, chamfer: 0.02 });
}

/** Guidance inlay running along the floor of a route segment. */
export function guideLine(b, from, to, y) {
  b.guide([from[0], y + 0.015, from[1]], [to[0], y + 0.015, to[1]], { width: 0.045 });
}

/** Ceramic-clad stair mass as pure massing. No collision: it suggests that this place is inhabited. */
export function stepMass(b, x, z, y, steps, stepRun, stepRise, width, yaw = 0) {
  const rad = (yaw * Math.PI) / 180;
  for (let i = 0; i < steps; i++) {
    const r = i * stepRun;
    b.mass([x + Math.sin(rad) * r, y + (i + 0.5) * stepRise - 30, z + Math.cos(rad) * r], [width, (i + 1) * stepRise + 60, stepRun], { mat: 'ceramic', yaw, chamfer: 0.02 });
  }
}
