import { LevelBuilder } from './LevelBuilder.js';
import { fins, guideLine, monolith, pier, truss } from './Architecture.js';

/**
 * COURSE 02: VERTICAL
 * Golden hour in a canyon of towers. Everything is about walls: one long run, a chain across a gap,
 * a chimney climbed by kicking between its faces, a run around a drum, and a long final leap.
 * Landmark: the Tuning Fork, twin graphite towers joined at the crown, which the finish sits inside.
 */
export function buildCourse02() {
  const b = new LevelBuilder({
    id: 'vertical',
    number: 2,
    name: 'VERTICAL',
    difficulty: 2,
    tagline: 'Walls are floors if you are fast enough.',
    mechanics: ['Wall run', 'Wall jump', 'Wall kick', 'Large gaps'],
    referenceTime: 33.41,
    killY: -70,
    environment: 'golden',
    preview: { pos: [52, 30, -40], look: [-8, 22, -150] },
    skylineCenter: [0, -120],
    skyline: { count: 52, seed: 21, inner: 520, outer: 2100 },
  });

  b.start([0, 0, 8], 0);
  b.slab(-9, 9, 18, -16, 0, { thick: 4 });
  b.hint([0, 0, 0], 7, 'Jump beside the long wall while running. Keep holding [W] to run along it.');

  // First wall run: one wall, one gap.
  b.wall([-7, -12], [-7, -52], -14, 16, { thick: 2 });
  b.slab(-9, 9, -42, -72, -2, { thick: 4 });
  b.checkpoint([0, -2, -56], { width: 18, height: 9, respawn: [0, -2, -52] });

  // Chain: right wall, jump across, left wall, higher landing.
  b.hint([0, -2, -62], 7, 'Press [SPACE] on a wall to jump off it. Chain to the next wall.');
  b.wall([5, -72], [5, -96], -16, 14, { thick: 2, mat: 'graphite' });
  b.wall([-5, -90], [-5, -118], -16, 14, { thick: 2, mat: 'graphite' });
  b.slab(-10, 10, -116, -146, -5, { thick: 4 });
  b.checkpoint([0, -5, -124], { width: 20, height: 9, respawn: [0, -5, -120] });

  // The Flue: two facing walls close enough to climb by kicking between them.
  b.hint([0, -5, -134], 7, 'Walls this close can be climbed. Jump, then kick from wall to wall with [SPACE].');
  b.slab(-9, 9, -146, -159, -5, { thick: 4 });
  b.box([-2.3, 12, -152], [1.2, 36, 12], { mat: 'graphite' });
  b.box([2.3, 12, -152], [1.2, 36, 12], { mat: 'graphite' });
  b.box([0, 6, -158.6], [6, 22, 1.2], {});
  // Top of the Flue: a landing shelf that wraps behind the chimney.
  b.slab(-13, 13, -159, -202, 17, { thick: 3 });
  b.checkpoint([0, 17, -166], { width: 22, height: 9, respawn: [0, 17, -162], respawnYaw: 0 });

  // The Drum: a tower to wall-run around, from one ledge to the next.
  b.hint([0, 17, -180], 8, 'A curved wall works too. Stay on it and turn with it.');
  b.cyl([0, -240, -224], 17, 277, { mat: 'graphite', segments: 96 });
  // The second ledge sits on the drum's east side, a quarter turn from where the run starts.
  b.slab(12, 56, -214, -244, 8, { thick: 3 });
  b.checkpoint([34, 8, -229], { yaw: 90, width: 30, height: 9, respawn: [28, 8, -229], respawnYaw: -90 });

  // Final leap: slide a ramp for speed, catch the long wall, and jump from its far end to the Fork.
  b.hint([44, 8, -230], 8, 'Slide the ramp, catch the far wall, jump from its end.');
  b.ramp([56, 8, -229], [86, 0, -229], 14);
  b.wall([86, -221], [134, -221], -20, 22, { thick: 2, mat: 'graphite' });
  b.slab(128, 168, -210, -248, -5, { thick: 4 });
  b.finish([150, -5, -229], { yaw: 90, width: 36, height: 14 });

  dress(b);
  b.route([[0, 0, 8], [0, 0, -16], [0, 1, -42], [0, -2, -72], [0, 2, -116], [0, -5, -146], [0, 17, -159], [0, 17, -202], [17, 8, -216], [56, 8, -229], [86, 0, -229], [128, -5, -229], [150, -5, -229]]);
  return b.build();
}

function dress(b) {
  // The Tuning Fork: twin graphite towers joined at the crown, framing the finish.
  b.mass([150, -40, -206], [12, 400, 7], { mat: 'graphite', chamfer: 0.15 });
  b.mass([150, -40, -252], [12, 400, 7], { mat: 'graphite', chamfer: 0.15 });
  b.mass([150, 166, -229], [14, 12, 53], { mat: 'graphite', chamfer: 0.15 });
  b.mass([150, 210, -229], [6, 80, 6], { mat: 'graphite' });

  // Canyon of towers along the route, deliberately close so height is felt on every jump.
  monolith(b, -38, -30, 30, 44, 88);
  monolith(b, 38, -60, 26, 38, 118, { slotWidth: 0.12 });
  monolith(b, -46, -110, 34, 30, 150, { slotHeight: 0.8 });
  monolith(b, 36, -140, 24, 34, 74);
  monolith(b, -52, -200, 40, 54, 132);
  monolith(b, 74, -176, 30, 30, 96, { slotWidth: 0.12 });
  monolith(b, 96, -280, 36, 40, 150);
  monolith(b, 210, -180, 44, 60, 120);
  monolith(b, 220, -290, 50, 40, 86);
  monolith(b, 40, -300, 26, 60, 60, { slot: false });

  // A sky-bridge between two towers, directly over the route, for a sense of being inside something.
  b.mass([-4, 58, -70], [54, 3, 6], { chamfer: 0.1 });
  b.mass([-8, 92, -128], [58, 2.4, 5], { mat: 'ceramic', chamfer: 0.08 });
  truss(b, [-30, 118, -196], [60, 96, -176], 5, 16, { thickness: 0.14 });

  fins(b, [12, 16], [12, -14], 10, -3, 5, { depth: 2, vary: true });
  fins(b, [14, -118], [14, -146], 8, -3, 9, { depth: 2, vary: true });

  pier(b, 0, 2, -4, 13, 24);
  pier(b, 0, -60, -6, 13, 18);
  pier(b, 0, -131, -9, 15, 22);
  pier(b, 0, -178, 14, 19, 30, { shoulder: 60 });
  pier(b, 36, -230, 7, 24, 22, { shoulder: 60 });
  pier(b, 148, -229, -7, 30, 26);
  pier(b, 72, -229, -2, 8, 8, { shoulder: 30 });

  guideLine(b, [0, 16], [0, -15], 0);
  guideLine(b, [0, -43], [0, -71], -2);
  guideLine(b, [0, -117], [0, -145], -5);
  guideLine(b, [0, -160], [0, -201], 17);
  guideLine(b, [130, -229], [167, -229], -5);
}
