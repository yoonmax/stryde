import { LevelBuilder } from './LevelBuilder.js';
import { colonnade, fins, guideLine, monolith, parapet, pier, truss } from './Architecture.js';

/**
 * COURSE 01: INITIATION
 * A straight line through a colonnade toward a great ring. Each section teaches one verb and then
 * immediately uses it: run, jump, slide under, slide-jump a ramp, swing once, swing twice.
 * Landmark: the Halo, a 70 m concrete ring standing across the route.
 */
export function buildCourse01() {
  const b = new LevelBuilder({
    id: 'initiation',
    number: 1,
    name: 'INITIATION',
    difficulty: 1,
    tagline: 'Run, jump, slide, swing.',
    mechanics: ['Run', 'Jump', 'Slide', 'Grapple'],
    referenceTime: 33.5,
    killY: -55,
    environment: 'morning',
    preview: { pos: [38, 14, -60], look: [-6, 2, -150] },
  });

  // Start terrace.
  b.start([0, 0, 0], 0);
  b.slab(-12, 12, 14, -34, 0, { thick: 4 });
  b.hint([0, 0, -6], 8, 'Hold [W] to run. Move the mouse to look.');

  // Jump lesson: three gaps, the second up a step.
  b.hint([0, 0, -26], 7, 'Press [SPACE] at the edge to jump.');
  b.slab(-7, 7, -39, -54, 0, { thick: 3 });
  // A glass bridge: steel below, frosted deck above, cloud visible through it.
  b.slab(-7, 7, -58.5, -74, 1, { thick: 0.3, mat: 'glass' });
  for (const x of [-6, 0, 6]) b.beam([x, 0.5, -58.5], [x, 0.5, -74], 0.34);
  for (const z of [-60, -66, -72]) b.beam([-6.8, 0.5, z], [6.8, 0.5, z], 0.2);
  b.slab(-8, 8, -80, -128, 0, { thick: 4 });
  b.checkpoint([0, 0, -86], { width: 16, height: 9, respawn: [0, 0, -84], respawnYaw: 0 });

  // Slide lesson: a monolith with a slot cut through its base. There is no way around it.
  b.hint([0, 0, -94], 8, 'Hold [C] while running to slide under the slot.');
  b.box([0, 7.3, -108], [16, 12, 6], {});
  b.box([-11, 6, -108], [6, 14, 6], {});
  b.box([11, 6, -108], [6, 14, 6], {});

  // Slide ramp: speed from the slope carries a jump over a gap no sprint can clear.
  b.hint([0, 0, -124], 8, 'Slide down the ramp. Jump at the bottom.');
  b.ramp([0, 0, -128], [0, -14, -172], 12);
  b.slab(-9, 9, -184, -232, -14, { thick: 4 });
  b.checkpoint([0, -14, -196], { width: 18, height: 9, respawn: [0, -14, -192], respawnYaw: 0 });

  // Grapple lesson: one node over open air.
  b.hint([0, -14, -208], 10, 'Aim at the blue node. Hold [RMB] to grapple, release to let go.');
  b.anchor([0, 14, -256], { mountLength: 58 });
  b.slab(-9, 9, -282, -318, -14, { thick: 4 });
  b.checkpoint([0, -14, -296], { width: 18, height: 9, respawn: [0, -14, -290], respawnYaw: 0 });

  // Two swings in a row, offset, with a release in between.
  b.hint([0, -14, -306], 8, 'Two nodes. Let go near the top of the first swing, then catch the second.');
  b.anchor([0, 10, -346], { mountLength: 62 });
  b.anchor([0, 10, -394], { mountLength: 62 });
  b.slab(-12, 12, -420, -478, -24, { thick: 6 });
  b.finish([0, -24, -458], { width: 24, height: 12 });

  dress(b);

  b.route([[0, 0, 0], [0, 0, -34], [0, 1, -58.5], [0, 0, -128], [0, -14, -172], [0, -14, -232], [0, -14, -318], [0, -24, -420], [0, -24, -458]]);

  return b.build();
}

