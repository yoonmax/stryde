import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initPhysics } from '../../src/physics/PhysicsWorld.js';
import { Simulation, RunPhase } from '../../src/core/Simulation.js';
import { LevelBuilder } from '../../src/levels/LevelBuilder.js';
import { RunTimer, formatTime } from '../../src/timing/RunTimer.js';
import { segmentEntersZone, CheckpointManager } from '../../src/timing/CheckpointManager.js';
import { decodeReplay, encodeReplay, ReplayRecorder, SAMPLE_TICKS, FLAG_GRAPPLE } from '../../src/replay/ReplayRecorder.js';
import { ReplayPlayer } from '../../src/replay/ReplayPlayer.js';
import { GameFlow as F, GameStateMachine } from '../../src/core/GameStateMachine.js';
import { TRANSITIONS, Locomotion as L, MovementStateMachine } from '../../src/player/MovementStateMachine.js';
import { sanitizeSettings, settingsStore, DEFAULTS, cmPer360, codeLabel } from '../../src/settings/SettingsManager.js';
import { Storage } from '../../src/settings/Storage.js';
import { statsStore, saveBestReplay, loadBestReplay } from '../../src/stats/StatsStore.js';
import { blankInput, DT } from '../helpers.js';

beforeAll(() => initPhysics());

const miniCourse = () => {
  const b = new LevelBuilder({ id: 'mini', number: 9, name: 'MINI', killY: -40, environment: 'morning' });
  b.start([0, 0, 0], 0);
  b.slab(-20, 20, 10, -120, 0, { thick: 4 });
  b.checkpoint([0, 0, -30], { width: 30, height: 8, respawn: [0, 0, -28] });
  b.checkpoint([0, 0, -60], { width: 30, height: 8, respawn: [0, 0, -58] });
  b.finish([0, 0, -100], { width: 30, height: 8 });
  return b.build();
};
const fwd = (over = {}) => blankInput({ forward: 1, sprint: true, ...over });

describe('run timer', () => {
  it('counts ticks and converts them to seconds', () => {
    const t = new RunTimer(DT);
    t.start();
    for (let i = 0; i < 240; i++) t.tick();
    expect(t.elapsed).toBeCloseTo(2, 6);
  });

  it('resolves a finish inside the tick', () => {
    const t = new RunTimer(DT);
    t.start();
    for (let i = 0; i < 120; i++) t.tick();
    const stopped = t.stop(0.5);
    expect(stopped).toBeCloseTo((119 + 0.5) * DT, 6);
    t.tick();
    expect(t.elapsed).toBe(stopped);
  });

  it('formats times', () => {
    expect(formatTime(5.0)).toBe('5.000');
    expect(formatTime(65.5)).toBe('1:05.500');
    expect(formatTime(-0.25, { sign: true })).toBe('−0.250');
    expect(formatTime(0.25, { sign: true })).toBe('+0.250');
    expect(formatTime(null)).toBe('--:--');
  });
});

