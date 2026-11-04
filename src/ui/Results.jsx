import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { appStore } from '../core/appStore.js';
import { COURSE_ORDER, getLevel } from '../levels/LevelManager.js';
import { formatTime } from '../timing/RunTimer.js';
import { reduceMotion, useKeyDown, useScreenIn } from './shared.jsx';

/** Speed against time from this run's own samples, with checkpoint times marked on it. */
function SpeedTrace({ trace, splits, time }) {
  const ref = useRef(null);
  const W = 640, H = 92;
  const max = useMemo(() => Math.max(20, ...trace) * 1.06, [trace]);
  const dt = 0.1;
  const line = useMemo(() => trace.map((s, i) => `${((i * dt) / time * W).toFixed(1)},${(H - (s / max) * H).toFixed(1)}`).join(' '), [trace, max, time]);
  useLayoutEffect(() => {
    if (!ref.current || reduceMotion()) return undefined;
    const el = ref.current;
    const length = el.getTotalLength();
    gsap.fromTo(el, { strokeDasharray: length, strokeDashoffset: length }, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.out', delay: 0.15 });
    return () => gsap.killTweensOf(el);
  }, [line]);
  if (!trace.length) return null;
  return (
    <figure className="m-0">
      <svg viewBox={`0 -2 ${W} ${H + 6}`} className="w-full h-auto block" aria-hidden="true">
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--ink-faint)" />
        {splits.map((t, i) => (t === null || t === undefined ? null : (
          <line key={i} x1={(t / time) * W} x2={(t / time) * W} y1="0" y2={H} stroke="var(--ink-faint)" strokeWidth="1.4" strokeDasharray="3 4" />
        )))}
        <polyline ref={ref} points={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <figcaption className="stat-label num mt-1">Speed over the run, peak {result2(max / 1.06)} m/s. Dashed lines are checkpoints.</figcaption>
    </figure>
  );
}
const result2 = (v) => v.toFixed(1);

export function Results({ game, result }) {
  const ref = useScreenIn();
  const set = appStore.getState().set;
  const level = getLevel(result.levelId);
  const nextId = COURSE_ORDER[COURSE_ORDER.indexOf(result.levelId) + 1];

  useEffect(() => { game.audio.ensure(); }, []);

  const retry = () => { game.audio.uiConfirm(); game.lockFromGesture(); game.restart(); };
  const next = () => { game.audio.uiConfirm(); game.startCourse(nextId, result.mode); };

  useKeyDown((e) => { if (e.code === 'KeyR') retry(); }, []);

  const delta = result.previousBest !== null && result.previousBest !== undefined ? result.time - result.previousBest : null;
  const refDelta = level.referenceTime ? result.time - level.referenceTime : null;
  const prevSplits = result.previousRun?.splits;

  const rows = [
    ['Peak speed', `${result.peakSpeed.toFixed(1)} m/s`],
    ['Average speed', `${result.averageSpeed.toFixed(1)} m/s`],
    ['Grapples', result.grapples],
    ['Air dashes', result.dashes],
    ['Wall runs', result.wallRuns],
    ['Falls and resets', result.deaths],
  ];

  return (
    <div ref={ref} className="overlay-pane">
      <div className="overlay-side scroll">
        <p data-in className="font-medium">{result.levelName}, course finished</p>
        <div data-in className="num mt-1 font-extrabold italic leading-none text-[clamp(3rem,10vh,5.8rem)]" style={{ fontStretch: '110%', letterSpacing: '-0.02em' }}>
          {formatTime(result.time)}
        </div>
        <p data-in className="mt-2 font-semibold text-[1.08rem] num">
          {result.isBest && delta !== null && `New personal best, ${formatTime(delta, { sign: true })}`}
          {result.isBest && delta === null && 'First finish. This is now your personal best.'}
          {!result.isBest && delta !== null && `${formatTime(delta, { sign: true })} against your best of ${formatTime(result.previousBest)}`}
        </p>
        {refDelta !== null && (
          <p data-in className="stat-label num">{refDelta <= 0 ? 'Faster than' : 'Behind'} the reference route by {formatTime(Math.abs(refDelta))}</p>
        )}
        {result.isBest && !result.ghostSaved && <p data-in className="stat-label mt-1">This run was too long or storage was full, so no ghost was saved.</p>}

        <div data-in className="mt-5"><SpeedTrace trace={result.speedTrace} splits={result.splits} time={result.time} /></div>

        <div data-in className="grid grid-cols-3 gap-x-6 gap-y-3 mt-5">
          {rows.map(([k, v]) => (
            <div key={k}>
              <div className="stat-label">{k}</div>
              <div className="stat-value num">{v}</div>
            </div>
          ))}
        </div>

        {result.splits.length > 0 && (
          <table data-in className="mt-5 w-full max-w-[28rem] num text-[0.95rem]">
            <thead>
              <tr className="stat-label text-left"><th className="font-medium pb-1">Checkpoint</th><th className="font-medium pb-1 text-right">Time</th><th className="font-medium pb-1 text-right">Against best run</th></tr>
            </thead>
            <tbody>
              {result.splits.map((t, i) => {
                const prev = prevSplits?.[i];
                const d = t !== null && t !== undefined && prev !== null && prev !== undefined ? t - prev : null;
                return (
                  <tr key={i} className="border-t border-[var(--ink-faint)]">
                    <td className="py-1">{i + 1}</td>
                    <td className="py-1 text-right font-medium">{t !== null && t !== undefined ? formatTime(t) : 'Skipped'}</td>
                    <td className="py-1 text-right" style={{ color: d === null ? undefined : d <= 0 ? 'var(--color-gain)' : 'var(--color-loss)' }}>{d === null ? '' : formatTime(d, { sign: true })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div data-in className="flex flex-wrap gap-3 mt-7 pb-4">
          <button className="action" onClick={retry} autoFocus>Run it again <span className="kbd">R</span></button>
          {nextId && <button className="action quiet" onClick={next}>Next: {getLevel(nextId).name}</button>}
          <button className="action quiet" onClick={() => { game.audio.uiBack(); const mode = result.mode; game.exitToMenu(); set({ screen: 'levels', levelMode: mode }); }}>Choose course</button>
          <button className="action quiet" onClick={() => { game.audio.uiBack(); game.exitToMenu(); }}>Main menu</button>
        </div>
      </div>
    </div>
  );
}
