import * as THREE from 'three';

/**
 * Every surface texture is generated at load, so the game ships with no bitmap assets. Textures map
 * to real-world size: UVs are in metres divided by the tile size, so formwork seams are the same
 * width on every wall. That consistency is most of what makes the architecture read as built.
 */

const hash = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

/** Periodic value noise, so a generated tile has no visible seam. */
const noise = (x, y, period) => {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const w = (i, j) => hash(((i % period) + period) % period, ((j % period) + period) % period);
  const a = w(xi, yi), b = w(xi + 1, yi), c = w(xi, yi + 1), d = w(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

const fbm = (u, v, base, octaves, gain = 0.5) => {
  let sum = 0, amp = 1, total = 0, f = base;
  for (let o = 0; o < octaves; o++) {
    sum += noise(u * f + o * 17.3, v * f + o * 9.1, f) * amp;
    total += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / total;
};

const toTexture = (data, size, { srgb = false, aniso = 8 } = {}) => {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = aniso;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
};

/** Sobel-style normal map from a periodic height field. */
const normalFromHeight = (height, size, strength) => {
  const out = new Uint8Array(size * size * 4);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out[i] = (-dx / l) * 127.5 + 127.5;
      out[i + 1] = (-dy / l) * 127.5 + 127.5;
      out[i + 2] = (1 / l) * 127.5 + 127.5;
      out[i + 3] = 255;
    }
  }
  return out;
};

const packGray = (values, size, map, opts) => {
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.max(0, Math.min(255, map(values[i], i) * 255));
    out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v; out[i * 4 + 3] = 255;
  }
  return toTexture(out, size, opts);
};

/**
 * Board-formed concrete, 6 m tile: stacked 3 x 1.5 m panels with seams, six tie holes per panel, faint
 * rain streaking, and a slightly different pour tone from panel to panel.
 */
function generateConcrete(size) {
  const albedo = new Float32Array(size * size);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const panelsX = 2, panelsY = 4;
  const metre = size / 6;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      const px = u * panelsX, py = v * panelsY;
      const cx = Math.floor(px), cy = Math.floor(py);
      const fx = px - cx, fy = py - cy;

      const fine = fbm(u, v, 48, 4);
      const broad = fbm(u, v, 6, 4);
      const streak = fbm(u * 0.5, v * 0.5, 40, 2) * 0 + noise(u * 64, v * 3, 64) * 0.5 + noise(u * 128, v * 5, 128) * 0.5;
      const pour = hash(cx + 11, cy + 3);

      // Distance to the nearest seam, in texels.
      const seamX = Math.min(fx, 1 - fx) * (size / panelsX);
      const seamY = Math.min(fy, 1 - fy) * (size / panelsY);
      const seam = Math.min(seamX, seamY);
      const seamLine = seam < 1.4 ? 1 : seam < 2.6 ? 2.6 - seam : 0;

      // Tie holes: three across and two high in each panel.
      const hx = fx * 3, hy = fy * 2;
      const hdx = (hx - Math.floor(hx) - 0.5) * (size / panelsX / 3);
      const hdy = (hy - Math.floor(hy) - 0.5) * (size / panelsY / 2);
      const hole = Math.hypot(hdx, hdy);
      const holeRadius = metre * 0.024;
      const inHole = hole < holeRadius;
      const holeRim = hole < holeRadius * 1.7 ? 1 - (hole - holeRadius) / (holeRadius * 0.7) : 0;

      let a = 0.95 + (pour - 0.5) * 0.026 + (broad - 0.5) * 0.1 + (fine - 0.5) * 0.05 + (streak - 0.5) * 0.03;
      let h = fine * 0.5 + broad * 0.3;
      if (seamLine > 0) { a -= 0.13 * Math.min(1, seamLine); h -= 1.2 * Math.min(1, seamLine); }
      if (inHole) { a -= 0.42; h -= 2.2; } else if (holeRim > 0) { a -= 0.05 * holeRim; h -= 0.4 * holeRim; }
      // Small air pits, the signature of cast concrete.
      if (fine > 0.76) { a -= 0.07; h -= 0.45; }

      albedo[i] = a;
      height[i] = h;
      rough[i] = 0.72 + (broad - 0.5) * 0.28 + (seamLine > 0 ? 0.1 : 0);
    }
  }
  return {
    map: packGray(albedo, size, (v) => v, { srgb: true, aniso: 16 }),
    roughnessMap: packGray(rough, size, (v) => v, { aniso: 8 }),
    normalMap: toTexture(normalFromHeight(height, size, 1.4), size, { aniso: 8 }),
    tile: 6,
  };
}

