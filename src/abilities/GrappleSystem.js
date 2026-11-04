import { Locomotion as L } from '../player/MovementStateMachine.js';

const makeHit = () => ({ hit: false, distance: 0, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, surface: null, handle: -1 });

/**
 * The grappling hook. The rope is a one-sided distance constraint: it stops the player moving
 * farther from the anchor and otherwise exerts nothing. There is no pull toward the anchor unless
 * the player reels in.
 *
 * Solver: predict the next position, and if it lies outside the rope sphere, project it back onto
 * the sphere and take the velocity from the corrected displacement:
 *
 *     x' = x + v dt
 *     if |x' - a| > L:  x' = a + L (x' - a) / |x' - a|,  v = (x' - x) / dt
 *
 * The chord between two points on a sphere is never longer than the arc, so free swinging can only
 * lose a tiny amount of energy, never gain it. A taut release keeps exactly the tangential velocity.
 */
export class GrappleSystem {
  constructor(player, anchors) {
    this.p = player;
    this.anchors = anchors ?? [];
    this.rayHit = makeHit();
    this.losHit = makeHit();
    this.target = { valid: false, x: 0, y: 0, z: 0, distance: 0, node: false, surface: null, inRange: false };
    this.anchor = { x: 0, y: 0, z: 0 };
    this.reset();
  }

  reset() {
    this.attached = false;
    this.length = 0;
    this.taut = false;
    this.tension = 0;
    this.cooldown = 0;
    this.takeUp = 0;
    this.pressBuffer = 0;
    this.blockedFor = 0;
    this.mover = null;
    this.attachedAt = 0;
    this.losTick = 0;
    this.reeling = 0;
  }

  /** Finds what the crosshair would attach to. Runs every tick so feedback matches physics. */
  updateTarget() {
    const { p, target } = this;
    const cfg = p.cfg;
    const e = p.eye();
    const f = p.forward;
    const hit = p.q.castRay(e.x, e.y, e.z, f.x, f.y, f.z, cfg.grappleRange, this.rayHit);
    target.valid = false;
    target.inRange = hit.hit;
    if (hit.hit && hit.surface?.grapple) {
      target.valid = true;
      target.x = hit.point.x; target.y = hit.point.y; target.z = hit.point.z;
      target.distance = hit.distance;
      target.node = !!hit.surface.node;
      target.surface = hit.surface;
      if (hit.surface.node) { target.x = hit.surface.nodeCenter.x; target.y = hit.surface.nodeCenter.y; target.z = hit.surface.nodeCenter.z; }
      return;
    }
    if (p.assist.grappleAim) this.findAssistTarget(e, f, hit.hit ? hit.distance : Infinity);
  }

