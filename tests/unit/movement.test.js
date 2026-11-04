import { describe, it, expect } from 'vitest';
import { makeWorld, floor, box, blankInput, speedH, speed3, energy, DT } from '../helpers.js';
import { Locomotion as L } from '../../src/player/MovementStateMachine.js';

const run = (over) => blankInput({ forward: 1, sprint: true, ...over });
const press = (name, over = {}) => (i) => blankInput({ forward: 1, sprint: true, ...(i === 0 ? { [name]: true } : {}), ...over });

describe('ground movement', () => {
  it('accelerates to sprint speed within a quarter second and holds it', async () => {
    const { run: go, player: p, cfg } = await makeWorld({ solids: [floor()] });
    go(30);
    go(30, run());
    expect(speedH(p)).toBeGreaterThan(cfg.sprintSpeed * 0.95);
    go(240, run());
    expect(speedH(p)).toBeCloseTo(cfg.sprintSpeed, 1);
  });

  it('friction stops the player quickly when input ends', async () => {
    const { run: go, player: p } = await makeWorld({ solids: [floor()] });
    go(30); go(120, run());
    go(45);
    expect(speedH(p)).toBeLessThan(0.1);
  });

  it('accelerates identically regardless of how many frames render, since ticks are fixed', async () => {
    const a = await makeWorld({ solids: [floor()] });
    const b = await makeWorld({ solids: [floor()] });
    a.run(30); b.run(30);
    a.run(120, run());
    for (let i = 0; i < 12; i++) b.run(10, run());
    expect(a.player.pos.z).toBeCloseTo(b.player.pos.z, 8);
  });

  it('bleeds overspeed gradually rather than clamping it', async () => {
    const { run: go, player: p, cfg } = await makeWorld({ solids: [floor()] });
    go(30);
    p.vel.z = -30;
    go(12, run());
    expect(speedH(p)).toBeGreaterThan(27);
    go(120, run());
    expect(speedH(p)).toBeLessThan(26);
    expect(speedH(p)).toBeGreaterThan(cfg.sprintSpeed);
  });

  it('strafing sideways at overspeed cannot add speed on the ground', async () => {
    const { run: go, player: p } = await makeWorld({ solids: [floor()] });
    go(30);
    p.vel.z = -25;
    const before = speedH(p);
    go(4, blankInput({ strafe: 1 }));
    expect(speedH(p)).toBeLessThanOrEqual(before + 1e-6);
  });
});

