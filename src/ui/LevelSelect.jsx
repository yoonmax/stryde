import { useEffect, useMemo, useState } from 'react';
import { appStore } from '../core/appStore.js';
import { allCourses, elevationProfile } from '../levels/LevelManager.js';
import { useScreenIn, useStats, Back } from './shared.jsx';
import { formatTime } from '../timing/RunTimer.js';
import { loadBestReplay } from '../stats/StatsStore.js';

/** The course's actual route height over distance, drawn from level data. */
function ElevationLine({ level }) {
  const profile = useMemo(() => elevationProfile(level), [level]);
  const W = 640, H = 120;
  if (!profile.points.length) return null;
  const span = Math.max(profile.max - profile.min, 16);
  const mid = (profile.max + profile.min) / 2;
  const toX = (d) => (d / profile.length) * W;
  const toY = (y) => H / 2 - ((y - mid) / span) * (H - 18);
  const line = profile.points.map((p) => `${toX(p.d).toFixed(1)},${toY(p.y).toFixed(1)}`).join(' ');
  return (
    <figure className="m-0">
      <svg viewBox={`0 -6 ${W} ${H + 12}`} preserveAspectRatio="none" className="w-full block" style={{ height: 'clamp(40px, 11vh, 120px)' }} aria-hidden="true">
        <polygon points={`0,${H + 6} ${line} ${W},${H + 6}`} fill="rgba(10,26,44,0.09)" />
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="stat-label num mt-1">
        Route about {Math.round(profile.length)} m, {Math.round(profile.rise)} m of height change
      </figcaption>
    </figure>
  );
}

const Difficulty = ({ value }) => (
  <span className="inline-flex gap-[3px] align-middle" role="img" aria-label={`Difficulty ${value} of 5`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <span key={i} style={{ width: 16, height: 5, transform: 'skewX(-18deg)', background: i <= value ? 'var(--ink)' : 'var(--ink-faint)' }} />
    ))}
  </span>
);

export function LevelSelect({ game }) {
  const courses = useMemo(() => allCourses(), []);
  const mode = appStore.getState().levelMode;
  const set = appStore.getState().set;
  const [selected, setSelected] = useState(() => courses.find((c) => c.id === game.backdrop?.id) ?? courses[0]);
  const ref = useScreenIn();
  const statsCourses = useStats((s) => s.courses);
  const stat = statsCourses[selected.id];
  const hasGhost = useMemo(() => !!loadBestReplay(selected.id), [selected.id, stat?.best]);

  // The backdrop behind this screen is the selected course itself, live.
  useEffect(() => { game.showBackdrop(selected.id); }, [selected.id]);

  const start = () => {
    game.audio.ensure();
    game.audio.uiConfirm();
    game.startCourse(selected.id, mode);
  };

  return (
    <div ref={ref} className="fixed inset-0 flex">
      <div className="wash wash-panel" />
      <div className="relative flex flex-col w-[min(44rem,100%)] h-full scroll px-[clamp(1.5rem,5vw,5.5rem)] py-[clamp(1rem,4vh,4rem)]">
        <div data-in><Back game={game} onClick={() => set({ screen: 'menu' })} /></div>
        <h1 data-in className="screen-title mt-[clamp(0.3rem,1.6vh,1rem)]">{mode === 'trial' ? 'TIME TRIALS' : 'PLAY'}</h1>
        <p data-in className="mt-2 font-medium max-w-[46ch]">
          {mode === 'trial'
            ? 'Every run is timed. Your best run becomes the ghost you race next time.'
            : 'Each course teaches something, then uses it. Lessons appear as you reach them.'}
        </p>

        <div className="mt-[clamp(0.5rem,2vh,1.5rem)] mb-[clamp(0.5rem,1.6vh,1.25rem)]" role="listbox" aria-label="Courses">
          {courses.map((c) => {
            const s = statsCourses[c.id];
            return (
              <button
                key={c.id} data-in className="course-row" role="option" aria-selected={c.id === selected.id}
                data-active={c.id === selected.id}
                onMouseEnter={() => { if (c.id !== selected.id) { game.audio.ctx && game.audio.uiHover(); setSelected(c); } }}
                onFocus={() => setSelected(c)}
                onClick={() => setSelected(c)} onDoubleClick={start}
              >
                <span className="n num">{String(c.number).padStart(2, '0')}</span>
                <span className="name">{c.name}</span>
                <span className="time num">{s?.best ? formatTime(s.best) : 'Not finished'}</span>
              </button>
            );
          })}
        </div>

        <div data-in className="mt-auto" key={selected.id}>
          <p className="font-medium text-[1.06rem] mb-[clamp(0.25rem,1vh,0.75rem)]">{selected.tagline}</p>
          <ElevationLine level={selected} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-[clamp(0rem,0.5vh,0.25rem)] mt-[clamp(0.4rem,1.5vh,1rem)] items-baseline">
            <dt className="stat-label">Difficulty</dt>
            <dd className="m-0"><Difficulty value={selected.difficulty} /></dd>
            <dt className="stat-label">Uses</dt>
            <dd className="m-0 font-medium">{selected.mechanics.join(', ')}</dd>
            <dt className="stat-label">Personal best</dt>
            <dd className="m-0 font-semibold num">{stat?.best ? formatTime(stat.best) : 'None yet'}</dd>
            {selected.referenceTime && (
              <>
                <dt className="stat-label">Reference route</dt>
                <dd className="m-0 font-medium num">{formatTime(selected.referenceTime)}, a clean test run, not a world record</dd>
              </>
            )}
            {mode === 'trial' && (
              <>
                <dt className="stat-label">Ghost</dt>
                <dd className="m-0 font-medium">{hasGhost ? 'Your best run' : 'Finish once to record one'}</dd>
              </>
            )}
          </dl>
          <div className="mt-[clamp(0.6rem,2vh,1.25rem)]">
            <button className="action" onClick={start}>Start {selected.name}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
