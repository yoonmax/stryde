import { LevelBuilder } from './LevelBuilder.js';
import { colonnade, fins, guideLine, monolith, pier, truss } from './Architecture.js';

/**
 * THE COMMONS: free run.
 * A large plaza with practice areas around it, joined by walkways, so that moving between them is
 * practice too: a swing hall, a wall garden, a slope bowl, a hop line, a flue tower, a skill line.
 * There is no clock and no way to fail, only falling back to the last spawn you chose.
 */
export function buildFreeRun() {
  const b = new LevelBuilder({
    id: 'commons',
    number: 0,
    name: 'THE COMMONS',
    freeRun: true,
    difficulty: 0,
    tagline: 'No clock. Build speed, try things, chain whatever you like.',
    mechanics: ['Everything'],
    killY: -80,
    environment: 'commons',
    preview: { pos: [70, 44, 70], look: [-10, 8, -30] },
    skylineCenter: [0, 0],
    skyline: { count: 44, seed: 66, inner: 620, outer: 2200 },
  });

  // Central plaza.
  b.start([0, 0, 0], 0);
  b.spawnPoint('Plaza', [0, 0, 0], 0);
  b.slab(-48, 48, 48, -48, 0, { thick: 5 });
  b.cyl([0, 0, 0], 3, 0.5, { mat: 'ceramic', segments: 48, visualOnly: true });
  b.hint([0, 0, 0], 4, 'Pause to jump straight to a practice area.');

  // North: the swing hall, a wide void under a ring of anchors.
  b.spawnPoint('Swing hall', [0, 0, -44], 0);
  b.slab(-48, 48, -130, -48, 0, { thick: 0.01, noVisual: true, visualOnly: true });
  const ringR = 62;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    b.anchor([Math.cos(a) * ringR, 34, -115 + Math.sin(a) * ringR], { mountLength: 44 });
  }
  b.anchor([0, 44, -115], { mountLength: 34 });
  b.slab(-30, 30, -190, -210, 2, { thick: 4 });
  b.slab(-90, -72, -106, -124, 4, { thick: 4 });
  b.slab(72, 90, -106, -124, 4, { thick: 4 });

  // East: the wall garden. Long parallel walls at several spacings, curved walls, and a kicking flue.
  b.spawnPoint('Wall garden', [52, 0, 0], -90);
  b.slab(48, 112, 26, -26, 0, { thick: 5 });
  // A long glass bridge across a gap in the walkway. Glass can be walked on, never wall-run.
  b.slab(112, 150, 10, -10, 0, { thick: 0.3, mat: 'glass' });
  for (const z of [-9, 9]) b.beam([112, -0.4, z], [150, -0.4, z], 0.4);
  for (let x = 116; x < 150; x += 6) b.beam([x, -0.5, -10], [x, -0.5, 10], 0.18);
  b.slab(150, 180, 26, -26, 0, { thick: 5 });
  b.wall([72, 30], [72, -2], 0, 14, { thick: 1.6, mat: 'graphite' });
  b.slab(180, 250, 46, -46, 0, { thick: 5 });
  b.wall([190, -22], [250, -22], -30, 18, { thick: 2 });
  b.wall([190, 22], [250, 22], -30, 18, { thick: 2 });
  b.wall([260, -11], [320, -11], -30, 18, { thick: 2, mat: 'graphite' });
  b.wall([260, 11], [320, 11], -30, 18, { thick: 2, mat: 'graphite' });
  b.slab(320, 362, 26, -26, 2, { thick: 4 });
  b.arc([300, -90], 60, 62, 100, 20, 22, 22, 50, { mat: 'graphite' });
  // A climbing flue on the far side, with a small roof at its top.
  b.box([160, 12, -21.3], [12, 24, 1.2], { mat: 'graphite' });
  b.box([160, 12, -16.7], [12, 24, 1.2], { mat: 'graphite' });
  b.slab(153, 167, -24, -14, 24, { thick: 0.6 });

  // West: the slope bowl. Ramps down into a basin and up the other side, for sliding and launching.
  b.spawnPoint('Slope bowl', [-52, 0, 0], 90);
  b.slab(-110, -48, 26, -26, 0, { thick: 5 });
  b.ramp([-110, 0, 0], [-160, -18, 0], 34);
  b.slab(-160, -196, 30, -30, -18, { thick: 4 });
  b.ramp([-196, -18, 0], [-250, 4, 0], 34);
  b.slab(-250, -290, 30, -30, 4, { thick: 4 });
  b.ramp([-178, -18, -30], [-178, -6, -74], 30);
  b.ramp([-178, -18, 30], [-178, -6, 74], 30);

  // South: the hop line, then the skill line.
  b.spawnPoint('Hop line', [0, 0, 44], 180);
  b.slab(-18, 18, 48, 74, 0, { thick: 4 });
  for (let i = 0; i < 12; i++) {
    const z0 = 78 + i * 9.5;
    b.slab(-9, 9, z0 + 5, z0, -0.25 * i, { thick: 1.6, mat: i % 3 === 2 ? 'graphite' : 'concrete' });
  }
  b.slab(-18, 18, 190, 226, -3, { thick: 4 });

  // Skill line: wall, wall, rope, dash, kicker. A short course of its own.
  b.spawnPoint('Skill line', [0, -3, 222], 180);
  b.wall([6, 226], [6, 252], -20, 12, { thick: 2, mat: 'graphite' });
  b.wall([-6, 246], [-6, 274], -20, 12, { thick: 2, mat: 'graphite' });
  b.slab(-9, 9, 272, 290, -7, { thick: 3 });
  b.anchor([0, 28, 322], { mountLength: 40 });
  b.slab(-8, 8, 352, 366, -10, { thick: 3 });
  b.slab(-8, 8, 386, 410, -10, { thick: 3 });
  b.ramp([0, -10, 410], [0, -6, 422], 16);
  b.slab(-14, 14, 440, 486, -4, { thick: 4 });

  dress(b);
  return b.build();
}