describe('jumping', () => {
  it('reaches the height the config predicts', async () => {
    const { run: go, player: p, cfg } = await makeWorld({ solids: [floor()] });
    go(30);
    let peak = 0;
    go(90, (i) => {
      peak = Math.max(peak, p.pos.y);
      return blankInput({ jump: true, jumpPressed: i === 0 });
    });
    const predicted = cfg.jumpSpeed ** 2 / (2 * cfg.gravity);
    expect(peak).toBeGreaterThan(predicted - 0.1);
    expect(peak).toBeLessThan(predicted + 0.1);
  });

  it('a jump press does not cost horizontal speed', async () => {
    const { run: go, player: p } = await makeWorld({ solids: [floor()] });
    go(30); go(120, run());
    const before = speedH(p);
    go(2, press('jumpPressed', { jump: true }));
    expect(speedH(p)).toBeGreaterThanOrEqual(before - 0.05);
    expect(p.machine.state).toBe(L.JUMPING);
  });

  it('coyote time allows a jump just after walking off a ledge', async () => {
    const { run: go, player: p } = await makeWorld({ solids: [box(0, -0.5, -5, 10, 1, 10.5)], spawn: { x: 0, y: 0.02, z: -1 } });
    go(30);
    let leftAt = -1;
    for (let i = 0; i < 200 && leftAt < 0; i++) {
      go(1, run());
      if (!p.machine.grounded) leftAt = i;
    }
    expect(leftAt).toBeGreaterThanOrEqual(0);
    go(6, run());
    expect(p.vel.y).toBeLessThan(0);
    go(1, run({ jump: true, jumpPressed: true }));
    expect(p.vel.y).toBeGreaterThan(7);
  });

  it('no coyote jump after the window has passed', async () => {
    const { run: go, player: p, cfg } = await makeWorld({ solids: [box(0, -0.5, -5, 10, 1, 10.5)], spawn: { x: 0, y: 0.02, z: -1 } });
    go(30);
    for (let i = 0; i < 200 && p.machine.grounded; i++) go(1, run());
    go(Math.ceil(cfg.coyoteTime / DT) + 4, run());
    const vy = p.vel.y;
    go(1, run({ jump: true, jumpPressed: true }));
    expect(p.vel.y).toBeLessThan(vy + 0.1);
  });

  it('jump buffering fires a press made just before landing', async () => {
    const { run: go, player: p } = await makeWorld({ solids: [floor()], spawn: { x: 0, y: 1.5, z: 0 } });
    while (p.pos.y > 0.25) go(1);
    go(1, blankInput({ jump: true, jumpPressed: true }));
    let jumped = false;
    for (let i = 0; i < 14 && !jumped; i++) {
      go(1, blankInput({ jump: true }));
      if (p.vel.y > 7) jumped = true;
    }
    expect(jumped).toBe(true);
  });

  it('a stale press outside the buffer does nothing on landing', async () => {
    const { run: go, player: p, cfg } = await makeWorld({ solids: [floor()], spawn: { x: 0, y: 6, z: 0 } });
    go(1, blankInput({ jumpPressed: true, jump: true }));
    go(Math.ceil(cfg.jumpBuffer / DT) + 2);
    for (let i = 0; i < 300; i++) go(1);
    expect(p.machine.grounded).toBe(true);
    expect(p.vel.y).toBeCloseTo(0, 3);
  });

  it('releasing jump early produces a lower arc', async () => {
    const full = await makeWorld({ solids: [floor()] });
    const tap = await makeWorld({ solids: [floor()] });
    let a = 0, b = 0;
    full.run(30); tap.run(30);
    full.run(90, (i) => { a = Math.max(a, full.player.pos.y); return blankInput({ jump: true, jumpPressed: i === 0 }); });
    tap.run(90, (i) => { b = Math.max(b, tap.player.pos.y); return blankInput({ jump: i < 8, jumpPressed: i === 0 }); });
    expect(b).toBeLessThan(a * 0.9);
  });

  it('jumping at a ledge does not trap the player on the edge', async () => {
    const { run: go, player: p } = await makeWorld({ solids: [box(0, -0.5, -5, 10, 1, 10)], spawn: { x: 0, y: 0.02, z: -1 } });
    go(30);
    for (let i = 0; i < 60; i++) go(1, run());
    go(1, run({ jump: true, jumpPressed: true }));
    go(240, run({ jump: true }));
    expect(p.pos.y).toBeLessThan(-1);
  });
});

