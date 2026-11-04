/**
 * Route bot: plays a level through the real simulation using only player inputs, so "this course
 * can be completed" is a fact rather than a hope. It sees exactly what a player sees, and is
 * subject to the same physics, input and tick rate. A route is a generator of per-tick inputs.
 */
import { Simulation, RunPhase } from '../src/core/Simulation.js';
import { blankInput } from './helpers.js';

export class Bot {
  constructor(sim) {
    this.sim = sim;
    this.p = sim.player;
    this.yaw = sim.player.yaw;
    this.pitch = 0;
    this.input = blankInput();
    this.holdGrapple = false;
  }

  /** Fresh input for this tick with held state applied. */
  base(over = {}) {
    return blankInput({ yaw: this.yaw, pitch: this.pitch, grapple: this.holdGrapple, ...over });
  }

  faceTowards(target) {
    const dx = target[0] - this.p.pos.x, dz = target[2] - this.p.pos.z;
    this.yaw = Math.atan2(-dx, -dz);
  }

  aimAt(target) {
    const e = this.p.eye();
    const dx = target[0] - e.x, dy = target[1] - e.y, dz = target[2] - e.z;
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }

  distXZ(target) { return Math.hypot(target[0] - this.p.pos.x, target[2] - this.p.pos.z); }

  /** Run to a point. Finishes when within radius, or when `until` says so. */
  *run(target, { radius = 1.5, until, slide = false, sprint = true, timeout = 2400 } = {}) {
    for (let i = 0; i < timeout; i++) {
      if (until ? until(this.p) : this.distXZ(target) < radius) return;
      this.faceTowards(target);
      this.pitch = 0;
      yield this.base({ forward: 1, sprint, slide });
    }
    throw new Error(`run() to ${target} timed out at ${fmt(this.p.pos)}`);
  }

  *wait(ticks, over = {}) {
    for (let i = 0; i < ticks; i++) yield this.base(over);
  }

  *waitUntil(cond, over = {}, timeout = 1800, name = 'condition') {
    for (let i = 0; i < timeout; i++) {
      if (cond(this.p)) return;
      yield this.base(typeof over === 'function' ? over(this.p) : over);
    }
    throw new Error(`waitUntil(${name}) timed out at ${fmt(this.p.pos)} state=${this.p.machine.state}`);
  }

  /** Jump, holding the key and forward for `holdTicks`. */
  *jump(toward, { hold = 30, slide = false } = {}) {
    if (toward) this.faceTowards(toward);
    yield this.base({ forward: 1, sprint: true, jump: true, jumpPressed: true, slide });
    for (let i = 0; i < hold; i++) {
      if (toward) this.faceTowards(toward);
      yield this.base({ forward: 1, sprint: true, jump: true, slide });
    }
  }

  /** Fly toward a point until grounded. */
  *airTo(target, { timeout = 900 } = {}) {
    for (let i = 0; i < timeout; i++) {
      if (this.p.machine.grounded) return;
      this.faceTowards(target);
      yield this.base({ forward: 1, sprint: true });
    }
    throw new Error(`airTo ${target} never landed; at ${fmt(this.p.pos)}`);
  }

  /** Attach to a point. Rope stays held until `release()`. */
  *attach(target, over = {}) {
    this.aimAt(target);
    this.holdGrapple = true;
    yield this.base({ grapplePressed: true, ...over });
    if (!this.p.grapple.attached) {
      throw new Error(`grapple to ${target} failed from ${fmt(this.p.pos)} target.valid=${this.p.grapple.target.valid}`);
    }
  }

  *release(over = {}) {
    this.holdGrapple = false;
    yield this.base(over);
  }

  *dash(over = {}) { yield this.base({ dashPressed: true, ...over }); }

  /** Run to the end of a course: head for each checkpoint and the finish on the ground. */
  atPhase(phase) { return this.sim.phase === phase; }
}

const fmt = (p) => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;

/**
 * Plays a generator route through a level.
 * @returns {{sim, result, log}} result is the Simulation's finish record.
 */
export function playRoute(level, routeFn, { startCheckpoint = -1, timeoutTicks = 120 * 300, assist, recordInputs = null } = {}) {
  const sim = new Simulation(level, { assist });
  // The same countdown the game uses, so a route starts from the same settled state as a player does.
  sim.startRun(1.8);
  while (sim.phase === RunPhase.COUNTDOWN) sim.step(blankInput({ yaw: level.spawn.yaw }));
  sim.drainEvents();
  // Skip to a checkpoint when testing one section of a course in isolation.
  if (startCheckpoint >= 0) {
    for (let i = 0; i <= startCheckpoint; i++) sim.checkpoints.reached[i] = true;
    sim.checkpoints.current = startCheckpoint;
    const cp = sim.checkpoints.respawn;
    sim.player.teleport(cp.pos, cp.yaw);
  }
  const bot = new Bot(sim);
  const gen = routeFn(bot, sim);
  const log = [];
  const trail = [];
  for (let i = 0; i < timeoutTicks; i++) {
    if (sim.phase === RunPhase.FINISHED) break;
    let value, done;
    try {
      ({ value, done } = gen.next());
    } catch (err) {
      err.message += `\nTrail:\n${trail.slice(-14).join('\n')}`;
      throw err;
    }
    const input = done ? bot.base({ forward: 1, sprint: true }) : value;
    recordInputs?.push({ ...input });
    const deathsBefore = sim.deaths;
    sim.step(input);
    if (i % 30 === 0) trail.push(`${(i / 120).toFixed(1)}s ${fmt(sim.player.pos)} v=${Math.hypot(sim.player.vel.x, sim.player.vel.z).toFixed(1)} ${sim.player.machine.state.slice(0, 4)}${sim.player.grapple.attached ? '+G' : ''}`);
    if (sim.deaths > deathsBefore) {
      throw new Error(`Bot died at tick ${i} in ${level.id}. Trail:\n${trail.slice(-28).join('\n')}`);
    }
    for (const e of sim.drainEvents()) {
      if (e.type === 'checkpoint') log.push(`cp${e.index} ${e.time.toFixed(2)}`);
    }
    if (done && i > timeoutTicks - 2) break;
  }
  return { sim, result: sim.result, log };
}

