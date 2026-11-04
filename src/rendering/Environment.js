import * as THREE from 'three';
import { sharedUniforms } from './Materials.js';

/**
 * Atmosphere presets, one per course, so each is recognisable from its light alone.
 * `elevation` and `azimuth` place the sun in degrees. Azimuth 0 is toward -Z, the travel direction.
 */
export const ENVIRONMENTS = {
  morning: {
    elevation: 33, azimuth: 42, sun: 0xfff0dc, sunIntensity: 3.1,
    zenith: 0x2f70c6, mid: 0x7fb3e6, horizon: 0xd9e8f2, glow: 0xffdfb8,
    envIntensity: 0.61, fog: 0xc8def0, fogDensity: 0.00060,
    cloudY: -130, cloudLit: 0xffffff, cloudShade: 0x8fb2d6, cirrus: 0.55, exposure: 1,
  },
  golden: {
    elevation: 13, azimuth: -58, sun: 0xffd6a8, sunIntensity: 2.8,
    zenith: 0x3a6db3, mid: 0x9db8d6, horizon: 0xf6dcc0, glow: 0xffb675,
    envIntensity: 0.62, ambientMix: 0.55, ambientHorizon: 0xe6e2dc, bounce: 0xf0e4d8, fog: 0xe6cfb8, fogDensity: 0.00075,
    cloudY: -130, cloudLit: 0xfff0d8, cloudShade: 0x8d93b8, cirrus: 0.75, exposure: 1,
  },
  zenith: {
    elevation: 58, azimuth: 120, sun: 0xfff8ee, sunIntensity: 3.0,
    zenith: 0x1a57b0, mid: 0x4f96e0, horizon: 0xd8edf8, glow: 0xffffff,
    envIntensity: 0.68, fog: 0xc6e0f4, fogDensity: 0.00045,
    cloudY: -170, cloudLit: 0xffffff, cloudShade: 0x9cc0e0, cirrus: 0.3, exposure: 1,
  },
  afternoon: {
    elevation: 34, azimuth: -130, sun: 0xfff0dc, sunIntensity: 3.1,
    zenith: 0x2a79b8, mid: 0x74bcd6, horizon: 0xdff0ea, glow: 0xffe2b8,
    envIntensity: 0.61, fog: 0xc8e6e4, fogDensity: 0.00060,
    cloudY: -150, cloudLit: 0xfffdf4, cloudShade: 0x86b6c4, cirrus: 0.5, exposure: 1,
  },
  dusk: {
    elevation: 7, azimuth: 28, sun: 0xffd2b8, sunIntensity: 2.7,
    zenith: 0x24316e, mid: 0x7a6aa8, horizon: 0xf7a97c, glow: 0xff8a52,
    envIntensity: 0.7, ambientMix: 0.45, ambientHorizon: 0xc9c6dc, bounce: 0xd8c8cc, fog: 0xd99a88, fogDensity: 0.00070,
    cloudY: -160, cloudLit: 0xffc8a0, cloudShade: 0x5d5a94, cirrus: 0.9, exposure: 1,
  },
  commons: {
    elevation: 42, azimuth: 70, sun: 0xfff2e0, sunIntensity: 3.3,
    zenith: 0x2a6cc0, mid: 0x76aee6, horizon: 0xe2eff6, glow: 0xffefd0,
    envIntensity: 0.66, fog: 0xd0e4f2, fogDensity: 0.00055,
    cloudY: -110, cloudLit: 0xffffff, cloudShade: 0x98bcdc, cirrus: 0.45, exposure: 1,
  },
};

const color = (hex) => new THREE.Color(hex);

