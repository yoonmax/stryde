import * as THREE from 'three';
import { GeometryBatch, pushArc, pushBeam, pushBox, pushCylinder, pushRing } from './GeometryBatch.js';

const CELL = 90;

const cellKey = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;

/**
 * Turns a level's visual list into scene objects. Static geometry is merged per material per spatial
 * cell, so a whole course is typically under a hundred draw calls and unseen cells cull as a group.
 * Anchors and the far skyline are instanced. Gates and moving parts stay separate for animation.
 */
export class LevelVisuals {
  constructor(level, materials) {
    this.level = level;
    this.materials = materials;
    this.group = new THREE.Group();
    this.group.name = `level-${level.id}`;
    this.gates = [];
    this.spinners = [];
    this.movers = [];
    this.anchorMesh = null;
    this.anchorPositions = [];
    this.build();
  }

  build() {
    const batches = new Map();
    const batchFor = (mat, x, z) => {
      const key = `${mat}|${cellKey(x, z)}`;
      let b = batches.get(key);
      if (!b) { b = { mat, batch: new GeometryBatch() }; batches.set(key, b); }
      return b.batch;
    };
    const tileOf = (mat) => this.materials.materials[mat]?.userData.tile ?? 6;

    const anchors = [];
    for (const v of this.level.visuals) {
      switch (v.kind) {
        case 'box': pushBox(batchFor(v.mat, v.pos.x, v.pos.z), v, tileOf(v.mat)); break;
        case 'cyl': pushCylinder(batchFor(v.mat, v.pos.x, v.pos.z), v, tileOf(v.mat)); break;
        case 'arc': {
          const mid = ((v.a0 + v.a1) / 2) * (Math.PI / 180);
          const r = (v.rInner + v.rOuter) / 2;
          pushArc(batchFor(v.mat, v.center[0] + Math.cos(mid) * r, v.center[1] - Math.sin(mid) * r), v, tileOf(v.mat));
          break;
        }
        case 'beam': pushBeam(batchFor(v.mat, (v.from.x + v.to.x) / 2, (v.from.z + v.to.z) / 2), v, tileOf(v.mat)); break;
        case 'ring':
          if (v.spin) this.addSpinner(v);
          else pushRing(batchFor(v.mat, v.center.x, v.center.z), v, tileOf(v.mat));
          break;
        case 'anchor': anchors.push(v); break;
        case 'gate': this.addGate(v); break;
        case 'guide': this.addGuide(batchFor, v); break;
        default: throw new Error(`Unknown visual ${v.kind}`);
      }
    }

    // Anchor hangers are ordinary geometry; the glowing nodes are instanced below.
    for (const a of anchors) {
      const b = batchFor('metal', a.pos.x, a.pos.z);
      const hang = a.mountLength;
      if (a.mount === 'hanger') {
        pushBeam(b, { from: { x: a.pos.x, y: a.pos.y + 0.4, z: a.pos.z }, to: { x: a.pos.x, y: a.pos.y + hang, z: a.pos.z }, thickness: 0.09, round: true }, 1.2);
      }
      pushCylinder(b, { pos: { x: a.pos.x, y: a.pos.y + 0.78, z: a.pos.z }, radius: a.radius * 0.5, height: 0.3, segments: 16 }, 1.2);
      pushCylinder(b, { pos: { x: a.pos.x, y: a.pos.y - 0.78, z: a.pos.z }, radius: a.radius * 0.5, height: 0.3, segments: 16 }, 1.2);
    }

    for (const { mat, batch } of batches.values()) {
      const mesh = new THREE.Mesh(batch.bake(), this.materialFor(mat));
      const material = mesh.material;
      const castable = mat !== 'guide' && mat !== 'glass';
      mesh.castShadow = castable;
      mesh.receiveShadow = castable;
      mesh.name = mat;
      if (material.transparent) mesh.renderOrder = 2;
      this.group.add(mesh);
    }

    this.buildAnchorNodes(anchors);
    this.buildMovers();
    this.buildSkyline();
  }

  materialFor(mat) { return this.materials.materials[mat] ?? this.materials.materials.concrete; }

