import { LevelBuilder, sinePath } from './LevelBuilder.js';
import { guideLine, monolith, pier, truss } from './Architecture.js';

/**
 * COURSE 03: PENDULUM
 * Noon in a void. Almost no floor: a chain of swings under a colossal ring that hangs in the sky.
 * The skill is release timing, and the last section adds a moving anchor.
 * Landmark: the Orrery, three huge rings, slowly turning, above all of it.
 */
export function buildCourse03() {
  const b = new LevelBuilder({
    id: 'pendulum',
    number: 3,
    name: 'PENDULUM',
    difficulty: 3,
    tagline: 'Let go at the right moment. Everything else follows.',
    mechanics: ['Grapple', 'Swing momentum', 'Release timing', 'Reeling'],
    referenceTime: 29.52,
    killY: -90,
    environment: 'zenith',
    preview: { pos: [120, 40, -90], look: [0, 40, -300] },
    skylineCenter: [0, -300],
    skyline: { count: 34, seed: 33, inner: 760, outer: 2400 },
  });

  b.start([0, 0, 6], 0);
  b.slab(-9, 9, 16, -18, 0, { thick: 4 });
  b.hint([0, 0, 0], 7, 'Big swings need a long rope. Grapple early and fall into it.');

  // Three in a row: release near the top of each swing and fire at the next.
  b.anchor([0, 22, -56], { mountLength: 90 });
  b.anchor([0, 22, -118], { mountLength: 90 });
  b.anchor([0, 22, -180], { mountLength: 90 });
  b.slab(-8, 8, -226, -252, -22, { thick: 4 });
  b.checkpoint([0, -22, -236], { width: 16, height: 9, respawn: [0, -22, -230] });

  // A swing that must be reeled: the far platform is higher than the arc reaches.
  b.hint([0, -22, -244], 8, 'The next platform is higher. Hold [LMB] to reel in and gain height.');
  b.anchor([0, 22, -280], { mountLength: 92 });
  b.slab(-8, 8, -318, -346, -10, { thick: 4 });
  b.checkpoint([0, -10, -328], { width: 16, height: 9, respawn: [0, -10, -322] });

  // Sideways: the route turns, so a swing has to be steered, not just ridden.
  b.hint([0, -10, -338], 8, 'Hold a direction while swinging to steer and pump the arc.');
  b.anchor([28, 24, -384], { mountLength: 90 });
  b.anchor([76, 24, -404], { mountLength: 90 });
  b.slab(112, 140, -396, -424, -18, { thick: 4 });
  b.checkpoint([122, -18, -410], { yaw: 90, width: 26, height: 9, respawn: [116, -18, -410], respawnYaw: -90 });

  // The moving anchor: a carriage running along an overhead rail.
  b.hint([130, -18, -410], 8, 'That anchor moves. Catch it when it comes toward you.');
  b.mover([186, 26, -410], [6, 2, 6], sinePath([186, 26, -410], [1, 0, 0], 16, 7), { anchor: true, mat: 'metal' });
  b.slab(232, 262, -396, -424, -27, { thick: 4 });
  b.finish([250, -27, -410], { yaw: 90, width: 26, height: 12 });

  dress(b);
  b.route([[0, 0, 6], [0, 0, -18], [0, -24, -56], [0, -24, -118], [0, -26, -180], [0, -22, -226], [0, -22, -252], [0, -26, -280], [0, -10, -318], [0, -10, -346], [28, -28, -384], [76, -28, -404], [112, -18, -410], [140, -18, -410], [186, -28, -410], [232, -27, -410], [250, -27, -410]]);
  return b.build();
}

function dress(b) {
  // The Orrery: three rings of different tilt, slowly turning, high over the whole void.
  b.ring([70, 150, -270], 210, 5, { tilt: 90, section: 'box', spin: 0 });
  b.ring([70, 150, -270], 176, 2.6, { tilt: 72, yaw: 24, section: 'box', spin: 0.012, mat: 'metal' });
  b.ring([70, 150, -270], 140, 1.8, { tilt: 58, yaw: -35, spin: -0.02, mat: 'ceramic' });

  // Pylons that hold the great ring up.
  for (const [x, z] of [[280, -270], [-140, -270], [70, -60], [70, -480]]) {
    b.mass([x, -55, z], [14, 400, 14], { chamfer: 0.2 });
  }

  // Overhead rails the anchors hang from.
  b.mass([0, 112, -118], [2, 2, 260], { mat: 'concrete', chamfer: 0.06 });
  truss(b, [0, 111, 12], [0, 111, -248], 6, 26, { thickness: 0.14 });
  b.mass([0, 114, -280], [14, 2, 8], { mat: 'graphite' });
  b.beam([0, 114, -248], [0, 114, -280], 0.4);
  b.mass([52, 112, -394], [96, 2, 2], { yaw: 22, chamfer: 0.06 });

  // Moving-anchor rail, at the carriage's height.
  b.mass([186, 28.4, -410], [60, 0.8, 1.4], { mat: 'metal', chamfer: 0.04 });
  b.mass([156, -105, -410], [3, 268, 3], {});
  b.mass([216, -105, -410], [3, 268, 3], {});

  pier(b, 0, -4, -4, 12, 24);
  pier(b, 0, -239, -26, 10, 20);
  pier(b, 0, -332, -14, 10, 20);
  pier(b, 126, -410, -22, 18, 18);
  pier(b, 247, -410, -31, 20, 18);

  monolith(b, -70, -160, 30, 80, 44);
  monolith(b, 76, -180, 26, 40, 24, { slotWidth: 0.14 });
  monolith(b, -60, -420, 60, 40, 72, { slotHeight: 0.7 });
  monolith(b, 340, -330, 50, 60, 110);
  monolith(b, 320, -500, 40, 40, 60);

  guideLine(b, [0, 15], [0, -17], 0);
  guideLine(b, [0, -227], [0, -251], -22);
  guideLine(b, [0, -319], [0, -345], -10);
  guideLine(b, [113, -410], [139, -410], -18);
  guideLine(b, [233, -410], [261, -410], -27);
}
