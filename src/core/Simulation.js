import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { CollisionQueries } from '../physics/CollisionQueries.js';
import { Player } from '../player/Player.js';
import { createConfig, DEFAULT_ASSIST, TICK_DT } from '../config/movement.js';
import { RunTimer } from '../timing/RunTimer.js';
import { CheckpointManager, segmentEntersZone } from '../timing/CheckpointManager.js';
import { ReplayRecorder } from '../replay/ReplayRecorder.js';

export const RunPhase = Object.freeze({
  COUNTDOWN: 'countdown',
  RUNNING: 'running',
  FINISHED: 'finished',
  FREE: 'free',
});

const NO_INPUT_KEYS = { forward: 0, strafe: 0, jump: false, jumpPressed: false, slide: false, sprint: false, grapple: false, grapplePressed: false, reelIn: false, reelOut: false, dashPressed: false };

/**
 * One level in play: physics, player, timing, checkpoints, replay recording. Fully headless. The
 * game drives it at a fixed rate; tests and the route bot drive it directly.
 */
export class Simulation {
  /** @param {object} level Output of LevelBuilder.build() */
  constructor(level, { assist = DEFAULT_ASSIST, config = {} } = {}) {
    this.level = level;
    this.cfg = createConfig(config);
    this.dt = TICK_DT;
    this.physics = new PhysicsWorld();
    for (const solid of level.solids) this.physics.addSolid({ ...solid, surface: { ...solid.surface } });

    // Anchor nodes share surface objects with solids so the ray and the assist agree.
    this.anchors = level.anchors.map((a) => ({ ...a, surface: a.surface }));
    for (const m of level.movers) {
      const mover = this.physics.addMover({ ...m.solid, surface: { ...m.solid.surface } }, m.path);
      if (m.anchor) {
        const anchor = { x: 0, y: 0, z: 0, radius: 1, mover, surface: mover.surface };
        mover.surface.grapple = true;
        this.anchors.push(anchor);
      }
    }
    this.physics.flush();

    this.queries = new CollisionQueries(this.physics, this.cfg);
    this.player = new Player({ queries: this.queries, cfg: this.cfg, anchors: this.anchors, assist });
    this.timer = new RunTimer(this.dt);
    this.checkpoints = new CheckpointManager(level);
    this.recorder = new ReplayRecorder();

    this.tick = 0;
    this.phase = RunPhase.FREE;
    this.countdownTicks = 0;
    this.deaths = 0;
    this.events = [];
    this.result = null;
    this._a = { x: 0, y: 0, z: 0 };
    this._b = { x: 0, y: 0, z: 0 };
    this.frozenInput = { ...NO_INPUT_KEYS, yaw: 0, pitch: 0 };
    this.spawnAt(level.spawn.pos, level.spawn.yaw);
  }

  spawnAt(pos, yaw) {
    this.player.teleport(pos, yaw);
    this.spawnYaw = yaw;
    this.settle = 0;
  }

  /** Begins a timed run with a countdown of the given length. */
  startRun(countdownSeconds = 1.5) {
    this.resetRun();
    this.phase = RunPhase.COUNTDOWN;
    this.countdownTicks = Math.round(countdownSeconds / this.dt);
  }

  /** Untimed mode: no countdown, no timer, no finish. */
  startFree() {
    this.resetRun();
    this.phase = RunPhase.FREE;
  }

  resetRun() {
    this.tick = 0;
    this.deaths = 0;
    this.result = null;
    this.timer.reset();
    this.checkpoints.reset();
    this.recorder.reset();
    this.player.resetStats();
    this.spawnAt(this.level.spawn.pos, this.level.spawn.yaw);
    this.player.machine.violations.length = 0;
  }

  /** Returns the player to the last checkpoint. The clock keeps running. */
  respawn(reason = 'fall') {
    const { pos, yaw } = this.checkpoints.respawn;
    this.player.teleport(pos, yaw);
    this.deaths++;
    this.events.push({ type: 'respawn', reason, yaw });
  }

  /** Advances one fixed step. */
  step(input) {
    this.tick++;
    this.physics.update(this.tick, this.dt);

    if (this.phase === RunPhase.COUNTDOWN) {
      // Look is live during the countdown; the body waits.
      this.frozenInput.yaw = input.yaw;
      this.frozenInput.pitch = input.pitch;
      this.player.tick(this.frozenInput, this.dt);
      this.collectEvents();
      this.countdownTicks--;
      if (this.countdownTicks <= 0) {
        this.phase = RunPhase.RUNNING;
        this.timer.start();
        this.tick = 0;
        this.player.resetStats();
        this.events.push({ type: 'go' });
      }
      return;
    }

    if (this.phase === RunPhase.FINISHED) {
      this.player.tick(this.frozenInput, this.dt);
      this.player.drainEvents();
      return;
    }

    this.player.tick(input, this.dt);
    this.collectEvents();

    if (this.phase === RunPhase.RUNNING) {
      this.timer.tick();
      this.recorder.record(this.player);
    }

    const p = this.player;
    const a = this._a, b = this._b;
    const midY = p.height * 0.5;
    a.x = p.prevPos.x; a.y = p.prevPos.y + midY; a.z = p.prevPos.z;
    b.x = p.pos.x; b.y = p.pos.y + midY; b.z = p.pos.z;

    if (this.phase === RunPhase.RUNNING) {
      const hit = this.checkpoints.test(a, b);
      if (hit) {
        const time = this.timer.split(hit.checkpoint.index, hit.fraction);
        p.dash.refill();
        this.events.push({ type: 'checkpoint', index: hit.checkpoint.index, time, total: this.level.checkpoints.length });
      }
      const fz = this.level.finishZone;
      if (fz && this.checkpoints.allRequiredReached) {
        const f = segmentEntersZone(a, b, fz);
        if (f !== null) this.finishRun(f);
      }
    }

    if (p.pos.y < this.level.killY) {
      if (this.phase === RunPhase.FREE) {
        const sp = this.lastFreeSpawn ?? this.level.spawn;
        p.teleport(sp.pos, sp.yaw);
        this.events.push({ type: 'respawn', reason: 'fall', yaw: sp.yaw });
      } else {
        this.respawn('fall');
      }
    }
  }

  finishRun(fraction) {
    const time = this.timer.stop(fraction);
    this.phase = RunPhase.FINISHED;
    const p = this.player;
    const stats = { ...p.stats };
    this.result = {
      levelId: this.level.id,
      time,
      splits: [...this.timer.splits],
      deaths: this.deaths,
      peakSpeed: stats.peakSpeed,
      averageSpeed: stats.movingTime > 0 ? stats.distance / stats.movingTime : 0,
      distance: stats.distance,
      grapples: stats.grapples,
      dashes: stats.dashes,
      wallRuns: stats.wallRuns,
      wallJumps: stats.wallJumps,
      jumps: stats.jumps,
      slides: stats.slides,
    };
    this.events.push({ type: 'finish', time });
  }

  collectEvents() {
    const e = this.player.drainEvents();
    if (e.length) this.events.push(...e);
  }

  drainEvents() {
    if (!this.events.length) return EMPTY;
    const e = this.events;
    this.events = [];
    return e;
  }

  dispose() { this.physics.free(); }
}

const EMPTY = Object.freeze([]);
