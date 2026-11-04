/**
 * Force models for ground and air. These only ever change velocity; collision, state and ability
 * decisions live elsewhere. Written as plain functions of (player, input, dt) so each can be
 * unit-tested and read on its own.
 */

/**
 * Ground movement: friction, then acceleration toward the wish direction.
 * Above sprint speed friction becomes proportional and gentle, which is how landings at speed
 * keep their momentum. Acceleration may turn fast velocity but cannot add to it.
 */
export function applyGround(p, input, dt) {
  const cfg = p.cfg;
  const v = p.vel;
  const hasWish = p.wish.x !== 0 || p.wish.z !== 0;
  let speed = Math.hypot(v.x, v.z);

  // Hop window: no friction for a moment after landing, which is the whole bunny-hop rule.
  const inHopWindow = p.groundTime < cfg.hopWindow && p.prevAirTime > 0.14;

  if (!inHopWindow && speed > 1e-4) {
    let next;
    if (speed > cfg.sprintSpeed) {
      const k = hasWish ? cfg.overspeedFriction : cfg.overspeedFriction * 3.5;
      next = speed - (speed - cfg.sprintSpeed) * k * dt - 0.5 * dt;
    } else {
      const control = Math.max(speed, cfg.stopSpeed);
      next = speed - control * cfg.groundFriction * dt;
    }
    next = Math.max(0, next);
    const s = next / speed;
    v.x *= s; v.z *= s;
    speed = next;
  }

  if (hasWish) {
    const wishSpeed = p.wishSpeed(input);
    const current = v.x * p.wish.x + v.z * p.wish.z;
    const add = wishSpeed - current;
    if (add > 0) {
      const a = Math.min(cfg.groundAccel * wishSpeed * dt, add);
      v.x += p.wish.x * a;
      v.z += p.wish.z * a;
      // Accelerating sideways at overspeed turns the player. It must not also add speed.
      const after = Math.hypot(v.x, v.z);
      const limit = Math.max(speed, wishSpeed);
      if (after > limit) {
        const s = limit / after;
        v.x *= s; v.z *= s;
      }
    }
  }

  // Follow the ground plane so running on a ramp neither launches nor drags.
  const n = p.ground.normal;
  if (n.y > 0.01) v.y = -(v.x * n.x + v.z * n.z) / n.y;
}

/**
 * Air movement, as two layers.
 *
 * Momentum is the base velocity: everything earned from running, swinging and dashing. The small wish cap
 * is the classic strafe-jump model, so strafing while turning the mouse into the motion gains speed.
 * Holding forward rotates it toward the look direction, and holding a strafe slowly bends it.
 *
 * Direct strafing sits on top. A and D drive a sideways velocity toward its target as quickly as on the
 * ground, so quick taps flick left and right. It is tracked apart from momentum, so letting go removes
 * exactly what it added and the jump carries on as it was. Combined speed is limited to the larger of the
 * two layers, which means strafing changes direction but can never add speed.
 */
export function applyAir(p, input, dt) {
  const cfg = p.cfg;
  const v = p.vel;
  const st = p.airStrafe;

  // Work on momentum alone. Whatever the strafe layer added last tick comes back off first.
  v.x -= st.offsetX;
  v.z -= st.offsetZ;
  applyAirMomentum(p, input, dt);

  // Drive the strafe layer toward its target, along the view's right axis.
  const targetX = p.right.x * input.strafe * cfg.airStrafeSpeed;
  const targetZ = p.right.z * input.strafe * cfg.airStrafeSpeed;
  const dx = targetX - st.x, dz = targetZ - st.z;
  const gap = Math.hypot(dx, dz);
  const step = cfg.airStrafeRate * dt;
  if (gap <= step) {
    st.x = targetX;
    st.z = targetZ;
  } else {
    st.x += (dx / gap) * step;
    st.z += (dz / gap) * step;
  }

  if (st.x === 0 && st.z === 0) {
    st.offsetX = 0;
    st.offsetZ = 0;
    return;
  }

  const baseX = v.x, baseZ = v.z;
  let x = baseX + st.x, z = baseZ + st.z;
  const limit = Math.max(Math.hypot(baseX, baseZ), Math.hypot(st.x, st.z));
  const combined = Math.hypot(x, z);
  if (combined > limit && combined > 1e-9) {
    const k = limit / combined;
    x *= k;
    z *= k;
  }
  v.x = x;
  v.z = z;
  st.offsetX = x - baseX;
  st.offsetZ = z - baseZ;
}

