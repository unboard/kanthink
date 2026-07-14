// Whisker Wilds — procedural island world
// v2 detail pass: wind-blown grass blades, oak/pine/birch forests with
// swaying canopies, falling leaves, fallen logs, cattails & lily pads,
// drifting clouds, fireflies at night, terrain micro-detail.

import * as THREE from 'three';
import { mulberry32, fbm, irange, hash2 } from './rng';
import { WORLD_SIZE, WATER_LEVEL, RIVAL_CLANS, BUILDABLES } from './data';
import type { BuildingInstance } from './types';

export interface TreeInfo { id: string; x: number; z: number; trunkH: number; r: number; perchY: number }
export interface RockInfo { x: number; z: number; r: number; topY?: number } // topY set = you can stand on it
export interface Platform { x: number; z: number; r: number; topY: number }
export interface DigMound { id: string; x: number; z: number; dug: boolean; mesh: THREE.Mesh }
export interface YarnBall {
  id: string; x: number; z: number; y: number; golden: boolean;
  surprise?: boolean; // pink yarn "eggs" crack open with a prize inside
  spot: 'ground' | 'tree' | 'islet' | 'hill';
  mesh: THREE.Group; collected: boolean;
}
export interface CampInfo { clanId: string; x: number; z: number; r: number }
export interface AgilityGate { x: number; z: number; kind: 'start' | 'weave' | 'hurdle' | 'tunnel' | 'ramp' | 'finish' }
export interface AgilityCourse {
  id: string;
  name: string;
  icon: string;
  center: { x: number; z: number };
  gates: AgilityGate[];
  basePar: number; // seconds, before the cat's agility stat discount
}
export interface PaintBucket { x: number; z: number; color: string | null } // null = wash-off water
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

interface Leaf { x: number; y: number; z: number; phase: number; spinX: number; spinY: number; groundT: number }

const gauss = (d: number, r: number) => Math.exp(-(d * d) / (r * r));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smoothstep = (v: number) => v * v * (3 - 2 * v);

export class World {
  seed: number;
  group = new THREE.Group();

  trees: TreeInfo[] = [];
  rocks: RockInfo[] = [];
  platforms: Platform[] = [];
  towerTop: Platform | null = null; // the Cat Tower Trial summit
  digMounds: DigMound[] = [];
  yarn: YarnBall[] = [];
  camps: CampInfo[] = [];
  islets: { x: number; z: number; r: number }[] = [];
  agilityGates: AgilityGate[] = []; // course 0 gates (kept for golden-yarn agility challenges)
  agilityCenter = { x: 0, z: 0 };
  courses: AgilityCourse[] = [];
  playerCamp = { x: 0, z: 0 };
  // Art Meadow: paint buckets + a paintable ground canvas
  artCenter = { x: 0, z: 0 };
  paintBuckets: PaintBucket[] = [];
  private artCtx: CanvasRenderingContext2D | null = null;
  private artTex: THREE.CanvasTexture | null = null;
  private readonly ART_HALF = 13; // patio disc radius == canvas half-extent (keeps UVs aligned)
  critters: Critter[] = [];
  scratchSpots: ScratchSpot[] = [];
  buildingMeshes = new Map<string, THREE.Group>();

  sun: THREE.DirectionalLight;
  moon: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  private skyMesh: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private waterMat: THREE.ShaderMaterial;
  private stars: THREE.Points;
  private campLights: THREE.PointLight[] = [];
  private clouds: THREE.Group;

  // wind
  private windShaders: { uniforms: { uTime: { value: number } } }[] = [];

  // dense grass ring around the player
  private readonly GRASS_CAP = 6500;
  private grassMesh!: THREE.InstancedMesh;
  private grassAnchor = { x: 1e9, z: 1e9 };
  quality = 1; // adaptive: 1 → 0.55 → 0.3 when a device can't hold frame rate

  // falling leaves
  private leafMesh: THREE.InstancedMesh;
  private leafState: Leaf[] = [];

  // fireflies
  private fireflies: THREE.Points;
  private fireflyBase: Float32Array;

  private lakeC: { x: number; z: number };
  private hillC: { x: number; z: number };
  // plateau: fully flat inside this radius (blend happens between plateau and r)
  private flatSpots: { x: number; z: number; r: number; h: number; plateau?: number }[] = [];

  private yarnTexNormal: THREE.CanvasTexture;
  private yarnTexGold: THREE.CanvasTexture;
  private yarnTexSurprise!: THREE.CanvasTexture;

