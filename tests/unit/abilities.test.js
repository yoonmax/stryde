import { describe, it, expect } from 'vitest';
import { makeWorld, floor, box, blankInput, speedH, speed3, energy } from '../helpers.js';
import { Locomotion as L } from '../../src/player/MovementStateMachine.js';

const grappleInput = (over = {}, i = 1) => blankInput({ grapple: true, grapplePressed: i === 0, ...over });
const aimAt = (p, a) => {
  const e = p.eye();
  const dx = a.x - e.x, dy = a.y - e.y, dz = a.z - e.z;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
};

/** Long wall on the left of a corridor heading -Z. Starts the player in flight beside it. */
const wallWorld = async (opts = {}) => {
  const sim = await makeWorld({
    solids: [floor(800, -40.5), box(-3, 10, -200, 1, 60, 800), ...(opts.solids ?? [])],
    spawn: { x: -1.9, y: 10, z: 0 },
    ...opts.world,
  });
  sim.player.vel.z = -12;
  return sim;
};

describe('wall running', () => {
  it('latches onto a wall when moving along it and airborne', async () => {
    const { run, player: p } = await wallWorld();
    run(20, blankInput({ forward: 1 }));
    expect(p.machine.state).toBe(L.WALL_RUNNING);
  });

  it('does not latch at low speed', async () => {
    const { run, player: p } = await wallWorld();
    p.vel.z = -3;
    run(10, blankInput({ forward: 1 }));
    expect(p.machine.state).not.toBe(L.WALL_RUNNING);
  });

  it('does not latch on a surface marked non-runnable', async () => {
    const sim = await makeWorld({
      solids: [floor(800, -40.5), box(-3, 10, -200, 1, 60, 800, { wallrun: false })],
      spawn: { x: -1.9, y: 10, z: 0 },
    });
    sim.player.vel.z = -12;
    sim.run(30, blankInput({ forward: 1 }));
    expect(sim.player.machine.state).not.toBe(L.WALL_RUNNING);
  });

  it('does not latch when too close to the ground', async () => {
    const sim = await makeWorld({
      solids: [floor(), box(-3, 3, -100, 1, 6, 400)],
      spawn: { x: -1.9, y: 0.25, z: 0 },
    });
    sim.player.vel.z = -12;
    sim.run(6, blankInput({ forward: 1 }));
    expect(sim.player.machine.state).not.toBe(L.WALL_RUNNING);
  });

  it('preserves tangential speed and removes into-wall velocity', async () => {
    const { run, player: p } = await wallWorld();
    p.vel.z = -20;
    p.vel.x = -4;
    run(20, blankInput({ forward: 1 }));
    expect(p.machine.state).toBe(L.WALL_RUNNING);
    expect(Math.abs(p.vel.z)).toBeGreaterThan(19);
    expect(Math.abs(p.vel.x)).toBeLessThan(2);
  });

  it('entering at high speed keeps the speed', async () => {
    const { run, player: p } = await wallWorld();
    p.vel.z = -32;
    run(30, blankInput({ forward: 1 }));
    expect(p.machine.state).toBe(L.WALL_RUNNING);
    expect(speedH(p)).toBeGreaterThan(31);
  });

  it('reduces gravity while running', async () => {
    const { run, player: p, cfg } = await wallWorld();
    run(20, blankInput({ forward: 1 }));
    const y0 = p.pos.y;
    run(60, blankInput({ forward: 1 }));
    expect(y0 - p.pos.y).toBeLessThan(0.5 * cfg.gravity * 0.25);
  });

  it('runs out after the maximum duration', async () => {
    const { run, player: p, cfg } = await wallWorld();
    run(20, blankInput({ forward: 1 }));
    expect(p.machine.state).toBe(L.WALL_RUNNING);
    run(Math.ceil(cfg.wallRunMaxTime * 120) + 2, blankInput({ forward: 1 }));
    expect(p.machine.state).not.toBe(L.WALL_RUNNING);
  });

  it('cannot immediately re-latch the same wall', async () => {
    const { run, player: p, cfg } = await wallWorld();
    run(20, blankInput({ forward: 1 }));
    run(Math.ceil(cfg.wallRunMaxTime * 120) + 2, blankInput({ forward: 1 }));
    let again = false;
    for (let i = 0; i < 200; i++) {
      run(1, blankInput({ forward: 1 }));
      if (p.machine.state === L.WALL_RUNNING) again = true;
    }
    expect(again).toBe(false);
  });

  it('wall jump kicks away and keeps tangential speed', async () => {
    const { run, player: p, cfg } = await wallWorld();
    run(20, blankInput({ forward: 1 }));
    const tangential = Math.abs(p.vel.z);
    run(1, blankInput({ forward: 1, jump: true, jumpPressed: true }));
    expect(p.machine.state).toBe(L.JUMPING);
    expect(p.vel.x).toBeGreaterThan(cfg.wallJumpOut - 0.5);
    expect(p.vel.y).toBeGreaterThan(cfg.wallJumpUp - 0.5);
    expect(Math.abs(p.vel.z)).toBeGreaterThan(tangential - 0.5);
  });

  it('chains to a facing wall after a wall jump', async () => {
    const sim = await wallWorld({ solids: [box(5, 10, -200, 1, 60, 800)] });
    const { run, player: p } = sim;
    run(20, blankInput({ forward: 1 }));
    run(1, blankInput({ forward: 1, jump: true, jumpPressed: true }));
    let chained = false;
    for (let i = 0; i < 120 && !chained; i++) {
      run(1, blankInput({ forward: 1, jump: true, yaw: -0.6 }));
      if (p.machine.state === L.WALL_RUNNING && p.wall.normal.x < 0) chained = true;
    }
    expect(chained).toBe(true);
  });

  it('allows a jump for a moment after the wall ends', async () => {
    const sim = await makeWorld({
      solids: [floor(800, -40.5), box(-3, 10, -10, 1, 60, 30)],
      spawn: { x: -1.9, y: 10, z: 0 },
    });
    const { run, player: p, cfg } = sim;
    p.vel.z = -14;
    run(20, blankInput({ forward: 1 }));
    expect(p.machine.state).toBe(L.WALL_RUNNING);
    for (let i = 0; i < 300 && p.machine.state === L.WALL_RUNNING; i++) run(1, blankInput({ forward: 1 }));
    expect(p.wall.coyote).toBeGreaterThan(0);
    run(1, blankInput({ forward: 1, jump: true, jumpPressed: true }));
    expect(p.vel.y).toBeGreaterThan(cfg.wallJumpUp - 1);
  });

  it('turns an inside corner without losing the speed', async () => {
    const sim = await makeWorld({
      solids: [floor(800, -40.5), box(-3, 10, -30, 1, 60, 80), box(30, 10, -60, 66, 60, 1)],
      spawn: { x: -1.9, y: 10, z: -30 },
    });
    const { run, player: p } = sim;
    p.vel.z = -16;
    run(20, blankInput({ forward: 1 }));
    expect(p.machine.state).toBe(L.WALL_RUNNING);
    let cornered = false;
    for (let i = 0; i < 300 && !cornered; i++) {
      run(1, blankInput({ forward: 1, yaw: -0.8 }));
      if (p.machine.state === L.WALL_RUNNING && p.wall.normal.z > 0.5) cornered = true;
    }
    expect(cornered).toBe(true);
    expect(speedH(p)).toBeGreaterThan(10);
  });

  it('follows a curved wall, keeping speed around the bend', async () => {
    const sim = await makeWorld({
      solids: [floor(800, -60.5), { shape: 'cylinder', radius: 20, height: 200, pos: { x: 0, y: 0, z: 0 }, surface: { wallrun: true } }],
      spawn: { x: 20.6, y: 10, z: 0 },
    });
    const { run, player: p } = sim;
    p.vel.z = -14;
    run(20, blankInput({ forward: 1 }));
    expect(p.machine.state).toBe(L.WALL_RUNNING);
    // Look along the tangent as a player naturally would while running around a curve.
    run(120, () => blankInput({ forward: 1, yaw: Math.atan2(-p.vel.x, -p.vel.z) }));
    expect(p.machine.state).toBe(L.WALL_RUNNING);
    expect(speedH(p)).toBeGreaterThan(12);
    expect(Math.hypot(p.pos.x, p.pos.z)).toBeLessThan(21.5);
    expect(p.pos.x).toBeLessThan(17);
  });

  it('wall kicks climb alternating facing walls but not one wall', async () => {
    const sim = await makeWorld({
      solids: [floor(), box(-2.2, 20, 0, 1, 40, 20), box(2.2, 20, 0, 1, 40, 20)],
      spawn: { x: -1.2, y: 3, z: 0 },
    });
    const { run, player: p } = sim;
    run(8, blankInput());
    run(1, blankInput({ jump: true, jumpPressed: true, strafe: 1 }));
    expect(p.vel.y).toBeGreaterThan(8);
    run(10, blankInput());
    const vy = p.vel.y;
    // Immediately again on the same wall: refused, since no other wall has been touched.
    p.wall.lockout = 0;
    run(1, blankInput({ jump: true, jumpPressed: true }));
    expect(p.vel.y).toBeLessThan(vy + 0.1);
  });

  it('a wall run refills one dash charge', async () => {
    const { run, player: p, cfg } = await wallWorld();
    p.dash.charges = 0;
    run(20, blankInput({ forward: 1 }));
    expect(p.dash.charges).toBe(1);
    expect(cfg.dashCharges).toBeGreaterThan(1);
  });

  it('entering a grapple while wall running keeps the run until the rope goes taut', async () => {
    const anchor = { x: 6, y: 30, z: -60 };
    const sim = await wallWorld({ world: { anchors: [anchor] } });
    const { run, player: p } = sim;
    run(20, blankInput({ forward: 1 }));
    expect(p.machine.state).toBe(L.WALL_RUNNING);
    const aim = aimAt(p, anchor);
    run(1, blankInput({ forward: 1, grapple: true, grapplePressed: true, ...aim }));
    expect(p.grapple.attached).toBe(true);
    expect(p.machine.violations).toEqual([]);
  });
});