  addGuide(batchFor, v) {
    pushBeam(batchFor('guide', (v.from.x + v.to.x) / 2, (v.from.z + v.to.z) / 2), { from: v.from, to: v.to, thickness: v.width, round: false }, 1);
  }

  addSpinner(v) {
    const batch = new GeometryBatch();
    pushRing(batch, { ...v, center: { x: 0, y: 0, z: 0 } }, this.materials.materials[v.mat]?.userData.tile ?? 6);
    const pivot = new THREE.Group();
    pivot.position.set(v.center.x, v.center.y, v.center.z);
    const mesh = new THREE.Mesh(batch.bake(), this.materialFor(v.mat));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pivot.add(mesh);
    this.group.add(pivot);
    this.spinners.push({ pivot, speed: v.spin });
  }

  addGate(v) {
    const isFinish = v.role === 'finish';
    const g = new THREE.Group();
    g.position.set(v.pos.x, v.pos.y, v.pos.z);
    g.rotation.y = v.yaw;

    const post = new GeometryBatch();
    const hw = v.width / 2;
    pushBox(post, { pos: { x: -hw, y: v.height / 2, z: 0 }, size: { x: 0.22, y: v.height, z: 0.5 }, chamfer: 0.03 }, 2.4);
    pushBox(post, { pos: { x: hw, y: v.height / 2, z: 0 }, size: { x: 0.22, y: v.height, z: 0.5 }, chamfer: 0.03 }, 2.4);
    pushBox(post, { pos: { x: 0, y: v.height, z: 0 }, size: { x: v.width + 0.22, y: 0.22, z: 0.5 }, chamfer: 0.03 }, 2.4);
    const frame = new THREE.Mesh(post.bake(), this.materials.materials.graphite);
    frame.castShadow = true;
    frame.receiveShadow = true;
    g.add(frame);

    const glow = new THREE.MeshBasicMaterial({
      color: isFinish ? new THREE.Color(1.8, 1.25, 0.72) : new THREE.Color(0.55, 1.35, 1.6),
      toneMapped: false,
    });
    const line = new GeometryBatch();
    pushBox(line, { pos: { x: -hw + 0.13, y: v.height / 2, z: 0 }, size: { x: 0.04, y: v.height - 0.3, z: 0.1 }, chamfer: 0 }, 1);
    pushBox(line, { pos: { x: hw - 0.13, y: v.height / 2, z: 0 }, size: { x: 0.04, y: v.height - 0.3, z: 0.1 }, chamfer: 0 }, 1);
    pushBox(line, { pos: { x: 0, y: v.height - 0.13, z: 0 }, size: { x: v.width - 0.3, y: 0.04, z: 0.1 }, chamfer: 0 }, 1);
    const lineMesh = new THREE.Mesh(line.bake(), glow);
    g.add(lineMesh);

    // A sheet of light across the opening, invisible until the gate is crossed.
    const sheetMat = new THREE.MeshBasicMaterial({
      color: glow.color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    });
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(v.width, v.height), sheetMat);
    sheet.position.y = v.height / 2;
    sheet.visible = false;
    g.add(sheet);

