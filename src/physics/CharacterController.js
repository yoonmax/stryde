import { dot } from '../utils/vec3.js';

const SKIN = 0.012;
const MAX_BUMPS = 5;

/**
 * Swept capsule collide-and-slide. Each bump sweeps the capsule to first contact, then removes
 * only the velocity component going into the surface, so motion along a surface is preserved.
 * Because every step is a continuous sweep, speed cannot tunnel the capsule through thin walls.
 */
export class CharacterController {
  constructor(queries, cfg) {
    this.q = queries;
    this.cfg = cfg;
    this.hits = [];
    for (let i = 0; i < MAX_BUMPS; i++) {
      this.hits.push({ normal: { x: 0, y: 0, z: 0 }, surface: null, handle: -1, point: { x: 0, y: 0, z: 0 } });
    }
    this.hitCount = 0;
    this.stepped = false;
    this._sweep = { hit: false, distance: 0, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, surface: null, handle: -1 };
    this._sweep2 = { hit: false, distance: 0, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, surface: null, handle: -1 };
  }

  /**
   * Moves `center` by `vel * dt`, clipping `vel` on contact.
   * @param {{x,y,z}} center Capsule centre, mutated.
   * @param {{x,y,z}} vel Velocity, mutated by clipping.
   * @param {object} shape Rapier capsule.
   * @param {number} dt Seconds.
   * @param {boolean} canStep Try stepping over low obstacles.
   */
  move(center, vel, shape, dt, canStep) {
    this.hitCount = 0;
    this.stepped = false;
    let remaining = dt;

    for (let bump = 0; bump < MAX_BUMPS && remaining > 1e-7; bump++) {
      const speed = Math.hypot(vel.x, vel.y, vel.z);
      if (speed < 1e-6) break;
      const dx = vel.x / speed, dy = vel.y / speed, dz = vel.z / speed;
      const dist = speed * remaining;
      const hit = this.q.sweep(center.x, center.y, center.z, shape, dx, dy, dz, dist + SKIN * 2, this._sweep);

      if (!hit.hit) {
        center.x += vel.x * remaining; center.y += vel.y * remaining; center.z += vel.z * remaining;
        break;
      }

      // Back off along the path so the capsule ends SKIN away from the surface, measured along the
      // normal. A shallow approach needs a longer back-off along dir to get the same clearance.
      const approach = -(dx * hit.normal.x + dy * hit.normal.y + dz * hit.normal.z);
      const backoff = approach > 0.02 ? Math.min(SKIN / approach, 0.25) : SKIN;
      const travel = Math.min(dist, Math.max(0, hit.distance - backoff));
      if (approach <= 0) {
        // Already leaving this surface. Do not let a grazing hit eat the move.
        center.x += vel.x * remaining; center.y += vel.y * remaining; center.z += vel.z * remaining;
        break;
      }
      center.x += dx * travel; center.y += dy * travel; center.z += dz * travel;
      remaining *= 1 - travel / dist;

      // Low obstacle or a lip caught by the feet: lift over it instead of losing all the speed. A
      // capsule clipping an edge at 20 m/s would otherwise convert a near-miss into a dead stop.
      const isStepHit = hit.normal.y < 0.9 && hit.normal.y > -0.2;
      if (canStep && isStepHit && !this.stepped && this.tryStep(center, vel, shape, remaining)) {
        this.stepped = true;
        break;
      }

      this.record(hit);
      this.clip(vel);
    }
  }

  record(hit) {
    if (this.hitCount >= MAX_BUMPS) return;
    const h = this.hits[this.hitCount++];
    h.normal.x = hit.normal.x; h.normal.y = hit.normal.y; h.normal.z = hit.normal.z;
    h.point.x = hit.point.x; h.point.y = hit.point.y; h.point.z = hit.point.z;
    h.surface = hit.surface;
    h.handle = hit.handle;
  }

  /**
   * Removes velocity going into every plane touched this tick. With two planes the velocity is
   * confined to their crease; with three it stops, as Quake's slide move does in a corner.
   */
  clip(vel) {
    const hits = this.hits, n = this.hitCount;
    const last = hits[n - 1].normal;
    const into = dot(vel, last);
    if (into < 0) { vel.x -= last.x * into; vel.y -= last.y * into; vel.z -= last.z * into; }
    for (let i = 0; i < n - 1; i++) {
      const other = hits[i].normal;
      if (dot(vel, other) >= -1e-5) continue;
      // Slide along the crease between `last` and `other`.
      const cx = last.y * other.z - last.z * other.y;
      const cy = last.z * other.x - last.x * other.z;
      const cz = last.x * other.y - last.y * other.x;
      const cl = Math.hypot(cx, cy, cz);
      if (cl < 1e-4) continue;
      const ux = cx / cl, uy = cy / cl, uz = cz / cl;
      const along = vel.x * ux + vel.y * uy + vel.z * uz;
      vel.x = ux * along; vel.y = uy * along; vel.z = uz * along;
      for (let j = 0; j < n - 1; j++) {
        if (j !== i && dot(vel, hits[j].normal) < -1e-5) { vel.x = 0; vel.y = 0; vel.z = 0; return; }
      }
    }
  }

  /**
   * Steps over a low obstacle. A ray just past the capsule finds the top of the obstacle; if it is
   * walkable, within stepHeight, and the capsule fits there, the capsule moves up onto it at speed.
   * The camera smooths the height change, and velocity is untouched.
   */
  tryStep(center, vel, shape, remaining) {
    const { cfg, q } = this;
    const speedH = Math.hypot(vel.x, vel.z);
    if (speedH < 0.1) return false;
    const dx = vel.x / speedH, dz = vel.z / speedH;
    const feet = center.y - (shape.halfHeight + shape.radius);
    const px = center.x + dx * (shape.radius + 0.14);
    const pz = center.z + dz * (shape.radius + 0.14);
    const ray = q.castRay(px, feet + cfg.stepHeight + 0.02, pz, 0, -1, 0, cfg.stepHeight + 0.02, this._sweep2);
    if (!ray.hit || ray.distance < 0.005) return false;
    if (ray.normal.y < Math.cos((cfg.maxSlopeDeg * Math.PI) / 180)) return false;
    const rise = ray.point.y - feet;
    if (rise < 0.01 || rise > cfg.stepHeight) return false;
    const go = Math.max(speedH * remaining, 0.03);
    const nx = center.x + dx * go, ny = center.y + rise + SKIN, nz = center.z + dz * go;
    if (q.overlaps(nx, ny, nz, shape)) return false;
    center.x = nx; center.y = ny; center.z = nz;
    return true;
  }
}
