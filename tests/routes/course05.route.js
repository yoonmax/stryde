function* chainWalls(bot) {
  const { p } = bot;
  yield* bot.run([2, 0, -12.8], { radius: 0.7 });
  bot.faceTowards([4.6, 0, -22]);
  yield bot.base({ forward: 1, sprint: true, jump: true, jumpPressed: true });
  yield* bot.waitUntil((pl) => pl.wall.active, () => bot.base({ forward: 1, sprint: true, jump: true }), 120, 'right wall');
  yield* bot.waitUntil((pl) => pl.pos.z < -28, () => { bot.yaw = 0; return bot.base({ forward: 1, sprint: true }); }, 300, 'right run');
  bot.yaw = 0.5;
  yield bot.base({ forward: 1, sprint: true, jump: true, jumpPressed: true });
  yield* bot.waitUntil((pl) => pl.wall.active && pl.wall.normal.x > 0, () => bot.base({ forward: 1, sprint: true, jump: true }), 160, 'left wall');
  yield* bot.waitUntil((pl) => pl.pos.z < -52, () => { bot.yaw = 0; return bot.base({ forward: 1, sprint: true }); }, 300, 'left run');
  bot.yaw = -0.5;
  yield bot.base({ forward: 1, sprint: true, jump: true, jumpPressed: true });
  yield* bot.airTo([0, -5, -70]);
  void p;
}

function* reelCrossing(bot) {
  yield* bot.run([0, -5, -90.8], { radius: 0.7 });
  yield* bot.jump([0, -5, -100], { hold: 3 });
  yield* bot.attach([0, 30, -118]);
  yield* bot.waitUntil((pl) => pl.pos.z < -136, () => bot.base({ forward: 1 }), 900, 'big swing');
  yield* bot.release();
  yield* bot.airTo([0, -14, -170]);
}

/** The alternative to the rope: two wall runs along the right side. */
function* wallCrossing(bot) {
  yield* bot.run([9, -5, -90.8], { radius: 0.7 });
  bot.faceTowards([13.4, -5, -100]);
  yield bot.base({ forward: 1, sprint: true, jump: true, jumpPressed: true });
  yield* bot.waitUntil((pl) => pl.wall.active, () => bot.base({ forward: 1, sprint: true, jump: true }), 120, 'first right wall');
  yield* bot.waitUntil((pl) => pl.machine.grounded, () => { bot.yaw = 0; return bot.base({ forward: 1, sprint: true }); }, 400, 'perch');
  yield* bot.run([13.3, -11, -120.5], { radius: 1.3 });
  bot.faceTowards([13.75, -11, -130]);
  yield bot.base({ forward: 1, sprint: true, jump: true, jumpPressed: true });
  yield* bot.waitUntil((pl) => pl.wall.active || pl.machine.grounded, () => bot.base({ forward: 1, sprint: true, jump: true }), 120, 'second right wall');
  yield* bot.waitUntil((pl) => pl.machine.grounded, () => { bot.yaw = 0; return bot.base({ forward: 1, sprint: true }); }, 400, 'far side');
}

function* spire(bot) {
  const { p } = bot;
  yield* bot.run([0, -14, -172], { radius: 2 });
  yield* bot.run([0, -14, -185], { radius: 1.2 });
  yield* bot.run([0, -38, -256], { radius: 2, slide: true });
  bot.faceTowards([-16, -38, -290]);
  yield bot.base({ forward: 1, sprint: true, jump: true, jumpPressed: true });
  for (let i = 0; i < 120 && !p.wall.active; i++) { bot.faceTowards([-16, -38, -290]); yield bot.base({ forward: 1, sprint: true, jump: true }); }
  yield* bot.waitUntil((pl) => pl.machine.grounded, () => {
    bot.yaw = Math.atan2(-p.vel.x, -p.vel.z);
    return bot.base({ forward: 1, sprint: true });
  }, 600, 'spire run');
}

function* flue(bot) {
  const { p } = bot;
  yield* bot.run([-46, -48, -340], { radius: 1.2 });
  yield* bot.run([-46, -48, -347], { radius: 0.5, sprint: false });
  bot.yaw = -Math.PI / 2;
  bot.pitch = 0;
  let toward = 1;
  yield bot.base({ jump: true, jumpPressed: true });
  for (let kicks = 0; kicks < 60; kicks++) {
    if (p.pos.y > -22.5) break;
    for (let t = 0; t < 140; t++) {
      const near = toward > 0 ? p.pos.x > -45.32 : p.pos.x < -46.68;
      yield bot.base({ forward: toward, jump: true });
      if (near) break;
    }
    yield bot.base({ forward: toward, jump: true, jumpPressed: true });
    toward = -toward;
    yield bot.base({ forward: toward, jump: true });
    yield bot.base({ forward: toward, jump: true });
  }
  bot.yaw = 0;
  yield* bot.waitUntil((pl) => pl.machine.grounded && pl.pos.y > -26, () => bot.base({ forward: 1, sprint: true }), 300, 'top of flue');
}

/** The alternative to the Flue: a reeled rope from the far left of the terrace. */
function* highRope(bot) {
  yield* bot.run([-66, -48, -326], { radius: 1 });
  yield bot.base({ forward: 1, sprint: true, jump: true, jumpPressed: true });
  yield* bot.attach([-70, 6, -346]);
  yield* bot.waitUntil((pl) => pl.pos.y > -22, () => bot.base({ reelIn: true, forward: 1 }), 900, 'high rope');
  yield* bot.release({ forward: 1 });
  yield* bot.waitUntil((pl) => pl.machine.grounded, () => { bot.faceTowards([-62, -24, -372]); bot.pitch = 0; return bot.base({ forward: 1, sprint: true }); }, 600, 'high rope landing');
}

function* lifts(bot) {
  const stage = function* (edge, anchor, floor, past) {
    yield* bot.run([-46, floor, edge], { radius: 0.8 });
    yield* bot.jump([-46, floor, edge - 10], { hold: 3 });
    yield* bot.attach(anchor);
    yield* bot.waitUntil((pl) => pl.pos.y > past.y, () => bot.base({ forward: 1, reelIn: true }), 900, `lift to ${anchor}`);
    yield* bot.release({ forward: 1 });
    yield* bot.airTo([-46, past.y, past.z]);
  };
  yield* stage(-397, [-46, 18, -428], -24, { y: -7, z: -445 });
  yield* stage(-459, [-46, 36, -490], -8, { y: 11, z: -508 });
  yield* stage(-521, [-46, 54, -552], 10, { y: 29, z: -575 });
  yield* bot.run([-46, 28, -590], { radius: 1 });
}

export function* course05(bot) {
  yield* chainWalls(bot);
  yield* reelCrossing(bot);
  yield* spire(bot);
  yield* flue(bot);
  yield* lifts(bot);
}

/** Same course through the alternative routes, to prove the choices are real. */
export function* course05Alternate(bot) {
  yield* chainWalls(bot);
  yield* wallCrossing(bot);
  yield* spire(bot);
  yield* highRope(bot);
  yield* lifts(bot);
}