function dress(b) {
  // The great ring over the swing hall, which also hangs the anchors.
  b.ring([0, 78, -115], 62, 2.8, { tilt: 90, section: 'box' });
  b.ring([0, 96, -115], 40, 1.4, { tilt: 90, section: 'box', spin: 0.03, mat: 'metal' });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.mass([Math.cos(a) * 70, -80, -115 + Math.sin(a) * 70], [6, 320, 6], { chamfer: 0.12 });
  }

  // Colonnades across the plaza, and a long low roof over one edge.
  colonnade(b, [-44, 44], [44, 44], 12, 8, 0.45, { base: 0 });
  b.mass([0, 8.4, 44], [92, 0.7, 5], { chamfer: 0.08 });
  colonnade(b, [-44, -40], [-44, 40], 12, 7, 0.4, { base: 0 });
  fins(b, [46, 40], [46, 28], 4, 0, 6, { depth: 1.6 });

  monolith(b, 110, 120, 44, 44, 110);
  monolith(b, -110, 130, 34, 60, 76, { slotWidth: 0.14 });
  monolith(b, 180, -120, 40, 60, 88);
  monolith(b, -180, -120, 54, 40, 120, { slotHeight: 0.8 });
  monolith(b, -340, 60, 60, 60, 90);
  monolith(b, 400, 80, 40, 40, 100);
  monolith(b, 90, 340, 50, 40, 60, { slot: false });
  monolith(b, -90, 420, 40, 50, 84);

  truss(b, [48, 22, 28], [180, 22, 28], 3, 14, { thickness: 0.13 });

  pier(b, 0, 0, -6, 60, 60, { shoulder: 60 });
  pier(b, 114, 0, -6, 40, 30);
  pier(b, 216, 0, -6, 36, 30);
  pier(b, 340, 0, -2, 22, 26);
  pier(b, -80, 0, -6, 30, 30);
  pier(b, -178, 0, -22, 22, 30);
  pier(b, -270, 0, 0, 22, 28);
  pier(b, 0, -200, -2, 30, 12, { shoulder: 30 });
  pier(b, 0, 61, -4, 14, 14);
  pier(b, 0, 208, -7, 20, 20);
  pier(b, 0, 281, -10, 10, 10);
  pier(b, 0, 359, -13, 10, 8);
  pier(b, 0, 398, -13, 10, 14);
  pier(b, 0, 463, -8, 18, 28);

  guideLine(b, [0, 48], [0, -47], 0);
  guideLine(b, [-47, 0], [47, 0], 0);
  guideLine(b, [49, 0], [179, 0], 0);
  guideLine(b, [-49, 0], [-109, 0], 0);
}
