import * as THREE from 'three';

/**
 * First-person forearm and grapple device. Built from primitives in its own small scene, drawn after
 * the world with a cleared depth buffer, so it never clips into walls and keeps a stable size at any
 * world FOV. Compact on purpose: a bracer on the wrist, not a gun.
 */
export class Viewmodel {
  constructor(envIntensity = 0.9) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.01, 10);
    this.root = new THREE.Group();
    this.arm = new THREE.Group();
    this.root.add(this.arm);
    this.scene.add(this.root);

    const fabric = new THREE.MeshStandardMaterial({ color: 0x1f2329, roughness: 0.82, metalness: 0 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.68, metalness: 0.05 });
    const shell = new THREE.MeshStandardMaterial({ color: 0xeee9df, roughness: 0.34, metalness: 0.02 });
    const alu = new THREE.MeshStandardMaterial({ color: 0xb4b8bc, roughness: 0.3, metalness: 0.95 });
    this.led = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.35, 1.6), toneMapped: false });
    this.materials = [fabric, glove, shell, alu, this.led];

    // Local Z runs along the forearm with -Z toward the hand.
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.041, 0.46, 20, 1).rotateX(Math.PI / 2), fabric);
    forearm.position.z = 0.26;
    forearm.scale.x = 1.12;
    this.arm.add(forearm);

    // Bracer: ceramic shell with a seam, an aluminium collar and a status line.
    const bracer = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.046, 0.11, 24, 1).rotateX(Math.PI / 2), shell);
    bracer.position.z = 0.03;
    bracer.scale.x = 1.1;
    this.arm.add(bracer);
    const collarA = new THREE.Mesh(new THREE.TorusGeometry(0.0465, 0.0034, 8, 32), alu);
    collarA.position.z = -0.026;
    collarA.scale.x = 1.1;
    this.arm.add(collarA);
    const collarB = collarA.clone();
    collarB.position.z = 0.086;
    collarB.scale.set(1.1, 1.07, 1);
    this.arm.add(collarB);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.0024, 0.08), this.led);
    line.position.set(-0.031, 0.0405, 0.03);
    line.rotation.z = 0.56;
    this.arm.add(line);

    // Spool and emitter sit on top of the wrist.
    this.spool = new THREE.Group();
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.026, 20).rotateZ(Math.PI / 2), alu);
    this.spool.add(drum);
    for (let i = 0; i < 3; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.003, 0.003), fabric);
      spoke.rotation.x = (i / 3) * Math.PI;
      spoke.position.x = 0;
      this.spool.add(spoke);
    }
    this.spool.position.set(0, 0.058, 0.05);
    this.arm.add(this.spool);

    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.009, 0.075), shell);
    housing.position.set(0, 0.0525, 0.012);
    this.arm.add(housing);
    this.emitter = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0052, 0.0072, 0.05, 12).rotateX(Math.PI / 2), alu);
    this.emitter.add(barrel);
    const tip = new THREE.Mesh(new THREE.TorusGeometry(0.0056, 0.0013, 6, 16), this.led);
    tip.position.z = -0.026;
    this.emitter.add(tip);
    this.emitter.position.set(0, 0.0545, -0.04);
    this.arm.add(this.emitter);
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.z = -0.028;
    this.emitter.add(this.muzzle);

    // Gloved fist.
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.034, 0.08, 2, 2, 2), glove);
    palm.position.set(0, -0.004, -0.07);
    roundOut(palm.geometry, 0.018);
    this.arm.add(palm);
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.038, 4, 8), glove);
      finger.rotation.x = Math.PI / 2 + 0.5;
      finger.position.set(-0.027 + i * 0.018, -0.019, -0.117);
      this.arm.add(finger);
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0105, 0.034, 4, 8), glove);
    thumb.rotation.set(Math.PI / 2, 0.7, 0);
    thumb.position.set(-0.041, -0.009, -0.085);
    this.arm.add(thumb);

    // Angled in across the view and dropped low, so the hand and device show but never block aim.
    this.arm.rotation.set(0.3, 0.62, -0.22);
    this.root.scale.setScalar(0.92);
    this.root.position.set(0.27, -0.205, -0.42);

    this.key = new THREE.DirectionalLight(0xffffff, 2.6);
    this.key.position.set(0.3, 1, 0.4);
    this.scene.add(this.key, this.key.target);
    this.scene.environmentIntensity = envIntensity;

    this.kick = 0;
    this.kickVel = 0;
    this.spin = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.visible = true;
    this.basePos = this.root.position.clone();
    this.baseRot = this.arm.rotation.clone();
    this._v = new THREE.Vector3();
  }

  setEnvironment(texture, sunDir, sunColor, sunIntensity) {
    this.scene.environment = texture;
    this.key.position.copy(sunDir).multiplyScalar(3);
    this.key.color.copy(sunColor);
    this.key.intensity = sunIntensity * 0.5;
  }

  fire() { this.kickVel = 3.6; }

  /**
   * @param {number} dt Frame seconds.
   * @param {object} s Camera-space motion hints {lookDX, lookDY, speed, grappled, reeling, bob, slide, reduce}
   */
  update(dt, s) {
    // Critically damped spring for the fire recoil. Purely visual, never touches aim.
    const w = 34;
    this.kickVel += (-w * w * this.kick - 2 * w * this.kickVel) * dt;
    this.kick += this.kickVel * dt;
    const k = Math.min(1, dt * 11);
    const motion = s.reduce ? 0.3 : 1;
    this.swayX += (THREE.MathUtils.clamp(-s.lookDX * 0.0009, -0.024, 0.024) * motion - this.swayX) * k;
    this.swayY += (THREE.MathUtils.clamp(s.lookDY * 0.0009, -0.024, 0.024) * motion - this.swayY) * k;

    const lift = s.grappled ? 0.022 : 0;
    this.root.position.set(
      this.basePos.x + this.swayX + s.bobX * 0.005 * motion,
      this.basePos.y + this.swayY + lift + s.bobY * 0.006 * motion - (s.slide ?? 0) * 0.018,
      this.basePos.z + this.kick * 0.35,
    );
    this.arm.rotation.set(
      this.baseRot.x + (s.grappled ? 0.24 : 0) * 0.7 + this.kick * 2.2,
      this.baseRot.y + (s.grappled ? 0.06 : 0),
      this.baseRot.z + (s.tilt ?? 0) * 0.6,
    );

    this.spin += dt * (s.grappled ? (s.reeling ? 24 * -s.reeling : 2) : 0.4);
    this.spool.rotation.x = this.spin;
  }

  /** Muzzle position in world space, projected through the world camera so cable and hand line up. */
  muzzleWorld(worldCamera, out) {
    this.root.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    this.muzzle.getWorldPosition(this._v);
    this._v.project(this.camera);
    // Unproject on a nearby plane in the world camera: same pixel, a small distance from the eye.
    this._v.z = 0.0;
    out.copy(this._v).unproject(worldCamera);
    const dir = out.sub(worldCamera.position).normalize();
    return out.copy(worldCamera.position).addScaledVector(dir, 0.65);
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.scene.traverse((o) => o.geometry?.dispose());
    for (const m of this.materials) m.dispose();
  }
}

/** Pulls box corners toward the nearest point on a smaller box, rounding it off. */
function roundOut(geometry, r) {
  geometry.computeBoundingBox();
  const b = geometry.boundingBox;
  const p = geometry.attributes.position;
  const v = new THREE.Vector3(), inner = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    inner.set(
      THREE.MathUtils.clamp(v.x, b.min.x + r, b.max.x - r),
      THREE.MathUtils.clamp(v.y, b.min.y + r, b.max.y - r),
      THREE.MathUtils.clamp(v.z, b.min.z + r, b.max.z - r),
    );
    v.sub(inner).normalize().multiplyScalar(r).add(inner);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
}
