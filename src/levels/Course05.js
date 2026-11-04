import { LevelBuilder } from './LevelBuilder.js';
import { fins, guideLine, monolith, pier, truss } from './Architecture.js';

/**
 * COURSE 05: ASCENT
 * Dusk. Every mechanic, with real route choices. Chain walls, cross by rope or by wall, slide into a
 * huge run around the Spire, climb the Flue or take the high rope, then reel up three terraces into
 * the Crown. Landmark: the Spire and its ring, visible from the first step.
 */
export function buildCourse05() {
  const b = new LevelBuilder({
    id: 'ascent',
    number: 5,
    name: 'ASCENT',
    difficulty: 5,
    tagline: 'Everything you have learned, on the way up.',
    mechanics: ['Every mechanic', 'Route choices', 'Reeling', 'Long wall runs'],
    referenceTime: 43.28,
    killY: -120,
    environment: 'dusk',
    preview: { pos: [60, 6, -180], look: [-45, 52, -360] },
    skylineCenter: [-30, -300],
    skyline: { count: 40, seed: 55, inner: 740, outer: 2500 },
  });

  b.start([0, 0, 6], 0);
  b.slab(-9, 9, 16, -14, 0, { thick: 4 });
  b.hint([0, 0, 2], 7, 'Last course. Nothing new here, but two sections have more than one way through.');

  // Wall chain.
  b.wall([5, -14], [5, -38], -16, 14, { thick: 2, mat: 'graphite' });
  b.wall([-5, -32], [-5, -60], -16, 14, { thick: 2, mat: 'graphite' });
  b.slab(-10, 24, -56, -92, -5, { thick: 4 });
  b.checkpoint([0, -5, -68], { width: 48, height: 9, respawn: [0, -5, -62] });

  // First route choice. Left: one long swing. Right: two wall runs either side of a small perch.
  b.hint([0, -5, -82], 10, 'Two ways across. A long swing, or the walls on the right.');
  b.anchor([0, 30, -118], { mountLength: 76 });
  b.wall([15, -92], [15, -114], -24, 10, { thick: 2 });
  b.slab(9, 22, -111, -122, -11, { thick: 2.4 });
  b.wall([15, -122], [15, -146], -28, 6, { thick: 2 });
  b.slab(-14, 26, -142, -186, -14, { thick: 4 });
  b.checkpoint([0, -14, -160], { width: 52, height: 9, respawn: [0, -14, -150] });

  // Slide into the Spire: ramp, kicker, and the longest wall run in the game.
  b.hint([0, -14, -176], 8, 'Slide for speed, then keep the Spire on your right and do not let go.');
  b.ramp([0, -14, -186], [0, -40, -246], 14);
  b.cyl([-40, -240, -280], 28, 250, { mat: 'graphite', segments: 128 });
  b.ramp([0, -40, -246], [0, -38, -258], 14);
  b.slab(-74, -18, -304, -344, -48, { thick: 4 });
  b.checkpoint([-46, -48, -322], { width: 56, height: 9, respawn: [-46, -48, -314] });

  // Second route choice. The Flue climbs by kicking. The high rope needs a good line from the far left.
  b.hint([-46, -48, -334], 9, 'Climb the Flue by kicking between the walls, or reach for the rope from the far left.');
  b.box([-48.3, -32, -350], [1.2, 38, 12], { mat: 'graphite' });
  b.box([-43.7, -32, -350], [1.2, 38, 12], { mat: 'graphite' });
  b.box([-46, -36, -356.6], [6, 30, 1.2], {});
  b.slab(-74, -18, -344, -357, -48, { thick: 4 });
  b.anchor([-70, 6, -346], { mountLength: 100 });
  b.slab(-74, -18, -357, -398, -24, { thick: 4 });
  b.checkpoint([-46, -24, -366], { width: 56, height: 9, respawn: [-46, -24, -360] });

  // Three reeled lifts up the terraces, into the Crown.
  b.hint([-46, -24, -380], 8, 'Reel up through the terraces. Let go as you rise past each edge.');
  b.anchor([-46, 18, -428], { mountLength: 104 });
  b.slab(-60, -32, -432, -460, -8, { thick: 4 });
  b.anchor([-46, 36, -490], { mountLength: 84 });
  b.slab(-60, -32, -494, -522, 10, { thick: 4 });
  b.anchor([-46, 54, -552], { mountLength: 68 });
  b.slab(-66, -26, -556, -604, 28, { thick: 5 });
  b.finish([-46, 28, -586], { width: 40, height: 16 });

  dress(b);
  b.route([[0, 0, 6], [0, 0, -14], [0, 2, -56], [0, -5, -92], [0, -14, -142], [0, -14, -186], [0, -40, -246], [0, -38, -258], [-46, -48, -304], [-46, -48, -344], [-46, -24, -357], [-46, -24, -398], [-46, -8, -432], [-46, -8, -460], [-46, 10, -494], [-46, 10, -522], [-46, 28, -556], [-46, 28, -586]]);
  return b.build();
}

