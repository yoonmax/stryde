import { createStore } from 'zustand/vanilla';
import { Storage } from '../settings/Storage.js';
import { decodeReplay, encodeReplay, MAX_REPLAY_BYTES } from '../replay/ReplayRecorder.js';

const empty = () => ({
  playtime: 0,
  completedRuns: 0,
  failedAttempts: 0,
  topSpeed: 0,
  grapples: 0,
  wallRuns: 0,
  dashes: 0,
  jumps: 0,
  distance: 0,
  courses: {},
});

const emptyCourse = () => ({
  best: null, bestRun: null, bestSplits: [], runs: 0, attempts: 0, bestPeak: 0, lastTime: null,
});

const load = () => {
  const saved = Storage.get('stats');
  if (!saved || typeof saved !== 'object') return empty();
  return { ...empty(), ...saved, courses: saved.courses ?? {} };
};

/**
 * Local progress. Everything here comes from actual gameplay events; nothing is seeded or estimated.
 */
export const statsStore = createStore((set, get) => ({
  ...load(),

  course(id) { return get().courses[id] ?? emptyCourse(); },

  /** Adds counters that accumulate during play, whether or not the run is ever finished. */
  addCounters(delta) {
    set((s) => ({
      playtime: s.playtime + (delta.playtime ?? 0),
      grapples: s.grapples + (delta.grapples ?? 0),
      wallRuns: s.wallRuns + (delta.wallRuns ?? 0),
      dashes: s.dashes + (delta.dashes ?? 0),
      jumps: s.jumps + (delta.jumps ?? 0),
      distance: s.distance + (delta.distance ?? 0),
      topSpeed: Math.max(s.topSpeed, delta.peak ?? 0),
    }));
  },

  noteAttempt(id) {
    set((s) => {
      const c = { ...emptyCourse(), ...s.courses[id] };
      c.attempts++;
      return { courses: { ...s.courses, [id]: c } };
    });
    save(get());
  },

  noteFailed() {
    set((s) => ({ failedAttempts: s.failedAttempts + 1 }));
    save(get());
  },

  /**
   * Records a finished run. @returns {{isBest:boolean, previousBest:number|null, bestSplits:number[]}}
   */
  recordFinish(result) {
    const id = result.levelId;
    const prior = { ...emptyCourse(), ...get().courses[id] };
    const previousBest = prior.best;
    const isBest = prior.best === null || result.time < prior.best;
    const c = { ...prior };
    c.runs++;
    c.lastTime = result.time;
    c.bestPeak = Math.max(c.bestPeak, result.peakSpeed);
    if (isBest) {
      c.best = result.time;
      c.bestRun = result;
    }
    // Fastest time at each checkpoint, independently of the best overall run.
    c.bestSplits = [...(prior.bestSplits ?? [])];
    result.splits.forEach((t, i) => {
      if (t === undefined || t === null) return;
      if (c.bestSplits[i] === undefined || c.bestSplits[i] === null || t < c.bestSplits[i]) c.bestSplits[i] = t;
    });
    set((s) => ({
      completedRuns: s.completedRuns + 1,
      courses: { ...s.courses, [id]: c },
    }));
    save(get());
    return { isBest, previousBest, bestRunBefore: prior.bestRun };
  },

  flush() { save(get()); },

  clearAll() {
    Storage.clearAll();
    set({ ...empty() });
  },
}));

function save(state) {
  const out = {};
  for (const k of Object.keys(empty())) out[k] = state[k];
  Storage.set('stats', out);
}

export const completedCount = (s) => Object.values(s.courses).filter((c) => c.runs > 0).length;

/** Saves a replay, refusing oversize ones. Local storage quota is small, so this is a real limit. */
export function saveBestReplay(levelId, replay) {
  try {
    const text = encodeReplay(replay);
    if (text.length > MAX_REPLAY_BYTES) return false;
    return Storage.setRaw(`replay.${levelId}`, text);
  } catch {
    return false;
  }
}

export function loadBestReplay(levelId) {
  const text = Storage.getRaw(`replay.${levelId}`);
  if (!text) return null;
  try {
    return decodeReplay(text);
  } catch {
    return null;
  }
}