export function sunDirection(env, out = new THREE.Vector3()) {
  const el = THREE.MathUtils.degToRad(env.elevation);
  const az = THREE.MathUtils.degToRad(env.azimuth);
  return out.set(-Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = modelViewMatrix * vec4(position, 0.0);
    gl_Position = (projectionMatrix * vec4(p.xyz, 1.0)).xyww;
  }`;

const SKY_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vDir;
  uniform vec3 uZenith, uMid, uHorizon, uGlow, uSunColor, uSunDir, uCloudShade;
  uniform sampler2D uNoise;
  uniform float uCirrus, uTime, uHdr;
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, -1.0, 1.0);
    float up = max(h, 0.0);
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, up));
    col = mix(col, uZenith, smoothstep(0.12, 0.85, up));
    // Below the horizon the sky is the far edge of the cloud deck.
    col = mix(col, mix(uHorizon, uCloudShade, 0.35), smoothstep(0.0, -0.06, h));

    float s = max(dot(d, uSunDir), 0.0);
    col += uGlow * pow(s, 4.0) * 0.22;
    col += uGlow * pow(s, 32.0) * 0.45;

    // High cirrus: stretched noise projected onto a far plane.
    if (d.y > 0.01) {
      vec2 uv = d.xz / (d.y + 0.18);
      float a = texture2D(uNoise, uv * 0.11 + uTime * vec2(0.0008, 0.0003)).b;
      float b = texture2D(uNoise, uv * vec2(0.07, 0.21) - uTime * 0.0005).r;
      float c = smoothstep(0.42, 0.78, a * 0.6 + b * 0.5) * uCirrus * smoothstep(0.01, 0.2, d.y);
      col = mix(col, mix(vec3(1.0), uGlow, 0.35 + 0.5 * pow(s, 3.0)), c * 0.72);
    }

    // Sun disc, HDR when rendered for display so bloom has something real to catch.
    float disc = smoothstep(0.99955, 0.99985, s);
    col += uSunColor * disc * uHdr;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

const CLOUD_VERT = /* glsl */`
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const CLOUD_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vWorld;
  uniform vec3 uLit, uShade, uHorizon, uSunDir, uCam, uGlow;
  uniform sampler2D uNoise;
  uniform float uTime;
  void main() {
    vec2 p = vWorld.xz;
    vec2 wind = vec2(uTime * 1.6, uTime * 0.7);
    float big = texture2D(uNoise, (p + wind) * 0.00062).r;
    float mid = texture2D(uNoise, (p - wind * 0.6) * 0.0024).r;
    float fine = texture2D(uNoise, (p + wind * 1.3) * 0.0096).g;
    float h = big * 0.62 + mid * 0.28 + fine * 0.1;

    // Light from a sample offset toward the sun: tops facing it brighten, far sides fall into shade.
    vec2 toSun = normalize(uSunDir.xz + 1e-4) * 34.0;
    float hs = texture2D(uNoise, (p + wind + toSun) * 0.00062).r * 0.62
             + texture2D(uNoise, (p - wind * 0.6 + toSun) * 0.0024).r * 0.28
             + texture2D(uNoise, (p + wind * 1.3 + toSun) * 0.0096).g * 0.1;
    float lit = clamp(0.66 + (h - hs) * 6.0 + (h - 0.5) * 0.9, 0.0, 1.0);
    vec3 col = mix(mix(uShade, uLit, 0.42), uLit, lit);

    vec3 view = vWorld - uCam;
    float dist = length(view);
    vec3 dir = view / dist;
    float s = max(dot(dir, uSunDir), 0.0);
    col += uGlow * pow(s, 6.0) * 0.18;

    // Dissolve into the horizon so the deck has no visible edge.
    float fade = smoothstep(350.0, 3800.0, dist);
    col = mix(col, uHorizon * 0.92 + uShade * 0.08, fade);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

/**
 * Sky dome, cloud deck, sun and fog. Holds one baked environment map per preset, generated the first
 * time a preset is used, so switching courses does not re-bake.
 */
export class Environment {
  constructor(renderer, scene, noiseTexture) {
    this.renderer = renderer;
    this.scene = scene;
    this.noise = noiseTexture;
    this.current = null;
    this.envMaps = new Map();
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this._sunView = new THREE.Vector3();

    this.skyUniforms = {
      uZenith: { value: color(0) }, uMid: { value: color(0) }, uHorizon: { value: color(0) },
      uGlow: { value: color(0) }, uSunColor: { value: color(0) }, uCloudShade: { value: color(0) },
      uSunDir: { value: this.sunDir }, uNoise: { value: noiseTexture },
      uCirrus: { value: 0.5 }, uTime: { value: 0 }, uHdr: { value: 12 },
    };
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.skyUniforms,
      side: THREE.BackSide, depthWrite: false, depthTest: true,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    this.cloudUniforms = {
      uLit: { value: color(0) }, uShade: { value: color(0) }, uHorizon: this.skyUniforms.uHorizon,
      uGlow: this.skyUniforms.uGlow, uSunDir: { value: this.sunDir }, uCam: { value: new THREE.Vector3() },
      uNoise: { value: noiseTexture }, uTime: { value: 0 },
    };
    const cloudMat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, uniforms: this.cloudUniforms,
    });
    this.clouds = new THREE.Mesh(new THREE.CircleGeometry(9000, 64).rotateX(-Math.PI / 2), cloudMat);
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -9;
    scene.add(this.clouds);

    scene.fog = new THREE.FogExp2(0xffffff, 0.001);

    // Warm bounce from the sunlit deck and floors, so walls in shade stay readable and never go grey.
    this.bounce = new THREE.HemisphereLight(0xffffff, 0xffe6c8, 0.5);
    scene.add(this.bounce);
  }

  /** @param {string} name Key of ENVIRONMENTS */
  apply(name) {
    const env = ENVIRONMENTS[name] ?? ENVIRONMENTS.morning;
    this.current = env;
    this.name = name;
    sunDirection(env, this.sunDir);
    const u = this.skyUniforms;
    u.uZenith.value.set(env.zenith);
    u.uMid.value.set(env.mid);
    u.uHorizon.value.set(env.horizon);
    u.uGlow.value.set(env.glow);
    u.uSunColor.value.set(env.sun);
    u.uCloudShade.value.set(env.cloudShade);
    u.uCirrus.value = env.cirrus;
    this.cloudUniforms.uLit.value.set(env.cloudLit);
    this.cloudUniforms.uShade.value.set(env.cloudShade);
    this.clouds.position.y = env.cloudY;
    this.scene.fog.color.set(env.fog);
    this.scene.fog.density = env.fogDensity;
    sharedUniforms.uSunGlow.value.set(env.glow);
    this.bounce.color.set(env.mid);
    this.bounce.groundColor.set(env.bounce ?? 0xffe2c0);

    this.scene.environment = this.bakeEnvMap(name);
    this.scene.environmentIntensity = env.envIntensity;
    return env;
  }

  /** Bakes the sky into a prefiltered map so reflections and ambient match what is on screen. */
  bakeEnvMap(name) {
    if (this.envMaps.has(name)) return this.envMaps.get(name);
    const bakeScene = new THREE.Scene();
    const mat = this.sky.material.clone();
    mat.uniforms = this.skyUniforms;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 24), mat);
    bakeScene.add(dome);
    const lower = new THREE.Mesh(new THREE.CircleGeometry(90, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: this.current.cloudLit }));
    lower.position.y = -18;
    bakeScene.add(lower);
    // Ambient is baked from a paler sky than the one on screen. A true blue dome turns white concrete
    // shadows saturated blue, while real concrete has neutral shadows from bounce light.
    const u = this.skyUniforms;
    const hdr = u.uHdr.value;
    const zenith = u.uZenith.value.clone(), mid = u.uMid.value.clone(), horizon = u.uHorizon.value.clone();
    u.uHdr.value = 0;
    // At low sun the horizon is saturated, and walls mostly see the horizon. A neutral ambient horizon
    // keeps shade cool against warm sunlight, which is what stops concrete turning to cardboard.
    if (this.current.ambientHorizon) u.uHorizon.value.set(this.current.ambientHorizon);
    const mix = this.current.ambientMix ?? 0.62;
    u.uZenith.value.lerp(u.uHorizon.value, mix);
    u.uMid.value.lerp(u.uHorizon.value, mix);
    const target = this.pmrem.fromScene(bakeScene, 0.03, 0.1, 500);
    u.uHdr.value = hdr;
    u.uZenith.value.copy(zenith);
    u.uMid.value.copy(mid);
    u.uHorizon.value.copy(horizon);
    dome.geometry.dispose(); mat.dispose(); lower.geometry.dispose(); lower.material.dispose();
    this.envMaps.set(name, target.texture);
    return target.texture;
  }

  update(camera, time) {
    this.skyUniforms.uTime.value = time;
    this.cloudUniforms.uTime.value = time;
    this.sky.position.copy(camera.position);
    this.clouds.position.x = camera.position.x;
    this.clouds.position.z = camera.position.z;
    this.cloudUniforms.uCam.value.copy(camera.position);
    this._sunView.copy(this.sunDir).transformDirection(camera.matrixWorldInverse);
    sharedUniforms.uSunView.value.copy(this._sunView);
  }

  dispose() {
    for (const t of this.envMaps.values()) t.dispose();
    this.pmrem.dispose();
  }
}
