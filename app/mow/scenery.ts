// Clean Cut — everything around the grass: houses, trees, fences, beds, paving, props.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Builder, tintGeo } from './build';
import { metricUV, type TexLib } from './textures';
import { makeRng, type Rng } from './rng';
import { houseFootprints } from './shapes';
import type { BedDef, FenceDef, HardDef, HouseDef, LineDef, Poly, PropDef, TreeDef } from './types';
import type { Materials } from './vehicle';

const rbox = (w: number, h: number, d: number, r = 0.03, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.max(0.001, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)));
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

export interface SceneMats {
  wind: { value: number };
  bark: THREE.MeshStandardMaterial;
  birch: THREE.MeshStandardMaterial;
  trim: Map<string, THREE.MeshStandardMaterial>;
  paint: (hex: string, rough?: number) => THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  curb: THREE.MeshStandardMaterial;
  pavers: THREE.MeshStandardMaterial;
  asphalt: THREE.MeshStandardMaterial;
  brick: THREE.MeshStandardMaterial;
  brickPaver: THREE.MeshStandardMaterial;
  plaster: (hex: string) => THREE.MeshStandardMaterial;
  siding: (hex: string) => THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  planks: THREE.MeshStandardMaterial;
  mulch: THREE.MeshStandardMaterial;
  soil: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  metal: THREE.MeshStandardMaterial;
  blackMetal: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  water: THREE.MeshPhysicalMaterial;
  leaf: (kind: 'broad' | 'small' | 'needle' | 'shrub', hue: string[]) => { mat: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial };
  lineMat: (hex: string) => THREE.MeshStandardMaterial;
  veh: Materials;
}

