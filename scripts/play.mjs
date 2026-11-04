// Dev helper: plays the built game for real, with a real pointer lock and real key events.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'shots';
mkdirSync(out, { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--port', '4179', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1200));
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
try {
  await page.goto('http://localhost:4179/?debug');
  await page.waitForFunction(() => window.__stryde?.flow?.state === 'menu', null, { timeout: 60000 });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${out}/menu.png` });

  await page.getByRole('button', { name: /^PLAY/ }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/levels.png` });
  await page.getByRole('button', { name: /^Start/ }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/countdown.png` });
  await page.waitForFunction(() => window.__stryde.flow.state === 'playing', null, { timeout: 10000 });
  const locked = await page.evaluate(() => !!document.pointerLockElement);
  console.log('pointer locked:', locked, 'raw:', await page.evaluate(() => window.__stryde.input.rawActive));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/running.png` });
  console.log('state', await page.evaluate(() => { const g = window.__stryde; const p = g.sim.player; return { z: p.pos.z, v: p.vel.z, st: p.stateLabel, t: g.sim.timer.elapsed, fps: g.loop.frameStats() }; }));
  await page.keyboard.up('KeyW');

  // Jump straight to the grapple section using the same debug path the tests use.
  await page.evaluate(() => {
    const g = window.__stryde;
    const p = g.sim.player;
    p.teleport({ x: 0, y: -14, z: -230 }, 0);
    g.input.setLook(0, 0.75);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/aim.png` });
  await page.mouse.down({ button: 'right' });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/grapple-fire.png` });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/grapple-swing.png` });
  console.log('grapple', await page.evaluate(() => { const g = window.__stryde.sim.player.grapple; const p = window.__stryde.sim.player; return { attached: g.attached, len: g.length, taut: g.taut, speed: Math.hypot(p.vel.x, p.vel.y, p.vel.z) }; }));
  await page.mouse.up({ button: 'right' });
  await page.keyboard.up('KeyW');

  // Pause with a real loss of pointer lock.
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/pause.png` });
  console.log('flow after unlock:', await page.evaluate(() => window.__stryde.flow.state));
  const before = await page.evaluate(() => window.__stryde.sim.timer.elapsed);
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => window.__stryde.sim.timer.elapsed);
  console.log('timer stable while paused:', before === after);
} finally {
  console.log(logs.slice(0, 15).join('\n'));
  await browser.close();
  server.kill();
}
