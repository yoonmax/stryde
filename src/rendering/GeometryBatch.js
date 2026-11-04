import * as THREE from 'three';

/**
 * Accumulates world-space geometry for one material in one spatial cell, then bakes a single
 * BufferGeometry. One draw call per material per cell: distant cells get frustum-culled together.
 */
export class GeometryBatch {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
    this.indices = [];
    this.count = 0;
  }

  /** Adds a vertex and returns its index. `ao` is a brightness multiplier baked into vertex colour. */
  vertex(x, y, z, nx, ny, nz, u, v, ao = 1) {
    this.positions.push(x, y, z);
    this.normals.push(nx, ny, nz);
    this.uvs.push(u, v);
    this.colors.push(ao, ao, ao);
    return this.count++;
  }

  tri(a, b, c) { this.indices.push(a, b, c); }
  quad(a, b, c, d) { this.indices.push(a, b, c, a, c, d); }

  bake() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.indices, 1) : new THREE.Uint16BufferAttribute(this.indices, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    // Tangents come from screen-space derivatives in the shader; no vertex tangents needed.
    return g;
  }
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

/**
 * Chamfered box. The chamfer is only a few centimetres, but a small slanted strip catches the sun and
 * draws a bright hairline along every edge. It costs little and removes the look of raw primitives.
 */
export function pushBox(batch, { pos, size, quat, chamfer = 0.05 }, tile) {
  if (quat) _q.set(quat.x, quat.y, quat.z, quat.w); else _q.identity();
  const hx = size.x / 2, hy = size.y / 2, hz = size.z / 2;
  const c = Math.min(chamfer, hx * 0.4, hy * 0.4, hz * 0.4);
  const offs = (pos.x * 0.37 + pos.y * 0.11 + pos.z * 0.53) / tile;

  const emit = (lx, ly, lz, nx, ny, nz, u, v, ao) => {
    _v.set(lx, ly, lz).applyQuaternion(_q);
    _n.set(nx, ny, nz).applyQuaternion(_q);
    return batch.vertex(_v.x + pos.x, _v.y + pos.y, _v.z + pos.z, _n.x, _n.y, _n.z, u / tile + offs, v / tile + offs * 0.7, ao);
  };

  // Vertical gradient: bases read grounded, tops read sunlit. Undersides are dim.
  const aoSide = (ly) => (hy > 2 ? 0.78 + 0.22 * Math.min(1, (ly + hy) / Math.min(hy * 2, 10)) : 1);

  const faces = [
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], hu: hz, hv: hy, d: hx },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], hu: hz, hv: hy, d: hx },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], hu: hx, hv: hz, d: hy },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], hu: hx, hv: hz, d: hy },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], hu: hx, hv: hy, d: hz },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], hu: hx, hv: hy, d: hz },
  ];

  const faceCorner = (f, su, sv, inset = c) => [
    f.n[0] * f.d + f.u[0] * su * (f.hu - inset) + f.v[0] * sv * (f.hv - inset),
    f.n[1] * f.d + f.u[1] * su * (f.hu - inset) + f.v[1] * sv * (f.hv - inset),
    f.n[2] * f.d + f.u[2] * su * (f.hu - inset) + f.v[2] * sv * (f.hv - inset),
  ];

  const faceIndex = [];
  for (const f of faces) {
    const idx = [];
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = faceCorner(f, su, sv);
      const u = su * (f.hu - c), v = sv * (f.hv - c);
      let ao = f.n[1] < -0.5 ? 0.6 : f.n[1] > 0.5 ? 1 : aoSide(p[1]);
      idx.push(emit(p[0], p[1], p[2], f.n[0], f.n[1], f.n[2], u, v, ao));
    }
    batch.quad(idx[0], idx[1], idx[2], idx[3]);
    faceIndex.push(idx);
  }

  if (c <= 0.001) return;

  // Chamfer strips: a pair of vertices at each end of each edge with a shared diagonal normal.
  const edge = (a, b, nx, ny, nz) => {
    const l = Math.hypot(nx, ny, nz);
    const ao = ny / l < -0.3 ? 0.65 : 1;
    const i0 = emit(a[0][0], a[0][1], a[0][2], nx / l, ny / l, nz / l, a[0][0] + a[0][2], a[0][1], ao);
    const i1 = emit(a[1][0], a[1][1], a[1][2], nx / l, ny / l, nz / l, a[1][0] + a[1][2], a[1][1], ao);
    const i2 = emit(b[1][0], b[1][1], b[1][2], nx / l, ny / l, nz / l, b[1][0] + b[1][2], b[1][1], ao);
    const i3 = emit(b[0][0], b[0][1], b[0][2], nx / l, ny / l, nz / l, b[0][0] + b[0][2], b[0][1], ao);
    batch.quad(i0, i1, i2, i3);
  };

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      // Edges along z.
      const a = [[sx * hx, sy * (hy - c), -(hz - c)], [sx * hx, sy * (hy - c), hz - c]];
      const b = [[sx * (hx - c), sy * hy, -(hz - c)], [sx * (hx - c), sy * hy, hz - c]];
      if (sx * sy > 0) edge(a, b, sx, sy, 0); else edge(b, a, sx, sy, 0);
    }
    for (const sz of [-1, 1]) {
      // Edges along y.
      const a = [[sx * hx, -(hy - c), sz * (hz - c)], [sx * hx, hy - c, sz * (hz - c)]];
      const b = [[sx * (hx - c), -(hy - c), sz * hz], [sx * (hx - c), hy - c, sz * hz]];
      if (sx * sz < 0) edge(a, b, sx, 0, sz); else edge(b, a, sx, 0, sz);
    }
  }
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // Edges along x.
      const a = [[-(hx - c), sy * hy, sz * (hz - c)], [hx - c, sy * hy, sz * (hz - c)]];
      const b = [[-(hx - c), sy * (hy - c), sz * hz], [hx - c, sy * (hy - c), sz * hz]];
      if (sy * sz > 0) edge(a, b, 0, sy, sz); else edge(b, a, 0, sy, sz);
    }
  }
  // Corner triangles.
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const l = Math.sqrt(3);
        const nx = sx / l, ny = sy / l, nz = sz / l;
        const i0 = emit(sx * hx, sy * (hy - c), sz * (hz - c), nx, ny, nz, 0, 0, 1);
        const i1 = emit(sx * (hx - c), sy * hy, sz * (hz - c), nx, ny, nz, 0, 0, 1);
        const i2 = emit(sx * (hx - c), sy * (hy - c), sz * hz, nx, ny, nz, 0, 0, 1);
        if (sx * sy * sz > 0) batch.tri(i0, i1, i2); else batch.tri(i0, i2, i1);
      }
    }
  }
}

