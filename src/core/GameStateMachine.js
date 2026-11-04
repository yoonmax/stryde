/**
 * Top-level game flow. Screens live in the UI layer; this tracks what the simulation is allowed to do.
 */
export const GameFlow = Object.freeze({
  LOADING: 'loading',
  MENU: 'menu',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  PAUSED: 'paused',
  RESULTS: 'results',
});

const F = GameFlow;
const LEGAL = {
  [F.LOADING]: [F.MENU],
  [F.MENU]: [F.COUNTDOWN, F.PLAYING],
  [F.COUNTDOWN]: [F.PLAYING, F.PAUSED, F.MENU, F.COUNTDOWN],
  [F.PLAYING]: [F.PAUSED, F.RESULTS, F.MENU, F.COUNTDOWN],
  [F.PAUSED]: [F.PLAYING, F.COUNTDOWN, F.MENU],
  [F.RESULTS]: [F.COUNTDOWN, F.PLAYING, F.MENU],
};

export class GameStateMachine {
  constructor(onChange) {
    this.state = F.LOADING;
    this.onChange = onChange;
    this.beforePause = null;
  }

  go(next) {
    if (next === this.state) return true;
    if (!LEGAL[this.state].includes(next)) throw new Error(`Illegal game flow: ${this.state} -> ${next}`);
    const prev = this.state;
    this.state = next;
    this.onChange?.(next, prev);
    return true;
  }

  pause() {
    if (this.state !== F.PLAYING && this.state !== F.COUNTDOWN) return false;
    this.beforePause = this.state;
    return this.go(F.PAUSED);
  }

  resume() {
    if (this.state !== F.PAUSED) return false;
    const to = this.beforePause ?? F.PLAYING;
    this.beforePause = null;
    return this.go(to);
  }

  is(s) { return this.state === s; }
}
