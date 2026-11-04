import { useEffect, useState } from 'react';
import { appStore } from '../core/appStore.js';
import { ACTIONS, cmPer360, codeLabel, FPS_CAPS, GRAPHICS_PRESETS, settingsStore } from '../settings/SettingsManager.js';
import { Back, useScreenIn, useSettings } from './shared.jsx';
import { Crosshair } from './Crosshair.jsx';

const TABS = [
  ['mouse', 'Mouse'], ['controls', 'Controls'], ['camera', 'Camera'],
  ['graphics', 'Graphics'], ['audio', 'Audio'], ['gameplay', 'Gameplay'],
];

const Row = ({ label, note, children }) => (
  <div className="row" data-in>
    <div>
      <div className="row-label">{label}</div>
      {note && <div className="row-note">{note}</div>}
    </div>
    <div className="flex flex-wrap items-center gap-3">{children}</div>
  </div>
);

const Slider = ({ section, name, min, max, step, format, label, note }) => {
  const value = useSettings((s) => s[section][name]);
  return (
    <Row label={label} note={note}>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value}
        onChange={(e) => settingsStore.getState().update(section, name, Number(e.target.value))} />
      <span className="num font-semibold min-w-[4.4rem]">{format ? format(value) : value}</span>
    </Row>
  );
};

const Toggle = ({ section, name, label, note }) => {
  const value = useSettings((s) => s[section][name]);
  return (
    <Row label={label} note={note}>
      <button className="switch" role="switch" aria-checked={value} aria-label={label}
        onClick={() => settingsStore.getState().update(section, name, !value)} />
    </Row>
  );
};

const Seg = ({ section, name, options, label, note, onPick }) => {
  const value = useSettings((s) => s[section][name]);
  return (
    <Row label={label} note={note}>
      <div className="seg" role="group" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={String(v)} aria-pressed={value === v}
            onClick={() => (onPick ? onPick(v) : settingsStore.getState().update(section, name, v))}>{text}</button>
        ))}
      </div>
    </Row>
  );
};

const percent = (v) => `${Math.round(v * 100)}%`;

function Keybind({ action, slot, capturing, onCapture }) {
  const code = useSettings((s) => s.controls[action][slot]);
  return (
    <button className="bind" data-capturing={capturing} data-empty={!code && !capturing} onClick={() => onCapture(action, slot)}>
      {capturing ? 'Press a key' : codeLabel(code)}
    </button>
  );
}

function ControlsTab() {
  const [capture, setCapture] = useState(null);
  const [message, setMessage] = useState('');
  const labelOf = (a) => ACTIONS.find(([x]) => x === a)?.[1];

  useEffect(() => {
    if (!capture) return undefined;
    const finish = (code) => {
      const conflict = settingsStore.getState().bind(capture.action, capture.slot, code);
      setMessage(conflict
        ? `${codeLabel(code)} moved from ${labelOf(conflict)} to ${labelOf(capture.action)}. ${labelOf(conflict)} may need a new key.`
        : `${labelOf(capture.action)} is now ${codeLabel(code)}.`);
      setCapture(null);
    };
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') { setCapture(null); setMessage('Kept the old key.'); return; }
      finish(e.code);
    };
    const onMouse = (e) => { e.preventDefault(); e.stopPropagation(); finish(`Mouse${e.button}`); };
    const noMenu = (e) => e.preventDefault();
    const add = setTimeout(() => window.addEventListener('mousedown', onMouse, true), 0);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('contextmenu', noMenu, true);
    return () => {
      clearTimeout(add);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
      setTimeout(() => window.removeEventListener('contextmenu', noMenu, true), 200);
    };
  }, [capture]);

  return (
    <>
      <p data-in className="mb-2 max-w-[60ch] min-h-[1.5rem] font-medium" role="status">{message || 'Select a key, then press the new key or mouse button. Escape cancels.'}</p>
      {ACTIONS.map(([action, label]) => (
        <Row key={action} label={label}>
          <Keybind action={action} slot={0} capturing={capture?.action === action && capture.slot === 0} onCapture={(a, s) => setCapture({ action: a, slot: s })} />
          <Keybind action={action} slot={1} capturing={capture?.action === action && capture.slot === 1} onCapture={(a, s) => setCapture({ action: a, slot: s })} />
        </Row>
      ))}
      <p data-in className="row-note mt-3 max-w-[64ch]">On Windows and Linux, Ctrl+W closes a browser tab and no page can prevent it outside fullscreen. C is the safer slide key if you use Ctrl while pressing W.</p>
    </>
  );
}