describe('air movement', () => {
  it('air strafing with a synchronised turn gains speed', async () => {
    const { run: go, player: p } = await makeWorld({ spawn: { x: 0, y: 200, z: 0 } });
    p.vel.z = -12;
    let yaw = 0;
    // A fast turn, quicker than the keys steer on their own, is what keeps finding headroom.
    go(90, () => { yaw -= 0.04; return blankInput({ strafe: 1, yaw }); });
    expect(speedH(p)).toBeGreaterThan(13);
  });

  it('holding a strafe key changes direction mid-jump without adding speed', async () => {
    const { run: go, player: p } = await makeWorld({ spawn: { x: 0, y: 200, z: 0 } });
    p.vel.z = -11;
    go(84, blankInput({ strafe: -1 }));
    expect(p.pos.x).toBeLessThan(-3);
    expect(p.vel.x).toBeLessThan(-9);
    expect(speedH(p)).toBeLessThan(11 + 1.6);
    expect(speedH(p)).toBeGreaterThan(10);

    const right = await makeWorld({ spawn: { x: 0, y: 200, z: 0 } });
    right.player.vel.z = -11;
    right.run(84, blankInput({ strafe: 1 }));
    expect(right.player.pos.x).toBeGreaterThan(3);
  });

  it('a strafe works while holding forward too', async () => {
    const { run: go, player: p } = await makeWorld({ spawn: { x: 0, y: 200, z: 0 } });
    p.vel.z = -11;
    go(84, blankInput({ forward: 1, strafe: 1 }));
    expect(p.pos.x).toBeGreaterThan(2);
  });

  it('a strafe turns a fast trajectory less than a slow one, so swing momentum is not thrown away', async () => {
    const turnAfter = async (speed) => {
      const { run: go, player: p } = await makeWorld({ spawn: { x: 0, y: 200, z: 0 } });
      p.vel.z = -speed;
      go(24, blankInput({ strafe: 1 }));
      return Math.atan2(p.vel.x, -p.vel.z);
    };
    const slow = await turnAfter(11);
    const fast = await turnAfter(33);
    expect(fast).toBeLessThan(slow * 0.55);
    expect(fast).toBeGreaterThan(0.1);
  });

  it('reverses air strafe about as fast as on the ground', async () => {
    const { run: go, player: p } = await makeWorld({ spawn: { x: 0, y: 200, z: 0 } });
    p.vel.z = -11;
    go(6, blankInput({ strafe: -1 }));
    expect(p.vel.x).toBeLessThan(-5);
    go(10, blankInput({ strafe: 1 }));
    expect(p.vel.x).toBeGreaterThan(5);
  });

  it('spamming A and D jitters left and right, and goes nowhere on average', async () => {
    const { run: go, player: p } = await makeWorld({ spawn: { x: 0, y: 200, z: 0 } });
    p.vel.z = -11;
    let minV = 0, maxV = 0, minX = 0, maxX = 0;
    for (let i = 0; i < 96; i++) {
      go(1, blankInput({ strafe: Math.floor(i / 12) % 2 ? 1 : -1 }));
      minV = Math.min(minV, p.vel.x); maxV = Math.max(maxV, p.vel.x);
      minX = Math.min(minX, p.pos.x); maxX = Math.max(maxX, p.pos.x);
    }
    expect(minV).toBeLessThan(-5);
    expect(maxV).toBeGreaterThan(5);
    expect(maxX - minX).toBeGreaterThan(0.5);
    expect(Math.abs(p.pos.x)).toBeLessThan(2.5);
  });

  it('letting go of a strafe gives back the original momentum', async () => {
    const { run: go, player: p } = await makeWorld({ spawn: { x: 0, y: 200, z: 0 } });
    p.vel.z = -25;
    go(6, blankInput({ strafe: 1 }));
    expect(p.vel.z).toBeGreaterThan(-25);
    go(10, blankInput());
    expect(speedH(p)).toBeGreaterThan(24.5);
    // A tap also nudges momentum a little through the air-steer, which is meant to persist.
    expect(Math.abs(p.vel.x)).toBeLessThan(3);
  });

  it('a standing jump can be strafed at ground strafing speed straight away', async () => {
    const { run: go, player: p, cfg } = await makeWorld({ spawn: { x: 0, y: 200, z: 0 } });
    go(6, blankInput({ strafe: 1 }));
    expect(p.vel.x).toBeGreaterThan(cfg.airStrafeSpeed * 0.9);
  });

  it('strafe follows the view, whichever way the momentum points', async () => {
    const { run: go, player: p } = await makeWorld({ spawn: { x: 0, y: 200, z: 0 } });
    p.vel.z = -11;
    // Looking along +X, the right-hand key points along +Z, against the travel direction's frame.
    go(8, blankInput({ strafe: 1, yaw: -Math.PI / 2 }));
    expect(p.vel.z).toBeGreaterThan(-11 + 3);
  });

  it('holding a strafe through hops cannot bank speed', async () => {
    // Perfect hops earn their own small bonus, so compare the same hop chain with and without a strafe.
    const peakWith = async (strafe) => {
      const sim = await makeWorld({ solids: [floor(800)] });
      const { player: p } = sim;
      sim.run(30);
      p.vel.z = -11;
      let peak = 0;
      sim.run(1, blankInput({ jump: true, jumpPressed: true, strafe }));
      for (let i = 0; i < 1400; i++) {
        sim.run(1, blankInput({ strafe, jump: true, jumpPressed: p.machine.grounded }));
        peak = Math.max(peak, speedH(p));
      }
      return peak;
    };
    expect(await peakWith(1)).toBeLessThan((await peakWith(0)) + 0.5);
  });

  it('strafing into a wall stops cleanly and does not rebound on release', async () => {
    const { run: go, player: p } = await makeWorld({ solids: [box(4, 200, 0, 1, 60, 200, { wallrun: false })], spawn: { x: 0, y: 200, z: 0 } });
    p.vel.z = -6;
    go(90, blankInput({ strafe: 1 }));
    expect(p.pos.x).toBeLessThan(3.5 - 0.39);
    go(4, blankInput());
    expect(p.vel.x).toBeLessThan(0.5);
    expect(p.vel.x).toBeGreaterThan(-0.5);
  });

  it('strafing back and forth in the air cannot build speed', async () => {
    const { run: go, player: p } = await makeWorld({ spawn: { x: 0, y: 500, z: 0 } });
    p.vel.z = -14;
    go(600, (i) => blankInput({ strafe: i % 60 < 30 ? 1 : -1 }));
    expect(speedH(p)).toBeLessThan(14 + 1.6);
  });

  it('holding forward steers without changing speed', async () => {
    const { run: go, player: p } = await makeWorld({ spawn: { x: 0, y: 500, z: 0 } });
    p.vel.z = -15;
    go(60, blankInput({ forward: 1, yaw: -0.8 }));
    expect(speedH(p)).toBeCloseTo(15, 0);
    expect(p.vel.x).toBeGreaterThan(1);
  });

  it('pulling back brakes at a limited rate rather than erasing momentum', async () => {
    const { run: go, player: p, cfg } = await makeWorld({ spawn: { x: 0, y: 200, z: 0 } });
    p.vel.z = -25;
    go(60, blankInput({ forward: -1 }));
    expect(speedH(p)).toBeGreaterThan(25 - cfg.airBrake * 1.1);
  });

  it('a standing jump can still be steered', async () => {
    const { run: go, player: p } = await makeWorld({ spawn: { x: 0, y: 200, z: 0 } });
    go(60, blankInput({ forward: 1 }));
    expect(speedH(p)).toBeGreaterThan(5);
  });

  it('soft cap drags extreme speed without a clamp', async () => {
    const { run: go, player: p, cfg } = await makeWorld({ spawn: { x: 0, y: 100, z: 0 }, cfg: { gravity: 0 } });
    p.vel.z = -70;
    go(1);
    expect(speed3(p)).toBeGreaterThan(65);
    go(600);
    expect(speed3(p)).toBeLessThan(55);
    expect(speed3(p)).toBeGreaterThanOrEqual(cfg.softSpeedCap - 0.01);
  });
});

