import { test, expect } from '@playwright/test';

const ready = async (page, url = '/?debug') => {
  await page.goto(url);
  await page.waitForFunction(() => window.__stryde?.flow?.state === 'menu', null, { timeout: 60000 });
  await expect(page.getByRole('button', { name: /^PLAY/ })).toBeVisible();
};

const errorsOf = (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
};

const state = (page) => page.evaluate(() => {
  const g = window.__stryde;
  const p = g.sim?.player;
  return {
    flow: g.flow.state,
    mode: g.mode,
    locked: !!document.pointerLockElement,
    time: g.sim?.timer.elapsed,
    z: p?.pos.z, y: p?.pos.y, speed: p ? Math.hypot(p.vel.x, p.vel.z) : 0,
    loco: p?.machine.state,
    attached: p?.grapple.attached,
    deaths: g.sim?.deaths,
  };
});

/** Chrome refuses a new lock for about a second after one ends. */
const LOCK_COOLDOWN = 1400;

test.describe('STRYDE in a real browser', () => {
  test('loads to a working menu with no errors', async ({ page }) => {
    const errors = errorsOf(page);
    await ready(page);
    for (const name of ['PLAY', 'FREE RUN', 'TIME TRIALS', 'SETTINGS', 'STATISTICS', 'ABOUT']) {
      await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
    }
    await expect(page.getByRole('img', { name: 'STRYDE' }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('every menu item goes somewhere and comes back', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: /^SETTINGS/ }).click();
    await expect(page.getByRole('heading', { name: 'SETTINGS' })).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: /^STATISTICS/ }).click();
    await expect(page.getByRole('heading', { name: 'STATISTICS' })).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: /^ABOUT/ }).click();
    await expect(page.getByRole('heading', { name: 'ABOUT' })).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: /^TIME TRIALS/ }).click();
    await expect(page.getByRole('heading', { name: 'TIME TRIALS' })).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: /^PLAY/ }).click();
    await expect(page.getByRole('heading', { name: 'PLAY' })).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(5);
  });

  test('plays with real pointer lock: countdown, run, jump, look', async ({ page }) => {
    const errors = errorsOf(page);
    await ready(page);
    await page.getByRole('button', { name: /^PLAY/ }).click();
    await page.getByRole('button', { name: /^Start/ }).click();
    await page.waitForFunction(() => window.__stryde.flow.state === 'playing', null, { timeout: 15000 });
    const s0 = await state(page);
    expect(s0.locked).toBe(true);

    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1200);
    const s1 = await state(page);
    expect(s1.z).toBeLessThan(s0.z - 4);
    expect(s1.speed).toBeGreaterThan(9);

    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    expect((await state(page)).y).toBeGreaterThan(0.2);
    await page.keyboard.up('KeyW');

    const yaw0 = await page.evaluate(() => window.__stryde.input.yaw);
    await page.mouse.move(800, 300);
    await page.mouse.move(900, 300);
    const yaw1 = await page.evaluate(() => window.__stryde.input.yaw);
    expect(yaw1).not.toBe(yaw0);
    expect(errors).toEqual([]);
  });

  test('A and D steer in the air with real key presses', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: /^PLAY/ }).click();
    await page.getByRole('button', { name: /^Start/ }).click();
    await page.waitForFunction(() => window.__stryde.flow.state === 'playing', null, { timeout: 15000 });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyW');
    await page.keyboard.down('Space');
    const x0 = await page.evaluate(() => window.__stryde.sim.player.pos.x);
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(450);
    const s = await page.evaluate(() => {
      const p = window.__stryde.sim.player;
      return { x: p.pos.x, vx: p.vel.x, air: p.machine.airborne };
    });
    await page.keyboard.up('KeyA');
    await page.keyboard.up('Space');
    expect(s.air).toBe(true);
    expect(s.x).toBeLessThan(x0 - 1);
    expect(s.vx).toBeLessThan(-4);
  });

  test('tapping A then D in the air flips sideways velocity with real key events', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: /^PLAY/ }).click();
    await page.getByRole('button', { name: /^Start/ }).click();
    await page.waitForFunction(() => window.__stryde.flow.state === 'playing', null, { timeout: 15000 });
    await page.evaluate(() => {
      window.__stryde.sim.player.teleport({ x: 0, y: 60, z: -20 }, 0);
      window.__strafeTrace = { min: 0, max: 0 };
      const trace = () => {
        const g = window.__stryde;
        if (!g.sim) return;
        const vx = g.sim.player.vel.x;
        window.__strafeTrace.min = Math.min(window.__strafeTrace.min, vx);
        window.__strafeTrace.max = Math.max(window.__strafeTrace.max, vx);
        requestAnimationFrame(trace);
      };
      trace();
    });
    for (const code of ['KeyA', 'KeyD', 'KeyA', 'KeyD']) {
      await page.keyboard.down(code);
      await page.waitForTimeout(110);
      await page.keyboard.up(code);
    }
    const t = await page.evaluate(() => window.__strafeTrace);
    expect(t.min).toBeLessThan(-5);
    expect(t.max).toBeGreaterThan(5);
  });

  test('grapples with the right mouse button and keeps speed on release', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: /^PLAY/ }).click();
    await page.getByRole('button', { name: /^Start/ }).click();
    await page.waitForFunction(() => window.__stryde.flow.state === 'playing');
    await page.evaluate(() => {
      const g = window.__stryde;
      g.sim.player.teleport({ x: 0, y: 40, z: -232 }, 0);
      const e = g.sim.player.eye();
      g.input.setLook(0, Math.atan2(14 - e.y, 24));
    });
    await page.waitForTimeout(60);
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(700);
    expect((await state(page)).attached).toBe(true);
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => window.__stryde.sim.player.vel.z);
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(60);
    const s = await state(page);
    const after = await page.evaluate(() => window.__stryde.sim.player.vel.z);
    expect(s.attached).toBe(false);
    expect(Math.abs(after - before)).toBeLessThan(Math.abs(before) * 0.5 + 3);
  });

  test('Escape-style lock loss pauses, the clock stops, and Resume recovers', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: /^PLAY/ }).click();
    await page.getByRole('button', { name: /^Start/ }).click();
    await page.waitForFunction(() => window.__stryde.flow.state === 'playing');
    await page.waitForTimeout(300);
    await page.evaluate(() => document.exitPointerLock());
    await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible();
    const t0 = (await state(page)).time;
    await page.waitForTimeout(LOCK_COOLDOWN);
    expect((await state(page)).time).toBe(t0);

    await page.getByRole('button', { name: 'Resume' }).click();
    await page.waitForFunction(() => window.__stryde.flow.state === 'playing');
    await page.waitForTimeout(250);
    const s = await state(page);
    expect(s.locked).toBe(true);
    expect(s.time).toBeGreaterThan(t0);
    expect(s.time - t0).toBeLessThan(1);
  });

  test('losing window focus pauses', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: /^PLAY/ }).click();
    await page.getByRole('button', { name: /^Start/ }).click();
    await page.waitForFunction(() => window.__stryde.flow.state === 'playing');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible();
  });

  test('restart is instant and leaves no state behind', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: /^PLAY/ }).click();
    await page.getByRole('button', { name: /^Start/ }).click();
    await page.waitForFunction(() => window.__stryde.flow.state === 'playing');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyW');
    await page.keyboard.press('KeyR');
    const s = await state(page);
    expect(s.flow).toBe('countdown');
    expect(s.time).toBe(0);
    expect(s.z).toBeCloseTo(0.05, 0);
  });

  test('falling respawns at the start without a reload', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: /^PLAY/ }).click();
    await page.getByRole('button', { name: /^Start/ }).click();
    await page.waitForFunction(() => window.__stryde.flow.state === 'playing');
    await page.evaluate(() => { window.__stryde.sim.player.pos.y = -54.9; window.__stryde.sim.player.pos.x = 900; });
    await page.waitForFunction(() => window.__stryde.sim.deaths === 1, null, { timeout: 5000 });
    const s = await state(page);
    expect(s.y).toBeGreaterThan(-2);
    expect(s.flow).toBe('playing');
  });

  test('a finished run saves a best, a ghost, statistics, and shows real results', async ({ page }) => {
    const errors = errorsOf(page);
    await ready(page);
    await page.getByRole('button', { name: /^TIME TRIALS/ }).click();
    await page.getByRole('button', { name: /^Start/ }).click();
    await page.waitForFunction(() => window.__stryde.flow.state === 'playing');
    // Walk the player through every gate in order, a tick at a time, as the movement code would.
    await page.keyboard.down('KeyW');
    await page.evaluate(async () => {
      const g = window.__stryde;
      const p = g.sim.player;
      const zones = [...g.level.checkpoints, g.level.finishZone];
      for (const z of zones) {
        p.teleport({ x: z.center.x, y: z.center.y - z.half.y + 0.1, z: z.center.z }, 0);
        await new Promise((r) => setTimeout(r, 300));
      }
    });
    await expect(page.getByText('course finished')).toBeVisible({ timeout: 15000 });
    await page.keyboard.up('KeyW');
    await expect(page.getByText('First finish')).toBeVisible();
    const saved = await page.evaluate(() => ({
      stats: JSON.parse(localStorage.getItem('stryde.v1.stats')),
      ghost: !!localStorage.getItem('stryde.v1.replay.initiation'),
    }));
    expect(saved.ghost).toBe(true);
    expect(saved.stats.courses.initiation.best).toBeGreaterThan(0);
    expect(saved.stats.completedRuns).toBe(1);

    // The next run loads that ghost, and the same page survives a reload.
    await page.waitForTimeout(LOCK_COOLDOWN);
    await page.getByRole('button', { name: /Run it again/ }).click();
    await page.waitForFunction(() => window.__stryde.flow.state === 'playing');
    const ghost = await page.evaluate(() => !!window.__stryde.ghostPlayer && window.__stryde.ghostPlayer.replay.count > 0);
    expect(ghost).toBe(true);
    expect(errors).toEqual([]);
  });

  test('settings persist across a reload and rebinding works', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: /^SETTINGS/ }).click();
    await page.getByRole('switch', { name: 'Invert vertical look' }).click();
    await page.getByRole('button', { name: 'Controls' }).click();
    await page.getByRole('button', { name: 'Q', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Press a key' })).toBeVisible();
    await page.keyboard.press('KeyE');
    await expect(page.getByRole('status').filter({ hasText: 'Air dash is now E' })).toBeVisible();
    await page.getByRole('button', { name: 'Graphics' }).click();
    await page.getByRole('button', { name: 'Performance' }).click();
    await page.reload();
    await page.waitForFunction(() => window.__stryde?.flow?.state === 'menu', null, { timeout: 60000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stryde.v1.settings')));
    expect(saved.mouse.invertY).toBe(true);
    expect(saved.controls.dash).toEqual(['KeyE']);
    expect(saved.graphics.preset).toBe('performance');
  });

  test('every graphics option rebuilds cleanly at runtime', async ({ page }) => {
    const errors = errorsOf(page);
    await ready(page);
    await page.getByRole('button', { name: /^SETTINGS/ }).click();
    await page.getByRole('button', { name: 'Graphics' }).click();
    for (const preset of ['Performance', 'Balanced', 'Ultra', 'High']) {
      await page.getByRole('group', { name: 'Preset' }).getByRole('button', { name: preset }).click();
      await page.waitForTimeout(400);
    }
    for (const label of ['Off', 'Low', 'Medium']) {
      await page.getByRole('group', { name: 'Shadow quality' }).getByRole('button', { name: label }).click();
      await page.waitForTimeout(200);
    }
    await page.getByRole('group', { name: 'Antialiasing' }).getByRole('button', { name: 'FXAA' }).click();
    await page.waitForTimeout(250);
    await page.getByRole('group', { name: 'Frame rate cap' }).getByRole('button', { name: '120' }).click();
    expect(await page.evaluate(() => window.__stryde.loop.fpsCap)).toBe(120);
    expect(errors).toEqual([]);
  });

  test('all six environments load in the game with real shaders', async ({ page }) => {
    const errors = errorsOf(page);
    await ready(page);
    for (const id of ['vertical', 'pendulum', 'flow', 'ascent', 'commons', 'initiation']) {
      await page.evaluate((level) => window.__stryde.showBackdrop(level), id);
      await page.waitForTimeout(350);
    }
    expect(errors).toEqual([]);
  });

  test('free run starts with no timer, and pause offers practice areas', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: /^FREE RUN/ }).click();
    await page.waitForFunction(() => window.__stryde.flow.state === 'playing');
    expect((await state(page)).mode).toBe('free');
    await page.evaluate(() => document.exitPointerLock());
    await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible();
    await page.waitForTimeout(LOCK_COOLDOWN);
    await page.getByRole('button', { name: 'Skill line' }).click();
    await page.waitForFunction(() => window.__stryde.flow.state === 'playing');
    expect((await state(page)).z).toBeGreaterThan(200);
  });

  test('clearing saved data asks first and then really clears it', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => {
      localStorage.setItem('stryde.v1.stats', JSON.stringify({ completedRuns: 3, playtime: 10, courses: {} }));
    });
    await page.reload();
    await page.waitForFunction(() => window.__stryde?.flow?.state === 'menu', null, { timeout: 60000 });
    await page.getByRole('button', { name: /^STATISTICS/ }).click();
    await page.getByRole('button', { name: 'Clear saved data' }).click();
    await page.getByRole('button', { name: 'Keep my data' }).click();
    expect(await page.evaluate(() => localStorage.getItem('stryde.v1.stats'))).not.toBeNull();
    await page.getByRole('button', { name: 'Clear saved data' }).click();
    await page.getByRole('button', { name: 'Delete everything' }).click();
    expect(await page.evaluate(() => localStorage.getItem('stryde.v1.stats'))).toBeNull();
  });
});