function MouseTab() {
  const m = useSettings((s) => s.mouse);
  const update = settingsStore.getState().update;
  const cm = cmPer360(m.sensitivity, m.dpi);
  return (
    <>
      <Row label="Sensitivity" note="Uses the common 0.022 degrees per count at 1.0, so values from other games carry over.">
        <input type="range" aria-label="Sensitivity" min="0.1" max="8" step="0.01" value={m.sensitivity} onChange={(e) => update('mouse', 'sensitivity', Number(e.target.value))} />
        <input className="input-num" type="number" aria-label="Exact sensitivity" min="0.01" max="20" step="0.01" value={m.sensitivity}
          onChange={(e) => { const v = Number(e.target.value); if (v > 0) update('mouse', 'sensitivity', v); }} />
      </Row>
      <Row label="Mouse DPI" note="Only used for the figure below. It does not change your mouse.">
        <input className="input-num" type="number" aria-label="Mouse DPI" min="100" max="32000" step="50" value={m.dpi}
          onChange={(e) => { const v = Number(e.target.value); if (v > 0) update('mouse', 'dpi', v); }} />
        <span className="num font-semibold">About {cm.toFixed(1)} cm per full turn</span>
      </Row>
      <Toggle section="mouse" name="rawInput" label="Raw mouse input" note="Bypasses your system's pointer acceleration where the browser allows it. Used the next time the mouse is captured." />
      <Toggle section="mouse" name="invertY" label="Invert vertical look" />
    </>
  );
}

function CameraTab() {
  const fov = useSettings((s) => s.camera.fov);
  const h = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * (16 / 9)) * (180 / Math.PI);
  return (
    <>
      <Slider section="camera" name="fov" label="Field of view" min={55} max={100} step={1} format={(v) => `${v}°`} note={`Vertical. About ${Math.round(h)}° horizontal at 16:9.`} />
      <Toggle section="camera" name="speedFov" label="Widen view with speed" />
      <Toggle section="camera" name="headBob" label="Head movement while running" />
      <Slider section="camera" name="tilt" label="Wall-run lean" min={0} max={2} step={0.05} format={percent} />
      <Toggle section="camera" name="landing" label="Landing dip" />
      <Slider section="camera" name="shake" label="Hard landing shake" min={0} max={1} step={0.05} format={percent} />
      <Toggle section="camera" name="reduceMotion" label="Reduce motion" note="Turns off lean, bob, shake, speed widening, speed streaks, and menu movement." />
      <Toggle section="camera" name="showViewmodel" label="Show arm and grapple device" />
    </>
  );
}