function dress(b) {
  // The Spire's upper tiers: narrowing drums, then a mast and a ring around it.
  b.cyl([-40, 10, -280], 20, 62, { visualOnly: true, segments: 96 });
  b.cyl([-40, 72, -280], 12, 70, { visualOnly: true, mat: 'ceramic', segments: 72 });
  b.cyl([-40, 142, -280], 5, 90, { visualOnly: true, mat: 'graphite', segments: 48 });
  b.cyl([-40, 232, -280], 1.2, 60, { visualOnly: true, mat: 'metal', segments: 16 });
  b.ring([-40, 150, -280], 62, 2.4, { tilt: 90, section: 'box', spin: 0.018, mat: 'concrete' });
  b.ring([-40, 150, -280], 74, 0.8, { tilt: 82, yaw: 20, spin: -0.03, mat: 'metal' });

  // The Crown: a tall open frame around the finish.
  for (const [x, z] of [[-74, -556], [-18, -556], [-74, -606], [-18, -606]]) {
    b.mass([x, -80, z], [5, 340, 5], { chamfer: 0.12 });
  }
  b.mass([-46, 62, -556], [61, 2.4, 5], { chamfer: 0.1 });
  b.mass([-46, 62, -606], [61, 2.4, 5], { chamfer: 0.1 });
  b.mass([-74, 62, -581], [5, 2.4, 55], { chamfer: 0.1 });
  b.mass([-18, 62, -581], [5, 2.4, 55], { chamfer: 0.1 });
  b.ring([-46, 68, -581], 44, 1.6, { tilt: 90, section: 'box' });

  // Girders for the lift anchors to hang from.
  b.mass([-46, 122, -490], [1.6, 2.4, 170], { chamfer: 0.06 });
  truss(b, [-46, 121, -405], [-46, 121, -575], 6, 18, { thickness: 0.13 });
  b.mass([-46, -60, -405], [6, 360, 6], {});
  b.mass([-70, 106, -346], [2, 2, 16], { mat: 'graphite' });
  b.beam([-70, 106, -354], [-46, 121, -405], 0.3);
  b.mass([0, 106, -118], [10, 2, 10], { mat: 'graphite' });
  b.beam([0, 106, -118], [70, 106, -60], 0.3);

  // Dark mass and thin fins for dusk rim light to catch.
  monolith(b, 70, -60, 34, 50, 90);
  monolith(b, -70, -90, 40, 34, 60, { slotWidth: 0.14 });
  monolith(b, 90, -220, 44, 70, 122, { slotHeight: 0.8 });
  monolith(b, -140, -260, 50, 50, 96);
  monolith(b, 60, -400, 40, 60, 80, { slot: false });
  monolith(b, -170, -430, 70, 44, 138);
  monolith(b, 30, -560, 30, 60, 110);
  monolith(b, -170, -600, 40, 40, 72, { slot: false });
  fins(b, [20, 12], [20, -14], 10, -3, 6, { depth: 2, vary: true });
  fins(b, [30, -150], [30, -186], 12, 0, 12, { depth: 2.4, vary: true });

  pier(b, 0, 2, -4, 13, 22);
  pier(b, 7, -74, -9, 26, 26);
  pier(b, 15, -116, -14, 6, 6, { shoulder: 30 });
  pier(b, 6, -164, -18, 30, 34);
  pier(b, 0, -246, -44, 9, 9, { shoulder: 30 });
  pier(b, -46, -330, -52, 40, 40);
  pier(b, -46, -378, -28, 40, 30);
  pier(b, -46, -446, -12, 18, 18);
  pier(b, -46, -508, 6, 18, 18);
  pier(b, -46, -580, 23, 30, 36);

  guideLine(b, [0, 15], [0, -13], 0);
  guideLine(b, [0, -57], [0, -91], -5);
  guideLine(b, [0, -143], [0, -185], -14);
  guideLine(b, [-46, -305], [-46, -343], -48);
  guideLine(b, [-46, -358], [-46, -397], -24);
  guideLine(b, [-46, -433], [-46, -459], -8);
  guideLine(b, [-46, -495], [-46, -521], 10);
  guideLine(b, [-46, -557], [-46, -603], 28);
}