describe('bunny hopping', () => {
  const hopTest = async (delayTicks) => {
    const sim = await makeWorld({ solids: [floor(800)], spawn: { x: 0, y: 0.02, z: 0 } });
    const { player: p } = sim;
    sim.run(30);
    p.vel.z = -18;
    const hops = 6;
    let done = 0;
    let waiting = -1;
    sim.run(1, blankInput({ jump: true, jumpPressed: true, forward: 1 }));
    for (let i = 0; i < 2000 && done < hops; i++) {
      let pressed = false;
      if (p.machine.grounded) {
        if (waiting < 0) waiting = delayTicks;
        if (waiting === 0) { pressed = true; waiting = -1; done++; } else waiting--;
      }
      sim.run(1, blankInput({ forward: 1, jump: true, jumpPressed: pressed }));
    }
    return speedH(p);
  };

  it('jumping inside the hop window preserves speed across six hops', async () => {
    expect(await hopTest(1)).toBeGreaterThan(17.8);
  });

  it('late jumps lose speed to friction', async () => {
    const tight = await hopTest(1);
    const late = await hopTest(50);
    expect(late).toBeLessThan(tight - 0.8);
  });

  it('perfect hop bonus cannot exceed the hop cap', async () => {
    const sim = await makeWorld({ solids: [floor(800)] });
    const { player: p, cfg } = sim;
    sim.run(30);
    p.vel.z = -(cfg.hopBonusCap - 0.2);
    const events = [];
    sim.run(1, blankInput({ jump: true, jumpPressed: true }));
    for (let i = 0; i < 3000 && events.length < 15; i++) {
      const pressed = p.machine.grounded;
      sim.run(1, blankInput({ jump: true, jumpPressed: pressed }));
      if (pressed) events.push(speedH(p));
    }
    expect(Math.max(...events)).toBeLessThanOrEqual(cfg.hopBonusCap + 0.01);
  });

  it('reports hop quality as a training signal', async () => {
    const sim = await makeWorld({ solids: [floor(800)] });
    const { player: p } = sim;
    sim.run(30);
    p.vel.z = -14;
    sim.run(1, blankInput({ jump: true, jumpPressed: true }));
    p.drainEvents();
    for (let i = 0; i < 200 && !p.machine.grounded; i++) sim.run(1);
    sim.run(1, blankInput({ jump: true, jumpPressed: true }));
    const jump = p.drainEvents().find((e) => e.type === 'jump');
    expect(jump?.hop).toBe('perfect');
  });
});

