/**
 * Records what actually happened in a run as sampled transforms. Sampling (rather than storing
 * inputs and re-simulating) keeps old ghosts valid after movement tuning changes.
 *
 * Fixed rate of one sample every SAMPLE_TICKS. Positions are centimetres, delta-coded. Yaw and
 * pitch are about 0.09 degree steps. Interpolation at 30 Hz is well within what a ghost needs.
 */
export const SAMPLE_TICKS = 4; // 30 Hz at 120 Hz simulation
export const MAX_REPLAY_BYTES = 512 * 1024;
const MAX_SAMPLES = 30 * 60 * 15;

export const FLAG_GRAPPLE = 1;
export const FLAG_CROUCH = 2;
export const FLAG_WALL = 4;
export const FLAG_DASH = 8;
export const FLAG_GROUND = 16;

export class ReplayRecorder {
  constructor() { this.reset(); }

  reset() {
    this.data = [];
    this.events = [];
    this.tick = 0;
    this.overflow = false;
  }

  /** Call once per simulation tick while a run is live. */
  record(player) {
    if (this.tick % SAMPLE_TICKS === 0) {
      if (this.data.length / 8 >= MAX_SAMPLES) {
        this.overflow = true;
      } else {
        let flags = 0;
        if (player.grapple.attached) flags |= FLAG_GRAPPLE;
        if (player.crouched) flags |= FLAG_CROUCH;
        if (player.wall.active) flags |= FLAG_WALL;
        if (player.dash.active) flags |= FLAG_DASH;
        if (player.machine.grounded) flags |= FLAG_GROUND;
        const speed = Math.hypot(player.vel.x, player.vel.y, player.vel.z);
        this.data.push(
          player.pos.x, player.pos.y, player.pos.z,
          player.yaw, player.pitch,
          flags,
          player.grapple.attached ? this.anchorIndexFor(player) : -1,
          speed,
        );
      }
    }
    this.tick++;
  }

  anchorIndexFor(player) {
    const a = player.grapple.anchor;
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (e.x === a.x && e.y === a.y && e.z === a.z) return i;
    }
    this.events.push({ x: a.x, y: a.y, z: a.z });
    return this.events.length - 1;
  }

  /** Finishes into a compact record ready for encodeReplay. */
  finish(meta) {
    return {
      version: 1,
      sampleTicks: SAMPLE_TICKS,
      count: this.data.length / 8,
      data: this.data,
      anchors: this.events,
      ...meta,
    };
  }
}

const b64encode = (bytes) => {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
};
const b64decode = (text) => {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

/**
 * Binary layout per sample: Int32 x,y,z deltas in cm packed through Int16 when small, using a
 * varint scheme: every value is zig-zag varint encoded. Typical samples take 11 to 14 bytes.
 */
export function encodeReplay(replay) {
  const out = [];
  const writeVarint = (v) => {
    let z = v >= 0 ? v * 2 : -v * 2 - 1;
    while (z >= 128) { out.push((z % 128) | 128); z = Math.floor(z / 128); }
    out.push(z);
  };
  const s = replay.data;
  let px = 0, py = 0, pz = 0, pyaw = 0, ppitch = 0, pspeed = 0;
  for (let i = 0; i < replay.count; i++) {
    const o = i * 8;
    const x = Math.round(s[o] * 100), y = Math.round(s[o + 1] * 100), z = Math.round(s[o + 2] * 100);
    const yaw = Math.round((s[o + 3] * 2048) / Math.PI), pitch = Math.round((s[o + 4] * 2048) / Math.PI);
    const speed = Math.round(s[o + 7] * 10);
    writeVarint(x - px); writeVarint(y - py); writeVarint(z - pz);
    writeVarint(yaw - pyaw); writeVarint(pitch - ppitch);
    writeVarint(s[o + 5]);
    writeVarint(s[o + 6]);
    writeVarint(speed - pspeed);
    px = x; py = y; pz = z; pyaw = yaw; ppitch = pitch; pspeed = speed;
  }
  const { data, ...head } = replay;
  void data;
  return JSON.stringify({ ...head, b: b64encode(Uint8Array.from(out)) });
}

export function decodeReplay(text) {
  const parsed = JSON.parse(text);
  if (parsed.version !== 1 || typeof parsed.b !== 'string') throw new Error('Unsupported replay format');
  const bytes = b64decode(parsed.b);
  let i = 0;
  const readVarint = () => {
    let shift = 1, result = 0, b;
    do {
      b = bytes[i++];
      result += (b & 127) * shift;
      shift *= 128;
    } while (b >= 128);
    return result % 2 === 0 ? result / 2 : -(result + 1) / 2;
  };
  const data = new Array(parsed.count * 8);
  let x = 0, y = 0, z = 0, yaw = 0, pitch = 0, speed = 0;
  for (let n = 0; n < parsed.count; n++) {
    x += readVarint(); y += readVarint(); z += readVarint();
    yaw += readVarint(); pitch += readVarint();
    const flags = readVarint();
    const anchor = readVarint();
    speed += readVarint();
    const o = n * 8;
    data[o] = x / 100; data[o + 1] = y / 100; data[o + 2] = z / 100;
    data[o + 3] = (yaw * Math.PI) / 2048; data[o + 4] = (pitch * Math.PI) / 2048;
    data[o + 5] = flags; data[o + 6] = anchor; data[o + 7] = speed / 10;
  }
  const { b, ...head } = parsed;
  void b;
  return { ...head, data };
}
