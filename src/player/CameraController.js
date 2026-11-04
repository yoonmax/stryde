import * as THREE from 'three';
import { Locomotion as L } from './MovementStateMachine.js';

const DEG = Math.PI / 180;

/**
 * Places the render camera from simulation state. Position is interpolated between the two most
 * recent ticks. Look is read straight from the mouse each frame with no interpolation, so aim response
 * is never delayed. Everything else here is optional dressing, and none of it feeds back into physics.
 */
export class CameraController {
  constructor(camera) {
    this.camera = camera;
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.eyeHeight = 1.62;
    this.stepOffset = 0;
    this.roll = 0;
    this.fovBoost = 0;
    this.dashKick = 0;
    this.dipPos = 0;
    this.dipVel = 0;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.shake = 0;
    this.bobOut = { x: 0, y: 0 };
    this.tick = 0;
  }

  reset(eyeHeight) {
    this.eyeHeight = eyeHeight;
    this.stepOffset = 0;
    this.roll = 0;
    this.dipPos = 0;
    this.dipVel = 0;
    this.dashKick = 0;
    this.shake = 0;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.fovBoost = 0;
  }

  onEvent(e, cam) {
    if (e.type === 'land' && cam.landing && !cam.reduceMotion) {
      const impact = Math.min(1, Math.max(0, (e.impact - 4) / 20));
      this.dipVel -= 0.8 + impact * 2.8;
      if (impact > 0.55) this.shake = Math.max(this.shake, (impact - 0.55) * cam.shake);
    }
    if (e.type === 'dash' && !cam.reduceMotion) this.dashKick = 1;
  }

  /** Compensates for an instantaneous step-up, so climbing a kerb feels like a smooth rise. */
  onStep(rise) { this.stepOffset -= rise; }

  /**
   * @param {number} dt Frame seconds. @param {number} alpha Interpolation in [0,1] between ticks.
   * @param {object} p Player. @param {number} yaw Live yaw. @param {number} pitch Live pitch.
   * @param {object} cam settings.camera
   */
  update(dt, alpha, p, yaw, pitch, cam) {
    const cfg = p.cfg;
    const c = this.camera;
    const x = p.prevPos.x + (p.pos.x - p.prevPos.x) * alpha;
    const y = p.prevPos.y + (p.pos.y - p.prevPos.y) * alpha;
    const z = p.prevPos.z + (p.pos.z - p.prevPos.z) * alpha;

    const targetEye = p.crouched ? cfg.eyeCrouch : cfg.eyeStand;
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, dt * 14);
    this.stepOffset *= Math.exp(-dt * 16);

    // Landing dip: a damped spring, so it settles on its own and at any frame rate.
    const w = 13;
    this.dipVel += (-w * w * this.dipPos - 2 * 0.72 * w * this.dipVel) * dt;
    this.dipPos += this.dipVel * dt;

    const speed = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
    const speedH = Math.hypot(p.vel.x, p.vel.z);

    // Head bob. Advanced by distance, so it stays in step with the footsteps and with running speed.
    const running = p.machine.is(L.RUNNING) && !p.crouched;
    const bobTarget = cam.headBob && !cam.reduceMotion && running ? Math.min(1, speedH / cfg.sprintSpeed) : 0;
    this.bobAmount += (bobTarget - this.bobAmount) * Math.min(1, dt * 8);
    if (running) this.bobPhase += speedH * dt * 0.78;
    const bobY = Math.sin(this.bobPhase * 2) * this.bobAmount;
    const bobX = Math.cos(this.bobPhase) * this.bobAmount;
    this.bobOut.x = bobX;
    this.bobOut.y = bobY;

    // Roll: wall-run lean plus a slight bank in slides. Scaled by the player's setting.
    let rollTarget = 0;
    if (p.wall.active) rollTarget = -p.wall.sideOfView() * cfg.cameraTiltDegrees * DEG;
    else if (p.machine.is(L.SLIDING)) rollTarget = 2.2 * DEG;
    rollTarget *= cam.reduceMotion ? 0 : cam.tilt;
    this.roll += (rollTarget - this.roll) * Math.min(1, dt * 9);

    this.shake = Math.max(0, this.shake - dt * 2.8);
    const shake = this.shake;
    const sx = shake ? Math.sin(performance.now() * 0.071) * shake * 0.014 : 0;
    const sy = shake ? Math.sin(performance.now() * 0.093) * shake * 0.014 : 0;

    c.position.set(
      x + Math.cos(yaw) * bobX * 0.012 + sx,
      y + this.eyeHeight + this.stepOffset + this.dipPos * 0.34 + bobY * 0.016 + sy,
      z - Math.sin(yaw) * bobX * 0.012,
    );
    this.euler.set(pitch, yaw, this.roll);
    c.quaternion.setFromEuler(this.euler);

    // Field of view: the base value plus a gentle widening with speed.
    this.dashKick = Math.max(0, this.dashKick - dt * 4.6);
    let boost = 0;
    if (cam.speedFov && !cam.reduceMotion) {
      const t = Math.min(1, Math.max(0, (speed - cfg.fovSpeedStart) / (cfg.fovSpeedFull - cfg.fovSpeedStart)));
      boost = t * t * (3 - 2 * t) * cfg.fovSpeedGain;
      boost += this.dashKick * this.dashKick * 3.2;
    }
    this.fovBoost += (boost - this.fovBoost) * Math.min(1, dt * 7);
    const fov = cam.fov + this.fovBoost;
    if (Math.abs(c.fov - fov) > 0.01) {
      c.fov = fov;
      c.updateProjectionMatrix();
    }
  }
}