describe('checkpoints and finish volumes', () => {
  const zone = { center: { x: 0, y: 0, z: 0 }, half: { x: 2, y: 2, z: 1 }, yaw: 0 };

  it('catches a segment that passes straight through in one tick', () => {
    const f = segmentEntersZone({ x: 0, y: 0, z: 50 }, { x: 0, y: 0, z: -50 }, zone);
    expect(f).toBeCloseTo(0.49, 2);
  });

  it('misses a segment that goes around', () => {
    expect(segmentEntersZone({ x: 5, y: 0, z: 50 }, { x: 5, y: 0, z: -50 }, zone)).toBeNull();
  });

  it('respects the yaw of a rotated gate', () => {
    const rotated = { ...zone, yaw: Math.PI / 2 };
    expect(segmentEntersZone({ x: 0, y: 0, z: 1.5 }, { x: 0, y: 0, z: 1.8 }, rotated)).not.toBeNull();
    expect(segmentEntersZone({ x: 0, y: 0, z: 1.5 }, { x: 0, y: 0, z: 1.8 }, zone)).toBeNull();
  });

  it('is ordered, cannot go backward, and tracks respawn', () => {
    const level = miniCourse();
    const m = new CheckpointManager(level);
    expect(m.respawn.pos).toEqual(level.spawn.pos);
    expect(m.test({ x: 0, y: 2, z: -25 }, { x: 0, y: 2, z: -35 }).checkpoint.index).toBe(0);
    expect(m.test({ x: 0, y: 2, z: -25 }, { x: 0, y: 2, z: -35 })).toBeNull();
    expect(m.respawn.pos).toEqual(level.checkpoints[0].respawn);
  });

  it('flying past a gate does not void the run: the later gate still counts', () => {
    const level = miniCourse();
    const m = new CheckpointManager(level);
    const hit = m.test({ x: 0, y: 2, z: -55 }, { x: 0, y: 2, z: -65 });
    expect(hit.checkpoint.index).toBe(1);
    expect(m.reached).toEqual([false, true]);
    expect(m.allRequiredReached).toBe(true);
    expect(m.test({ x: 0, y: 2, z: -25 }, { x: 0, y: 2, z: -35 })).toBeNull();
  });

  it('a single tick crossing two gates credits the furthest', () => {
    const m = new CheckpointManager(miniCourse());
    expect(m.test({ x: 0, y: 2, z: -20 }, { x: 0, y: 2, z: -70 }).checkpoint.index).toBe(1);
  });

  it('the finish still needs the last required gate', () => {
    const m = new CheckpointManager(miniCourse());
    expect(m.allRequiredReached).toBe(false);
    m.test({ x: 0, y: 2, z: -25 }, { x: 0, y: 2, z: -35 });
    expect(m.allRequiredReached).toBe(false);
  });

  it('a gate counts when swung over high above its frame or past its post', () => {
    const level = miniCourse();
    const cp = level.checkpoints[0];
    const over = new CheckpointManager(level);
    expect(over.test({ x: 0, y: 45, z: -25 }, { x: 0, y: 45, z: -35 })).not.toBeNull();
    const beside = new CheckpointManager(level);
    expect(beside.test({ x: cp.half.x - 1, y: 2, z: -25 }, { x: cp.half.x - 1, y: 2, z: -35 })).not.toBeNull();
    expect(cp.half.x).toBeGreaterThan(15 + 10);
  });
});

describe('a full timed run', () => {
  let sim;
  beforeEach(() => { sim = new Simulation(miniCourse()); });

  it('holds the player during the countdown and starts the timer on GO', () => {
    sim.startRun(0.5);
    expect(sim.phase).toBe(RunPhase.COUNTDOWN);
    for (let i = 0; i < 30; i++) sim.step(fwd());
    expect(sim.player.pos.z).toBeCloseTo(0, 2);
    for (let i = 0; i < 40; i++) sim.step(fwd());
    expect(sim.phase).toBe(RunPhase.RUNNING);
    expect(sim.player.pos.z).toBeLessThan(-0.2);
    expect(sim.timer.elapsed).toBeGreaterThan(0);
  });

  it('records splits and a finish result from real gameplay', () => {
    sim.startRun(0.01);
    for (let i = 0; i < 2400 && sim.phase !== RunPhase.FINISHED; i++) sim.step(fwd());
    expect(sim.phase).toBe(RunPhase.FINISHED);
    const r = sim.result;
    expect(r.splits).toHaveLength(2);
    expect(r.splits[1]).toBeGreaterThan(r.splits[0]);
    expect(r.time).toBeGreaterThan(r.splits[1]);
    // The finish volume starts 98 m out, covered at sprint speed.
    expect(r.time).toBeGreaterThan(98 / 11);
    expect(r.time).toBeLessThan(100 / 11 + 1);
    expect(r.peakSpeed).toBeGreaterThan(10);
    expect(r.deaths).toBe(0);
  });

  it('the timer does not advance while the game stops ticking, which is how pause works', () => {
    sim.startRun(0.01);
    for (let i = 0; i < 120; i++) sim.step(fwd());
    const held = sim.timer.elapsed;
    // Paused: no ticks happen, whatever the wall clock does.
    expect(sim.timer.elapsed).toBe(held);
    sim.step(fwd());
    expect(sim.timer.elapsed).toBeCloseTo(held + DT, 6);
  });

  it('finishes and records an empty split when a gate was flown past', () => {
    const level = miniCourse();
    sim = new Simulation(level);
    sim.startRun(0.01);
    sim.step(fwd());
    sim.player.teleport({ x: 0, y: 0.05, z: -50 }, 0);
    for (let i = 0; i < 2400 && sim.phase !== RunPhase.FINISHED; i++) sim.step(fwd());
    expect(sim.phase).toBe(RunPhase.FINISHED);
    expect(sim.result.splits[0]).toBeUndefined();
    expect(sim.result.splits[1]).toBeGreaterThan(0);
  });

  it('falling respawns at the last checkpoint and restores a clean state', () => {
    sim.startRun(0.01);
    for (let i = 0; i < 2000 && sim.checkpoints.current < 0; i++) sim.step(fwd());
    expect(sim.checkpoints.current).toBe(0);
    const p = sim.player;
    p.dash.charges = 0;
    p.teleport({ x: 100, y: -30, z: 0 });
    p.dash.charges = 0;
    p.vel.y = -40;
    const clock = sim.timer.elapsed;
    for (let i = 0; i < 90 && sim.deaths === 0; i++) sim.step(blankInput());
    expect(sim.deaths).toBe(1);
    expect(p.pos.z).toBeCloseTo(-28, 0);
    expect(p.dash.charges).toBe(p.cfg.dashCharges);
    expect(p.grapple.attached).toBe(false);
    expect(Math.abs(p.vel.y)).toBeLessThan(5);
    expect(sim.timer.elapsed).toBeGreaterThan(clock);
  });

  it('restarting during a transition clears everything', () => {
    sim.startRun(0.01);
    for (let i = 0; i < 300; i++) sim.step(fwd({ slide: i > 200, jump: i === 250, jumpPressed: i === 250 }));
    sim.startRun(0.01);
    expect(sim.timer.elapsed).toBe(0);
    expect(sim.player.pos).toEqual(sim.level.spawn.pos);
    expect(sim.player.vel).toEqual({ x: 0, y: 0, z: 0 });
    expect(sim.player.crouched).toBe(false);
    expect(sim.checkpoints.current).toBe(-1);
    expect(sim.recorder.data).toHaveLength(0);
  });

  it('free mode has no timer and no finish, and always recovers from a fall', () => {
    sim.startFree();
    expect(sim.phase).toBe(RunPhase.FREE);
    sim.player.teleport({ x: 500, y: -35, z: 0 });
    for (let i = 0; i < 120; i++) sim.step(blankInput());
    expect(sim.player.pos.x).toBeCloseTo(0, 0);
  });
});

