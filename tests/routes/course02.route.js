export function* course02(bot) {
  const { p } = bot;
  // First wall: jump beside it, run it, leap off the far end if needed.
  yield* bot.run([-3.8, 0, -14.8], { radius: 0.8 });
  bot.yaw = 0;
  yield bot.base({ forward: 1, sprint: true, jump: true, jumpPressed: true });
  yield* bot.waitUntil((pl) => pl.wall.active, () => { bot.faceTowards([-6.5, 0, -26]); return bot.base({ forward: 1, sprint: true, jump: true }); }, 120, 'first wall');
  yield* bot.waitUntil((pl) => pl.pos.z < -36 || pl.machine.grounded, () => { bot.yaw = 0; return bot.base({ forward: 1, sprint: true }); }, 400, 'wall end');
  bot.yaw = -0.2;
  yield bot.base({ forward: 1, sprint: true, jump: true, jumpPressed: true });
  yield* bot.airTo([0, -2, -58]);

  // Chain: right wall, across, left wall.
  yield* bot.run([2, -2, -70.8], { radius: 0.7 });
  bot.faceTowards([4.6, 0, -80]);
  yield bot.base({ forward: 1, sprint: true, jump: true, jumpPressed: true });
  yield* bot.waitUntil((pl) => pl.wall.active, () => bot.base({ forward: 1, sprint: true, jump: true }), 120, 'right wall');
  yield* bot.waitUntil((pl) => pl.pos.z < -86, () => { bot.yaw = 0; return bot.base({ forward: 1, sprint: true }); }, 300, 'right wall run');
  bot.yaw = 0.5;
  yield bot.base({ forward: 1, sprint: true, jump: true, jumpPressed: true });
  yield* bot.waitUntil((pl) => pl.wall.active && pl.wall.normal.x > 0, () => bot.base({ forward: 1, sprint: true, jump: true }), 160, 'left wall');
  yield* bot.waitUntil((pl) => pl.pos.z < -110, () => { bot.yaw = 0; return bot.base({ forward: 1, sprint: true }); }, 300, 'left wall run');
  bot.yaw = -0.5;
  yield bot.base({ forward: 1, sprint: true, jump: true, jumpPressed: true });
  yield* bot.airTo([0, -5, -128]);

  // Into the Flue: jump in, then kick between the walls until over the rim.
  yield* bot.run([0, -1, -144], { radius: 0.6 });
  yield* bot.run([0, -1, -146.6], { radius: 0.4, sprint: false });
  yield* bot.run([0, -1, -149], { radius: 0.5, sprint: false });
  bot.yaw = -Math.PI / 2;
  bot.pitch = 0;
  let toward = 1;
  yield bot.base({ jump: true, jumpPressed: true, strafe: 0 });
  // Strafe across, press jump as soon as the far wall is in reach.
  for (let kicks = 0; kicks < 40; kicks++) {
    if (p.pos.y > 18) break;
    for (let t = 0; t < 140; t++) {
      const nearFar = toward > 0 ? p.pos.x > 0.68 : p.pos.x < -0.68;
      yield bot.base({ forward: toward, jump: true });
      if (nearFar) break;
    }
    yield bot.base({ forward: toward, jump: true, jumpPressed: true });
    toward = -toward;
    yield bot.base({ forward: toward, jump: true });
    yield bot.base({ forward: toward, jump: true });
  }
  // Over the back lip onto the shelf.
  bot.yaw = 0;
  yield* bot.waitUntil((pl) => pl.machine.grounded && pl.pos.y > 15, () => bot.base({ forward: 1, sprint: true }), 300, 'shelf landing');

  // Drum: cross the shelf on a diagonal, jump, and run clockwise around the north face.
  yield* bot.run([-12, 17, -193], { radius: 1.2, sprint: false });
  yield* bot.run([-6.5, 17, -200], { radius: 0.7 });
  bot.faceTowards([2, 17, -206.2]);
  yield bot.base({ forward: 1, sprint: true, jump: true, jumpPressed: true });
  for (let i = 0; i < 90 && !p.wall.active; i++) { bot.faceTowards([2, 17, -206.2]); yield bot.base({ forward: 1, sprint: true, jump: true }); }
  yield* bot.waitUntil((pl) => pl.machine.grounded, () => {
    bot.yaw = Math.atan2(-p.vel.x, -p.vel.z);
    return bot.base({ forward: 1, sprint: true });
  }, 500, 'second ledge');

  // Final leap.
  yield* bot.run([55, 8, -229], { radius: 1 });
  yield* bot.run([84, 0, -229], { radius: 1.5, slide: true });
  bot.faceTowards([98, 0, -221.8]);
  yield bot.base({ forward: 1, sprint: true, jump: true, jumpPressed: true });
  for (let i = 0; i < 80 && !p.wall.active; i++) { bot.faceTowards([98, 0, -221.8]); yield bot.base({ forward: 1, sprint: true, jump: true }); }
  yield* bot.waitUntil((pl) => pl.pos.x > 120 || pl.machine.grounded, () => { bot.yaw = -Math.PI / 2; return bot.base({ forward: 1, sprint: true }); }, 400, 'last wall');
  bot.yaw = -Math.PI / 2 - 0.3;
  yield bot.base({ forward: 1, sprint: true, jump: true, jumpPressed: true });
  yield* bot.airTo([150, -5, -229]);
  yield* bot.run([152, -5, -229], { radius: 1 });
}