/** Everything that makes this place, none of it touched by the player. */
function dress(b) {
  // The Halo: the ring the whole course runs toward and through.
  b.ring([0, 22, -226], 58, 3.2, { section: 'box' });
  b.mass([-58, -110, -226], [9, 262, 11], { chamfer: 0.2 });
  b.mass([58, -110, -226], [9, 262, 11], { chamfer: 0.2 });
  b.ring([0, 22, -226], 52.5, 0.35, { mat: 'metal' });
  // A second, smaller ring at the finish rhymes with it.
  b.ring([0, 2, -472], 26, 1.6, { section: 'box' });

  // Colonnades framing the start terrace, carrying a long thin roof blade.
  colonnade(b, [-11, 8], [-11, -30], 9, 9, 0.42, { base: 0 });
  b.mass([-11, 9.4, -11], [5.5, 0.8, 50], { chamfer: 0.08 });
  fins(b, [12.5, 12], [12.5, -32], 12, -2, 7, { depth: 2.2, vary: true });

  // Piers under every platform, down into cloud. This is what makes the slabs feel built, not floating.
  pier(b, 0, -4, -4, 15, 30);
  pier(b, 0, -46, -3, 9, 9, { shoulder: 10 });
  pier(b, 0, -66, -2, 6, 6, { shoulder: 10 });
  pier(b, 0, -104, -4, 11, 30);
  pier(b, 0, -150, -12, 8, 12, { shoulder: 18 });
  pier(b, 0, -208, -18, 12, 32);
  pier(b, 0, -300, -18, 12, 24);
  pier(b, 0, -450, -30, 15, 38);

  // Tall neighbours at varied distances, offset to keep the composition asymmetric.
  monolith(b, -96, -70, 34, 46, 62);
  monolith(b, 118, -140, 26, 60, 34, { slotWidth: 0.14 });
  monolith(b, -130, -290, 54, 40, 96, { slotHeight: 0.7 });
  monolith(b, 150, -340, 40, 70, 58);
  monolith(b, 74, -40, 18, 18, 22, { slot: false });
  monolith(b, -60, -420, 22, 22, 44, { slot: false });

  // A long raised viaduct crossing behind the course, on a bold diagonal.
  b.mass([180, 6, -210], [420, 5, 14], { yaw: 24, mat: 'concrete', chamfer: 0.2 });
  truss(b, [-11, 4.5, -300], [160, 2, -390], 3, 18);
  for (let i = 0; i < 6; i++) b.mass([60 + i * 62, -115, -130 - i * 27.6], [6, 235, 6], { chamfer: 0.1 });

  // One long blade from the crown of the Halo out to a far mast. Every anchor hangs from this.
  b.mass([0, 80.5, -420], [1.6, 3, 388], { mat: 'concrete', chamfer: 0.08 });
  truss(b, [0, 79, -226], [0, 79, -612], 7, 40, { thickness: 0.14 });
  b.mass([0, -80, -612], [12, 320, 12], { chamfer: 0.2 });
  b.mass([0, 88, -612], [2.5, 22, 2.5], { mat: 'graphite' });

  // Edge and floor lines teach the eye where the route goes.
  parapet(b, [-12, 14], [-12, -34], 0.5);
  guideLine(b, [0, 10], [0, -33], 0);
  guideLine(b, [0, -39.5], [0, -53.5], 0);
  guideLine(b, [0, -59], [0, -73.5], 1);
  guideLine(b, [0, -81], [0, -127], 0);
  guideLine(b, [0, -185], [0, -231], -14);
  guideLine(b, [0, -283], [0, -317], -14);
  guideLine(b, [0, -421], [0, -477], -24);
}

export const ROUTE_NODES_01 = { a: [0, 14, -256], b: [0, 10, -346], c: [0, 10, -394] };