describe('replay', () => {
  const recordRun = () => {
    const sim = new Simulation(miniCourse());
    sim.startRun(0.01);
    for (let i = 0; i < 2400 && sim.phase !== RunPhase.FINISHED; i++) sim.step(fwd({ yaw: Math.sin(i / 100) * 0.05 }));
    return { sim, replay: sim.recorder.finish({ levelId: 'mini', time: sim.result.time }) };
  };

  it('round-trips through its binary encoding within quantisation error', () => {
    const { replay } = recordRun();
    const back = decodeReplay(encodeReplay(replay));
    expect(back.count).toBe(replay.count);
    expect(back.time).toBe(replay.time);
    for (let i = 0; i < replay.data.length; i += 8) {
      expect(Math.abs(back.data[i] - replay.data[i])).toBeLessThan(0.0051);
      expect(Math.abs(back.data[i + 2] - replay.data[i + 2])).toBeLessThan(0.0051);
      expect(Math.abs(back.data[i + 3] - replay.data[i + 3])).toBeLessThan(0.0016);
      expect(back.data[i + 5]).toBe(replay.data[i + 5]);
    }
  });

  it('is compact', () => {
    const { replay } = recordRun();
    const bytesPerSample = encodeReplay(replay).length / replay.count;
    expect(bytesPerSample).toBeLessThan(40);
  });

  it('refuses a corrupt or foreign replay', () => {
    expect(() => decodeReplay('{"version":99,"b":""}')).toThrow();
    expect(() => decodeReplay('not json')).toThrow();
  });

  it('plays back the recorded positions with interpolation between samples', () => {
    const { replay } = recordRun();
    const player = new ReplayPlayer(replay);
    const a = player.sample(SAMPLE_TICKS * 50);
    const ax = a.z;
    const c = player.sample(SAMPLE_TICKS * 51).z;
    const mid = player.sample(SAMPLE_TICKS * 50.5).z;
    expect(mid).toBeCloseTo((ax + c) / 2, 5);
  });

  it('holds its final pose after the end', () => {
    const { replay } = recordRun();
    const player = new ReplayPlayer(replay);
    const s = player.sample(1e7);
    expect(s.ended).toBe(true);
    expect(s.z).toBeCloseTo(replay.data[(replay.count - 1) * 8 + 2], 5);
  });

  it('interpolates yaw across the wrap the short way', () => {
    const data = [0, 0, 0, Math.PI - 0.01, 0, 0, -1, 0, 0, 0, 0, -Math.PI + 0.01, 0, 0, -1, 0];
    const player = new ReplayPlayer({ data, sampleTicks: 4, count: 2, anchors: [] });
    const s = player.sample(2);
    expect(Math.abs(Math.abs(s.yaw) - Math.PI)).toBeLessThan(0.02);
  });

  it('records grapple activity', () => {
    const r = new ReplayRecorder();
    const fake = {
      pos: { x: 1, y: 2, z: 3 }, yaw: 0, pitch: 0, vel: { x: 0, y: 0, z: 0 }, crouched: false,
      wall: { active: false }, dash: { active: false }, machine: { grounded: false },
      grapple: { attached: true, anchor: { x: 9, y: 9, z: 9 } },
    };
    r.record(fake);
    const rec = r.finish({});
    expect(rec.data[5] & FLAG_GRAPPLE).toBe(FLAG_GRAPPLE);
    expect(rec.anchors[rec.data[6]]).toEqual({ x: 9, y: 9, z: 9 });
  });

  it('stores and loads through local storage', () => {
    const { replay } = recordRun();
    expect(saveBestReplay('mini', replay)).toBe(true);
    const loaded = loadBestReplay('mini');
    expect(loaded.count).toBe(replay.count);
    expect(loadBestReplay('nothing-here')).toBeNull();
  });

  it('ignores corrupt stored ghosts rather than crashing', () => {
    Storage.setRaw('replay.broken', '{{{');
    expect(loadBestReplay('broken')).toBeNull();
  });
});