describe('sliding', () => {
  it('enters at speed, lowers the capsule, adds a one-off boost', async () => {
    const { run: go, player: p, cfg } = await makeWorld({ solids: [floor()] });
    go(30); go(120, run());
    const before = speedH(p);
    go(1, run({ slide: true, forward: 1 }));
    expect(p.machine.state).toBe(L.SLIDING);
    expect(p.height).toBe(cfg.crouchHeight);
    expect(speedH(p)).toBeGreaterThan(before + 1);
  });

  it('does not slide from a standstill', async () => {
    const { run: go, player: p } = await makeWorld({ solids: [floor()] });
    go(30);
    go(10, blankInput({ slide: true }));
    expect(p.machine.state).not.toBe(L.SLIDING);
    expect(p.crouched).toBe(true);
  });

  it('flat slides die out and chaining them has no infinite boost', async () => {
    const { run: go, player: p, cfg } = await makeWorld({ solids: [floor(800)] });
    go(30); go(120, run());
    let peak = 0;
    // Spam slide on and off. The cooldown must stop this from exceeding the boost ceiling.
    for (let i = 0; i < 1200; i++) {
      go(1, run({ slide: i % 40 < 30 }));
      peak = Math.max(peak, speedH(p));
    }
    expect(peak).toBeLessThanOrEqual(cfg.slideBoostMaxSpeed + 0.01);
  });

  it('holding slide on the flat eventually ends in a crouch and does not restart', async () => {
    const { run: go, player: p } = await makeWorld({ solids: [floor(800)] });
    go(30); go(120, run());
    go(1, run({ slide: true }));
    go(600, blankInput({ forward: 1, slide: true }));
    expect(p.machine.state).not.toBe(L.SLIDING);
    expect(p.crouched).toBe(true);
  });

  it('slides accelerate downhill and die uphill', async () => {
    const rot = (deg) => { const a = (deg * Math.PI) / 360; return { x: Math.sin(a), y: 0, z: 0, w: Math.cos(a) }; };
    // Rotating -20 degrees about X raises +Z, so yaw 0 (facing -Z) runs downhill.
    const down = await makeWorld({ solids: [{ ...box(0, 0, 0, 40, 1, 2000), quat: rot(-20) }], spawn: { x: 0, y: 0.56, z: 0 } });
    down.player.vel.z = -8;
    down.run(40, blankInput({ forward: 1 }));
    expect(down.player.machine.grounded).toBe(true);
    down.run(1, blankInput({ slide: true, forward: 1 }));
    const s0 = speed3(down.player);
    down.run(120, blankInput({ slide: true, forward: 1 }));
    expect(down.player.machine.state).toBe(L.SLIDING);
    expect(speed3(down.player)).toBeGreaterThan(s0 + 3);

    const up = await makeWorld({ solids: [{ ...box(0, 0, 0, 40, 1, 2000), quat: rot(-20) }], spawn: { x: 0, y: 0.56, z: 0 } });
    up.player.vel.z = 12;
    up.run(10, blankInput({ forward: 1, yaw: Math.PI }));
    up.run(1, blankInput({ slide: true, forward: 1, yaw: Math.PI }));
    up.run(200, blankInput({ slide: true, forward: 1, yaw: Math.PI }));
    expect(up.player.machine.state).not.toBe(L.SLIDING);
  });

  it('stays crouched under a low ceiling until there is room to stand', async () => {
    const { run: go, player: p, cfg } = await makeWorld({
      solids: [floor(), box(0, 1.3 + 2.5, -8, 20, 5, 6)],
      spawn: { x: 0, y: 0.02, z: 0 },
    });
    go(30);
    for (let i = 0; i < 300 && p.pos.z > -4; i++) go(1, run());
    go(1, run({ slide: true }));
    for (let i = 0; i < 300 && p.pos.z > -7.5; i++) go(1, run({ slide: true }));
    expect(p.pos.z).toBeLessThanOrEqual(-7.5);
    go(2, run({ slide: false }));
    expect(p.crouched).toBe(true);
    expect(p.height).toBe(cfg.crouchHeight);
    for (let i = 0; i < 300 && p.pos.z > -12; i++) go(1, blankInput({ forward: 1 }));
    expect(p.crouched).toBe(false);
  });

  it('sliding into an obstacle stops safely without penetration', async () => {
    const { run: go, player: p } = await makeWorld({ solids: [floor(), box(0, 2, -10, 20, 4, 1)] });
    go(30); go(90, run());
    go(240, run({ slide: true }));
    expect(p.pos.z).toBeGreaterThan(-9.5 - 0.41);
    expect(p.pos.y).toBeGreaterThanOrEqual(-0.02);
  });

  it('slide jump keeps its speed', async () => {
    const { run: go, player: p } = await makeWorld({ solids: [floor()] });
    go(30); go(120, run());
    go(10, run({ slide: true }));
    const before = speedH(p);
    go(2, (i) => run({ slide: true, jump: true, jumpPressed: i === 0 }));
    expect(p.vel.y).toBeGreaterThan(7);
    expect(speedH(p)).toBeGreaterThan(before - 0.2);
  });
});

