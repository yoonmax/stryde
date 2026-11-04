export function* course04(bot) {
  const { p } = bot;
  yield* bot.run([0, 60, -7], { radius: 1 });
  yield* bot.run([0, 37, -85], { radius: 1.5, slide: true });
  // Launch, head for the curved wall.
  bot.faceTowards([4, 30, -112]);
  yield bot.base({ forward: 1, sprint: true, jump: true, jumpPressed: true });
  for (let i = 0; i < 120 && !p.wall.active; i++) {
    bot.faceTowards([6, 30, -112]);
    yield bot.base({ forward: 1, sprint: true, jump: true });
  }
  yield* bot.waitUntil((pl) => pl.machine.grounded, () => {
    bot.yaw = Math.atan2(-p.vel.x, -p.vel.z);
    return bot.base({ forward: 1, sprint: true });
  }, 500, 'curve');

  // Swing, swing.
  yield* bot.run([24, 18, -170.5], { radius: 1.5 });
  yield bot.base({ forward: 1, sprint: true, jump: true, jumpPressed: true });
  yield* bot.wait(4, { forward: 1, sprint: true, jump: true });
  yield* bot.attach([36, 46, -212]);
  yield* bot.waitUntil((pl) => pl.pos.z < -234, () => bot.base({ forward: 1 }), 900, 'swing a');
  yield* bot.release();
  yield* bot.wait(16);
  yield* bot.attach([50, 40, -264]);
  yield* bot.waitUntil((pl) => pl.pos.z < -296, () => { bot.faceTowards([53, 8, -316]); bot.pitch = 0; return bot.base({ forward: 1 }); }, 900, 'swing b');
  yield* bot.release();
  yield* bot.airTo([53, 8, -316]);

  // Hop plates: jump the instant each one lands, never touching friction.
  yield* bot.run([53, 8, -321.3], { radius: 0.8 });
  bot.faceTowards([53, 2, -384]);
  yield bot.base({ forward: 1, sprint: true, jump: true, jumpPressed: true });
  for (let i = 0; i < 700 && p.pos.z > -386; i++) {
    bot.faceTowards([53, 2, -392]);
    yield bot.base({ forward: 1, sprint: true, jump: true, jumpPressed: p.machine.grounded });
  }
  yield* bot.airTo([53, 0, -392]);

  // Slot, then dash the gap.
  yield* bot.run([53, 0, -432], { radius: 1 });
  yield* bot.run([53, 0, -446], { radius: 1, slide: true });
  yield* bot.run([53, 0, -469], { radius: 1 });
  bot.faceTowards([53, -1, -500]);
  bot.pitch = 0.1;
  yield bot.base({ forward: 1, sprint: true, jump: true, jumpPressed: true });
  yield* bot.wait(24, { forward: 1, sprint: true, jump: true });
  yield bot.base({ forward: 1, sprint: true, dashPressed: true });
  bot.pitch = 0;
  yield* bot.airTo([53, -1, -500]);

  // Ribbon: slide around, then finish.
  yield* bot.run([53, -1, -519], { radius: 1.5 });
  const ribbon = [[56, -3, -535], [65, -7, -550], [95, -14, -562], [122, -18, -568], [144, -22, -582], [160, -25, -610], [166, -26, -655]];
  for (const w of ribbon) yield* bot.run(w, { radius: 5, slide: false });
}
