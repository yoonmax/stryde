import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import gsap from 'gsap';
import { appStore } from '../core/appStore.js';
import { settingsStore } from '../settings/SettingsManager.js';
import { statsStore } from '../stats/StatsStore.js';

const selectFrom = (store) => (selector) => {
  const get = () => selector(store.getState());
  return useSyncExternalStore(store.subscribe, get, get);
};
export const useApp = selectFrom(appStore);
export const useSettings = selectFrom(settingsStore);
export const useStats = selectFrom(statsStore);

export const reduceMotion = () => settingsStore.getState().camera.reduceMotion
  || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Screen entrance: one short, consistent move for anything tagged data-in. Answers navigation, so it
 * has a reason to exist. Skipped when the player has asked for less motion.
 */
export function useScreenIn(deps = []) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!ref.current || reduceMotion()) return undefined;
    const ctx = gsap.context(() => {
      gsap.from('[data-in]', { x: -18, autoAlpha: 0, duration: 0.42, ease: 'power3.out', stagger: 0.028 });
    }, ref);
    return () => ctx.revert();
  }, deps);
  return ref;
}

export function Wordmark({ reveal = false, className = '' }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!reveal || !ref.current || reduceMotion()) return undefined;
    const ctx = gsap.context(() => {
      gsap.fromTo('.wm-clip rect', { attr: { width: 0 } }, { attr: { width: 1000 }, duration: 1.05, ease: 'expo.inOut' });
    }, ref);
    return () => ctx.revert();
  }, [reveal]);
  // The full-width slit through the letters lines up with the idea of a horizon: a speed cut.
  return (
    <svg ref={ref} className={`wordmark ${className}`} viewBox="0 0 1000 178" role="img" aria-label="STRYDE">
      <defs>
        <clipPath id="wm-clip" className="wm-clip"><rect x="-20" y="-20" width="1060" height="240" /></clipPath>
        <mask id="wm-slit">
          <rect x="-20" y="-20" width="1060" height="240" fill="#fff" />
          <polygon points="-20,108 1030,92 1030,97 -20,114" fill="#000" />
        </mask>
      </defs>
      <g clipPath="url(#wm-clip)">
        <g mask="url(#wm-slit)">
          <text x="500" y="165" textAnchor="middle" textLength="990" lengthAdjust="spacingAndGlyphs" fontSize="214" fill="currentColor">STRYDE</text>
        </g>
      </g>
    </svg>
  );
}

export function useKeyDown(handler, deps = []) {
  useEffect(() => {
    const h = (e) => handler(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, deps);
}

export function Back({ onClick, label = 'Back', game }) {
  return (
    <button className="backlink" onClick={() => { game?.audio.ensure(); game?.audio.uiBack(); onClick(); }}>
      {label}
    </button>
  );
}

export const useToggle = (initial = false) => useState(initial);
