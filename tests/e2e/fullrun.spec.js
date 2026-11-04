import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { installFeed } from './feed.js';

const route = (id) => JSON.parse(readFileSync(new URL(`./fixtures/${id}.inputs.json`, import.meta.url)));

test.describe('whole runs through the real game loop', () => {
  for (const [id, name] of [['initiation', 'INITIATION'], ['pendulum', 'PENDULUM']]) {
    test(`${name}: recorded inputs finish at the same time the headless simulation did`, async ({ page }) => {
      test.setTimeout(150000);
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const { time, inputs } = route(id);

      await page.goto('/?debug');
      await page.waitForFunction(() => window.__stryde?.flow?.state === 'menu', null, { timeout: 60000 });
      await page.getByRole('button', { name: /^TIME TRIALS/ }).click();
      await page.getByRole('option', { name: new RegExp(name) }).click();
      await page.getByRole('button', { name: /^Start/ }).click();
      await page.waitForFunction(() => window.__stryde.flow.state === 'countdown');
      await installFeed(page, inputs);

      await expect(page.getByText('course finished')).toBeVisible({ timeout: (time + 20) * 1000 });
      const result = await page.evaluate(() => window.__stryde.sim.result);
      // Rendering at whatever rate this machine manages must not change the outcome.
      expect(Math.abs(result.time - time)).toBeLessThan(0.002);
      expect(result.deaths).toBe(0);
      expect(errors).toEqual([]);

      const saved = await page.evaluate((levelId) => ({
        ghost: localStorage.getItem(`stryde.v1.replay.${levelId}`)?.length ?? 0,
        best: JSON.parse(localStorage.getItem('stryde.v1.stats')).courses[levelId].best,
      }), id);
      expect(saved.best).toBeCloseTo(result.time, 3);
      expect(saved.ghost).toBeGreaterThan(1000);
      expect(saved.ghost).toBeLessThan(512 * 1024);
    });
  }

  test('a run against a saved ghost renders every frame', async ({ page }) => {
    test.setTimeout(150000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const { inputs } = route('initiation');
    await page.goto('/?debug');
    await page.waitForFunction(() => window.__stryde?.flow?.state === 'menu', null, { timeout: 60000 });
    await page.getByRole('button', { name: /^TIME TRIALS/ }).click();
    await page.getByRole('button', { name: /^Start/ }).click();
    await page.waitForFunction(() => window.__stryde.flow.state === 'countdown');
    await installFeed(page, inputs);
    await expect(page.getByText('course finished')).toBeVisible({ timeout: 60000 });

    await page.waitForTimeout(1400);
    await page.getByRole('button', { name: /Run it again/ }).click();
    await page.waitForFunction(() => window.__stryde.flow.state === 'countdown');
    await installFeed(page, inputs, 70);
    await page.waitForFunction(() => window.__stryde.sim.player.pos.z < -40, null, { timeout: 30000 });
    expect(await page.evaluate(() => window.__stryde.renderer.ghost.group.visible || !!window.__stryde.ghostPlayer)).toBe(true);

    // A NaN in any material spreads through bloom and blanks the whole frame, so look at real pixels.
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(1500);
      const distinct = await page.evaluate(async () => {
        const c = document.querySelector('canvas');
        await new Promise((r) => requestAnimationFrame(r));
        const img = await createImageBitmap(c);
        const off = new OffscreenCanvas(64, 36);
        const ctx = off.getContext('2d');
        ctx.drawImage(img, 0, 0, 64, 36);
        const d = ctx.getImageData(0, 0, 64, 36).data;
        const seen = new Set();
        for (let k = 0; k < d.length; k += 4) seen.add(`${d[k] >> 3},${d[k + 1] >> 3},${d[k + 2] >> 3}`);
        return seen.size;
      });
      expect(distinct).toBeGreaterThan(6);
    }
    expect(errors).toEqual([]);
  });
});
