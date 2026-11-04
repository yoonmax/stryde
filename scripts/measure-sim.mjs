// CPU cost of one simulation tick, measured while actually playing each course's route headless.
import { initPhysics } from '../src/physics/PhysicsWorld.js';
import { playRoute } from '../tests/bot.js';
import { getLevel } from '../src/levels/LevelManager.js';
import { course01 } from '../tests/routes/course01.route.js';
import { course02 } from '../tests/routes/course02.route.js';
import { course03 } from '../tests/routes/course03.route.js';
import { course04 } from '../tests/routes/course04.route.js';
import { course05 } from '../tests/routes/course05.route.js';

await initPhysics();
for (const [id, route] of Object.entries({ initiation: course01, vertical: course02, pendulum: course03, flow: course04, ascent: course05 })) {
  for (let warm = 0; warm < 2; warm++) playRoute(getLevel(id), route);
  const t0 = performance.now();
  const { sim, result } = playRoute(getLevel(id), route);
  const ms = performance.now() - t0;
  const ticks = result.time * 120 + 216;
  console.log(`${id.padEnd(11)} ${(ms / ticks * 1000).toFixed(1)} microseconds per tick, ${sim.level.solids.length} solids`);
}
