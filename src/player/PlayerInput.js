const MAX_PITCH = (89 * Math.PI) / 180;
const SENS_UNIT = (0.022 * Math.PI) / 180; // Radians per mouse count at sensitivity 1.

/**
 * Reads the keyboard and mouse. Look is applied the moment a mouse event arrives, with no smoothing or
 * acceleration, and read directly by the camera each frame. Buttons are sampled once per simulation
 * tick; a press between ticks is held as an edge so it can never be dropped.
 */
export class PlayerInput {
  constructor(element, { getSettings, onLockChange, onAction }) {
    this.element = element;
    this.getSettings = getSettings;
    this.onLockChange = onLockChange;
    this.onAction = onAction;
    this.down = new Set();
    this.edges = new Set();
    this.bindings = new Map();
    this.yaw = 0;
    this.pitch = 0;
    this.lookDX = 0;
    this.lookDY = 0;
    this.locked = false;
    this.rawActive = false;
    this.enabled = false;
    this.grappleToggled = false;
    this.lastLockError = null;
    this.input = {
      forward: 0, strafe: 0, yaw: 0, pitch: 0,
      jump: false, jumpPressed: false, slide: false, sprint: false,
      grapple: false, grapplePressed: false, reelIn: false, reelOut: false, dashPressed: false,
    };
    this.rebuildBindings();

    this.handlers = {
      keydown: (e) => this.onKey(e, true),
      keyup: (e) => this.onKey(e, false),
      mousedown: (e) => this.onButton(e, true),
      mouseup: (e) => this.onButton(e, false),
      mousemove: (e) => this.onMove(e),
      contextmenu: (e) => { if (this.enabled) e.preventDefault(); },
      blur: () => this.clearHeld(),
      pointerlockchange: () => this.onPointerLockChange(),
      pointerlockerror: () => { this.lastLockError = 'error'; },
    };
    window.addEventListener('keydown', this.handlers.keydown);
    window.addEventListener('keyup', this.handlers.keyup);
    window.addEventListener('mousedown', this.handlers.mousedown);
    window.addEventListener('mouseup', this.handlers.mouseup);
    window.addEventListener('contextmenu', this.handlers.contextmenu);
    window.addEventListener('blur', this.handlers.blur);
    document.addEventListener('mousemove', this.handlers.mousemove);
    document.addEventListener('pointerlockchange', this.handlers.pointerlockchange);
    document.addEventListener('pointerlockerror', this.handlers.pointerlockerror);
  }

  rebuildBindings() {
    this.bindings.clear();
    const controls = this.getSettings().controls;
    for (const [action, codes] of Object.entries(controls)) {
      for (const code of codes) this.bindings.set(code, action);
    }
  }

  onKey(e, isDown) {
    if (!this.enabled) return;
    if (e.repeat) { if (this.bindings.has(e.code)) e.preventDefault(); return; }
    const action = this.bindings.get(e.code);
    if (!action) return;
    e.preventDefault();
    this.setAction(action, isDown);
  }

  onButton(e, isDown) {
    if (!this.enabled || !this.locked) return;
    const action = this.bindings.get(`Mouse${e.button}`);
    if (!action) return;
    e.preventDefault();
    this.setAction(action, isDown);
  }

  setAction(action, isDown) {
    if (isDown) {
      if (!this.down.has(action)) this.edges.add(action);
      this.down.add(action);
      if (action === 'restart' || action === 'checkpoint' || action === 'info') this.onAction?.(action, true);
    } else {
      this.down.delete(action);
      if (action === 'info') this.onAction?.(action, false);
    }
  }

  onMove(e) {
    if (!this.locked || !this.enabled) return;
    const s = this.getSettings().mouse;
    const k = s.sensitivity * SENS_UNIT;
    this.yaw -= e.movementX * k;
    this.pitch -= e.movementY * k * (s.invertY ? -1 : 1);
    if (this.pitch > MAX_PITCH) this.pitch = MAX_PITCH;
    if (this.pitch < -MAX_PITCH) this.pitch = -MAX_PITCH;
    this.lookDX += e.movementX;
    this.lookDY += e.movementY;
  }

  /** Must be called from a user gesture. Prefers raw input and falls back cleanly where unsupported. */
  async requestLock() {
    const wantRaw = this.getSettings().mouse.rawInput;
    this.lastLockError = null;
    if (wantRaw) {
      try {
        await this.element.requestPointerLock({ unadjustedMovement: true });
        this.rawActive = true;
        return true;
      } catch {
        this.rawActive = false;
      }
    }
    try {
      await this.element.requestPointerLock();
      return true;
    } catch (err) {
      this.lastLockError = err?.name ?? 'error';
      return false;
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  onPointerLockChange() {
    const nowLocked = document.pointerLockElement === this.element;
    if (nowLocked === this.locked) return;
    this.locked = nowLocked;
    if (!nowLocked) this.clearHeld();
    this.onLockChange?.(nowLocked);
  }

  /** Drops all held state. Keyup events never arrive for keys released while unfocused. */
  clearHeld() {
    this.down.clear();
    this.edges.clear();
    this.grappleToggled = false;
  }

  setLook(yaw, pitch = 0) { this.yaw = yaw; this.pitch = pitch; }

  /** Builds one simulation tick of input. Edges are consumed by the first tick that sees them. */
  sampleTick() {
    const i = this.input;
    const d = this.down, ed = this.edges;
    const g = this.getSettings().gameplay;
    i.forward = (d.has('forward') ? 1 : 0) - (d.has('back') ? 1 : 0);
    i.strafe = (d.has('right') ? 1 : 0) - (d.has('left') ? 1 : 0);
    i.yaw = this.yaw;
    i.pitch = this.pitch;
    i.jump = d.has('jump');
    i.jumpPressed = ed.has('jump');
    i.slide = d.has('slide');
    i.sprint = g.alwaysSprint || d.has('sprint');
    if (g.grappleMode === 'toggle') {
      const press = ed.has('grapple');
      if (press) this.grappleToggled = !this.grappleToggled;
      i.grapple = this.grappleToggled;
      i.grapplePressed = press && this.grappleToggled;
    } else {
      i.grapple = d.has('grapple');
      i.grapplePressed = ed.has('grapple');
    }
    i.reelIn = d.has('reelIn');
    i.reelOut = d.has('reelOut');
    i.dashPressed = ed.has('dash');
    ed.clear();
    return i;
  }

  takeLookDelta(out) {
    out.x = this.lookDX;
    out.y = this.lookDY;
    this.lookDX = 0;
    this.lookDY = 0;
  }

  dispose() {
    window.removeEventListener('keydown', this.handlers.keydown);
    window.removeEventListener('keyup', this.handlers.keyup);
    window.removeEventListener('mousedown', this.handlers.mousedown);
    window.removeEventListener('mouseup', this.handlers.mouseup);
    window.removeEventListener('contextmenu', this.handlers.contextmenu);
    window.removeEventListener('blur', this.handlers.blur);
    document.removeEventListener('mousemove', this.handlers.mousemove);
    document.removeEventListener('pointerlockchange', this.handlers.pointerlockchange);
    document.removeEventListener('pointerlockerror', this.handlers.pointerlockerror);
  }
}