export function sceneMaterials(lib: TexLib, veh: Materials, time: { value: number }): SceneMats {
  const cache = new Map<string, THREE.MeshStandardMaterial>();
  const memo = <T extends THREE.Material>(key: string, make: () => T): T => {
    const hit = cache.get(key);
    if (hit) return hit as unknown as T;
    const m = make();
    cache.set(key, m as unknown as THREE.MeshStandardMaterial);
    return m;
  };
  const wind = { value: 1 };
  const leafCache = new Map<string, { mat: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial }>();
  const sidingTex = lib.siding();
  const swaying = (m: THREE.Material, amp: number) => {
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.uniforms.uWind = wind;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  {
    vec4 wp0 = modelMatrix * vec4(transformed, 1.0);
    float h = max(0.0, transformed.y - 1.0);
    float ph = wp0.x * 0.21 + wp0.z * 0.17;
    float sway = sin(uTime * 1.1 + ph) * 0.6 + sin(uTime * 2.3 + ph * 2.7) * 0.3;
    float flutter = sin(uTime * 7.0 + wp0.x * 3.1 + wp0.y * 2.3 + wp0.z * 2.9) * 0.025;
    transformed.x += (sway * h * ${amp.toFixed(4)} + flutter) * uWind;
    transformed.z += (sway * h * ${(amp * 0.6).toFixed(4)} + flutter * 0.7) * uWind;
  }`);
    };
  };
  const mats: SceneMats = {
    wind,
    bark: lib.material('bark_brown_02', { scale: 1.2, tint: '#d8cfc4' }),
    birch: lib.material('bark_brown_02', { scale: 1.2, tint: '#fbf6ec', normal: 0.6 }),
    trim: new Map(),
    paint: (hex, rough = 0.55) => memo(`paint-${hex}-${rough}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: rough })),
    concrete: lib.material('concrete_floor_02', { scale: 3, tint: '#e6e2da' }),
    curb: lib.material('concrete_floor_02', { scale: 1.2, tint: '#d9d6cf' }),
    pavers: lib.material('concrete_pavement_02', { scale: 1.6, tint: '#e9e6df' }),
    asphalt: lib.material('asphalt_02', { scale: 5, tint: '#8a8a8a' }),
    brick: lib.material('red_brick_03', { scale: 1.6 }),
    brickPaver: lib.material('red_brick_03', { scale: 1.1, tint: '#c9b8a8' }),
    plaster: (hex) => memo(`plaster-${hex}`, () => lib.material('beige_wall_001', { scale: 3, tint: hex, normal: 0.6 })),
    siding: (hex) =>
      memo(`siding-${hex}`, () => {
        const map = sidingTex.map.clone();
        map.repeat.set(1 / 2, 1 / 1.6);
        const n = sidingTex.normal.clone();
        n.repeat.set(1 / 2, 1 / 1.6);
        map.needsUpdate = true;
        n.needsUpdate = true;
        return new THREE.MeshStandardMaterial({ map, normalMap: n, color: hex, roughness: 0.7 });
      }),
    roof: lib.material('grey_roof_01', { scale: 2.5, tint: '#c9c4bd' }),
    planks: lib.material('weathered_brown_planks', { scale: 1.6, tint: '#e2d3c0' }),
    mulch: lib.material('wood_chips', { scale: 1.2, tint: '#a8785a' }),
    soil: lib.material('brown_mud_leaves_01', { scale: 1.4, tint: '#8f7a68' }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#25313a', roughness: 0.03, metalness: 0.05, clearcoat: 1, envMapIntensity: 1.6 }),
    metal: new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.35, metalness: 0.85 }),
    blackMetal: new THREE.MeshStandardMaterial({ color: '#1c1d1f', roughness: 0.45, metalness: 0.6 }),
    stone: lib.material('concrete_floor_02', { scale: 0.8, tint: '#b9b4ab', normal: 1.4 }),
    water: new THREE.MeshPhysicalMaterial({ color: '#2a5566', roughness: 0.02, metalness: 0, transmission: 0.2, clearcoat: 1, envMapIntensity: 1.6 }),
    leaf: (kind, hue) => {
      const key = `${kind}-${hue.join()}`;
      let hit = leafCache.get(key);
      if (!hit) {
        const tex = lib.leaves(kind, hue);
        const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.78, metalness: 0 });
        swaying(mat, kind === 'needle' ? 0.012 : kind === 'shrub' ? 0.0 : 0.018);
        mat.customProgramCacheKey = () => `leaf-${kind}`;
        const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.42 });
        swaying(depth, kind === 'needle' ? 0.012 : kind === 'shrub' ? 0.0 : 0.018);
        hit = { mat, depth };
        leafCache.set(key, hit);
      }
      return hit;
    },
    lineMat: (hex) => memo(`line-${hex}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })),
    veh,
  };
  for (const m of [mats.concrete, mats.curb, mats.pavers, mats.asphalt, mats.brickPaver, mats.mulch, mats.soil]) {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -1;
    m.polygonOffsetUnits = -2;
  }
  return mats;
}

// ———————————————————————————————————————— helpers

function scaleUV(geo: THREE.BufferGeometry, su: number, sv: number) {
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

function swapUV(geo: THREE.BufferGeometry) {
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
  return geo;
}

/** Extruded slab from an XZ polygon, top at y. */
export function slab(poly: Poly, y: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: y, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  return metricUV(g);
}

/** A cylinder between two points. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, seg = 8): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false);
  scaleUV(g, Math.max(1, Math.round(r0 * 2 * Math.PI / 0.6)), len / 1.2);
  g.translate(0, len / 2, 0);
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

/** Leaf cards: crossed quads with normals pointing out of the crown for soft lighting. */
function leafCluster(b: Builder, mat: THREE.Material, center: THREE.Vector3, crownC: THREE.Vector3, size: number, rng: Rng, shade: number, cards = 3) {
  for (let i = 0; i < cards; i++) {
    const g = new THREE.PlaneGeometry(size, size);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI));
    g.applyQuaternion(q);
    g.translate(center.x, center.y, center.z);
    // outward normals
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const col = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      const n = new THREE.Vector3(pos.getX(k) - crownC.x, (pos.getY(k) - crownC.y) * 1.3, pos.getZ(k) - crownC.z).normalize();
      nor.setXYZ(k, n.x, n.y, n.z);
      // darker underneath and inside
      const inner = Math.min(1, center.distanceTo(crownC) / Math.max(0.5, size * 1.6));
      const k2 = shade * (0.55 + 0.3 * inner + 0.25 * Math.max(0, n.y));
      col[k * 3] = k2;
      col[k * 3 + 1] = k2;
      col[k * 3 + 2] = k2;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    b.add(g, mat);
  }
}

function finishLeafGroup(g: THREE.Group, depth: THREE.MeshDepthMaterial, leafMat: THREE.Material) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material === leafMat) m.customDepthMaterial = depth;
  });
}

// ———————————————————————————————————————— trees

const LEAF_HUES: Record<string, string[]> = {
  oak: ['#3d5a1e', '#4b6b23', '#355018', '#5a7a2a'],
  maple: ['#4a6e1f', '#5b8227', '#3b5c19', '#6b8f2c'],
  birch: ['#6f9132', '#86a63c', '#5d7f29'],
  pine: ['#23402a', '#2d4f33', '#1d3824'],
  ornamental: ['#f2b6c9', '#e88fae', '#fbe3ea', '#d97099', '#5e7d2a'],
  shrub: ['#2f4f1f', '#3a5f24', '#27431a', '#466c2a'],
  boxwood: ['#365a22', '#40692a', '#2b4a1b'],
};

export function buildTree(t: TreeDef, mats: SceneMats, seed: number): THREE.Group {
  const rng = makeRng(seed);
  const b = new Builder();
  const barkMat = t.kind === 'birch' ? mats.birch : mats.bark;
  const leafKind = t.kind === 'pine' ? 'needle' : t.kind === 'birch' || t.kind === 'ornamental' ? 'small' : 'broad';
  const leaf = mats.leaf(leafKind, LEAF_HUES[t.kind]);
  const h = t.height;
  if (t.kind === 'pine') {
    b.add(limb(new THREE.Vector3(0, -0.1, 0), new THREE.Vector3(0, h, 0), t.trunk * 1.2, 0.03, 10), barkMat);
    const layers = 16;
    for (let i = 0; i < layers; i++) {
      const f = i / layers;
      const y = h * (0.18 + 0.8 * f);
      const r = t.crown * (1 - f) * 1.05 + 0.25;
      const n = Math.max(3, Math.round(4 + r * 4));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rng() * 0.5;
        const end = new THREE.Vector3(Math.cos(a) * r, y - r * 0.25, Math.sin(a) * r);
        if (f < 0.75) b.add(limb(new THREE.Vector3(0, y, 0), end, 0.035 * (1 - f) + 0.01, 0.01, 5), barkMat);
        const mid = end.clone().multiplyScalar(0.6);
        mid.y = y - r * 0.12;
        leafCluster(b, leaf.mat, mid, new THREE.Vector3(0, y, 0), r * 1.1 + 0.4, rng, 0.9, 2);
      }
    }
  } else {
    const trunkTop = h * (t.kind === 'ornamental' ? 0.3 : 0.42);
    const crownC = new THREE.Vector3(0, h - t.crown * 0.92, 0);
    const lean = new THREE.Vector3((rng() - 0.5) * 0.4, 0, (rng() - 0.5) * 0.4);
    const top = new THREE.Vector3(lean.x, trunkTop, lean.z);
    b.add(limb(new THREE.Vector3(0, -0.15, 0), top, t.trunk * 1.08, t.trunk * 0.78, 12), barkMat);
    // root flare
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rng();
      b.add(limb(new THREE.Vector3(0, 0.35, 0), new THREE.Vector3(Math.cos(a) * t.trunk * 2.2, -0.05, Math.sin(a) * t.trunk * 2.2), t.trunk * 0.45, t.trunk * 0.15, 6), barkMat);
    }
    const limbs = t.kind === 'birch' ? 3 : t.kind === 'ornamental' ? 5 : 5 + Math.floor(rng() * 2);
    const tips: THREE.Vector3[] = [];
    for (let i = 0; i < limbs; i++) {
      const a = (i / limbs) * Math.PI * 2 + rng() * 0.6;
      const up = t.kind === 'birch' ? 0.85 : 0.55 + rng() * 0.25;
      const reach = t.crown * (0.6 + rng() * 0.3);
      const start = top.clone().add(new THREE.Vector3(0, -rng() * trunkTop * 0.15, 0));
      const mid = start.clone().add(new THREE.Vector3(Math.cos(a) * reach * 0.5, reach * up * 0.7, Math.sin(a) * reach * 0.5));
      const end = mid.clone().add(new THREE.Vector3(Math.cos(a + 0.3) * reach * 0.5, reach * up * 0.55, Math.sin(a + 0.3) * reach * 0.5));
      const r0 = t.trunk * 0.62;
      b.add(limb(start, mid, r0, r0 * 0.6, 8), barkMat);
      b.add(limb(mid, end, r0 * 0.6, r0 * 0.25, 7), barkMat);
      tips.push(end);
      for (let k = 0; k < 3; k++) {
        const sa = a + (rng() - 0.5) * 2;
        const twig = mid.clone().lerp(end, 0.3 + rng() * 0.5).add(new THREE.Vector3(Math.cos(sa) * reach * 0.45, reach * 0.25 * rng(), Math.sin(sa) * reach * 0.45));
        b.add(limb(mid.clone().lerp(end, rng() * 0.6), twig, r0 * 0.28, 0.015, 5), barkMat);
        tips.push(twig);
      }
    }
    // crown: clusters on an ellipsoid shell, denser near branch tips
    const clusters = Math.round(50 + t.crown * t.crown * 9);
    const cardSize = t.kind === 'ornamental' ? 1.1 : t.kind === 'birch' ? 1.4 : 1.9;
    const ry = t.kind === 'birch' ? 1.25 : 0.82;
    for (let i = 0; i < clusters; i++) {
      let p: THREE.Vector3;
      if (i < tips.length * 2) {
        p = tips[i % tips.length].clone().add(new THREE.Vector3((rng() - 0.5) * 1.2, (rng() - 0.5) * 0.8, (rng() - 0.5) * 1.2));
      } else {
        const u = rng() * 2 - 1;
        const th = rng() * Math.PI * 2;
        const rr = Math.sqrt(1 - u * u);
        const shell = 0.55 + 0.45 * Math.sqrt(rng());
        p = new THREE.Vector3(rr * Math.cos(th) * t.crown * shell, u * t.crown * ry * shell, rr * Math.sin(th) * t.crown * shell).add(crownC);
        p.y = Math.max(p.y, trunkTop + 0.6);
      }
      leafCluster(b, leaf.mat, p, crownC, cardSize * (0.8 + rng() * 0.5), rng, 0.85 + rng() * 0.3, 3);
    }
  }
  const g = b.build();
  finishLeafGroup(g, leaf.depth, leaf.mat);
  if (t.ring) {
    const ring = new THREE.Mesh(new THREE.CircleGeometry(t.ring, 40), mats.mulch);
    metricUV(ring.geometry);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.035;
    ring.receiveShadow = true;
    g.add(ring);
    // a little lip of mulch at the edge
    const lip = new THREE.Mesh(new THREE.TorusGeometry(t.ring - 0.03, 0.035, 6, 48), mats.mulch);
    lip.rotation.x = -Math.PI / 2;
    lip.position.y = 0.01;
    lip.scale.z = 0.8;
    g.add(lip);
  }
  g.position.set(t.x, 0, t.z);
  g.rotation.y = rng() * Math.PI * 2;
  return g;
}

/** A leafy ball — shrubs, foundation plantings. */
export function shrub(b: Builder, mats: SceneMats, x: number, z: number, r: number, rng: Rng, hue = LEAF_HUES.shrub, h = 1) {
  const leaf = mats.leaf('shrub', hue);
  const c = new THREE.Vector3(x, r * 0.85 * h, z);
  b.add(new THREE.SphereGeometry(r * 0.78, 12, 8), mats.paint('#1d2e14', 0.9), x, r * 0.8 * h, z, 0, 0, 0, 1, h, 1);
  const n = Math.round(10 + r * r * 40);
  for (let i = 0; i < n; i++) {
    const u = rng() * 2 - 1;
    const th = rng() * Math.PI * 2;
    const rr = Math.sqrt(1 - u * u);
    const p = new THREE.Vector3(rr * Math.cos(th) * r * 0.85, Math.max(-0.6, u) * r * 0.85 * h, rr * Math.sin(th) * r * 0.85).add(c);
    leafCluster(b, leaf.mat, p, c, r * 0.9 + 0.15, rng, 0.8 + rng() * 0.35, 2);
  }
  return leaf;
}

// ———————————————————————————————————————— houses

export function buildHouse(hd: HouseDef, mats: SceneMats, seed: number): { group: THREE.Group; blockers: THREE.Object3D[] } {
  const rng = makeRng(seed);
  const b = new Builder();
  const { w, d } = hd;
  const story = 2.9;
  const H = hd.stories * story;
  const base = 0.32;
  const wallTop = base + H;
  const wall = hd.kind === 'church' || hd.style === 'brick' ? mats.brick : hd.style === 'plaster' ? mats.plaster(hd.body) : mats.siding(hd.body);
  const trim = mats.paint(hd.trim, 0.5);
  const door = new THREE.MeshPhysicalMaterial({ color: hd.door, roughness: 0.35, clearcoat: 0.8 });
  const office = hd.kind === 'office';
  const church = hd.kind === 'church';

  b.add(metricUV(box(w + 0.12, base, d + 0.12)), mats.concrete, 0, base / 2, 0);
  b.add(metricUV(box(w, H, d), new THREE.Vector3(0, base + H / 2, 0)), wall, 0, base + H / 2, 0);

  // —— roof
  const over = 0.5;
  if (office) {
    b.add(metricUV(box(w + 0.3, 0.6, d + 0.3)), mats.paint('#cfccc4', 0.7), 0, wallTop + 0.3, 0);
    b.add(metricUV(box(w - 0.4, 0.05, d - 0.4)), mats.paint('#6f6f6a', 0.95), 0, wallTop + 0.56, 0);
    for (let i = 0; i < 3; i++) b.add(rbox(2.2, 1.1, 1.6, 0.05), mats.metal, -w / 4 + i * (w / 4), wallTop + 1.1, -d / 6);
  } else {
    const pitch = church ? 1.0 : 0.62;
    const rise = (d / 2) * pitch;
    const ridgeY = wallTop + rise;
    const eaveY = wallTop - over * pitch;
    const W2 = w / 2 + over;
    const D2 = d / 2 + over;
    const geo = new THREE.BufferGeometry();
    const v: number[] = [];
    const tri = (a: number[], bb: number[], c: number[]) => v.push(...a, ...bb, ...c);
    if (hd.roof === 'hip' && w > d) {
      const r = w / 2 - d / 2;
      const L = [-r, ridgeY, 0];
      const R = [r, ridgeY, 0];
      const FL = [-W2, eaveY, D2], FR = [W2, eaveY, D2], BL = [-W2, eaveY, -D2], BR = [W2, eaveY, -D2];
      tri(FL, FR, R); tri(FL, R, L);
      tri(BR, BL, L); tri(BR, L, R);
      tri(FR, BR, R);
      tri(BL, FL, L);
    } else {
      const FL = [-W2, eaveY, D2], FR = [W2, eaveY, D2], BL = [-W2, eaveY, -D2], BR = [W2, eaveY, -D2];
      const RL = [-W2, ridgeY, 0], RR = [W2, ridgeY, 0];
      tri(FL, FR, RR); tri(FL, RR, RL);
      tri(BR, BL, RL); tri(BR, RL, RR);
      // gable ends in wall material
      const ge = new THREE.BufferGeometry();
      const gv = [
        -w / 2, wallTop, d / 2, -w / 2, ridgeY - 0.05, 0, -w / 2, wallTop, -d / 2,
        w / 2, wallTop, -d / 2, w / 2, ridgeY - 0.05, 0, w / 2, wallTop, d / 2,
      ];
      ge.setAttribute('position', new THREE.Float32BufferAttribute(gv, 3));
      ge.computeVertexNormals();
      b.add(metricUV(ge), wall);
      // fascia along the rakes
      const rake = Math.hypot(D2, rise + over * pitch);
      const ang = Math.atan2(rise + over * pitch, D2);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          b.add(box(0.06, 0.2, rake), trim, sx * (W2 + 0.02), (eaveY + ridgeY) / 2 - 0.08, sz * D2 / 2, sz * ang, 0, 0);
        }
      }
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.computeVertexNormals();
    const roofGeo = metricUV(geo);
    b.add(roofGeo, mats.roof);
    // underside (soffit) — same triangles flipped, plain colour
    const under = geo.clone();
    const p = under.getAttribute('position');
    for (let i = 0; i < p.count; i += 3) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setXYZ(i, p.getX(i + 1), p.getY(i + 1) - 0.08, p.getZ(i + 1));
      p.setXYZ(i + 1, x, y - 0.08, z);
      p.setY(i + 2, p.getY(i + 2) - 0.08);
    }
    under.computeVertexNormals();
    b.add(under, mats.paint('#e8e4dc', 0.8));
    // fascia + gutters along eaves
    for (const sz of [-1, 1]) {
      b.add(box(w + over * 2 + 0.04, 0.2, 0.05), trim, 0, eaveY - 0.08, sz * (D2 + 0.02));
      const gut = new THREE.CylinderGeometry(0.07, 0.07, w + over * 2, 10, 1, false, 0, Math.PI);
      gut.rotateZ(Math.PI / 2);
      b.add(gut, trim, 0, eaveY - 0.12, sz * (D2 + 0.09), sz > 0 ? 0 : Math.PI, 0, 0);
      for (const sx of [-1, 1]) b.add(box(0.07, eaveY - 0.15, 0.07), trim, sx * (w / 2 - 0.15), (eaveY - 0.15) / 2, sz * (d / 2 + 0.06));
    }
    // chimney
    if (!church && rng.chance(0.55)) {
      const cx = (rng.chance(0.5) ? -1 : 1) * (w / 2 - 1.4);
      const ch = rise + 1.4;
      b.add(metricUV(box(0.9, ch, 0.75), new THREE.Vector3(cx, wallTop + ch / 2, -d / 4)), mats.brick, cx, wallTop + ch / 2, -d / 4);
      b.add(box(1.05, 0.1, 0.9), mats.concrete, cx, wallTop + ch + 0.05, -d / 4);
    }
    if (church) {
      // steeple over the front door
      const tw = 3.6;
      const th = H + rise + 4;
      b.add(metricUV(box(tw, th, tw), new THREE.Vector3(0, base + th / 2, d / 2 + tw / 2 - 0.4)), mats.brick, 0, base + th / 2, d / 2 + tw / 2 - 0.4);
      const spire = new THREE.ConeGeometry(tw * 0.75, 7, 4);
      spire.rotateY(Math.PI / 4);
      b.add(metricUV(spire), mats.roof, 0, base + th + 3.5, d / 2 + tw / 2 - 0.4);
      b.add(box(0.12, 1.4, 0.12), mats.metal, 0, base + th + 7.6, d / 2 + tw / 2 - 0.4);
      b.add(box(0.7, 0.12, 0.12), mats.metal, 0, base + th + 7.8, d / 2 + tw / 2 - 0.4);
      // louvres in the belfry
      for (const sx of [-1, 1]) b.add(box(0.05, 1.6, 1.4), mats.paint('#2a2a2a'), sx * (tw / 2 + 0.01), base + th - 1.6, d / 2 + tw / 2 - 0.4);
    }
  }

  // —— openings
  const frontZ = d / 2 + (church ? 3.2 : 0);
  const winW = office ? 0 : church ? 1.1 : 1.0;
  const winH = church ? 2.6 : 1.35;
  const glassMat = mats.glass;
  const shutterMat = mats.paint(hd.door, 0.6);
  type Face = { axis: 'z' | 'x'; sign: number; len: number };
  const faces: Face[] = [
    { axis: 'z', sign: 1, len: w },
    { axis: 'z', sign: -1, len: w },
    { axis: 'x', sign: 1, len: d },
    { axis: 'x', sign: -1, len: d },
  ];
  const place = (f: Face, along: number, y: number, ww: number, hh: number, kind: 'window' | 'door' | 'garage') => {
    // local frame on the face: u along, outward n
    const out = f.axis === 'z' ? d / 2 : w / 2;
    const ry = f.axis === 'z' ? (f.sign > 0 ? 0 : Math.PI) : f.sign > 0 ? Math.PI / 2 : -Math.PI / 2;
    const m = new THREE.Matrix4().makeRotationY(ry);
    const pos = (u: number, yy: number, n: number) => {
      const vct = new THREE.Vector3(u, yy, n).applyMatrix4(m);
      return vct;
    };
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, u: number, yy: number, n: number) => {
      const p = pos(u, yy, n);
      geo.rotateY(ry);
      b.add(geo, mat, p.x, p.y, p.z);
    };
    if (kind === 'window') {
      add(box(ww, hh, 0.04), glassMat, along, y, out + 0.01);
      const fr = 0.07;
      add(box(ww + fr * 2, fr, 0.1), trim, along, y + hh / 2 + fr / 2, out + 0.03);
      add(box(ww + fr * 2.6, 0.06, 0.18), trim, along, y - hh / 2 - 0.03, out + 0.06);
      add(box(fr, hh, 0.1), trim, along - ww / 2 - fr / 2, y, out + 0.03);
      add(box(fr, hh, 0.1), trim, along + ww / 2 + fr / 2, y, out + 0.03);
      add(box(0.035, hh, 0.05), trim, along, y, out + 0.03);
      add(box(ww, 0.035, 0.05), trim, along, y + hh * 0.1, out + 0.03);
      if (f.axis === 'z' && f.sign > 0 && !church && hd.style !== 'brick') {
        for (const s of [-1, 1]) {
          add(box(ww * 0.45, hh + 0.05, 0.04), shutterMat, along + s * (ww / 2 + fr + ww * 0.24), y, out + 0.03);
          for (let k = 0; k < 6; k++) add(box(ww * 0.4, 0.015, 0.02), shutterMat, along + s * (ww / 2 + fr + ww * 0.24), y - hh / 2 + 0.12 + k * (hh / 6), out + 0.055);
        }
      }
    } else if (kind === 'door') {
      add(box(ww, hh, 0.06), door, along, y, out + 0.0);
      for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) add(rbox(ww * 0.34, hh * 0.32, 0.03, 0.01, 1), door, along - ww * 0.2 + j * ww * 0.4, y - hh * 0.2 + k * hh * 0.4, out + 0.04);
      add(box(ww + 0.24, 0.12, 0.12), trim, along, y + hh / 2 + 0.06, out + 0.04);
      add(box(0.1, hh, 0.12), trim, along - ww / 2 - 0.05, y, out + 0.04);
      add(box(0.1, hh, 0.12), trim, along + ww / 2 + 0.05, y, out + 0.04);
      add(new THREE.SphereGeometry(0.035, 10, 8), mats.paint('#c9a43a', 0.25), along + ww * 0.35, y - 0.05, out + 0.08);
      add(box(ww + 0.8, 0.18, 0.7), mats.concrete, along, base - 0.09, out + 0.35);
      const lamp = new THREE.MeshStandardMaterial({ color: '#fff3d0', emissive: '#ffcf7a', emissiveIntensity: 0.4 });
      add(rbox(0.14, 0.24, 0.12, 0.03), lamp, along + ww / 2 + 0.35, y + 0.35, out + 0.08);
    } else {
      add(box(ww, hh, 0.05), mats.paint('#f4f3ef', 0.5), along, y, out + 0.0);
      for (let k = 1; k < 4; k++) add(box(ww, 0.03, 0.03), mats.paint('#cfcfca', 0.5), along, y - hh / 2 + (k * hh) / 4, out + 0.03);
      for (let k = 0; k < 4; k++) for (let j = 0; j < 4; j++) add(rbox(ww / 4 - 0.12, hh / 4 - 0.14, 0.02, 0.01, 1), mats.paint('#e9e8e2', 0.5), along - ww / 2 + ww / 8 + (j * ww) / 4, y - hh / 2 + hh / 8 + (k * hh) / 4, out + 0.035);
      add(box(ww + 0.3, 0.15, 0.1), trim, along, y + hh / 2 + 0.07, out + 0.03);
    }
  };

  if (office) {
    // ribbon glazing on every face, per storey
    for (const f of faces) {
      for (let s = 0; s < hd.stories; s++) {
        const y = base + s * story + 1.6;
        const out = f.axis === 'z' ? d / 2 : w / 2;
        const ry = f.axis === 'z' ? (f.sign > 0 ? 0 : Math.PI) : f.sign > 0 ? Math.PI / 2 : -Math.PI / 2;
        const m = new THREE.Matrix4().makeRotationY(ry);
        const g = box(f.len - 1.2, 1.7, 0.08);
        g.rotateY(ry);
        const p = new THREE.Vector3(0, y, out + 0.02).applyMatrix4(m);
        b.add(g, glassMat, p.x, p.y, p.z);
        for (let u = -f.len / 2 + 0.6; u <= f.len / 2 - 0.6 + 1e-3; u += 1.6) {
          const mg = box(0.07, 1.8, 0.12);
          mg.rotateY(ry);
          const mp = new THREE.Vector3(u, y, out + 0.05).applyMatrix4(m);
          b.add(mg, mats.blackMetal, mp.x, mp.y, mp.z);
        }
      }
    }
    // entrance canopy + doors
    b.add(box(6, 0.25, 3), mats.paint('#3a4048', 0.4), 0, base + 3.2, d / 2 + 1.5);
    for (const sx of [-2.8, 2.8]) b.add(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 12), mats.metal, sx, base + 1.6, d / 2 + 2.8);
    b.add(box(3, 2.5, 0.1), glassMat, 0, base + 1.25, d / 2 + 0.07);
  } else {
    // front door, garage, windows
    const garageW = hd.garage ? 5 : 0;
    const gx = hd.garage === 'right' ? w / 2 - garageW / 2 - 0.5 : hd.garage === 'left' ? -w / 2 + garageW / 2 + 0.5 : 0;
    const doorX = church ? 0 : hd.garage === 'right' ? -w * 0.18 : hd.garage === 'left' ? w * 0.18 : 0;
    if (hd.garage) place(faces[0], gx, base - 0.2 + 1.2, 4.6, 2.4, 'garage');
    if (church) {
      // the steeple carries the door
      const p = new THREE.Vector3(0, base + 1.3, frontZ + 0.01);
      b.add(box(1.8, 2.6, 0.08), door, p.x, p.y, p.z);
      b.add(box(2.1, 0.15, 0.12), trim, 0, base + 2.7, frontZ + 0.03);
    } else place(faces[0], doorX, base + 1.1, 1.0, 2.2, 'door');
    for (const f of faces) {
      const usable = f.len - 2;
      const n = Math.max(1, Math.floor(usable / (church ? 3.4 : 3.1)));
      for (let s = 0; s < hd.stories; s++) {
        for (let i = 0; i < n; i++) {
          const u = -usable / 2 + (usable * (i + 0.5)) / n;
          if (f === faces[0]) {
            if (s === 0 && Math.abs(u - doorX) < 1.6) continue;
            if (hd.garage && s === 0 && Math.abs(u - gx) < garageW / 2 + 0.7) continue;
            if (church && Math.abs(u) < 2.4) continue;
          }
          place(f, u, base + s * story + (church ? 2.4 : 1.55), winW, winH, 'window');
        }
      }
    }
    // porch
    if (hd.porch) {
      const fp = houseFootprints(hd)[1];
      if (fp) {
        const pw = Math.min(w * 0.42, 7);
        const off = hd.garage === 'right' ? -w * 0.18 : hd.garage === 'left' ? w * 0.18 : 0;
        b.add(metricUV(box(pw, 0.3, 2)), mats.concrete, off, 0.15, d / 2 + 1);
        b.add(box(pw + 0.3, 0.14, 2.3), trim, off, base + 2.75, d / 2 + 1.05);
        b.add(metricUV(box(pw + 0.5, 0.1, 2.6)), mats.roof, off, base + 2.9, d / 2 + 1.2, -0.12, 0, 0);
        for (const sx of [-1, 1]) {
          b.add(new THREE.CylinderGeometry(0.09, 0.11, 2.6, 14), trim, off + sx * (pw / 2 - 0.2), base + 1.3, d / 2 + 1.8);
          b.add(box(0.28, 0.12, 0.28), trim, off + sx * (pw / 2 - 0.2), 0.36, d / 2 + 1.8);
        }
        b.add(box(1.4, 0.15, 0.4), mats.concrete, off, 0.08, d / 2 + 2.2);
      }
    }
  }
  const group = b.build();
  // foundation shrubs along the sides for neighbours (life!)
  if (hd.decor && !office && !church) {
    const sb = new Builder();
    const leaf = shrub(sb, mats, -w / 2 + 1, d / 2 + 0.8, 0.6, rng);
    shrub(sb, mats, -w / 2 + 2.3, d / 2 + 0.8, 0.55, rng);
    shrub(sb, mats, w / 2 - 1.2, d / 2 + 0.8, 0.65, rng);
    const sg = sb.build();
    finishLeafGroup(sg, leaf.depth, leaf.mat);
    group.add(sg);
  }
  group.position.set(hd.x, 0, hd.z);
  group.rotation.y = hd.rot;
  return { group, blockers: [group] };
}

// ———————————————————————————————————————— fences

export function buildFence(f: FenceDef, mats: SceneMats, seed: number): THREE.Group {
  const rng = makeRng(seed);
  const b = new Builder();
  const white = mats.paint('#f3f1ea', 0.5);
  let leafRef: ReturnType<SceneMats['leaf']> | null = null;
  for (let i = 0; i < f.pts.length - 1; i++) {
    const [ax, az] = f.pts[i];
    const [bx, bz] = f.pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) continue;
    const ang = Math.atan2(bz - az, bx - ax);
    const ry = -ang;
    const at = (t: number) => [ax + (bx - ax) * t, az + (bz - az) * t] as const;
    const posts = Math.max(1, Math.ceil(len / 2.4));
    if (f.kind === 'hedge') {
      const n = Math.max(2, Math.round(len / 0.9));
      for (let k = 0; k <= n; k++) {
        const [x, z] = at(k / n);
        leafRef = shrub(b, mats, x, z, 0.62, rng, LEAF_HUES.boxwood, f.h / 1.1);
      }
      continue;
    }
    for (let k = 0; k <= posts; k++) {
      const [x, z] = at(k / posts);
      if (f.kind === 'rail') b.add(scaleUV(new THREE.CylinderGeometry(0.08, 0.09, f.h + 0.1, 8), 1, 1), mats.planks, x, (f.h + 0.1) / 2 - 0.05, z, 0, rng() * 3, 0);
      else {
        b.add(metricUV(box(0.1, f.h + 0.12, 0.1)), f.kind === 'picket' ? white : mats.planks, x, (f.h + 0.12) / 2 - 0.05, z);
        if (f.kind === 'picket') b.add(box(0.14, 0.04, 0.14), white, x, f.h + 0.1, z);
      }
    }
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    if (f.kind === 'rail') {
      for (const y of [0.4, 0.85]) b.add(swapUV(scaleUV(new THREE.CylinderGeometry(0.055, 0.055, len, 7), 1, len / 1.6)), mats.planks, mx, y * f.h, mz, 0, ry, Math.PI / 2);
      continue;
    }
    // rails
    for (const y of [0.25, f.h - 0.3]) {
      const g = metricUV(box(len, 0.08, 0.04));
      b.add(g, f.kind === 'picket' ? white : mats.planks, mx, y, mz, 0, ry, 0);
    }
    // boards / pickets on one face
    const bw = f.kind === 'picket' ? 0.075 : 0.14;
    const gap = f.kind === 'picket' ? 0.07 : 0.006;
    const count = Math.floor(len / (bw + gap));
    const nx = -Math.sin(ang) * 0.04;
    const nz = Math.cos(ang) * 0.04;
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count;
      const [x, z] = at(t);
      if (f.kind === 'picket') {
        const sh = new THREE.Shape();
        sh.moveTo(-bw / 2, 0);
        sh.lineTo(bw / 2, 0);
        sh.lineTo(bw / 2, f.h - 0.08);
        sh.lineTo(0, f.h);
        sh.lineTo(-bw / 2, f.h - 0.08);
        sh.closePath();
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false });
        g.translate(0, 0, -0.01);
        b.add(g, white, x + nx, 0.04, z + nz, 0, ry, 0);
      } else {
        const hh = f.h + (rng() - 0.5) * 0.02;
        const g = swapUV(metricUV(box(bw, hh, 0.02)));
        // offset UVs per board so grain doesn't line up
        const uv = g.getAttribute('uv');
        const ou = rng() * 4;
        for (let q = 0; q < uv.count; q++) uv.setX(q, uv.getX(q) + ou);
        b.add(g, mats.planks, x + nx, hh / 2 + 0.03, z + nz, 0, ry, 0);
      }
    }
  }
  const g = b.build();
  if (leafRef) finishLeafGroup(g, leafRef.depth, leafRef.mat);
  return g;
}

// ———————————————————————————————————————— paving

export function buildHard(list: HardDef[], lines: LineDef[], mats: SceneMats): THREE.Group {
  const b = new Builder();
  for (const h of list) {
    const y = Math.max(0.02, h.y ?? 0.02);
    const mat =
      h.kind === 'road' || h.kind === 'parking' ? mats.asphalt
        : h.kind === 'curb' ? mats.curb
          : h.kind === 'sidewalk' || h.kind === 'path' ? mats.pavers
            : h.kind === 'patio' ? mats.brickPaver
              : mats.concrete;
    b.add(slab(h.poly, y), mat);
  }
  for (const l of lines) {
    const [ax, az] = l.a;
    const [bx, bz] = l.b;
    const len = Math.hypot(bx - ax, bz - az);
    const ang = Math.atan2(bz - az, bx - ax);
    const mat = mats.lineMat(l.color);
    if (l.dashed) {
      const dash = 3;
      const gap = 3;
      for (let s = 0; s + dash <= len; s += dash + gap) {
        const t = (s + dash / 2) / len;
        b.add(box(dash, 0.004, l.width), mat, ax + (bx - ax) * t, 0.023, az + (bz - az) * t, 0, -ang, 0);
      }
    } else {
      b.add(box(len, 0.004, l.width), mat, (ax + bx) / 2, 0.023, (az + bz) / 2, 0, -ang, 0);
    }
  }
  const g = b.build({ cast: false, receive: true });
  return g;
}

// ———————————————————————————————————————— beds + flowers

export interface FlowerSet {
  mesh: THREE.InstancedMesh;
  pos: Float32Array; // x,z per instance
  alive: Uint8Array;
}

export function buildBeds(beds: BedDef[], mats: SceneMats, seed: number): { group: THREE.Group; flowers: FlowerSet | null } {
  const rng = makeRng(seed);
  const b = new Builder();
  let leafRef: ReturnType<SceneMats['leaf']> | null = null;
  const flowerPts: { x: number; z: number; c: THREE.Color; s: number }[] = [];
  const edging = mats.paint('#26231f', 0.6);
  for (const bed of beds) {
    b.add(slab(bed.poly, 0.05), mats.mulch);
    // steel edging strip around the bed
    for (let i = 0; i < bed.poly.length; i++) {
      const [ax, az] = bed.poly[i];
      const [bx, bz] = bed.poly[(i + 1) % bed.poly.length];
      const len = Math.hypot(bx - ax, bz - az);
      b.add(box(len + 0.02, 0.07, 0.02), edging, (ax + bx) / 2, 0.035, (az + bz) / 2, 0, -Math.atan2(bz - az, bx - ax), 0);
    }
    const bb = bounds(bed.poly);
    const area = (bb.x1 - bb.x0) * (bb.z1 - bb.z0);
    if (bed.kind === 'shrubs') {
      const long = bb.x1 - bb.x0 > bb.z1 - bb.z0;
      const L = long ? bb.x1 - bb.x0 : bb.z1 - bb.z0;
      const n = Math.max(1, Math.round(L / 1.15));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = long ? bb.x0 + (bb.x1 - bb.x0) * t : (bb.x0 + bb.x1) / 2;
        const z = long ? (bb.z0 + bb.z1) / 2 : bb.z0 + (bb.z1 - bb.z0) * t;
        leafRef = shrub(b, mats, x + (rng() - 0.5) * 0.15, z + (rng() - 0.5) * 0.15, 0.48 + rng() * 0.15, rng, i % 2 ? LEAF_HUES.boxwood : LEAF_HUES.shrub);
      }
    } else if (bed.kind === 'flowers') {
      const pal = (bed.palette ?? ['#e8433f', '#ffffff']).map((c) => new THREE.Color(c));
      const n = Math.round(area * 26);
      for (let i = 0; i < n; i++) {
        const x = bb.x0 + rng() * (bb.x1 - bb.x0);
        const z = bb.z0 + rng() * (bb.z1 - bb.z0);
        if (!inPoly(x, z, bed.poly)) continue;
        flowerPts.push({ x, z, c: pal[Math.floor(rng() * pal.length)].clone().multiplyScalar(0.85 + rng() * 0.3), s: 0.75 + rng() * 0.5 });
      }
      // foliage underneath
      const m = Math.round(area * 2.2);
      for (let i = 0; i < m; i++) {
        const x = bb.x0 + rng() * (bb.x1 - bb.x0);
        const z = bb.z0 + rng() * (bb.z1 - bb.z0);
        if (!inPoly(x, z, bed.poly)) continue;
        const leaf = mats.leaf('shrub', ['#3f6a23', '#4d7a2a', '#365c1e']);
        leafRef = leafRef ?? leaf;
        leafCluster(b, leaf.mat, new THREE.Vector3(x, 0.16, z), new THREE.Vector3(x, 0, z), 0.42, rng, 0.9, 2);
      }
    } else {
      // mulch bed: hostas + ornamental grass clumps
      const m = Math.max(1, Math.round(area * 0.5));
      for (let i = 0; i < m; i++) {
        const x = bb.x0 + rng() * (bb.x1 - bb.x0);
        const z = bb.z0 + rng() * (bb.z1 - bb.z0);
        if (!inPoly(x, z, bed.poly)) continue;
        leafRef = shrub(b, mats, x, z, 0.32 + rng() * 0.12, rng, ['#5f8a3a', '#6d9a40', '#4e7a30'], 0.8);
      }
    }
  }
  const group = b.build();
  if (leafRef) finishLeafGroup(group, leafRef.depth, leafRef.mat);
  let flowers: FlowerSet | null = null;
  if (flowerPts.length) {
    // one flower: stem + five petals + centre
    const fb = new Builder();
    const stemMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    fb.add(tintGeo(new THREE.CylinderGeometry(0.006, 0.008, 0.3, 4), new THREE.Color('#3d6b22')), stemMat, 0, 0.15, 0);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const pg = new THREE.SphereGeometry(0.03, 7, 5);
      pg.scale(1.3, 0.35, 0.8);
      pg.translate(0.03, 0, 0);
      pg.rotateY(a);
      fb.add(tintGeo(pg, new THREE.Color(1, 1, 1)), stemMat, 0, 0.3, 0);
    }
    fb.add(tintGeo(new THREE.SphereGeometry(0.016, 8, 6), new THREE.Color('#f3c623')), stemMat, 0, 0.31, 0);
    const proto = fb.build().children[0] as THREE.Mesh;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
    const im = new THREE.InstancedMesh(proto.geometry, mat, flowerPts.length);
    const pos = new Float32Array(flowerPts.length * 2);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    flowerPts.forEach((f, i) => {
      q.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.3, rng() * 6.28, (rng() - 0.5) * 0.3));
      m4.compose(new THREE.Vector3(f.x, 0.03, f.z), q, new THREE.Vector3(f.s, f.s * (0.8 + rng() * 0.5), f.s));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, f.c);
      pos[i * 2] = f.x;
      pos[i * 2 + 1] = f.z;
    });
    // petals carry the instance colour; the stem colour comes from vertex colours (green)
    im.castShadow = true;
    im.receiveShadow = true;
    group.add(im);
    flowers = { mesh: im, pos, alive: new Uint8Array(flowerPts.length).fill(1) };
  }
  return { group, flowers };
}

function bounds(p: Poly) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of p) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  return { x0, z0, x1, z1 };
}

function inPoly(x: number, z: number, poly: Poly): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// ———————————————————————————————————————— props

function carBody(b: Builder, mats: SceneMats, color: string, rng: Rng, len = 4.5, wid = 1.86) {
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.04 });
  b.add(rbox(len, 0.62, wid, 0.22, 4), paint, 0, 0.62, 0);
  // hood/trunk tapers
  b.add(rbox(len * 0.5, 0.58, wid - 0.16, 0.25, 4), mats.glass, -0.15, 1.12, 0);
  b.add(rbox(len * 0.44, 0.08, wid - 0.26, 0.04, 2), paint, -0.2, 1.42, 0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const t = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 24);
      t.rotateX(Math.PI / 2);
      b.add(t, mats.veh.tire, sx * len * 0.31, 0.34, sz * (wid / 2 - 0.12));
      const r = new THREE.CylinderGeometry(0.22, 0.22, 0.25, 18);
      r.rotateX(Math.PI / 2);
      b.add(r, mats.metal, sx * len * 0.31, 0.34, sz * (wid / 2 - 0.115));
    }
  }
  for (const sz of [-0.62, 0.62]) {
    b.add(rbox(0.06, 0.12, 0.34, 0.03), mats.veh.lens, len / 2 - 0.02, 0.72, sz);
    b.add(rbox(0.06, 0.12, 0.34, 0.03), mats.veh.tail, -len / 2 + 0.02, 0.76, sz);
  }
  b.add(rbox(0.05, 0.16, wid - 0.4, 0.03), mats.blackMetal, len / 2 + 0.01, 0.48, 0);
  void rng;
}

export function buildProp(p: PropDef, mats: SceneMats, lib: TexLib, seed: number): { group: THREE.Group; anim?: (t: number) => void } {
  const rng = makeRng(seed);
  const b = new Builder();
  const white = mats.paint('#f3f1ea', 0.5);
  const s = p.scale ?? 1;
  let anim: ((t: number) => void) | undefined;
  let extra: THREE.Object3D | null = null;
  switch (p.kind) {
    case 'shed': {
      const w = 3.2, d = 2.6, h = 2.1;
      const body = mats.siding('#c9b48f');
      b.add(metricUV(box(w, h, d), new THREE.Vector3(0, h / 2, 0)), body, 0, h / 2 + 0.1, 0);
      b.add(metricUV(box(w + 0.1, 0.12, d + 0.1)), mats.concrete, 0, 0.06, 0);
      const rise = 0.9;
      const ang = Math.atan2(rise, d / 2);
      const L = Math.hypot(d / 2 + 0.25, rise + 0.15);
      for (const sz of [-1, 1]) b.add(metricUV(box(w + 0.4, 0.08, L)), mats.roof, 0, h + 0.1 + rise / 2, sz * d / 4, sz * ang, 0, 0);
      const gable = new THREE.BufferGeometry();
      gable.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, h + 0.1, d / 2, -w / 2, h + 0.1 + rise, 0, -w / 2, h + 0.1, -d / 2, w / 2, h + 0.1, -d / 2, w / 2, h + 0.1 + rise, 0, w / 2, h + 0.1, d / 2], 3));
      gable.computeVertexNormals();
      b.add(metricUV(gable), body);
      b.add(box(1.4, 1.8, 0.05), mats.paint('#7a2f22'), w / 2 + 0.01, 1.0, 0, 0, Math.PI / 2, 0);
      for (const zz of [-0.36, 0.36]) b.add(box(0.06, 1.8, 0.04), white, w / 2 + 0.03, 1.0, zz, 0, Math.PI / 2, 0);
      b.add(box(0.06, 1.8, 0.04), white, w / 2 + 0.035, 1.0, 0, 0, Math.PI / 2, 0.68);
      b.add(box(0.7, 0.5, 0.03), mats.glass, 0, 1.4, d / 2 + 0.01);
      b.add(box(0.8, 0.06, 0.06), white, 0, 1.12, d / 2 + 0.03);
      break;
    }
    case 'trampoline': {
      const r = 2.0;
      const mat = new THREE.Mesh(new THREE.CircleGeometry(r - 0.25, 48), mats.paint('#151515', 0.85));
      mat.rotation.x = -Math.PI / 2;
      mat.position.y = 0.9;
      mat.receiveShadow = true;
      mat.castShadow = true;
      extra = mat;
      const pad = new THREE.TorusGeometry(r - 0.12, 0.13, 10, 48);
      pad.rotateX(Math.PI / 2);
      b.add(pad, mats.paint('#1f5fbf', 0.6), 0, 0.92, 0, 0, 0, 0, 1, 1, 1);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), mats.metal, Math.cos(a) * (r - 0.12), 0.45, Math.sin(a) * (r - 0.12));
        b.add(new THREE.CylinderGeometry(0.02, 0.02, 1.8, 8), mats.paint('#222'), Math.cos(a) * (r - 0.05), 1.8, Math.sin(a) * (r - 0.05));
      }
      const net = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.05, r - 0.05, 1.6, 48, 1, true), new THREE.MeshStandardMaterial({ color: '#111', transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
      net.position.y = 1.75;
      const g = b.build();
      g.add(mat, net);
      g.position.set(p.x, 0, p.z);
      return { group: g };
    }
    case 'playset': {
      const wood = mats.paint('#9c6b3f', 0.75);
      for (const sx of [-1.7, -0.3]) for (const sz of [-0.9, 0.9]) b.add(rbox(0.12, 2.6, 0.12, 0.02), wood, sx, 1.3, sz);
      b.add(rbox(1.6, 0.08, 2.0, 0.02), wood, -1.0, 1.4, 0);
      const roof = new THREE.ConeGeometry(1.4, 0.8, 4);
      roof.rotateY(Math.PI / 4);
      b.add(roof, mats.paint('#2f7d4f', 0.6), -1.0, 3.0, 0);
      // swing beam + swings
      b.add(rbox(2.6, 0.12, 0.12, 0.02), wood, 1.0, 2.4, 0);
      for (const sz of [-0.9, 0.9]) {
        const leg = rbox(0.1, 2.6, 0.1, 0.02);
        b.add(leg, wood, 2.25, 1.2, sz * 0.6, sz * 0.25, 0, 0);
      }
      for (const x of [0.5, 1.5]) {
        for (const sz of [-0.2, 0.2]) b.add(new THREE.CylinderGeometry(0.008, 0.008, 1.8, 4), mats.metal, x, 1.5, sz);
        b.add(rbox(0.45, 0.04, 0.5, 0.02), mats.paint('#e8b923', 0.5), x, 0.6, 0);
      }
      // slide
      b.add(rbox(0.55, 0.06, 2.4, 0.05), mats.paint('#f2c230', 0.35), -1.0, 0.75, -1.9, -0.6, 0, 0);
      b.add(slab([[-2.0, -1.3], [2.0, -1.3], [2.0, 1.3], [-2.0, 1.3]], 0.04), mats.mulch);
      break;
    }
    case 'raisedbed': {
      b.add(metricUV(box(3.0, 0.4, 1.2)), mats.planks, 0, 0.2, 0);
      b.add(metricUV(box(2.84, 0.05, 1.04)), mats.soil, 0, 0.41, 0);
      for (let i = 0; i < 9; i++) shrub(b, mats, -1.2 + (i % 5) * 0.6, (i < 5 ? -0.25 : 0.25), 0.18 + rng() * 0.08, rng, ['#4d8a2c', '#63a338', '#3b6e22'], 0.9);
      break;
    }
    case 'ac': {
      b.add(metricUV(box(1.1, 0.1, 1.1)), mats.concrete, 0, 0.05, 0);
      b.add(rbox(0.9, 0.8, 0.9, 0.04), mats.paint('#b9bcbf', 0.45), 0, 0.5, 0);
      const fan = new THREE.CylinderGeometry(0.34, 0.34, 0.02, 24);
      b.add(fan, mats.blackMetal, 0, 0.91, 0);
      for (let i = 0; i < 8; i++) b.add(box(0.86, 0.6, 0.012), mats.paint('#8f9396', 0.5), 0, 0.5, -0.45 + i * 0.002, 0, 0, 0);
      break;
    }
    case 'mailbox': {
      b.add(rbox(0.1, 1.1, 0.1, 0.02), white, 0, 0.55, 0);
      b.add(rbox(0.5, 0.22, 0.2, 0.08, 3), mats.blackMetal, 0, 1.15, 0);
      b.add(box(0.03, 0.18, 0.04), mats.paint('#d22'), -0.12, 1.3, 0.12);
      break;
    }
    case 'birdbath': {
      const prof = [new THREE.Vector2(0.2, 0), new THREE.Vector2(0.12, 0.08), new THREE.Vector2(0.08, 0.6), new THREE.Vector2(0.12, 0.72), new THREE.Vector2(0.38, 0.8), new THREE.Vector2(0.42, 0.86), new THREE.Vector2(0.0, 0.84)];
      b.add(new THREE.LatheGeometry(prof, 28), mats.stone);
      const w = new THREE.CircleGeometry(0.36, 28);
      w.rotateX(-Math.PI / 2);
      b.add(w, mats.water, 0, 0.83, 0);
      break;
    }
    case 'gnome': {
      b.add(new THREE.CapsuleGeometry(0.07, 0.08, 4, 10), mats.paint('#2b59c3', 0.5), 0, 0.12, 0);
      b.add(new THREE.SphereGeometry(0.06, 14, 10), mats.paint('#f1c7a5', 0.6), 0, 0.27, 0);
      b.add(new THREE.ConeGeometry(0.065, 0.2, 14), mats.paint('#d12d2d', 0.5), 0, 0.39, 0, 0, 0, 0.2);
      const beard = new THREE.ConeGeometry(0.055, 0.14, 12);
      beard.rotateX(Math.PI);
      b.add(beard, white, 0.04, 0.21, 0, 0, 0, 0.3);
      break;
    }
    case 'boulder': {
      const g = new THREE.IcosahedronGeometry(0.7 * s, 3);
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
        const n = 1 + 0.18 * Math.sin(v.x * 4 + seed) * Math.cos(v.z * 5) + 0.1 * Math.sin(v.y * 7);
        v.multiplyScalar(n);
        v.y *= 0.62;
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      b.add(metricUV(g), mats.stone, 0, 0.2 * s, 0);
      break;
    }
    case 'lamp': {
      b.add(new THREE.CylinderGeometry(0.06, 0.09, 2.6, 12), mats.blackMetal, 0, 1.3, 0);
      b.add(new THREE.CylinderGeometry(0.16, 0.2, 0.12, 12), mats.blackMetal, 0, 0.06, 0);
      b.add(rbox(0.3, 0.42, 0.3, 0.04), new THREE.MeshStandardMaterial({ color: '#fff7dc', emissive: '#ffd27a', emissiveIntensity: 0.35, roughness: 0.2 }), 0, 2.82, 0);
      const cap = new THREE.ConeGeometry(0.26, 0.2, 4);
      cap.rotateY(Math.PI / 4);
      b.add(cap, mats.blackMetal, 0, 3.13, 0);
      break;
    }
    case 'hydrant': {
      const red = new THREE.MeshPhysicalMaterial({ color: '#c41d1d', roughness: 0.4, clearcoat: 0.6 });
      b.add(new THREE.CylinderGeometry(0.13, 0.15, 0.6, 16), red, 0, 0.3, 0);
      b.add(new THREE.SphereGeometry(0.14, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), red, 0, 0.6, 0);
      for (const a of [0, Math.PI / 2, Math.PI]) {
        const n = new THREE.CylinderGeometry(0.05, 0.05, 0.12, 10);
        n.rotateZ(Math.PI / 2);
        n.translate(0.15, 0, 0);
        n.rotateY(a);
        b.add(n, red, 0, 0.42, 0);
      }
      b.add(new THREE.CylinderGeometry(0.03, 0.04, 0.06, 8), mats.metal, 0, 0.75, 0);
      break;
    }
    case 'flagpole': {
      b.add(new THREE.CylinderGeometry(0.04, 0.08, 9, 12), mats.metal, 0, 4.5, 0);
      b.add(new THREE.SphereGeometry(0.09, 12, 8), mats.paint('#d4af37', 0.3), 0, 9.05, 0);
      const flagGeo = new THREE.PlaneGeometry(2.4, 1.4, 16, 6);
      flagGeo.translate(1.2, 0, 0);
      const flagTex = lib.label('★', '', '#1f3b7a', '#ffffff');
      const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8 }));
      flag.position.set(0.05, 8.2, 0);
      flag.castShadow = true;
      const base = flagGeo.getAttribute('position').array.slice() as Float32Array;
      anim = (t) => {
        const pos = flagGeo.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
          const x = base[i * 3];
          pos.setZ(i, Math.sin(x * 2.4 - t * 6) * 0.12 * (x / 2.4));
        }
        pos.needsUpdate = true;
        flagGeo.computeVertexNormals();
      };
      extra = flag;
      break;
    }
    case 'bench': {
      const wood = mats.paint('#8a5a32', 0.7);
      for (let i = 0; i < 4; i++) b.add(rbox(1.8, 0.04, 0.1, 0.015), wood, 0, 0.45, -0.18 + i * 0.12);
      for (let i = 0; i < 3; i++) b.add(rbox(1.8, 0.1, 0.035, 0.015), wood, 0, 0.62 + i * 0.13, -0.28, -0.15, 0, 0);
      for (const sx of [-0.75, 0.75]) {
        b.add(rbox(0.06, 0.45, 0.5, 0.02), mats.blackMetal, sx, 0.22, 0);
        b.add(rbox(0.06, 0.5, 0.06, 0.02), mats.blackMetal, sx, 0.7, -0.27, -0.15, 0, 0);
      }
      break;
    }
    case 'fountain': {
      const prof = [
        new THREE.Vector2(2.05, 0), new THREE.Vector2(2.05, 0.45), new THREE.Vector2(1.85, 0.5), new THREE.Vector2(1.8, 0.2),
        new THREE.Vector2(0.35, 0.2), new THREE.Vector2(0.25, 1.2), new THREE.Vector2(0.9, 1.35), new THREE.Vector2(0.95, 1.45),
        new THREE.Vector2(0.15, 1.42), new THREE.Vector2(0.12, 2.0), new THREE.Vector2(0.4, 2.1), new THREE.Vector2(0.0, 2.15),
      ];
      b.add(metricUV(new THREE.LatheGeometry(prof, 48)), mats.stone);
      const w1 = new THREE.CircleGeometry(1.82, 48);
      w1.rotateX(-Math.PI / 2);
      b.add(w1, mats.water, 0, 0.4, 0);
      const w2 = new THREE.CircleGeometry(0.86, 32);
      w2.rotateX(-Math.PI / 2);
      b.add(w2, mats.water, 0, 1.4, 0);
      // falling water sheets
      const sheet = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 1.05, 1.0, 48, 1, true),
        new THREE.MeshStandardMaterial({ color: '#cfe8f2', transparent: true, opacity: 0.35, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide }),
      );
      sheet.position.y = 0.9;
      const tex = sheet.material.map;
      void tex;
      anim = (t) => {
        (sheet.material as THREE.MeshStandardMaterial).opacity = 0.28 + Math.sin(t * 9) * 0.05;
      };
      extra = sheet;
      break;
    }
    case 'sign': {
      const face = new THREE.MeshStandardMaterial({ map: lib.label(p.scale && p.scale > 2 ? 'WELCOME' : 'SLOW', p.scale && p.scale > 2 ? 'est. 1962' : 'children at play', '#24402f'), roughness: 0.6 });
      const sw = 0.6 * s;
      for (const sx of [-sw / 2, sw / 2]) b.add(rbox(0.08, 0.9 * s + 0.6, 0.08, 0.02), white, sx, (0.9 * s + 0.6) / 2, 0);
      b.add(rbox(sw + 0.3, 0.5 * s, 0.06, 0.02), face, 0, 0.6 + 0.5 * s, 0.03);
      break;
    }
    case 'sprinkler': {
      b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12), mats.paint('#2a2a2a', 0.5), 0, 0.025, 0);
      break;
    }
    case 'grill': {
      b.add(new THREE.SphereGeometry(0.35, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mats.blackMetal, 0, 0.8, 0, Math.PI, 0, 0);
      b.add(new THREE.SphereGeometry(0.35, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mats.blackMetal, 0, 0.8, 0);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        b.add(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 6), mats.blackMetal, Math.cos(a) * 0.2, 0.3, Math.sin(a) * 0.2, Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
      }
      break;
    }
    case 'car': {
      carBody(b, mats, p.color ?? '#888', rng);
      break;
    }
    default:
      b.add(rbox(0.4, 0.4, 0.4), white, 0, 0.2, 0);
  }
  const g = b.build();
  if (extra) g.add(extra);
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material && (m.material as THREE.MeshStandardMaterial).alphaTest > 0) {
      const leaf = mats.leaf('shrub', LEAF_HUES.shrub);
      if (m.material === leaf.mat) m.customDepthMaterial = leaf.depth;
    }
  });
  g.position.set(p.x, 0, p.z);
  g.rotation.y = p.rot;
  return { group: g, anim };
}

/** Our crew's pickup with the utility trailer behind it. Faces +X along `heading`. */
export function buildRig(mats: SceneMats, lib: TexLib, x: number, z: number, heading: number): THREE.Group {
  const b = new Builder();
  const white = new THREE.MeshPhysicalMaterial({ color: '#f1f1ee', roughness: 0.28, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 });
  const tx = 5.6;
  // truck
  b.add(rbox(2.2, 0.85, 2.0, 0.22, 4), white, tx + 1.6, 0.95, 0);
  b.add(rbox(1.9, 0.95, 1.95, 0.2, 4), white, tx + 0.15, 1.55, 0);
  b.add(rbox(1.7, 0.6, 2.0, 0.12, 3), mats.glass, tx + 0.2, 1.75, 0);
  b.add(rbox(1.75, 0.08, 1.85, 0.04, 2), white, tx + 0.15, 2.06, 0);
  b.add(rbox(2.4, 0.75, 2.0, 0.1, 3), white, tx - 1.7, 1.05, 0);
  b.add(rbox(2.2, 0.1, 1.8, 0.02), mats.blackMetal, tx - 1.7, 1.25, 0);
  b.add(rbox(0.12, 0.3, 2.1, 0.05), mats.blackMetal, tx + 2.72, 0.75, 0);
  b.add(rbox(0.06, 0.25, 1.4, 0.03), mats.metal, tx + 2.72, 1.0, 0);
  for (const sz of [-0.75, 0.75]) {
    b.add(rbox(0.06, 0.16, 0.36, 0.04), mats.veh.lens, tx + 2.7, 1.12, sz);
    b.add(rbox(0.06, 0.3, 0.14, 0.03), mats.veh.tail, tx - 2.92, 1.15, sz * 1.15);
  }
  const doorTex = new THREE.MeshStandardMaterial({ map: lib.decal(), transparent: true, roughness: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  for (const sz of [-1, 1]) {
    const pl = new THREE.PlaneGeometry(1.3, 0.33);
    if (sz < 0) pl.rotateY(Math.PI);
    b.add(pl, doorTex, tx + 0.15, 1.3, sz * 1.0);
  }
  for (const wx of [tx + 1.7, tx - 1.9]) {
    for (const sz of [-0.9, 0.9]) {
      const t = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 28);
      t.rotateX(Math.PI / 2);
      b.add(t, mats.veh.tire, wx, 0.42, sz);
      const r = new THREE.CylinderGeometry(0.26, 0.26, 0.31, 20);
      r.rotateX(Math.PI / 2);
      b.add(r, mats.metal, wx, 0.42, sz);
    }
  }
  // trailer
  b.add(rbox(4.0, 0.1, 2.0, 0.02), mats.planks, -0.2, 0.55, 0);
  b.add(rbox(4.0, 0.14, 0.08, 0.02), mats.blackMetal, -0.2, 0.47, 0.98);
  b.add(rbox(4.0, 0.14, 0.08, 0.02), mats.blackMetal, -0.2, 0.47, -0.98);
  for (const sz of [-1, 1]) {
    b.add(rbox(4.0, 0.04, 0.04, 0.01), mats.blackMetal, -0.2, 1.0, sz * 0.98);
    for (let i = 0; i < 9; i++) b.add(box(0.03, 0.45, 0.03), mats.blackMetal, -2.15 + i * 0.49, 0.78, sz * 0.98);
    const t = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 24);
    t.rotateX(Math.PI / 2);
    b.add(t, mats.veh.tire, -0.2, 0.3, sz * 1.12);
    const fender = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 20, 1, true, Math.PI / 2, Math.PI);
    fender.rotateX(Math.PI / 2);
    b.add(fender, mats.blackMetal, -0.2, 0.32, sz * 1.12);
  }
  // tongue to the hitch
  b.add(rbox(1.9, 0.08, 0.08, 0.02), mats.blackMetal, 2.65, 0.52, 0.3, 0, 0.18, 0);
  b.add(rbox(1.9, 0.08, 0.08, 0.02), mats.blackMetal, 2.65, 0.52, -0.3, 0, -0.18, 0);
  // ramp gate folded down at the back
  b.add(rbox(1.3, 0.05, 1.9, 0.02), mats.blackMetal, -2.75, 0.28, 0, 0, 0, 0.42);
  const g = b.build();
  g.position.set(x, 0, z);
  g.rotation.y = -heading;
  return g;
}

/** A wall of tree cards around the edge of the world so the horizon reads as woods. */
export function buildTreeLine(mats: SceneMats, W: { x0: number; z0: number; x1: number; z1: number }, seed: number): THREE.Group {
  const rng = makeRng(seed);
  const b = new Builder();
  const leafA = mats.leaf('broad', LEAF_HUES.oak);
  const leafB = mats.leaf('needle', LEAF_HUES.pine);
  const pad = 14;
  const edges: [number, number, number, number][] = [
    [W.x0 - pad, W.z0 - pad, W.x1 + pad, W.z0 - pad],
    [W.x1 + pad, W.z0 - pad, W.x1 + pad, W.z1 + pad],
    [W.x1 + pad, W.z1 + pad, W.x0 - pad, W.z1 + pad],
    [W.x0 - pad, W.z1 + pad, W.x0 - pad, W.z0 - pad],
  ];
  for (const [ax, az, bx, bz] of edges) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.round(len / 4.5);
    for (let i = 0; i < n; i++) {
      const t = (i + rng()) / n;
      for (let row = 0; row < 2; row++) {
        const x = ax + (bx - ax) * t + (rng() - 0.5) * 6 + (row ? (bz - az) / len * 7 : 0);
        const z = az + (bz - az) * t + (rng() - 0.5) * 6 - (row ? (bx - ax) / len * 7 : 0);
        const h = 9 + rng() * 9;
        const pine = rng() < 0.35;
        const c = new THREE.Vector3(x, h * 0.62, z);
        b.add(new THREE.CylinderGeometry(0.2, 0.3, h * 0.6, 6), mats.bark, x, h * 0.3, z);
        const k = Math.round(10 + h);
        for (let j = 0; j < k; j++) {
          const p = c.clone().add(new THREE.Vector3((rng() - 0.5) * h * 0.5, (rng() - 0.3) * h * 0.55, (rng() - 0.5) * h * 0.5));
          leafCluster(b, pine ? leafB.mat : leafA.mat, p, c, 3.2 + rng() * 1.8, rng, 0.75 + rng() * 0.25, 2);
        }
      }
    }
  }
  const g = b.build({ cast: false, receive: true });
  return g;
}
