import { Locomotion as L, MovementStateMachine } from './MovementStateMachine.js';
import { applyAir, applyGround, applySoftCap, clearAirStrafe } from './MovementController.js';
import { CharacterController } from '../physics/CharacterController.js';
import { JumpSystem } from '../abilities/JumpSystem.js';
import { SlideSystem } from '../abilities/SlideSystem.js';
import { WallRunSystem } from '../abilities/WallRunSystem.js';
import { AirDashSystem } from '../abilities/AirDashSystem.js';
import { GrappleSystem } from '../abilities/GrappleSystem.js';
import { DEFAULT_ASSIST } from '../config/movement.js';

const newStats = () => ({
  jumps: 0, slides: 0, wallRuns: 0, wallJumps: 0, grapples: 0, dashes: 0,
  peakSpeed: 0, distance: 0, movingTime: 0,
});

const makeHit = () => ({ hit: false, distance: 0, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, surface: null, handle: -1 });

/**
 * Player simulation state and the per-tick order of operations. Fixed-step, no rendering, no DOM.
 * Given the same level and the same inputs it produces the same motion.
 *
 * Tick order: carry on platforms → resolve overlaps → ability decisions (grapple, dash, wall, slide,
 * jump) → forces → rope constraint → swept move → ground and landing resolution.
 */
export class Player {
  constructor({ queries, cfg, anchors = [], assist = DEFAULT_ASSIST }) {
    this.q = queries;
    this.cfg = cfg;
    this.assist = { ...assist };
    this.character = new CharacterController(queries, cfg);
    this.machine = new MovementStateMachine(L.FALLING);

    this.pos = { x: 0, y: 0, z: 0 };
    this.prevPos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.prevYaw = 0;
    this.prevPitch = 0;

    this.forward = { x: 0, y: 0, z: -1 };
    this.right = { x: 1, y: 0, z: 0 };
    this.wish = { x: 0, y: 0, z: 0 };
    this.wish3 = { x: 0, y: 0, z: 0 };

    this.crouched = false;
    this.height = cfg.standHeight;
    this.slideBlocked = false;

    this.ground = { normal: { x: 0, y: 1, z: 0 }, surface: null, handle: -1 };
    this.groundTime = 0;
    this.airTime = 0;
    this.prevAirTime = 0;
    this.landingTimer = 0;
    this.tickCount = 0;
    this.input = null;

    this.vault = { timer: 0, cooldown: 0, x: 0, z: 0 };
    this.airStrafe = { x: 0, z: 0, offsetX: 0, offsetZ: 0 };
    this.preMoveSpeedH = 0;

    this._center = { x: 0, y: 0, z: 0 };
    this._eye = { x: 0, y: 0, z: 0 };
    this._chest = { x: 0, y: 0, z: 0 };
    this._groundHit = makeHit();
    this._rayHit = makeHit();

    this.events = [];
    this.stats = newStats();

    this.jump = new JumpSystem(this);
    this.slide = new SlideSystem(this);
    this.wall = new WallRunSystem(this);
    this.dash = new AirDashSystem(this);
    this.grapple = new GrappleSystem(this, anchors);
  }

