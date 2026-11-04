import { RAPIER, IDENTITY } from './PhysicsWorld.js';

/** A capsule sweep or ray result. Reused between calls; copy anything you keep. */
const makeHit = () => ({
  hit: false, distance: 0,
  point: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 0 },
  surface: null, handle: -1,
});

/**
 * The simulation's only door into the physics engine. Keeping this narrow means the movement
 * code reads as geometry questions ("what is below me?") rather than engine calls.
 */
export class CollisionQueries {
  /** @param {import('./PhysicsWorld.js').PhysicsWorld} physics */
  constructor(physics, cfg) {
    this.physics = physics;
    this.world = physics.world;
    const hh = (h) => Math.max(0.01, h / 2 - cfg.radius);
    this.standShape = new RAPIER.Capsule(hh(cfg.standHeight), cfg.radius);
    this.crouchShape = new RAPIER.Capsule(hh(cfg.crouchHeight), cfg.radius);
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this._center = { x: 0, y: 0, z: 0 };
    this._dir = { x: 0, y: 0, z: 0 };
    this.sweepHit = makeHit();
    this.rayHit = makeHit();
    this.probeHit = makeHit();
  }

  /**
   * Sweeps a capsule from its centre along a unit direction.
   * @returns {object} A shared hit record; `.hit` is false on a miss. `.distance` is metres along dir.
   */
  sweep(cx, cy, cz, shape, dx, dy, dz, maxDistance, out = this.sweepHit) {
    this._center.x = cx; this._center.y = cy; this._center.z = cz;
    this._dir.x = dx; this._dir.y = dy; this._dir.z = dz;
    const result = this.world.castShape(this._center, IDENTITY, this._dir, shape, 0, maxDistance, false);
    if (!result) { out.hit = false; return out; }
    out.hit = true;
    out.distance = result.time_of_impact;
    out.point.x = result.witness1.x; out.point.y = result.witness1.y; out.point.z = result.witness1.z;
    out.normal.x = result.normal1.x; out.normal.y = result.normal1.y; out.normal.z = result.normal1.z;
    out.handle = result.collider.handle;
    out.surface = this.physics.surfaceOf(result.collider);
    return out;
  }

  /** Casts a ray and reports the first surface it meets. */
  castRay(ox, oy, oz, dx, dy, dz, maxDistance, out = this.rayHit) {
    const r = this.ray;
    r.origin.x = ox; r.origin.y = oy; r.origin.z = oz;
    r.dir.x = dx; r.dir.y = dy; r.dir.z = dz;
    const result = this.world.castRayAndGetNormal(r, maxDistance, true);
    if (!result) { out.hit = false; return out; }
    out.hit = true;
    out.distance = result.timeOfImpact;
    out.point.x = ox + dx * result.timeOfImpact;
    out.point.y = oy + dy * result.timeOfImpact;
    out.point.z = oz + dz * result.timeOfImpact;
    out.normal.x = result.normal.x; out.normal.y = result.normal.y; out.normal.z = result.normal.z;
    out.handle = result.collider.handle;
    out.surface = this.physics.surfaceOf(result.collider);
    return out;
  }

  /** True when the capsule at this centre overlaps any solid. Used to validate standing up. */
  overlaps(cx, cy, cz, shape) {
    this._center.x = cx; this._center.y = cy; this._center.z = cz;
    let found = false;
    this.world.intersectionsWithShape(this._center, IDENTITY, shape, () => { found = true; return false; });
    return found;
  }

  /**
   * Pushes a capsule out of anything it penetrates. Needed after spawning, standing up, or being
   * hit by a moving platform. Returns true if the position changed.
   * @param {{x:number,y:number,z:number}} center Mutated in place.
   */
  depenetrate(center, shape, skin = 0.005, iterations = 4) {
    let moved = false;
    for (let i = 0; i < iterations; i++) {
      let px = 0, py = 0, pz = 0, deepest = 0;
      this.world.intersectionsWithShape(center, IDENTITY, shape, (collider) => {
        const c = collider.contactShape(shape, center, IDENTITY, 0.01);
        if (c && c.distance < deepest) {
          deepest = c.distance;
          px = c.normal1.x; py = c.normal1.y; pz = c.normal1.z;
        }
        return true;
      });
      if (deepest >= 0) break;
      const push = -deepest + skin;
      center.x += px * push; center.y += py * push; center.z += pz * push;
      moved = true;
    }
    return moved;
  }
}
