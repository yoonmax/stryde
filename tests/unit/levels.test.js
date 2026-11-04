import { describe, it, expect, beforeAll } from 'vitest';
import { initPhysics } from '../../src/physics/PhysicsWorld.js';
import { Simulation, RunPhase } from '../../src/core/Simulation.js';
import { COURSE_ORDER, FREE_RUN_ID, getLevel, elevationProfile } from '../../src/levels/LevelManager.js';
import { blankInput } from '../helpers.js';

beforeAll(() => initPhysics());

const ALL = [...COURSE_ORDER, FREE_RUN_ID];

/** Drops the player at a spawn, and checks it comes to rest on a floor without overlapping anything. */
function assertSafeSpawn(sim, pos, yaw, label) {
  const p = sim.player;
  p.teleport(pos, yaw);
  const c = p.center();
  expect(sim.queries.overlaps(c.x, c.y, c.z, p.shape()), `${label} spawn overlaps solid geometry`).toBe(false);
  for (let i = 0; i < 90; i++) p.tick(blankInput({ yaw }), sim.dt);
  expect(p.machine.grounded, `${label} spawn has no floor`).toBe(true);
  expect(Math.abs(p.pos.y - pos.y), `${label} spawn floats or falls`).toBeLessThan(1);
}

describe.each(ALL)('level %s', (id) => {
  it('has safe spawns and respawns', () => {
    const level = getLevel(id);
    const sim = new Simulation(level);
    assertSafeSpawn(sim, level.spawn.pos, level.spawn.yaw, `${id} start`);
    for (const cp of level.checkpoints) assertSafeSpawn(sim, cp.respawn, cp.respawnYaw, `${id} checkpoint ${cp.index}`);
    for (const sp of level.spawnPoints) assertSafeSpawn(sim, sp.pos, sp.yaw, `${id} ${sp.name}`);
    sim.dispose();
  });

  it('has anchors with a visible hanger in range of something', () => {
    const level = getLevel(id);
    for (const a of level.anchors) {
      expect(a.y).toBeGreaterThan(level.killY);
    }
  });

  it('keeps every solid within the size that sweeps stay accurate', () => {
    const level = getLevel(id);
    for (const s of level.solids) {
      if (s.shape === 'box') expect(Math.max(s.size.x, s.size.y, s.size.z)).toBeLessThanOrEqual(700);
    }
  });
});

describe.each(COURSE_ORDER)('course %s structure', (id) => {
  it('has a start, a finish, checkpoints and a route profile', () => {
    const level = getLevel(id);
    expect(level.spawn).toBeTruthy();
    expect(level.finishZone).toBeTruthy();
    expect(level.checkpoints.length).toBeGreaterThanOrEqual(2);
    const profile = elevationProfile(level);
    expect(profile.length).toBeGreaterThan(200);
  });

  it('refuses the finish until required checkpoints are reached', () => {
    const level = getLevel(id);
    const sim = new Simulation(level);
    sim.startRun(0.01);
    sim.step(blankInput());
    sim.step(blankInput());
    const fz = level.finishZone;
    sim.player.teleport({ x: fz.center.x, y: fz.center.y - fz.half.y + 0.1, z: fz.center.z });
    for (let i = 0; i < 10; i++) sim.step(blankInput());
    expect(sim.phase).toBe(RunPhase.RUNNING);
    sim.dispose();
  });
});

it('every course looks different: unique environments and landmarks', () => {
  const envs = COURSE_ORDER.map((id) => getLevel(id).environment);
  expect(new Set(envs).size).toBe(COURSE_ORDER.length);
});
