import * as THREE from 'three';

const VERT = /* glsl */`
  attribute float aT;
  attribute float aSide;
  uniform vec3 uStart, uEnd, uCam;
  uniform float uExtend, uSlack, uTime, uWidth, uTension, uRipple;
  varying float vSide;
  varying float vT;
  vec3 pointAt(float t) {
    float reach = t * uExtend;
    vec3 p = mix(uStart, uEnd, reach);
    float len = distance(uStart, uEnd);
    float envelope = sin(reach * 3.14159);
    // Slack sags under its own weight and flattens out as tension comes up.
    p.y -= envelope * uSlack * len * 0.06;
    // A travelling ripple runs out on firing, then a faint hum under load.
    vec3 axis = normalize(uEnd - uStart + vec3(1e-4));
    vec3 s = normalize(cross(axis, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
    vec3 n = cross(s, axis);
    float rip = sin(reach * 26.0 - uTime * 42.0) * envelope * uRipple * 0.28;
    float hum = sin(reach * 58.0 + uTime * 90.0) * envelope * uTension * 0.012;
    return p + s * rip + n * (rip * 0.6 + hum);
  }
  void main() {
    vec3 p = pointAt(aT);
    vec3 q = pointAt(min(aT + 0.012, 1.0));
    vec3 tangent = normalize(q - p + vec3(0.0, 1e-5, 0.0));
    vec3 toCam = normalize(uCam - p);
    vec3 side = normalize(cross(tangent, toCam));
    // Keep at least about 1.4 px at any distance so the cable never breaks up.
    float dist = distance(uCam, p);
    float w = max(uWidth, dist * 0.00085);
    p += side * aSide * w;
    vSide = aSide;
    vT = aT;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;

const FRAG = /* glsl */`
  precision highp float;
  varying float vSide;
  varying float vT;
  uniform float uTension, uExtend;
  void main() {
    if (vT > 1.0) discard;
    float x = abs(vSide);
    // Bright filament with a dark sheath: reads on white concrete and on blue sky alike.
    float core = smoothstep(0.62, 0.18, x);
    float alpha = smoothstep(1.0, 0.72, x);
    vec3 sheath = vec3(0.04, 0.07, 0.1);
    vec3 glow = mix(vec3(0.7, 1.6, 1.9), vec3(1.4, 2.0, 2.2), uTension);
    gl_FragColor = vec4(mix(sheath, glow, core), alpha);
  }`;

/** The grapple cable: one thin camera-facing ribbon, shaped entirely in the vertex shader. */
export class CableRenderer {
  constructor(scene) {
    const segments = 48;
    const count = (segments + 1) * 2;
    const t = new Float32Array(count), side = new Float32Array(count), pos = new Float32Array(count * 3);
    const index = [];
    for (let i = 0; i <= segments; i++) {
      t[i * 2] = t[i * 2 + 1] = i / segments;
      side[i * 2] = -1; side[i * 2 + 1] = 1;
      if (i < segments) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aT', new THREE.BufferAttribute(t, 1));
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    g.setIndex(index);
    this.uniforms = {
      uStart: { value: new THREE.Vector3() }, uEnd: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() },
      uExtend: { value: 0 }, uSlack: { value: 0 }, uTime: { value: 0 }, uWidth: { value: 0.011 },
      uTension: { value: 0 }, uRipple: { value: 0 },
    };
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.extend = 0;
    this.active = false;
    this.ripple = 0;
    this.retract = 0;
  }

  /** Physics has already attached. This only draws the visual catching up, in under 0.1 s. */
  attach() { this.active = true; this.extend = 0; this.ripple = 1; this.retract = 0; }
  release() { this.active = false; this.retract = 1; }
  cancel() { this.active = false; this.retract = 0; this.mesh.visible = false; }

  update(dt, time, start, end, camera, tension, slack) {
    const u = this.uniforms;
    if (this.active) {
      this.extend = Math.min(1, this.extend + dt / 0.085);
      this.ripple = Math.max(0, this.ripple - dt * 2.4);
      u.uStart.value.copy(start);
      u.uEnd.value.copy(end);
      this.mesh.visible = true;
    } else if (this.retract > 0) {
      this.retract = Math.max(0, this.retract - dt / 0.09);
      this.extend = this.retract;
      u.uStart.value.copy(start);
      this.mesh.visible = this.retract > 0;
    } else {
      this.mesh.visible = false;
      return;
    }
    u.uCam.value.copy(camera.position);
    u.uExtend.value = this.extend;
    u.uTime.value = time;
    u.uRipple.value = this.ripple;
    u.uTension.value += (tension - u.uTension.value) * Math.min(1, dt * 14);
    u.uSlack.value += (slack - u.uSlack.value) * Math.min(1, dt * 14);
  }

  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