describe('collision', () => {
  it('does not tunnel a thin wall at very high speed', async () => {
    const { run: go, player: p } = await makeWorld({ solids: [floor(800), box(0, 5, -60, 100, 10, 0.05)] });
    go(30);
    p.vel.z = -300;
    go(30, blankInput({ forward: 1 }));
    expect(p.pos.z).toBeGreaterThan(-60);
  });

  it('does not fall through a floor at terminal velocity', async () => {
    const { run: go, player: p } = await makeWorld({ solids: [box(0, -0.05, 0, 40, 0.1, 40)], spawn: { x: 0, y: 500, z: 0 } });
    p.vel.y = -75;
    go(2400);
    expect(p.pos.y).toBeGreaterThan(-0.02);
    expect(p.machine.grounded).toBe(true);
  });

  it('slides along a wall keeping the tangential velocity', async () => {
    const { run: go, player: p } = await makeWorld({ solids: [floor(), box(-3, 2, 0, 1, 4, 400)] });
    go(30);
    p.vel.x = -8; p.vel.z = -8;
    go(2, blankInput());
    p.vel.x = -8; p.vel.z = -8;
    go(1, blankInput());
    expect(Math.abs(p.vel.z)).toBeGreaterThan(5);
  });

  it('wedged in a corner, the capsule stays out of both walls', async () => {
    const { run: go, player: p } = await makeWorld({ solids: [floor(), box(-3, 2, 0, 1, 4, 20), box(0, 2, -3, 20, 4, 1)] });
    go(30);
    go(240, blankInput({ forward: 1, strafe: -1 }));
    expect(p.pos.x).toBeGreaterThan(-2.5 + 0.39);
    expect(p.pos.z).toBeGreaterThan(-2.5 + 0.39);
  });

  it('steps up low obstacles while running', async () => {
    const { run: go, player: p } = await makeWorld({ solids: [floor(), box(0, 0.2, -25, 20, 0.4, 40)] });
    go(30);
    go(120, run());
    expect(p.pos.y).toBeGreaterThan(0.3);
    expect(speedH(p)).toBeGreaterThan(4);
  });

  it('runs up and off a ramp, keeping speed through the launch', async () => {
    const a = (-20 * Math.PI) / 360;
    const ramp = { ...box(0, 2, -14, 8, 1, 14), quat: { x: Math.sin(-a), y: 0, z: 0, w: Math.cos(a) } };
    const { run: go, player: p } = await makeWorld({ solids: [floor(), ramp] });
    go(30);
    let maxY = 0;
    for (let i = 0; i < 300; i++) { go(1, run()); maxY = Math.max(maxY, p.pos.y); }
    expect(maxY).toBeGreaterThan(2);
    expect(p.pos.z).toBeLessThan(-25);
  });

  it('a body at rest stays perfectly still on the ground', async () => {
    const { run: go, player: p } = await makeWorld({ solids: [floor()] });
    go(60);
    const y = p.pos.y;
    go(600);
    expect(p.pos.y).toBeCloseTo(y, 6);
    expect(p.machine.state).toBe(L.GROUNDED);
  });

  it('recovers from being spawned inside geometry', async () => {
    const { run: go, player: p, queries } = await makeWorld({ solids: [floor(), box(0, 1, 0, 2, 2, 2)], spawn: { x: 0.2, y: 1, z: 0.2 } });
    go(30);
    const c = p.center();
    expect(queries.overlaps(c.x, c.y, c.z, p.shape())).toBe(false);
  });
});

