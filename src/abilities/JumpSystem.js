import { Locomotion as L } from '../player/MovementStateMachine.js';

/**
 * Ground jumps with coyote time, input buffering and hop timing. Also routes a jump press to
 * whichever ability owns it this tick: a wall jump, a grapple hop-off, or a wall kick.
 */
export class JumpSystem {
  constructor(player) {
    this.p = player;
    this.buffer = 0;
    this.coyote = 0;
    this.cuttable = false;
    this.jumpedThisTick = false;
    this.lastTakeoffSpeed = 0;
    this.lastHop = null;
    this.ignoreGroundFor = 0;
  }

  reset() {
    this.buffer = 0; this.coyote = 0; this.cuttable = false;
    this.jumpedThisTick = false; this.lastTakeoffSpeed = 0; this.lastHop = null; this.ignoreGroundFor = 0;
  }

  update(input, dt) {
    const { p } = this;
    const cfg = p.cfg;
    this.jumpedThisTick = false;
    this.buffer = Math.max(0, this.buffer - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.ignoreGroundFor = Math.max(0, this.ignoreGroundFor - dt);
    if (input.jumpPressed || (p.assist.autoHop && input.jump)) this.buffer = cfg.jumpBuffer;

    // Releasing early cuts a rising jump once, for short hops over low things.
    if (this.cuttable) {
      if (p.vel.y <= 0) this.cuttable = false;
      else if (!input.jump && !p.assist.autoHop) { p.vel.y *= cfg.jumpCutFactor; this.cuttable = false; }
    }

    if (this.buffer <= 0) return;

    if (p.wall.active) { p.wall.jump(input); this.consume(); return; }
    if (p.machine.grounded) { this.groundJump(); return; }
    if (this.coyote > 0) { this.groundJump(); return; }
    if (p.grapple.attached) { p.grapple.releaseWithHop(); this.consume(); return; }
    if (p.wall.coyoteJump(input)) { this.consume(); return; }
    if (p.wall.tryKick(input)) { this.consume(); }
  }

  consume() {
    this.buffer = 0;
    this.coyote = 0;
    this.jumpedThisTick = true;
    this.ignoreGroundFor = 0.06;
  }

  /** Grounded jump. Horizontal velocity is untouched: a jump never costs speed. */
  groundJump() {
    const { p } = this;
    const cfg = p.cfg;
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const buffered = cfg.jumpBuffer - this.buffer;
    const hop = this.classifyHop(buffered);
    if (hop === 'perfect' && speed > 1 && speed < cfg.hopBonusCap) {
      const boosted = Math.min(speed + cfg.hopPerfectBonus, cfg.hopBonusCap);
      p.vel.x *= boosted / speed;
      p.vel.z *= boosted / speed;
    }
    p.vel.y = Math.max(p.vel.y, 0) + cfg.jumpSpeed;
    const takeoff = Math.hypot(p.vel.x, p.vel.z);
    const delta = takeoff - this.lastTakeoffSpeed;
    p.leaveMover();
    p.machine.set(L.JUMPING);
    p.setCrouched(p.input?.slide ?? false);
    p.stats.jumps++;
    p.emit({ type: 'jump', hop, speed: takeoff, delta, fromSlide: p.machine.previous === L.SLIDING });
    this.lastTakeoffSpeed = takeoff;
    this.lastHop = hop;
    this.cuttable = true;
    this.consume();
  }

  /**
   * Hop quality is the time between landing and takeoff, or between press and landing when the
   * press came first. Only 'perfect' changes the physics; the rest is training feedback.
   */
  classifyHop(pressedBeforeBy) {
    const { p } = this;
    const cfg = p.cfg;
    if (p.prevAirTime < 0.14) return null;
    if (p.groundTime > 0.4) return null;
    if (p.groundTime > cfg.hopWindow) return 'late';
    const offset = Math.max(p.groundTime, Math.min(pressedBeforeBy, cfg.jumpBuffer) - p.groundTime);
    return offset <= cfg.hopPerfectWindow ? 'perfect' : 'good';
  }
}
