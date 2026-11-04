import { LevelBuilder } from './LevelBuilder.js';
import { guideLine, monolith, pier, truss } from './Architecture.js';

/**
 * COURSE 04: FLOW
 * One continuous line, always falling slightly forward, that never needs to stop: ramp slide, launch,
 * curved wall, swing, hop plates, slot, dash gap, long banked ribbon, finish.
 * Landmark: the Ribbon, a white helical walkway you see from the start and end up running down.
 */
export function buildCourse04() {
  const b = new LevelBuilder({
    id: 'flow',
    number: 4,
    name: 'FLOW',
    difficulty: 4,
    tagline: 'Never stop. Everything connects if you keep your speed.',
    mechanics: ['Slide', 'Bunny hop', 'Wall run', 'Grapple', 'Air dash'],
    referenceTime: 54.81,
    killY: -130,
    environment: 'afternoon',
    preview: { pos: [-70, 56, -70], look: [40, 20, -180] },
    skylineCenter: [60, -220],
    skyline: { count: 46, seed: 44, inner: 700, outer: 2300 },
  });

  b.start([0, 60, 10], 0);
  b.slab(-8, 8, 20, -8, 60, { thick: 4 });
  b.hint([0, 60, 4], 6, 'Everything here links. Slide down, jump at the lip, and do not touch the brakes.');

  // Drop-in ramp to a launch.
  b.ramp([0, 60, -8], [0, 34, -68], 14);
  b.ramp([0, 34, -68], [0, 37, -86], 14);

  // Air, onto a curved wall that turns the route to the right.
  b.arc([40, -128], 39, 42, 208, 90, 62, 62, 46, { mat: 'graphite', segs: 20 });
  b.slab(-1, 38, -136, -172, 14, { thick: 4 });
  b.checkpoint([20, 14, -150], { width: 34, height: 9, respawn: [20, 14, -142], respawnYaw: 0 });

  // Swing out of the turn.
  b.hint([20, 14, -156], 8, 'Grapple without slowing down. Release, then catch the next one.');
  b.anchor([36, 46, -212], { mountLength: 74 });
  b.anchor([50, 40, -264], { mountLength: 80 });

  // Hop plates: small islands that reward chained hops.
  b.slab(44, 62, -310, -322, 8, { thick: 3 });
  // Spaced so one jump at sprint speed covers one plate and one gap, so the rhythm is a steady hop.
  for (let i = 0; i < 6; i++) {
    const z0 = -327 - i * 9.5;
    b.slab(45, 61, z0, z0 - 5, 7.2 - i * 0.8, { thick: 1.6, mat: i % 2 ? 'graphite' : 'concrete' });
  }
  b.slab(44, 62, -385, -406, 2, { thick: 3 });
  b.checkpoint([53, 8, -316], { width: 18, height: 8, respawn: [53, 8, -312], respawnYaw: 0 });
  b.hint([53, 8, -318], 7, 'Hop plates. Jump the moment you land and you keep all your speed.');

  // Slot and slide, into the dash gap.
  b.slab(42, 64, -406, -470, 0, { thick: 4 });
  b.box([53, 6.4, -440], [22, 10, 6], {});
  b.box([38, 2, -440], [8, 22, 6], {});
  b.box([68, 2, -440], [8, 22, 6], {});
  b.hint([53, 0, -428], 8, 'Slide the slot, sprint out, and press [Q] mid-air to make the gap.');
  b.checkpoint([53, 0, -452], { width: 22, height: 8, respawn: [53, 0, -448], respawnYaw: 0 });

  // The dash gap is wider than a sprint jump, and well within one with a dash.
  b.slab(42, 64, -484, -520, -1, { thick: 4 });

  // The Ribbon: a long curved walkway, descending, for a final slide at speed.
  b.arc([95, -520], 31, 53, 180, 90, -1, -14, 3, { segs: 20 });
  b.arc([95, -632], 59, 81, 270, 360, -14, -26, 3, { segs: 20 });
  b.slab(148, 184, -622, -672, -26, { thick: 4 });
  b.finish([166, -26, -650], { width: 36, height: 12 });

  dress(b);
  b.route([[0, 60, 10], [0, 60, -8], [0, 34, -68], [0, 37, -86], [2, 26, -125], [20, 14, -172], [36, -2, -212], [50, -6, -264], [53, 8, -310], [53, 2, -397], [53, 0, -470], [53, -1, -484], [53, -1, -520], [95, -14, -562], [165, -26, -632], [166, -26, -650]]);
  return b.build();
}

function dress(b) {
  // Second turn of the helix continues below the route as pure form, so the Ribbon reads as a spiral.
  b.arc([95, -520], 31, 53, 90, -90, -32, -60, 3, { visualOnly: true, segs: 24 });
  for (const [x, z] of [[53, -520], [95, -468], [137, -520], [95, -572], [125, -490]]) {
    b.column([x, -240, z], 240, 0.9);
  }

  monolith(b, -60, -60, 40, 60, 100);
  monolith(b, 90, -60, 30, 40, 78, { slotWidth: 0.12 });
  monolith(b, -40, -220, 60, 40, 120, { slotHeight: 0.7 });
  monolith(b, 130, -240, 40, 50, 66);
  monolith(b, -20, -420, 44, 44, 86);
  monolith(b, 150, -390, 30, 30, 104, { slotWidth: 0.14 });
  monolith(b, 240, -600, 60, 40, 80);
  monolith(b, 20, -620, 40, 60, 44, { slot: false });

  // A rail the swing anchors hang from.
  b.mass([43, 120, -238], [2, 2, 106], { yaw: 15, chamfer: 0.06 });
  truss(b, [30, 119, -186], [56, 119, -290], 6, 14, { thickness: 0.14 });
  b.mass([30, -60, -186], [4, 360, 4], {});
  b.mass([56, -60, -290], [4, 360, 4], {});

  pier(b, 0, 6, 54, 12, 22);
  pier(b, 0, -68, 24, 10, 10, { shoulder: 40 });
  pier(b, 20, -154, 10, 24, 26);
  pier(b, 53, -316, 2, 10, 8, { shoulder: 30 });
  for (let i = 0; i < 6; i++) b.column([53, -240, -329.5 - i * 9.5], 246 - i * 0.8, 0.5);
  pier(b, 53, -391, -4, 10, 8, { shoulder: 30 });
  pier(b, 53, -440, -8, 16, 40);
  pier(b, 53, -502, -9, 16, 28);
  pier(b, 166, -647, -34, 26, 40);

  guideLine(b, [0, 19], [0, -7], 60);
  guideLine(b, [20, -137], [20, -171], 14);
  guideLine(b, [53, -407], [53, -469], 0);
  guideLine(b, [53, -485], [53, -519], -1);
  guideLine(b, [166, -623], [166, -671], -26);
}
