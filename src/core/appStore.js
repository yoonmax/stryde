import { createStore } from 'zustand/vanilla';

/** UI-facing application state. React reads this; the simulation never does. */
export const appStore = createStore((set) => ({
  screen: 'loading',           // loading | menu | levels | settings | stats | about | game
  levelMode: 'play',           // play | trial
  flow: 'loading',             // mirrors GameFlow
  loadStage: '',
  loadProgress: 0,
  loadError: null,
  result: null,
  showCourseInfo: false,
  lockFailed: false,
  settingsFrom: 'menu',
  currentLevelId: null,
  currentMode: null,
  fading: false,
  set: (patch) => set(patch),
}));
