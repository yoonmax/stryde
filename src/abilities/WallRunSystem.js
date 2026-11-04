import { Locomotion as L } from '../player/MovementStateMachine.js';
import { clearAirStrafe } from '../player/MovementController.js';

const makeHit = () => ({ hit: false, distance: 0, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, surface: null, handle: -1 });

/**
 * Wall running, wall jumps and wall kicks.
 *
 * Velocity is split into tangential (kept) and into-wall (removed). A curved wall simply keeps
 * rotating the tangent each tick, which preserves speed all the way around it. A wall can't be
 * re-used until the player touches ground or a different wall, which is the rule that prevents
 * infinite wall running. Facing walls can be climbed by alternating between them, on purpose.
 */
export class WallRunSystem {
  constructor(player) {
    this.p = player;
    this.hitA = makeHit();
    this.hitB = makeHit();
    this.reset();
  }

  reset() {
    this.active = false;
    this.time = 0;
    this.normal = { x: 0, y: 0, z: 0 };
    this.point = { x: 0, y: 0, z: 0 };
    this.side = 0;
    this.lost = 0;
    this.lockout = 0;
    this.coyote = 0;
    this.exhausted = false;
    this.last = { valid: false, normal: { x: 0, y: 0, z: 0 }, point: { x: 0, y: 0, z: 0 } };
  }

  /** Touching ground clears the wall memory, so every wall is available again. */
  onGrounded() {
    this.last.valid = false;
    this.lockout = 0;
    this.coyote = 0;
    this.exhausted = false;
  }

  /** A grapple attach also renews the right to run a wall: it took a real action to get back up. */
  onGrappled() { this.exhausted = false; }

