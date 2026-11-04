/**
 * Minimal vector helpers over plain {x, y, z} objects.
 * The simulation uses these instead of THREE.Vector3 so that it has no renderer
 * dependency and can run headless in tests. Functions that return a vector write
 * into `out` so the fixed-step loop does not allocate.
 */
export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const copy = (out, a) => { out.x = a.x; out.y = a.y; out.z = a.z; return out; };
export const set = (out, x, y, z) => { out.x = x; out.y = y; out.z = z; return out; };
export const add = (out, a, b) => { out.x = a.x + b.x; out.y = a.y + b.y; out.z = a.z + b.z; return out; };
export const sub = (out, a, b) => { out.x = a.x - b.x; out.y = a.y - b.y; out.z = a.z - b.z; return out; };
export const scale = (out, a, s) => { out.x = a.x * s; out.y = a.y * s; out.z = a.z * s; return out; };
export const addScaled = (out, a, b, s) => { out.x = a.x + b.x * s; out.y = a.y + b.y * s; out.z = a.z + b.z * s; return out; };
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const lengthSq = (a) => a.x * a.x + a.y * a.y + a.z * a.z;
export const length = (a) => Math.sqrt(lengthSq(a));
export const horizontalSpeed = (a) => Math.hypot(a.x, a.z);
export const cross = (out, a, b) => {
  const x = a.y * b.z - a.z * b.y;
  const y = a.z * b.x - a.x * b.z;
  const z = a.x * b.y - a.y * b.x;
  out.x = x; out.y = y; out.z = z;
  return out;
};
export const normalize = (out, a) => {
  const l = length(a);
  if (l < 1e-9) { out.x = 0; out.y = 0; out.z = 0; return out; }
  out.x = a.x / l; out.y = a.y / l; out.z = a.z / l;
  return out;
};
/** Removes the component of `v` along unit vector `n`. */
export const projectOnPlane = (out, v, n) => addScaled(out, v, n, -dot(v, n));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** View forward for a yaw/pitch pair. Yaw 0 looks down -Z, positive yaw turns left. */
export const forwardFromAngles = (out, yaw, pitch) => {
  const c = Math.cos(pitch);
  out.x = -Math.sin(yaw) * c;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * c;
  return out;
};
