/**
 * Replaces keyboard and mouse with a recorded per-tick input list, at the one point the game reads
 * input. Everything downstream is the shipping game: loop, simulation, timer, HUD, saving, results.
 * `delayTicks` holds still after GO, which puts a saved ghost visibly ahead of the player.
 */
export const installFeed = (page, inputs, delayTicks = 0) => page.evaluate(({ inputs, delayTicks }) => {
  const g = window.__stryde;
  const blank = {
    forward: 0, strafe: 0, yaw: 0, pitch: 0, jump: false, jumpPressed: false, slide: false, sprint: false,
    grapple: false, grapplePressed: false, reelIn: false, reelOut: false, dashPressed: false,
  };
  const real = g.input.__realSample ?? g.input.sampleTick.bind(g.input);
  g.input.__realSample = real;
  let n = -delayTicks;
  let spawnYaw = null;
  g.input.sampleTick = () => {
    if (g.sim.phase !== 'running') return real();
    spawnYaw ??= g.input.yaw;
    if (n < 0) { n++; return { ...blank, yaw: spawnYaw }; }
    const i = { ...blank, ...(inputs[n] ?? inputs[inputs.length - 1]) };
    n++;
    g.input.yaw = i.yaw;
    g.input.pitch = i.pitch;
    return i;
  };
}, { inputs, delayTicks });