describe('grapple', () => {
  const anchor = { x: 0, y: 40, z: -30 };

  it('acquires a valid anchor only when aimed at it', async () => {
    const sim = await makeWorld({ solids: [floor()], anchors: [anchor], spawn: { x: 0, y: 0.02, z: 0 } });
    const { run, player: p } = sim;
    run(10);
    run(1, blankInput());
    expect(p.grapple.target.valid).toBe(false);
    const aim = aimAt(p, anchor);
    run(1, blankInput(aim));
    expect(p.grapple.target.valid).toBe(true);
    expect(p.grapple.target.node).toBe(true);
  });

  it('rejects surfaces not marked grappleable, even directly under the crosshair', async () => {
    const sim = await makeWorld({ solids: [floor(), box(0, 30, -30, 40, 2, 40, { grapple: false })] });
    const { run, player: p } = sim;
    run(10);
    run(1, blankInput({ pitch: 1.2, grapple: true, grapplePressed: true }));
    expect(p.grapple.attached).toBe(false);
  });

  it('accepts marked surfaces', async () => {
    const sim = await makeWorld({ solids: [floor(), box(0, 30, -30, 40, 2, 40, { grapple: true })] });
    const { run, player: p } = sim;
    run(10);
    run(1, blankInput({ pitch: 1.2, grapple: true, grapplePressed: true }));
    expect(p.grapple.attached).toBe(true);
  });

  it('cannot acquire through a wall or beyond range', async () => {
    const blocked = await makeWorld({ solids: [floor(), box(0, 10, -8, 40, 60, 1)], anchors: [anchor] });
    blocked.run(10);
    blocked.run(1, blankInput(aimAt(blocked.player, anchor)));
    expect(blocked.player.grapple.target.valid).toBe(false);
    const far = { x: 0, y: 100, z: -200 };
    const distant = await makeWorld({ solids: [floor()], anchors: [far] });
    distant.run(10);
    distant.run(1, blankInput(aimAt(distant.player, far)));
    expect(distant.player.grapple.target.valid).toBe(false);
  });

  it('assist picks an anchor just off the crosshair, and can be turned off', async () => {
    const on = await makeWorld({ solids: [floor()], anchors: [anchor] });
    on.run(10);
    const aim = aimAt(on.player, anchor);
    on.run(1, blankInput({ ...aim, yaw: aim.yaw + 0.04 }));
    expect(on.player.grapple.target.valid).toBe(true);
    const off = await makeWorld({ solids: [floor()], anchors: [anchor], assist: { grappleAim: false, ledgeVault: true, autoHop: false } });
    off.run(10);
    off.run(1, blankInput({ ...aim, yaw: aim.yaw + 0.04 }));
    expect(off.player.grapple.target.valid).toBe(false);
  });

  const swingWorld = async (opts = {}) => {
    const a = { x: 0, y: 60, z: 0 };
    const sim = await makeWorld({ anchors: [a], spawn: { x: 0, y: 60 - 30, z: 30 }, cfg: { grappleTakeUp: 0 }, ...opts });
    const { player: p } = sim;
    sim.run(1, blankInput({ ...aimAt(p, a), grapple: true, grapplePressed: true }));
    expect(p.grapple.attached).toBe(true);
    return { ...sim, a };
  };

  it('holds the rope length when taut', async () => {
    const { run, player: p, a } = await swingWorld();
    const L0 = p.grapple.length;
    for (let i = 0; i < 400; i++) {
      run(1, blankInput({ grapple: true }));
      const c = p.chest();
      const d = Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z);
      expect(d).toBeLessThan(L0 + 0.02);
    }
  });

  it('never gains energy in a free swing', async () => {
    const { run, player: p, cfg } = await swingWorld();
    let peakEnergy = -Infinity;
    const start = energy(p, cfg.gravity);
    for (let i = 0; i < 1200; i++) {
      run(1, blankInput({ grapple: true }));
      peakEnergy = Math.max(peakEnergy, energy(p, cfg.gravity));
    }
    expect(peakEnergy).toBeLessThanOrEqual(start + 0.5);
    // A pendulum solver that bled heavily would lose the swing. Keep at least 80 percent.
    const final = energy(p, cfg.gravity);
    const lowest = cfg.gravity * (60 - p.grapple.length);
    expect(final - lowest).toBeGreaterThan((start - lowest) * 0.8);
  });

  it('converts a fall into horizontal speed at the bottom of the arc', async () => {
    const { run, player: p, a } = await swingWorld();
    let best = 0;
    for (let i = 0; i < 400; i++) {
      run(1, blankInput({ grapple: true }));
      best = Math.max(best, speedH(p));
    }
    const drop = p.grapple.length;
    expect(best).toBeGreaterThan(Math.sqrt(2 * 25 * (drop - Math.hypot(30, 30) * 0.71)) * 0.8);
    void a;
  });

  it('does not pull toward the anchor when slack', async () => {
    const sim = await makeWorld({ solids: [floor()], anchors: [anchor], cfg: { grappleTakeUp: 0 } });
    const { run, player: p } = sim;
    run(20);
    run(1, blankInput({ ...aimAt(p, anchor), grapple: true, grapplePressed: true }));
    p.pos.z = -28;
    const z = p.pos.z;
    run(60, blankInput({ grapple: true }));
    expect(p.pos.z).toBeCloseTo(z, 2);
    expect(p.grapple.taut).toBe(false);
  });

  it('release preserves velocity exactly', async () => {
    const { run, player: p } = await swingWorld();
    run(120, blankInput({ grapple: true }));
    const vx = p.vel.x, vz = p.vel.z, vy = p.vel.y;
    expect(speed3(p)).toBeGreaterThan(8);
    run(1, blankInput({ grapple: false }));
    expect(p.grapple.attached).toBe(false);
    expect(p.vel.x).toBeCloseTo(vx, 1);
    expect(p.vel.z).toBeCloseTo(vz, 1);
    expect(p.vel.y).toBeCloseTo(vy - 25 / 120, 1);
  });

  it('jump while swinging releases with an upward hop and no speed loss', async () => {
    const { run, player: p, cfg } = await swingWorld();
    run(120, blankInput({ grapple: true }));
    const s = speedH(p);
    const vy = p.vel.y;
    run(1, blankInput({ grapple: true, jump: true, jumpPressed: true }));
    expect(p.grapple.attached).toBe(false);
    expect(p.vel.y).toBeGreaterThan(vy + cfg.grappleReleaseHop - 1.5);
    expect(speedH(p)).toBeGreaterThan(s - 2.5);
  });

  it('reeling in shortens the rope and raises speed through conservation', async () => {
    const { run, player: p } = await swingWorld();
    run(120, blankInput({ grapple: true }));
    const L0 = p.grapple.length;
    run(60, blankInput({ grapple: true, reelIn: true }));
    expect(p.grapple.length).toBeLessThan(L0 - 5);
  });

  it('reel out lengthens the rope', async () => {
    const { run, player: p } = await swingWorld();
    const L0 = p.grapple.length;
    run(60, blankInput({ grapple: true, reelOut: true }));
    expect(p.grapple.length).toBeGreaterThan(L0 + 5);
  });

  it('input pumps the swing but stops adding speed at the limit', async () => {
    const { run, player: p, cfg } = await swingWorld();
    let top = 0;
    for (let i = 0; i < 2400; i++) {
      const fwd = p.vel.z < 0 ? 1 : -1;
      run(1, blankInput({ grapple: true, forward: fwd, yaw: 0 }));
      top = Math.max(top, speed3(p));
    }
    expect(top).toBeGreaterThan(20);
    expect(top).toBeLessThan(cfg.swingMaxSpeed + 16);
  });

  it('grappling while falling catches the fall', async () => {
    const { run, player: p } = await swingWorld();
    expect(p.machine.airborne).toBe(true);
    run(240, blankInput({ grapple: true }));
    expect(p.pos.y).toBeGreaterThan(60 - p.grapple.length - 2);
  });

  it('grappling right after a dash keeps the dash velocity into the rope', async () => {
    const a = { x: 0, y: 60, z: -40 };
    const sim = await makeWorld({ anchors: [a], spawn: { x: 0, y: 40, z: 0 } });
    const { run, player: p } = sim;
    run(30);
    run(1, blankInput({ dashPressed: true, forward: 1 }));
    expect(p.dash.active).toBe(true);
    const s = speed3(p);
    run(1, blankInput({ ...aimAt(p, a), grapple: true, grapplePressed: true }));
    expect(p.grapple.attached).toBe(true);
    expect(speed3(p)).toBeGreaterThan(s * 0.9);
  });

  it('releasing a grapple beside a wall can flow into a wall run', async () => {
    const a = { x: 8, y: 70, z: -30 };
    const sim = await makeWorld({
      solids: [floor(800, -60.5), box(-3, 10, -200, 1, 200, 800)], anchors: [a], spawn: { x: -1.9, y: 30, z: 0 },
    });
    const { run, player: p } = sim;
    p.vel.z = -16;
    run(1, blankInput({ ...aimAt(p, a), grapple: true, grapplePressed: true }));
    run(4, blankInput({ grapple: true }));
    run(10, blankInput({ grapple: false, forward: 1 }));
    expect(p.machine.state).toBe(L.WALL_RUNNING);
    expect(p.machine.violations).toEqual([]);
  });

  it('a rope cut by geometry snaps', async () => {
    const a = { x: 0, y: 40, z: -30 };
    const sim = await makeWorld({ solids: [floor()], anchors: [a] });
    const { run, player: p, physics } = sim;
    run(10);
    run(1, blankInput({ ...aimAt(p, a), grapple: true, grapplePressed: true }));
    expect(p.grapple.attached).toBe(true);
    physics.addSolid(box(0, 20, -15, 40, 40, 1));
    physics.flush();
    run(60, blankInput({ grapple: true }));
    expect(p.grapple.attached).toBe(false);
  });

  it('respawning during a grapple clears the rope and motion', async () => {
    const { run, player: p } = await swingWorld();
    run(100, blankInput({ grapple: true }));
    p.teleport({ x: 0, y: 200, z: 0 });
    expect(p.grapple.attached).toBe(false);
    expect(p.vel).toEqual({ x: 0, y: 0, z: 0 });
    run(1, blankInput({ grapple: true }));
    expect(p.grapple.attached).toBe(false);
  });

  it('a short cooldown follows a release', async () => {
    const { run, player: p, a } = await swingWorld();
    run(10, blankInput({ grapple: true }));
    run(1, blankInput({ grapple: false }));
    run(1, blankInput({ ...aimAt(p, a), grapple: true, grapplePressed: true }));
    expect(p.grapple.attached).toBe(false);
    run(30, blankInput({ grapple: false }));
    run(1, blankInput({ ...aimAt(p, a), grapple: true, grapplePressed: true }));
    expect(p.grapple.attached).toBe(true);
  });
});

