import * as THREE from 'three';

/** Speed streaks: thin slivers in the air around the player. Only visible at very high speed. */
export class SpeedStreaks {
  constructor(scene, count = 90) {
    this.count = count;
    const geo = new THREE.PlaneGeometry(0.018, 1);
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.NormalBlending, toneMapped: false, side: THREE.DoubleSide,
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: `varying float vY; varying float vFade; void main(){ vY=uv.y; vec4 p = modelViewMatrix * instanceMatrix * vec4(position,1.0); vFade = smoothstep(1.2, 5.0, -p.z); gl_Position = projectionMatrix * p; }`,
      fragmentShader: `uniform float uOpacity; varying float vY; varying float vFade; void main(){ float a = smoothstep(0.0,0.5,vY)*smoothstep(1.0,0.5,vY); gl_FragColor = vec4(1.0,1.0,1.0, a*uOpacity*vFade); }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.material, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.seeds = [];
    for (let i = 0; i < count; i++) {
      const a = (i * 2.399963) % (Math.PI * 2);
      this.seeds.push({ a, r: 3 + ((i * 7) % 11), along: (i * 37 % 100) / 100 * 40 - 20, len: 1.5 + (i % 5) });
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._dir = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  /** @param {number} intensity 0 to 1 @param {THREE.Vector3} vel Player velocity */
  update(dt, cameraPos, vel, intensity, density = 1) {
    const u = this.material.uniforms.uOpacity;
    u.value += (intensity * 0.3 - u.value) * Math.min(1, dt * 6);
    if (u.value < 0.004 || density <= 0) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    const speed = vel.length();
    this._dir.copy(vel).divideScalar(Math.max(speed, 1e-3));
    this._a.crossVectors(this._dir, this._up);
    if (this._a.lengthSq() < 0.01) this._a.set(1, 0, 0);
    this._a.normalize();
    this._b.crossVectors(this._a, this._dir);
    this._q.setFromUnitVectors(this._up, this._dir);
    const n = Math.floor(this.count * density);
    this.mesh.count = n;
    for (let i = 0; i < n; i++) {
      const s = this.seeds[i];
      s.along -= speed * dt;
      if (s.along < -20) s.along += 40;
      this._p.copy(cameraPos)
        .addScaledVector(this._a, Math.cos(s.a) * s.r)
        .addScaledVector(this._b, Math.sin(s.a) * s.r)
        .addScaledVector(this._dir, s.along);
      this._s.set(1, s.len * (0.6 + speed * 0.05), 1);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); this.material.dispose(); }
}

/** Small pool of fading puffs for landings and wall contact. Density is a player setting. */
export class ParticlePool {
  constructor(scene, max = 240) {
    this.max = max;
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uHeight: { value: 800 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; uniform float uHeight; varying float vA; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = aSize*uHeight/max(-mv.z,0.1); vA = aAlpha; }`,
      fragmentShader: `varying float vA; void main(){ float d=length(gl_PointCoord-0.5)*2.0; float a=(1.0-smoothstep(0.2,1.0,d))*vA; if(a<0.004) discard; gl_FragColor=vec4(0.96,0.95,0.92,a); }`,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
    this.density = 1;
    this.active = 0;
  }

  burst(x, y, z, count, { speed = 2, up = 0.6, size = 0.3, life = 0.5, alpha = 0.3 } = {}) {
    const n = Math.round(count * this.density);
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const a = (k * 2.399963 + x) % (Math.PI * 2);
      const s = speed * (0.4 + ((k * 13) % 7) / 10);
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = Math.cos(a) * s;
      this.vel[i * 3 + 1] = up * (0.4 + ((k * 7) % 5) / 5);
      this.vel[i * 3 + 2] = Math.sin(a) * s;
      this.maxLife[i] = this.life[i] = life * (0.7 + ((k * 11) % 5) / 10);
      this.size[i] = size;
      this.alpha[i] = alpha;
    }
    this.startAlpha = alpha;
    this.active = this.max;
  }

  update(dt, viewportHeight) {
    if (this.active <= 0) { this.points.visible = false; return; }
    this.points.visible = true;
    this.material.uniforms.uHeight.value = viewportHeight;
    let alive = 0;
    const damp = Math.exp(-3 * dt);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      alive++;
      this.vel[i * 3] *= damp; this.vel[i * 3 + 1] *= damp; this.vel[i * 3 + 2] *= damp;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = t * t * (this.startAlpha ?? 0.3);
      this.size[i] += dt * 0.5;
    }
    this.active = alive;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
  }

  dispose() { this.points.geometry.dispose(); this.material.dispose(); }
}

/** Soft floating cloud banks below and around the course, for depth when moving. */
export class CloudPuffs {
  constructor(scene, noise, count = 42) {
    this.count = count;
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uNoise: { value: noise }, uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uTime: { value: 0 }, uFog: { value: new THREE.Color() } },
      vertexShader: `
        varying vec2 vUv; varying float vSeed; varying float vDist;
        void main(){
          vUv = uv;
          vec4 c = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
          float s = length(instanceMatrix[0].xyz);
          vSeed = fract(c.x*0.013 + c.z*0.021);
          vec4 mv = viewMatrix * c;
          vDist = -mv.z;
          mv.xy += position.xy * s * vec2(1.0, 0.42);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uNoise; uniform vec3 uLit, uShade, uFog; uniform float uTime;
        varying vec2 vUv; varying float vSeed; varying float vDist;
        void main(){
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          float n = texture2D(uNoise, vUv * 0.5 + vSeed + uTime * 0.002).r;
          float n2 = texture2D(uNoise, vUv * 1.3 - vSeed * 2.0 + uTime * 0.004).g;
          float d = smoothstep(1.0, 0.1, r + (n - 0.5) * 1.1 + (n2 - 0.5) * 0.45);
          if (d < 0.004) discard;
          vec3 col = mix(uShade, uLit, smoothstep(-0.25, 0.35, vUv.y - 0.5 + (n - 0.5) * 0.6));
          col = mix(col, uFog, smoothstep(300.0, 1900.0, vDist));
          // Fade near the camera, so flying through one never fills the screen with a flat veil.
          float nearFade = smoothstep(40.0, 180.0, vDist);
          gl_FragColor = vec4(col, d * 0.92 * nearFade);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.material, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -8;
    scene.add(this.mesh);
  }

  /** Scatter banks around the level. Seeded so the same course always looks the same. */
  arrange(center, env, seedValue = 3) {
    let seed = seedValue * 7919;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (let i = 0; i < this.count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 200 + rnd() * 1500;
      const size = 180 + rnd() * rnd() * 540;
      pos.set(center[0] + Math.cos(a) * r, env.cloudY + 12 + rnd() * 50, center[1] + Math.sin(a) * r);
      s.setScalar(size);
      m.compose(pos, q, s);
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.material.uniforms.uLit.value.set(env.cloudLit);
    this.material.uniforms.uShade.value.set(env.cloudShade);
    this.material.uniforms.uFog.value.set(env.horizon);
  }

  update(time) { this.material.uniforms.uTime.value = time; }
  dispose() { this.mesh.geometry.dispose(); this.material.dispose(); }
}
