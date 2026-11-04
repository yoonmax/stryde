import { useEffect, useRef, useState } from 'react';
import { formatTime } from '../timing/RunTimer.js';
import { RunPhase } from '../core/Simulation.js';
import { Crosshair } from './Crosshair.jsx';
import { useApp, useSettings } from './shared.jsx';
import { codeLabel, settingsStore } from '../settings/SettingsManager.js';

const STATE_NAMES = {
  GROUNDED: 'Standing', RUNNING: 'Running', SLIDING: 'Sliding', JUMPING: 'Jumping', FALLING: 'Falling',
  WALL_RUNNING: 'Wall run', GRAPPLING: 'Grappling', DASHING: 'Dashing', LANDING: 'Landing',
};

const TAPE_MAX = 46;
const HINT_ACTIONS = { W: 'forward', SPACE: 'jump', C: 'slide', RMB: 'grapple', LMB: 'reelIn', Q: 'dash' };

/**
 * Per-frame values skip React entirely. They are written straight to the DOM through refs, and only
 * when the displayed text actually changes. React is here for layout and settings, not the 240 Hz path.
 */
export function HUD({ game }) {
  const r = useRef({});
  const bind = (name) => (el) => { r.current[name] = el; };
  const gameplay = useSettings((s) => s.gameplay);
  const graphics = useSettings((s) => s.graphics);
  const flow = useApp((s) => s.flow);
  const mode = useApp((s) => s.currentMode);
  const [cpTotal, setCpTotal] = useState(0);
  const [cpReached, setCpReached] = useState(0);
  const memo = useRef({});
  const refs = useRef({ best: null, hintTimer: 0, splitTimer: 0, countText: '' });

  useEffect(() => {
    const write = (name, text) => {
      if (memo.current[name] !== text) {
        memo.current[name] = text;
        if (r.current[name]) r.current[name].textContent = text;
      }
    };
    const api = {
      onCourseStart(level) { setCpTotal(level.checkpoints.length); setCpReached(0); },
      onRunReset(sim, best) {
        setCpReached(0);
        refs.current.best = best;
        write('split', '');
        if (r.current.hint) r.current.hint.style.opacity = 0;
      },
      onEvent(e) {
        if (e.type === 'checkpoint') {
          setCpReached(e.index + 1);
          const best = refs.current.best?.bestRun?.splits?.[e.index];
          const el = r.current.split;
          if (el) {
            if (best !== undefined && best !== null) {
              const d = e.time - best;
              el.textContent = `${formatTime(d, { sign: true, decimals: 2 })}`;
              el.className = `hud-label num font-semibold text-[1.02rem] ${d <= 0 ? 'delta-gain' : 'delta-loss'}`;
            } else {
              el.textContent = formatTime(e.time, { decimals: 2 });
              el.className = 'hud-label num font-semibold text-[1.02rem]';
            }
            memo.current.split = el.textContent;
            refs.current.splitTimer = performance.now() + 2600;
          }
        }
        if (e.type === 'jump' && e.hop && refs.current.showHop) {
          const el = r.current.hop;
          if (el) {
            const names = { perfect: 'Perfect', good: 'Good', late: 'Late' };
            el.textContent = `${names[e.hop]} ${e.delta >= 0 ? '+' : ''}${e.delta.toFixed(1)}`;
            el.dataset.hop = e.hop;
            el.style.opacity = 1;
            refs.current.hopTimer = performance.now() + 900;
          }
        }
      },
      showHint(text) {
        const el = r.current.hint;
        if (!el) return;
        // Lessons name the player's own keys, including anything they have rebound.
        const controls = settingsStore.getState().controls;
        el.textContent = text.replace(/\[([A-Za-z]+)\]/g, (_, token) => {
          const action = HINT_ACTIONS[token];
          return action ? codeLabel(controls[action][0]) : token;
        });
        el.style.transition = 'opacity 0.2s';
        el.style.opacity = 1;
        refs.current.hintTimer = performance.now() + 5200;
      },
      frame(sim, p, aim) {
        const now = performance.now();
        const timer = sim.timer;
        write('timer', sim.phase === RunPhase.FREE ? '' : formatTime(timer.elapsed));

        const speed = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
        write('speed', Math.round(speed).toString());
        if (r.current.tape) r.current.tape.style.transform = `scaleX(${Math.min(1, speed / TAPE_MAX).toFixed(4)})`;

        const charges = p.dash.charges;
        if (memo.current.charges !== charges) {
          memo.current.charges = charges;
          r.current.pips?.querySelectorAll('.pip').forEach((el, i) => { el.dataset.off = i >= charges ? 'true' : 'false'; });
        }

        const g = p.grapple;
        const el = r.current.aim;
        if (el) {
          if (aim.visible) {
            el.style.transform = `translate3d(${aim.x.toFixed(1)}px, ${aim.y.toFixed(1)}px, 0)`;
            el.style.opacity = g.attached ? 0.55 : 1;
          } else {
            el.style.opacity = 0;
          }
        }
        const c = p.chest();
        const dist = g.attached
          ? Math.hypot(c.x - g.anchor.x, c.y - g.anchor.y, c.z - g.anchor.z)
          : g.target.valid ? g.target.distance : 0;
        write('aimDist', dist ? `${Math.round(dist)} m` : '');
        const ready = g.target.valid && !g.attached;
        if (memo.current.ready !== ready) {
          memo.current.ready = ready;
          r.current.cross?.setAttribute('data-ready', ready ? 'true' : 'false');
        }
        write('grapple', g.attached ? `Cable ${Math.round(g.length)} m` : '');

        write('state', STATE_NAMES[p.stateLabel] ?? '');

        if (sim.phase === RunPhase.COUNTDOWN) {
          const n = Math.ceil((sim.countdownTicks * sim.dt) / 0.6);
          write('count', String(Math.max(1, n)));
          refs.current.goUntil = now + 450;
        } else if (now < (refs.current.goUntil ?? 0)) {
          write('count', 'GO');
        } else {
          write('count', '');
        }

        if (refs.current.splitTimer && now > refs.current.splitTimer) { refs.current.splitTimer = 0; write('split', ''); if (r.current.split) r.current.split.textContent = ''; }
        if (refs.current.hintTimer && now > refs.current.hintTimer) {
          refs.current.hintTimer = 0;
          if (r.current.hint) { r.current.hint.style.transition = 'opacity 0.6s'; r.current.hint.style.opacity = 0; }
        }
        if (refs.current.hopTimer && now > refs.current.hopTimer) { refs.current.hopTimer = 0; if (r.current.hop) r.current.hop.style.opacity = 0; }
      },
      perf(stats, renderStats) {
        write('fps', `${Math.round(stats.fps)} fps`);
        write('ms', `${stats.avg.toFixed(1)} ms avg, ${stats.p99.toFixed(1)} ms 1% low, ${renderStats.calls} draws`);
      },
      applySettings(s) { refs.current.showHop = s.gameplay.hopFeedback; },
    };
    game.setHud(api);
    if (game.level) { setCpTotal(game.level.checkpoints.length); }
    return () => game.setHud(null);
  }, [game]);

  const trial = mode !== 'free';
  const hideDetails = flow === 'results';

  return (
    <div className="hud num" aria-hidden="true" style={{ opacity: flow === 'results' ? 0 : 1 }}>
      <div className="crosshair-host" ref={bind('cross')}><Crosshair gameplay={gameplay} /></div>
      <div ref={bind('aim')} className="aim">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--signal)" strokeWidth="1.6">
          <path d="M2 8V2H8M16 2H22V8M22 16V22H16M8 22H2V16" />
        </svg>
        <div ref={bind('aimDist')} className="aim-dist" />
      </div>

      {trial && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 text-center">
          <div ref={bind('timer')} className="hud-timer num" />
          <div ref={bind('split')} className="hud-label num mt-1 min-h-[1.3rem]" style={{ display: gameplay.showSplits ? undefined : 'none' }} />
        </div>
      )}

      {trial && cpTotal > 0 && (
        <div className="absolute top-6 right-6 flex items-center gap-1.5">
          {Array.from({ length: cpTotal }, (_, i) => <span key={i} className="cp-tick" data-on={i < cpReached} />)}
        </div>
      )}

      <div className="absolute left-1/2 -translate-x-1/2 bottom-7 flex flex-col items-center gap-2">
        <div ref={bind('hop')} className="hud-label num font-semibold text-[0.96rem]" style={{ opacity: 0 }} />
        <div ref={bind('grapple')} className="hud-label" style={{ minHeight: '1rem' }} />
        {gameplay.showSpeed && (
          <>
            <div className="flex items-baseline gap-1.5">
              <span ref={bind('speed')} className="hud-speed num">0</span>
              <span className="hud-label">m/s</span>
            </div>
            <div className="tape">
              <div ref={bind('tape')} className="tape-fill" />
              <span className="tape-mark" style={{ left: `${(11 / TAPE_MAX) * 100}%` }} />
              <span className="tape-mark" style={{ left: `${(25 / TAPE_MAX) * 100}%` }} />
            </div>
          </>
        )}
        <div ref={bind('pips')} className="flex gap-1.5 mt-1" title="Air dash charges">
          <span className="pip" /><span className="pip" />
        </div>
        {gameplay.showState && <div ref={bind('state')} className="hud-label mt-1" />}
      </div>

      <div ref={bind('count')} className="count" />
      <div ref={bind('hint')} className="hint-line" />

      {(graphics.showFps || graphics.showFrameTime) && !hideDetails && (
        <div className="perf num">
          {graphics.showFps && <div ref={bind('fps')} />}
          {graphics.showFrameTime && <div ref={bind('ms')} />}
        </div>
      )}
    </div>
  );
}