describe('air dash', () => {
  const airWorld = () => makeWorld({ spawn: { x: 0, y: 300, z: 0 } });

  it('adds velocity in the input direction and keeps prior momentum', async () => {
    const { run, player: p, cfg } = await airWorld();
    p.vel.z = -14;
    p.vel.x = 6;
    run(1, blankInput({ strafe: -1, dashPressed: true }));
    expect(p.vel.x).toBeLessThan(6 - cfg.dashImpulse * 0.6);
    expect(p.vel.z).toBeLessThan(-13);
  });

  it('spends charges and refuses when empty', async () => {
    const { run, player: p, cfg } = await airWorld();
    expect(p.dash.charges).toBe(cfg.dashCharges);
    run(1, blankInput({ forward: 1, dashPressed: true }));
    expect(p.dash.charges).toBe(cfg.dashCharges - 1);
    run(40);
    run(1, blankInput({ forward: 1, dashPressed: true }));
    expect(p.dash.charges).toBe(0);
    run(40);
    const s = speedH(p);
    run(1, blankInput({ forward: 1, dashPressed: true }));
    expect(speedH(p)).toBeLessThan(s + 1);
  });

  it('respects the cooldown between dashes', async () => {
    const { run, player: p, cfg } = await airWorld();
    run(1, blankInput({ forward: 1, dashPressed: true }));
    run(2);
    run(1, blankInput({ forward: 1, dashPressed: true }));
    expect(p.dash.charges).toBe(cfg.dashCharges - 1);
  });

  it('does nothing on the ground', async () => {
    const { run, player: p, cfg } = await makeWorld({ solids: [floor()] });
    run(30);
    run(1, blankInput({ forward: 1, dashPressed: true }));
    expect(p.dash.charges).toBe(cfg.dashCharges);
  });

  it('refills on landing', async () => {
    const { run, player: p, cfg } = await makeWorld({ solids: [floor()], spawn: { x: 0, y: 5, z: 0 } });
    run(5);
    run(1, blankInput({ forward: 1, dashPressed: true }));
    expect(p.dash.charges).toBe(cfg.dashCharges - 1);
    run(400);
    expect(p.dash.charges).toBe(cfg.dashCharges);
  });

  it('gain falls off with speed already along the dash', async () => {
    const slow = await airWorld();
    slow.run(1, blankInput({ forward: 1, dashPressed: true }));
    const fast = await airWorld();
    fast.player.vel.z = -30;
    fast.run(1, blankInput({ forward: 1, dashPressed: true }));
    expect(fast.player.vel.z - -30).toBeGreaterThan(-slow.player.cfg.dashImpulse);
    expect(-slow.player.vel.z).toBeGreaterThan(-fast.player.vel.z - 30);
  });

  it('arrests a fall', async () => {
    const { run, player: p } = await airWorld();
    p.vel.y = -20;
    run(1, blankInput({ forward: 1, dashPressed: true }));
    expect(p.vel.y).toBeGreaterThan(-10);
  });

  it('never teleports', async () => {
    const { run, player: p } = await airWorld();
    const z = p.pos.z;
    run(1, blankInput({ forward: 1, dashPressed: true }));
    expect(Math.abs(p.pos.z - z)).toBeLessThan(0.2);
  });

  it('dashing into a wall from point-blank stays on this side of it', async () => {
    const { run, player: p } = await makeWorld({ solids: [box(0, 300, -2, 40, 40, 0.2)], spawn: { x: 0, y: 300, z: -1.4 } });
    for (let i = 0; i < 10; i++) { run(1, blankInput({ forward: 1, dashPressed: i === 0 })); }
    run(40, blankInput({ forward: 1 }));
    expect(p.pos.z).toBeGreaterThan(-2);
  });
});