  constructor(seed: number, scene: THREE.Scene) {
    this.seed = seed;
    const rng = mulberry32(seed);

    // seeded landmarks
    const a1 = rng() * Math.PI * 2;
    this.lakeC = { x: Math.cos(a1) * 70, z: Math.sin(a1) * 70 };
    const a2 = a1 + Math.PI * (0.6 + rng() * 0.5);
    this.hillC = { x: Math.cos(a2) * 90, z: Math.sin(a2) * 90 };
    const a3 = a1 + Math.PI;
    this.playerCamp = { x: Math.cos(a3) * 60, z: Math.sin(a3) * 60 };
    const a4 = a3 + 1.4;
    this.agilityCenter = { x: Math.cos(a4) * 105, z: Math.sin(a4) * 105 };
    const a5 = a3 - 1.25;
    this.artCenter = { x: Math.cos(a5) * 82, z: Math.sin(a5) * 82 };

    for (let i = 0; i < RIVAL_CLANS.length; i++) {
      const a = a3 + Math.PI * 0.5 + (i * Math.PI * 2) / 3 + 0.5;
      this.camps.push({ clanId: RIVAL_CLANS[i].id, x: Math.cos(a) * 120, z: Math.sin(a) * 120, r: 16 });
    }
    for (let i = 0; i < 3; i++) {
      const a = rng() * Math.PI * 2;
      const d = 265 + rng() * 45;
      this.islets.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: 18 + rng() * 10 });
    }

    this.flatSpots.push({ ...this.playerCamp, r: 26, h: 2.2 });
    for (const c of this.camps) this.flatSpots.push({ x: c.x, z: c.z, r: 20, h: 2.4 });
    this.flatSpots.push({ x: this.agilityCenter.x, z: this.agilityCenter.z, r: 34, h: 2.0 });
    this.flatSpots.push({ x: this.artCenter.x, z: this.artCenter.z, r: 26, h: 2.1, plateau: 16 });

    // ——— build everything ———
    this.group.add(this.buildTerrain());
    const water = this.buildWater();
    this.waterMat = water.material as THREE.ShaderMaterial;
    this.group.add(water);
    const sky = this.buildSky();
    this.skyMesh = sky.mesh;
    this.skyMat = sky.mat;
    this.group.add(this.skyMesh);
    this.stars = this.buildStars();
    this.group.add(this.stars);
    this.clouds = this.buildClouds(rng);
    this.group.add(this.clouds);

    this.buildFlora(rng);
    this.buildRocks(rng);
    this.buildLogsAndStumps(rng);
    this.buildLakeLife(rng);
    this.buildDigMounds(rng);
    this.buildCamps();
    this.buildAgilityCourse();
    this.buildCliffCourse();
    this.buildLakeCourse();
    this.buildCrags();
    this.buildTowerTrial();
    this.buildArtMeadow();
    this.buildCritters(rng);

    const leaves = this.buildLeaves(rng);
    this.leafMesh = leaves;
    this.group.add(leaves);
    const ff = this.buildFireflies(rng);
    this.fireflies = ff.points;
    this.fireflyBase = ff.base;
    this.group.add(this.fireflies);

    this.yarnTexNormal = this.paintYarnTexture('#e05d7e', '#b23a5a');
    this.yarnTexGold = this.paintYarnTexture('#f5cf58', '#c99a1e');
    this.yarnTexSurprise = this.paintYarnTexture('#f5c3d8', '#d489ac');

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
    const island = smoothstep(clamp01(1 - (d - 155) / 95));
    // domain warp bends the noise field so hills flow like eroded land
    const wx = x + (fbm(x * 0.004 + 7.3, z * 0.004, this.seed + 555, 2) - 0.5) * 55;
    const wz = z + (fbm(x * 0.004, z * 0.004 + 13.7, this.seed + 777, 2) - 0.5) * 55;
    let h = (fbm(wx * 0.011, wz * 0.011, this.seed, 4) * 15 - 3.5) * island;
    // rolling ridgelines (inverted-valley noise)
    const ridge = 1 - Math.abs(2 * fbm(wx * 0.006, wz * 0.006, this.seed + 99, 3) - 1);
    h += ridge * ridge * 5 * island;
    h += gauss(Math.hypot(x - this.hillC.x, z - this.hillC.z), 55) * 11 * island;
    h += (island - 1) * 9;
    h -= gauss(Math.hypot(x - this.lakeC.x, z - this.lakeC.z), 34) * 10;
    for (const it of this.islets) {
      h += gauss(Math.hypot(x - it.x, z - it.z), it.r) * (9 + it.r * 0.1);
    }
    for (const f of this.flatSpots) {
      const d = Math.hypot(x - f.x, z - f.z);
      const t = f.plateau !== undefined
        ? smoothstep(clamp01((f.r - d) / (f.r - f.plateau)))
        : smoothstep(clamp01(1 - d / f.r));
      h = h * (1 - t) + f.h * t;
    }
    return h;
  }

  normalAt(x: number, z: number): THREE.Vector3 {
    const e = 0.6;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return new THREE.Vector3(-hx, 2 * e, -hz).normalize();
  }

  /** register a material for wind sway. strength scales with vertex height. */
  private windify(mat: THREE.MeshStandardMaterial, strength: number, litFromAbove = false) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      this.windShaders.push(shader as unknown as { uniforms: { uTime: { value: number } } });
      shader.vertexShader = ('uniform float uTime;\n' + shader.vertexShader).replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec4 wwPos = instanceMatrix * vec4(position, 1.0);
          #else
            vec4 wwPos = vec4(position, 1.0);
          #endif
          float wwSway = max(0.0, position.y) * ${strength.toFixed(4)};
          transformed.x += sin(uTime * 1.7 + wwPos.x * 0.4 + wwPos.z * 0.25) * wwSway;
          transformed.z += cos(uTime * 1.3 + wwPos.x * 0.3 + wwPos.z * 0.17) * wwSway * 0.7;
        }`
      );
      if (litFromAbove) {
        // grass blades: light them like the ground so back faces never go black
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <normal_fragment_begin>',
          `#include <normal_fragment_begin>
          normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);`
        );
      }
    };
  }

  private buildTerrain(): THREE.Mesh {
    const segs = 200;
    const size = WORLD_SIZE * 1.5;
    const geoT = new THREE.PlaneGeometry(size, size, segs, segs);
    geoT.rotateX(-Math.PI / 2);
    const pos = geoT.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const cGrass = new THREE.Color('#79a854');
    const cGrass2 = new THREE.Color('#5e9146');
    const cGrassDry = new THREE.Color('#a8b060');
    const cForest = new THREE.Color('#4d7c3a');
    const cSand = new THREE.Color('#e3d29a');
    const cRock = new THREE.Color('#8d8d84');
    const cDirt = new THREE.Color('#8a7350');
    const cSea = new THREE.Color('#c9bd8d');
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);
      const n = fbm(x * 0.05, z * 0.05, this.seed + 77, 3);
      const n2 = fbm(x * 0.13, z * 0.13, this.seed + 811, 2);
      const forest = fbm(x * 0.02, z * 0.02, this.seed + 313, 3);
      // slope from neighbor samples — steep faces show bare rock like eroded cliffs
      const slopeY = new THREE.Vector3(
        -(this.heightAt(x + 0.8, z) - this.heightAt(x - 0.8, z)),
        1.6,
        -(this.heightAt(x, z + 0.8) - this.heightAt(x, z - 0.8))
      ).normalize().y;
      if (h < WATER_LEVEL - 0.5) tmp.copy(cSea).multiplyScalar(0.8 + n * 0.2);
      else if (h < WATER_LEVEL + 1.1) tmp.copy(cSand).multiplyScalar(0.92 + n * 0.12);
      else if (h > 11.5) tmp.copy(cRock).multiplyScalar(0.85 + n * 0.25);
      else {
        tmp.copy(n > 0.5 ? cGrass : cGrass2);
        if (n2 > 0.62) tmp.lerp(cGrassDry, 0.45);       // sun-dried patches
        if (forest > 0.56) {
          tmp.lerp(cForest, 0.6);
          if (n2 < 0.4) tmp.lerp(cDirt, 0.3);           // bare dirt under trees
        }
        if (slopeY < 0.82) tmp.lerp(cRock, clamp01((0.82 - slopeY) * 4)); // cliffs
        tmp.multiplyScalar(0.88 + n * 0.22);
      }
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geoT.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geoT.computeVertexNormals();

    // micro-detail: near-white speckle texture tiled over the whole island
    const dc = document.createElement('canvas');
    dc.width = 128; dc.height = 128;
    const dctx = dc.getContext('2d')!;
    dctx.fillStyle = '#ffffff';
    dctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2400; i++) {
      const v = Math.random();
      dctx.fillStyle = v > 0.5 ? `rgba(40,60,20,${0.04 + Math.random() * 0.08})` : `rgba(255,255,230,${0.05 + Math.random() * 0.06})`;
      const px = Math.random() * 128, py = Math.random() * 128;
      dctx.fillRect(px, py, 1 + Math.random() * 1.6, 1 + Math.random() * 2.4);
    }
    const detail = new THREE.CanvasTexture(dc);
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
    detail.repeat.set(110, 110);
    detail.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: detail });
    const mesh = new THREE.Mesh(geoT, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildWater(): THREE.Mesh {
    // bake the island heightfield into a texture: the fragment shader reads
    // per-pixel water depth for shore foam + shallow turquoise tint
    const HM = 220;
    const span = WORLD_SIZE * 2.2;
    const data = new Uint8Array(HM * HM);
    for (let iy = 0; iy < HM; iy++) {
      for (let ix = 0; ix < HM; ix++) {
        const x = (ix / (HM - 1) - 0.5) * span;
        const z = (iy / (HM - 1) - 0.5) * span;
        const h = this.heightAt(x, z);
        data[iy * HM + ix] = Math.max(0, Math.min(255, Math.round(((h + 20) / 40) * 255)));
      }
    }
    const hTex = new THREE.DataTexture(data, HM, HM, THREE.RedFormat, THREE.UnsignedByteType);
    hTex.magFilter = THREE.LinearFilter;
    hTex.minFilter = THREE.LinearFilter;
    hTex.needsUpdate = true;

    const geoW = new THREE.PlaneGeometry(span, span, 96, 96);
    geoW.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uDay: { value: 1 },
        uSunDir: { value: new THREE.Vector3(0.5, 1, 0.3).normalize() },
        uHeight: { value: hTex },
        uSpan: { value: span },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uSpan;
        varying vec3 vPos;
        varying vec3 vNormal;
        varying vec2 vWuv;
        void main() {
          vec3 p = position;
          vWuv = vec2(p.x, p.z) / uSpan + 0.5;
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
        uniform float uTime;
        uniform float uDay;
        uniform vec3 uSunDir;
        uniform sampler2D uHeight;
        varying vec3 vPos;
        varying vec3 vNormal;
        varying vec2 vWuv;
        void main() {
          float terrainH = texture2D(uHeight, vWuv).r * 40.0 - 20.0;
          float depth = -terrainH; // water level is 0
          vec3 deep = mix(vec3(0.05,0.09,0.18), vec3(0.10,0.42,0.55), uDay);
          vec3 shallow = mix(vec3(0.08,0.14,0.24), vec3(0.24,0.62,0.66), uDay);
          vec3 viewDir = normalize(cameraPosition - vPos);
          float fres = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 2.0);
          vec3 col = mix(deep, shallow, fres * 0.9 + 0.15);
          // shallow water goes glassy turquoise so the sand glows through
          vec3 lagoon = mix(vec3(0.12,0.2,0.28), vec3(0.32,0.74,0.72), uDay);
          col = mix(col, lagoon, smoothstep(3.2, 0.3, depth) * 0.55);
          // animated foam bands hugging the shoreline
          float band = smoothstep(1.0, 0.1, depth);
          float wave = 0.5 + 0.5 * sin(uTime * 1.8 - depth * 8.0);
          float lace = 0.72 + 0.28 * sin(vWuv.x * 780.0 + uTime * 0.4) * sin(vWuv.y * 830.0 - uTime * 0.3);
          float foam = clamp(band * wave * lace * 1.4, 0.0, 1.0);
          col = mix(col, vec3(0.95, 0.97, 0.95), foam * 0.8 * (0.35 + 0.65 * uDay));
          // sun sparkle
          vec3 hv = normalize(viewDir + normalize(uSunDir));
          float spec = pow(max(dot(vNormal, hv), 0.0), 90.0) * uDay;
          col += vec3(1.0, 0.95, 0.8) * spec * 0.9;
          gl_FragColor = vec4(col, 0.86 - band * 0.28);
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
        uDay: { value: 1 },
        uDusk: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
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
        uniform vec3 uSunDir;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 top = mix(vec3(0.03, 0.05, 0.13), vec3(0.32, 0.58, 0.92), uDay);
          vec3 hor = mix(vec3(0.10, 0.13, 0.25), vec3(0.78, 0.88, 0.96), uDay);
          hor = mix(hor, vec3(0.96, 0.62, 0.38), uDusk);
          vec3 col = mix(hor, top, pow(h, 0.75));
          // horizon haze (aerial-perspective feel)
          col = mix(col, mix(vec3(0.16,0.19,0.3), vec3(0.88, 0.92, 0.96), uDay), pow(1.0 - h, 4.0) * 0.4);
          vec3 dir = normalize(vDir);
          vec3 sd = normalize(uSunDir);
          float sunAmt = max(dot(dir, sd), 0.0);
          // sun disc + warm glow halo
          col += vec3(1.0, 0.92, 0.72) * pow(sunAmt, 1400.0) * 3.2 * uDay;
          col += vec3(1.0, 0.72, 0.42) * pow(sunAmt, 10.0) * (0.16 * uDay + 0.45 * uDusk);
          // small cool moon opposite the sun
          float moonAmt = max(dot(dir, -sd), 0.0);
          col += vec3(0.82, 0.88, 1.0) * pow(moonAmt, 2600.0) * 1.6 * (1.0 - uDay);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    return { mesh: new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), mat), mat };
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

  private buildClouds(rng: () => number): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: '#ffffff', roughness: 1, transparent: true, opacity: 0.92,
      emissive: '#ffffff', emissiveIntensity: 0.12,
    });
    const puffGeo = new THREE.SphereGeometry(1, 12, 9);
    for (let i = 0; i < 16; i++) {
      const cloud = new THREE.Group();
      const puffs = 4 + irange(rng, 0, 3);
      for (let j = 0; j < puffs; j++) {
        const puff = new THREE.Mesh(puffGeo, mat);
        puff.scale.set(5 + rng() * 7, 1.6 + rng() * 1.8, 3.5 + rng() * 4);
        puff.position.set((j - puffs / 2) * 5.2 + rng() * 3, rng() * 2 - j * 0.2, (rng() - 0.5) * 5);
        cloud.add(puff);
      }
      cloud.position.set((rng() - 0.5) * 780, 96 + rng() * 55, (rng() - 0.5) * 780);
      cloud.userData.speed = 1.1 + rng() * 1.4;
      group.add(cloud);
    }
    return group;
  }

  // ——— grass blade tuft geometry (5 bent blades) ———
  private buildGrassTuftGeo(): THREE.BufferGeometry {
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let vi = 0;
    const blades = 5;
    for (let b = 0; b < blades; b++) {
      const a = (b / blades) * Math.PI * 2 + b * 1.71;
      const bx = Math.cos(a) * 0.05;
      const bz = Math.sin(a) * 0.05;
      const lean = 0.1 + (b % 3) * 0.06;
      const lx = Math.cos(a) * lean;
      const lz = Math.sin(a) * lean;
      const h = 0.34 + (((b * 37) % 10) / 10) * 0.28;
      const w = 0.034;
      const px = -Math.sin(a);
      const pz = Math.cos(a);
      // tapered quad: wide base, narrow bent tip
      pos.push(
        bx - px * w, 0, bz - pz * w,
        bx + px * w, 0, bz + pz * w,
        bx + lx - px * w * 0.22, h, bz + lz - pz * w * 0.22,
        bx + lx + px * w * 0.22, h, bz + lz + pz * w * 0.22
      );
      for (let i = 0; i < 4; i++) nor.push(0, 1, 0);
      uv.push(0, 0, 1, 0, 0, 1, 1, 1);
      idx.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
      vi += 4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  // ——— flora ———
  private buildFlora(rng: () => number) {
    type TreeType = 'oak' | 'pine' | 'birch';
    const treeSpots: { x: number; z: number; s: number; type: TreeType }[] = [];
    const step = 9;
    for (let gx = -125; gx <= 125; gx += step) {
      for (let gz = -125; gz <= 125; gz += step) {
        const x = gx + (hash2(gx, gz, this.seed + 5) - 0.5) * step * 0.9;
        const z = gz + (hash2(gx, gz, this.seed + 6) - 0.5) * step * 0.9;
        const h = this.heightAt(x, z);
        if (h < 1.2 || h > 10.5) continue;
        const forest = fbm(x * 0.02, z * 0.02, this.seed + 313, 3);
        const p = forest > 0.56 ? 0.78 : forest > 0.48 ? 0.2 : 0.035;
        if (hash2(gx, gz, this.seed + 7) > p) continue;
        if (this.nearPad(x, z, 4)) continue;
        const tR = hash2(gx, gz, this.seed + 9);
        const type: TreeType = h > 7 || tR < 0.28 ? 'pine' : tR < 0.4 ? 'birch' : 'oak';
        treeSpots.push({ x, z, s: 0.75 + hash2(gx, gz, this.seed + 8) * 0.7, type });
      }
    }
    for (const it of this.islets) {
      for (let i = 0; i < 3; i++) {
        const a = rng() * Math.PI * 2;
        const d = rng() * it.r * 0.5;
        treeSpots.push({ x: it.x + Math.cos(a) * d, z: it.z + Math.sin(a) * d, s: 0.7 + rng() * 0.4, type: 'oak' });
      }
    }

    const counts = { oak: 0, pine: 0, birch: 0 };
    for (const t of treeSpots) counts[t.type]++;

    // geometry + materials per species
    const trunkGeo = new THREE.CylinderGeometry(0.26, 0.46, 1, 8);
    trunkGeo.translate(0, 0.5, 0);
    const oakTrunkMat = new THREE.MeshStandardMaterial({ color: '#6e5136', roughness: 1 });
    const birchTrunkMat = new THREE.MeshStandardMaterial({ color: '#e6e1d3', roughness: 0.9 });
    // lumpy organic canopy: displace an icosahedron along its normals
    const folGeo = new THREE.IcosahedronGeometry(1, 2);
    {
      const p = folGeo.attributes.position as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.set(p.getX(i), p.getY(i), p.getZ(i));
        const nse = fbm(v.x * 1.6 + 9, v.y * 1.6 + v.z * 1.6, this.seed + 404, 2);
        v.multiplyScalar(0.82 + nse * 0.4);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      folGeo.computeVertexNormals();
    }
    const folMat = new THREE.MeshStandardMaterial({ roughness: 1 });
    this.windify(folMat, 0.045);
    const pineGeo = new THREE.ConeGeometry(1, 1.6, 9);
    const pineMat = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });
    this.windify(pineMat, 0.035);

    const oakTrunks = new THREE.InstancedMesh(trunkGeo, oakTrunkMat, counts.oak + counts.pine);
    oakTrunks.castShadow = true;
    // visible boughs under the oak canopies
    const branchGeo = new THREE.CylinderGeometry(0.06, 0.11, 1, 6);
    branchGeo.translate(0, 0.5, 0);
    const branches = new THREE.InstancedMesh(branchGeo, oakTrunkMat, Math.max(1, counts.oak * 2));
    let branchI = 0;
    const birchTrunks = new THREE.InstancedMesh(trunkGeo, birchTrunkMat, Math.max(1, counts.birch));
    birchTrunks.castShadow = true;
    const foliage = new THREE.InstancedMesh(folGeo, folMat, (counts.oak + counts.birch) * 3);
    foliage.castShadow = true;
    const pineFol = new THREE.InstancedMesh(pineGeo, pineMat, Math.max(1, counts.pine * 3));
    pineFol.castShadow = true;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const vs = new THREE.Vector3();
    const col = new THREE.Color();
    let brownI = 0, birchI = 0, folI = 0, pineI = 0;

    for (let i = 0; i < treeSpots.length; i++) {
      const t = treeSpots[i];
      const h = this.heightAt(t.x, t.z);
      const isPine = t.type === 'pine';
      const trunkH = (isPine ? 2.6 : 3.4) * t.s + 1.2;
      const yaw = hash2(i, 1, this.seed) * Math.PI * 2;
      const tilt = (hash2(i, 44, this.seed) - 0.5) * 0.07;
      q.setFromEuler(new THREE.Euler(tilt, yaw, tilt * 0.7));
      m.compose(new THREE.Vector3(t.x, h - 0.2, t.z), q, vs.set(t.s * (t.type === 'birch' ? 0.65 : 1), trunkH, t.s * (t.type === 'birch' ? 0.65 : 1)));
      if (t.type === 'birch') birchTrunks.setMatrixAt(birchI++, m);
      else oakTrunks.setMatrixAt(brownI++, m);

      const qUp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      if (isPine) {
        // stacked cones, darker blue-green
        const hue = 0.36 + hash2(i, 2, this.seed) * 0.05;
        for (let j = 0; j < 3; j++) {
          const fr = (1.5 - j * 0.38) * t.s;
          const fy = h + trunkH * (0.42 + j * 0.3);
          m.compose(new THREE.Vector3(t.x, fy, t.z), qUp, vs.set(fr, fr * 1.15, fr));
          pineFol.setMatrixAt(pineI, m);
          col.setHSL(hue, 0.4, 0.22 + hash2(i, 30 + j, this.seed) * 0.09 + j * 0.02);
          pineFol.setColorAt(pineI, col);
          pineI++;
        }
      } else {
        const isBirch = t.type === 'birch';
        if (!isBirch) {
          // two boughs reaching out of the trunk into the canopy
          for (let bj = 0; bj < 2; bj++) {
            const byaw = hash2(i, 60 + bj, this.seed) * Math.PI * 2;
            const bpitch = 0.85 + hash2(i, 70 + bj, this.seed) * 0.35;
            const bq = new THREE.Quaternion().setFromEuler(new THREE.Euler(bpitch, byaw, 0, 'YXZ'));
            const blen = (1.1 + hash2(i, 80 + bj, this.seed) * 0.8) * t.s;
            m.compose(
              new THREE.Vector3(t.x, h + trunkH * (0.45 + bj * 0.18), t.z),
              bq,
              vs.set(t.s, blen, t.s)
            );
            branches.setMatrixAt(branchI++, m);
          }
        }
        const hue = isBirch ? 0.2 + hash2(i, 2, this.seed) * 0.06 : 0.26 + hash2(i, 2, this.seed) * 0.09;
        const light = (isBirch ? 0.42 : 0.3) + hash2(i, 3, this.seed) * 0.13;
        const blobs = isBirch ? 2 : 3;
        for (let j = 0; j < 3; j++) {
          if (j >= blobs) {
            // keep instanced buffer packed: reuse last blob shrunk to nothing
            m.compose(new THREE.Vector3(0, -50, 0), qUp, vs.set(0.001, 0.001, 0.001));
            foliage.setMatrixAt(folI++, m);
            continue;
          }
          const fr = (isBirch ? 1.05 : 1.5 - j * 0.32) * t.s;
          const fy = h + trunkH * (0.72 + j * 0.26);
          const ox = (hash2(i, 10 + j, this.seed) - 0.5) * 0.8 * t.s;
          const oz = (hash2(i, 20 + j, this.seed) - 0.5) * 0.8 * t.s;
          m.compose(
            new THREE.Vector3(t.x + ox, fy, t.z + oz), qUp,
            vs.set(fr, fr * (0.82 + hash2(i, 30 + j, this.seed) * 0.3), fr)
          );
          foliage.setMatrixAt(folI, m);
          col.setHSL(hue, isBirch ? 0.5 : 0.45, light + j * 0.03);
          foliage.setColorAt(folI, col);
          folI++;
        }
      }

      this.trees.push({
        id: `tree_${i}`,
        x: t.x, z: t.z,
        trunkH,
        r: 0.5 * t.s * (t.type === 'birch' ? 0.7 : 1),
        perchY: h + trunkH * (isPine ? 0.55 : 0.8),
      });
    }
    oakTrunks.count = brownI;
    birchTrunks.count = birchI;
    foliage.count = folI;
    pineFol.count = pineI;
    branches.count = branchI;
    if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;
    if (pineFol.instanceColor) pineFol.instanceColor.needsUpdate = true;
    this.group.add(oakTrunks, birchTrunks, foliage, pineFol, branches);

    // ——— grass: dense wind-blown ring that follows the player ———
    // (massive-scatter look from the WebGPU world demos, scaled for tablets:
    // ~5k tufts packed into a 48u disc around the player, re-scattered
    // deterministically from a hash grid whenever the player moves)
    const tuftGeo = this.buildGrassTuftGeo();
    const grassMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 1 });
    this.windify(grassMat, 0.5, true);
    this.grassMesh = new THREE.InstancedMesh(tuftGeo, grassMat, this.GRASS_CAP);
    this.grassMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.grassMesh.frustumCulled = false;
    this.grassMesh.count = 0;
    this.group.add(this.grassMesh);

    // flowers
    const flowerN = 600;
    const fGeo = new THREE.SphereGeometry(0.14, 6, 5);
    fGeo.translate(0, 0.5, 0);
    const fMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    this.windify(fMat, 0.08);
    const flowers = new THREE.InstancedMesh(fGeo, fMat, flowerN);
    const petalCols = ['#f2a7c3', '#f5d76e', '#c39bd3', '#f1948a', '#85c1e9', '#f8f4e3'];
    let fli = 0;
    for (let i = 0; i < flowerN * 2 && fli < flowerN; i++) {
      const x = (mulRand(this.seed + 5000 + i * 3) - 0.5) * 280;
      const z = (mulRand(this.seed + 5000 + i * 3 + 1) - 0.5) * 280;
      const h = this.heightAt(x, z);
      if (h < 1.2 || h > 8) continue;
      const meadow = fbm(x * 0.02, z * 0.02, this.seed + 313, 3);
      if (meadow > 0.52) continue;
      m.compose(new THREE.Vector3(x, h, z), q.identity(), vs.setScalar(0.8 + mulRand(this.seed + i) * 0.7));
      flowers.setMatrixAt(fli, m);
      col.set(petalCols[Math.floor(mulRand(this.seed + 6000 + i) * petalCols.length)]);
      flowers.setColorAt(fli, col);
      fli++;
    }
    flowers.count = fli;
    this.group.add(flowers);

    // mushrooms
    const mushN = 70;
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
      if (forest < 0.54) continue;
      const sc = 0.6 + mulRand(this.seed + i) * 0.9;
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

    // ferns in forest shade — leafy cross of flattened cones
    const fernN = 220;
    const fernGeo = new THREE.ConeGeometry(0.5, 0.16, 4);
    fernGeo.translate(0, 0.1, 0);
    const fernMat = new THREE.MeshStandardMaterial({ roughness: 1 });
    this.windify(fernMat, 0.14);
    const ferns = new THREE.InstancedMesh(fernGeo, fernMat, fernN);
    let fi2 = 0;
    for (let i = 0; i < fernN * 3 && fi2 < fernN; i++) {
      const x = (mulRand(this.seed + 12000 + i * 3) - 0.5) * 270;
      const z = (mulRand(this.seed + 12000 + i * 3 + 1) - 0.5) * 270;
      const h = this.heightAt(x, z);
      if (h < 1.4 || h > 9) continue;
      const forest = fbm(x * 0.02, z * 0.02, this.seed + 313, 3);
      if (forest < 0.5) continue;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), mulRand(this.seed + i * 5) * Math.PI * 2);
      const sc = 0.8 + mulRand(this.seed + i * 7) * 1.1;
      m.compose(new THREE.Vector3(x, h, z), q, vs.set(sc, sc * 0.8, sc));
      ferns.setMatrixAt(fi2, m);
      col.setHSL(0.3, 0.4, 0.22 + mulRand(this.seed + 13000 + i) * 0.1);
      ferns.setColorAt(fi2, col);
      fi2++;
    }
    ferns.count = fi2;
    this.group.add(ferns);
  }

  /** re-scatter the grass disc around the player (deterministic hash grid) */
  private updateGrassRing(px: number, pz: number) {
    if (Math.hypot(px - this.grassAnchor.x, pz - this.grassAnchor.z) < 8) return;
    this.grassAnchor = { x: px, z: pz };
    const R = 54;
    const cell = 1.34;
    const cap = Math.floor(this.GRASS_CAP * this.quality);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const vs = new THREE.Vector3();
    const col = new THREE.Color();
    let gi = 0;
    const cx0 = Math.floor((px - R) / cell);
    const cx1 = Math.ceil((px + R) / cell);
    const cz0 = Math.floor((pz - R) / cell);
    const cz1 = Math.ceil((pz + R) / cell);
    for (let cx = cx0; cx <= cx1 && gi < cap; cx++) {
      for (let cz = cz0; cz <= cz1 && gi < cap; cz++) {
        const h1 = hash2(cx, cz, this.seed + 21);
        const x = cx * cell + (h1 - 0.5) * cell;
        const z = cz * cell + (hash2(cx, cz, this.seed + 22) - 0.5) * cell;
        const dd = Math.hypot(x - px, z - pz);
        if (dd > R) continue;
        const h = this.heightAt(x, z);
        if (h < 0.8 || h > 10.5) continue;
        const forest = fbm(x * 0.02, z * 0.02, this.seed + 313, 3);
        if (forest > 0.58 && h1 > 0.45) continue; // sparser under trees
        if (this.nearPad(x, z, -2) && hash2(cx, cz, this.seed + 23) > 0.35) continue; // trimmed lawns at camps
        if (Math.hypot(x - this.artCenter.x, z - this.artCenter.z) < this.ART_HALF + 0.5) continue; // no grass through the art patio
        q.setFromAxisAngle(up, h1 * Math.PI * 2);
        const fade = 1 - Math.pow(dd / R, 2.4) * 0.8; // sink into the ground toward the disc edge
        const sc = (0.95 + hash2(cx, cz, this.seed + 24) * 0.95) * Math.max(0.15, fade);
        m.compose(new THREE.Vector3(x, h - 0.03, z), q, vs.set(sc, sc * (0.9 + h1 * 0.4), sc));
        this.grassMesh.setMatrixAt(gi, m);
        const dry = fbm(x * 0.13, z * 0.13, this.seed + 811, 2) > 0.67;
        col.setHSL(
          dry ? 0.12 : 0.24 + hash2(cx, cz, this.seed + 25) * 0.07,
          dry ? 0.5 : 0.55,
          dry ? 0.27 : 0.27 + hash2(cx, cz, this.seed + 26) * 0.11
        );
        this.grassMesh.setColorAt(gi, col);
        gi++;
      }
    }
    this.grassMesh.count = gi;
    this.grassMesh.instanceMatrix.needsUpdate = true;
    if (this.grassMesh.instanceColor) this.grassMesh.instanceColor.needsUpdate = true;
  }

  /** adaptive quality: called by the game when frame rate sags */
  setQuality(q: number) {
    this.quality = q;
    this.grassAnchor = { x: 1e9, z: 1e9 }; // force a re-scatter
    if (q < 1) this.sun.shadow.mapSize.set(1024, 1024);
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
      const sy = r * (0.6 + rng() * 0.5);
      q.setFromEuler(new THREE.Euler(rng() * 0.5, rng() * Math.PI, rng() * 0.5));
      m.compose(new THREE.Vector3(x, h + r * 0.15, z), q, vs.set(r, sy, r));
      rocksMesh.setMatrixAt(ri, m);
      col.setHSL(0.1, 0.05 + rng() * 0.06, 0.42 + rng() * 0.2);
      rocksMesh.setColorAt(ri, col);
      if (r > 0.9) {
        // big rocks are jump-on-able
        const topY = h + r * 0.15 + sy * 0.72;
        this.rocks.push({ x, z, r: r * 0.9, topY });
        this.platforms.push({ x, z, r: r * 0.78, topY });
      }
      ri++;
    }
    rocksMesh.count = ri;
    this.group.add(rocksMesh);

    // pebbles — pure scenery scatter
    const pebN = 260;
    const pebbles = new THREE.InstancedMesh(rockGeo, rockMat, pebN);
    let pi = 0;
    for (let i = 0; i < pebN * 2 && pi < pebN; i++) {
      const x = (rng() - 0.5) * 300;
      const z = (rng() - 0.5) * 300;
      const h = this.heightAt(x, z);
      if (h < 0.4) continue;
      const r = 0.08 + rng() * 0.18;
      q.setFromEuler(new THREE.Euler(rng(), rng() * Math.PI, rng()));
      m.compose(new THREE.Vector3(x, h + r * 0.2, z), q, vs.set(r, r * 0.7, r));
      pebbles.setMatrixAt(pi, m);
      col.setHSL(0.09, 0.06 + rng() * 0.08, 0.4 + rng() * 0.28);
      pebbles.setColorAt(pi, col);
      pi++;
    }
    pebbles.count = pi;
    this.group.add(pebbles);
  }

  private buildLogsAndStumps(rng: () => number) {
    const logGeo = new THREE.CylinderGeometry(0.32, 0.36, 2.4, 9);
    const logMat = new THREE.MeshStandardMaterial({ roughness: 1 });
    const logs = new THREE.InstancedMesh(logGeo, logMat, 16);
    logs.castShadow = true;
    const stumpGeo = new THREE.CylinderGeometry(0.42, 0.5, 0.55, 9);
    const stumps = new THREE.InstancedMesh(stumpGeo, logMat, 16);
    stumps.castShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const vs = new THREE.Vector3(1, 1, 1);
    const col = new THREE.Color();
    let li = 0, si = 0;
    for (let i = 0; i < 60 && (li < 16 || si < 16); i++) {
      const x = (rng() - 0.5) * 280;
      const z = (rng() - 0.5) * 280;
      const h = this.heightAt(x, z);
      if (h < 1.4 || h > 9.5 || this.nearPad(x, z, 2)) continue;
      const forest = fbm(x * 0.02, z * 0.02, this.seed + 313, 3);
      if (forest < 0.45) continue;
      col.setHSL(0.08, 0.25 + rng() * 0.1, 0.24 + rng() * 0.12);
      if (rng() > 0.5 && li < 16) {
        q.setFromEuler(new THREE.Euler(Math.PI / 2 + (rng() - 0.5) * 0.15, rng() * Math.PI, 0));
        m.compose(new THREE.Vector3(x, h + 0.3, z), q, vs);
        logs.setMatrixAt(li, m);
        logs.setColorAt(li, col);
        this.rocks.push({ x, z, r: 0.9, topY: h + 0.62 });
        this.platforms.push({ x, z, r: 1.1, topY: h + 0.62 });
        li++;
      } else if (si < 16) {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI);
        m.compose(new THREE.Vector3(x, h + 0.26, z), q, vs);
        stumps.setMatrixAt(si, m);
        stumps.setColorAt(si, col);
        this.rocks.push({ x, z, r: 0.6, topY: h + 0.54 });
        this.platforms.push({ x, z, r: 0.55, topY: h + 0.54 });
        si++;
      }
    }
    logs.count = li;
    stumps.count = si;
    this.group.add(logs, stumps);
  }

  private buildLakeLife(rng: () => number) {
    // cattails around the lake rim
    const stemGeo = new THREE.CylinderGeometry(0.025, 0.035, 1.5, 5);
    stemGeo.translate(0, 0.75, 0);
    const stemMat = new THREE.MeshStandardMaterial({ color: '#7a8a4f', roughness: 1 });
    this.windify(stemMat, 0.22);
    const headGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.34, 6);
    headGeo.translate(0, 1.35, 0);
    const headMat = new THREE.MeshStandardMaterial({ color: '#6e4a2a', roughness: 1 });
    this.windify(headMat, 0.22);
    const N = 60;
    const cstems = new THREE.InstancedMesh(stemGeo, stemMat, N);
    const cheads = new THREE.InstancedMesh(headGeo, headMat, N);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const vs = new THREE.Vector3();
    let ci = 0;
    for (let i = 0; i < 240 && ci < N; i++) {
      const a = rng() * Math.PI * 2;
      const r = 24 + rng() * 18;
      const x = this.lakeC.x + Math.cos(a) * r;
      const z = this.lakeC.z + Math.sin(a) * r;
      const h = this.heightAt(x, z);
      if (h < WATER_LEVEL - 0.35 || h > WATER_LEVEL + 0.7) continue;
      q.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.14, rng() * Math.PI, (rng() - 0.5) * 0.14));
      m.compose(new THREE.Vector3(x, h, z), q, vs.setScalar(0.8 + rng() * 0.5));
      cstems.setMatrixAt(ci, m);
      cheads.setMatrixAt(ci, m);
      ci++;
    }
    cstems.count = ci;
    cheads.count = ci;
    this.group.add(cstems, cheads);

    // lily pads (a few with flowers) floating on the lake
    const padGeo = new THREE.CylinderGeometry(1, 1, 0.04, 14, 1, false, 0.4, Math.PI * 2 - 0.5);
    const padMat = new THREE.MeshStandardMaterial({ color: '#4d7c3a', roughness: 0.7 });
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2;
      const r = rng() * 20;
      const x = this.lakeC.x + Math.cos(a) * r;
      const z = this.lakeC.z + Math.sin(a) * r;
      if (this.heightAt(x, z) > WATER_LEVEL - 0.8) continue;
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.scale.setScalar(0.45 + rng() * 0.4);
      pad.position.set(x, WATER_LEVEL + 0.06, z);
      pad.rotation.y = rng() * Math.PI * 2;
      this.group.add(pad);
      if (i % 4 === 0) {
        const flower = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 8, 6),
          new THREE.MeshStandardMaterial({ color: '#f2a7c3', roughness: 0.8 })
        );
        flower.position.set(x, WATER_LEVEL + 0.18, z);
        this.group.add(flower);
      }
    }
  }

  // ——— falling leaves ———
  private buildLeaves(rng: () => number): THREE.InstancedMesh {
    const N = 56;
    const geoL = new THREE.PlaneGeometry(0.13, 0.17);
    const matL = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    const mesh = new THREE.InstancedMesh(geoL, matL, N);
    mesh.frustumCulled = false;
    const cols = ['#8aa84f', '#a8b060', '#c9973a', '#c76b3a', '#7a9a45'];
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      this.leafState.push({
        x: 0, y: -50, z: 0,
        phase: rng() * 10,
        spinX: 1 + rng() * 2.5,
        spinY: 1 + rng() * 2,
        groundT: rng() * 6, // stagger initial respawns
      });
      col.set(cols[irange(rng, 0, cols.length - 1)]);
      mesh.setColorAt(i, col);
    }
    return mesh;
  }

  private respawnLeaf(l: Leaf, px: number, pz: number) {
    // drop from a tree canopy near the player
    let best: TreeInfo | null = null;
    for (let t = 0; t < 12; t++) {
      const cand = this.trees[(Math.random() * this.trees.length) | 0];
      if (!cand) break;
      if (Math.hypot(cand.x - px, cand.z - pz) < 55) { best = cand; break; }
    }
    if (!best) { l.y = -50; l.groundT = 2; return; }
    l.x = best.x + (Math.random() - 0.5) * 3;
    l.z = best.z + (Math.random() - 0.5) * 3;
    l.y = this.heightAt(best.x, best.z) + best.trunkH * (0.8 + Math.random() * 0.4);
    l.groundT = 0;
  }

  private updateLeaves(dt: number, time: number, px: number, pz: number) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const vs = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < this.leafState.length; i++) {
      const l = this.leafState[i];
      if (l.y <= -40) {
        l.groundT -= dt;
        if (l.groundT <= 0) this.respawnLeaf(l, px, pz);
      } else {
        const ground = this.heightAt(l.x, l.z);
        if (l.y <= ground + 0.06) {
          // rest on the ground briefly, then respawn
          l.groundT += dt;
          if (l.groundT > 4) { l.y = -50; l.groundT = 1 + Math.random() * 4; }
        } else {
          l.y -= (0.3 + Math.sin(time * 1.3 + l.phase) * 0.1) * dt;
          l.x += Math.sin(time * 1.9 + l.phase) * 0.5 * dt;
          l.z += Math.cos(time * 1.6 + l.phase * 1.3) * 0.4 * dt;
        }
      }
      e.set(time * l.spinX + l.phase, time * l.spinY, l.phase);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(l.x, l.y, l.z), q, vs);
      this.leafMesh.setMatrixAt(i, m);
    }
    this.leafMesh.instanceMatrix.needsUpdate = true;
  }

  // ——— fireflies ———
  private buildFireflies(rng: () => number): { points: THREE.Points; base: Float32Array } {
    const N = 46;
    const base = new Float32Array(N * 3);
    const posArr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      let x = 0, z = 0;
      for (let t = 0; t < 10; t++) {
        x = (rng() - 0.5) * 240;
        z = (rng() - 0.5) * 240;
        if (this.heightAt(x, z) > 1.2) break;
      }
      base[i * 3] = x;
      base[i * 3 + 1] = this.heightAt(x, z) + 0.7 + rng() * 1.4;
      base[i * 3 + 2] = z;
    }
    posArr.set(base);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const mat = new THREE.PointsMaterial({
      color: '#ffe27a', size: 0.16, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    return { points: new THREE.Points(g, mat), base };
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

  spawnYarn(wave: number, collectedIds: string[], goldenDone: string[]) {
    for (const y of this.yarn) this.group.remove(y.mesh);
    this.yarn = [];
    const rng = mulberry32(this.seed + 31337 + wave * 101);
    const collected = new Set(collectedIds);
    const gDone = new Set(goldenDone);

    let mkCount = 0;
    const mk = (id: string, x: number, z: number, y: number, golden: boolean, spot: YarnBall['spot']) => {
      if (collected.has(id) || (golden && gDone.has(id))) return;
      const surprise = !golden && ++mkCount % 6 === 0; // pink surprise eggs
      const grp = new THREE.Group();
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(golden ? 0.42 : surprise ? 0.4 : 0.34, 14, 10),
        new THREE.MeshStandardMaterial({
          map: golden ? this.yarnTexGold : surprise ? this.yarnTexSurprise : this.yarnTexNormal,
          roughness: 0.7,
          emissive: golden ? '#8a6a10' : surprise ? '#6e2a4a' : '#000000',
          emissiveIntensity: golden ? 0.5 : surprise ? 0.3 : 0,
        })
      );
      ball.castShadow = true;
      grp.add(ball);
      if (golden || surprise) {
        const glow = new THREE.Mesh(
          new THREE.SphereGeometry(0.62, 12, 8),
          new THREE.MeshBasicMaterial({ color: golden ? '#ffe27a' : '#ffc8de', transparent: true, opacity: 0.16 })
        );
        grp.add(glow);
      }
      grp.position.set(x, y, z);
      this.group.add(grp);
      this.yarn.push({ id, x, z, y, golden, surprise, spot, mesh: grp, collected: false });
    };

    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + wave;
      const x = this.playerCamp.x + Math.cos(a) * (9 + i * 3);
      const z = this.playerCamp.z + Math.sin(a) * (9 + i * 3);
      mk(`y_${wave}_camp${i}`, x, z, this.heightAt(x, z) + 0.35, false, 'ground');
    }
    let made = 0;
    for (let i = 0; i < 200 && made < 20; i++) {
      const x = (rng() - 0.5) * 290;
      const z = (rng() - 0.5) * 290;
      const h = this.heightAt(x, z);
      if (h < 1 || h > 10) continue;
      mk(`y_${wave}_g${i}`, x, z, h + 0.35, false, 'ground');
      made++;
    }
    const treePick = [...this.trees].sort((a, b) => hash2(a.x | 0, a.z | 0, wave) - hash2(b.x | 0, b.z | 0, wave)).slice(0, 6);
    treePick.forEach((t, i) => mk(`y_${wave}_t${i}`, t.x, t.z, t.perchY + 0.4, false, 'tree'));
    this.islets.forEach((it, i) => {
      const h = this.heightAt(it.x, it.z);
      mk(`y_${wave}_i${i}a`, it.x + 3, it.z, h + 0.35, false, 'islet');
      mk(`yg_${wave}_i${i}`, it.x, it.z, this.heightAt(it.x, it.z) + 0.45, true, 'islet');
    });
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
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.5, 2.4, 8),
        new THREE.MeshStandardMaterial({ color: '#6e5136', roughness: 1 })
      );
      log.rotation.z = Math.PI / 2 - 0.3;
      log.position.set(-3.2, 0.5, 1.6);
      log.castShadow = true;
      g.add(log);
      this.group.add(g);
      this.rocks.push({ x: camp.x, z: camp.z, r: 2.6, topY: h + 2.05 });
      this.platforms.push({ x: camp.x, z: camp.z, r: 1.9, topY: h + 2.05 });
    }

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

  // ——— buildings (unchanged from v1) ———
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
    // standable structures: cats can hop onto dens, towers, and the statue
    if (b.type === 'den') {
      this.rocks.push({ x: b.x, z: b.z, r: 1.5, topY: h + 1.55 });
      this.platforms.push({ x: b.x, z: b.z, r: 1.35, topY: h + 1.55 });
    } else if (b.type === 'tower') {
      this.rocks.push({ x: b.x, z: b.z, r: 1.3, topY: h + 3.48 });
      this.platforms.push({ x: b.x, z: b.z, r: 1.5, topY: h + 1.1 });
      this.platforms.push({ x: b.x, z: b.z, r: 1.2, topY: h + 2.2 });
      this.platforms.push({ x: b.x, z: b.z, r: 1.05, topY: h + 3.48 });
    } else if (b.type === 'statue') {
      this.rocks.push({ x: b.x, z: b.z, r: 1.1, topY: h + 2.3 });
      this.platforms.push({ x: b.x, z: b.z, r: 0.95, topY: h + 2.3 });
    } else if (b.type !== 'flowers' && b.type !== 'pond') {
      this.rocks.push({ x: b.x, z: b.z, r: 1.2 });
    }
  }

  removeBuildingMesh(id: string) {
    const g = this.buildingMeshes.get(id);
    if (g) {
      this.group.remove(g);
      this.buildingMeshes.delete(id);
    }
  }

  // ——— agility courses ———

  private flagPole(x: number, z: number, color: string, y?: number) {
    const g = new THREE.Group();
    const yy = y ?? this.heightAt(x, z);
    const wood = new THREE.MeshStandardMaterial({ color: '#b08d57', roughness: 1 });
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3, 6), wood);
    p.position.set(x, yy + 1.5, z);
    p.castShadow = true;
    const f = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.7),
      new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide })
    );
    f.position.set(x + 0.55, yy + 2.6, z);
    g.add(p, f);
    this.group.add(g);
  }

  private buildAgilityCourse() {
    const c = this.agilityCenter;
    const dir = Math.atan2(-c.z, -c.x);
    const dx = Math.cos(dir);
    const dz = Math.sin(dir);
    const px = -dz;
    const pz = dx;

    const at = (along: number, side: number) => ({
      x: c.x + dx * along + px * side,
      z: c.z + dz * along + pz * side,
    });

    const wood = new THREE.MeshStandardMaterial({ color: '#b08d57', roughness: 1 });
    const red = new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.8 });
    const blue = new THREE.MeshStandardMaterial({ color: '#2980b9', roughness: 0.8 });

    const flagPole = (x: number, z: number, mat: THREE.MeshStandardMaterial) =>
      this.flagPole(x, z, '#' + mat.color.getHexString());

    const start = at(-26, 0);
    flagPole(start.x - px * 1.6, start.z - pz * 1.6, blue);
    flagPole(start.x + px * 1.6, start.z + pz * 1.6, blue);
    this.agilityGates.push({ x: start.x, z: start.z, kind: 'start' });

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

    const rp = at(23, 0);
    const ry = this.heightAt(rp.x, rp.z);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 2.2), wood);
    ramp.rotation.y = -dir;
    ramp.rotation.z = 0.42;
    ramp.position.set(rp.x, ry + 0.75, rp.z);
    ramp.castShadow = true;
    this.group.add(ramp);
    this.agilityGates.push({ x: rp.x, z: rp.z, kind: 'ramp' });

    const fin = at(31, 0);
    flagPole(fin.x - px * 1.6, fin.z - pz * 1.6, red);
    flagPole(fin.x + px * 1.6, fin.z + pz * 1.6, red);
    this.agilityGates.push({ x: fin.x, z: fin.z, kind: 'finish' });

    this.courses.push({
      id: 'paws', name: 'Trial of Paws', icon: '🚩',
      center: { ...this.agilityCenter }, gates: this.agilityGates, basePar: 48,
    });
  }

  /** Cliff Scramble: a spiral of gates + stone steps up the big hill. Harder! */
  private buildCliffCourse() {
    const c = this.hillC;
    const baseA = Math.atan2(-c.z, -c.x); // start on the island-centre side
    const gates: AgilityGate[] = [];
    const stone = new THREE.MeshStandardMaterial({ color: '#9a9a90', roughness: 1 });
    const N = 7;
    for (let i = 0; i < N; i++) {
      const a = baseA + i * 0.82;
      const d = 44 - i * 6.2; // spirals in toward the summit
      const x = c.x + Math.cos(a) * d;
      const z = c.z + Math.sin(a) * d;
      gates.push({ x, z, kind: i === 0 ? 'start' : i === N - 1 ? 'finish' : 'weave' });
      if (i > 0 && i < N - 1) {
        // a stone step to bound off beside each mid gate
        const sx = x + Math.cos(a + 1.2) * 2.2;
        const sz = z + Math.sin(a + 1.2) * 2.2;
        const h = this.heightAt(sx, sz);
        const step = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.4, 1.1, 9), stone);
        step.position.set(sx, h + 0.55, sz);
        step.castShadow = true;
        this.group.add(step);
        this.rocks.push({ x: sx, z: sz, r: 1.1, topY: h + 1.1 });
        this.platforms.push({ x: sx, z: sz, r: 1.25, topY: h + 1.1 });
      }
    }
    const s = gates[0], f = gates[gates.length - 1];
    this.flagPole(s.x - 1.4, s.z, '#8e44ad');
    this.flagPole(s.x + 1.4, s.z, '#8e44ad');
    this.flagPole(f.x - 1.2, f.z, '#e8c34a');
    this.flagPole(f.x + 1.2, f.z, '#e8c34a');
    this.courses.push({
      id: 'cliff', name: 'Cliff Scramble', icon: '⛰️',
      center: { x: s.x, z: s.z }, gates, basePar: 42,
    });
  }

  /** Stepping Stones: hop the pillar path across the lake — don't get soggy! */
  private buildLakeCourse() {
    const c = this.lakeC;
    const toCentre = Math.atan2(-c.z, -c.x);
    const ux = Math.cos(toCentre), uz = Math.sin(toCentre);
    const gates: AgilityGate[] = [];
    const stone = new THREE.MeshStandardMaterial({ color: '#8d938a', roughness: 1 });

    // find each shore along the crossing line
    const shoreAt = (sign: number) => {
      for (let d = 6; d < 60; d += 1.5) {
        const x = c.x + ux * d * sign, z = c.z + uz * d * sign;
        if (this.heightAt(x, z) > WATER_LEVEL + 0.6) return { x, z };
      }
      return { x: c.x + ux * 40 * sign, z: c.z + uz * 40 * sign };
    };
    const start = shoreAt(1);   // island-centre side shore
    const finish = shoreAt(-1); // far shore
    gates.push({ x: start.x, z: start.z, kind: 'start' });

    // pillar stepping stones spanning the water, jitter keeps jumps interesting
    const NS = 6;
    for (let i = 1; i <= NS; i++) {
      const t = i / (NS + 1);
      const jx = Math.sin(i * 2.4) * 2.2;
      const x = start.x + (finish.x - start.x) * t - uz * jx;
      const z = start.z + (finish.z - start.z) * t + ux * jx;
      const bed = Math.min(this.heightAt(x, z), WATER_LEVEL - 0.4);
      const topY = WATER_LEVEL + 0.55;
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(1.05, 1.35, topY - bed + 0.6, 10),
        stone
      );
      pillar.position.set(x, bed + (topY - bed + 0.6) / 2 - 0.6, z);
      pillar.castShadow = true;
      this.group.add(pillar);
      this.rocks.push({ x, z, r: 1.0, topY });
      this.platforms.push({ x, z, r: 1.2, topY });
      gates.push({ x, z, kind: 'weave' });
    }
    gates.push({ x: finish.x, z: finish.z, kind: 'finish' });
    this.flagPole(start.x - 1.3, start.z, '#2980b9');
    this.flagPole(start.x + 1.3, start.z, '#2980b9');
    this.flagPole(finish.x, finish.z, '#e8c34a');
    this.courses.push({
      id: 'stones', name: 'Stepping Stones', icon: '💧',
      center: { x: start.x, z: start.z }, gates, basePar: 40,
    });
  }

  /** Boulder Crags: a free-play parkour cluster of flat-top pillars to bound up. */
  private buildCrags() {
    const c = this.agilityCenter;
    const dir = Math.atan2(-c.z, -c.x);
    // opposite side of the pad from the Cat Tower
    const cx = c.x + Math.cos(dir - Math.PI / 2) * 17;
    const cz = c.z + Math.sin(dir - Math.PI / 2) * 17;
    const stone = new THREE.MeshStandardMaterial({ color: '#98948a', roughness: 1, flatShading: true });
    const N = 12;
    for (let i = 0; i < N; i++) {
      const a = i * 2.39996; // golden-angle scatter
      const d = 1.8 + Math.sqrt(i) * 2.35;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      const h = this.heightAt(x, z);
      // taller toward the middle — a little mountain to conquer
      const height = 0.9 + (1 - d / 11) * 4.6 + ((i * 37) % 10) / 12;
      const r = 1.0 + ((i * 13) % 10) / 14;
      const crag = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.35, height, 7), stone);
      crag.position.set(x, h + height / 2, z);
      crag.rotation.y = a;
      crag.castShadow = true;
      this.group.add(crag);
      this.rocks.push({ x, z, r: r * 0.95, topY: h + height });
      this.platforms.push({ x, z, r: r * 1.05, topY: h + height });
    }
    // a little flag on the tallest crag in the middle
    const th = this.heightAt(cx, cz);
    this.flagPole(cx + 0.5, cz + 0.5, '#67b25f', th + 5.4);
  }

  // ——— Art Meadow: paint buckets + a big paintable stone patio ———

  private buildArtMeadow() {
    const c = this.artCenter;
    const half = this.ART_HALF;

    // paintable patio: a canvas texture on a terrain-conforming plane
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 768;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ece5d2';
    ctx.fillRect(0, 0, 768, 768);
    // stone speckle so the blank patio doesn't look sterile
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(120,110,90,0.06)' : 'rgba(255,255,245,0.08)';
      ctx.fillRect(Math.random() * 768, Math.random() * 768, 1.5 + Math.random() * 2, 1.5 + Math.random() * 2);
    }
    // faded border ring so kids can see the edge of the art zone
    ctx.strokeStyle = 'rgba(140,120,90,0.35)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(384, 384, 374, 0, Math.PI * 2);
    ctx.stroke();
    this.artCtx = ctx;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.artTex = tex;

    // the terrain under the meadow is plateau-flat, so a simple disc sits clean
    const baseY = this.heightAt(c.x, c.z);
    const geoA = new THREE.CircleGeometry(half, 48);
    geoA.rotateX(-Math.PI / 2);
    const patio = new THREE.Mesh(geoA, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.96 }));
    patio.position.set(c.x, baseY + 0.05, c.z);
    patio.receiveShadow = true;
    this.group.add(patio);

    // paint buckets in a rainbow arc + one water bucket to wash paws
    const colors = ['#e0505a', '#f0913c', '#f5c542', '#67b25f', '#3f8fd4', '#9b6dd4', '#f08fbf'];
    const tin = new THREE.MeshStandardMaterial({ color: '#d4d0c6', roughness: 0.6, metalness: 0.12 });
    const mkBucket = (x: number, z: number, color: string | null) => {
      const y = this.heightAt(x, z) + 0.05;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 0.55, 12, 1, true), tin);
      body.position.set(x, y + 0.28, z);
      body.castShadow = true;
      this.group.add(body);
      const fill = new THREE.Mesh(
        new THREE.CircleGeometry(0.46, 12),
        new THREE.MeshStandardMaterial({ color: color ?? '#7ec8e0', roughness: color ? 0.35 : 0.15 })
      );
      fill.rotation.x = -Math.PI / 2;
      fill.position.set(x, y + 0.5, z);
      this.group.add(fill);
      // spilled splash on the patio so buckets read as "step in me!"
      if (color) this.splashArt(x, z, color);
      this.paintBuckets.push({ x, z, color });
    };
    colors.forEach((col, i) => {
      const a = -0.9 + (i / (colors.length - 1)) * 1.8; // arc facing the centre
      mkBucket(c.x + Math.cos(a) * 9, c.z + Math.sin(a) * 9, col);
    });
    mkBucket(c.x + Math.cos(Math.PI) * 9, c.z + Math.sin(Math.PI) * 9, null); // water

    // an easel-style sign at the entrance
    this.flagPole(c.x, c.z - 12, '#f08fbf');
  }

  /** true when a paw can leave a mark here (on the patio disc) */
  isOnArt(x: number, z: number): boolean {
    return Math.hypot(x - this.artCenter.x, z - this.artCenter.z) < this.ART_HALF - 0.4;
  }

  private artPx(x: number, z: number): { px: number; pz: number; scale: number } {
    const scale = 768 / (this.ART_HALF * 2);
    return {
      px: (x - this.artCenter.x + this.ART_HALF) * scale,
      pz: (z - this.artCenter.z + this.ART_HALF) * scale,
      scale,
    };
  }

  /** stamp one painty paw print onto the patio, rotated to the cat's heading */
  stampPaw(x: number, z: number, heading: number, color: string, size = 1) {
    const ctx = this.artCtx;
    if (!ctx || !this.isOnArt(x, z)) return;
    const { px, pz, scale } = this.artPx(x, z);
    ctx.save();
    ctx.translate(px, pz);
    // canvas +y is world +z; heading 0 faces +z, and the paw art points up (-y)
    ctx.rotate(Math.PI - heading);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    const u = scale * 0.13 * size; // paw pad radius in px
    ctx.beginPath();
    ctx.ellipse(0, 0, u * 1.15, u, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      const ta = (-0.55 + i * 0.37);
      ctx.beginPath();
      ctx.ellipse(Math.sin(ta) * u * 1.9, -Math.cos(ta) * u * 1.75, u * 0.42, u * 0.52, ta, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    if (this.artTex) this.artTex.needsUpdate = true;
  }

  /** a blobby paint splash (bucket spills, big pounce splats) */
  splashArt(x: number, z: number, color: string) {
    const ctx = this.artCtx;
    if (!ctx || !this.isOnArt(x, z)) return;
    const { px, pz, scale } = this.artPx(x, z);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.8;
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * scale * 0.55;
      const r = scale * (0.09 + Math.random() * 0.18);
      ctx.beginPath();
      ctx.ellipse(px + Math.cos(a) * d, pz + Math.sin(a) * d, r, r * (0.6 + Math.random() * 0.5), a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (this.artTex) this.artTex.needsUpdate = true;
  }

  // ——— Cat Tower Trial: a spiral of pillars to jump up, fall and start over ———
  private buildTowerTrial() {
    const c = this.agilityCenter;
    const dir = Math.atan2(-c.z, -c.x);
    // off to the side of the flat agility pad
    const cx = c.x + Math.cos(dir + Math.PI / 2) * 16;
    const cz = c.z + Math.sin(dir + Math.PI / 2) * 16;
    const baseH = this.heightAt(cx, cz);
    const pastel = ['#e8a9c0', '#9ec97f', '#85c1e9', '#f5d76e'];
    const N = 8;
    for (let i = 0; i < N; i++) {
      const a = dir + i * 0.78;
      const px = cx + Math.cos(a) * 4.1;
      const pz = cz + Math.sin(a) * 4.1;
      const topY = baseH + 1.25 + i * 0.85;
      const groundY = this.heightAt(px, pz);
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 1.15, topY - groundY, 10),
        new THREE.MeshStandardMaterial({ color: '#b08d57', roughness: 1 })
      );
      pillar.position.set(px, groundY + (topY - groundY) / 2, pz);
      pillar.castShadow = true;
      this.group.add(pillar);
      const plat = new THREE.Mesh(
        new THREE.CylinderGeometry(1.3, 1.3, 0.18, 12),
        new THREE.MeshStandardMaterial({ color: i === N - 1 ? '#e8c34a' : pastel[i % pastel.length], roughness: 0.85 })
      );
      plat.position.set(px, topY - 0.09, pz);
      plat.castShadow = true;
      this.group.add(plat);
      this.rocks.push({ x: px, z: pz, r: 1.1, topY });
      this.platforms.push({ x: px, z: pz, r: 1.28, topY });
      if (i === N - 1) {
        this.towerTop = { x: px, z: pz, r: 1.28, topY };
        // a little flag marks the summit prize
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.06, 1.6, 6),
          new THREE.MeshStandardMaterial({ color: '#6e5136', roughness: 1 })
        );
        pole.position.set(px + 0.9, topY + 0.8, pz);
        this.group.add(pole);
        const flag = new THREE.Mesh(
          new THREE.PlaneGeometry(0.8, 0.5),
          new THREE.MeshStandardMaterial({ color: '#e8c34a', side: THREE.DoubleSide, roughness: 0.8 })
        );
        flag.position.set(px + 1.3, topY + 1.3, pz);
        this.group.add(flag);
      }
    }
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
    spawn('butterfly', 18);
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
          c.y += dt * 4;
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
        c.heading += (hash2(Math.floor(time * 0.5), this.critters.indexOf(c), this.seed) - 0.5) * dt * 3;
        const sp = c.kind === 'mouse' && Math.sin(time * 2 + c.phase) > 0.4 ? c.speed : c.kind === 'mouse' ? 0 : c.speed * 0.5;
        c.x += Math.cos(c.heading) * sp * dt;
        c.z += Math.sin(c.heading) * sp * dt;
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
    setTimeout(() => {
      c.state = 'gone';
      c.stateT = 10;
    }, 30000);
  }

  // ——— day/night ———
  setTimeOfDay(t: number, playerX: number, playerZ: number) {
    const sunAngle = (t - 0.25) * Math.PI * 2;
    const sy = Math.sin(sunAngle);
    const sx = Math.cos(sunAngle) * 0.6;
    const day = clamp01(sy * 3 + 0.1);
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
    (this.skyMat.uniforms.uSunDir.value as THREE.Vector3).set(sx * 120, sy * 140 + 8, 60).normalize();
    (this.waterMat.uniforms.uSunDir.value as THREE.Vector3).set(sx * 120, sy * 140 + 8, 60).normalize();
    this.waterMat.uniforms.uDay.value = 0.15 + day * 0.85;
    (this.stars.material as THREE.PointsMaterial).opacity = clamp01(1 - day * 2) * 0.9;
    (this.fireflies.material as THREE.PointsMaterial).opacity = clamp01(1 - day * 1.6) * 0.85;

    for (const l of this.campLights) l.intensity = (1 - day) * 2.2;
  }

  update(dt: number, time: number, playerX: number, playerZ: number) {
    this.waterMat.uniforms.uTime.value = time;
    for (const s of this.windShaders) s.uniforms.uTime.value = time;
    this.updateGrassRing(playerX, playerZ);
    this.skyMesh.position.set(playerX, 0, playerZ);
    this.stars.position.set(playerX, 0, playerZ);

    // clouds drift with the wind
    for (const cloud of this.clouds.children) {
      cloud.position.x += (cloud.userData.speed as number) * dt;
      if (cloud.position.x > 420) cloud.position.x = -420;
    }

    this.updateLeaves(dt, time, playerX, playerZ);

    // firefly drift
    const fp = this.fireflies.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < fp.count; i++) {
      fp.setXYZ(
        i,
        this.fireflyBase[i * 3] + Math.sin(time * 0.7 + i * 2.3) * 1.2,
        this.fireflyBase[i * 3 + 1] + Math.sin(time * 1.1 + i) * 0.5,
        this.fireflyBase[i * 3 + 2] + Math.cos(time * 0.5 + i * 1.7) * 1.2
      );
    }
    fp.needsUpdate = true;

    for (const y of this.yarn) {
      if (y.collected) continue;
      y.mesh.rotation.y = time * 1.2;
      y.mesh.position.y = y.y + Math.sin(time * 2 + y.x) * 0.08;
    }
  }

  /** ground height including anything you can stand on (rocks, logs, towers…) */
  groundHeight(x: number, z: number, py: number): number {
    let g = this.heightAt(x, z);
    for (const p of this.platforms) {
      if (p.topY > g && py >= p.topY - 0.5 && Math.hypot(x - p.x, z - p.z) < p.r) g = p.topY;
    }
    return g;
  }

  collide(x: number, z: number, radius: number, py = 0): { x: number; z: number } {
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
      // things with a standable top don't block you once you're above them
      if (r.topY !== undefined && py >= r.topY - 0.5) continue;
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

  // ——— minimap: the island painted from its own heightfield ———
  private minimapCache: string | null = null;
  /** world half-range the map spans (covers islets) */
  readonly MAP_RANGE = 330;

  buildMinimap(): string {
    if (this.minimapCache) return this.minimapCache;
    const S = 220;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    const R = this.MAP_RANGE;
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const x = (px / (S - 1) - 0.5) * 2 * R;
        const z = (py / (S - 1) - 0.5) * 2 * R;
        const h = this.heightAt(x, z);
        let r = 0, g = 0, b = 0;
        if (h < WATER_LEVEL - 2.5) { r = 42; g = 110; b = 140; }        // deep sea
        else if (h < WATER_LEVEL - 0.3) { r = 90; g = 175; b = 185; }   // shallows
        else if (h < WATER_LEVEL + 1.1) { r = 227; g = 210; b = 154; }  // sand
        else if (h > 11.5) { r = 141; g = 141; b = 132; }               // rock
        else {
          const forest = fbm(x * 0.02, z * 0.02, this.seed + 313, 3);
          if (forest > 0.56) { r = 77; g = 124; b = 58; }               // forest
          else { r = 121; g = 168; b = 84; }                            // meadow
          const n = fbm(x * 0.05, z * 0.05, this.seed + 77, 3);
          const m = 0.86 + n * 0.24;
          r *= m; g *= m; b *= m;
        }
        const i = (py * S + px) * 4;
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.minimapCache = c.toDataURL();
    return this.minimapCache;
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

function mulRand(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
