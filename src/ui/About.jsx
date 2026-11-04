import { appStore } from '../core/appStore.js';
import { Back, useScreenIn, useSettings } from './shared.jsx';
import { codeLabel } from '../settings/SettingsManager.js';

export function About({ game }) {
  const ref = useScreenIn();
  const set = appStore.getState().set;
  const c = useSettings((s) => s.controls);
  const keys = (name) => c[name].map(codeLabel).join(' or ') || 'Unbound';
  const rows = [
    ['Move', `${keys('forward')}, ${keys('left')}, ${keys('back')}, ${keys('right')}`],
    ['Jump', keys('jump')],
    ['Slide', keys('slide')],
    ['Grapple', `Hold ${keys('grapple')}, release to let go`],
    ['Reel cable', `${keys('reelIn')} in, ${keys('reelOut')} out`],
    ['Air dash', keys('dash')],
    ['Restart', keys('restart')],
    ['Back to checkpoint', keys('checkpoint')],
    ['Pause', 'Escape'],
    ['Course information', `Hold ${keys('info')}`],
  ];
  return (
    <div ref={ref} className="fixed inset-0 flex">
      <div className="wash wash-strong" />
      <div className="relative w-full max-w-[66rem] px-[clamp(1.5rem,5vw,5.5rem)] py-[clamp(1.5rem,6vh,4rem)] scroll h-full">
        <div data-in><Back game={game} onClick={() => set({ screen: 'menu' })} /></div>
        <h1 data-in className="screen-title mt-4">ABOUT</h1>
        <div className="grid md:grid-cols-2 gap-x-14 gap-y-8 mt-6">
          <div>
            <p data-in className="font-medium text-[1.12rem] leading-snug max-w-[46ch]">
              STRYDE is a first-person movement game about carrying speed. Run, slide, wall-run and swing through five
              courses set in enormous concrete structures above the clouds, then come back and do it faster.
            </p>
            <h2 data-in className="font-bold mt-6">How surfaces work</h2>
            <p data-in className="mt-1 max-w-[50ch] leading-snug">
              White concrete can be wall-run. Dark ribbed cladding can be wall-run and grappled. Bare metal can be grappled.
              Glass can do neither. The glowing blue nodes are always a valid grapple.
            </p>
            <h2 data-in className="font-bold mt-6">How speed works</h2>
            <p data-in className="mt-1 max-w-[50ch] leading-snug">
              Jumping never costs speed. Jump within a tenth of a second of landing and friction never touches you. In the air, A and D work as they do on the ground, and letting go puts you back on your line.
              A rope only removes speed heading away from the anchor, so letting go keeps all the speed along the swing.
              Walls keep what you carry along them.
            </p>
            <h2 data-in className="font-bold mt-6">Built with</h2>
            <p data-in className="mt-1 max-w-[50ch] leading-snug">
              JavaScript, Three.js, Rapier for collision queries, React, GSAP and Web Audio. The movement simulation runs at a
              fixed 120 ticks per second. All textures and sounds are generated in the browser.
            </p>
          </div>
          <div>
            <h2 data-in className="font-bold">Controls</h2>
            <dl className="mt-2">
              {rows.map(([k, v]) => (
                <div data-in key={k} className="flex justify-between gap-6 py-[0.42rem] border-t border-[var(--ink-faint)]">
                  <dt className="stat-label">{k}</dt>
                  <dd className="m-0 font-semibold text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <p data-in className="stat-label mt-2 max-w-[44ch]">Keys can be changed in Settings.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
