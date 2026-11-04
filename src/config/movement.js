/**
 * Central movement tuning. All values are SI: metres, seconds, m/s, m/s².
 * Everything the player feels is defined here, nothing else hardcodes a feel constant.
 * See docs/MOVEMENT.md for the momentum rules these numbers serve.
 */
export const TICK_RATE = 120;
export const TICK_DT = 1 / TICK_RATE;

export const MOVEMENT = Object.freeze({
  // Body. A 0.4 m radius keeps corners forgiving; the crouched height fits under 1.2 m gaps.
  radius: 0.4,
  standHeight: 1.8,
  crouchHeight: 1.05,
  eyeStand: 1.62,
  eyeCrouch: 0.86,
  stepHeight: 0.5,
  maxSlopeDeg: 50,

  // Gravity above Earth's 9.8: a heavier body lands sooner, so jumps stay decisive at high speed.
  gravity: 25,
  terminalSpeed: 75,

  // Ground. Accel multiplies target speed (Quake convention): 13 reaches sprint in about 0.1 s.
  runSpeed: 8.2,
  sprintSpeed: 11,
  crouchSpeed: 4.2,
  groundAccel: 13,
  groundFriction: 8,
  stopSpeed: 3.5,
  // Above sprint speed friction is proportional and gentle, so earned speed bleeds off rather
  // than being cut. At 1.1/s, 25 m/s takes about 1.3 s to fall back to 15 m/s on the ground.
  overspeedFriction: 1.1,

  // Jump. Apex is v²/2g = 1.48 m, flat airtime 0.69 s, so a sprint jump clears about 7.6 m.
  jumpSpeed: 8.6,
  jumpCutFactor: 0.72,
  coyoteTime: 0.1,
  jumpBuffer: 0.11,

  // Bunny hop. Friction is withheld for this long after landing; jump inside it and lose nothing.
  hopWindow: 0.11,
  hopPerfectWindow: 0.03,
  // Small reward for a frame-tight hop, capped so hopping alone cannot run away.
  hopPerfectBonus: 0.35,
  hopBonusCap: 21,

  // Air. Small wish cap with strong accel is what makes air strafing gain speed.
  airWishCap: 1.5,
  airAccel: 14,
  airBrake: 9,
  // Below this speed the player gets plain air steering, so standing jumps can still reach a ledge.
  airLowSpeed: 7,
  airLowAccel: 15,
  // Rotates velocity toward look when only forward is held. Direction changes, speed does not.
  airControl: 1.5,
  // Direct air strafing. A and D set a sideways velocity at the same speed and rate as strafing on the
  // ground, so tapping between them flicks left and right. Layered over momentum: see applyAir.
  airStrafeSpeed: 8.2,
  airStrafeRate: 200,
  // Holding a strafe also slowly bends the path itself, so a long hold really changes direction.
  airStrafeSteer: 16,

  // Beyond softCap quadratic drag applies. Earned speed fades smoothly and nothing clamps.
  softSpeedCap: 42,
  softDrag: 0.0035,

  // Slide. Exponential friction: 0.75/s keeps 47 percent of speed after a second.
  slideEnterSpeed: 6,
  slideExitSpeed: 3.6,
  slideFriction: 0.75,
  slideFatigueStart: 1.1,
  slideFatigueFriction: 3.2,
  slideBoost: 2.6,
  slideBoostMaxSpeed: 16,
  slideBoostCooldown: 1.4,
  // On a slope friction is a fraction of the flat value. Ramps accelerate; kickers launch.
  slideDescentFriction: 0.22,
  slideGravityScale: 0.92,
  slideSteer: 1.3,

  // Wall run. Reduced gravity for 60 percent of the duration, then a ramp back to full.
  wallProbe: 0.7,
  wallMaxNormalY: 0.26,
  wallEntrySpeed: 6.2,
  wallRunSpeed: 12.5,
  wallRunAccel: 14,
  wallRunGravityScale: 0.16,
  wallRunMaxTime: 2.1,
  wallRunRampStart: 0.6,
  wallEntryLift: 1.3,
  wallMinClearance: 0.55,
  wallRelatchLockout: 0.3,
  wallJumpOut: 7.2,
  wallJumpUp: 8.8,
  wallJumpLookBoost: 2.2,
  wallCoyoteTime: 0.13,
  wallKickOut: 6.2,
  wallKickUp: 8.9,
  wallKickProbe: 0.7,

  // Grapple. Immediate; visuals never delay it. Length is locked at attach minus a small take-up
  // that makes the rope bite without becoming a continuous pull.
  grappleRange: 62,
  grappleMinLength: 2.5,
  grappleTakeUp: 0.1,
  grappleTakeUpMax: 4,
  grappleTakeUpRate: 11,
  grappleCooldown: 0.12,
  grappleAssistDegrees: 4.5,
  grappleReelInSpeed: 15,
  grappleReelOutSpeed: 11,
  grappleMaxLength: 75,
  grappleMaxCorrectionSpeed: 24,
  grappleLosGrace: 0.22,
  swingAccel: 8.5,
  swingMaxSpeed: 34,
  grappleReleaseHop: 3.6,

  // Air dash. Falls off with speed already along the dash, so it steers more than it accelerates.
  dashCharges: 2,
  dashImpulse: 11.5,
  dashMinGain: 2.5,
  dashFalloffSpeed: 30,
  dashTime: 0.16,
  dashGravityScale: 0.12,
  dashFallBrake: 0.3,
  dashCooldown: 0.28,

  // Landing and ledges.
  landingTime: 0.12,
  groundProbe: 0.07,
  groundSnap: 0.42,
  vaultReach: 1.45,
  vaultMinHeight: 0.35,

  // Render-side response. These never touch the simulation.
  fovSpeedStart: 13,
  fovSpeedFull: 38,
  fovSpeedGain: 13,
  cameraTiltDegrees: 7,
});

/** Per-run movement assists. Exposed in settings. Defaults are what time trials expect. */
export const DEFAULT_ASSIST = Object.freeze({
  grappleAim: true,
  ledgeVault: true,
  autoHop: false,
});

export const createConfig = (overrides = {}) => Object.freeze({ ...MOVEMENT, ...overrides });
