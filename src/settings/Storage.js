/**
 * Safe localStorage. Private windows and full quotas must never crash the game, so every access is
 * guarded, and failures fall back to an in-memory map for the session.
 */
const memory = new Map();
const PREFIX = 'stryde.v1.';

const backend = () => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export const Storage = {
  get(key, fallback = null) {
    try {
      const raw = backend()?.getItem(PREFIX + key);
      if (raw === null || raw === undefined) return memory.has(key) ? memory.get(key) : fallback;
      return JSON.parse(raw);
    } catch {
      return memory.has(key) ? memory.get(key) : fallback;
    }
  },
  set(key, value) {
    memory.set(key, value);
    try {
      backend()?.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  getRaw(key) {
    try {
      const raw = backend()?.getItem(PREFIX + key);
      if (raw !== null && raw !== undefined) return raw;
    } catch { /* fall through to memory */ }
    return memory.get(key) ?? null;
  },
  setRaw(key, value) {
    memory.set(key, value);
    try {
      backend()?.setItem(PREFIX + key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    memory.delete(key);
    try { backend()?.removeItem(PREFIX + key); } catch { /* nothing to do */ }
  },
  clearAll() {
    memory.clear();
    try {
      const b = backend();
      if (!b) return;
      const keys = [];
      for (let i = 0; i < b.length; i++) {
        const k = b.key(i);
        if (k?.startsWith(PREFIX)) keys.push(k);
      }
      keys.forEach((k) => b.removeItem(k));
    } catch { /* nothing to do */ }
  },
};