describe('state machines', () => {
  it('locomotion table only names known states', () => {
    for (const [from, tos] of Object.entries(TRANSITIONS)) {
      expect(L[from]).toBe(from);
      for (const t of tos) expect(L[t]).toBe(t);
    }
  });

  it('reports an illegal transition rather than taking it', () => {
    const m = new MovementStateMachine(L.GROUNDED);
    expect(m.set(L.WALL_RUNNING)).toBe(false);
    expect(m.state).toBe(L.GROUNDED);
    expect(m.violations).toEqual(['GROUNDED->WALL_RUNNING']);
  });

  it('game flow rejects nonsense and remembers where a pause came from', () => {
    const flow = new GameStateMachine();
    expect(() => flow.go(F.RESULTS)).toThrow();
    flow.go(F.MENU);
    flow.go(F.COUNTDOWN);
    flow.pause();
    expect(flow.state).toBe(F.PAUSED);
    flow.resume();
    expect(flow.state).toBe(F.COUNTDOWN);
    flow.go(F.PLAYING);
    flow.pause();
    flow.resume();
    expect(flow.state).toBe(F.PLAYING);
  });

  it('pausing outside play does nothing, as when focus is lost on a menu', () => {
    const flow = new GameStateMachine();
    flow.go(F.MENU);
    expect(flow.pause()).toBe(false);
    expect(flow.state).toBe(F.MENU);
  });
});

