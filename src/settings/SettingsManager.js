import { createStore } from 'zustand/vanilla';
import { Storage } from './Storage.js';

export const FPS_CAPS = [60, 120, 144, 165, 240, 360, 0];

export const ACTIONS = [
  ['forward', 'Move forward'], ['back', 'Move back'], ['left', 'Strafe left'], ['right', 'Strafe right'],
  ['jump', 'Jump'], ['slide', 'Slide'], ['sprint', 'Sprint'], ['grapple', 'Grapple'],
  ['reelIn', 'Reel in'], ['reelOut', 'Reel out'], ['dash', 'Air dash'],
  ['restart', 'Restart course'], ['checkpoint', 'Back to checkpoint'], ['info', 'Course information'],
];

export const GRAPHICS_PRESETS = {
  performance: { resolutionScale: 0.85, shadows: 'low', ao: 'off', aa: 'fxaa', post: false, particles: 0.4, envFx: false },
  balanced: { resolutionScale: 1, shadows: 'medium', ao: 'off', aa: 'msaa', post: true, particles: 0.7, envFx: true },
  high: { resolutionScale: 1, shadows: 'high', ao: 'off', aa: 'msaa', post: true, particles: 1, envFx: true },
  ultra: { resolutionScale: 1, shadows: 'ultra', ao: 'gtao', aa: 'msaa', post: true, particles: 1, envFx: true },
};

export const DEFAULTS = Object.freeze({
  mouse: { sensitivity: 1.2, rawInput: true, invertY: false, dpi: 800 },
  // Left Ctrl is offered as a second slide binding, but C leads: Ctrl+W closes the tab on Windows and Linux.
  controls: {
    forward: ['KeyW'], back: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    jump: ['Space'], slide: ['KeyC', 'ControlLeft'], sprint: ['ShiftLeft'], grapple: ['Mouse2'],
    reelIn: ['Mouse0'], reelOut: ['KeyF'], dash: ['KeyQ'],
    restart: ['KeyR'], checkpoint: ['KeyT'], info: ['Tab'],
  },
  camera: { fov: 78, headBob: true, tilt: 1, landing: true, speedFov: true, shake: 0.6, reduceMotion: false, showViewmodel: true },
  graphics: {
    preset: 'high', ...GRAPHICS_PRESETS.high,
    showFps: false, showFrameTime: false, fpsCap: 0,
  },
  audio: { master: 0.8, movement: 0.8, ui: 0.6, ambient: 0.6 },
  gameplay: {
    crosshairStyle: 'cross', crosshairColor: 'auto', crosshairSize: 1,
    showSpeed: true, showState: false, showSplits: true, showHints: true,
    ghostEnabled: true, ghostOpacity: 0.45, autoRestart: false,
    alwaysSprint: true, grappleMode: 'hold',
    grappleAim: true, ledgeVault: true, autoHop: false, hopFeedback: false,
  },
});

const clone = (x) => JSON.parse(JSON.stringify(x));

/** Merges saved values over defaults, dropping unknown keys and wrong types, so old saves stay safe. */
export function sanitizeSettings(saved) {
  const out = clone(DEFAULTS);
  if (!saved || typeof saved !== 'object') return out;
  for (const section of Object.keys(out)) {
    const src = saved[section];
    if (!src || typeof src !== 'object') continue;
    for (const key of Object.keys(out[section])) {
      if (!(key in src)) continue;
      const def = out[section][key];
      const val = src[key];
      if (section === 'controls') {
        if (Array.isArray(val) && val.every((c) => typeof c === 'string')) out[section][key] = val.slice(0, 2);
      } else if (typeof val === typeof def) {
        out[section][key] = val;
      }
    }
  }
  return out;
}

export const settingsStore = createStore((set, get) => ({
  ...sanitizeSettings(Storage.get('settings')),

  /** Change one value. Graphics changes other than preset switch the preset label to custom. */
  update(section, key, value) {
    set((s) => {
      const next = { ...s[section], [key]: value };
      if (section === 'graphics' && key in GRAPHICS_PRESETS.high) next.preset = 'custom';
      return { [section]: next };
    });
    persist(get());
  },

  applyPreset(name) {
    const preset = GRAPHICS_PRESETS[name];
    if (!preset) return;
    set((s) => ({ graphics: { ...s.graphics, ...preset, preset: name } }));
    persist(get());
  },

  /** Rebind an action. Returns the action that lost this code, if any, so the UI can say so. */
  bind(action, slot, code) {
    const controls = clone(get().controls);
    let conflict = null;
    for (const [other, codes] of Object.entries(controls)) {
      if (other === action) continue;
      const at = codes.indexOf(code);
      if (at >= 0) {
        codes.splice(at, 1);
        conflict = other;
      }
    }
    const codes = controls[action];
    if (slot < codes.length) codes[slot] = code; else codes.push(code);
    controls[action] = [...new Set(codes)];
    set({ controls });
    persist(get());
    return conflict;
  },

  unbind(action, slot) {
    const controls = clone(get().controls);
    controls[action].splice(slot, 1);
    set({ controls });
    persist(get());
  },

  resetSection(section) {
    set({ [section]: clone(DEFAULTS[section]) });
    persist(get());
  },

  resetAll() {
    set(clone(DEFAULTS));
    persist(get());
  },
}));

function persist(state) {
  const out = {};
  for (const section of Object.keys(DEFAULTS)) out[section] = state[section];
  Storage.set('settings', out);
}

export const getSettings = () => settingsStore.getState();

/** Approximate physical sensitivity: centimetres of mouse travel for a full turn. */
export const cmPer360 = (sensitivity, dpi) => (360 / (sensitivity * 0.022 * dpi)) * 2.54;

export const codeLabel = (code) => {
  if (!code) return 'None';
  if (code.startsWith('Mouse')) return ['Left mouse', 'Middle mouse', 'Right mouse', 'Mouse 4', 'Mouse 5'][Number(code.slice(5))] ?? code;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names = { Space: 'Space', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Left Alt', AltRight: 'Right Alt', Tab: 'Tab', CapsLock: 'Caps Lock', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Backquote: '`' };
  return names[code] ?? code;
};