/** The momentum layer of air movement: strafe-jump gain, low-speed steering, braking and bending. */
function applyAirMomentum(p, input, dt) {
  const cfg = p.cfg;
  const v = p.vel;
  const wx = p.wish.x, wz = p.wish.z;
  if (wx === 0 && wz === 0) return;

  const speed = Math.hypot(v.x, v.z);

  if (speed < cfg.airLowSpeed) {
    const along = v.x * wx + v.z * wz;
    const add = cfg.airLowSpeed - along;
    if (add > 0) {
      const a = Math.min(cfg.airLowAccel * dt, add);
      v.x += wx * a;
      v.z += wz * a;
    }
  }

  const current = v.x * wx + v.z * wz;
  const add = cfg.airWishCap - current;
  if (add > 0) {
    // Pulling directly against motion brakes at a limited rate, so one key can't erase a swing.
    const rate = current < -0.5 ? cfg.airBrake : cfg.airAccel * cfg.sprintSpeed;
    const a = Math.min(rate * dt, add);
    v.x += wx * a;
    v.z += wz * a;
  }

  // A held strafe bends the path: acceleration across the velocity, then speed restored, so a pure turn.
  if (input.strafe !== 0) {
    const s1 = Math.hypot(v.x, v.z);
    if (s1 > 1) {
      const along = (wx * v.x + wz * v.z) / s1;
      const a = cfg.airStrafeSteer * dt;
      v.x += (wx - (v.x / s1) * along) * a;
      v.z += (wz - (v.z / s1) * along) * a;
      const s2 = Math.hypot(v.x, v.z) || 1;
      v.x *= s1 / s2;
      v.z *= s1 / s2;
    }
  }

  if (input.forward > 0 && input.strafe === 0 && speed > 1) {
    const s2 = Math.hypot(v.x, v.z);
    const cross = v.x * wz - v.z * wx;
    const dotv = v.x * wx + v.z * wz;
    const angle = Math.atan2(cross, dotv);
    const step = Math.sign(angle) * Math.min(Math.abs(angle), cfg.airControl * dt);
    if (step !== 0) {
      const c = Math.cos(step), sn = Math.sin(step);
      const x = v.x * c - v.z * sn;
      v.z = v.x * sn + v.z * c;
      v.x = x;
      const s3 = Math.hypot(v.x, v.z) || 1;
      v.x *= s2 / s3; v.z *= s2 / s3;
    }
  }
}

/**
 * Takes the strafe layer back out of the velocity. Called whenever the air model stops applying (landing,
 * catching a wall, a taut rope), so a held strafe key can never be banked as real speed.
 */
export function clearAirStrafe(p) {
  const st = p.airStrafe;
  p.vel.x -= st.offsetX;
  p.vel.z -= st.offsetZ;
  st.x = 0; st.z = 0;
  st.offsetX = 0; st.offsetZ = 0;
}

/** Soft limit: quadratic drag above softSpeedCap. Earned speed fades smoothly and nothing clamps. */
export function applySoftCap(p, dt) {
  const cfg = p.cfg;
  const v = p.vel;
  const speed = Math.hypot(v.x, v.y, v.z);
  if (speed > cfg.softSpeedCap) {
    const over = speed - cfg.softSpeedCap;
    const next = speed - cfg.softDrag * over * speed * dt * 8;
    const s = Math.max(next, cfg.softSpeedCap) / speed;
    v.x *= s; v.y *= s; v.z *= s;
  }
  if (v.y < -cfg.terminalSpeed) v.y = -cfg.terminalSpeed;
}