/** Upright cylinder with smooth sides and flat caps. */
export function pushCylinder(batch, { pos, radius, height, segments = 48 }, tile) {
  const hy = height / 2;
  const circumference = Math.PI * 2 * radius;
  const rows = Math.max(1, Math.min(6, Math.ceil(height / 12)));
  const start = batch.count;
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const y = -hy + t * height;
    const ao = height > 4 ? 0.78 + 0.22 * Math.min(1, (y + hy) / Math.min(height, 10)) : 1;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const nx = Math.cos(a), nz = Math.sin(a);
      batch.vertex(pos.x + nx * radius, pos.y + y, pos.z + nz * radius, nx, 0, nz, (a / (Math.PI * 2) * circumference) / tile, (y + pos.y) / tile, ao);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < segments; i++) {
      const a = start + r * (segments + 1) + i;
      const b = a + 1, c = a + segments + 1, d = c + 1;
      batch.quad(a, c, d, b);
    }
  }
  for (const s of [-1, 1]) {
    const center = batch.vertex(pos.x, pos.y + s * hy, pos.z, 0, s, 0, 0, 0, s > 0 ? 1 : 0.6);
    const base = batch.count;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const nx = Math.cos(a), nz = Math.sin(a);
      batch.vertex(pos.x + nx * radius, pos.y + s * hy, pos.z + nz * radius, 0, s, 0, (nx * radius) / tile, (nz * radius) / tile, s > 0 ? 1 : 0.6);
    }
    for (let i = 0; i < segments; i++) {
      if (s > 0) batch.tri(center, base + i + 1, base + i);
      else batch.tri(center, base + i, base + i + 1);
    }
  }
}

