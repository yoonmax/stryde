import { useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { appStore } from '../core/appStore.js';
import { Wordmark, reduceMotion } from './shared.jsx';
import { FREE_RUN_ID } from '../levels/LevelManager.js';

let introPlayed = false;

const isTouchOnly = () => window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;

/** Title screen: the course behind it is live 3D, and the menu is one column of plain verbs. */
export function MainMenu({ game }) {
  const ref = useRef(null);
  const listRef = useRef(null);
  const [touchNote, setTouchNote] = useState(false);
  const firstTime = !introPlayed;
  const set = appStore.getState().set;

  useLayoutEffect(() => {
    if (reduceMotion()) { introPlayed = true; return undefined; }
    const ctx = gsap.context(() => {
      gsap.from('.menu-item', { x: -24, autoAlpha: 0, duration: 0.55, ease: 'power3.out', stagger: 0.045, delay: firstTime ? 0.55 : 0.02 });
      gsap.from('.tag', { autoAlpha: 0, duration: 0.6, delay: firstTime ? 1.0 : 0.1 });
    }, ref);
    introPlayed = true;
    return () => ctx.revert();
  }, []);

  const go = (fn) => () => {
    game.audio.ensure();
    game.audio.uiConfirm();
    fn();
  };
  const hover = () => { game.audio.ctx && game.audio.uiHover(); };

  const items = [
    ['PLAY', 'Five courses with lessons along the way', () => set({ levelMode: 'play', screen: 'levels' })],
    ['FREE RUN', 'An open playground with no clock', () => {
      if (isTouchOnly()) { setTouchNote(true); return; }
      game.startCourse(FREE_RUN_ID, 'free');
    }],
    ['TIME TRIALS', 'Race the clock and your own ghost', () => set({ levelMode: 'trial', screen: 'levels' })],
    ['SETTINGS', 'Mouse, keys, graphics and sound', () => set({ screen: 'settings', settingsFrom: 'menu' })],
    ['STATISTICS', 'Personal bests and totals', () => set({ screen: 'stats' })],
    ['ABOUT', 'Controls and how it was made', () => set({ screen: 'about' })],
  ];

  const onKey = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = [...listRef.current.querySelectorAll('button')];
    const at = buttons.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown' ? (at + 1) % buttons.length : (at - 1 + buttons.length) % buttons.length;
    buttons[next].focus();
  };

  return (
    <div ref={ref} className="fixed inset-0 flex flex-col justify-between" onKeyDown={onKey}>
      <div className="wash" />
      <nav ref={listRef} aria-label="Main menu" className="relative pl-[clamp(3rem,5vw,5.5rem)] pt-[clamp(2rem,9vh,6.5rem)] w-[min(44rem,100%)]">
        {items.map(([label, desc, fn], i) => (
          <button key={label} className="menu-item" autoFocus={i === 0} onClick={go(fn)} onMouseEnter={hover} onFocus={hover}>
            <span className="rule" aria-hidden="true" />
            <span>{label}</span>
            <span className="desc">{desc}</span>
          </button>
        ))}
        {touchNote && <p className="mt-4 max-w-[34ch] font-medium">STRYDE needs a keyboard and mouse. Open it on a desktop or laptop to play.</p>}
      </nav>
      <footer className="relative px-[clamp(1rem,2vw,2rem)] pb-[clamp(0.6rem,1.4vh,1.2rem)]">
        <p className="tag font-semibold tracking-[0.02em] text-[clamp(0.85rem,1.5vh,1.08rem)] pl-[0.35rem] mb-[-0.25rem]" style={{ fontStretch: '112%' }}>MOVEMENT IS EVERYTHING</p>
        <Wordmark reveal={firstTime} className="text-ink" />
      </footer>
    </div>
  );
}