function GraphicsTab() {
  const preset = useSettings((s) => s.graphics.preset);
  const applyPreset = settingsStore.getState().applyPreset;
  const [full, setFull] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const h = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);
  const toggleFull = async () => {
    if (document.fullscreenElement) { await document.exitFullscreen(); return; }
    await document.documentElement.requestFullscreen?.();
    // In fullscreen a browser can route Ctrl+W and Escape-adjacent keys to the page.
    navigator.keyboard?.lock?.(['KeyW', 'KeyT', 'KeyR']).catch(() => {});
  };
  return (
    <>
      <Row label="Preset" note={preset === 'custom' ? 'Custom: you have changed values below.' : 'Sets every option below. Performance gives the steadiest frame time.'}>
        <div className="seg" role="group" aria-label="Preset">
          {Object.keys(GRAPHICS_PRESETS).map((k) => (
            <button key={k} aria-pressed={preset === k} onClick={() => applyPreset(k)}>{k[0].toUpperCase() + k.slice(1)}</button>
          ))}
        </div>
      </Row>
      <Row label="Fullscreen" note="Also stops Ctrl+W closing the tab, in browsers that support keyboard lock.">
        <button className="switch" role="switch" aria-checked={full} aria-label="Fullscreen" onClick={toggleFull} />
      </Row>
      <Slider section="graphics" name="resolutionScale" label="Resolution scale" min={0.5} max={1} step={0.05} format={percent} />
      <Seg section="graphics" name="shadows" label="Shadow quality" options={[['off', 'Off'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']]} />
      <Seg section="graphics" name="ao" label="Ambient occlusion" note="Screen-space occlusion. Costly at high resolutions." options={[['off', 'Off'], ['gtao', 'On']]} />
      <Seg section="graphics" name="aa" label="Antialiasing" options={[['off', 'Off'], ['fxaa', 'FXAA'], ['msaa', 'MSAA 4x']]} />
      <Toggle section="graphics" name="post" label="Bloom" note="A very low bloom on the sun and guidance lights." />
      <Slider section="graphics" name="particles" label="Particle density" min={0} max={1} step={0.1} format={percent} />
      <Toggle section="graphics" name="envFx" label="Cloud banks" />
      <Seg section="graphics" name="fpsCap" label="Frame rate cap" note="Uncapped adds no limit of its own. The browser and your display can still limit frames." options={FPS_CAPS.map((v) => [v, v === 0 ? 'Uncapped' : String(v)])} />
      <Toggle section="graphics" name="showFps" label="Show FPS" />
      <Toggle section="graphics" name="showFrameTime" label="Show frame time" />
    </>
  );
}

function AudioTab() {
  return (
    <>
      <Slider section="audio" name="master" label="Master" min={0} max={1} step={0.01} format={percent} />
      <Slider section="audio" name="movement" label="Movement" min={0} max={1} step={0.01} format={percent} />
      <Slider section="audio" name="ui" label="Interface" min={0} max={1} step={0.01} format={percent} />
      <Slider section="audio" name="ambient" label="Ambient" min={0} max={1} step={0.01} format={percent} />
    </>
  );
}

function GameplayTab() {
  const g = useSettings((s) => s.gameplay);
  return (
    <>
      <Row label="Crosshair preview">
        <div className="relative w-[120px] h-[64px]" style={{ background: 'linear-gradient(90deg, #eae6dd 50%, #2b3138 50%)' }}>
          <div className="absolute inset-0"><Crosshair gameplay={g} /></div>
        </div>
      </Row>
      <Seg section="gameplay" name="crosshairStyle" label="Crosshair style" options={[['cross', 'Cross'], ['gap', 'Gapped'], ['dot', 'Dot'], ['circle', 'Circle']]} />
      <Seg section="gameplay" name="crosshairColor" label="Crosshair colour" note="Auto inverts against what is behind it." options={[['auto', 'Auto'], ['white', 'White'], ['dark', 'Dark'], ['signal', 'Blue']]} />
      <Slider section="gameplay" name="crosshairSize" label="Crosshair size" min={0.6} max={2.4} step={0.1} format={(v) => `${v.toFixed(1)}x`} />
      <Toggle section="gameplay" name="showSpeed" label="Show speedometer" />
      <Toggle section="gameplay" name="showState" label="Show movement state" />
      <Toggle section="gameplay" name="showSplits" label="Show checkpoint splits" />
      <Toggle section="gameplay" name="showHints" label="Show lessons in Play mode" />
      <Toggle section="gameplay" name="hopFeedback" label="Bunny-hop training feedback" note="Shows timing quality and speed gained on each hop." />
      <Toggle section="gameplay" name="ghostEnabled" label="Race against ghost" note="In Time Trials, once you have a best run." />
      <Slider section="gameplay" name="ghostOpacity" label="Ghost opacity" min={0.1} max={1} step={0.05} format={percent} />
      <Toggle section="gameplay" name="autoRestart" label="Restart automatically after a finish" />
      <Toggle section="gameplay" name="alwaysSprint" label="Always sprint" note="Off: hold the sprint key to reach full speed." />
      <Seg section="gameplay" name="grappleMode" label="Grapple button" options={[['hold', 'Hold'], ['toggle', 'Toggle']]} />
      <Toggle section="gameplay" name="grappleAim" label="Grapple aim assist" note="Snaps to a blue node within a few degrees of the crosshair." />
      <Toggle section="gameplay" name="ledgeVault" label="Ledge assist" note="Pops you over a lip you nearly cleared." />
      <Toggle section="gameplay" name="autoHop" label="Auto hop in Free Run" note="Holding jump hops on every landing. Free Run only, for practising air control." />
    </>
  );
}

const TAB_BODY = { mouse: MouseTab, controls: ControlsTab, camera: CameraTab, graphics: GraphicsTab, audio: AudioTab, gameplay: GameplayTab };

export function Settings({ game }) {
  const [tab, setTab] = useState('mouse');
  const ref = useScreenIn([tab]);
  const [confirmReset, setConfirmReset] = useState(false);
  const { set, settingsFrom } = appStore.getState();
  const Body = TAB_BODY[tab];
  const exit = () => set({ screen: settingsFrom === 'pause' ? 'game' : 'menu' });

  return (
    <div ref={ref} className="fixed inset-0 flex">
      <div className="wash wash-strong" />
      <div className="relative w-full max-w-[78rem] grid grid-cols-[minmax(11rem,15rem)_1fr] gap-x-[clamp(1.5rem,4vw,4rem)] px-[clamp(1.5rem,5vw,5.5rem)] py-[clamp(1.5rem,6vh,4rem)] h-full">
        <div className="flex flex-col">
          <div><Back game={game} onClick={exit} label={settingsFrom === 'pause' ? 'Back to pause' : 'Back'} /></div>
          <h1 className="screen-title screen-title-small mt-4">SETTINGS</h1>
          <nav aria-label="Settings categories" className="mt-5">
            {TABS.map(([id, label]) => (
              <button key={id} className="tab" data-active={tab === id} onClick={() => { game.audio.ctx && game.audio.uiHover(); setTab(id); }}>{label}</button>
            ))}
          </nav>
          <div className="mt-auto flex flex-col items-start gap-2 pb-1">
            <button className="backlink" onClick={() => settingsStore.getState().resetSection(tab)}>Reset {TABS.find((t) => t[0] === tab)[1].toLowerCase()}</button>
            {!confirmReset && <button className="backlink" onClick={() => setConfirmReset(true)}>Reset all settings</button>}
            {confirmReset && (
              <div className="flex gap-3 items-center">
                <button className="backlink font-bold" style={{ color: 'var(--ink)' }} onClick={() => { settingsStore.getState().resetAll(); setConfirmReset(false); }}>Reset everything</button>
                <button className="backlink" onClick={() => setConfirmReset(false)}>Cancel</button>
              </div>
            )}
          </div>
        </div>
        <div className="scroll h-full pr-4 pb-6 pt-[0.2rem]" key={tab}>
          <Body />
        </div>
      </div>
    </div>
  );
}
