import * as THREE from 'three';
import { FLAG_CROUCH, FLAG_GRAPPLE } from './ReplayRecorder.js';

const TRAIL_POINTS = 44;

/** Draws a recorded run as a translucent figure with a light trail and, when swinging, its cable. */
export class GhostRenderer {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.uniforms = { uOpacity: { value: 0.45 }, uColor: { value: new THREE.Color(0.35, 0.82, 1.0) } };
    const fresnel = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: this.uniforms, toneMapped: false, side: THREE.FrontSide,
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform float uOpacity; uniform vec3 uColor; varying vec3 vN; varying vec3 vV; void main(){ float f=pow(clamp(1.0-abs(dot(normalize(vN),normalize(vV))),0.0,1.0),1.6); gl_FragColor=vec4(uColor*(1.0+f*0.6), uOpacity*(0.25+f*0.95)); }`,
    });
    this.material = fresnel;

    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.86, 6, 14), fresnel);
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), fresnel);
    this.group.add(this.body, this.head);

    // Trail: a thin vertical ribbon through recent positions.
    this.trailPos = new Float32Array((TRAIL_POINTS + 1) * 2 * 3);
    this.trailAlpha = new Float32Array((TRAIL_POINTS + 1) * 2);
    const idx = [];
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      this.trailAlpha[a] = this.trailAlpha[a + 1] = 1 - i / TRAIL_POINTS;
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    tg.setAttribute('aA', new THREE.BufferAttribute(this.trailAlpha, 1));
    tg.setIndex(idx);
    this.trail = new THREE.Mesh(tg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, uniforms: this.uniforms,
      vertexShader: `attribute float aA; varying float vA; void main(){ vA=aA; gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uOpacity; uniform vec3 uColor; varying float vA; void main(){ gl_FragColor=vec4(uColor, vA*vA*uOpacity*0.7); }`,
    }));
    this.trail.frustumCulled = false;
    scene.add(this.trail);
    this.trail.visible = false;

    const lineGeo = new THREE.BufferGeometry();
    this.linePos = new Float32Array(6);
    lineGeo.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x6fd4ff, transparent: true, opacity: 0.6, toneMapped: false }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    scene.add(this.line);

    this.player = null;
    this.opacity = 0.45;
  }

  setPlayer(player) {
    this.player = player;
    const on = !!player;
    this.group.visible = on;
    this.trail.visible = on;
    if (!on) this.line.visible = false;
  }

  setOpacity(v) { this.opacity = v; this.uniforms.uOpacity.value = v; }

  /** @param {number} tick Fractional ticks elapsed in the current run. */
  update(tick, camera) {
    if (!this.player) return;
    const s = this.player.sample(tick);
    const crouch = (s.flags & FLAG_CROUCH) !== 0;
    const h = crouch ? 1.05 : 1.8;
    this.group.position.set(s.x, s.y, s.z);
    this.group.rotation.y = s.yaw;
    this.body.scale.y = crouch ? 0.56 : 1;
    this.body.position.y = h * 0.47;
    this.head.position.y = h * 0.92;
    // Fade close up so the ghost is never in the way, and fade out at its end.
    const d = camera.position.distanceTo(this.group.position);
    const nearFade = THREE.MathUtils.smoothstep(d, 1.5, 6);
    const endFade = s.ended ? 0.25 : 1;
    this.uniforms.uOpacity.value = this.opacity * nearFade * endFade;
    this.group.visible = this.uniforms.uOpacity.value > 0.01;

    // Trail built from real recorded samples behind the ghost.
    const data = this.player.replay.data;
    const st = this.player.replay.sampleTicks;
    const head = Math.min(this.player.replay.count - 1, Math.floor(tick / st));
    let px = s.x, py = s.y + 0.9, pz = s.z;
    for (let i = 0; i <= TRAIL_POINTS; i++) {
      const k = Math.max(0, head - i);
      const o = k * 8;
      const x = i === 0 ? px : data[o], y = i === 0 ? py : data[o + 1] + 0.9, z = i === 0 ? pz : data[o + 2];
      const w = 0.09 * (1 - i / TRAIL_POINTS);
      const a = i * 6;
      this.trailPos[a] = x; this.trailPos[a + 1] = y - w; this.trailPos[a + 2] = z;
      this.trailPos[a + 3] = x; this.trailPos[a + 4] = y + w; this.trailPos[a + 5] = z;
    }
    this.trail.geometry.attributes.position.needsUpdate = true;

    const grapple = (s.flags & FLAG_GRAPPLE) !== 0 && s.anchor;
    this.line.visible = !!grapple;
    if (grapple) {
      this.linePos[0] = s.x; this.linePos[1] = s.y + h * 0.7; this.linePos[2] = s.z;
      this.linePos[3] = s.anchor.x; this.linePos[4] = s.anchor.y; this.linePos[5] = s.anchor.z;
      this.line.geometry.attributes.position.needsUpdate = true;
    }
  }

  dispose() {
    this.body.geometry.dispose(); this.head.geometry.dispose(); this.material.dispose();
    this.trail.geometry.dispose(); this.trail.material.dispose();
    this.line.geometry.dispose(); this.line.material.dispose();
  }
}
