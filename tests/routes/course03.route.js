/** Swing to `anchor` and let go on the rising side, past `release`. */
function* swing(bot, anchor, { until, steer, reel }) {
  yield* bot.attach(anchor);
  yield* bot.waitUntil(until, (p) => {
    if (steer) { bot.faceTowards(steer); bot.pitch = 0; }
    // Holding forward pumps the arc: this is how a swing earns back what each catch costs.
    const over = { forward: 1 };
    if (reel && reel(p)) over.reelIn = true;
    return bot.base(over);
  }, 1500, `swing to ${anchor}`);
  yield* bot.release();
}

export function* course03(bot) {
  yield* bot.run([0, 0, -16.8], { radius: 0.7 });
  yield* bot.jump([0, 0, -30], { hold: 6 });
  yield* swing(bot, [0, 22, -56], { until: (p) => p.pos.z < -78 });
  yield* bot.wait(14);
  yield* swing(bot, [0, 22, -118], { until: (p) => p.pos.z < -140 });
  yield* bot.wait(14);
  yield* swing(bot, [0, 22, -180], { until: (p) => p.pos.z < -204 });
  yield* bot.airTo([0, -22, -238]);

  // Carry the landing speed straight into the next swing rather than stopping on the platform.
  yield* swing(bot, [0, 22, -280], { until: (p) => p.pos.z < -300 && p.vel.y > 0, reel: (p) => p.pos.z < -272 && p.pos.z > -292 });
  yield* bot.airTo([0, -10, -330]);

  yield* bot.run([3, -10, -344.5], { radius: 0.8 });
  yield* bot.jump([10, -10, -360], { hold: 4 });
  yield* swing(bot, [28, 24, -384], { until: (p) => p.pos.x > 48 && p.vel.x > 0, steer: [60, 0, -400] });
  yield* bot.wait(14);
  yield* swing(bot, [76, 24, -404], { until: (p) => p.pos.x > 100 && p.vel.y > 0, steer: [126, 0, -410] });
  yield* bot.airTo([124, -18, -410]);

  // Moving anchor: wait until it is coming toward the platform, then go.
  yield* bot.run([138.5, -18, -410], { radius: 0.8 });
  const mover = bot.sim.physics.movers[0];
  yield* bot.waitUntil(() => mover.vel.x < -2 && mover.pos.x < 182, () => bot.base({}), 1400, 'carriage returning');
  yield* bot.jump([170, -18, -410], { hold: 3 });
  bot.aimAt([mover.pos.x, mover.pos.y - 1, mover.pos.z]);
  yield* bot.attach([mover.pos.x, mover.pos.y - 1, mover.pos.z]);
  yield* bot.waitUntil((p) => p.pos.x > 216, () => { bot.faceTowards([250, 0, -410]); bot.pitch = 0; return bot.base({ forward: 1 }); }, 1500, 'carriage swing');
  yield* bot.release();
  yield* bot.airTo([246, -27, -410]);
  yield* bot.run([252, -27, -410], { radius: 1 });
}
