import { describe, it, expect, beforeAll } from 'vitest';
import { initPhysics } from '../../src/physics/PhysicsWorld.js';
import { playRoute } from '../bot.js';
import { buildCourse01 } from '../../src/levels/Course01.js';
import { course01 } from './course01.route.js';
import { buildCourse02 } from '../../src/levels/Course02.js';
import { course02 } from './course02.route.js';
import { buildCourse03 } from '../../src/levels/Course03.js';
import { course03 } from './course03.route.js';
import { buildCourse04 } from '../../src/levels/Course04.js';
import { course04 } from './course04.route.js';
import { buildCourse05 } from '../../src/levels/Course05.js';
import { course05, course05Alternate } from './course05.route.js';

beforeAll(() => initPhysics());

const check = (name, build, route) => it(`${name} is completable with player inputs`, () => {
  const level = build();
  const { result, log, sim } = playRoute(level, route);
  console.log(name, result ? result.time.toFixed(2) : 'DNF', log.join(' | '), result ? `peak ${result.peakSpeed.toFixed(1)} grapples ${result.grapples}` : `end ${JSON.stringify(sim.player.pos)}`);
  expect(result).not.toBeNull();
  expect(sim.player.machine.violations).toEqual([]);
  expect(result.deaths).toBe(0);
  // The reference time shown in the game must be the time the route really produces.
  if (!name.includes('alternate')) expect(Math.abs(result.time - level.referenceTime)).toBeLessThan(0.05);
});

describe('course routes', () => {
  check('initiation', buildCourse01, course01);
  check('vertical', buildCourse02, course02);
  check('pendulum', buildCourse03, course03);
  check('flow', buildCourse04, course04);
  check('ascent', buildCourse05, course05);
  check('ascent (alternate routes)', buildCourse05, course05Alternate);
});