  /** Aim assist: dedicated anchor nodes within a small cone, nearest to the crosshair, with line of sight. */
  findAssistTarget(e, f) {
    const { p, target } = this;
    const cfg = p.cfg;
    const cosMax = Math.cos((cfg.grappleAssistDegrees * Math.PI) / 180);
    let best = null;
    let bestCos = cosMax;
    for (const a of this.anchors) {
      const pos = a.mover ? a.mover.pos : a;
      const dx = pos.x - e.x, dy = pos.y - e.y, dz = pos.z - e.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > cfg.grappleRange || d < 1) continue;
      const c = (dx * f.x + dy * f.y + dz * f.z) / d;
      if (c <= bestCos) continue;
      const los = p.q.castRay(e.x, e.y, e.z, dx / d, dy / d, dz / d, d, this.losHit);
      if (los.hit && los.distance < d - (a.radius ?? 1) - 0.25) continue;
      bestCos = c;
      best = a;
      target.x = pos.x; target.y = pos.y; target.z = pos.z;
      target.distance = d;
    }
    if (best) {
      target.valid = true;
      target.node = true;
      target.surface = best.surface;
    }
  }

  update(input, dt) {
    const { p } = this;
    const cfg = p.cfg;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.pressBuffer = Math.max(0, this.pressBuffer - dt);
    if (input.grapplePressed) this.pressBuffer = 0.14;

    this.updateTarget();

    if (this.attached) {
      this.followMover();
      if (!input.grapple) { this.release('input'); return; }
      this.checkLineOfSight(dt);
      return;
    }
    if (input.grapple && this.pressBuffer > 0 && this.cooldown <= 0) {
      if (this.target.valid) this.attach();
      else if (input.grapplePressed) p.emit({ type: 'grapple-miss' });
    }
    void cfg;
  }

  attach() {
    const { p, target } = this;
    const cfg = p.cfg;
    const c = p.chest();
    this.anchor.x = target.x; this.anchor.y = target.y; this.anchor.z = target.z;
    this.mover = target.surface?.mover ?? null;
    const d = Math.hypot(c.x - target.x, c.y - target.y, c.z - target.z);
    this.length = Math.max(cfg.grappleMinLength, Math.min(d, cfg.grappleMaxLength));
    this.takeUp = Math.min(this.length * cfg.grappleTakeUp, cfg.grappleTakeUpMax);
    this.attached = true;
    this.taut = false;
    this.pressBuffer = 0;
    this.blockedFor = 0;
    this.attachedAt = p.tickCount;
    p.wall.onGrappled();
    p.stats.grapples++;
    p.emit({ type: 'grapple-attach', x: target.x, y: target.y, z: target.z, distance: d, node: target.node });
  }

  release(reason) {
    const { p } = this;
    if (!this.attached) return;
    this.attached = false;
    this.taut = false;
    this.tension = 0;
    this.mover = null;
    this.cooldown = p.cfg.grappleCooldown;
    p.emit({ type: 'grapple-release', reason, speed: Math.hypot(p.vel.x, p.vel.y, p.vel.z) });
  }

  /** Jump while swinging: let go with a small upward hop. Tangential velocity is untouched. */
  releaseWithHop() {
    const { p } = this;
    this.release('hop');
    p.vel.y += p.cfg.grappleReleaseHop;
    p.machine.set(L.JUMPING);
    p.jump.cuttable = false;
    p.stats.jumps++;
  }

  followMover() {
    if (!this.mover) return;
    this.anchor.x += this.mover.delta.x;
    this.anchor.y += this.mover.delta.y;
    this.anchor.z += this.mover.delta.z;
  }

  /** A rope cut by geometry for longer than a short grace period breaks. It does not wrap. */
  checkLineOfSight(dt) {
    const { p } = this;
    if (++this.losTick % 4 !== 0) return;
    const c = p.chest();
    const dx = this.anchor.x - c.x, dy = this.anchor.y - c.y, dz = this.anchor.z - c.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.5) return;
    const hit = p.q.castRay(c.x, c.y, c.z, dx / d, dy / d, dz / d, d, this.losHit);
    if (hit.hit && hit.distance < d - 1.3) {
      this.blockedFor += dt * 4;
      if (this.blockedFor > p.cfg.grappleLosGrace) this.release('snag');
    } else {
      this.blockedFor = 0;
    }
  }

  /** Swing pumping: input accelerates along the tangent plane, up to a speed limit. Taut only. */
  pump(input, dt) {
    const { p } = this;
    const cfg = p.cfg;
    if (!this.taut || (input.forward === 0 && input.strafe === 0)) return;
    const c = p.chest();
    const rx = c.x - this.anchor.x, ry = c.y - this.anchor.y, rz = c.z - this.anchor.z;
    const rl = Math.hypot(rx, ry, rz) || 1;
    const nx = rx / rl, ny = ry / rl, nz = rz / rl;
    const w = p.wish3;
    const wn = w.x * nx + w.y * ny + w.z * nz;
    let tx = w.x - nx * wn, ty = w.y - ny * wn, tz = w.z - nz * wn;
    const tl = Math.hypot(tx, ty, tz);
    if (tl < 1e-4) return;
    tx /= tl; ty /= tl; tz /= tl;
    const speed = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
    const along = p.vel.x * tx + p.vel.y * ty + p.vel.z * tz;
    // Above the limit the player can still steer against their motion, but not add speed.
    if (speed >= cfg.swingMaxSpeed && along > 0) return;
    p.vel.x += tx * cfg.swingAccel * dt;
    p.vel.y += ty * cfg.swingAccel * dt;
    p.vel.z += tz * cfg.swingAccel * dt;
  }

  /**
   * Applies the rope. Call after forces and before collision.
   * @see GrappleSystem class comment for the solver.
   */
  constrain(input, dt) {
    if (!this.attached) return;
    const { p, anchor } = this;
    const cfg = p.cfg;
    const c = p.chest();
    const v = p.vel;
    const dist = Math.hypot(c.x - anchor.x, c.y - anchor.y, c.z - anchor.z);

    this.reeling = 0;
    if (this.takeUp > 0) {
      const d = Math.min(this.takeUp, cfg.grappleTakeUpRate * dt);
      this.length -= d;
      this.takeUp -= d;
    }
    if (input.reelIn) {
      // Reel from the actual distance so slack is taken in first, without a delay.
      this.length = Math.min(this.length, dist) - cfg.grappleReelInSpeed * dt;
      this.reeling = -1;
    } else if (input.reelOut) {
      this.length += cfg.grappleReelOutSpeed * dt;
      this.reeling = 1;
    }
    this.length = Math.min(cfg.grappleMaxLength, Math.max(cfg.grappleMinLength, this.length));

    const px = c.x + v.x * dt, py = c.y + v.y * dt, pz = c.z + v.z * dt;
    const rx = px - anchor.x, ry = py - anchor.y, rz = pz - anchor.z;
    const rl = Math.hypot(rx, ry, rz);
    const L_ = this.length;

    if (rl <= L_ || rl < 1e-6) {
      this.taut = false;
      this.tension = 0;
      return;
    }

    this.taut = true;
    const k = L_ / rl;
    let nvx = (anchor.x + rx * k - c.x) / dt;
    let nvy = (anchor.y + ry * k - c.y) / dt;
    let nvz = (anchor.z + rz * k - c.z) / dt;

    // The correction is bounded. If collision has left the player far outside the rope, it closes
    // the gap over several ticks rather than as one huge velocity spike.
    const nx = rx / rl, ny = ry / rl, nz = rz / rl;
    const inward = -(nvx * nx + nvy * ny + nvz * nz);
    if (inward > cfg.grappleMaxCorrectionSpeed) {
      const excess = inward - cfg.grappleMaxCorrectionSpeed;
      nvx += nx * excess; nvy += ny * excess; nvz += nz * excess;
    }

    // Tension for audio and the cable visual: centripetal demand relative to gravity.
    const speedSq = nvx * nvx + nvy * nvy + nvz * nvz;
    this.tension = Math.min(1, (speedSq / Math.max(L_, 1) + Math.max(0, -ny) * cfg.gravity) / (cfg.gravity * 3));

    v.x = nvx; v.y = nvy; v.z = nvz;
  }
}
