import { initPhysics } from '../physics/PhysicsWorld.js';
import { Renderer } from '../rendering/Renderer.js';
import { Simulation, RunPhase } from './Simulation.js';
import { GameLoop } from './GameLoop.js';
import { GameFlow as F, GameStateMachine } from './GameStateMachine.js';
import { appStore } from './appStore.js';
import { PlayerInput } from '../player/PlayerInput.js';
import { CameraController } from '../player/CameraController.js';
import { AudioManager } from '../audio/AudioManager.js';
import { settingsStore, getSettings } from '../settings/SettingsManager.js';
import { saveBestReplay, loadBestReplay, statsStore } from '../stats/StatsStore.js';
import { ReplayPlayer } from '../replay/ReplayPlayer.js';
import { getLevel } from '../levels/LevelManager.js';
import { TICK_DT } from '../config/movement.js';
import { Locomotion as L } from '../player/MovementStateMachine.js';
import * as THREE from 'three';

const COUNTDOWN_FULL = 1.8;
const COUNTDOWN_QUICK = 0.7;

/**
 * Connects simulation, renderer, input, audio and UI. It owns no physics or drawing of its own:
 * each frame it advances fixed ticks, routes events, and hands the renderer a camera.
 */
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.audio = new AudioManager();
    this.flow = new GameStateMachine((next) => this.onFlow(next));
    this.loop = new GameLoop({ onTick: () => this.tick(), onFrame: (dt, alpha) => this.frame(dt, alpha) });
    this.input = new PlayerInput(canvas, {
      getSettings,
      onLockChange: (locked) => this.onLockChange(locked),
      onAction: (action, isDown) => this.onAction(action, isDown),
    });
    this.cameraRig = new CameraController(this.renderer.camera);
    this.sim = null;
    this.level = null;
    this.mode = null;
    this.ghostPlayer = null;
    this.hud = null;
    this.backdropTime = 0;
    this.backdrop = null;
    this.ranOnce = false;
    this.attemptCounted = false;
    this.lastSpeedSample = 0;
    this.speedTrace = [];
    this.pendingCounters = { playtime: 0, grapples: 0, wallRuns: 0, dashes: 0, jumps: 0, distance: 0, peak: 0 };
    this.lastCounterFlush = 0;
    this.footDistance = 0;
    this.lookDelta = { x: 0, y: 0 };
    this.shownHints = new Set();
    this._muzzle = new THREE.Vector3();
    this._anchor = new THREE.Vector3();
    this._vel = new THREE.Vector3();
    this._proj = new THREE.Vector3();
    this.hudTimer = 0;
    this.statTimer = 0;

    this.resizeHandler = () => this.resize();
    window.addEventListener('resize', this.resizeHandler);
    this.visibilityHandler = () => { if (document.hidden) this.pause('hidden'); };
    document.addEventListener('visibilitychange', this.visibilityHandler);
    this.blurHandler = () => this.pause('blur');
    window.addEventListener('blur', this.blurHandler);
    this.unloadHandler = (e) => {
      statsStore.getState().flush();
      if (this.flow.is(F.PLAYING) && this.mode !== 'free') { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', this.unloadHandler);

    this.unsubSettings = settingsStore.subscribe((s, prev) => this.onSettings(s, prev));
  }

  /** Runs each real loading step and yields to the browser between them, so progress paints. */
  async load(onProgress) {
    const r = this.renderer;
    const steps = [
      ['Starting physics', () => initPhysics()],
      ...r.loadSteps,
      ['Applying settings', () => {
        const s = getSettings();
        r.applyGraphics(s.graphics);
        this.resize();
        this.loop.fpsCap = s.graphics.fpsCap;
        this.audio.setVolumes(s.audio);
      }],
      ['Building the first course', () => this.showBackdrop('initiation')],
      ['Compiling shaders', () => r.precompile()],
    ];
    for (let i = 0; i < steps.length; i++) {
      onProgress(steps[i][0], i / steps.length);
      await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
      await steps[i][1]();
    }
    onProgress('Ready', 1);
    this.flow.go(F.MENU);
    this.loop.start();
  }

  onSettings(s, prev) {
    if (s.graphics !== prev.graphics) {
      this.renderer.applyGraphics(s.graphics);
      this.loop.fpsCap = s.graphics.fpsCap;
    }
    if (s.audio !== prev.audio) this.audio.setVolumes(s.audio);
    if (s.controls !== prev.controls) this.input.rebuildBindings();
    if (s.gameplay !== prev.gameplay) {
      this.renderer.ghost.setOpacity(s.gameplay.ghostOpacity);
      this.applyAssists();
    }
    if (s.camera !== prev.camera) {
      this.renderer.camera.fov = s.camera.fov;
      this.renderer.camera.updateProjectionMatrix();
    }
    this.hud?.applySettings?.(s);
  }

  applyAssists() {
    if (!this.sim) return;
    const g = getSettings().gameplay;
    const assist = this.sim.player.assist;
    assist.grappleAim = g.grappleAim;
    assist.ledgeVault = g.ledgeVault;
    // Auto hop would make hopping free, so it is confined to free run.
    assist.autoHop = g.autoHop && this.mode === 'free';
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.resize(w, h);
  }

  setHud(api) { this.hud = api; if (api) api.applySettings?.(getSettings()); }

  onFlow(next) {
    appStore.getState().set({ flow: next });
    const tick = next === F.PLAYING || next === F.COUNTDOWN;
    this.loop.tickingEnabled = tick;
    if (tick) this.loop.resetClock();
  }

  /** Cinematic menu background: renders a course with a slow camera, no simulation. */
  showBackdrop(id) {
    const level = getLevel(id);
    this.backdrop = level;
    this.backdropTime = 0;
    this.renderer.setLevel(level);
    this.renderer.showViewmodel = false;
    this.renderer.level.resetGates();
    this.renderer.ghost.setPlayer(null);
    this.renderer.cable.cancel();
  }

  /**
   * Starts a course or free run. Call synchronously from the click that chose it: browsers only grant
   * pointer lock inside a user gesture.
   * @param {'play'|'trial'|'free'} mode
   */
  startCourse(id, mode) {
    this.audio.ensure();
    this.lockFromGesture();
    const level = getLevel(id);
    this.disposeSim();
    this.level = level;
    this.mode = mode;
    this.backdrop = null;
    this.renderer.setLevel(level);
    this.renderer.level.resetGates();
    const g = getSettings().gameplay;
    this.sim = new Simulation(level, {
      assist: { grappleAim: g.grappleAim, ledgeVault: g.ledgeVault, autoHop: g.autoHop && mode === 'free' },
    });
    this.applyAssists();
    this.input.enabled = true;
    this.renderer.showViewmodel = getSettings().camera.showViewmodel;
    this.renderer.camera.fov = getSettings().camera.fov;
    appStore.getState().set({ screen: 'game', currentLevelId: id, currentMode: mode, result: null, showCourseInfo: false });
    this.hud?.onCourseStart?.(level, mode);
    this.beginRun(COUNTDOWN_FULL);
    return true;
  }

  beginRun(countdown) {
    const { sim, level, mode } = this;
    this.input.clearHeld();
    this.renderer.level.resetGates();
    this.renderer.cable.cancel();
    this.shownHints.clear();
    this.speedTrace = [];
    this.lastSpeedSample = 0;
    this.footDistance = 0;
    this.attemptCounted = false;
    this.commitCounters();
    this.statBase = { grapples: 0, wallRuns: 0, dashes: 0, jumps: 0, distance: 0 };

    if (mode === 'free') {
      sim.startFree();
      this.input.setLook(level.spawn.yaw);
      this.cameraRig.reset(sim.cfg.eyeStand);
      this.renderer.ghost.setPlayer(null);
      this.hud?.onRunReset?.(sim, null);
      this.flowTo(F.PLAYING);
      return;
    }

    sim.startRun(countdown);
    this.input.setLook(level.spawn.yaw);
    this.cameraRig.reset(sim.cfg.eyeStand);
    this.countSecond = Math.ceil(countdown / 0.6);

    this.ghostPlayer = null;
    const useGhost = mode === 'trial' && getSettings().gameplay.ghostEnabled;
    if (useGhost) {
      const replay = loadBestReplay(level.id);
      if (replay) this.ghostPlayer = new ReplayPlayer(replay);
    }
    this.renderer.ghost.setPlayer(this.ghostPlayer);
    this.renderer.ghost.setOpacity(getSettings().gameplay.ghostOpacity);
    const best = statsStore.getState().course(level.id);
    this.hud?.onRunReset?.(sim, best);
    this.flowTo(F.COUNTDOWN);
  }

  flowTo(state) {
    if (this.flow.state === state) { this.onFlow(state); return; }
    if (this.flow.state === F.MENU || this.flow.state === F.RESULTS || this.flow.state === F.PAUSED || this.flow.state === F.PLAYING || this.flow.state === F.COUNTDOWN) {
      this.flow.go(state);
    }
  }

  /** Instant restart: same course, no reload, shortest countdown. */
  restart() {
    if (!this.sim) return;
    if (this.mode === 'free') {
      const sp = this.sim.lastFreeSpawn ?? this.level.spawn;
      this.sim.player.teleport(sp.pos, sp.yaw);
      this.input.setLook(sp.yaw);
      this.cameraRig.reset(this.sim.cfg.eyeStand);
      this.renderer.cable.cancel();
      return;
    }
    if (this.sim.phase === RunPhase.RUNNING && this.sim.timer.ticks > 120) statsStore.getState().noteFailed();
    appStore.getState().set({ result: null });
    this.beginRun(COUNTDOWN_QUICK);
  }

  /** Teleport to a named free-run spawn. */
  freeSpawn(index) {
    if (!this.sim || this.mode !== 'free') return;
    const sp = this.level.spawnPoints[index];
    if (!sp) return;
    this.sim.lastFreeSpawn = sp;
    this.sim.player.teleport(sp.pos, sp.yaw);
    this.input.setLook(sp.yaw);
    this.cameraRig.reset(this.sim.cfg.eyeStand);
    this.renderer.cable.cancel();
  }

  /** Back to the last checkpoint. Counts as a reset in the run record, as a fall does. */
  backToCheckpoint() {
    if (!this.sim) return;
    if (this.mode === 'free') { this.restart(); return; }
    if (this.sim.phase !== RunPhase.RUNNING) return;
    this.sim.respawn('manual');
  }

  onAction(action, isDown) {
    if (action === 'info') {
      if (this.flow.is(F.PLAYING) || this.flow.is(F.COUNTDOWN)) appStore.getState().set({ showCourseInfo: isDown });
      return;
    }
    if (!isDown) return;
    if (action === 'restart' && (this.flow.is(F.PLAYING) || this.flow.is(F.COUNTDOWN) || this.flow.is(F.RESULTS))) this.restart();
    if (action === 'checkpoint' && this.flow.is(F.PLAYING)) this.backToCheckpoint();
  }

  lockFromGesture() {
    this.input.enabled = true;
    this.input.requestLock().then((ok) => {
      appStore.getState().set({ lockFailed: !ok });
      // Without the mouse the player can't aim, so stop and offer Resume rather than running blind.
      if (!ok) this.pause('lock');
    });
  }

  onLockChange(locked) {
    if (!locked) this.pause('escape');
    if (locked) appStore.getState().set({ lockFailed: false });
  }

  /**
   * Pauses the simulation. The run timer counts ticks, so it stops with it. Time paused is not part of
   * the run. Rendering carries on so the world stays alive behind the menu.
   */
  pause(reason) {
    if (!this.flow.is(F.PLAYING) && !this.flow.is(F.COUNTDOWN)) return;
    this.pauseReason = reason;
    this.flow.pause();
    this.input.clearHeld();
    this.input.releaseLock();
    this.commitCounters();
    statsStore.getState().flush();
    this.audio.updateLoops({ speed: 0, active: false, attached: false, grappleTension: 0 });
  }

  /** Must run inside a click: re-acquires the pointer. */
  async resume() {
    this.audio.ensure();
    const ok = await this.input.requestLock();
    if (!ok) {
      appStore.getState().set({ lockFailed: true });
      return false;
    }
    appStore.getState().set({ lockFailed: false });
    this.flow.resume();
    return true;
  }

  /** Returns to the main menu, with the course that was just played as the backdrop. */
  exitToMenu() {
    if (this.sim && this.sim.phase === RunPhase.RUNNING && this.sim.timer.ticks > 120) {
      statsStore.getState().noteFailed();
    }
    this.commitCounters();
    statsStore.getState().flush();
    const id = this.level?.id ?? 'initiation';
    this.input.enabled = false;
    this.input.clearHeld();
    this.input.releaseLock();
    this.disposeSim();
    this.flow.go(F.MENU);
    this.showBackdrop(id);
    this.audio.updateLoops({ speed: 0, active: false, attached: false, grappleTension: 0 });
    appStore.getState().set({ screen: 'menu', result: null, showCourseInfo: false });
  }

  disposeSim() {
    this.sim?.dispose();
    this.sim = null;
    this.level = null;
  }

  commitCounters() {
    if (!this.sim) return;
    const st = this.sim.player.stats;
    const base = this.statBase ?? { grapples: 0, wallRuns: 0, dashes: 0, jumps: 0, distance: 0 };
    statsStore.getState().addCounters({
      playtime: this.pendingCounters.playtime,
      grapples: st.grapples - base.grapples,
      wallRuns: st.wallRuns - base.wallRuns,
      dashes: st.dashes - base.dashes,
      jumps: st.jumps - base.jumps,
      distance: st.distance - base.distance,
      peak: st.peakSpeed,
    });
    this.pendingCounters.playtime = 0;
    this.statBase = { grapples: st.grapples, wallRuns: st.wallRuns, dashes: st.dashes, jumps: st.jumps, distance: st.distance };
  }

  /** One fixed simulation step. */
  tick() {
    const { sim } = this;
    if (!sim) return;
    const wasPhase = sim.phase;
    const prevCountdown = sim.countdownTicks;
    const input = this.input.sampleTick();
    const preY = sim.player.pos.y;
    sim.step(input);
    if (sim.player.character.stepped) this.cameraRig.onStep(sim.player.pos.y - preY);
    this.pendingCounters.playtime += TICK_DT;

    // Footsteps follow distance on the ground, not a timer.
    const p = sim.player;
    if (p.machine.is(L.RUNNING) && !p.crouched) {
      const h = Math.hypot(p.vel.x, p.vel.z);
      this.footDistance += h * TICK_DT;
      const stride = 1.5 + h * 0.2;
      if (this.footDistance > stride) {
        this.footDistance = 0;
        this.audio.footstep(h);
      }
    } else if (p.wall.active) {
      const h = Math.hypot(p.vel.x, p.vel.z);
      this.footDistance += h * TICK_DT;
      if (this.footDistance > 3.2) {
        this.footDistance = 0;
        this.audio.footstep(h * 0.6);
      }
    }

    if (wasPhase === RunPhase.COUNTDOWN) {
      const remainingBefore = Math.ceil((prevCountdown * TICK_DT) / 0.6);
      const remaining = Math.ceil((sim.countdownTicks * TICK_DT) / 0.6);
      if (remaining !== remainingBefore && sim.phase === RunPhase.COUNTDOWN) this.audio.onEvent({ type: 'count' });
    }

    if (sim.phase === RunPhase.RUNNING) {
      const t = sim.timer.ticks;
      if (t % 12 === 0) this.speedTrace.push(Math.round(Math.hypot(p.vel.x, p.vel.y, p.vel.z) * 10) / 10);
    }

    for (const e of sim.drainEvents()) this.handleEvent(e);
  }

  handleEvent(e) {
    const { renderer: r } = this;
    const cam = getSettings().camera;
    this.audio.onEvent(e);
    this.cameraRig.onEvent(e, cam);
    this.hud?.onEvent?.(e, this.sim);
    const p = this.sim?.player;
    switch (e.type) {
      case 'go':
        this.flowTo(F.PLAYING);
        if (!this.attemptCounted) { statsStore.getState().noteAttempt(this.level.id); this.attemptCounted = true; }
        break;
      case 'grapple-attach':
        r.cable.attach();
        r.viewmodel.fire();
        r.particles.burst(e.x, e.y, e.z, 6, { speed: 3, up: 1, size: 0.14, life: 0.3, alpha: 0.6 });
        break;
      case 'grapple-release':
        r.cable.release();
        break;
      case 'land':
        if (e.impact > 7 && p) r.particles.burst(p.pos.x, p.pos.y + 0.05, p.pos.z, Math.min(14, 4 + e.impact * 0.5), { speed: 1.2 + e.impact * 0.1, up: 0.5, size: 0.35, life: 0.55, alpha: 0.2 });
        break;
      case 'wall-enter':
        r.particles.burst(e.x, e.y, e.z, 5, { speed: 1, up: 0.4, size: 0.2, life: 0.3, alpha: 0.2 });
        break;
      case 'wall-jump':
        r.particles.burst(e.x, e.y + 0.8, e.z, 6, { speed: 1.5, up: 0.5, size: 0.22, life: 0.35, alpha: 0.22 });
        break;
      case 'dash':
        if (p) r.particles.burst(p.pos.x, p.pos.y + 0.8, p.pos.z, 8, { speed: 2.2, up: 0.4, size: 0.2, life: 0.32, alpha: 0.22 });
        break;
      case 'checkpoint':
        r.level.flashGate(e.index);
        break;
      case 'respawn':
        r.cable.cancel();
        this.input.setLook(e.yaw);
        this.cameraRig.reset(this.sim.cfg.eyeStand);
        break;
      case 'finish':
        r.level.flashGate('finish');
        r.cable.cancel();
        this.finishRun();
        break;
      default:
    }
  }

  finishRun() {
    const { sim, level, mode } = this;
    const stats = statsStore.getState();
    const result = sim.result;
    const record = stats.recordFinish(result);
    this.commitCounters();

    const replay = sim.recorder.overflow ? null : sim.recorder.finish({ levelId: level.id, time: result.time, speedTrace: this.speedTrace });
    let ghostSaved = false;
    if (replay && record.isBest) ghostSaved = saveBestReplay(level.id, replay);

    this.input.clearHeld();
    this.audio.updateLoops({ speed: 0, active: false, attached: false, grappleTension: 0 });
    this.flow.go(F.RESULTS);

    if (getSettings().gameplay.autoRestart) {
      this.restart();
      return;
    }
    this.input.releaseLock();
    appStore.getState().set({
      result: {
        ...result,
        isBest: record.isBest,
        previousBest: record.previousBest,
        previousRun: record.bestRunBefore,
        ghostSaved,
        speedTrace: this.speedTrace,
        mode,
        levelName: level.name,
        levelId: level.id,
      },
    });
  }

  frame(dt, alpha) {
    const r = this.renderer;
    const cam = getSettings().camera;

    if (this.backdrop) {
      this.updateBackdropCamera(dt);
      r.render(dt);
      this.tickStatsDisplay(dt);
      return;
    }
    if (!this.sim) { r.render(dt); return; }

    const p = this.sim.player;
    const sim = this.sim;
    const ticking = this.flow.is(F.PLAYING);
    const a = ticking || this.flow.is(F.COUNTDOWN) ? alpha : 1;

    this.input.takeLookDelta(this.lookDelta);
    this.cameraRig.update(dt, a, p, this.input.yaw, this.input.pitch, cam);
    r.camera.updateMatrixWorld();

    const g = p.grapple;
    r.viewmodel.update(dt, {
      lookDX: this.lookDelta.x, lookDY: this.lookDelta.y,
      grappled: g.attached, reeling: g.reeling,
      bobX: this.cameraRig.bobOut.x, bobY: this.cameraRig.bobOut.y,
      slide: p.machine.is(L.SLIDING) ? 1 : 0,
      tilt: this.cameraRig.roll,
      reduce: cam.reduceMotion,
    });

    // Cable. The rope's physics started on the attach tick; this only draws it catching up.
    r.viewmodel.muzzleWorld(r.camera, this._muzzle);
    if (g.attached) this._anchor.set(g.anchor.x, g.anchor.y, g.anchor.z);
    const c = p.chest();
    const len = Math.hypot(c.x - g.anchor.x, c.y - g.anchor.y, c.z - g.anchor.z);
    const slack = g.attached && !g.taut ? Math.min(1, Math.max(0, (g.length - len) / 6 + 0.15)) : 0;
    r.cable.update(dt, r.time, this._muzzle, this._anchor, r.camera, g.tension, slack);

    // Speed streaks only appear well above sprinting pace.
    const speed = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
    this._vel.set(p.vel.x, p.vel.y, p.vel.z);
    const streak = cam.reduceMotion ? 0 : Math.min(1, Math.max(0, (speed - 24) / 16));
    r.streaks.update(dt, r.camera.position, this._vel, ticking ? streak : 0, getSettings().graphics.particles);

    // Ghost, synchronised to this run's clock.
    if (this.ghostPlayer) {
      const t = sim.phase === RunPhase.RUNNING ? sim.timer.ticks + a : sim.phase === RunPhase.FINISHED ? sim.timer.ticks : 0;
      r.ghost.update(t, r.camera);
    }

    if (ticking) {
      this.audio.updateLoops({
        speed, sliding: p.machine.is(L.SLIDING), wallRunning: p.wall.active,
        grappleTension: g.tension, attached: g.attached, active: true,
      });
    }

    this.updateHud(dt, a);
    r.render(dt, sim.tick * TICK_DT);
    this.tickStatsDisplay(dt);

    this.statTimer += dt;
    if (this.statTimer > 20) {
      this.statTimer = 0;
      if (ticking) this.commitCounters();
    }
  }

  updateHud(dt) {
    const { hud, sim } = this;
    if (!hud || !sim) return;
    const p = sim.player;
    const t = p.grapple.target;
    let sx = 0, sy = 0, visible = false;
    if (p.grapple.attached || t.valid) {
      const src = p.grapple.attached ? p.grapple.anchor : t;
      this._proj.set(src.x, src.y, src.z).project(this.renderer.camera);
      visible = this._proj.z < 1;
      sx = (this._proj.x * 0.5 + 0.5) * window.innerWidth;
      sy = (-this._proj.y * 0.5 + 0.5) * window.innerHeight;
    }
    hud.frame(sim, p, { visible, x: sx, y: sy }, this.loop);
    // Hints fire on proximity, one time per run, in Play mode only.
    if (this.mode === 'play' && getSettings().gameplay.showHints) {
      const level = sim.level;
      for (let i = 0; i < level.hints.length; i++) {
        if (this.shownHints.has(i)) continue;
        const h = level.hints[i];
        const d = Math.hypot(p.pos.x - h.pos.x, p.pos.z - h.pos.z);
        if (d < h.radius && Math.abs(p.pos.y - h.pos.y) < 12) {
          this.shownHints.add(i);
          hud.showHint(h.text);
        }
      }
    }
  }

  tickStatsDisplay(dt) {
    this.hudTimer += dt;
    if (this.hudTimer > 0.25) {
      this.hudTimer = 0;
      this.hud?.perf?.(this.loop.frameStats(), this.renderer.stats);
    }
  }

  updateBackdropCamera(dt) {
    this.backdropTime += dt;
    const level = this.backdrop;
    const cfg = level.preview ?? { pos: [0, 20, 40], look: [0, 0, -100] };
    const t = this.backdropTime;
    const cam = this.renderer.camera;
    const reduce = getSettings().camera.reduceMotion;
    const k = reduce ? 0 : 1;
    cam.position.set(
      cfg.pos[0] + Math.sin(t * 0.05) * 7 * k,
      cfg.pos[1] + Math.sin(t * 0.08) * 1.6 * k,
      cfg.pos[2] + Math.cos(t * 0.05) * 7 * k,
    );
    cam.fov = 58;
    cam.updateProjectionMatrix();
    cam.lookAt(cfg.look[0], cfg.look[1], cfg.look[2]);
  }

  dispose() {
    this.loop.stop();
    window.removeEventListener('resize', this.resizeHandler);
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    window.removeEventListener('blur', this.blurHandler);
    window.removeEventListener('beforeunload', this.unloadHandler);
    this.unsubSettings();
    this.input.dispose();
    this.disposeSim();
    this.audio.dispose();
    this.renderer.dispose();
  }
}
