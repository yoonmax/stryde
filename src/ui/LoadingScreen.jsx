import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useApp, Wordmark, reduceMotion } from './shared.jsx';

/** Progress is the fraction of real load steps finished. Nothing here is padded with fake delays. */
export function LoadingScreen() {
  const stage = useApp((s) => s.loadStage);
  const progress = useApp((s) => s.loadProgress);
  const error = useApp((s) => s.loadError);
  const screen = useApp((s) => s.screen);
  const ref = useRef(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (screen === 'loading' || gone || !ref.current) return;
    if (reduceMotion()) { setGone(true); return; }
    gsap.to(ref.current, { autoAlpha: 0, duration: 0.7, ease: 'power2.inOut', onComplete: () => setGone(true) });
  }, [screen, gone]);

  if (gone) return null;
  return (
    <div ref={ref} className="loader" role="status" aria-live="polite">
      <Wordmark className="text-ink" />
      <div className="mt-6">
        <div className="loader-bar" style={{ transform: `scaleX(${progress})` }} />
        <div className="flex justify-between mt-2 text-[0.92rem] font-medium">
          <span>{error ?? stage}</span>
          {!error && <span className="num">{Math.round(progress * 100)}%</span>}
        </div>
      </div>
    </div>
  );
}