/** Curved wall or ribbon. Smooth radial normals, optional helical rise. */
export function pushArc(batch, v, tile) {
  const { center, rInner, rOuter, a0, a1, y0, y1, height, segments } = v;
  const D = Math.PI / 180;
  const pt = (r, u) => {
    const ang = (a0 + (a1 - a0) * u) * D;
    return { x: center[0] + Math.cos(ang) * r, z: center[1] - Math.sin(ang) * r, nx: Math.cos(ang), nz: -Math.sin(ang), ang };
  };
  const yAt = (u) => y0 + (y1 - y0) * u;
  const sheet = (rA, rB, topA, topB, nFn, uvFn, ao) => {
    const start = batch.count;
    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      const a = pt(rA, u), b = pt(rB, u);
      const n = nFn(a);
      const uvA = uvFn(u, 0), uvB = uvFn(u, 1);
      batch.vertex(a.x, yAt(u) + topA, a.z, n[0], n[1], n[2], uvA[0] / tile, uvA[1] / tile, ao[0]);
      batch.vertex(b.x, yAt(u) + topB, b.z, n[0], n[1], n[2], uvB[0] / tile, uvB[1] / tile, ao[1]);
    }
    return start;
  };
  const stitch = (start, flip) => {
    for (let i = 0; i < segments; i++) {
      const a = start + i * 2, b = a + 1, c = a + 2, d = a + 3;
      if (flip) batch.quad(a, c, d, b); else batch.quad(a, b, d, c);
    }
  };
  const len = Math.abs(a1 - a0) * D * (rInner + rOuter) * 0.5;
  const flipDir = a1 > a0;
  // Top and bottom.
  stitch(sheet(rInner, rOuter, 0, 0, () => [0, 1, 0], (u, s) => [u * len, s * (rOuter - rInner)], [1, 1]), flipDir);
  stitch(sheet(rInner, rOuter, -height, -height, () => [0, -1, 0], (u, s) => [u * len, s * (rOuter - rInner)], [0.6, 0.6]), !flipDir);
  // Outer and inner faces.
  stitch(sheet(rOuter, rOuter, 0, -height, (a) => [a.nx, 0, a.nz], (u, s) => [u * len, -s * height], [1, 0.8]), flipDir);
  stitch(sheet(rInner, rInner, 0, -height, (a) => [-a.nx, 0, -a.nz], (u, s) => [u * len, -s * height], [1, 0.8]), !flipDir);
  // End caps.
  for (const [u, sgn] of [[0, -1], [1, 1]]) {
    const dir = flipDir ? sgn : -sgn;
    const a = pt(rInner, u), b = pt(rOuter, u);
    const n = [-a.nz * dir * -1, 0, a.nx * dir * -1];
    const y = yAt(u);
    const i0 = batch.vertex(a.x, y, a.z, n[0], 0, n[2], 0, 0, 1);
    const i1 = batch.vertex(b.x, y, b.z, n[0], 0, n[2], (rOuter - rInner) / tile, 0, 1);
    const i2 = batch.vertex(b.x, y - height, b.z, n[0], 0, n[2], (rOuter - rInner) / tile, height / tile, 0.8);
    const i3 = batch.vertex(a.x, y - height, a.z, n[0], 0, n[2], 0, height / tile, 0.8);
    if (dir * (flipDir ? 1 : -1) > 0) batch.quad(i0, i1, i2, i3); else batch.quad(i0, i3, i2, i1);
  }
}

/** Oriented beam between two points. Square or round. */
export function pushBeam(batch, { from, to, thickness, round }, tile) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return;
  const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
  const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(dir, up).normalize();
  const nor = new THREE.Vector3().crossVectors(side, dir).normalize();
  const sides = round ? 8 : 4;
  const r = thickness * (round ? 0.5 : 0.7071);
  const offset = round ? 0 : Math.PI / 4;
  const start = batch.count;
  for (let s = 0; s <= 1; s++) {
    const ox = from.x + dx * s, oy = from.y + dy * s, oz = from.z + dz * s;
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2 + offset;
      const c = Math.cos(a), sn = Math.sin(a);
      const nx = side.x * c + nor.x * sn, ny = side.y * c + nor.y * sn, nz = side.z * c + nor.z * sn;
      // Square beams get a per-face normal by duplicating at each corner.
      batch.vertex(ox + nx * r, oy + ny * r, oz + nz * r, nx, ny, nz, (i / sides) * thickness * 2 / tile, (s * len) / tile, 1);
    }
  }
  for (let i = 0; i < sides; i++) {
    const a = start + i, b = a + 1, c = a + sides + 1, d = c + 1;
    batch.quad(a, b, d, c);
  }
}

/** Ring in a vertical plane, optionally with a rectangular section. Used for landmark structures. */
export function pushRing(batch, { center, radius, tube, yaw = 0, tilt = 0, section = 'round' }, tile) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
  const toWorld = (x, y, z) => {
    // Tilt about X, then yaw about Y.
    const y1 = y * ct - z * st, z1 = y * st + z * ct;
    return [x * cy + z1 * sy, y1, -x * sy + z1 * cy];
  };
  const segs = Math.min(160, Math.max(48, Math.round(radius * 1.8)));
  const profile = section === 'box'
    ? [[-1, -1, -1, 0], [1, -1, 0, -1], [1, 1, 1, 0], [-1, 1, 0, 1]]
    : Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return [Math.cos(a), Math.sin(a), Math.cos(a), Math.sin(a)]; });
  const start = batch.count;
  const p = profile.length;
  const len = Math.PI * 2 * radius;
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let j = 0; j <= p; j++) {
      const [px, pz, nr, nz] = profile[j % p];
      const r = radius + px * tube;
      const lz = pz * tube;
      const w = toWorld(ca * r, sa * r, lz);
      const n = section === 'box'
        ? toWorld(ca * (j === p ? profile[0][2] : nr), sa * (j === p ? profile[0][2] : nr), j === p ? profile[0][3] : nz)
        : toWorld(ca * nr, sa * nr, nz);
      batch.vertex(center.x + w[0], center.y + w[1], center.z + w[2], n[0], n[1], n[2], (i / segs * len) / tile, (j / p * tube * 8) / tile, 1);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < p; j++) {
      const a = start + i * (p + 1) + j;
      const b = a + 1, c = a + p + 1, d = c + 1;
      batch.quad(a, c, d, b);
    }
  }
}
