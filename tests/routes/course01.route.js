export function* course01(bot) {
  // Run and jump the first three gaps.
  yield* bot.run([0, 0, -33], { radius: 0.8 });
  yield* bot.jump([0, 0, -48]);
  yield* bot.airTo([0, 0, -48]);
  yield* bot.run([0, 0, -53.2], { radius: 0.6 });
  yield* bot.jump([0, 1, -67]);
  yield* bot.airTo([0, 1, -67]);
  yield* bot.run([0, 1, -73], { radius: 0.6 });
  yield* bot.jump([0, 0, -90]);
  yield* bot.airTo([0, 0, -90]);

  // Slide through the slot.
  yield* bot.run([0, 0, -102], { radius: 1 });
  yield* bot.run([0, 0, -114], { radius: 1, slide: true });
  // Ramp slide and jump.
  yield* bot.run([0, 0, -125], { radius: 1 });
  yield* bot.run([0, -14, -171], { until: (p) => p.pos.z < -170.6, slide: true });
  yield* bot.jump([0, -14, -196], { hold: 30 });
  yield* bot.airTo([0, -14, -196]);

  // First swing.
  yield* bot.run([0, -14, -229], { radius: 1 });
  yield* bot.jump([0, -14, -240], { hold: 4 });
  yield* bot.attach([0, 14, -256]);
  yield* bot.waitUntil((p) => p.pos.z < -262 && p.pos.y > -13.4, () => bot.base({}), 1200, 'swing1 release');
  yield* bot.release();
  yield* bot.airTo([0, -14, -296]);

  // Two swings.
  yield* bot.run([0, -14, -316], { radius: 1 });
  yield* bot.jump([0, -14, -325], { hold: 4 });
  yield* bot.attach([0, 10, -346]);
  yield* bot.waitUntil((p) => p.pos.z < -352 && p.vel.y > 0, () => bot.base({}), 1200, 'swing2 rising');
  yield* bot.waitUntil((p) => p.pos.z < -362, () => bot.base({}), 600, 'swing2 release');
  yield* bot.release();
  yield* bot.wait(16);
  yield* bot.attach([0, 10, -394]);
  yield* bot.waitUntil((p) => p.pos.z < -404 && p.vel.y > 2, () => bot.base({}), 1200, 'swing3 rising');
  yield* bot.waitUntil((p) => p.pos.z < -414, () => bot.base({}), 600, 'swing3 release');
  yield* bot.release();
  yield* bot.airTo([0, -24, -450]);
  yield* bot.run([0, -24, -462], { radius: 1 });
}
