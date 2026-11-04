import { useState } from 'react';
import { appStore } from '../core/appStore.js';
import { allCourses } from '../levels/LevelManager.js';
import { completedCount } from '../stats/StatsStore.js';
import { formatTime } from '../timing/RunTimer.js';
import { Back, useScreenIn, useStats } from './shared.jsx';
import { statsStore } from '../stats/StatsStore.js';

const hours = (s) => {
  if (s < 60) return `${Math.round(s)} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
};

export function Statistics({ game }) {
  const ref = useScreenIn();
  const set = appStore.getState().set;
  const s = useStats((x) => x);
  const courses = allCourses();
  const [confirming, setConfirming] = useState(false);

  const totals = [
    ['Playtime', hours(s.playtime)],
    ['Courses finished', `${completedCount(s)} of ${courses.length}`],
    ['Runs finished', s.completedRuns],
    ['Runs abandoned', s.failedAttempts],
    ['Top speed', `${s.topSpeed.toFixed(1)} m/s`],
    ['Distance', `${(s.distance / 1000).toFixed(1)} km`],
    ['Grapples', s.grapples],
    ['Wall runs', s.wallRuns],
    ['Air dashes', s.dashes],
    ['Jumps', s.jumps],
  ];

  const isEmpty = s.completedRuns === 0 && s.playtime === 0;

  return (
    <div ref={ref} className="fixed inset-0 flex">
      <div className="wash wash-strong" />
      <div className="relative w-full max-w-[72rem] px-[clamp(1.5rem,5vw,5.5rem)] py-[clamp(1.5rem,6vh,4rem)] flex flex-col h-full scroll">
        <div data-in><Back game={game} onClick={() => set({ screen: 'menu' })} /></div>
        <h1 data-in className="screen-title mt-4">STATISTICS</h1>
        {isEmpty && <p data-in className="mt-3 font-medium max-w-[46ch]">Nothing here yet. Every number on this page comes from your own runs, and starts when you finish your first course.</p>}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-8 gap-y-5 mt-7">
          {totals.map(([k, v]) => (
            <div data-in key={k}>
              <div className="stat-label">{k}</div>
              <div className="num font-bold text-[1.7rem] leading-tight" style={{ fontStretch: '100%' }}>{v}</div>
            </div>
          ))}
        </div>

        <table data-in className="mt-9 w-full num">
          <thead>
            <tr className="stat-label text-left">
              <th className="font-medium pb-2">Course</th>
              <th className="font-medium pb-2 text-right">Personal best</th>
              <th className="font-medium pb-2 text-right">Finishes</th>
              <th className="font-medium pb-2 text-right">Attempts</th>
              <th className="font-medium pb-2 text-right">Peak speed</th>
              <th className="font-medium pb-2 text-right hidden md:table-cell">Fastest checkpoint times</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => {
              const r = s.courses[c.id];
              return (
                <tr key={c.id} className="border-t border-[var(--ink-faint)]">
                  <td className="py-2 font-semibold" style={{ fontStretch: '108%' }}>{c.name}</td>
                  <td className="py-2 text-right font-semibold">{r?.best ? formatTime(r.best) : 'None'}</td>
                  <td className="py-2 text-right">{r?.runs ?? 0}</td>
                  <td className="py-2 text-right">{r?.attempts ?? 0}</td>
                  <td className="py-2 text-right">{r?.bestPeak ? `${r.bestPeak.toFixed(1)} m/s` : 'None'}</td>
                  <td className="py-2 text-right hidden md:table-cell text-[0.9rem]">
                    {r?.bestSplits?.length ? r.bestSplits.map((t) => (t === null || t === undefined ? 'skipped' : formatTime(t, { decimals: 2 }))).join('  ') : 'None'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div data-in className="mt-auto pt-8 pb-2">
          {!confirming && <button className="action quiet" onClick={() => setConfirming(true)}>Clear saved data</button>}
          {confirming && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium">This deletes all times, ghosts, statistics and settings on this device.</span>
              <button className="action" onClick={() => { statsStore.getState().clearAll(); setConfirming(false); }}>Delete everything</button>
              <button className="action quiet" onClick={() => setConfirming(false)}>Keep my data</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