describe('moving platforms', () => {
  const moverWorld = async () => {
    const sim = await makeWorld({ spawn: { x: 0, y: 0.6, z: 0 } });
    const path = (t, out) => { out.x = Math.sin(t) * 8; out.y = 0; out.z = 0; return out; };
    const surface = { wallrun: false };
    sim.physics.addMover({ shape: 'box', pos: { x: 0, y: 0, z: 0 }, size: { x: 12, y: 1, z: 12 }, surface }, path);
    sim.physics.flush();
    sim.step = (n, input = blankInput()) => {
      for (let i = 0; i < n; i++) {
        sim.tick = (sim.tick ?? 0) + 1;
        sim.physics.update(sim.tick, DT);
        sim.player.tick(input, DT);
      }
    };
    return sim;
  };

  it('carries a standing player with it', async () => {
    const sim = await moverWorld();
    sim.step(60);
    expect(sim.player.machine.grounded).toBe(true);
    sim.step(180);
    expect(sim.player.machine.grounded).toBe(true);
    const moverX = sim.physics.movers[0].pos.x;
    expect(Math.abs(sim.player.pos.x - moverX)).toBeLessThan(0.5);
    expect(Math.abs(moverX)).toBeGreaterThan(1);
  });

  it('adds its velocity when the player jumps off', async () => {
    const sim = await moverWorld();
    sim.step(30);
    const mv = sim.physics.movers[0].vel.x;
    sim.step(1, blankInput({ jump: true, jumpPressed: true }));
    expect(sim.player.vel.y).toBeGreaterThan(7);
    expect(sim.player.vel.x).toBeCloseTo(mv, 0);
  });
});

describe('state machine discipline', () => {
  it('a full mixed run produces no illegal transitions', async () => {
    const { run: go, player: p } = await makeWorld({
      solids: [floor(800), box(-6, 8, -60, 1, 16, 200)],
      anchors: [{ x: 0, y: 25, z: -80 }],
    });
    go(30);
    go(800, (i) => blankInput({
      forward: 1, sprint: true, yaw: Math.sin(i / 40) * 0.6,
      pitch: i % 300 > 150 ? 0.9 : 0,
      jump: i % 50 < 10, jumpPressed: i % 50 === 0,
      slide: i % 130 < 40,
      dashPressed: i % 170 === 0,
      grapple: i % 300 > 150, grapplePressed: i % 300 === 151,
      strafe: Math.sin(i / 70) > 0.7 ? -1 : 0,
    }));
    expect(p.machine.violations).toEqual([]);
    expect(Number.isFinite(p.pos.x + p.pos.y + p.pos.z)).toBe(true);
  });

  it('same inputs reproduce the same trajectory exactly', async () => {
    const script = (i) => blankInput({
      forward: 1, sprint: true, yaw: Math.sin(i / 50), jump: i % 70 < 5, jumpPressed: i % 70 === 0, slide: i % 200 < 30,
    });
    const a = await makeWorld({ solids: [floor(800), box(-8, 8, -60, 1, 16, 200)] });
    const b = await makeWorld({ solids: [floor(800), box(-8, 8, -60, 1, 16, 200)] });
    a.run(1500, script);
    b.run(1500, script);
    expect(a.player.pos).toEqual(b.player.pos);
    expect(a.player.vel).toEqual(b.player.vel);
  });

  it('energy is never created by landing or sliding on flat ground', async () => {
    const { run: go, player: p, cfg } = await makeWorld({ solids: [floor()], spawn: { x: 0, y: 8, z: 0 } });
    p.vel.z = -14;
    let e = energy(p, cfg.gravity);
    for (let i = 0; i < 200; i++) {
      go(1);
      const now = energy(p, cfg.gravity);
      expect(now).toBeLessThanOrEqual(e + 0.01); // Rapier queries are single precision
      e = now;
    }
  });
});
