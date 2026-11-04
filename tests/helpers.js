import { initPhysics, PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { CollisionQueries } from '../src/physics/CollisionQueries.js';
import { Player } from '../src/player/Player.js';
import { createConfig, TICK_DT, DEFAULT_ASSIST } from '../src/config/movement.js';

export const DT = TICK_DT;

export const blankInput = (over = {}) => ({
  forward: 0, strafe: 0, yaw: 0, pitch: 0,
  jump: false, jumpPressed: false,
  slide: false, sprint: false,
  grapple: false, grapplePressed: false,
  reelIn: false, reelOut: false,
  dashPressed: false,
  ...over,
});

export const box = (x, y, z, sx, sy, sz, surface = { wallrun: true }) => ({
  shape: 'box', pos: { x, y, z }, size: { x: sx, y: sy, z: sz }, surface: { ...surface },
});

/** Builds a small test world: a list of solids plus a player standing where you say. */
export async function makeWorld({ solids = [], anchors = [], cfg = {}, assist = DEFAULT_ASSIST, spawn = { x: 0, y: 0.02, z: 0 }, yaw = 0 } = {}) {
  await initPhysics();
  const physics = new PhysicsWorld();
  for (const s of solids) physics.addSolid(s);
  const anchorList = anchors.map((a) => {
    const surface = { grapple: true, node: true, nodeCenter: { x: a.x, y: a.y, z: a.z } };
    physics.addSolid({ shape: 'sphere', radius: 0.6, pos: a, surface });
    return { x: a.x, y: a.y, z: a.z, radius: 0.6, surface };
  });
  physics.flush();
  const config = createConfig(cfg);
  const queries = new CollisionQueries(physics, config);
  const player = new Player({ queries, cfg: config, anchors: anchorList, assist });
  player.teleport(spawn, yaw);
  const sim = {
    physics, player, queries, cfg: config,
    /** Runs n ticks. `input` may be an object or a function of the tick index. */
    run(n, input = blankInput()) {
      for (let i = 0; i < n; i++) {
        const inp = typeof input === 'function' ? input(i) : input;
        player.tick(inp, DT);
      }
      return player;
    },
    settle() { sim.run(30); return player; },
  };
  return sim;
}

export const floor = (size = 400, y = -0.5, surface) => box(0, y, 0, size, 1, size, surface);
export const speedH = (p) => Math.hypot(p.vel.x, p.vel.z);
export const speed3 = (p) => Math.hypot(p.vel.x, p.vel.y, p.vel.z);
export const energy = (p, g) => 0.5 * (p.vel.x ** 2 + p.vel.y ** 2 + p.vel.z ** 2) + g * p.pos.y;
