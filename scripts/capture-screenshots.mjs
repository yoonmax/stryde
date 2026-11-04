// Captures the README's screenshots from the running game, using real play where motion matters.
// Usage: npm run build && node scripts/capture-screenshots.mjs [outDir]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { installFeed } from '../tests/e2e/feed.js';

const out = process.argv[2] ?? 'docs/screens';
mkdirSync(out, { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--port', '4183', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1200));
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (name) => page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 88 });
const wait = (ms) => page.waitForTimeout(ms);
const start = async (levelName, trial = false) => {
  await page.goto('http://localhost:4183/?debug');
  await page.waitForFunction(() => window.__stryde?.flow?.state === 'menu', null, { timeout: 60000 });
  await wait(300);
  await page.getByRole('button', { name: trial ? /^TIME TRIALS/ : /^PLAY/ }).click();
  await wait(200);
  await page.getByRole('option', { name: new RegExp(levelName) }).click();
  await wait(200);
  await page.getByRole('button', { name: /^Start/ }).click();
  await page.waitForFunction(() => window.__stryde.flow.state === 'playing', null, { timeout: 15000 });
};
const route = (id) => JSON.parse(readFileSync(`tests/e2e/fixtures/${id}.inputs.json`));
/** Starts a real recorded run and returns once the given condition holds in the simulation. */
const playUntil = async (levelName, id, cond, { trial = false, delay = 0 } = {}) => {
  await page.goto('http://localhost:4183/?debug');
  await page.waitForFunction(() => window.__stryde?.flow?.state === 'menu', null, { timeout: 60000 });
  await page.getByRole('button', { name: trial ? /^TIME TRIALS/ : /^PLAY/ }).click();
  await page.getByRole('option', { name: new RegExp(levelName) }).click();
  await page.getByRole('button', { name: /^Start/ }).click();
  await page.waitForFunction(() => window.__stryde.flow.state === 'countdown');
  await installFeed(page, route(id).inputs, delay);
  if (cond) await page.waitForFunction(cond, null, { timeout: 120000 });
};
const place = (x, y, z, yawDeg, pitchDeg = 0, vel = [0, 0, 0]) => page.evaluate(({ x, y, z, yawDeg, pitchDeg, vel }) => {
  const g = window.__stryde;
  g.sim.player.teleport({ x, y, z }, (yawDeg * Math.PI) / 180);
  g.sim.player.vel.x = vel[0]; g.sim.player.vel.y = vel[1]; g.sim.player.vel.z = vel[2];
  g.input.setLook((yawDeg * Math.PI) / 180, (pitchDeg * Math.PI) / 180);
}, { x, y, z, yawDeg, pitchDeg, vel });

try {
  await page.goto('http://localhost:4183/?debug');
  await page.waitForFunction(() => window.__stryde?.flow?.state === 'menu', null, { timeout: 60000 });
  await wait(2000);
  await shot('menu');
  await page.getByRole('button', { name: /^TIME TRIALS/ }).click();
  await wait(500);
  await page.getByRole('option', { name: /ASCENT/ }).hover();
  await wait(900);
  await shot('level-select');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: /^SETTINGS/ }).click();
  await wait(300);
  await page.getByRole('button', { name: 'Gameplay' }).click();
  await wait(600);
  await shot('settings');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: /^ABOUT/ }).click();
  await wait(600);
  await shot('about');

  // Action shots: real runs, caught at real moments.
  await playUntil('INITIATION', 'initiation', () => window.__stryde.sim.player.pos.z < -42 && window.__stryde.sim.player.machine.grounded);
  await shot('initiation');
  await page.waitForFunction(() => { const p = window.__stryde.sim.player; return p.machine.state === 'SLIDING' && p.pos.z < -150; }, null, { timeout: 60000 });
  await shot('slide');
  await page.waitForFunction(() => { const p = window.__stryde.sim.player; return p.grapple.attached && p.grapple.taut && Math.abs(p.pos.z + 262) < 8; }, null, { timeout: 60000 });
  await shot('grapple');

  await playUntil('VERTICAL', 'vertical', () => { const p = window.__stryde.sim.player; return p.wall.active && p.pos.z < -24; });
  await shot('wall-run');
  await page.waitForFunction(() => { const p = window.__stryde.sim.player; return p.wall.active && p.pos.y > 8 && p.pos.z < -205; }, null, { timeout: 60000 });
  await shot('drum');

  await playUntil('PENDULUM', 'pendulum', () => { const p = window.__stryde.sim.player; return p.grapple.attached && p.pos.z < -112 && Math.hypot(p.vel.x, p.vel.y, p.vel.z) > 22; });
  await shot('pendulum');

  await playUntil('FLOW', 'flow', () => { const p = window.__stryde.sim.player; return p.pos.z < -30 && p.machine.state === 'SLIDING'; });
  await shot('flow');
  await page.waitForFunction(() => window.__stryde.sim.player.pos.z < -345 && window.__stryde.sim.player.pos.y > 6, null, { timeout: 60000 });
  await shot('flow-hops');
  await page.waitForFunction(() => window.__stryde.sim.player.pos.z < -540, null, { timeout: 60000 });
  await shot('flow-ribbon');

  await playUntil('ASCENT', 'ascent', () => { const p = window.__stryde.sim.player; return p.wall.active && p.pos.z < -270; });
  await shot('ascent');
  await page.waitForFunction(() => { const p = window.__stryde.sim.player; return p.grapple.attached && p.pos.z < -480; }, null, { timeout: 60000 });
  await shot('ascent-crown');

  // Two composed views of places, not of play.
  await start('INITIATION');
  await place(0, 1.05, -60, 0, -6);
  await wait(250);
  await shot('glass-bridge');
  await start('VERTICAL');
  await place(0, 17.1, -170, 0, 2);
  await wait(250);
  await shot('vertical');

  // A whole time trial, then a second one half a second behind the ghost the first run saved.
  await playUntil('INITIATION', 'initiation', null, { trial: true });
  await page.getByText('course finished').waitFor({ timeout: 60000 });
  await wait(1800);
  await shot('results');
  await wait(1400);
  await page.getByRole('button', { name: /Run it again/ }).click();
  await page.waitForFunction(() => window.__stryde.flow.state === 'countdown');
  await installFeed(page, route('initiation').inputs, 70);
  await page.waitForFunction(() => { const p = window.__stryde.sim.player; return p.pos.z < -176 && p.machine.grounded === false; }, null, { timeout: 60000 });
  await shot('ghost');
  await page.getByText('course finished').waitFor({ timeout: 60000 });
  await wait(1500);
  await shot('results-pb');

  await page.getByRole('button', { name: 'Main menu' }).click();
  await wait(300);
  await page.getByRole('button', { name: /^STATISTICS/ }).click();
  await wait(700);
  await shot('statistics');
  await page.getByRole('button', { name: 'Back' }).click();
  await wait(300);
  await page.getByRole('button', { name: /^FREE RUN/ }).click();
  await page.waitForFunction(() => window.__stryde.flow.state === 'playing', null, { timeout: 15000 });
  await wait(600);
  await place(0, 0.05, 30, 0, 8);
  await wait(250);
  await shot('free-run');
  console.log('captured');
} finally {
  console.log(errors.length ? errors.join('\n') : 'no page errors');
  await browser.close();
  server.kill();
}
