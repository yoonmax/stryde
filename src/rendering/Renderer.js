import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { CSM } from 'three/addons/csm/CSM.js';
import { MaterialLibrary } from './Materials.js';
import { Environment, ENVIRONMENTS, sunDirection } from './Environment.js';
import { LevelVisuals } from './LevelVisuals.js';
import { Viewmodel } from './Viewmodel.js';
import { CableRenderer } from './CableRenderer.js';
import { CloudPuffs, ParticlePool, SpeedStreaks } from './Effects.js';
import { GhostRenderer } from '../replay/GhostRenderer.js';

/** Shadow setup per quality: cascades, map size, far distance. */
const SHADOW_TIERS = {
  off: null,
  low: { cascades: 2, size: 1024, far: 220 },
  medium: { cascades: 3, size: 1536, far: 380 },
  high: { cascades: 3, size: 2048, far: 560 },
  ultra: { cascades: 4, size: 2048, far: 800 },
};

/**
 * Owns the WebGL context, the post stack and every visual system. Knows nothing about game rules:
 * the game hands it a camera state and events.
 */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.info.autoReset = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.09, 12000);
    this.scene.add(this.camera);

    this.materials = new MaterialLibrary();
    this.levelCache = new Map();
    this.level = null;
    this.csm = null;
    this.settings = null;
    this.tmpSun = new THREE.Vector3();
    this.viewW = 1;
    this.viewH = 1;
    this.time = 0;
    this.stats = { calls: 0, triangles: 0 };
    this.showViewmodel = false;
  }

  /** Steps that build all GPU-independent resources. The loading screen drives these in turn. */
  get loadSteps() {
    const matSteps = this.materials.steps.map(([name, run]) => [`Generating ${name}`, run]);
    return [...matSteps, ['Building atmosphere', () => this.createSystems()]];
  }

  createSystems() {
    this.environment = new Environment(this.renderer, this.scene, this.materials.textures.cloud);
    this.viewmodel = new Viewmodel();
    this.cable = new CableRenderer(this.scene);
    this.particles = new ParticlePool(this.scene);
    this.streaks = new SpeedStreaks(this.scene);
    this.puffs = new CloudPuffs(this.scene, this.materials.textures.cloud);
    this.ghost = new GhostRenderer(this.scene);
    this.composer = null;
    this.environment.apply('morning');
  }

  /**
   * Applies graphics settings. Rebuilds only what the change actually needs.
   * @param {object} g settings.graphics
   */
  applyGraphics(g) {
    const prior = this.settings;
    this.settings = { ...g };
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2) * g.resolutionScale;
    this.renderer.setPixelRatio(pixelRatio);
    this.pixelRatio = pixelRatio;

    if (!prior || prior.shadows !== g.shadows) this.buildShadows(g.shadows);
    const composerKey = `${g.aa}|${g.post}|${g.ao}`;
    if (this.composerKey !== composerKey) {
      this.composerKey = composerKey;
      this.buildComposer(g);
    }
    if (this.particles) this.particles.density = g.particles;
    if (this.puffs) this.puffs.mesh.visible = g.envFx;
    this.resize(this.viewW, this.viewH, true);
  }

  buildShadows(tierName) {
    const tier = SHADOW_TIERS[tierName];
    if (this.csm) {
      this.csm.remove();
      this.csm.dispose();
      this.csm = null;
    }
    this.renderer.shadowMap.enabled = !!tier;
    for (const m of this.materials.lit) {
      delete m.defines?.USE_CSM;
      delete m.defines?.CSM_CASCADES;
      delete m.defines?.CSM_FADE;
      m.onBeforeCompile = () => {};
      this.materials.applyPatch(m);
    }
    const env = this.environment.current;
    if (!tier) {
      if (!this.plainSun) {
        this.plainSun = new THREE.DirectionalLight(env.sun, env.sunIntensity);
        this.scene.add(this.plainSun, this.plainSun.target);
      }
      this.plainSun.visible = true;
      this.syncSun();
      return;
    }
    if (this.plainSun) this.plainSun.visible = false;

    const dir = sunDirection(env, this.tmpSun).clone().negate();
    this.csm = new CSM({
      camera: this.camera,
      parent: this.scene,
      cascades: tier.cascades,
      maxFar: tier.far,
      mode: 'practical',
      shadowMapSize: tier.size,
      shadowBias: -0.0002,
      lightDirection: dir,
      lightIntensity: env.sunIntensity,
      lightNear: 1,
      lightFar: 3200,
      lightMargin: 900,
    });
    this.csm.fade = true;
    for (const light of this.csm.lights) {
      light.shadow.normalBias = 0.35;
      light.shadow.radius = 1.3;
      light.color.set(env.sun);
    }
    for (const m of this.materials.lit) {
      this.csm.setupMaterial(m);
      this.materials.applyPatch(m);
    }
    this.csm.updateFrustums();
  }

  syncSun() {
    const env = this.environment.current;
    const dir = this.environment.sunDir;
    if (this.csm) {
      this.csm.lightDirection.copy(dir).negate();
      for (const light of this.csm.lights) {
        light.color.set(env.sun);
        light.intensity = env.sunIntensity;
      }
    }
    if (this.plainSun && this.plainSun.visible) {
      this.plainSun.color.set(env.sun);
      this.plainSun.intensity = env.sunIntensity;
      this.plainSun.position.copy(dir).multiplyScalar(1000);
    }
    const sunColor = new THREE.Color(env.sun);
    this.viewmodel.setEnvironment(this.scene.environment, dir, sunColor, env.sunIntensity);
    this.renderer.toneMappingExposure = env.exposure;
  }

  buildComposer(g) {
    this.composer?.dispose();
    this.bloomPass = null;
    this.gtaoPass = null;
    const samples = g.aa === 'msaa' ? 4 : 0;
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (g.ao === 'gtao') {
      const pass = new GTAOPass(this.scene, this.camera, 4, 4);
      pass.blendIntensity = 0.85;
      pass.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 });
      pass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      composer.addPass(pass);
      this.gtaoPass = pass;
    }
    const vm = new RenderPass(this.viewmodel.scene, this.viewmodel.camera);
    vm.clear = false;
    vm.clearDepth = true;
    this.viewmodelPass = vm;
    composer.addPass(vm);
    if (g.post) {
      // Barely-there bloom, for the sun disc and guidance light only. Whites do not reach this threshold.
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.1, 0.5, 1.15);
      composer.addPass(this.bloomPass);
    }
    composer.addPass(new OutputPass());
    if (g.aa === 'fxaa') composer.addPass(new FXAAPass());
    this.composer = composer;
  }

  resize(w, h, force = false) {
    if (!force && w === this.viewW && h === this.viewH) return;
    this.viewW = w;
    this.viewH = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewmodel?.resize(w / h);
    this.composer?.setPixelRatio(this.pixelRatio ?? 1);
    this.composer?.setSize(w, h);
    this.csm?.updateFrustums();
  }

  /** Builds or reuses visuals for a level, and installs its atmosphere. */
  setLevel(level) {
    if (this.level?.level.id === level.id) return this.level;
    if (this.level) this.scene.remove(this.level.group);
    let visuals = this.levelCache.get(level.id);
    if (!visuals) {
      visuals = new LevelVisuals(level, this.materials);
      this.levelCache.set(level.id, visuals);
    }
    this.level = visuals;
    this.scene.add(visuals.group);
    const env = this.environment.apply(level.environment);
    this.syncSun();
    const c = level.skylineCenter ?? [0, -200];
    this.puffs.arrange(c, env, level.number ?? 9);
    this.csm?.updateFrustums();
    return visuals;
  }

  /** Compiles shaders for what is on screen, so the first real frame does not hitch. */
  precompile() {
    this.renderer.compile(this.scene, this.camera);
    this.renderer.compile(this.viewmodel.scene, this.viewmodel.camera);
  }

  render(dt, simTime) {
    this.time += dt;
    this.camera.updateMatrixWorld();
    this.environment.update(this.camera, this.time);
    this.puffs.update(this.time);
    this.level?.update(this.time, dt, simTime ?? this.time);
    this.particles.update(dt, this.viewH * (this.pixelRatio ?? 1));
    if (this.csm) this.csm.update();
    if (this.viewmodelPass) this.viewmodelPass.enabled = this.showViewmodel;
    this.renderer.info.reset();
    this.composer.render(dt);
    this.stats.calls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
  }

  dispose() {
    for (const l of this.levelCache.values()) l.dispose();
    this.csm?.dispose();
    this.composer?.dispose();
    this.cable?.dispose();
    this.particles?.dispose();
    this.streaks?.dispose();
    this.puffs?.dispose();
    this.ghost?.dispose();
    this.viewmodel?.dispose();
    this.environment?.dispose();
    this.materials.dispose();
    this.renderer.dispose();
  }
}

export { ENVIRONMENTS };