/** Large-format matte ceramic, 1.2 m tile: finer, smoother and more regular than concrete. */
function generateCeramic(size) {
  const albedo = new Float32Array(size * size);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      const edge = Math.min(u, 1 - u, v, 1 - v) * size;
      const groove = edge < 1.5 ? 1 : edge < 3 ? (3 - edge) / 1.5 : 0;
      const n = fbm(u, v, 12, 3);
      albedo[i] = 0.97 + (n - 0.5) * 0.03 - groove * 0.28;
      height[i] = 0.5 - groove * 1.5 + (n - 0.5) * 0.04;
      rough[i] = 0.42 + (n - 0.5) * 0.08 + groove * 0.4;
    }
  }
  return {
    map: packGray(albedo, size, (v) => v, { srgb: true }),
    roughnessMap: packGray(rough, size, (v) => v),
    normalMap: toTexture(normalFromHeight(height, size, 1.6), size),
    tile: 2.4,
  };
}

/**
 * Graphite traversal cladding, 2.4 m tile: vertical ribs. This surface grapples and wall-runs, so the
 * ribs matter. They are readable from far away, and they streak past during a wall run as a speed cue.
 */
function generateGraphite(size) {
  const albedo = new Float32Array(size * size);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const ribs = 16;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      const r = (u * ribs) % 1;
      const groove = r < 0.14 ? 1 - r / 0.14 : r > 0.86 ? (r - 0.86) / 0.14 : 0;
      const panel = Math.min(v, 1 - v) * size < 1.5 ? 1 : 0;
      const n = fbm(u, v, 24, 3);
      albedo[i] = 0.9 + (n - 0.5) * 0.18 - groove * 0.55 - panel * 0.5;
      height[i] = 1 - groove * 1.4 - panel;
      rough[i] = 0.52 + (n - 0.5) * 0.2 + groove * 0.2;
    }
  }
  return {
    map: packGray(albedo, size, (v) => v, { srgb: true, aniso: 16 }),
    roughnessMap: packGray(rough, size, (v) => v),
    normalMap: toTexture(normalFromHeight(height, size, 1.3), size),
    tile: 2.4,
  };
}

/** Brushed aluminium, 1 m tile: long-grain streaks only, so it stays quiet. */
function generateMetal(size) {
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const albedo = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      const streak = noise(u * 4, v * 256, 256) * 0.6 + noise(u * 8, v * 128, 128) * 0.4;
      albedo[i] = 0.9 + (streak - 0.5) * 0.12;
      height[i] = streak;
      rough[i] = 0.36 + (streak - 0.5) * 0.14;
    }
  }
  return {
    map: packGray(albedo, size, (v) => v, { srgb: true }),
    roughnessMap: packGray(rough, size, (v) => v),
    normalMap: toTexture(normalFromHeight(height, size, 0.45), size),
    tile: 1.2,
  };
}

/** Tiling cloud noise used by the sky, the cloud deck and the puffs. */
export function generateCloudNoise(size) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = (y * size + x) * 4;
      const billow = fbm(u, v, 4, 6, 0.52);
      const detail = fbm(u, v, 16, 4);
      const wisp = fbm(u, v, 8, 5, 0.6);
      data[i] = billow * 255;
      data[i + 1] = detail * 255;
      data[i + 2] = wisp * 255;
      data[i + 3] = 255;
    }
  }
  return toTexture(data, size, { aniso: 4 });
}

/** Uniforms shared by every lit material. Written once per frame by the environment. */
export const sharedUniforms = {
  uSunGlow: { value: new THREE.Color(1, 0.8, 0.6) },
  uSunView: { value: new THREE.Vector3(0, 1, 0) },
  uMacro: { value: null },
};

