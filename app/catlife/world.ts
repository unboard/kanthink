// Whisker Wilds — procedural island world
// Seeded generation: terrain, water, forests, rocks, flowers, dig mounds,
// yarn balls, rival camps, agility course, offshore islets, critters, sky.

import * as THREE from 'three';
import { mulberry32, fbm, range, irange, hash2 } from './rng';
import { WORLD_SIZE, WATER_LEVEL, RIVAL_CLANS, BUILDABLES } from './data';
import type { BuildingInstance } from './types';

export interface TreeInfo { id: string; x: number; z: number; trunkH: number; r: number; perchY: number }
export interface RockInfo { x: number; z: number; r: number }
export interface DigMound { id: string; x: number; z: number; dug: boolean; mesh: THREE.Mesh }
export interface YarnBall {
  id: string; x: number; z: number; y: number; golden: boolean;
  spot: 'ground' | 'tree' | 'islet' | 'hill';
  mesh: THREE.Group; collected: boolean;
}
export interface CampInfo { clanId: string; x: number; z: number; r: number }
export interface AgilityGate { x: number; z: number; kind: 'start' | 'weave' | 'hurdle' | 'tunnel' | 'ramp' | 'finish' }
export interface Critter {
  kind: 'butterfly' | 'mouse' | 'bird';
  group: THREE.Group;
  x: number; z: number; y: number;
  homeX: number; homeZ: number;
  heading: number;
  state: 'wander' | 'flee' | 'gone' | 'caught';
  stateT: number;
  speed: number;
  phase: number;
}

export interface ScratchSpot { id: string; x: number; z: number; label: string }

const gauss = (d: number, r: number) => Math.exp(-(d * d) / (r * r));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smoothstep = (v: number) => v * v * (3 - 2 * v);

export class World {
  seed: number;
  group = new THREE.Group();

  trees: TreeInfo[] = [];
  rocks: RockInfo[] = [];
  digMounds: DigMound[] = [];
  yarn: YarnBall[] = [];
  camps: CampInfo[] = [];
  islets: { x: number; z: number; r: number }[] = [];
  agilityGates: AgilityGate[] = [];
  agilityCenter = { x: 0, z: 0 };
  playerCamp = { x: 0, z: 0 };
  critters: Critter[] = [];
  scratchSpots: ScratchSpot[] = [];
  buildingMeshes = new Map<string, THREE.Group>();

  // lighting / sky
  sun: THREE.DirectionalLight;
  moon: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  private skyMesh: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private waterMat: THREE.ShaderMaterial;
  private stars: THREE.Points;
  private campLights: THREE.PointLight[] = [];

  // terrain params (seeded once)
  private lakeC: { x: number; z: number };
  private hillC: { x: number; z: number };
  private flatSpots: { x: number; z: number; r: number; h: number }[] = [];

  private terrainMesh: THREE.Mesh;
  private yarnTexNormal: THREE.CanvasTexture;
  private yarnTexGold: THREE.CanvasTexture;

