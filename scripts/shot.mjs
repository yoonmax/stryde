// Dev helper: opens the built game with a real GPU and captures named views.
// Usage: node scripts/shot.mjs <outDir> [levelId] [x,y,z,yawDeg,pitchDeg]...
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'shots';
mkdirSync(out, { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--port', '4179', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1200));
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
try {
  const t0 = Date.now();
  await page.goto('http://localhost:4179/?debug');
  await page.waitForFunction(() => window.__stryde?.flow?.state === 'menu', null, { timeout: 60000 });
  console.log('loaded in', Date.now() - t0, 'ms');
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${out}/menu.png` });
  const views = process.argv.slice(3);
  if (views.length) await page.addStyleTag({ content: '#root > *:not(canvas){display:none!important}' });
  for (const v of views) {
    const [level, x, y, z, yaw, pitch, name] = v.split(',');
    await page.evaluate(({ level, x, y, z, yaw, pitch }) => {
      const g = window.__stryde;
      g.showBackdrop(level);
      g.backdrop = null;
      g.debugFreeCam = true;
      const c = g.renderer.camera;
      c.position.set(+x, +y, +z);
      c.rotation.order = 'YXZ';
      c.rotation.set(+pitch * Math.PI / 180, +yaw * Math.PI / 180, 0);
      c.fov = 74; c.updateProjectionMatrix();
    }, { level, x, y, z, yaw, pitch });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${name ?? level}.png` });
  }
} finally {
  console.log(logs.slice(0, 20).join('\n'));
  await browser.close();
  server.kill();
}
