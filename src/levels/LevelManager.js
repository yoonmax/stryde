import { buildCourse01 } from './Course01.js';
import { buildCourse02 } from './Course02.js';
import { buildCourse03 } from './Course03.js';
import { buildCourse04 } from './Course04.js';
import { buildCourse05 } from './Course05.js';
import { buildFreeRun } from './FreeRun.js';

const BUILDERS = {
  initiation: buildCourse01,
  vertical: buildCourse02,
  pendulum: buildCourse03,
  flow: buildCourse04,
  ascent: buildCourse05,
  commons: buildFreeRun,
};

export const COURSE_ORDER = ['initiation', 'vertical', 'pendulum', 'flow', 'ascent'];
export const FREE_RUN_ID = 'commons';

const cache = new Map();

/** Level definitions are plain data, built once and shared by the simulation and the renderer. */
export function getLevel(id) {
  if (!cache.has(id)) {
    const build = BUILDERS[id];
    if (!build) throw new Error(`Unknown level: ${id}`);
    cache.set(id, build());
  }
  return cache.get(id);
}

export const allCourses = () => COURSE_ORDER.map(getLevel);

/**
 * Elevation profile of the authored route, for the level-select screen. Measured from the level data:
 * x is route distance and y is height, both normalised, so it shows the course's real shape.
 */
export function elevationProfile(level) {
  const line = level.routeLine;
  if (!line?.length) return { points: [], length: 0, rise: 0 };
  let dist = 0;
  const out = [{ d: 0, y: line[0].y }];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    dist += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    out.push({ d: dist, y: b.y });
  }
  const ys = out.map((p) => p.y);
  return { points: out, length: dist, min: Math.min(...ys), max: Math.max(...ys), rise: Math.max(...ys) - Math.min(...ys) };
}
