import { useEffect, useState } from 'react';
import { appStore } from '../core/appStore.js';
import { useApp, useScreenIn } from './shared.jsx';
import { formatTime } from '../timing/RunTimer.js';

/** Chrome refuses to re-lock the pointer for about a second after Escape, so Resume retries visibly. */
export function PauseMenu({ game }) {
  const ref = useScreenIn();
  const lockFailed = useApp((s) => s.lockFailed);
  const set = appStore.getState().set;
  const sim = game.sim;
  const level = game.level;
  const [waiting, setWaiting] = useState(false);

  const resume = async () => {
    game.audio.uiConfirm();
    setWaiting(true);
    const ok = await game.resume();
    setWaiting(false);
    return ok;
  };

  useEffect(() => { set({ lockFailed: false }); }, []);

  const reason = {
    blur: 'Paused because the window lost focus.',
    hidden: 'Paused because the tab was hidden.',
  }[game.pauseReason];

  return (
    <div ref={ref} className="overlay-pane">
      <div className="overlay-side">
        <h1 data-in className="screen-title">PAUSED</h1>
        <p data-in className="mt-2 font-medium">{level?.name}{sim && game.mode !== 'free' ? `, ${formatTime(sim.timer.elapsed)} on the clock. The clock is stopped.` : ''}</p>
        {reason && <p data-in className="mt-1 stat-label">{reason}</p>}

        <div className="flex flex-col items-start gap-3 mt-7">
          <div data-in><button className="action" onClick={resume} disabled={waiting} autoFocus>{waiting ? 'Capturing mouse' : 'Resume'}</button></div>
          {lockFailed && <p data-in className="font-medium max-w-[42ch]">The browser refused mouse capture for a moment. Wait a second and select Resume again.</p>}
          <div data-in><button className="action quiet" onClick={async () => {
            game.audio.uiConfirm();
            // A timed restart has its own countdown. In free run there is nothing to wait for.
            if (game.mode === 'free') { game.restart(); await resume(); return; }
            game.lockFromGesture();
            game.restart();
          }}>{game.mode === 'free' ? 'Back to spawn' : 'Restart course'} <span className="kbd">R</span></button></div>
          <div data-in><button className="action quiet" onClick={() => { game.audio.uiConfirm(); set({ screen: 'settings', settingsFrom: 'pause' }); }}>Settings</button></div>
          <div data-in><button className="action quiet" onClick={() => { game.audio.uiBack(); game.exitToMenu(); }}>Exit to menu</button></div>
        </div>

        {game.mode === 'free' && level?.spawnPoints?.length > 0 && (
          <div className="mt-8">
            <h2 data-in className="font-semibold">Go to a practice area</h2>
            <div className="flex flex-wrap gap-2 mt-3 max-w-[38rem]">
              {level.spawnPoints.map((sp, i) => (
                <button data-in key={sp.name} className="action quiet" onClick={async () => {
                  game.audio.uiConfirm();
                  game.freeSpawn(i);
                  await resume();
                }}>{sp.name}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
