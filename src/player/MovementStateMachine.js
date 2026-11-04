/**
 * Locomotion: what the body is doing relative to the world. Exactly one at a time.
 * Grappling, dashing and landing are orthogonal, tracked by their own systems, so that
 * "airborne and grappling" or "wall running and dashing" never need contradictory flags.
 */
export const Locomotion = Object.freeze({
  GROUNDED: 'GROUNDED',
  RUNNING: 'RUNNING',
  SLIDING: 'SLIDING',
  JUMPING: 'JUMPING',
  FALLING: 'FALLING',
  WALL_RUNNING: 'WALL_RUNNING',
});

const L = Locomotion;

/** Legal locomotion transitions. Anything else is a logic error and is reported, not silently taken. */
export const TRANSITIONS = Object.freeze({
  [L.GROUNDED]: [L.RUNNING, L.SLIDING, L.JUMPING, L.FALLING],
  [L.RUNNING]: [L.GROUNDED, L.SLIDING, L.JUMPING, L.FALLING],
  [L.SLIDING]: [L.GROUNDED, L.RUNNING, L.JUMPING, L.FALLING],
  [L.JUMPING]: [L.FALLING, L.GROUNDED, L.RUNNING, L.SLIDING, L.WALL_RUNNING, L.JUMPING],
  [L.FALLING]: [L.GROUNDED, L.RUNNING, L.SLIDING, L.JUMPING, L.WALL_RUNNING],
  [L.WALL_RUNNING]: [L.JUMPING, L.FALLING, L.GROUNDED, L.RUNNING, L.SLIDING, L.WALL_RUNNING],
});

export const isGroundState = (s) => s === L.GROUNDED || s === L.RUNNING || s === L.SLIDING;
export const isAirState = (s) => s === L.JUMPING || s === L.FALLING;

export class MovementStateMachine {
  constructor(initial = L.FALLING) {
    this.state = initial;
    this.time = 0;
    this.previous = initial;
    /** Illegal transitions seen. Stays empty in correct play; tests assert on it. */
    this.violations = [];
  }

  /** @returns {boolean} true if the state changed */
  set(next) {
    if (next === this.state) return false;
    if (!TRANSITIONS[this.state].includes(next)) {
      this.violations.push(`${this.state}->${next}`);
      return false;
    }
    this.previous = this.state;
    this.state = next;
    this.time = 0;
    return true;
  }

  /** Respawning bypasses the table: it is a reset, not a movement. */
  reset(state = L.GROUNDED) {
    this.previous = this.state;
    this.state = state;
    this.time = 0;
  }

  tick(dt) { this.time += dt; }
  get grounded() { return isGroundState(this.state); }
  get airborne() { return isAirState(this.state); }
  is(s) { return this.state === s; }
}