/** Adds macro variation against tiling, and sun-aware fog so distance glows toward the sun. */
const patchShader = (shader) => {
  shader.uniforms.uSunGlow = sharedUniforms.uSunGlow;
  shader.uniforms.uSunView = sharedUniforms.uSunView;
  shader.uniforms.uMacro = sharedUniforms.uMacro;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      uniform vec3 uSunGlow;
      uniform vec3 uSunView;
      uniform sampler2D uMacro;`)
    .replace('#include <map_fragment>', `#include <map_fragment>
      #ifdef USE_MAP
        // Weathering at the scale of a whole building. A separate smooth noise, never the surface's
        // own map, whose regular seams would alias into visible bands.
        float macroA = texture2D(uMacro, vMapUv * 0.043).r;
        float macroB = texture2D(uMacro, vMapUv * 0.0093 + 0.37).b;
        diffuseColor.rgb *= 0.84 + 0.2 * macroA + 0.14 * macroB;
      #endif`)
    .replace('#include <fog_fragment>', `
      #ifdef USE_FOG
        float fogDepth = vFogDepth;
        float fogAmount = 1.0 - exp(-fogDensity * fogDensity * fogDepth * fogDepth);
        float toSun = max(dot(normalize(-vViewPosition), uSunView), 0.0);
        vec3 tintedFog = mix(fogColor, uSunGlow, pow(toSun, 6.0) * 0.72);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, tintedFog, fogAmount);
      #endif`);
};

/**
 * The material library. Generation is split so the loading screen can report real progress.
 */
export class MaterialLibrary {
  constructor() {
    this.textures = {};
    this.materials = {};
    this.steps = [
      ['concrete', () => { this.textures.concrete = generateConcrete(1024); }],
      ['ceramic', () => { this.textures.ceramic = generateCeramic(512); }],
      ['graphite', () => { this.textures.graphite = generateGraphite(512); }],
      ['metal', () => { this.textures.metal = generateMetal(512); }],
      ['cloud', () => { this.textures.cloud = generateCloudNoise(512); }],
      ['surfaces', () => this.createMaterials()],
    ];
  }

  createMaterials() {
    const t = this.textures;
    sharedUniforms.uMacro.value = t.cloud.map ?? t.cloud;
    const std = (name, tex, params) => {
      const m = new THREE.MeshStandardMaterial({
        map: tex.map, roughnessMap: tex.roughnessMap, normalMap: tex.normalMap,
        vertexColors: true,
        ...params,
      });
      m.name = name;
      m.userData.tile = tex.tile;
      this.materials[name] = m;
      return m;
    };
    std('concrete', t.concrete, { color: 0xfbf4e6, roughness: 1, normalScale: new THREE.Vector2(0.55, 0.55) });
    std('ceramic', t.ceramic, { color: 0xf4f0e8, roughness: 1, normalScale: new THREE.Vector2(0.4, 0.4) });
    std('graphite', t.graphite, { color: 0x5b626a, roughness: 1, metalness: 0.12, normalScale: new THREE.Vector2(1.1, 1.1) });
    std('metal', t.metal, { color: 0xb9bdc0, roughness: 1, metalness: 0.92, normalScale: new THREE.Vector2(0.2, 0.2) });

    const glass = new THREE.MeshStandardMaterial({
      color: 0xdcecf2, roughness: 0.22, metalness: 0.05, transparent: true, opacity: 0.3,
      vertexColors: true, depthWrite: false,
    });
    glass.userData.tile = 4;
    glass.name = 'glass';
    this.materials.glass = glass;

    this.materials.far = new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.92 });
    this.materials.far.name = 'far';

    for (const m of Object.values(this.materials)) this.applyPatch(m);

    // Guidance light. Unlit and just above display white, so it holds its colour at any exposure.
    this.materials.guide = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.35, 1.6), toneMapped: false });
    this.materials.anchorCore = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.5, 1.8), toneMapped: false });
  }

  /** (Re)installs our shader patch. CSM replaces onBeforeCompile, so we chain with whatever is there. */
  applyPatch(material) {
    const prior = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      prior?.call(material, shader, renderer);
      patchShader(shader);
    };
    material.needsUpdate = true;
  }

  get lit() { return ['concrete', 'ceramic', 'graphite', 'metal', 'glass', 'far'].map((n) => this.materials[n]); }

  dispose() {
    for (const t of Object.values(this.textures)) {
      if (t.isTexture) { t.dispose(); continue; }
      for (const v of Object.values(t)) v?.dispose?.();
    }
    for (const m of Object.values(this.materials)) m.dispose();
  }
}
