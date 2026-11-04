import RAPIER from '@dimforge/rapier3d-compat';

let ready = null;
/** Initialises Rapier's WASM module once. Safe to call repeatedly. */
export const initPhysics = () => (ready ??= RAPIER.init());

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };

/**
 * Owns the Rapier world for one level. Rapier is used purely as a collision and query
 * engine: the player is not a rigid body, its motion is decided by the movement code.
 */
export class PhysicsWorld {
  constructor() {
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.world.timestep = 1 / 120;
    /** @type {Map<number, object>} collider handle → surface descriptor */
    this.surfaces = new Map();
    this.movers = [];
    this.dirty = true;
  }

  /**
   * Adds a static or moving solid from a level definition entry.
   * @param {object} solid {shape, pos, quat, surface, ...shape params}
   */
  addSolid(solid) {
    const desc = PhysicsWorld.descFor(solid);
    desc.setTranslation(solid.pos.x, solid.pos.y, solid.pos.z);
    if (solid.quat) desc.setRotation(solid.quat);
    desc.setFriction(0).setRestitution(0);
    const collider = this.world.createCollider(desc);
    this.surfaces.set(collider.handle, solid.surface ?? {});
    this.dirty = true;
    return collider;
  }

  static descFor(solid) {
    switch (solid.shape) {
      case 'box': return RAPIER.ColliderDesc.cuboid(solid.size.x / 2, solid.size.y / 2, solid.size.z / 2);
      case 'cylinder': return RAPIER.ColliderDesc.cylinder(solid.height / 2, solid.radius);
      case 'sphere': return RAPIER.ColliderDesc.ball(solid.radius);
      case 'hull': {
        const d = RAPIER.ColliderDesc.convexHull(solid.points);
        if (!d) throw new Error(`Degenerate convex hull in solid ${solid.id ?? '(unnamed)'}`);
        return d;
      }
      default: throw new Error(`Unknown solid shape: ${solid.shape}`);
    }
  }

  /**
   * Registers a kinematic solid that moves along a closed path as a pure function of the
   * simulation tick, which keeps runs reproducible.
   */
  addMover(solid, path) {
    const collider = this.addSolid(solid);
    const surface = this.surfaces.get(collider.handle);
    const mover = {
      collider, path, solid, surface,
      pos: { ...solid.pos },
      delta: { x: 0, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
    };
    surface.mover = mover;
    this.movers.push(mover);
    return mover;
  }

  /** Advances movers to a tick and refreshes the query structures. */
  update(tick, dt) {
    if (this.movers.length) {
      const t = tick * dt;
      for (const m of this.movers) {
        const prevX = m.pos.x, prevY = m.pos.y, prevZ = m.pos.z;
        m.path(t, m.pos);
        m.delta.x = m.pos.x - prevX;
        m.delta.y = m.pos.y - prevY;
        m.delta.z = m.pos.z - prevZ;
        m.vel.x = m.delta.x / dt;
        m.vel.y = m.delta.y / dt;
        m.vel.z = m.delta.z / dt;
        m.collider.setTranslation(m.pos);
      }
      this.dirty = true;
    }
    this.flush();
  }

  /** Applies pending collider changes to the query acceleration structure. */
  flush() {
    if (this.dirty) {
      this.world.step();
      this.dirty = false;
    }
  }

  surfaceOf(collider) { return this.surfaces.get(collider.handle) ?? {}; }
  free() { this.world.free(); this.surfaces.clear(); this.movers.length = 0; }
}

export { RAPIER, IDENTITY };