  constructor(seed: number, scene: THREE.Scene, private isNight = false) {
    this.seed = seed;
    const rng = mulberry32(seed);

    // seeded landmarks
    const a1 = rng() * Math.PI * 2;
    this.lakeC = { x: Math.cos(a1) * 70, z: Math.sin(a1) * 70 };
    const a2 = a1 + Math.PI * (0.6 + rng() * 0.5);
    this.hillC = { x: Math.cos(a2) * 90, z: Math.sin(a2) * 90 };

    // player camp: south-ish flat area away from lake
    const a3 = a1 + Math.PI;
    this.playerCamp = { x: Math.cos(a3) * 60, z: Math.sin(a3) * 60 };
    // agility course: off to one side
    const a4 = a3 + 1.4;
    this.agilityCenter = { x: Math.cos(a4) * 105, z: Math.sin(a4) * 105 };

    // rival camps around the island rim
    for (let i = 0; i < RIVAL_CLANS.length; i++) {
      const a = a3 + Math.PI * 0.5 + (i * Math.PI * 2) / 3 + 0.5;
      const cx = Math.cos(a) * 120;
      const cz = Math.sin(a) * 120;
      this.camps.push({ clanId: RIVAL_CLANS[i].id, x: cx, z: cz, r: 16 });
    }

    // offshore islets (swim destinations)
    for (let i = 0; i < 3; i++) {
      const a = rng() * Math.PI * 2;
      const d = 265 + rng() * 45;
      this.islets.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: 18 + rng() * 10 });
    }

    // flatten pads: player camp, rival camps, agility strip
    this.flatSpots.push({ ...this.playerCamp, r: 26, h: 2.2 });
    for (const c of this.camps) this.flatSpots.push({ x: c.x, z: c.z, r: 20, h: 2.4 });
    this.flatSpots.push({ x: this.agilityCenter.x, z: this.agilityCenter.z, r: 34, h: 2.0 });

    // ——— build everything ———
    this.terrainMesh = this.buildTerrain();
    this.group.add(this.terrainMesh);
    const water = this.buildWater();
    this.waterMat = water.material as THREE.ShaderMaterial;
    this.group.add(water);
    const sky = this.buildSky();
    this.skyMesh = sky.mesh;
    this.skyMat = sky.mat;
    this.group.add(this.skyMesh);
    this.stars = this.buildStars();
    this.group.add(this.stars);

    this.buildFlora(rng);
    this.buildRocks(rng);
    this.buildDigMounds(rng);
    this.buildCamps();
    this.buildAgilityCourse();
    this.buildCritters(rng);

    // yarn ball textures
    this.yarnTexNormal = this.paintYarnTexture('#e05d7e', '#b23a5a');
    this.yarnTexGold = this.paintYarnTexture('#f5cf58', '#c99a1e');

    // lights
    this.hemi = new THREE.HemisphereLight('#bfd9ff', '#8a9a6a', 0.75);
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff2d8', 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 260;
    const sc = 55;
    this.sun.shadow.camera.left = -sc;
    this.sun.shadow.camera.right = sc;
    this.sun.shadow.camera.top = sc;
    this.sun.shadow.camera.bottom = -sc;
    this.sun.shadow.bias = -0.0004;
    this.group.add(this.sun, this.sun.target);
    this.moon = new THREE.DirectionalLight('#9fb4de', 0);
    this.group.add(this.moon, this.moon.target);

    scene.add(this.group);
  }

  // ——— terrain height (analytic; physics uses the same function) ———
  heightAt(x: number, z: number): number {
    const d = Math.hypot(x, z);
    const island = smoothstep(clamp01(1 - (d - 155) / 95)); // 1 inside, 0 at ~250
    let h = (fbm(x * 0.011, z * 0.011, this.seed, 4) * 15 - 3.5) * island;
    // big hill
    h += gauss(Math.hypot(x - this.hillC.x, z - this.hillC.z), 55) * 11 * island;
    // drop-off to sea floor
    h += (island - 1) * 9;
    // lake carve
    h -= gauss(Math.hypot(x - this.lakeC.x, z - this.lakeC.z), 34) * 10;
    // islets rise from the sea
    for (const it of this.islets) {
      h += gauss(Math.hypot(x - it.x, z - it.z), it.r) * (9 + it.r * 0.1);
    }
    // flatten pads
    for (const f of this.flatSpots) {
      const t = smoothstep(clamp01(1 - Math.hypot(x - f.x, z - f.z) / f.r));
      h = h * (1 - t) + f.h * t;
    }
    return h;
  }

  /** ground normal (approx, for slope checks) */
  normalAt(x: number, z: number): THREE.Vector3 {
    const e = 0.6;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return new THREE.Vector3(-hx, 2 * e, -hz).normalize();
  }

  private buildTerrain(): THREE.Mesh {
    const segs = 170;
    const size = WORLD_SIZE * 1.5; // extend under the sea
    const geoT = new THREE.PlaneGeometry(size, size, segs, segs);
    geoT.rotateX(-Math.PI / 2);
    const pos = geoT.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const cGrass = new THREE.Color('#79a854');
    const cGrass2 = new THREE.Color('#5e9146');
    const cForest = new THREE.Color('#4d7c3a');
    const cSand = new THREE.Color('#e3d29a');
    const cRock = new THREE.Color('#8d8d84');
    const cSea = new THREE.Color('#c9bd8d');
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);
      const n = fbm(x * 0.05, z * 0.05, this.seed + 77, 3);
      const forest = fbm(x * 0.02, z * 0.02, this.seed + 313, 3);
      if (h < WATER_LEVEL - 0.5) tmp.copy(cSea).multiplyScalar(0.8 + n * 0.2);
      else if (h < WATER_LEVEL + 1.1) tmp.copy(cSand).multiplyScalar(0.92 + n * 0.12);
      else if (h > 10.5) tmp.copy(cRock).multiplyScalar(0.85 + n * 0.25);
      else {
        tmp.copy(n > 0.5 ? cGrass : cGrass2);
        if (forest > 0.56) tmp.lerp(cForest, 0.6);
        tmp.multiplyScalar(0.9 + n * 0.18);
      }
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geoT.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geoT.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    const mesh = new THREE.Mesh(geoT, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildWater(): THREE.Mesh {
    const geoW = new THREE.PlaneGeometry(WORLD_SIZE * 2.2, WORLD_SIZE * 2.2, 96, 96);
    geoW.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uDay: { value: 1 },
        uSunDir: { value: new THREE.Vector3(0.5, 1, 0.3).normalize() },
      },
      vertexShader: `
        uniform float uTime;
        varying vec3 vPos;
        varying vec3 vNormal;
        void main() {
          vec3 p = position;
          float w1 = sin(p.x * 0.08 + uTime * 1.1) * cos(p.z * 0.07 + uTime * 0.9);
          float w2 = sin(p.x * 0.21 - uTime * 1.7 + p.z * 0.17) * 0.5;
          p.y += (w1 + w2) * 0.18;
          vPos = p;
          float dx = cos(p.x * 0.08 + uTime * 1.1) * 0.08 * cos(p.z * 0.07);
          float dz = -sin(p.x * 0.08) * sin(p.z * 0.07 + uTime * 0.9) * 0.07;
          vNormal = normalize(vec3(-dx * 3.0, 1.0, -dz * 3.0));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uDay;
        uniform vec3 uSunDir;
        varying vec3 vPos;
        varying vec3 vNormal;
        void main() {
          vec3 deep = mix(vec3(0.05,0.09,0.18), vec3(0.10,0.42,0.55), uDay);
          vec3 shallow = mix(vec3(0.08,0.14,0.24), vec3(0.24,0.62,0.66), uDay);
          vec3 viewDir = normalize(cameraPosition - vPos);
          float fres = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 2.0);
          vec3 col = mix(deep, shallow, fres * 0.9 + 0.15);
          // sun sparkle
          vec3 hv = normalize(viewDir + normalize(uSunDir));
          float spec = pow(max(dot(vNormal, hv), 0.0), 90.0) * uDay;
          col += vec3(1.0, 0.95, 0.8) * spec * 0.9;
          gl_FragColor = vec4(col, 0.86);
        }
      `,
    });
    const mesh = new THREE.Mesh(geoW, mat);
    mesh.position.y = WATER_LEVEL;
    return mesh;
  }

  private buildSky(): { mesh: THREE.Mesh; mat: THREE.ShaderMaterial } {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uDay: { value: 1 },     // 0 night → 1 day
        uDusk: { value: 0 },    // sunset warmth
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uDay;
        uniform float uDusk;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 dayTop = vec3(0.35, 0.62, 0.94);
          vec3 dayHor = vec3(0.78, 0.88, 0.96);
          vec3 nightTop = vec3(0.03, 0.05, 0.13);
          vec3 nightHor = vec3(0.10, 0.13, 0.25);
          vec3 top = mix(nightTop, dayTop, uDay);
          vec3 hor = mix(nightHor, dayHor, uDay);
          hor = mix(hor, vec3(0.96, 0.62, 0.38), uDusk);
          vec3 col = mix(hor, top, pow(h, 0.75));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), mat);
    return { mesh, mat };
  }

  private buildStars(): THREE.Points {
    const n = 350;
    const posArr = new Float32Array(n * 3);
    const rng = mulberry32(this.seed + 999);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const y = 0.15 + rng() * 0.85;
      const r = Math.sqrt(1 - y * y);
      posArr[i * 3] = Math.cos(a) * r * 850;
      posArr[i * 3 + 1] = y * 850;
      posArr[i * 3 + 2] = Math.sin(a) * r * 850;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const m = new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0 });
    return new THREE.Points(g, m);
  }

  // ——— flora: instanced trees, grass, flowers, bushes, mushrooms ———
  private buildFlora(rng: () => number) {
    const treeSpots: { x: number; z: number; s: number }[] = [];
    const step = 9;
    for (let gx = -125; gx <= 125; gx += step) {
      for (let gz = -125; gz <= 125; gz += step) {
        const x = gx + (hash2(gx, gz, this.seed + 5) - 0.5) * step * 0.9;
        const z = gz + (hash2(gx, gz, this.seed + 6) - 0.5) * step * 0.9;
        const h = this.heightAt(x, z);
        if (h < 1.2 || h > 10.5) continue;
        const forest = fbm(x * 0.02, z * 0.02, this.seed + 313, 3);
        const p = forest > 0.56 ? 0.75 : forest > 0.48 ? 0.18 : 0.03;
        if (hash2(gx, gz, this.seed + 7) > p) continue;
        // keep clear of camps/agility
        if (this.nearPad(x, z, 4)) continue;
        treeSpots.push({ x, z, s: 0.75 + hash2(gx, gz, this.seed + 8) * 0.7 });
      }
    }
    // a few trees on islets
    for (const it of this.islets) {
      for (let i = 0; i < 3; i++) {
        const a = rng() * Math.PI * 2;
        const d = rng() * it.r * 0.5;
        treeSpots.push({ x: it.x + Math.cos(a) * d, z: it.z + Math.sin(a) * d, s: 0.7 + rng() * 0.4 });
      }
    }

    const n = treeSpots.length;
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.44, 1, 8);
    trunkGeo.translate(0, 0.5, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#6e5136', roughness: 1 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, n);
    trunks.castShadow = true;
    const folGeo = new THREE.IcosahedronGeometry(1, 1);
    const folMat = new THREE.MeshStandardMaterial({ roughness: 1 });
    const foliage = new THREE.InstancedMesh(folGeo, folMat, n * 3);
    foliage.castShadow = true;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const vs = new THREE.Vector3();
    const col = new THREE.Color();
    let fi = 0;
    for (let i = 0; i < n; i++) {
      const t = treeSpots[i];
      const h = this.heightAt(t.x, t.z);
      const trunkH = 3.4 * t.s + 1.2;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash2(i, 1, this.seed) * Math.PI * 2);
      m.compose(new THREE.Vector3(t.x, h - 0.2, t.z), q, vs.set(t.s, trunkH, t.s));
      trunks.setMatrixAt(i, m);

      const hue = 0.26 + hash2(i, 2, this.seed) * 0.09;
      const light = 0.3 + hash2(i, 3, this.seed) * 0.14;
      for (let j = 0; j < 3; j++) {
        const fr = (1.5 - j * 0.32) * t.s;
        const fy = h + trunkH * (0.72 + j * 0.26);
        const ox = (hash2(i, 10 + j, this.seed) - 0.5) * 0.8 * t.s;
        const oz = (hash2(i, 20 + j, this.seed) - 0.5) * 0.8 * t.s;
        m.compose(
          new THREE.Vector3(t.x + ox, fy, t.z + oz),
          q,
          vs.set(fr, fr * (0.82 + hash2(i, 30 + j, this.seed) * 0.3), fr)
        );
        foliage.setMatrixAt(fi, m);
        col.setHSL(hue, 0.45, light + j * 0.03);
        foliage.setColorAt(fi, col);
        fi++;
      }

      this.trees.push({
        id: `tree_${i}`,
        x: t.x, z: t.z,
        trunkH,
        r: 0.5 * t.s,
        perchY: h + trunkH * 0.8,
      });
    }
    foliage.count = fi;
    if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;
    this.group.add(trunks, foliage);

    // grass tufts — little cones (flat quads go black from behind with DoubleSide lighting)
    const grassN = 2600;
    const bladeGeo = new THREE.ConeGeometry(0.22, 0.55, 5);
    bladeGeo.translate(0, 0.24, 0);
    const grassMat = new THREE.MeshStandardMaterial({ roughness: 1 });
    const grass = new THREE.InstancedMesh(bladeGeo, grassMat, grassN);
    let gi = 0;
    for (let i = 0; i < grassN * 2 && gi < grassN; i++) {
      const x = (mulRand(this.seed + i * 3) - 0.5) * 300;
      const z = (mulRand(this.seed + i * 3 + 1) - 0.5) * 300;
      const h = this.heightAt(x, z);
      if (h < 1 || h > 9.5) continue;
      if (this.normalAt(x, z).y < 0.9) continue; // no grass on steep slopes
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), mulRand(this.seed + i * 3 + 2) * Math.PI);
      const sc = 0.7 + mulRand(this.seed + i * 7) * 0.9;
      m.compose(new THREE.Vector3(x, h - 0.08, z), q, vs.set(sc, sc, sc));
      grass.setMatrixAt(gi, m);
      col.setHSL(0.24 + mulRand(this.seed + i * 11) * 0.07, 0.48, 0.4 + mulRand(this.seed + i * 13) * 0.14);
      grass.setColorAt(gi, col);
      gi++;
    }
    grass.count = gi;
    this.group.add(grass);

    // flowers
    const flowerN = 420;
    const fGeo = new THREE.SphereGeometry(0.16, 6, 5);
    fGeo.translate(0, 0.5, 0);
    const fMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    const flowers = new THREE.InstancedMesh(fGeo, fMat, flowerN);
    const petalCols = ['#f2a7c3', '#f5d76e', '#c39bd3', '#f1948a', '#85c1e9', '#f8f4e3'];
    let fli = 0;
    for (let i = 0; i < flowerN * 2 && fli < flowerN; i++) {
      const x = (mulRand(this.seed + 5000 + i * 3) - 0.5) * 280;
      const z = (mulRand(this.seed + 5000 + i * 3 + 1) - 0.5) * 280;
      const h = this.heightAt(x, z);
      if (h < 1.2 || h > 8) continue;
      const meadow = fbm(x * 0.02, z * 0.02, this.seed + 313, 3);
      if (meadow > 0.52) continue; // flowers in meadows, not forest
      m.compose(new THREE.Vector3(x, h, z), q.identity(), vs.setScalar(0.8 + mulRand(this.seed + i) * 0.7));
      flowers.setMatrixAt(fli, m);
      col.set(petalCols[Math.floor(mulRand(this.seed + 6000 + i) * petalCols.length)]);
      flowers.setColorAt(fli, col);
      fli++;
    }
    flowers.count = fli;
    this.group.add(flowers);

    // mushrooms (little Kan friends)
    const mushN = 60;
    const stemGeo = new THREE.CylinderGeometry(0.09, 0.13, 0.36, 6);
    stemGeo.translate(0, 0.18, 0);
    const capGeo = new THREE.SphereGeometry(0.26, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    capGeo.translate(0, 0.33, 0);
    const stemMat = new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 1 });
    const capMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const stems = new THREE.InstancedMesh(stemGeo, stemMat, mushN);
    const caps = new THREE.InstancedMesh(capGeo, capMat, mushN);
    let mi = 0;
    for (let i = 0; i < mushN * 3 && mi < mushN; i++) {
      const x = (mulRand(this.seed + 9000 + i * 3) - 0.5) * 270;
      const z = (mulRand(this.seed + 9000 + i * 3 + 1) - 0.5) * 270;
      const h = this.heightAt(x, z);
      if (h < 1.5 || h > 9) continue;
      const forest = fbm(x * 0.02, z * 0.02, this.seed + 313, 3);
      if (forest < 0.54) continue; // mushrooms live in forest shade
      const sc = 0.7 + mulRand(this.seed + i) * 1.1;
      m.compose(new THREE.Vector3(x, h, z), q.identity(), vs.setScalar(sc));
      stems.setMatrixAt(mi, m);
      caps.setMatrixAt(mi, m);
      col.set(mulRand(this.seed + 9500 + i) > 0.5 ? '#c74b3f' : '#d99a4e');
      caps.setColorAt(mi, col);
      mi++;
    }
    stems.count = mi;
    caps.count = mi;
    this.group.add(stems, caps);
  }

  private nearPad(x: number, z: number, margin: number): boolean {
    for (const f of this.flatSpots) {
      if (Math.hypot(x - f.x, z - f.z) < f.r + margin) return true;
    }
    return false;
  }

  private buildRocks(rng: () => number) {
    const n = 110;
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ roughness: 1 });
    const rocksMesh = new THREE.InstancedMesh(rockGeo, rockMat, n);
    rocksMesh.castShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const vs = new THREE.Vector3();
    const col = new THREE.Color();
    let ri = 0;
    for (let i = 0; i < n * 3 && ri < n; i++) {
      const x = (rng() - 0.5) * 300;
      const z = (rng() - 0.5) * 300;
      const h = this.heightAt(x, z);
      if (h < 0.8 || this.nearPad(x, z, 2)) continue;
      const r = 0.5 + rng() * 1.8;
      q.setFromEuler(new THREE.Euler(rng() * 0.5, rng() * Math.PI, rng() * 0.5));
      m.compose(new THREE.Vector3(x, h + r * 0.15, z), q, vs.set(r, r * (0.6 + rng() * 0.5), r));
      rocksMesh.setMatrixAt(ri, m);
      col.setHSL(0.1, 0.05 + rng() * 0.06, 0.42 + rng() * 0.2);
      rocksMesh.setColorAt(ri, col);
      if (r > 0.9) this.rocks.push({ x, z, r: r * 0.9 });
      ri++;
    }
    rocksMesh.count = ri;
    this.group.add(rocksMesh);
  }

  private buildDigMounds(rng: () => number) {
    const moundGeo = new THREE.SphereGeometry(0.7, 10, 6);
    const moundMat = new THREE.MeshStandardMaterial({ color: '#7d5b3c', roughness: 1 });
    for (let i = 0; i < 26; i++) {
      let x = 0, z = 0, ok = false;
      for (let tries = 0; tries < 12 && !ok; tries++) {
        x = (rng() - 0.5) * 280;
        z = (rng() - 0.5) * 280;
        const h = this.heightAt(x, z);
        ok = h > 1.2 && h < 9 && !this.nearPad(x, z, 1);
      }
      if (!ok) continue;
      const mesh = new THREE.Mesh(moundGeo, moundMat);
      mesh.position.set(x, this.heightAt(x, z), z);
      mesh.scale.set(1, 0.38, 1);
      mesh.castShadow = true;
      this.group.add(mesh);
      this.digMounds.push({ id: `mound_${i}`, x, z, dug: false, mesh });
    }
  }

  // ——— yarn ———
  paintYarnTexture(c1: string, c2: string): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = c2;
    ctx.lineWidth = 5;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * 16 - 10);
      ctx.bezierCurveTo(40, i * 16 + 12, 90, i * 16 - 14, 128, i * 16 + 8);
      ctx.stroke();
    }
    ctx.strokeStyle = c2 + '88';
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 20 - 8, 0);
      ctx.bezierCurveTo(i * 20 + 14, 45, i * 20 - 12, 90, i * 20 + 6, 128);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Spawn a wave of yarn balls. Skips ids already collected. */
  spawnYarn(wave: number, collectedIds: string[], goldenDone: string[]) {
    // clear existing
    for (const y of this.yarn) this.group.remove(y.mesh);
    this.yarn = [];
    const rng = mulberry32(this.seed + 31337 + wave * 101);
    const collected = new Set(collectedIds);
    const gDone = new Set(goldenDone);

    const mk = (id: string, x: number, z: number, y: number, golden: boolean, spot: YarnBall['spot']) => {
      if (collected.has(id) || (golden && gDone.has(id))) return;
      const grp = new THREE.Group();
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(golden ? 0.42 : 0.34, 14, 10),
        new THREE.MeshStandardMaterial({
          map: golden ? this.yarnTexGold : this.yarnTexNormal,
          roughness: 0.7,
          emissive: golden ? '#8a6a10' : '#000000',
          emissiveIntensity: golden ? 0.5 : 0,
        })
      );
      ball.castShadow = true;
      grp.add(ball);
      if (golden) {
        const glow = new THREE.Mesh(
          new THREE.SphereGeometry(0.62, 12, 8),
          new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.18 })
        );
        grp.add(glow);
      }
      grp.position.set(x, y, z);
      this.group.add(grp);
      this.yarn.push({ id, x, z, y, golden, spot, mesh: grp, collected: false });
    };

    // starter yarn right by camp so new players spot one immediately
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + wave;
      const x = this.playerCamp.x + Math.cos(a) * (9 + i * 3);
      const z = this.playerCamp.z + Math.sin(a) * (9 + i * 3);
      mk(`y_${wave}_camp${i}`, x, z, this.heightAt(x, z) + 0.35, false, 'ground');
    }
    // ground yarn
    let made = 0;
    for (let i = 0; i < 200 && made < 20; i++) {
      const x = (rng() - 0.5) * 290;
      const z = (rng() - 0.5) * 290;
      const h = this.heightAt(x, z);
      if (h < 1 || h > 10) continue;
      mk(`y_${wave}_g${i}`, x, z, h + 0.35, false, 'ground');
      made++;
    }
    // tree-perch yarn (climb to get)
    const treePick = [...this.trees].sort((a, b) => hash2(a.x | 0, a.z | 0, wave) - hash2(b.x | 0, b.z | 0, wave)).slice(0, 6);
    treePick.forEach((t, i) => mk(`y_${wave}_t${i}`, t.x, t.z, t.perchY + 0.4, false, 'tree'));
    // islet yarn (swim to get) — worth it: includes goldens
    this.islets.forEach((it, i) => {
      const h = this.heightAt(it.x, it.z);
      mk(`y_${wave}_i${i}a`, it.x + 3, it.z, h + 0.35, false, 'islet');
      mk(`yg_${wave}_i${i}`, it.x, it.z, this.heightAt(it.x, it.z) + 0.45, true, 'islet');
    });
    // golden on the big hill + scattered
    mk(`yg_${wave}_hill`, this.hillC.x, this.hillC.z, this.heightAt(this.hillC.x, this.hillC.z) + 0.45, true, 'hill');
    for (let i = 0; i < 60; i++) {
      if (this.yarn.filter((y) => y.golden).length >= 6) break;
      const x = (rng() - 0.5) * 270;
      const z = (rng() - 0.5) * 270;
      const h = this.heightAt(x, z);
      if (h < 1.4 || h > 10) continue;
      mk(`yg_${wave}_s${i}`, x, z, h + 0.45, true, 'ground');
    }
  }

  remainingYarn(): number {
    return this.yarn.filter((y) => !y.collected).length;
  }

  // ——— camps ———
  private buildCamps() {
    for (const camp of this.camps) {
      const clan = RIVAL_CLANS.find((c) => c.id === camp.clanId)!;
      const h = this.heightAt(camp.x, camp.z);
      const g = new THREE.Group();
      g.position.set(camp.x, h, camp.z);
      // den: dome
      const den = new THREE.Mesh(
        new THREE.SphereGeometry(2.4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: '#8a6a48', roughness: 1 })
      );
      den.castShadow = true;
      g.add(den);
      const door = new THREE.Mesh(
        new THREE.CylinderGeometry(0.8, 0.8, 0.5, 10, 1, false, 0, Math.PI),
        new THREE.MeshStandardMaterial({ color: '#3a2a18', roughness: 1 })
      );
      door.rotation.x = Math.PI / 2;
      door.rotation.z = Math.PI / 2;
      door.position.set(0, 0.6, 2.3);
      g.add(door);
      // banner
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.1, 4.6, 6),
        new THREE.MeshStandardMaterial({ color: '#5d4530', roughness: 1 })
      );
      pole.position.set(3.4, 2.3, 1.2);
      pole.castShadow = true;
      g.add(pole);
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(1.7, 1.0),
        new THREE.MeshStandardMaterial({ color: clan.color, side: THREE.DoubleSide, roughness: 0.9 })
      );
      flag.position.set(3.4 + 0.88, 4.0, 1.2);
      g.add(flag);
      // scratch log
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.5, 2.4, 8),
        new THREE.MeshStandardMaterial({ color: '#6e5136', roughness: 1 })
      );
      log.rotation.z = Math.PI / 2 - 0.3;
      log.position.set(-3.2, 0.5, 1.6);
      log.castShadow = true;
      g.add(log);
      this.group.add(g);
      this.rocks.push({ x: camp.x, z: camp.z, r: 2.6 }); // den collision
    }

    // player camp: humble start — a stone circle + worn patch
    const pc = this.playerCamp;
    const h = this.heightAt(pc.x, pc.z);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.2, 0.16, 6, 24),
      new THREE.MeshStandardMaterial({ color: '#9a917e', roughness: 1 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(pc.x, h + 0.06, pc.z);
    this.group.add(ring);
  }

  // ——— buildings (player-built) ———
  addBuilding(b: BuildingInstance) {
    const def = BUILDABLES.find((d) => d.id === b.type);
    if (!def) return;
    const h = this.heightAt(b.x, b.z);
    const g = new THREE.Group();
    g.position.set(b.x, h, b.z);
    g.rotation.y = b.rot;
    const wood = new THREE.MeshStandardMaterial({ color: '#8a6a48', roughness: 1 });
    const wood2 = new THREE.MeshStandardMaterial({ color: '#6e5136', roughness: 1 });

    switch (b.type) {
      case 'den': {
        const dome = new THREE.Mesh(new THREE.SphereGeometry(1.9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), wood);
        dome.castShadow = true;
        g.add(dome);
        const hole = new THREE.Mesh(new THREE.SphereGeometry(0.62, 8, 6), new THREE.MeshStandardMaterial({ color: '#2e2115' }));
        hole.position.set(0, 0.55, 1.6);
        g.add(hole);
        break;
      }
      case 'post': {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.24, 10), wood2);
        base.position.y = 0.12;
        g.add(base);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.7, 8), new THREE.MeshStandardMaterial({ color: '#c9b28a', roughness: 1 }));
        post.position.y = 1.0;
        post.castShadow = true;
        g.add(post);
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), wood);
        top.position.y = 1.95;
        g.add(top);
        this.scratchSpots.push({ id: b.id, x: b.x, z: b.z, label: 'Scratch' });
        break;
      }
      case 'tower': {
        let y = 0;
        const sizes = [1.4, 1.1, 0.85];
        for (let i = 0; i < 3; i++) {
          const box = new THREE.Mesh(new THREE.BoxGeometry(sizes[i] * 2, 1.1, sizes[i] * 2), i % 2 ? wood : wood2);
          box.position.y = y + 0.55;
          box.castShadow = true;
          g.add(box);
          y += 1.1;
        }
        const plat = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.18, 10), wood);
        plat.position.y = y + 0.09;
        g.add(plat);
        break;
      }
      case 'basket': {
        const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.6, 0.7, 12, 1, true), new THREE.MeshStandardMaterial({ color: '#b08d57', roughness: 1, side: THREE.DoubleSide }));
        basket.position.y = 0.35;
        basket.castShadow = true;
        g.add(basket);
        for (let i = 0; i < 3; i++) {
          const yb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshStandardMaterial({ map: this.yarnTexNormal, roughness: 0.7 }));
          yb.position.set((i - 1) * 0.35, 0.75, (i % 2) * 0.3 - 0.15);
          g.add(yb);
        }
        break;
      }
      case 'flowers': {
        const bed = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.7, 0.18, 14), new THREE.MeshStandardMaterial({ color: '#5d4530', roughness: 1 }));
        bed.position.y = 0.09;
        g.add(bed);
        const cols = ['#f2a7c3', '#f5d76e', '#c39bd3', '#f1948a'];
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshStandardMaterial({ color: cols[i % 4], roughness: 0.85 }));
          f.position.set(Math.cos(a) * (0.4 + (i % 3) * 0.4), 0.45, Math.sin(a) * (0.4 + (i % 3) * 0.4));
          g.add(f);
        }
        break;
      }
      case 'lantern': {
        const poleL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.2, 6), wood2);
        poleL.position.y = 1.1;
        poleL.castShadow = true;
        g.add(poleL);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffd97a', emissive: '#ffb830', emissiveIntensity: 1.2, roughness: 0.4 }));
        bulb.position.y = 2.3;
        g.add(bulb);
        const light = new THREE.PointLight('#ffc860', 0, 14, 2);
        light.position.y = 2.3;
        g.add(light);
        this.campLights.push(light);
        break;
      }
      case 'tent': {
        const tent = new THREE.Mesh(new THREE.ConeGeometry(1.9, 2.3, 5), new THREE.MeshStandardMaterial({ color: '#7ba05b', roughness: 1, flatShading: true }));
        tent.position.y = 1.15;
        tent.castShadow = true;
        g.add(tent);
        const openings = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.0, 3), new THREE.MeshStandardMaterial({ color: '#243318' }));
        openings.position.set(0, 0.5, 1.45);
        g.add(openings);
        break;
      }
      case 'pond': {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.22, 8, 18), new THREE.MeshStandardMaterial({ color: '#9a917e', roughness: 1 }));
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.12;
        g.add(rim);
        const waterD = new THREE.Mesh(new THREE.CircleGeometry(1.55, 18), new THREE.MeshStandardMaterial({ color: '#4aa3c7', roughness: 0.15, transparent: true, opacity: 0.9 }));
        waterD.rotation.x = -Math.PI / 2;
        waterD.position.y = 0.1;
        g.add(waterD);
        const fish = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshStandardMaterial({ color: '#e88c3a', roughness: 0.5 }));
        fish.scale.set(1.6, 0.8, 0.7);
        fish.position.set(0.4, 0.06, 0.2);
        g.add(fish);
        break;
      }
      case 'banner': {
        const poleB = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.6, 6), wood2);
        poleB.position.y = 2.3;
        poleB.castShadow = true;
        g.add(poleB);
        const flagB = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.0), new THREE.MeshStandardMaterial({ color: '#d4a017', side: THREE.DoubleSide, roughness: 0.9 }));
        flagB.position.set(0.88, 4.0, 0);
        g.add(flagB);
        break;
      }
      case 'statue': {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 1.6, 10), new THREE.MeshStandardMaterial({ color: '#e5dcc6', roughness: 0.9 }));
        stem.position.y = 0.8;
        stem.castShadow = true;
        g.add(stem);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(1.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#c74b3f', roughness: 0.85 }));
        cap.position.y = 1.55;
        cap.castShadow = true;
        g.add(cap);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + 0.4;
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshStandardMaterial({ color: '#f5efe0' }));
          dot.position.set(Math.cos(a) * 0.8, 1.85, Math.sin(a) * 0.8);
          g.add(dot);
        }
        break;
      }
    }
    this.group.add(g);
    this.buildingMeshes.set(b.id, g);
    if (b.type !== 'flowers' && b.type !== 'pond') this.rocks.push({ x: b.x, z: b.z, r: 1.2 });
  }

  removeBuildingMesh(id: string) {
    const g = this.buildingMeshes.get(id);
    if (g) {
      this.group.remove(g);
      this.buildingMeshes.delete(id);
    }
  }

  // ——— agility course ———
  private buildAgilityCourse() {
    const c = this.agilityCenter;
    const h0 = this.heightAt(c.x, c.z);
    const dir = Math.atan2(-c.z, -c.x); // course runs toward island center
    const dx = Math.cos(dir);
    const dz = Math.sin(dir);
    const px = -dz; // perpendicular
    const pz = dx;

    const at = (along: number, side: number) => ({
      x: c.x + dx * along + px * side,
      z: c.z + dz * along + pz * side,
    });

    const wood = new THREE.MeshStandardMaterial({ color: '#b08d57', roughness: 1 });
    const red = new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.8 });
    const blue = new THREE.MeshStandardMaterial({ color: '#2980b9', roughness: 0.8 });

    const flagPole = (x: number, z: number, color: THREE.MeshStandardMaterial) => {
      const g = new THREE.Group();
      const y = this.heightAt(x, z);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3, 6), wood);
      p.position.set(x, y + 1.5, z);
      p.castShadow = true;
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), color);
      f.material.side = THREE.DoubleSide;
      f.position.set(x + 0.55, y + 2.6, z);
      g.add(p, f);
      this.group.add(g);
    };

    // start
    const start = at(-26, 0);
    flagPole(start.x - px * 1.6, start.z - pz * 1.6, blue);
    flagPole(start.x + px * 1.6, start.z + pz * 1.6, blue);
    this.agilityGates.push({ x: start.x, z: start.z, kind: 'start' });

    // weave poles
    for (let i = 0; i < 4; i++) {
      const p0 = at(-16 + i * 4, i % 2 === 0 ? 2.2 : -2.2);
      const y = this.heightAt(p0.x, p0.z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.2, 8), i % 2 ? red : blue);
      pole.position.set(p0.x, y + 1.1, p0.z);
      pole.castShadow = true;
      this.group.add(pole);
      const gate = at(-16 + i * 4, i % 2 === 0 ? -0.8 : 0.8);
      this.agilityGates.push({ x: gate.x, z: gate.z, kind: 'weave' });
    }

    // hurdles
    for (let i = 0; i < 2; i++) {
      const p0 = at(2 + i * 7, 0);
      const y = this.heightAt(p0.x, p0.z);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.2, 8), red);
      bar.rotation.z = Math.PI / 2;
      bar.rotation.y = -dir;
      bar.position.set(p0.x, y + 0.72, p0.z);
      this.group.add(bar);
      for (const side of [-1.6, 1.6]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.9, 6), wood);
        const pp = at(2 + i * 7, side);
        post.position.set(pp.x, this.heightAt(pp.x, pp.z) + 0.45, pp.z);
        this.group.add(post);
      }
      this.agilityGates.push({ x: p0.x, z: p0.z, kind: 'hurdle' });
    }

    // tunnel: arch
    const tp = at(15, 0);
    const ty = this.heightAt(tp.x, tp.z);
    const tunnel = new THREE.Mesh(
      new THREE.TorusGeometry(1.35, 0.28, 8, 16, Math.PI),
      new THREE.MeshStandardMaterial({ color: '#7ba05b', roughness: 1 })
    );
    tunnel.rotation.y = -dir + Math.PI / 2;
    tunnel.position.set(tp.x, ty, tp.z);
    tunnel.castShadow = true;
    this.group.add(tunnel);
    this.agilityGates.push({ x: tp.x, z: tp.z, kind: 'tunnel' });

    // ramp
    const rp = at(23, 0);
    const ry = this.heightAt(rp.x, rp.z);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 2.2), wood);
    ramp.rotation.y = -dir;
    ramp.rotation.z = 0.42;
    ramp.position.set(rp.x, ry + 0.75, rp.z);
    ramp.castShadow = true;
    this.group.add(ramp);
    this.agilityGates.push({ x: rp.x, z: rp.z, kind: 'ramp' });

    // finish
    const fin = at(31, 0);
    flagPole(fin.x - px * 1.6, fin.z - pz * 1.6, red);
    flagPole(fin.x + px * 1.6, fin.z + pz * 1.6, red);
    this.agilityGates.push({ x: fin.x, z: fin.z, kind: 'finish' });
  }

  // ——— critters ———
  private buildCritters(rng: () => number) {
    const mkButterfly = () => {
      const g = new THREE.Group();
      const colr = ['#f5d76e', '#e59866', '#af7ac5', '#ec7063', '#5dade2'][irange(rng, 0, 4)];
      const wingGeo = new THREE.PlaneGeometry(0.22, 0.3);
      const wingMat = new THREE.MeshBasicMaterial({ color: colr, side: THREE.DoubleSide });
      const wl = new THREE.Mesh(wingGeo, wingMat);
      wl.position.x = -0.11;
      const wr = new THREE.Mesh(wingGeo, wingMat);
      wr.position.x = 0.11;
      g.add(wl, wr);
      g.userData = { wl, wr };
      return g;
    };
    const mkMouse = () => {
      const g = new THREE.Group();
      const grey = new THREE.MeshStandardMaterial({ color: '#8d8478', roughness: 1 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), grey);
      body.scale.set(1, 0.8, 1.5);
      body.position.y = 0.1;
      g.add(body);
      const earGeo = new THREE.SphereGeometry(0.05, 6, 5);
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(earGeo, grey);
        ear.position.set(s * 0.07, 0.2, 0.12);
        g.add(ear);
      }
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.3, 4), grey);
      tail.rotation.x = Math.PI / 2 - 0.4;
      tail.position.set(0, 0.08, -0.3);
      g.add(tail);
      return g;
    };
    const mkBird = () => {
      const g = new THREE.Group();
      const colr = ['#5dade2', '#cd6155', '#a5754a'][irange(rng, 0, 2)];
      const mat = new THREE.MeshStandardMaterial({ color: colr, roughness: 0.9 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat);
      body.scale.set(0.9, 0.9, 1.3);
      body.position.y = 0.16;
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat);
      head.position.set(0, 0.3, 0.14);
      g.add(head);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 6), new THREE.MeshStandardMaterial({ color: '#e8a13a' }));
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, 0.29, 0.26);
      g.add(beak);
      return g;
    };

    const spawn = (kind: Critter['kind'], count: number) => {
      for (let i = 0; i < count; i++) {
        let x = 0, z = 0, ok = false;
        for (let t = 0; t < 15 && !ok; t++) {
          x = (rng() - 0.5) * 260;
          z = (rng() - 0.5) * 260;
          const h = this.heightAt(x, z);
          ok = h > 1.2 && h < 9;
        }
        const g = kind === 'butterfly' ? mkButterfly() : kind === 'mouse' ? mkMouse() : mkBird();
        const y = this.heightAt(x, z) + (kind === 'butterfly' ? 1.1 : 0);
        g.position.set(x, y, z);
        this.group.add(g);
        this.critters.push({
          kind, group: g, x, z, y, homeX: x, homeZ: z,
          heading: rng() * Math.PI * 2,
          state: 'wander', stateT: 0,
          speed: kind === 'mouse' ? 2.2 : kind === 'bird' ? 1.4 : 0.9,
          phase: rng() * 10,
        });
      }
    };
    spawn('butterfly', 14);
    spawn('mouse', 9);
    spawn('bird', 7);
  }

  updateCritters(dt: number, time: number, playerX: number, playerZ: number, sneaking: boolean) {
    for (const c of this.critters) {
      c.stateT += dt;
      const distP = Math.hypot(c.x - playerX, c.z - playerZ);
      const scareRange = sneaking ? 1.6 : c.kind === 'butterfly' ? 2.2 : 5;

      if (c.state === 'caught') continue;
      if (c.state === 'gone') {
        // respawn after a while near home
        if (c.stateT > 20) {
          c.x = c.homeX; c.z = c.homeZ;
          c.state = 'wander';
          c.stateT = 0;
          c.group.visible = true;
        }
        continue;
      }

      if (c.state === 'wander' && distP < scareRange) {
        c.state = 'flee';
        c.stateT = 0;
        c.heading = Math.atan2(c.z - playerZ, c.x - playerX);
      }

      if (c.state === 'flee') {
        const sp = c.speed * 3;
        c.x += Math.cos(c.heading) * sp * dt;
        c.z += Math.sin(c.heading) * sp * dt;
        if (c.kind === 'bird' || c.kind === 'butterfly') {
          c.y += dt * 4; // fly up and away
          if (c.stateT > 2.5) {
            c.state = 'gone';
            c.stateT = 0;
            c.group.visible = false;
          }
        } else if (c.stateT > 2.2) {
          c.state = 'gone';
          c.stateT = 0;
          c.group.visible = false;
        }
      } else {
        // wander drift
        c.heading += (hash2(Math.floor(time * 0.5), this.critters.indexOf(c), this.seed) - 0.5) * dt * 3;
        const sp = c.kind === 'mouse' && Math.sin(time * 2 + c.phase) > 0.4 ? c.speed : c.kind === 'mouse' ? 0 : c.speed * 0.5;
        c.x += Math.cos(c.heading) * sp * dt;
        c.z += Math.sin(c.heading) * sp * dt;
        // stay near home
        const dh = Math.hypot(c.x - c.homeX, c.z - c.homeZ);
        if (dh > 14) c.heading = Math.atan2(c.homeZ - c.z, c.homeX - c.x);
        const groundY = this.heightAt(c.x, c.z);
        c.y = c.kind === 'butterfly'
          ? groundY + 1.0 + Math.sin(time * 2.4 + c.phase) * 0.35
          : groundY;
      }

      c.group.position.set(c.x, c.y, c.z);
      c.group.rotation.y = -c.heading + Math.PI / 2;
      if (c.kind === 'butterfly') {
        const flap = Math.sin(time * 18 + c.phase) * 0.9;
        (c.group.userData.wl as THREE.Mesh).rotation.y = flap;
        (c.group.userData.wr as THREE.Mesh).rotation.y = -flap;
      }
      if (c.kind === 'bird' && c.state === 'wander') {
        c.group.position.y = c.y + Math.abs(Math.sin(time * 6 + c.phase)) * 0.03;
      }
    }
  }

  catchCritter(c: Critter) {
    c.state = 'caught';
    c.group.visible = false;
    c.stateT = 0;
    // respawn far later
    setTimeout(() => {
      c.state = 'gone';
      c.stateT = 10;
    }, 30000);
  }

  // ——— day/night ———
  /** t: 0..1, 0=midnight, 0.5=noon */
  setTimeOfDay(t: number, playerX: number, playerZ: number) {
    const sunAngle = (t - 0.25) * Math.PI * 2; // sunrise at t=0.25
    const sy = Math.sin(sunAngle);
    const sx = Math.cos(sunAngle) * 0.6;
    const day = clamp01(sy * 3 + 0.1);           // 0 night, 1 day
    const dusk = clamp01(1 - Math.abs(sy) * 5) * clamp01(day * 2);

    this.sun.position.set(playerX + sx * 120, sy * 140 + 8, playerZ + 60);
    this.sun.target.position.set(playerX, 0, playerZ);
    this.sun.intensity = 2.2 * day;
    this.sun.color.setHSL(0.12 - dusk * 0.06, 0.5 + dusk * 0.4, 0.72 - dusk * 0.14);

    this.moon.position.set(playerX - sx * 120, -sy * 140 + 20, playerZ - 60);
    this.moon.target.position.set(playerX, 0, playerZ);
    this.moon.intensity = 0.5 * (1 - day);

    this.hemi.intensity = 0.28 + day * 0.5;
    this.skyMat.uniforms.uDay.value = day;
    this.skyMat.uniforms.uDusk.value = dusk;
    this.waterMat.uniforms.uDay.value = 0.15 + day * 0.85;
    (this.stars.material as THREE.PointsMaterial).opacity = clamp01(1 - day * 2) * 0.9;

    for (const l of this.campLights) l.intensity = (1 - day) * 2.2;
  }

  update(dt: number, time: number, playerX: number, playerZ: number) {
    this.waterMat.uniforms.uTime.value = time;
    this.skyMesh.position.set(playerX, 0, playerZ);
    this.stars.position.set(playerX, 0, playerZ);
    // yarn bob + spin
    for (const y of this.yarn) {
      if (y.collected) continue;
      y.mesh.rotation.y = time * 1.2;
      y.mesh.position.y = y.y + Math.sin(time * 2 + y.x) * 0.08;
    }
  }

  /** circle push-out vs trees + rocks; returns corrected xz */
  collide(x: number, z: number, radius: number): { x: number; z: number } {
    for (const t of this.trees) {
      const dx = x - t.x;
      const dz = z - t.z;
      const d = Math.hypot(dx, dz);
      const min = t.r + radius;
      if (d < min && d > 0.001) {
        x = t.x + (dx / d) * min;
        z = t.z + (dz / d) * min;
      }
    }
    for (const r of this.rocks) {
      const dx = x - r.x;
      const dz = z - r.z;
      const d = Math.hypot(dx, dz);
      const min = r.r + radius;
      if (d < min && d > 0.001) {
        x = r.x + (dx / d) * min;
        z = r.z + (dz / d) * min;
      }
    }
    return { x, z };
  }

  nearestTree(x: number, z: number, maxDist: number): TreeInfo | null {
    let best: TreeInfo | null = null;
    let bd = maxDist;
    for (const t of this.trees) {
      const d = Math.hypot(x - t.x, z - t.z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
}

// tiny deterministic helper for flora scatter
function mulRand(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