  emit(event) { this.events.push(event); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  center() {
    this._center.x = this.pos.x;
    this._center.y = this.pos.y + this.height / 2;
    this._center.z = this.pos.z;
    return this._center;
  }
  eye() {
    this._eye.x = this.pos.x;
    this._eye.y = this.pos.y + (this.crouched ? this.cfg.eyeCrouch : this.cfg.eyeStand);
    this._eye.z = this.pos.z;
    return this._eye;
  }
  chest() {
    this._chest.x = this.pos.x;
    this._chest.y = this.pos.y + this.height * 0.62;
    this._chest.z = this.pos.z;
    return this._chest;
  }
  shape() { return this.crouched ? this.q.crouchShape : this.q.standShape; }

  /** Returns false when standing up is blocked by something overhead. */
  setCrouched(want) {
    if (want === this.crouched) return true;
    const cfg = this.cfg;
    if (want) {
      this.crouched = true;
      this.height = cfg.crouchHeight;
      return true;
    }
    if (this.q.overlaps(this.pos.x, this.pos.y + cfg.standHeight / 2 + 0.02, this.pos.z, this.q.standShape)) return false;
    this.crouched = false;
    this.height = cfg.standHeight;
    return true;
  }

  /** Target ground speed for the current input. */
  wishSpeed(input) {
    const cfg = this.cfg;
    if (this.crouched) return cfg.crouchSpeed;
    return input.sprint && input.forward > 0 ? cfg.sprintSpeed : cfg.runSpeed;
  }

  updateBasis(input) {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const f = this.forward, r = this.right;
    f.x = -sy * cp; f.y = sp; f.z = -cy * cp;
    r.x = cy; r.y = 0; r.z = -sy;

    const fw = input.forward, st = input.strafe;
    let wx = -sy * fw + r.x * st;
    let wz = -cy * fw + r.z * st;
    const wl = Math.hypot(wx, wz);
    if (wl > 1e-6) { wx /= wl; wz /= wl; } else { wx = 0; wz = 0; }
    this.wish.x = wx; this.wish.z = wz;

    const w3 = this.wish3;
    w3.x = f.x * fw + r.x * st;
    w3.y = f.y * fw;
    w3.z = f.z * fw + r.z * st;
    const w3l = Math.hypot(w3.x, w3.y, w3.z);
    if (w3l > 1e-6) { w3.x /= w3l; w3.y /= w3l; w3.z /= w3l; }
  }

  /** True when there is ground within `distance` under the feet. */
  clearanceBelow(distance) {
    const hit = this.q.castRay(this.pos.x, this.pos.y + 0.05, this.pos.z, 0, -1, 0, distance + 0.05, this._rayHit);
    return hit.hit;
  }

  leaveMover() {
    const mover = this.ground.surface?.mover;
    if (mover) {
      this.vel.x += mover.vel.x;
      this.vel.y += Math.max(0, mover.vel.y);
      this.vel.z += mover.vel.z;
    }
    this.ground.surface = null;
  }

  /** @param {object} input One tick of input. See PlayerInput for the shape. @param {number} dt */
  tick(input, dt) {
    const m = this.machine;
    const cfg = this.cfg;
    this.input = input;
    this.tickCount++;
    this.prevPos.x = this.pos.x; this.prevPos.y = this.pos.y; this.prevPos.z = this.pos.z;
    this.prevYaw = this.yaw; this.prevPitch = this.pitch;
    this.yaw = input.yaw; this.pitch = input.pitch;
    this.updateBasis(input);
    m.tick(dt);
    if (m.grounded) this.groundTime += dt; else this.airTime += dt;
    this.landingTimer = Math.max(0, this.landingTimer - dt);
    this.vault.cooldown = Math.max(0, this.vault.cooldown - dt);

    // Carry on a moving platform before anything measures position.
    if (m.grounded) {
      const mover = this.ground.surface?.mover;
      if (mover) { this.pos.x += mover.delta.x; this.pos.y += mover.delta.y; this.pos.z += mover.delta.z; }
    }

    // Overlaps are only ever transient (standing up, platforms, respawn), but always resolved.
    const c0 = this.center();
    if (this.q.depenetrate(c0, this.shape())) {
      this.pos.x = c0.x; this.pos.y = c0.y - this.height / 2; this.pos.z = c0.z;
    }

    this.grapple.update(input, dt);
    this.dash.update(input, dt);
    this.wall.update(input, dt);
    this.slide.update(input, dt);
    this.jump.update(input, dt);

    this.applyForces(input, dt);
    this.grapple.constrain(input, dt);
    applySoftCap(this, dt);

    const preVelX = this.vel.x, preVelY = this.vel.y, preVelZ = this.vel.z;
    this.preMoveSpeedH = Math.hypot(preVelX, preVelZ);
    const c = this.center();
    // Stepping stays off while rising, or a jump next to a kerb would hop onto it unasked.
    const canStep = m.grounded || this.vel.y <= 0;
    this.character.move(c, this.vel, this.shape(), dt, canStep);
    this.pos.x = c.x; this.pos.y = c.y - this.height / 2; this.pos.z = c.z;
    this.clipAirStrafe();

    this.wall.afterMove(this.character);
    this.resolveVault(input, preVelX, preVelZ);
    this.resolveGround(input, dt, preVelY);
    if (m.is(L.JUMPING) && this.vel.y < -0.01) m.set(L.FALLING);

    this.updateRunStats(dt);
  }

  /** A wall stopped this much of the velocity, so the strafe layer can't count it as still owed. */
  clipAirStrafe() {
    const st = this.airStrafe;
    if (st.offsetX === 0 && st.offsetZ === 0) return;
    for (let i = 0; i < this.character.hitCount; i++) {
      const n = this.character.hits[i].normal;
      const into = st.offsetX * n.x + st.offsetZ * n.z;
      if (into < 0) {
        st.offsetX -= n.x * into;
        st.offsetZ -= n.z * into;
      }
    }
  }

  applyForces(input, dt) {
    const cfg = this.cfg;
    const m = this.machine;
    const v = this.vel;
    switch (m.state) {
      case L.SLIDING:
        this.slide.forces(input, dt);
        break;
      case L.GROUNDED:
      case L.RUNNING:
        applyGround(this, input, dt);
        break;
      case L.WALL_RUNNING:
        v.y -= cfg.gravity * this.wall.gravityScale() * dt;
        break;
      default: {
        // Taut on a rope, input pumps the swing. Slack or free, normal air control applies.
        if (this.grapple.attached && this.grapple.taut) {
          clearAirStrafe(this);
          this.grapple.pump(input, dt);
        } else {
          applyAir(this, input, dt);
        }
        const scale = this.dash.active ? cfg.dashGravityScale : 1;
        v.y -= cfg.gravity * scale * dt;
      }
    }
  }

  /**
   * Ledge assist: hitting a wall with the lip within reach pops the player over it and gives back
   * the horizontal speed the wall took. Without this a near-miss by a few centimetres kills a run.
   */
  resolveVault(input, preX, preZ) {
    const cfg = this.cfg;
    const m = this.machine;
    const vault = this.vault;

    if (vault.timer > 0) {
      vault.timer -= 1 / 120;
      let blocked = false;
      for (let i = 0; i < this.character.hitCount; i++) {
        if (Math.abs(this.character.hits[i].normal.y) < 0.5) blocked = true;
      }
      if (!blocked) {
        this.vel.x = vault.x; this.vel.z = vault.z;
        vault.timer = 0;
      }
      return;
    }

    if (!this.assist.ledgeVault || vault.cooldown > 0 || !m.airborne || this.grapple.taut) return;
    if (this.vel.y < -11) return;
    for (let i = 0; i < this.character.hitCount; i++) {
      const h = this.character.hits[i];
      if (Math.abs(h.normal.y) > 0.3) continue;
      const nl = Math.hypot(h.normal.x, h.normal.z) || 1;
      const nx = h.normal.x / nl, nz = h.normal.z / nl;
      if (this.wish.x * -nx + this.wish.z * -nz < 0.35) continue;

      const ox = this.pos.x - nx * (cfg.radius + 0.28);
      const oz = this.pos.z - nz * (cfg.radius + 0.28);
      const top = this.pos.y + cfg.vaultReach + 0.05;
      const hit = this.q.castRay(ox, top, oz, 0, -1, 0, cfg.vaultReach, this._rayHit);
      if (!hit.hit || hit.distance < 0.01 || hit.normal.y < 0.7) continue;
      const lip = hit.point.y - this.pos.y;
      if (lip < cfg.vaultMinHeight) continue;
      if (this.q.overlaps(ox, hit.point.y + this.height / 2 + 0.04, oz, this.shape())) continue;

      this.vel.y = Math.sqrt(2 * cfg.gravity * (lip + 0.14));
      vault.x = preX; vault.z = preZ;
      vault.timer = 0.32;
      vault.cooldown = 0.45;
      m.set(L.JUMPING);
      this.jump.cuttable = false;
      this.emit({ type: 'vault', lip });
      return;
    }
  }

  /** Ground probe, snapping, landing detection and walk/fall transitions. */
  resolveGround(input, dt, preVelY) {
    const cfg = this.cfg;
    const m = this.machine;
    const v = this.vel;
    const walkable = Math.cos((cfg.maxSlopeDeg * Math.PI) / 180);
    const wasGrounded = m.grounded;
    const justLeft = this.jump.jumpedThisTick || this.jump.ignoreGroundFor > 0;
    const wallRunning = m.is(L.WALL_RUNNING);

    let onGround = false;
    if (!justLeft) {
      const c = this.center();
      const reach = wasGrounded && !this.grapple.taut ? cfg.groundSnap : cfg.groundProbe;
      const hit = this.q.sweep(c.x, c.y, c.z, this.shape(), 0, -1, 0, reach, this._groundHit);
      if (hit.hit && hit.normal.y >= walkable) {
        const separating = v.x * hit.normal.x + v.y * hit.normal.y + v.z * hit.normal.z;
        const close = hit.distance <= cfg.groundProbe;
        // Rising faster than the surface allows means the player is leaving it, as a ramp launch does.
        const leaving = separating > (wasGrounded ? 3.5 : 0.6);
        if (!leaving && (close || wasGrounded)) {
          onGround = true;
          const drop = Math.max(0, hit.distance - 0.012);
          this.pos.y -= drop;
          this.ground.normal.x = hit.normal.x; this.ground.normal.y = hit.normal.y; this.ground.normal.z = hit.normal.z;
          this.ground.surface = hit.surface;
          this.ground.handle = hit.handle;
          if (separating < 0) { v.x -= hit.normal.x * separating; v.y -= hit.normal.y * separating; v.z -= hit.normal.z * separating; }
        }
      }
    }

    if (onGround) {
      if (!wasGrounded) this.land(input, preVelY, wallRunning);
      else if (!m.is(L.SLIDING)) m.set(Math.hypot(v.x, v.z) > 0.4 ? L.RUNNING : L.GROUNDED);
      return;
    }

    if (wasGrounded) {
      this.leaveMover();
      // Walking off an edge keeps the jump available for a moment.
      if (!this.jump.jumpedThisTick) this.jump.coyote = cfg.coyoteTime;
      this.prevAirTime = 0;
      this.airTime = 0;
      this.groundTime = 0;
      m.set(v.y > 0.5 ? L.JUMPING : L.FALLING);
      if (m.previous === L.SLIDING) this.emit({ type: 'slide-end' });
    }
  }

  land(input, preVelY, fromWall) {
    const cfg = this.cfg;
    const m = this.machine;
    if (fromWall) this.wall.exit('landed');
    clearAirStrafe(this);
    this.prevAirTime = this.airTime;
    this.airTime = 0;
    this.groundTime = 0;
    this.landingTimer = cfg.landingTime;
    this.wall.onGrounded();
    this.dash.refill();

    const speed = Math.hypot(this.vel.x, this.vel.z);
    // Into a slide if the key is held and there is speed for it. Otherwise run or stand.
    if (input.slide && speed >= cfg.slideEnterSpeed) {
      m.set(L.RUNNING);
      this.slide.begin();
    } else {
      m.set(speed > 0.4 ? L.RUNNING : L.GROUNDED);
    }
    this.emit({ type: 'land', impact: -preVelY, speed, airTime: this.prevAirTime });
  }

  updateRunStats(dt) {
    const s = this.stats;
    const speed = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
    if (speed > s.peakSpeed) s.peakSpeed = speed;
    const dx = this.pos.x - this.prevPos.x, dy = this.pos.y - this.prevPos.y, dz = this.pos.z - this.prevPos.z;
    s.distance += Math.hypot(dx, dy, dz);
    s.movingTime += dt;
  }

  /**
   * Places the player safely. Clears the rope, motion and transient timers, and refills dashes.
   * Used by spawn, checkpoint respawn and instant restart, so every path behaves identically.
   */
  teleport(pos, yaw = 0, pitch = 0) {
    this.pos.x = pos.x; this.pos.y = pos.y; this.pos.z = pos.z;
    this.prevPos.x = pos.x; this.prevPos.y = pos.y; this.prevPos.z = pos.z;
    this.vel.x = 0; this.vel.y = 0; this.vel.z = 0;
    this.yaw = yaw; this.pitch = pitch; this.prevYaw = yaw; this.prevPitch = pitch;
    this.crouched = false;
    this.height = this.cfg.standHeight;
    this.slideBlocked = false;
    this.groundTime = 1; this.airTime = 0; this.prevAirTime = 0; this.landingTimer = 0;
    this.vault.timer = 0; this.vault.cooldown = 0;
    this.airStrafe.x = 0; this.airStrafe.z = 0;
    this.airStrafe.offsetX = 0; this.airStrafe.offsetZ = 0;
    this.ground.surface = null;
    this.ground.normal.x = 0; this.ground.normal.y = 1; this.ground.normal.z = 0;
    this.jump.reset();
    this.slide.reset();
    this.wall.reset();
    this.dash.reset();
    this.grapple.reset();
    this.machine.reset(L.FALLING);
    this.events.length = 0;
  }

  resetStats() { this.stats = newStats(); }

  /** Short state name for the HUD and replay. Orthogonal abilities take priority over locomotion. */
  get stateLabel() {
    if (this.grapple.attached) return 'GRAPPLING';
    if (this.dash.active) return 'DASHING';
    if (this.landingTimer > 0 && this.machine.grounded && !this.machine.is(L.SLIDING)) return 'LANDING';
    return this.machine.state;
  }
}
