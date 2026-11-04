import { formatTime } from '../timing/RunTimer.js';
import { useStats } from './shared.jsx';

/** Held-Tab overlay: course facts and this run so far. Does not stop the clock. */
export function CourseInfo({ game }) {
  const { sim, level, mode } = game;
  const course = useStats((s) => s.courses[level?.id]);
  if (!sim || !level) return null;
  const st = sim.player.stats;
  const rows = mode === 'free'
    ? [['Top speed', `${st.peakSpeed.toFixed(1)} m/s`], ['Grapples', st.grapples], ['Wall runs', st.wallRuns], ['Air dashes', st.dashes]]
    : [
      ['Time', formatTime(sim.timer.elapsed)], ['Personal best', course?.best ? formatTime(course.best) : 'None yet'],
      ['Checkpoints', `${sim.checkpoints.progress.reached} of ${sim.checkpoints.progress.total}`],
      ['Falls and resets', sim.deaths], ['Peak speed', `${st.peakSpeed.toFixed(1)} m/s`],
      ['Grapples', st.grapples], ['Air dashes', st.dashes], ['Wall runs', st.wallRuns],
    ];
  return (
    <div className="fixed top-[16vh] left-1/2 -translate-x-1/2 w-[min(30rem,92vw)] px-6 py-5 num" style={{ background: 'rgba(240,244,245,0.93)' }}>
      <div className="font-bold text-[1.2rem]" style={{ fontStretch: '112%' }}>{level.name}</div>
      <div className="stat-label mb-2">{level.tagline}</div>
      <dl className="grid grid-cols-2 gap-x-4">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between py-1 border-t border-[var(--ink-faint)] col-span-2">
            <dt className="stat-label">{k}</dt><dd className="m-0 font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