    this.group.add(g);
    this.gates.push({ role: v.role, index: v.index, group: g, glow, sheet, flash: 0, passed: false, baseColor: glow.color.clone() });
  }

  buildAnchorNodes(anchors) {
    if (!anchors.length) return;
    const geo = new THREE.IcosahedronGeometry(1, 3);
    const mesh = new THREE.InstancedMesh(geo, this.materials.materials.anchorCore, anchors.length);
    const m = new THREE.Matrix4();
    anchors.forEach((a, i) => {
      m.makeScale(a.radius * 0.62, a.radius * 0.62, a.radius * 0.62);
      m.setPosition(a.pos.x, a.pos.y, a.pos.z);
      mesh.setMatrixAt(i, m);
      this.anchorPositions.push(a.pos);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    this.anchorMesh = mesh;
    this.group.add(mesh);

    // Halos: soft sprites that keep nodes readable from far away and against bright sky.
    const positions = new Float32Array(anchors.length * 3);
    anchors.forEach((a, i) => { positions[i * 3] = a.pos.x; positions[i * 3 + 1] = a.pos.y; positions[i * 3 + 2] = a.pos.z; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const halo = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 1 } },
      vertexShader: `uniform float uScale; varying float vDepth; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; vDepth=-mv.z; gl_PointSize = clamp(uScale*520.0/max(-mv.z,1.0), 8.0, 90.0); }`,
      fragmentShader: `varying float vDepth; void main(){ vec2 c=gl_PointCoord-0.5; float d=length(c)*2.0; float ring=smoothstep(0.62,0.72,d)*(1.0-smoothstep(0.78,0.9,d)); float core=pow(max(1.0-d,0.0),2.0); gl_FragColor=vec4(0.32,0.82,1.0, ring*0.8+core*0.4); }`,
    }));
    halo.frustumCulled = false;
    this.group.add(halo);
    this.haloMaterial = halo.material;
  }

  buildMovers() {
    for (const m of this.level.movers) {
      const batch = new GeometryBatch();
      const s = m.solid.size;
      pushBox(batch, { pos: { x: 0, y: 0, z: 0 }, size: s, chamfer: 0.06 }, this.materials.materials[m.mat]?.userData.tile ?? 2.4);
      const mesh = new THREE.Mesh(batch.bake(), this.materialFor(m.mat));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(m.solid.pos.x, m.solid.pos.y, m.solid.pos.z);
      if (m.anchor) {
        const node = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 3), this.materials.materials.anchorCore);
        node.position.y = -s.y / 2 - 0.8;
        mesh.add(node);
      }
      this.group.add(mesh);
      this.movers.push({ mesh, path: m.path, _p: { x: 0, y: 0, z: 0 } });
    }
  }

  /**
   * Distant monoliths rising through the cloud deck, instanced. Seeded per level so the skyline is
   * authored in spirit but cheap to produce, and it never overlaps the course itself.
   */
  buildSkyline() {
    const spec = this.level.skyline ?? { count: 46, seed: 7, inner: 620, outer: 2300 };
    const center = this.level.skylineCenter ?? [0, -200];
    let seed = spec.seed * 9301 + 49297;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(geo, this.materials.materials.far, spec.count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3(), scl = new THREE.Vector3();
    for (let i = 0; i < spec.count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = spec.inner + (spec.outer - spec.inner) * Math.sqrt(rnd());
      const w = 28 + rnd() * rnd() * 110;
      const d = 28 + rnd() * rnd() * 110;
      const h = 180 + rnd() * rnd() * 620;
      pos.set(center[0] + Math.cos(a) * r, -220 + h / 2, center[1] + Math.sin(a) * r);
      scl.set(w, h, d);
      q.setFromAxisAngle(up, rnd() * Math.PI);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.group.add(mesh);
  }

  /** Animates anything decorative. Movers read their true position from the path function. */
  update(time, dt, simTime = time) {
    for (const s of this.spinners) s.pivot.rotation.y += s.speed * dt;
    for (const m of this.movers) {
      m.path(simTime, m._p);
      m.mesh.position.set(m._p.x, m._p.y, m._p.z);
    }
    for (const g of this.gates) {
      if (g.flash > 0) {
        g.flash = Math.max(0, g.flash - dt * 1.6);
        g.sheet.visible = g.flash > 0;
        g.sheet.material.opacity = g.flash * g.flash * 0.4;
        const c = 1 + g.flash * 2.5;
        g.glow.color.copy(g.baseColor).multiplyScalar(c);
      }
    }
  }

  flashGate(index) {
    const g = this.gates.find((x) => (index === 'finish' ? x.role === 'finish' : x.index === index));
    if (g) { g.flash = 1; g.passed = true; g.sheet.visible = true; }
  }

  resetGates() {
    for (const g of this.gates) {
      g.flash = 0; g.passed = false; g.sheet.visible = false;
      g.glow.color.copy(g.baseColor);
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && !Object.values(this.materials.materials).includes(o.material)) o.material.dispose?.();
    });
  }
}
