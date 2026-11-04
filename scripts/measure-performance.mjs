// Measures real frame times in a real browser on this machine's GPU, per course and per preset.
// Vsync and the frame limiter are disabled so results show throughput rather than the display's rate.
// Usage: npm run build && node scripts/measure-performance.mjs [width] [height]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { arch, cpus, platform } from 'node:os';

const width = Number(process.argv[2] ?? 1920);
const height = Number(process.argv[3] ?? 1080);
const server = spawn('npx', ['vite', 'preview', '--port', '4182', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1200));
const browser = await chromium.launch({
  channel: 'chromium',
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--disable-frame-rate-limit', '--disable-gpu-vsync'],
});
const page = await browser.newPage({ viewport: { width, height } });
try {
  await page.goto('http://localhost:4182/?debug');
  await page.waitForFunction(() => window.__stryde?.flow?.state === 'menu', null, { timeout: 60000 });
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  console.log(`Viewport ${width}x${height}, device pixel ratio 1. ${platform()} ${arch()}, ${cpus()[0].model}. GPU: ${gpu}`);
  console.log('preset       course       view                 fps    avg ms  1% ms   max ms  draws  tris');

  const measure = async (level, view) => page.evaluate(async ({ level, view }) => {
    const g = window.__stryde;
    g.showBackdrop(level);
    g.backdrop = null;
    const c = g.renderer.camera;
    c.position.set(view[0], view[1], view[2]);
    c.rotation.order = 'YXZ';
    c.rotation.set((view[4] * Math.PI) / 180, (view[3] * Math.PI) / 180, 0);
    c.fov = 78;
    c.updateProjectionMatrix();
    await new Promise((r) => setTimeout(r, 500));
    const frames = [];
    let last = performance.now();
    await new Promise((resolve) => {
      const started = last;
      const step = () => {
        const now = performance.now();
        frames.push(now - last);
        last = now;
        if (now - started < 3000) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    const sorted = frames.slice(5).sort((a, b) => a - b);
    const n = sorted.length;
    const avg = sorted.reduce((a, b) => a + b, 0) / n;
    return {
      fps: 1000 / avg, avg, p99: sorted[Math.floor(n * 0.99)], max: sorted[n - 1],
      calls: g.renderer.stats.calls, tris: g.renderer.stats.triangles,
    };
  }, { level, view });

  const views = [
    ['initiation', 'start terrace', [0, 1.6, -2, 0, 0]],
    ['vertical', 'tower canyon', [0, 1.6, -60, 0, 6]],
    ['pendulum', 'open void', [0, 1.6, -230, 0, 12]],
    ['flow', 'ribbon', [53, 1, -500, 0, -6]],
    ['ascent', 'spire approach', [2, -12, -170, 0, 8]],
    ['commons', 'plaza', [0, 1.6, 30, 0, 6]],
  ];
  for (const preset of ['performance', 'balanced', 'high', 'ultra']) {
    await page.evaluate((name) => window.__strydeSettings.getState().applyPreset(name), preset);
    await page.waitForTimeout(600);
    for (const [level, name, view] of views) {
      const r = await measure(level, view);
      console.log(`${preset.padEnd(12)} ${level.padEnd(12)} ${name.padEnd(20)} ${r.fps.toFixed(0).padStart(4)}  ${r.avg.toFixed(2).padStart(6)}  ${r.p99.toFixed(2).padStart(6)}  ${r.max.toFixed(1).padStart(6)}  ${String(r.calls).padStart(5)}  ${r.tris}`);
    }
  }
} finally {
  await browser.close();
  server.kill();
}
