import { Locomotion as L } from '../player/MovementStateMachine.js';

const dir = { x: 0, y: 0, z: 0 };

/**
 * Air dash: an impulse in the intended direction. It adds to existing velocity, so previous
 * momentum survives, but its gain falls off with speed already along that direction. That keeps
 * it a trajectory tool rather than a replacement for grappling.
 */
export class AirDashSystem {
  constructor(player) {
    this.p = player;
    this.reset();
  }

  reset() {
    this.charges = this.p.cfg.dashCharges;
    this.activeTime = 0;
    this.cooldown = 0;
  }

  get active() { return this.activeTime > 0; }

  refill(amount = Infinity) {
    const before = this.charges;
    this.charges = Math.min(this.p.cfg.dashCharges, this.charges + amount);
    if (this.charges !== before) this.p.emit({ type: 'dash-refill', charges: this.charges });
  }

  update(input, dt) {
    const { p } = this;
    const cfg = p.cfg;
    this.activeTime = Math.max(0, this.activeTime - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!input.dashPressed) return;
    if (p.machine.grounded || this.charges <= 0 || this.cooldown > 0) {
      p.emit({ type: 'dash-denied' });
      return;
    }
    this.fire(input);
  }

  fire(input) {
    const { p } = this;
    const cfg = p.cfg;
    this.direction(input, dir);

    const along = p.vel.x * dir.x + p.vel.y * dir.y + p.vel.z * dir.z;
    const falloff = Math.max(0, 1 - Math.max(0, along) / cfg.dashFalloffSpeed);
    const gain = Math.max(cfg.dashMinGain, cfg.dashImpulse * falloff);
    p.vel.x += dir.x * gain;
    p.vel.y += dir.y * gain;
    p.vel.z += dir.z * gain;
    // Arrest a fall, so a dash can rescue a short jump. Upward velocity is left alone.
    if (p.vel.y < 0 && dir.y > -0.5) p.vel.y *= cfg.dashFallBrake;

    if (p.machine.is(L.WALL_RUNNING)) p.wall.exit('dash');
    this.charges--;
    this.activeTime = cfg.dashTime;
    this.cooldown = cfg.dashCooldown;
    p.stats.dashes++;
    p.emit({ type: 'dash', charges: this.charges, x: dir.x, y: dir.y, z: dir.z });
  }

  /** Direction is movement input relative to view; no input means straight along the view. */
  direction(input, out) {
    const { p } = this;
    const f = p.forward, r = p.right;
    if (input.forward === 0 && input.strafe === 0) {
      out.x = f.x; out.y = f.y; out.z = f.z;
    } else {
      // Forward input follows pitch so looking up dashes up; strafes stay level.
      const fw = input.forward;
      out.x = f.x * fw + r.x * input.strafe;
      out.y = f.y * Math.max(0, fw);
      out.z = f.z * fw + r.z * input.strafe;
    }
    const l = Math.hypot(out.x, out.y, out.z) || 1;
    out.x /= l; out.y /= l; out.z /= l;
    return out;
  }
}
