/** Interpolated playback of a recorded run, addressed by the current run's elapsed ticks. */
export class ReplayPlayer {
  constructor(replay) {
    this.replay = replay;
    this.state = {
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, speed: 0,
      anchor: null, ended: false,
    };
  }

  get duration() { return this.replay.time ?? (this.replay.count * this.replay.sampleTicks) / 120; }

  /**
   * @param {number} tick Fractional simulation tick since the start of the run.
   * @returns {object} Shared interpolated state. Valid until the next call.
   */
  sample(tick) {
    const { data, sampleTicks, count, anchors } = this.replay;
    const s = this.state;
    if (count === 0) { s.ended = true; return s; }
    const pos = tick / sampleTicks;
    if (pos >= count - 1) {
      const o = (count - 1) * 8;
      s.x = data[o]; s.y = data[o + 1]; s.z = data[o + 2];
      s.yaw = data[o + 3]; s.pitch = data[o + 4]; s.flags = data[o + 5];
      s.speed = data[o + 7];
      s.anchor = null;
      s.ended = true;
      return s;
    }
    const i = Math.max(0, Math.floor(pos));
    const f = Math.max(0, pos - i);
    const a = i * 8, b = a + 8;
    s.x = data[a] + (data[b] - data[a]) * f;
    s.y = data[a + 1] + (data[b + 1] - data[a + 1]) * f;
    s.z = data[a + 2] + (data[b + 2] - data[a + 2]) * f;
    let dy = data[b + 3] - data[a + 3];
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    s.yaw = data[a + 3] + dy * f;
    s.pitch = data[a + 4] + (data[b + 4] - data[a + 4]) * f;
    s.flags = data[a + 5];
    s.speed = data[a + 7] + (data[b + 7] - data[a + 7]) * f;
    const anchorIndex = data[a + 6];
    s.anchor = anchorIndex >= 0 ? anchors[anchorIndex] ?? null : null;
    s.ended = false;
    return s;
  }
}