describe('settings', () => {
  beforeEach(() => settingsStore.getState().resetAll());

  it('merges saved values over defaults and drops bad data', () => {
    const s = sanitizeSettings({
      mouse: { sensitivity: 3.1, unknownKey: 5, invertY: 'yes' },
      graphics: 'corrupted',
      controls: { jump: ['KeyJ'], grapple: 'not-an-array' },
    });
    expect(s.mouse.sensitivity).toBe(3.1);
    expect(s.mouse.invertY).toBe(DEFAULTS.mouse.invertY);
    expect(s.mouse.unknownKey).toBeUndefined();
    expect(s.graphics.shadows).toBe(DEFAULTS.graphics.shadows);
    expect(s.controls.jump).toEqual(['KeyJ']);
    expect(s.controls.grapple).toEqual(DEFAULTS.controls.grapple);
  });

  it('survives garbage', () => {
    expect(sanitizeSettings(null).mouse.sensitivity).toBe(DEFAULTS.mouse.sensitivity);
    expect(sanitizeSettings('nope').audio.master).toBe(DEFAULTS.audio.master);
  });

  it('persists a change', () => {
    settingsStore.getState().update('mouse', 'sensitivity', 2.5);
    expect(Storage.get('settings').mouse.sensitivity).toBe(2.5);
  });

  it('marks graphics as custom after a manual change', () => {
    settingsStore.getState().applyPreset('performance');
    expect(settingsStore.getState().graphics.preset).toBe('performance');
    settingsStore.getState().update('graphics', 'aa', 'off');
    expect(settingsStore.getState().graphics.preset).toBe('custom');
  });

  it('does not treat showing FPS as leaving a preset', () => {
    settingsStore.getState().applyPreset('balanced');
    settingsStore.getState().update('graphics', 'showFps', true);
    expect(settingsStore.getState().graphics.preset).toBe('balanced');
  });

  it('moves a key from its old action and reports the conflict', () => {
    const conflict = settingsStore.getState().bind('dash', 0, 'KeyW');
    expect(conflict).toBe('forward');
    const c = settingsStore.getState().controls;
    expect(c.dash).toEqual(['KeyW']);
    expect(c.forward).toEqual([]);
  });

  it('binds a second key alongside the first', () => {
    expect(settingsStore.getState().bind('jump', 1, 'KeyV')).toBeNull();
    expect(settingsStore.getState().controls.jump).toEqual(['Space', 'KeyV']);
  });

  it('resets one section without touching others', () => {
    const s = settingsStore.getState();
    s.update('mouse', 'sensitivity', 7);
    s.update('audio', 'master', 0.1);
    s.resetSection('mouse');
    expect(settingsStore.getState().mouse.sensitivity).toBe(DEFAULTS.mouse.sensitivity);
    expect(settingsStore.getState().audio.master).toBe(0.1);
    settingsStore.getState().resetAll();
    expect(settingsStore.getState().audio.master).toBe(DEFAULTS.audio.master);
  });

  it('computes physical sensitivity and key names', () => {
    expect(cmPer360(1, 1000)).toBeCloseTo(41.56, 1);
    expect(codeLabel('Mouse2')).toBe('Right mouse');
    expect(codeLabel('KeyQ')).toBe('Q');
    expect(codeLabel('ControlLeft')).toBe('Left Ctrl');
    expect(codeLabel(undefined)).toBe('None');
  });
});

describe('statistics', () => {
  beforeEach(() => statsStore.getState().clearAll());

  const result = (time, splits = [1, 2]) => ({ levelId: 'x', time, splits, peakSpeed: 20 + time });

  it('tracks a personal best and fastest splits independently', () => {
    const st = statsStore.getState();
    expect(st.recordFinish(result(30, [10, 20])).isBest).toBe(true);
    const second = statsStore.getState().recordFinish(result(32, [9, 22]));
    expect(second.isBest).toBe(false);
    expect(second.previousBest).toBe(30);
    const third = statsStore.getState().recordFinish(result(28, [11, 19]));
    expect(third.isBest).toBe(true);
    const c = statsStore.getState().course('x');
    expect(c.best).toBe(28);
    expect(c.bestSplits).toEqual([9, 19]);
    expect(c.runs).toBe(3);
    expect(statsStore.getState().completedRuns).toBe(3);
  });

  it('accumulates counters and keeps the top speed', () => {
    const s = statsStore.getState();
    s.addCounters({ playtime: 5, grapples: 2, wallRuns: 1, dashes: 3, peak: 30 });
    statsStore.getState().addCounters({ playtime: 5, grapples: 1, peak: 20 });
    const now = statsStore.getState();
    expect(now.playtime).toBe(10);
    expect(now.grapples).toBe(3);
    expect(now.topSpeed).toBe(30);
  });

  it('starts empty and clears completely', () => {
    statsStore.getState().recordFinish(result(10));
    statsStore.getState().clearAll();
    const s = statsStore.getState();
    expect(s.completedRuns).toBe(0);
    expect(s.course('x').best).toBeNull();
    expect(Storage.get('stats')).toBeNull();
  });
});

describe('storage failures', () => {
  it('falls back to memory, so a blocked or full store cannot crash the game', () => {
    expect(Storage.set('k', { a: 1 })).toBeDefined();
    expect(Storage.get('k')).toEqual({ a: 1 });
    expect(Storage.get('missing', 'fallback')).toBe('fallback');
    Storage.remove('k');
    expect(Storage.get('k')).toBeNull();
  });
});