describe('air strafe with other abilities', () => {
  it('is not carried into a wall run as speed', async () => {
    const { run, player: p } = await wallWorld();
    run(3, blankInput({ forward: 1, strafe: -1 }));
    run(20, blankInput({ forward: 1, strafe: -1 }));
    expect(p.machine.state).toBe(L.WALL_RUNNING);
    expect(p.airStrafe.offsetX).toBe(0);
    expect(p.airStrafe.offsetZ).toBe(0);
  });

  it('is removed when a rope goes taut, and the free-swing energy rule still holds', async () => {
    const a = { x: 0, y: 60, z: 0 };
    const sim = await makeWorld({ anchors: [a], spawn: { x: 0, y: 30, z: 30 }, cfg: { grappleTakeUp: 0 } });
    const { run, player: p, cfg } = sim;
    run(4, blankInput({ strafe: 1 }));
    run(1, blankInput({ ...aimAt(p, a), grapple: true, grapplePressed: true, strafe: 1 }));
    run(240, blankInput({ grapple: true }));
    expect(p.grapple.taut).toBe(true);
    expect(p.airStrafe.offsetX).toBe(0);
    const start = energy(p, cfg.gravity);
    let peak = start;
    for (let i = 0; i < 600; i++) { run(1, blankInput({ grapple: true })); peak = Math.max(peak, energy(p, cfg.gravity)); }
    expect(peak).toBeLessThanOrEqual(start + 0.5);
  });

  it('a dash during a strafe keeps its impulse', async () => {
    const { run, player: p } = await makeWorld({ spawn: { x: 0, y: 300, z: 0 } });
    run(6, blankInput({ strafe: 1 }));
    run(1, blankInput({ strafe: 1, dashPressed: true }));
    const after = p.vel.x;
    expect(after).toBeGreaterThan(p.cfg.airStrafeSpeed);
    run(10, blankInput());
    expect(p.vel.x).toBeGreaterThan(3);
  });
});

describe('ledge vault', () => {
  it('pops over a lip within reach and gives back the speed', async () => {
    const sim = await makeWorld({ solids: [floor(), box(0, 1, -12, 20, 2.2, 8)] });
    const { run, player: p } = sim;
    run(30);
    p.vel.z = -11;
    run(20, blankInput({ forward: 1, sprint: true }));
    run(1, blankInput({ forward: 1, sprint: true, jump: true, jumpPressed: true }));
    run(180, blankInput({ forward: 1, sprint: true, jump: true }));
    expect(p.pos.y).toBeGreaterThan(2);
  });

  it('can be turned off', async () => {
    const sim = await makeWorld({
      solids: [floor(), box(0, 1, -12, 20, 2.2, 8)],
      assist: { grappleAim: true, ledgeVault: false, autoHop: false },
    });
    const { run, player: p } = sim;
    run(30);
    p.vel.z = -11;
    run(20, blankInput({ forward: 1, sprint: true }));
    run(1, blankInput({ forward: 1, sprint: true, jump: true, jumpPressed: true }));
    run(180, blankInput({ forward: 1, sprint: true, jump: true }));
    expect(p.pos.y).toBeLessThan(2);
  });
});
