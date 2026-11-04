import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PlayerInput } from '../../src/player/PlayerInput.js';
import { DEFAULTS, settingsStore, getSettings } from '../../src/settings/SettingsManager.js';

/** A minimal browser event surface, enough to drive the real input class without a DOM library. */
function installBrowserStubs() {
  const win = new EventTarget();
  const doc = new EventTarget();
  doc.pointerLockElement = null;
  doc.exitPointerLock = () => { doc.pointerLockElement = null; doc.dispatchEvent(new Event('pointerlockchange')); };
  globalThis.window = win;
  globalThis.document = doc;
  return { win, doc };
}

const key = (type, code, repeat = false) => {
  const e = new Event(type, { cancelable: true });
  e.code = code;
  e.repeat = repeat;
  return e;
};
const button = (type, b) => { const e = new Event(type, { cancelable: true }); e.button = b; return e; };
const move = (x, y) => { const e = new Event('mousemove'); e.movementX = x; e.movementY = y; return e; };

describe('player input', () => {
  let win, doc, element, input, lockChanges, actions;

  beforeEach(() => {
    settingsStore.getState().resetAll();
    ({ win, doc } = installBrowserStubs());
    lockChanges = [];
    actions = [];
    element = {
      requestPointerLock: async (opts) => {
        if (element.rejectRaw && opts?.unadjustedMovement) throw new Error('unsupported');
        if (element.rejectAll) throw new Error('denied');
        doc.pointerLockElement = element;
        doc.dispatchEvent(new Event('pointerlockchange'));
      },
    };
    input = new PlayerInput(element, {
      getSettings,
      onLockChange: (l) => lockChanges.push(l),
      onAction: (a, d) => actions.push([a, d]),
    });
    input.enabled = true;
  });

  afterEach(() => {
    input.dispose();
    delete globalThis.window;
    delete globalThis.document;
  });

  it('maps keys through the configured bindings', () => {
    win.dispatchEvent(key('keydown', 'KeyW'));
    win.dispatchEvent(key('keydown', 'KeyD'));
    const i = input.sampleTick();
    expect(i.forward).toBe(1);
    expect(i.strafe).toBe(1);
    win.dispatchEvent(key('keydown', 'KeyS'));
    expect(input.sampleTick().forward).toBe(0);
  });

  it('honours a rebind straight away', () => {
    settingsStore.getState().bind('jump', 0, 'KeyV');
    input.rebuildBindings();
    win.dispatchEvent(key('keydown', 'KeyV'));
    expect(input.sampleTick().jump).toBe(true);
  });

  it('delivers an edge to exactly one tick, even if several run in a frame', () => {
    win.dispatchEvent(key('keydown', 'Space'));
    expect(input.sampleTick().jumpPressed).toBe(true);
    const second = input.sampleTick();
    expect(second.jumpPressed).toBe(false);
    expect(second.jump).toBe(true);
  });

  it('keeps a press that was released between two ticks', () => {
    win.dispatchEvent(key('keydown', 'KeyQ'));
    win.dispatchEvent(key('keyup', 'KeyQ'));
    expect(input.sampleTick().dashPressed).toBe(true);
  });

  it('ignores auto-repeat', () => {
    win.dispatchEvent(key('keydown', 'Space'));
    input.sampleTick();
    win.dispatchEvent(key('keydown', 'Space', true));
    expect(input.sampleTick().jumpPressed).toBe(false);
  });

  it('stops the browser acting on game keys such as Tab and Space', () => {
    const e = key('keydown', 'Tab');
    win.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    const other = key('keydown', 'F5');
    win.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
  });

  it('leaves the keyboard alone while disabled, as on menus', () => {
    input.enabled = false;
    const e = key('keydown', 'Tab');
    win.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });

  it('requires pointer lock for mouse buttons and look', async () => {
    win.dispatchEvent(button('mousedown', 2));
    expect(input.sampleTick().grapple).toBe(false);
    doc.dispatchEvent(move(100, 0));
    expect(input.yaw).toBe(0);
    await input.requestLock();
    win.dispatchEvent(button('mousedown', 2));
    const i = input.sampleTick();
    expect(i.grapple).toBe(true);
    expect(i.grapplePressed).toBe(true);
  });

  it('applies look linearly: no smoothing and no acceleration', async () => {
    await input.requestLock();
    const s = getSettings().mouse.sensitivity;
    doc.dispatchEvent(move(100, 0));
    const one = input.yaw;
    expect(one).toBeCloseTo(-100 * s * (0.022 * Math.PI) / 180, 8);
    doc.dispatchEvent(move(1000, 0));
    expect(input.yaw).toBeCloseTo(one * 11, 8);
  });

  it('inverts vertical look when asked', async () => {
    await input.requestLock();
    doc.dispatchEvent(move(0, 100));
    const normal = input.pitch;
    expect(normal).toBeLessThan(0);
    input.setLook(0, 0);
    settingsStore.getState().update('mouse', 'invertY', true);
    doc.dispatchEvent(move(0, 100));
    expect(input.pitch).toBeCloseTo(-normal, 8);
  });

  it('clamps pitch', async () => {
    await input.requestLock();
    doc.dispatchEvent(move(0, -100000));
    expect(input.pitch).toBeLessThanOrEqual((89 * Math.PI) / 180 + 1e-9);
    doc.dispatchEvent(move(0, 100000));
    expect(input.pitch).toBeGreaterThanOrEqual((-89 * Math.PI) / 180 - 1e-9);
  });

  it('prefers raw input and falls back when it is unsupported', async () => {
    await input.requestLock();
    expect(input.rawActive).toBe(true);
    doc.exitPointerLock();
    element.rejectRaw = true;
    expect(await input.requestLock()).toBe(true);
    expect(input.rawActive).toBe(false);
  });

  it('reports failure when the browser denies the pointer', async () => {
    element.rejectAll = true;
    expect(await input.requestLock()).toBe(false);
  });

  it('escaping pointer lock drops held keys and reports it', async () => {
    await input.requestLock();
    win.dispatchEvent(key('keydown', 'KeyW'));
    doc.exitPointerLock();
    expect(lockChanges).toEqual([true, false]);
    expect(input.sampleTick().forward).toBe(0);
  });

  it('losing focus drops held keys, since their keyups will never arrive', () => {
    win.dispatchEvent(key('keydown', 'KeyW'));
    win.dispatchEvent(key('keydown', 'Space'));
    win.dispatchEvent(new Event('blur'));
    const i = input.sampleTick();
    expect(i.forward).toBe(0);
    expect(i.jump).toBe(false);
    expect(i.jumpPressed).toBe(false);
  });

  it('supports a toggle grapple', async () => {
    await input.requestLock();
    settingsStore.getState().update('gameplay', 'grappleMode', 'toggle');
    win.dispatchEvent(button('mousedown', 2));
    win.dispatchEvent(button('mouseup', 2));
    let i = input.sampleTick();
    expect(i.grapple).toBe(true);
    expect(i.grapplePressed).toBe(true);
    i = input.sampleTick();
    expect(i.grapple).toBe(true);
    expect(i.grapplePressed).toBe(false);
    win.dispatchEvent(button('mousedown', 2));
    win.dispatchEvent(button('mouseup', 2));
    expect(input.sampleTick().grapple).toBe(false);
  });

  it('always-sprint and hold-to-sprint both work', () => {
    settingsStore.getState().update('gameplay', 'alwaysSprint', false);
    expect(input.sampleTick().sprint).toBe(false);
    win.dispatchEvent(key('keydown', 'ShiftLeft'));
    expect(input.sampleTick().sprint).toBe(true);
    settingsStore.getState().update('gameplay', 'alwaysSprint', true);
    win.dispatchEvent(key('keyup', 'ShiftLeft'));
    expect(input.sampleTick().sprint).toBe(true);
  });

  it('routes restart and info to the game once per press', () => {
    win.dispatchEvent(key('keydown', 'KeyR'));
    win.dispatchEvent(key('keydown', 'KeyR', true));
    win.dispatchEvent(key('keydown', 'Tab'));
    win.dispatchEvent(key('keyup', 'Tab'));
    expect(actions).toEqual([['restart', true], ['info', true], ['info', false]]);
  });

  it('defaults include the briefed controls', () => {
    const c = DEFAULTS.controls;
    expect(c.forward).toContain('KeyW');
    expect(c.grapple).toContain('Mouse2');
    expect(c.dash).toContain('KeyQ');
    expect(c.restart).toContain('KeyR');
    expect(c.slide).toEqual(expect.arrayContaining(['KeyC', 'ControlLeft']));
  });
});
