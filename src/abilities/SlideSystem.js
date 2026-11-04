import { Locomotion as L } from '../player/MovementStateMachine.js';

/**
 * Sliding: lowers the capsule, swaps ground friction for a low exponential one, and lets
 * gravity act along slopes. Flat slides tire after slideFatigueStart so they cannot run forever.
 */
export class SlideSystem {
  constructor(player) {
    this.p = player;
    this.boostCooldown = 0;
    this.time = 0;
  }

  reset() { this.boostCooldown = 0; this.time = 0; }

  update(input, dt) {
    const { p } = this;
    const cfg = p.cfg;
    const m = p.machine;
    this.boostCooldown = Math.max(0, this.boostCooldown - dt);

    if (m.is(L.SLIDING)) {
      this.time += dt;
      const speed = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
      if (!input.slide && p.setCrouched(false)) { this.end(); return; }
      if (speed < cfg.slideExitSpeed) {
        this.end();
        p.setCrouched(input.slide);
      }
      return;
    }

    if (m.grounded) {
      if (input.slide) {
        if (Math.hypot(p.vel.x, p.vel.z) >= cfg.slideEnterSpeed && !p.slideBlocked) this.begin();
        else p.setCrouched(true);
        if (!m.is(L.SLIDING) && Math.hypot(p.vel.x, p.vel.z) < cfg.slideEnterSpeed) p.slideBlocked = false;
      } else {
        p.slideBlocked = false;
        if (p.crouched) p.setCrouched(false);
      }
    } else if (!m.is(L.WALL_RUNNING)) {
      // Tuck in the air. Keeps the slide key useful for clearing a lip or landing into a slide.
      p.setCrouched(input.slide);
    }
  }

  begin() {
    const { p } = this;
    const cfg = p.cfg;
    const speed = Math.hypot(p.vel.x, p.vel.z);
    p.setCrouched(true);
    p.machine.set(L.SLIDING);
    this.time = 0;
    if (this.boostCooldown <= 0 && speed < cfg.slideBoostMaxSpeed && speed > 0.1) {
      const target = Math.min(speed + cfg.slideBoost, cfg.slideBoostMaxSpeed);
      p.vel.x *= target / speed;
      p.vel.z *= target / speed;
      this.boostCooldown = cfg.slideBoostCooldown;
    }
    p.stats.slides++;
    p.emit({ type: 'slide-start', speed });
  }

  end() {
    const { p } = this;
    // Holding the key through a stalled slide must not immediately restart it.
    p.slideBlocked = p.input?.slide ?? false;
    p.machine.set(Math.hypot(p.vel.x, p.vel.z) > 0.4 ? L.RUNNING : L.GROUNDED);
    p.emit({ type: 'slide-end' });
  }

  /** Slide forces: slope gravity plus low friction, applied along the ground plane. */
  forces(input, dt) {
    const { p } = this;
    const cfg = p.cfg;
    const n = p.ground.normal;
    const v = p.vel;

    // Component of gravity along the surface. This is zero on flat ground and is what makes
    // a downhill slide accelerate and an uphill one die.
    const g = cfg.gravity * cfg.slideGravityScale;
    v.x += n.x * n.y * g * dt;
    v.y += (n.y * n.y - 1) * g * dt;
    v.z += n.z * n.y * g * dt;

    // Fatigue only applies on the flat. On any slope gravity already decides what happens, so slides
    // accelerate downhill, and a slide up a kicker keeps enough speed to launch.
    const onSlope = n.y < 0.996;
    const tired = this.time > cfg.slideFatigueStart && !onSlope;
    const friction = onSlope
      ? cfg.slideFriction * cfg.slideDescentFriction
      : tired ? cfg.slideFatigueFriction : cfg.slideFriction;
    const keep = Math.exp(-friction * dt);
    v.x *= keep; v.y *= keep; v.z *= keep;

    // Light steering rotates velocity. Speed is untouched.
    if (input.strafe !== 0) {
      const angle = -input.strafe * cfg.slideSteer * dt;
      const c = Math.cos(angle), s = Math.sin(angle);
      const x = v.x * c + v.z * s;
      v.z = -v.x * s + v.z * c;
      v.x = x;
    }
  }
}
