// Records each course's route as a compact per-tick input list, used by the browser test that plays a
// full run through the real game loop, and by the screenshot script.
// Usage: node scripts/record-routes.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { initPhysics } from '../src/physics/PhysicsWorld.js';
import { playRoute } from '../tests/bot.js';
import { blankInput } from '../tests/helpers.js';
import { getLevel } from '../src/levels/LevelManager.js';
import { course01 } from '../tests/routes/course01.route.js';
import { course02 } from '../tests/routes/course02.route.js';
import { course03 } from '../tests/routes/course03.route.js';
import { course04 } from '../tests/routes/course04.route.js';
import { course05 } from '../tests/routes/course05.route.js';

await initPhysics();
mkdirSync('tests/e2e/fixtures', { recursive: true });
const defaults = blankInput();
const routes = { initiation: course01, vertical: course02, pendulum: course03, flow: course04, ascent: course05 };
for (const [id, route] of Object.entries(routes)) {
  const inputs = [];
  const { result } = playRoute(getLevel(id), route, { recordInputs: inputs });
  // Only what differs from an idle tick is stored.
  const compact = inputs.map((i) => {
    const o = {};
    for (const k of Object.keys(i)) if (i[k] !== defaults[k]) o[k] = i[k];
    return o;
  });
  writeFileSync(`tests/e2e/fixtures/${id}.inputs.json`, JSON.stringify({ time: result.time, inputs: compact }));
  console.log(id, result.time.toFixed(3), `${compact.length} ticks`);
}