  update(input, dt) {
    const { p } = this;
    this.lockout = Math.max(0, this.lockout - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    if (this.active) this.sustain(input, dt);
    else if (p.machine.airborne && this.lockout <= 0) this.tryEnter(input);
  }

  isUsableWall(hit) {
    const cfg = this.p.cfg;
    return hit.hit && hit.surface?.wallrun === true && Math.abs(hit.normal.y) <= cfg.wallMaxNormalY;
  }

  isRememberedWall(normal, point) {
    const l = this.last;
    if (!l.valid) return false;
    if (normal.x * l.normal.x + normal.z * l.normal.z < 0.9) return false;
    const off = (point.x - l.point.x) * l.normal.x + (point.z - l.point.z) * l.normal.z;
    return Math.abs(off) < 0.4;
  }

  remember(normal, point) {
    const l = this.last;
    l.valid = true;
    l.normal.x = normal.x; l.normal.y = normal.y; l.normal.z = normal.z;
    l.point.x = point.x; l.point.y = point.y; l.point.z = point.z;
  }

  tryEnter(input) {
    const { p } = this;
    const cfg = p.cfg;
    if (this.exhausted) return;
    if (input.forward <= 0 && input.strafe === 0) return;
    if (p.airTime < 0.04) return;
    const speed = Math.hypot(p.vel.x, p.vel.z);
    if (speed < cfg.wallEntrySpeed) return;
    if (p.clearanceBelow(cfg.wallMinClearance)) return;

    // Probe both sides of the direction of travel.
    const sx = p.vel.z / speed, sz = -p.vel.x / speed;
    const c = p.center();
    const shape = p.shape();
    const a = p.q.sweep(c.x, c.y, c.z, shape, sx, 0, sz, cfg.wallProbe, this.hitA);
    const b = p.q.sweep(c.x, c.y, c.z, shape, -sx, 0, -sz, cfg.wallProbe, this.hitB);
    const useA = this.isUsableWall(a);
    const useB = this.isUsableWall(b);
    const hit = useA && useB ? (a.distance <= b.distance ? a : b) : useA ? a : useB ? b : null;
    if (!hit) return;
    if (this.isRememberedWall(hit.normal, hit.point)) return;
    if (!this.enter(hit)) return;
  }

  enter(hit) {
    const { p } = this;
    const cfg = p.cfg;
    const n = hit.normal;
    const nl = Math.hypot(n.x, n.z) || 1;
    const nx = n.x / nl, nz = n.z / nl;
    clearAirStrafe(p);
    // Tangent oriented along current travel. Only tangential speed qualifies for entry.
    const tx = -nz, tz = nx;
    const along = p.vel.x * tx + p.vel.z * tz;
    if (Math.abs(along) < cfg.wallEntrySpeed) return false;
    this.side = Math.sign(along);
    this.normal.x = nx; this.normal.y = 0; this.normal.z = nz;
    copyPoint(this.point, hit.point);
    this.active = true;
    this.time = 0;
    this.lost = 0;
    // Remove into-wall speed; soften the fall so the run reads as a catch, not a clip.
    const into = p.vel.x * nx + p.vel.z * nz;
    if (into < 0) { p.vel.x -= nx * into; p.vel.z -= nz * into; }
    if (p.vel.y < cfg.wallEntryLift) {
      p.vel.y = p.vel.y < 0 ? Math.max(p.vel.y * 0.15, -1) + cfg.wallEntryLift : cfg.wallEntryLift;
    }
    if (p.grapple.attached && !p.grapple.taut) { /* a slack rope stays attached through the run */ }
    p.machine.set(L.WALL_RUNNING);
    p.dash.refill(1);
    p.stats.wallRuns++;
    p.emit({ type: 'wall-enter', side: this.sideOfView(), x: hit.point.x, y: hit.point.y, z: hit.point.z });
    return true;
  }

  /** +1 when the wall is on the player's right, -1 on the left. Drives the camera lean. */
  sideOfView() {
    const { p } = this;
    return Math.sign(-this.normal.x * p.right.x - this.normal.z * p.right.z) || 1;
  }

  sustain(input, dt) {
    const { p } = this;
    const cfg = p.cfg;
    this.time += dt;
    if (this.time >= cfg.wallRunMaxTime) {
      // Running out of time spends the wall run outright. Without this, a curved wall (whose normal
      // keeps changing) could be re-latched forever.
      this.exhausted = true;
      this.exit('timeout');
      return;
    }

    // Backing off the wall or pressing back lets go.
    const wishDotN = p.wish.x * this.normal.x + p.wish.z * this.normal.z;
    if (input.forward < 0 || wishDotN > 0.72) { this.exit('input'); return; }

    const c = p.center();
    const probe = p.q.sweep(c.x, c.y, c.z, p.shape(), -this.normal.x, 0, -this.normal.z, cfg.wallProbe, this.hitA);
    if (!this.isUsableWall(probe)) {
      if (++this.lost >= 3) this.exit('wall-end');
      return;
    }
    this.lost = 0;
    const hn = probe.normal;
    const hl = Math.hypot(hn.x, hn.z) || 1;
    this.normal.x = hn.x / hl; this.normal.z = hn.z / hl;
    copyPoint(this.point, probe.point);

    // Re-aim the velocity along the current tangent at the same speed. Curved walls need this.
    const tx = -this.normal.z * this.side, tz = this.normal.x * this.side;
    // Only speed along the wall counts: the stick velocity below must never feed back into it.
    let speed = Math.max(p.vel.x * tx + p.vel.z * tz, 0);
    if (speed < cfg.wallRunSpeed) speed = Math.min(cfg.wallRunSpeed, speed + cfg.wallRunAccel * dt);
    if (speed < 3) { this.exit('stalled'); return; }
    p.vel.x = tx * speed - this.normal.x * 1.2;
    p.vel.z = tz * speed - this.normal.z * 1.2;
  }

  gravityScale() {
    const cfg = this.p.cfg;
    const t = this.time / cfg.wallRunMaxTime;
    if (t < cfg.wallRunRampStart) return cfg.wallRunGravityScale;
    const k = (t - cfg.wallRunRampStart) / (1 - cfg.wallRunRampStart);
    return cfg.wallRunGravityScale + (1 - cfg.wallRunGravityScale) * k * k;
  }

  /** Called after collision. Handles running into an inside corner or an obstacle ahead. */
  afterMove(character) {
    const { p } = this;
    if (!this.active) return;
    const tx = -this.normal.z * this.side, tz = this.normal.x * this.side;
    for (let i = 0; i < character.hitCount; i++) {
      const h = character.hits[i];
      const facing = h.normal.x * tx + h.normal.z * tz;
      if (facing > -0.45) continue;
      if (h.surface?.wallrun === true && Math.abs(h.normal.y) <= p.cfg.wallMaxNormalY) {
        this.turnCorner(h);
      } else if (h.normal.y < 0.5) {
        this.exit('blocked');
      }
      return;
    }
  }

  /** Inside corner: carry the speed onto the new wall instead of stopping dead. */
  turnCorner(h) {
    const { p } = this;
    const speed = Math.max(Math.hypot(p.vel.x, p.vel.z), p.preMoveSpeedH);
    const hl = Math.hypot(h.normal.x, h.normal.z) || 1;
    const oldX = -this.normal.z * this.side, oldZ = this.normal.x * this.side;
    this.remember(this.normal, this.point);
    this.normal.x = h.normal.x / hl; this.normal.z = h.normal.z / hl;
    const tx = -this.normal.z, tz = this.normal.x;
    // Choose the tangent that continues away from the old wall, not back into it.
    const dotOld = tx * oldX + tz * oldZ;
    const awayOld = tx * this.last.normal.x + tz * this.last.normal.z;
    this.side = Math.abs(awayOld) > 0.2 ? Math.sign(awayOld) : Math.sign(dotOld) || 1;
    p.vel.x = -this.normal.z * this.side * speed;
    p.vel.z = this.normal.x * this.side * speed;
    this.time = Math.max(0, this.time - 0.25);
    p.emit({ type: 'wall-enter', side: this.sideOfView(), x: h.point.x, y: h.point.y, z: h.point.z });
  }

  exit(reason) {
    const { p } = this;
    if (!this.active) return;
    this.active = false;
    this.remember(this.normal, this.point);
    this.coyote = reason === 'jump' ? 0 : p.cfg.wallCoyoteTime;
    this.lockout = p.cfg.wallRelatchLockout;
    // Nudge off the wall. The stick velocity must not survive into free flight.
    const into = p.vel.x * this.normal.x + p.vel.z * this.normal.z;
    if (into < 0) { p.vel.x -= this.normal.x * into; p.vel.z -= this.normal.z * into; }
    if (reason !== 'jump' && p.machine.is(L.WALL_RUNNING)) p.machine.set(L.FALLING);
    p.emit({ type: 'wall-exit', reason });
  }

  /** Wall jump: tangential speed kept, out and up added, slight bias toward where the player looks. */
  jump() {
    const { p } = this;
    const cfg = p.cfg;
    const nx = this.normal.x, nz = this.normal.z;
    this.exit('jump');
    this.launch(nx, nz, cfg.wallJumpOut, cfg.wallJumpUp);
    p.emit({ type: 'wall-jump', x: p.pos.x, y: p.pos.y, z: p.pos.z });
    p.stats.wallJumps++;
  }

  launch(nx, nz, out, up) {
    const { p } = this;
    const cfg = p.cfg;
    const into = p.vel.x * nx + p.vel.z * nz;
    if (into < 0) { p.vel.x -= nx * into; p.vel.z -= nz * into; }
    p.vel.x += nx * out;
    p.vel.z += nz * out;
    // Look bias only pushes away from the wall, never back into it.
    const fl = Math.hypot(p.forward.x, p.forward.z) || 1;
    const fx = p.forward.x / fl, fz = p.forward.z / fl;
    if (fx * nx + fz * nz > -0.2) {
      p.vel.x += fx * cfg.wallJumpLookBoost;
      p.vel.z += fz * cfg.wallJumpLookBoost;
    }
    p.vel.y = Math.max(p.vel.y * 0.4, 0) + up;
    p.leaveMover();
    p.machine.set(L.JUMPING);
    p.jump.cuttable = false;
  }

  /** Jump just after leaving a wall. */
  coyoteJump() {
    const cfg = this.p.cfg;
    if (this.coyote <= 0 || !this.last.valid) return false;
    const n = this.last.normal;
    this.coyote = 0;
    this.launch(n.x, n.z, cfg.wallJumpOut, cfg.wallJumpUp);
    this.lockout = cfg.wallRelatchLockout;
    this.p.emit({ type: 'wall-jump', x: this.p.pos.x, y: this.p.pos.y, z: this.p.pos.z });
    this.p.stats.wallJumps++;
    return true;
  }

  /** Wall kick from any nearby usable wall, without running first. Same-wall rule applies. */
  tryKick() {
    const { p } = this;
    const cfg = p.cfg;
    if (p.airTime < 0.05) return false;
    if (p.clearanceBelow(cfg.wallMinClearance)) return false;
    const c = p.center();
    const shape = p.shape();
    const fl = Math.hypot(p.forward.x, p.forward.z) || 1;
    const fx = p.forward.x / fl, fz = p.forward.z / fl;
    let best = null;
    const dirs = [fx, fz, -fx, -fz, fz, -fx, -fz, fx];
    for (let i = 0; i < 8; i += 2) {
      const hit = p.q.sweep(c.x, c.y, c.z, shape, dirs[i], 0, dirs[i + 1], cfg.wallKickProbe, this.hitB);
      if (!this.isUsableWall(hit)) continue;
      if (this.isRememberedWall(hit.normal, hit.point)) continue;
      if (!best || hit.distance < best.distance) {
        best = { distance: hit.distance, nx: hit.normal.x, nz: hit.normal.z, point: { ...hit.point }, normal: { ...hit.normal } };
      }
    }
    if (!best) return false;
    const nl = Math.hypot(best.nx, best.nz) || 1;
    this.remember(best.normal, best.point);
    this.launch(best.nx / nl, best.nz / nl, cfg.wallKickOut, cfg.wallKickUp);
    this.lockout = 0.12;
    p.dash.refill(1);
    p.stats.wallJumps++;
    p.emit({ type: 'wall-jump', kick: true, x: best.point.x, y: best.point.y, z: best.point.z });
    return true;
  }
}

function copyPoint(out, p) { out.x = p.x; out.y = p.y; out.z = p.z; }
