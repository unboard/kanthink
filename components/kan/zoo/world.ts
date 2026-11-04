import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../city/grid';
import {
  BOUNDARY, EXHIBITS, HABITATS, K, PATHS, PLACES, SKYFARI, TRAIN, ellipseD, heightAt, inside, loopLengths, toPx, toWorld,
  type ExhibitDef, type Ground, type HabitatDef, type Place, type Px,
} from '@/lib/kan/zoo/map';

/**
 * Everything at the zoo that stays put: the ground and its hills, the water, the
 * paths, fences, glass halls, the shops and rides, trees by the thousand, the train
 * track and the Skyfari's cable. Static pieces are merged by material so the whole
 * zoo costs a few dozen draw calls; trees and lamps are instanced.
 *
 * Also the rules of the ground: how high it is anywhere, where the water is, and
 * where you can walk.
 */

const GROUND_COLOR: Record<Ground, string> = {
  grass: '#86c06a', savanna: '#cdb46c', dirt: '#a8835a', rock: '#9a958c', snow: '#eef2f6', sand: '#e6cf98', jungle: '#4f8a3a', ice: '#dff3ff', mulch: '#7a5a3a',
};
const glassMat = () => new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });

export interface Pool { habitat: string; x: number; z: number; rx: number; rz: number; angle: number; level: number; ring: boolean }
export interface HabitatFrame { def: HabitatDef & { exhibit: string }; x: number; z: number; rx: number; rz: number; angle: number; pool: Pool | null; trees: { x: number; z: number; h: number }[] }
export interface HallFrame { exhibit: ExhibitDef; x: number; z: number; r: number; door: { x: number; z: number }; kind: string; height: number }
export interface PlaceFrame { place: Place; x: number; z: number; y: number; door: { x: number; z: number } }

/** A list of points along a line, and its length, for things that run on it. */
export interface Track { pts: { x: number; z: number }[]; lengths: number[]; total: number }

/** Merges everything static that shares a material into one mesh. */
class Batch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(geo: THREE.BufferGeometry, m: THREE.Material, matrix: THREE.Matrix4) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    g.applyMatrix4(matrix);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const list = this.parts.get(m) ?? [];
    list.push(g);
    this.parts.set(m, list);
    if (g !== geo) void g;
    g = null as unknown as THREE.BufferGeometry;
  }
  build(into: THREE.Object3D, shadows = false) {
    for (const [m, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      into.add(mesh);
    }
    this.parts.clear();
  }
}

const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const V = new THREE.Vector3();
const S3 = new THREE.Vector3();
const E = new THREE.Euler();
function at(x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1) {
  return M4.compose(V.set(x, y, z), Q.setFromEuler(E.set(0, ry, 0)), S3.set(sx, sy, sz));
}

const mats = new Map<string, THREE.MeshStandardMaterial>();
export function flat(color: string, opts: { rough?: number; emissive?: string; intensity?: number; metal?: number } = {}) {
  const key = `${color}|${opts.rough ?? 0.9}|${opts.emissive ?? ''}|${opts.intensity ?? 0}|${opts.metal ?? 0}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.9, metalness: opts.metal ?? 0, flatShading: true, ...(opts.emissive ? { emissive: new THREE.Color(opts.emissive), emissiveIntensity: opts.intensity ?? 1 } : {}) });
    mats.set(key, m);
  }
  return m;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const CYL6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
const CONE = new THREE.ConeGeometry(0.5, 1, 8);
const SPH = new THREE.SphereGeometry(0.5, 10, 7);
const ROCK = new THREE.IcosahedronGeometry(0.5, 0);

/** Text on a board, as a texture. */
export function signTexture(text: string, bg: string, fg: string, w = 512, h = 128, emoji = '') {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.fillStyle = bg;
  x.beginPath();
  x.roundRect(0, 0, w, h, h * 0.18);
  x.fill();
  x.fillStyle = fg;
  let size = h * 0.46;
  x.font = `800 ${size}px ui-sans-serif, system-ui, sans-serif`;
  const label = emoji ? `${emoji} ${text}` : text;
  while (x.measureText(label).width > w * 0.9 && size > 14) { size -= 2; x.font = `800 ${size}px ui-sans-serif, system-ui, sans-serif`; }
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(label, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class ZooWorld {
  readonly group = new THREE.Group();
  readonly habitats = new Map<string, HabitatFrame>();
  readonly halls: HallFrame[] = [];
  readonly places = new Map<string, PlaceFrame>();
  readonly pools: Pool[] = [];
  readonly train: Track;
  readonly paths: { x: number; z: number }[][] = [];
  readonly skyfari: { a: THREE.Vector3; b: THREE.Vector3 };
  /** Glowing lamp heads and windows: brighter after dark. */
  readonly glows: THREE.MeshStandardMaterial[] = [];
  /** Things that move on their own: the carousel, the splash whale, the waterfall. */
  readonly ticks: ((t: number, dt: number) => void)[] = [];
  /** Signs on broken fences, shown while they're broken. */
  readonly brokenSigns = new Map<string, THREE.Object3D>();
  /** Bits that come with an upgrade, shown once it's bought. */
  readonly extras = new Map<string, THREE.Object3D[]>();
  readonly textures: THREE.Texture[] = [];
  /** Where you can walk: a grid a world unit across. */
  private grid: Uint8Array;
  private gx0: number;
  private gz0: number;
  private gw: number;
  private gh: number;
  readonly bounds: { x0: number; x1: number; z0: number; z1: number };

  constructor() {
    const pts = BOUNDARY.map(toWorld);
    const x0 = Math.min(...pts.map((p) => p.x)) - 6, x1 = Math.max(...pts.map((p) => p.x)) + 6;
    const z0 = Math.min(...pts.map((p) => p.z)) - 6, z1 = Math.max(...pts.map((p) => p.z)) + 6;
    this.bounds = { x0, x1, z0, z1 };
    this.gx0 = Math.floor(x0);
    this.gz0 = Math.floor(z0);
    this.gw = Math.ceil(x1 - x0) + 2;
    this.gh = Math.ceil(z1 - z0) + 2;
    this.grid = new Uint8Array(this.gw * this.gh);

    // Habitats and their pools first: the ground is carved for them.
    for (const h of HABITATS) {
      const c = toWorld(h.at);
      const angle = h.angle ?? 0;
      let pool: Pool | null = null;
      if (h.pool || h.moat) {
        const share = h.moat ? 1.32 : h.pool!;
        // A pool smaller than its yard sits off to one side, so there's room to walk around it.
        const off = h.moat || share >= 0.9 ? 0 : (1 - share) * 0.55;
        const ox = Math.cos(angle) * off * h.rx * K, oz = Math.sin(angle) * off * h.rx * K;
        pool = { habitat: h.id, x: c.x + ox, z: c.z + oz, rx: h.rx * K * share, rz: h.ry * K * share, angle, level: heightAt(c.x, c.z) - 0.45, ring: Boolean(h.moat) };
        this.pools.push(pool);
      }
      this.habitats.set(h.id, { def: h, x: c.x, z: c.z, rx: h.rx * K, rz: h.ry * K, angle, pool, trees: [] });
    }
    for (const e of EXHIBITS) if (e.hall) {
      const c = toWorld(e.hall.at);
      const r = e.hall.r * K;
      this.halls.push({ exhibit: e, x: c.x, z: c.z, r, door: { x: c.x + Math.cos(e.hall.door) * (r + 2.5), z: c.z + Math.sin(e.hall.door) * (r + 2.5) }, kind: e.hall.kind, height: e.hall.height });
    }
    for (const p of PLACES) {
      const c = toWorld(p.at);
      this.places.set(p.id, { place: p, x: c.x, z: c.z, y: this.groundAt(c.x, c.z), door: { x: c.x, z: c.z + p.r * K + 2 } });
    }
    for (const line of PATHS) this.paths.push(line.map(toWorld));
    // Doors face the nearest path.
    for (const pf of this.places.values()) {
      if (!pf.place.r) { pf.door = { x: pf.x, z: pf.z }; continue; }
      const n = this.nearestPath(pf.x, pf.z);
      const dx = n.x - pf.x, dz = n.z - pf.z, d = Math.hypot(dx, dz) || 1;
      const rr = pf.place.r * K + 1.8;
      pf.door = { x: pf.x + (dx / d) * rr, z: pf.z + (dz / d) * rr };
    }

    const tp = TRAIN.map(toWorld);
    const lengths = loopLengths(tp);
    this.train = { pts: tp, lengths, total: lengths[lengths.length - 1] };
    const sa = toWorld(SKYFARI[0]), sb = toWorld(SKYFARI[1]);
    this.skyfari = { a: new THREE.Vector3(sa.x, this.groundAt(sa.x, sa.z) + 13, sa.z), b: new THREE.Vector3(sb.x, this.groundAt(sb.x, sb.z) + 13, sb.z) };

    this.buildGrid();
    this.buildGround();
    this.buildWater();
    const batch = new Batch();
    this.buildPaths(batch);
    this.buildFences(batch);
    this.buildHabitatInsides(batch);
    this.buildHalls(batch);
    this.buildPlaces(batch);
    this.buildTrack(batch);
    this.buildSkyfari(batch);
    this.buildEdge(batch);
    batch.build(this.group, true);
    this.buildTrees();
    this.buildLamps();
  }

  // ---------- The rules of the ground ----------

  /** How high the ground is here, with the pools dug out of it. */
  groundAt(x: number, z: number) {
    let h = heightAt(x, z);
    for (const p of this.pools) {
      const d = this.poolD(p, x, z);
      if (d > 1.25) continue;
      const bottom = p.level - 1.4 * Math.max(0, 1 - d * d) - 0.25;
      const k = THREE.MathUtils.smoothstep(d, 0.8, 1.2);
      h = bottom * (1 - k) + Math.min(h, Math.max(h, p.level + 0.25)) * k;
    }
    return h;
  }
  private poolD(p: Pool, x: number, z: number) {
    const dx = x - p.x, dz = z - p.z;
    const c = Math.cos(-p.angle), s = Math.sin(-p.angle);
    const ux = dx * c - dz * s, uz = dx * s + dz * c;
    return Math.hypot(ux / p.rx, uz / p.rz);
  }
  /** The water's surface here, if it's wet. */
  waterAt(x: number, z: number) {
    for (const p of this.pools) {
      const d = this.poolD(p, x, z);
      if (p.ring ? d < 1 && d > 0.76 : d < 1) return p.level;
    }
    return null;
  }
  /** Where something is in a habitat: below 1 is inside. */
  habitatD(f: HabitatFrame, x: number, z: number) {
    return ellipseD(f.def, toPx(x, z));
  }
  habitatAt(x: number, z: number) {
    for (const f of this.habitats.values()) if (this.habitatD(f, x, z) < 1) return f;
    return null;
  }
  walkable(x: number, z: number) {
    const i = Math.floor(x) - this.gx0, j = Math.floor(z) - this.gz0;
    if (i < 0 || j < 0 || i >= this.gw || j >= this.gh) return false;
    return this.grid[j * this.gw + i] === 0;
  }
  /** Inside a building's walls (a shop, a station, a house), where the camera mustn't go. */
  solidAt(x: number, z: number) {
    for (const pf of this.places.values()) {
      const k = pf.place.kind;
      if (k === 'entrance' || k === 'play' || k === 'show' || !pf.place.r) continue;
      if (Math.hypot(x - pf.x, z - pf.z) < pf.place.r * K * 1.25) return true;
    }
    for (const h of this.halls) if (h.kind === 'house' && Math.hypot(x - h.x, z - h.z) < h.r + 1.5) return true;
    return false;
  }
  /** Inside the zoo's fence. */
  inZoo(x: number, z: number) { return inside(BOUNDARY, toPx(x, z)); }
  nearestWalkable(x: number, z: number) {
    for (let r = 1; r < 60; r++) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (this.walkable(px, pz)) return { x: px, z: pz };
      }
    }
    const e = toWorld([700, 880]);
    return { x: e.x, z: e.z };
  }
  nearestPath(x: number, z: number) {
    let best = { x, z, d: Infinity };
    for (const line of this.paths) for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L));
      const px = a.x + dx * t, pz = a.z + dz * t, d = Math.hypot(px - x, pz - z);
      if (d < best.d) best = { x: px, z: pz, d };
    }
    return best;
  }

  private buildGrid() {
    const poly = BOUNDARY;
    for (let j = 0; j < this.gh; j++) for (let i = 0; i < this.gw; i++) {
      const x = this.gx0 + i + 0.5, z = this.gz0 + j + 0.5;
      const p = toPx(x, z);
      let blocked = !inside(poly, p);
      if (!blocked) {
        for (const f of this.habitats.values()) {
          if (Math.abs(x - f.x) > f.rx * 1.45 + 2 && Math.abs(z - f.z) > f.rz * 1.45 + 2) continue;
          const d = ellipseD(f.def, p);
          if (f.def.walkIn) { if (f.pool && this.poolD(f.pool, x, z) < 1.05) { blocked = true; break; } continue; }
          const reach = f.def.moat ? 1.36 : 1.06;
          if (d < reach) { blocked = true; break; }
        }
      }
      if (!blocked) for (const h of this.halls) {
        const d = Math.hypot(x - h.x, z - h.z);
        if (h.kind === 'house') { if (d < h.r + 0.6) { blocked = true; break; } continue; }
        if (d < h.r + 0.9) { blocked = true; break; }
      }
      if (!blocked) for (const pf of this.places.values()) {
        if (pf.place.kind === 'entrance' || pf.place.kind === 'play' || pf.place.kind === 'show' || !pf.place.r) continue;
        const r = pf.place.r * K;
        if (Math.abs(x - pf.x) < r && Math.abs(z - pf.z) < r && Math.hypot(x - pf.x, z - pf.z) < r * 0.9) { blocked = true; break; }
      }
      if (!blocked && this.pools.some((p) => !this.habitats.get(p.habitat)!.def.walkIn && p.ring === false && this.poolD(p, x, z) < 1)) blocked = true;
      this.grid[j * this.gw + i] = blocked ? 1 : 0;
    }
  }

  // ---------- Building it ----------

  private buildGround() {
    const { x0, x1, z0, z1 } = this.bounds;
    const pad = 130;
    const W = x1 - x0 + pad * 2, D = z1 - z0 + pad * 2;
    const step = 3.2;
    const geo = new THREE.PlaneGeometry(W, D, Math.round(W / step), Math.round(D / step));
    geo.rotateX(-Math.PI / 2);
    geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color(), tmp = new THREE.Color();
    const out = new THREE.Color('#4a7a38'), grass = new THREE.Color('#7fb35c'), plaza = new THREE.Color('#d9cdb4');
    const entrance = toWorld([700, 880]);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const p = toPx(x, z);
      const inZoo = inside(BOUNDARY, p);
      let y = this.groundAt(x, z);
      if (!inZoo) {
        // Beyond the fence: rolling woods that climb a little, so the zoo sits in a bowl.
        const dEdge = Math.min(Math.abs(x - x0), Math.abs(x - x1), Math.abs(z - z0), Math.abs(z - z1));
        const outside = x < x0 || x > x1 || z < z0 || z > z1 ? Math.min(1, Math.max(0, 1 - dEdge / 120)) : 0;
        y += outside * 0 + (x < x0 || x > x1 || z < z0 || z > z1 ? Math.min(24, (Math.max(x0 - x, x - x1, z0 - z, z - z1, 0)) * 0.12) : 0);
        c.copy(out).offsetHSL(0, 0, (Math.sin(x * 0.3) * Math.cos(z * 0.27)) * 0.03);
      } else {
        c.copy(grass).offsetHSL((Math.sin(x * 0.05 + z * 0.03)) * 0.02, 0, (Math.sin(x * 0.4) * Math.cos(z * 0.37)) * 0.035);
        const f = this.habitatAt(x, z);
        if (f) {
          const d = this.habitatD(f, x, z);
          tmp.set(GROUND_COLOR[f.def.ground]).offsetHSL(0, 0, (Math.sin(x * 0.7) * Math.cos(z * 0.6)) * 0.03);
          c.lerp(tmp, THREE.MathUtils.smoothstep(1 - d, 0, 0.12));
        }
        for (const h of this.halls) {
          const d = Math.hypot(x - h.x, z - h.z);
          if (d < h.r) {
            if (h.kind === 'dome') c.set('#e3c58d').offsetHSL(0, 0, Math.sin(x * 0.5 + z * 0.3) * 0.04);
            else if (h.kind === 'jungle') c.set('#3f7a30');
            else if (h.kind === 'glass') c.set('#cfd5dc');
          }
        }
        const de = Math.hypot(x - entrance.x, z - entrance.z);
        if (de < 16) c.lerp(plaza, THREE.MathUtils.smoothstep(16 - de, 0, 3));
      }
      if (this.waterAt(x, z) !== null) c.set('#6b8a5a');
      pos.setY(i, y);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: false }));
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
  }

  private waterMat = new THREE.MeshStandardMaterial({ color: '#3a9ad0', roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.82, side: THREE.DoubleSide, emissive: new THREE.Color('#1a5a8a'), emissiveIntensity: 0.18 });
  private buildWater() {
    for (const p of this.pools) {
      const shape = new THREE.Shape();
      const n = 48;
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2;
        const ux = Math.cos(a) * p.rx, uz = Math.sin(a) * p.rz;
        const x = ux * Math.cos(p.angle) - uz * Math.sin(p.angle), z = ux * Math.sin(p.angle) + uz * Math.cos(p.angle);
        if (k === 0) shape.moveTo(x, z); else shape.lineTo(x, z);
      }
      if (p.ring) {
        const hole = new THREE.Path();
        for (let k = 0; k <= n; k++) {
          const a = -(k / n) * Math.PI * 2;
          const ux = Math.cos(a) * p.rx * 0.76, uz = Math.sin(a) * p.rz * 0.76;
          const x = ux * Math.cos(p.angle) - uz * Math.sin(p.angle), z = ux * Math.sin(p.angle) + uz * Math.cos(p.angle);
          if (k === 0) hole.moveTo(x, z); else hole.lineTo(x, z);
        }
        shape.holes.push(hole);
      }
      const geo = new THREE.ShapeGeometry(shape, 2);
      geo.rotateX(Math.PI / 2);
      const m = new THREE.Mesh(geo, this.waterMat);
      m.position.set(p.x, p.level, p.z);
      m.renderOrder = 1;
      this.group.add(m);
    }
    // The water shimmers.
    this.ticks.push((t) => { this.waterMat.emissiveIntensity = 0.16 + Math.sin(t * 1.3) * 0.04; });
  }

  private buildPaths(b: Batch) {
    // Their own materials, two-sided: the strips are built without caring which way they wind.
    const m = new THREE.MeshStandardMaterial({ color: '#e9dcc0', roughness: 0.95, side: THREE.DoubleSide });
    const edge = new THREE.MeshStandardMaterial({ color: '#c9b994', roughness: 0.95, side: THREE.DoubleSide });
    for (const line of this.paths) {
      const verts: number[] = [];
      const edgeVerts: number[] = [];
      const pts: { x: number; z: number }[] = [];
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], c = line[i];
        const L = Math.hypot(c.x - a.x, c.z - a.z), n = Math.max(1, Math.ceil(L / 1.6));
        for (let k = i === 1 ? 0 : 1; k <= n; k++) pts.push({ x: a.x + ((c.x - a.x) * k) / n, z: a.z + ((c.z - a.z) * k) / n });
      }
      const w = 2.3;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], c = pts[i];
        const dx = c.x - a.x, dz = c.z - a.z, L = Math.hypot(dx, dz) || 1;
        const nx = -dz / L, nz = dx / L;
        const quad = (out: number[], w0: number, w1: number, lift: number) => {
          const ya = this.groundAt(a.x, a.z) + lift, yc = this.groundAt(c.x, c.z) + lift;
          const A = [a.x + nx * w0, ya, a.z + nz * w0], B = [a.x + nx * w1, ya, a.z + nz * w1], C = [c.x + nx * w0, yc, c.z + nz * w0], D = [c.x + nx * w1, yc, c.z + nz * w1];
          out.push(...A, ...C, ...B, ...B, ...C, ...D);
        };
        quad(verts, -w, w, 0.16);
        quad(edgeVerts, -w - 0.35, -w, 0.13);
        quad(edgeVerts, w, w + 0.35, 0.13);
      }
      // Round off the ends and the joins with a disc at each corner.
      for (const p of line) {
        const disc = new THREE.CircleGeometry(w, 14);
        disc.rotateX(-Math.PI / 2);
        b.add(disc, m, at(p.x, this.groundAt(p.x, p.z) + 0.17, p.z));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      g.computeVertexNormals();
      b.add(g, m, new THREE.Matrix4());
      const ge = new THREE.BufferGeometry();
      ge.setAttribute('position', new THREE.Float32BufferAttribute(edgeVerts, 3));
      ge.computeVertexNormals();
      b.add(ge, edge, new THREE.Matrix4());
    }
  }

  /** The fence (or wall, or glass) around each habitat. */
  private buildFences(b: Batch) {
    for (const f of this.habitats.values()) {
      const h = f.def;
      if (h.walkIn) { this.netting(b, f); continue; }
      const ex = EXHIBITS.find((e) => e.id === h.exhibit)!;
      const reach = h.moat ? 1.36 : 1.02;
      const per = 2 * Math.PI * Math.sqrt((f.rx * f.rx + f.rz * f.rz) / 2) * reach;
      const n = Math.max(10, Math.round(per / (h.tank ? 1.6 : 2.6)));
      const stone = ex.region === 'Asia' || h.ground === 'rock' || h.ground === 'snow';
      const glass = h.tank || h.id === 'sealions' || h.id === 'penguins' || h.id === 'stingrays';
      const post = flat(stone ? '#8d8478' : glass ? '#5a6878' : '#7a5636');
      const rail = flat(stone ? '#a09686' : '#9a7048');
      const ring: { x: number; y: number; z: number }[] = [];
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2;
        const ux = Math.cos(a) * f.rx * reach, uz = Math.sin(a) * f.rz * reach;
        const x = f.x + ux * Math.cos(f.angle) - uz * Math.sin(f.angle), z = f.z + ux * Math.sin(f.angle) + uz * Math.cos(f.angle);
        ring.push({ x, y: this.groundAt(x, z), z });
      }
      const height = h.tank ? 1.3 : stone ? 1.1 : 1.25;
      for (let k = 0; k < n; k++) {
        const p = ring[k], q = ring[k + 1];
        const len = Math.hypot(q.x - p.x, q.z - p.z);
        const ry = Math.atan2(q.x - p.x, q.z - p.z);
        const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2, my = (p.y + q.y) / 2;
        if (stone) {
          b.add(BOX, post, at(mx, my + height / 2 - 0.2, mz, ry, 0.55, height + 0.4, len + 0.1));
        } else {
          b.add(CYL6, post, at(p.x, p.y + height / 2, p.z, 0, 0.16, height, 0.16));
          b.add(BOX, rail, at(mx, my + height * 0.92, mz, ry, 0.08, 0.1, len));
          b.add(BOX, rail, at(mx, my + height * 0.5, mz, ry, 0.08, 0.1, len));
        }
      }
      if (glass && !h.tank) {
        // A glass wall on the visitors’ side so little ones can see.
        const g = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 40, 1, true), glassMat());
        g.scale.set(f.rx * reach, 1.6, f.rz * reach);
        g.rotation.y = -f.angle;
        g.position.set(f.x, heightAt(f.x, f.z) + 0.8, f.z);
        this.group.add(g);
      }
      // A "Keepers fixing it" sign, for when it's broken.
      const sign = new THREE.Group();
      const near = ring[Math.floor(n * 0.25)];
      const tex = signTexture('Fence broken!', '#f59e0b', '#1c1917', 512, 128, '🔧');
      this.textures.push(tex);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      board.position.y = 1.9;
      sign.add(board);
      for (const s of [-1, 1]) { const leg = new THREE.Mesh(BOX, flat('#f59e0b')); leg.scale.set(0.1, 1.9, 0.1); leg.position.set(s * 1, 0.95, 0); sign.add(leg); }
      // Orange cones.
      for (const s of [-1.8, 1.8]) { const cone = new THREE.Mesh(CONE, flat('#f97316')); cone.scale.set(0.4, 0.6, 0.4); cone.position.set(s, 0.3, 0.3); sign.add(cone); }
      sign.position.set(near.x, near.y, near.z);
      sign.lookAt(f.x, near.y, f.z);
      sign.rotateY(Math.PI);
      sign.visible = false;
      this.group.add(sign);
      this.brokenSigns.set(h.id, sign);
    }
  }

  /** The aviary's net and the walk-in gardens' low hedges. */
  private netting(b: Batch, f: HabitatFrame) {
    const h = f.def;
    const tall = h.id === 'aviary';
    if (!tall) {
      // A low hedge with gaps to walk through.
      const n = 26;
      for (let k = 0; k < n; k++) {
        if (k % 6 === 0) continue;
        const a = (k / n) * Math.PI * 2;
        const ux = Math.cos(a) * f.rx, uz = Math.sin(a) * f.rz;
        const x = f.x + ux * Math.cos(f.angle) - uz * Math.sin(f.angle), z = f.z + ux * Math.sin(f.angle) + uz * Math.cos(f.angle);
        b.add(SPH, flat('#4f8f45'), at(x, this.groundAt(x, z) + 0.45, z, 0, 1.4, 0.9, 1.4));
      }
      return;
    }
    const n = 14;
    const H = 9;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const ux = Math.cos(a) * f.rx, uz = Math.sin(a) * f.rz;
      const x = f.x + ux * Math.cos(f.angle) - uz * Math.sin(f.angle), z = f.z + ux * Math.sin(f.angle) + uz * Math.cos(f.angle);
      b.add(CYL6, flat('#5a6470'), at(x, this.groundAt(x, z) + H / 2, z, 0, 0.3, H, 0.3));
    }
    const net = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#2a3440', wireframe: true, transparent: true, opacity: 0.22, depthWrite: false }));
    net.scale.set(f.rx * 1.02, H + 3, f.rz * 1.02);
    net.rotation.y = -f.angle;
    net.position.set(f.x, heightAt(f.x, f.z) - 1, f.z);
    this.group.add(net);
  }

  /** Inside each habitat: rocks, a few trees, a climbing frame. */
  private buildHabitatInsides(b: Batch) {
    for (const f of this.habitats.values()) {
      const h = f.def;
      const r = rng(f.def.id.length * 977 + Math.round(f.x * 13));
      const spot = (max = 0.78) => {
        for (let k = 0; k < 20; k++) {
          const a = r() * Math.PI * 2, d = Math.sqrt(r()) * max;
          const ux = Math.cos(a) * f.rx * d, uz = Math.sin(a) * f.rz * d;
          const x = f.x + ux * Math.cos(f.angle) - uz * Math.sin(f.angle), z = f.z + ux * Math.sin(f.angle) + uz * Math.cos(f.angle);
          if (!f.pool || this.poolD(f.pool, x, z) > 1.15) return { x, z };
        }
        return { x: f.x, z: f.z };
      };
      const rockColor = h.ground === 'snow' ? '#c9cdd4' : h.ground === 'sand' || h.ground === 'savanna' ? '#b39a72' : '#8d8a84';
      for (let i = 0; i < (h.rocks ?? 0); i++) {
        const p = spot();
        const s = (h.tank ? 0.8 : 1.6) + r() * (h.tank ? 0.8 : 2.2);
        b.add(ROCK, flat(rockColor), at(p.x, this.groundAt(p.x, p.z) + s * 0.18, p.z, r() * 6, s * 1.4, s * 0.8, s * 1.2));
        if (h.id === 'lions' && i === 0) {
          // Pride Rock.
          b.add(ROCK, flat('#a08a68'), at(p.x, this.groundAt(p.x, p.z) + 1.2, p.z, 0.6, 7, 3.4, 5));
        }
      }
      for (let i = 0; i < (h.trees ?? 0); i++) {
        const p = spot(0.7);
        const tall = h.ground === 'jungle' || h.climb ? 1.35 : 1;
        f.trees.push({ x: p.x, z: p.z, h: (4.2 + r() * 2.5) * tall });
      }
      if (h.climb && !h.tank) {
        // Poles, platforms and ropes.
        const p = spot(0.5);
        const y = this.groundAt(p.x, p.z);
        const big = h.id === 'orangutans';
        const H = big ? 14 : 6;
        for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [0, 1.8]]) b.add(CYL6, flat('#7a5636'), at(p.x + dx, y + H / 2, p.z + dz, 0, 0.35, H, 0.35));
        b.add(CYL, flat('#9a7048'), at(p.x, y + H * 0.62, p.z, 0, 4.6, 0.2, 4.6));
        b.add(CYL, flat('#9a7048'), at(p.x, y + H * 0.95, p.z, 0, 3.6, 0.2, 3.6));
        if (big) for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2;
          const tx = f.x + Math.cos(a) * f.rx * 0.65, tz = f.z + Math.sin(a) * f.rz * 0.65;
          b.add(CYL6, flat('#7a5636'), at(tx, this.groundAt(tx, tz) + H / 2, tz, 0, 0.4, H, 0.4));
          // A rope from the middle out to each pole.
          const mx = (tx + p.x) / 2, mz = (tz + p.z) / 2, L = Math.hypot(tx - p.x, tz - p.z);
          const rope = new THREE.Mesh(CYL6, flat('#c8b088'));
          rope.scale.set(0.12, L, 0.12);
          rope.position.set(mx, y + H * 0.85, mz);
          rope.lookAt(tx, y + H * 0.85, tz);
          rope.rotateX(Math.PI / 2);
          rope.updateMatrix();
          b.add(CYL6, flat('#c8b088'), rope.matrix);
        }
      }
      // Tanks: a glass box and a stand under it.
      if (h.tank) {
        const H = h.pool && h.pool >= 1 ? 3.2 : 2.2;
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 32, 1, true), glassMat());
        tank.scale.set(f.rx * 1.02, H, f.rz * 1.02);
        tank.rotation.y = -f.angle;
        tank.position.set(f.x, heightAt(f.x, f.z) + H / 2 - 0.2, f.z);
        this.group.add(tank);
      }
      if (h.ground === 'ice') b.add(CYL, flat('#f4fbff'), at(f.x - f.rx * 0.4, this.groundAt(f.x, f.z) + 0.6, f.z, 0, f.rx * 0.9, 1.2, f.rz * 0.9));
    }
  }

  /** The Desert Dome, the Lied Jungle, the glass halls, the night houses. */
  private buildHalls(b: Batch) {
    for (const h of this.halls) {
      const y = heightAt(h.x, h.z);
      const doorA = h.exhibit.hall!.door;
      if (h.kind === 'dome') {
        // A geodesic dome: glass panes on a white frame.
        const ico = new THREE.IcosahedronGeometry(1, 3).toNonIndexed();
        const pos = ico.getAttribute('position');
        const keep: number[] = [];
        for (let i = 0; i < pos.count; i += 3) {
          if (pos.getY(i) > -0.02 && pos.getY(i + 1) > -0.02 && pos.getY(i + 2) > -0.02) for (let k = 0; k < 3; k++) keep.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
        }
        const half = new THREE.BufferGeometry();
        half.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
        half.computeVertexNormals();
        const shell = new THREE.Mesh(half, glassMat());
        shell.scale.set(h.r, h.height, h.r);
        shell.position.set(h.x, y - 1.5, h.z);
        shell.renderOrder = 2;
        this.group.add(shell);
        const frame = new THREE.LineSegments(new THREE.EdgesGeometry(half, 1), new THREE.LineBasicMaterial({ color: '#f4f4f0', transparent: true, opacity: 0.75 }));
        frame.scale.copy(shell.scale);
        frame.position.copy(shell.position);
        this.group.add(frame);
        // Dunes and a canyon wall inside.
        const r = rng(7);
        for (let i = 0; i < 9; i++) {
          const a = r() * Math.PI * 2, d = h.r * (0.55 + r() * 0.35);
          b.add(SPH, flat('#e8c98e'), at(h.x + Math.cos(a) * d, y - 0.6, h.z + Math.sin(a) * d, r() * 3, 8 + r() * 5, 1.6 + r() * 1.2, 5 + r() * 3));
        }
        b.add(ROCK, flat('#c0743c'), at(h.x - h.r * 0.55, y + 3, h.z - h.r * 0.25, 0.4, 10, 10, 8));
        b.add(ROCK, flat('#b8693a'), at(h.x - h.r * 0.25, y + 2, h.z - h.r * 0.6, 1.4, 8, 7, 6));
        // Cactus.
        for (let i = 0; i < 12; i++) {
          const a = r() * Math.PI * 2, d = h.r * (0.25 + r() * 0.6);
          const cx = h.x + Math.cos(a) * d, cz = h.z + Math.sin(a) * d;
          if (!this.walkable(cx, cz) && !this.habitatAt(cx, cz)) continue;
          const cy = this.groundAt(cx, cz), ch = 1.4 + r() * 2.2;
          b.add(CYL, flat('#4f8a4a'), at(cx, cy + ch / 2, cz, 0, 0.5, ch, 0.5));
          b.add(CYL, flat('#4f8a4a'), at(cx + 0.45, cy + ch * 0.6, cz, 0, 0.32, ch * 0.4, 0.32));
        }
      } else if (h.kind === 'jungle' || h.kind === 'glass') {
        const wallH = h.kind === 'jungle' ? 4.5 : 3.4;
        // Walls all round but the door.
        const n = 28;
        for (let k = 0; k < n; k++) {
          const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
          const am = (a0 + a1) / 2;
          let da = am - doorA;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          if (Math.abs(da) * h.r < 3) continue;
          const x = h.x + Math.cos(am) * h.r, z = h.z + Math.sin(am) * h.r;
          const len = 2 * h.r * Math.sin((a1 - a0) / 2) + 0.1;
          const gy = this.groundAt(x, z);
          b.add(BOX, flat(h.kind === 'jungle' ? '#8a6a4a' : '#b8c4d0'), at(x, gy + 0.4, z, -am + Math.PI / 2, 0.6, 0.8, len));
          if (h.kind === 'jungle') b.add(BOX, flat('#6a5a48'), at(x, gy + wallH / 2, z, -am + Math.PI / 2, 0.25, wallH, 0.2));
        }
        const roof = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), glassMat());
        roof.scale.set(h.r, h.height, h.r);
        roof.position.set(h.x, y + wallH - 2, h.z);
        roof.renderOrder = 2;
        this.group.add(roof);
        const ribs = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.SphereGeometry(1, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2), 1), new THREE.LineBasicMaterial({ color: h.kind === 'jungle' ? '#3a4a3a' : '#e8eef4', transparent: true, opacity: 0.7 }));
        ribs.scale.copy(roof.scale);
        ribs.position.copy(roof.position);
        this.group.add(ribs);
        if (h.kind === 'jungle') {
          // A waterfall at the back, falling into a pool.
          const back = doorA + Math.PI;
          const wx = h.x + Math.cos(back) * h.r * 0.7, wz = h.z + Math.sin(back) * h.r * 0.7;
          const wy = this.groundAt(wx, wz);
          b.add(ROCK, flat('#6a6a64'), at(wx, wy + 6, wz, back, 12, 14, 7));
          const fall = this.waterfall();
          fall.position.set(wx - Math.cos(back) * 3.6, wy + 6, wz - Math.sin(back) * 3.6);
          fall.lookAt(h.x, wy + 6, h.z);
          this.group.add(fall);
          const pool = new THREE.Mesh(new THREE.CircleGeometry(5, 24), this.waterMat);
          pool.rotation.x = -Math.PI / 2;
          pool.position.set(wx - Math.cos(back) * 6, wy + 0.15, wz - Math.sin(back) * 6);
          this.group.add(pool);
        }
      } else {
        // A house you look into: solid walls, a roof, a door and a sign.
        const night = h.exhibit.id === 'night';
        b.add(CYL, flat(night ? '#3a3350' : '#8a6a4a'), at(h.x, y + h.height / 2, h.z, 0, h.r * 2, h.height, h.r * 2));
        b.add(CONE, flat(night ? '#251f3a' : '#5a7a3a'), at(h.x, y + h.height + 1.2, h.z, 0, h.r * 2.3, 2.6, h.r * 2.3));
        const dx = h.x + Math.cos(doorA) * (h.r + 0.05), dz = h.z + Math.sin(doorA) * (h.r + 0.05);
        b.add(BOX, flat('#1a1424'), at(dx, y + 1.3, dz, -doorA + Math.PI / 2, 0.2, 2.6, 2));
      }
      // The name over the door.
      const tex = signTexture(h.exhibit.name, h.kind === 'dome' ? '#b45309' : h.exhibit.id === 'night' ? '#312e81' : h.kind === 'jungle' ? '#166534' : '#0e7490', '#ffffff', 768, 128, h.exhibit.emoji);
      this.textures.push(tex);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(14, h.r * 0.8), Math.min(14, h.r * 0.8) / 6), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      const sx = h.x + Math.cos(doorA) * (h.r + 1.2), sz = h.z + Math.sin(doorA) * (h.r + 1.2);
      sign.position.set(sx, this.groundAt(sx, sz) + (h.kind === 'house' ? h.height + 0.6 : 8.5), sz);
      sign.lookAt(sx + Math.cos(doorA), sign.position.y, sz + Math.sin(doorA));
      this.group.add(sign);
      // An arch at the door.
      for (const s of [-1, 1]) {
        const px = sx + Math.cos(doorA + Math.PI / 2) * s * 3.2, pz = sz + Math.sin(doorA + Math.PI / 2) * s * 3.2;
        if (h.kind !== 'house') b.add(CYL6, flat('#4a4458'), at(px, this.groundAt(px, pz) + 4.3, pz, 0, 0.35, 8.6, 0.35));
      }
    }
  }

  private waterfall() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const x = c.getContext('2d')!;
    for (let i = 0; i < 90; i++) {
      x.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.5})`;
      x.fillRect(Math.random() * 64, Math.random() * 256, 2 + Math.random() * 4, 20 + Math.random() * 50);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    this.textures.push(tex);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 12), new THREE.MeshBasicMaterial({ map: tex, color: '#bfe6ff', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    this.ticks.push((t) => { tex.offset.y = t * 1.4; });
    return m;
  }

  /** Shops, cafés, stations, the carousel, the splash park, the entrance gate. */
  private buildPlaces(b: Batch) {
    for (const pf of this.places.values()) {
      const p = pf.place;
      const r = p.r * K;
      const y = this.groundAt(pf.x, pf.z);
      const face = Math.atan2(pf.door.x - pf.x, pf.door.z - pf.z);
      const roofs: Record<string, string> = { food: '#dc2626', building: '#6b4f3a', station: '#7c2d12', ride: '#7c3aed', show: '#0f766e' };
      if (p.kind === 'entrance') { this.gate(b, pf); continue; }
      if (p.id === 'carousel') { this.carousel(pf); continue; }
      if (p.id === 'splash') { this.splash(b, pf); continue; }
      if (p.id === 'sundial') {
        b.add(CYL, flat('#d6cfc2'), at(pf.x, y + 0.2, pf.z, 0, 6, 0.4, 6));
        const g = new THREE.Mesh(BOX, flat('#7a6a5a'));
        g.scale.set(0.3, 3, 2.4);
        g.position.set(pf.x, y + 1.6, pf.z);
        g.rotation.z = 0.6;
        g.updateMatrix();
        b.add(BOX, flat('#7a6a5a'), g.matrix);
        continue;
      }
      if (p.id === 'skyfari' || p.id === 'skyfari-top') {
        b.add(BOX, flat('#334155'), at(pf.x, y + 1, pf.z, face, r * 1.6, 2, r * 1.6));
        b.add(BOX, flat('#7c3aed'), at(pf.x, y + 4.2, pf.z, face, r * 1.8, 0.4, r * 1.8));
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add(CYL6, flat('#475569'), at(pf.x + dx * r * 0.7, y + 2.6, pf.z + dz * r * 0.7, 0, 0.3, 3.4, 0.3));
        this.sign(pf, p.name, '#7c3aed', 5.2);
        continue;
      }
      if (p.kind === 'station') {
        b.add(BOX, flat('#a8a29e'), at(pf.x, y + 0.4, pf.z, face, r * 2.2, 0.8, r * 1.1));
        b.add(BOX, flat('#7c2d12'), at(pf.x, y + 4, pf.z, face, r * 2.4, 0.4, r * 1.4));
        for (const s of [-1, 1]) b.add(CYL6, flat('#57534e'), at(pf.x + Math.cos(face) * s * r, y + 2.2, pf.z - Math.sin(face) * s * r, 0, 0.3, 3.6, 0.3));
        this.sign(pf, p.name, '#7c2d12', 5);
        continue;
      }
      const H = p.kind === 'food' ? 3.4 : p.kind === 'show' ? 1.2 : 5 + r * 0.15;
      if (p.id === 'giraffe-encounter') {
        // A deck up at giraffe height, on posts, with a railing and a lettuce bucket.
        const top = y + 3.4;
        b.add(BOX, flat('#9a6b45'), at(pf.x, top, pf.z, face, r * 2.2, 0.3, r * 2.2));
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add(CYL6, flat('#7a5636'), at(pf.x + dx * r, y + 1.7, pf.z + dz * r, 0, 0.35, 3.4, 0.35));
        for (const s of [-1, 1]) {
          b.add(BOX, flat('#7a5636'), at(pf.x + Math.cos(face) * s * r * 1.05, top + 0.6, pf.z - Math.sin(face) * s * r * 1.05, face, 0.15, 0.15, r * 2.2));
          b.add(BOX, flat('#7a5636'), at(pf.x + Math.sin(face) * s * r * 1.05, top + 0.6, pf.z + Math.cos(face) * s * r * 1.05, face + Math.PI / 2, 0.15, 0.15, r * 2.2));
        }
        // Stairs up from the path.
        for (let k = 0; k < 8; k++) {
          const d = r * 1.1 + k * 0.55;
          b.add(BOX, flat('#a87a50'), at(pf.x + Math.sin(face) * d, y + 3.2 - k * 0.42, pf.z + Math.cos(face) * d, face, 1.8, 0.2, 0.55));
        }
        b.add(CYL, flat('#65a30d'), at(pf.x, top + 0.5, pf.z, 0, 0.9, 0.7, 0.9));
        this.sign(pf, pf.place.name, '#0f766e', 5.2);
        continue;
      }
      if (p.kind === 'show') {
        // Amphitheater steps.
        for (let k = 0; k < 3; k++) b.add(CYL, flat('#b8a88a'), at(pf.x, y + 0.2 + k * 0.4, pf.z, 0, (r - k * 1.4) * 2, 0.4, (r - k * 1.4) * 2));
        this.sign(pf, p.name, '#0f766e', 3);
        continue;
      }
      b.add(BOX, flat(p.kind === 'food' ? '#fde68a' : '#d6c7a8'), at(pf.x, y + H / 2, pf.z, face, r * 1.5, H, r * 1.5));
      b.add(CONE, flat(roofs[p.kind] ?? '#6b4f3a'), at(pf.x, y + H + 1.1, pf.z, face + Math.PI / 4, r * 2.4, 2.2, r * 2.4));
      // Windows that light up at night.
      const win = flat('#3d4566', { emissive: '#ffd88a', intensity: 0 });
      this.glows.push(win);
      b.add(BOX, win, at(pf.x + Math.sin(face) * r * 0.76, y + H * 0.55, pf.z + Math.cos(face) * r * 0.76, face, r * 1.1, H * 0.35, 0.05));
      if (p.kind === 'food') {
        // Umbrella tables out front.
        for (const s of [-1, 1]) {
          const tx = pf.x + Math.sin(face) * (r + 2.5) + Math.cos(face) * s * 2.4, tz = pf.z + Math.cos(face) * (r + 2.5) - Math.sin(face) * s * 2.4;
          const ty = this.groundAt(tx, tz);
          b.add(CYL, flat('#f5f5f4'), at(tx, ty + 0.45, tz, 0, 1.2, 0.08, 1.2));
          b.add(CYL6, flat('#57534e'), at(tx, ty + 1.2, tz, 0, 0.08, 2.4, 0.08));
          b.add(CONE, flat(s < 0 ? '#f97316' : '#22c55e'), at(tx, ty + 2.5, tz, 0, 2.6, 0.7, 2.6));
        }
      }
      this.sign(pf, p.name, roofs[p.kind] ?? '#6b4f3a', H + 0.4);
    }
  }

  private sign(pf: PlaceFrame, text: string, bg: string, y: number) {
    const tex = signTexture(text, bg, '#ffffff', 512, 96, pf.place.emoji);
    this.textures.push(tex);
    const w = Math.min(9, 3 + text.length * 0.18);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 96 / 512), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    const face = Math.atan2(pf.door.x - pf.x, pf.door.z - pf.z);
    const r = pf.place.r * K;
    sign.position.set(pf.x + Math.sin(face) * (r * 0.78 + 0.1), this.groundAt(pf.x, pf.z) + y, pf.z + Math.cos(face) * (r * 0.78 + 0.1));
    sign.rotation.y = face;
    this.group.add(sign);
  }

  /** The front gate: an arch with the zoo's name, and animals on top. */
  private gate(b: Batch, pf: PlaceFrame) {
    if (pf.place.id !== 'entrance') {
      const y = this.groundAt(pf.x, pf.z);
      for (const s of [-1, 1]) b.add(BOX, flat('#065f46'), at(pf.x + s * 4, y + 2.5, pf.z, 0, 1, 5, 1));
      const tex = signTexture('North Entrance', '#065f46', '#ffffff', 512, 96);
      this.textures.push(tex);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.5), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      sign.position.set(pf.x, y + 5.2, pf.z);
      this.group.add(sign);
      return;
    }
    const y = this.groundAt(pf.x, pf.z);
    const z = pf.z + 6;
    for (const s of [-1, 1]) {
      b.add(BOX, flat('#065f46'), at(pf.x + s * 7, y + 4, z, 0, 2, 8, 2));
      b.add(SPH, flat('#f59e0b'), at(pf.x + s * 7, y + 8.6, z, 0, 2, 2, 2));
    }
    b.add(BOX, flat('#047857'), at(pf.x, y + 8, z, 0, 16, 1.6, 1.4));
    const tex = signTexture('OMAHA ZOO', '#047857', '#fef3c7', 1024, 160, '🦁');
    this.textures.push(tex);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.2), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    sign.position.set(pf.x, y + 8, z + 0.75);
    this.group.add(sign);
    // Ticket booths.
    for (const s of [-1, 1]) {
      b.add(BOX, flat('#fde68a'), at(pf.x + s * 11, y + 1.4, z, 0, 3, 2.8, 2.6));
      b.add(BOX, flat('#dc2626'), at(pf.x + s * 11, y + 3, z, 0, 3.4, 0.4, 3));
    }
  }

  private carousel(pf: PlaceFrame) {
    const g = new THREE.Group();
    const y = this.groundAt(pf.x, pf.z);
    g.position.set(pf.x, y, pf.z);
    const r = pf.place.r * K;
    const base = new THREE.Mesh(CYL, flat('#fef3c7'));
    base.scale.set(r * 2, 0.5, r * 2);
    base.position.y = 0.25;
    g.add(base);
    const roof = new THREE.Mesh(CONE, flat('#db2777'));
    roof.scale.set(r * 2.3, 2.4, r * 2.3);
    roof.position.y = 5.4;
    g.add(roof);
    const pole = new THREE.Mesh(CYL, flat('#fbbf24', { metal: 0.5, rough: 0.3 }));
    pole.scale.set(0.8, 5, 0.8);
    pole.position.y = 2.5;
    g.add(pole);
    const spin = new THREE.Group();
    g.add(spin);
    const colors = ['#f472b6', '#60a5fa', '#fbbf24', '#34d399', '#a78bfa', '#fb923c'];
    const riders: THREE.Object3D[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const rider = new THREE.Group();
      const body = new THREE.Mesh(SPH, flat(colors[k]));
      body.scale.set(0.8, 0.7, 1.5);
      rider.add(body);
      const head = new THREE.Mesh(SPH, flat(colors[k]));
      head.scale.setScalar(0.6);
      head.position.set(0, 0.5, 0.7);
      rider.add(head);
      const rod = new THREE.Mesh(CYL6, flat('#fbbf24', { metal: 0.5, rough: 0.3 }));
      rod.scale.set(0.08, 4, 0.08);
      rod.position.y = 0.8;
      rider.add(rod);
      rider.position.set(Math.cos(a) * r * 0.7, 1.5, Math.sin(a) * r * 0.7);
      rider.rotation.y = -a;
      spin.add(rider);
      riders.push(rider);
    }
    this.group.add(g);
    this.ticks.push((t) => {
      spin.rotation.y = t * 0.6;
      riders.forEach((rd, k) => { rd.position.y = 1.5 + Math.sin(t * 2.4 + k) * 0.4; });
    });
  }

  private splash(b: Batch, pf: PlaceFrame) {
    const y = this.groundAt(pf.x, pf.z);
    const r = pf.place.r * K;
    b.add(CYL, flat('#7dd3fc'), at(pf.x, y + 0.05, pf.z, 0, r * 1.8, 0.1, r * 1.8));
    // The whale.
    const whale = new THREE.Group();
    whale.position.set(pf.x, y, pf.z);
    const body = new THREE.Mesh(SPH, flat('#38bdf8'));
    body.scale.set(4, 3, 8);
    body.position.y = 1.4;
    whale.add(body);
    const tail = new THREE.Mesh(CONE, flat('#0ea5e9'));
    tail.scale.set(3, 2.2, 0.6);
    tail.position.set(0, 3, -4.6);
    tail.rotation.x = -0.6;
    whale.add(tail);
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.6, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: '#e0f2fe', transparent: true, opacity: 0.65, depthWrite: false }));
    jet.position.set(0, 4, 1.5);
    whale.add(jet);
    this.group.add(whale);
    const jets: THREE.Mesh[] = [];
    for (let k = 0; k < 6; k++) {
      const j = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.25, 1, 6, 1, true), jet.material);
      const a = (k / 6) * Math.PI * 2;
      j.position.set(pf.x + Math.cos(a) * r * 0.7, y, pf.z + Math.sin(a) * r * 0.7);
      this.group.add(j);
      jets.push(j);
    }
    this.extras.set('splash-whale', [jet]);
    this.ticks.push((t) => {
      const big = this.extrasOn.has('splash-whale') ? 2 : 1;
      const h = (2.5 + Math.sin(t * 2) * 1.2) * big;
      jet.scale.y = h;
      jet.position.y = 4 + h / 2;
      jets.forEach((j, k) => { const hh = Math.max(0.1, 1.5 + Math.sin(t * 3 + k * 1.3) * 1.4); j.scale.y = hh; j.position.y = y + hh / 2; });
    });
  }
  readonly extrasOn = new Set<string>();

  /** The railroad: two rails and their ties, all the way round. */
  private buildTrack(b: Batch) {
    const rail = flat('#6b6b70', { metal: 0.6, rough: 0.4 });
    const tie = flat('#6b4a2e');
    const pts = this.train.pts;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i], c = pts[(i + 1) % n];
      const L = Math.hypot(c.x - a.x, c.z - a.z);
      const steps = Math.ceil(L / 1.4);
      const ry = Math.atan2(c.x - a.x, c.z - a.z);
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps, t1 = (k + 1) / steps;
        const x0 = a.x + (c.x - a.x) * t0, z0 = a.z + (c.z - a.z) * t0, x1 = a.x + (c.x - a.x) * t1, z1 = a.z + (c.z - a.z) * t1;
        const y0 = this.trackY(x0, z0), y1 = this.trackY(x1, z1);
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, my = (y0 + y1) / 2;
        const seg = Math.hypot(x1 - x0, z1 - z0);
        b.add(BOX, tie, at(mx, my - 0.05, mz, ry, 2.2, 0.12, 0.35));
        for (const s of [-0.55, 0.55]) b.add(BOX, rail, at(mx + Math.cos(ry) * s, my + 0.06, mz - Math.sin(ry) * s, ry, 0.1, 0.12, seg + 0.05));
      }
    }
  }
  /** The track rides on a smoothed ground, and on trestles over dips. */
  trackY(x: number, z: number) {
    let s = 0, w = 0;
    for (const [dx, dz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) { s += heightAt(x + dx, z + dz); w++; }
    return Math.max(s / w, (this.waterAt(x, z) ?? -99) + 0.6) + 0.15;
  }

  /** The Skyfari's towers and cable. The chairs move; the scene does those. */
  private buildSkyfari(b: Batch) {
    const { a, b: c } = this.skyfari;
    const L = a.distanceTo(c);
    const n = Math.ceil(L / 34);
    for (let k = 0; k <= n; k++) {
      const p = a.clone().lerp(c, k / n);
      const gy = this.groundAt(p.x, p.z);
      const top = p.y + 0.6;
      b.add(CYL6, flat('#64748b'), at(p.x, (gy + top) / 2, p.z, 0, 0.6, top - gy, 0.6));
      b.add(BOX, flat('#475569'), at(p.x, top, p.z, Math.atan2(c.x - a.x, c.z - a.z) + Math.PI / 2, 4, 0.4, 0.4));
    }
    const ry = Math.atan2(c.x - a.x, c.z - a.z);
    for (const s of [-1.6, 1.6]) {
      const off = new THREE.Vector3(Math.cos(ry) * s, 0, -Math.sin(ry) * s);
      const geo = new THREE.BufferGeometry().setFromPoints([a.clone().add(off), c.clone().add(off)]);
      this.group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#1f2937' })));
    }
  }

  /** The zoo's fence and the woods beyond it. */
  private buildEdge(b: Batch) {
    const pts = BOUNDARY.map(toWorld);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      const L = Math.hypot(c.x - a.x, c.z - a.z);
      const n = Math.ceil(L / 4);
      const ry = Math.atan2(c.x - a.x, c.z - a.z);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const x = a.x + (c.x - a.x) * t, z = a.z + (c.z - a.z) * t;
        b.add(BOX, flat('#2f5d3a'), at(x, this.groundAt(x, z) + 0.9, z, ry, 0.5, 1.8, L / n + 0.1));
      }
    }
  }

  /** Trees by the thousand: woods outside, shade along the paths, and the habitats' own. */
  private buildTrees() {
    const spots: { x: number; z: number; s: number; kind: 0 | 1 | 2; tint: number }[] = [];
    const r = rng(2026);
    const { x0, x1, z0, z1 } = this.bounds;
    // The woods around.
    for (let i = 0; i < 2600; i++) {
      const x = x0 - 120 + r() * (x1 - x0 + 240), z = z0 - 120 + r() * (z1 - z0 + 240);
      if (inside(BOUNDARY, toPx(x, z))) continue;
      spots.push({ x, z, s: 1.6 + r() * 1.6, kind: r() < 0.35 ? 1 : 0, tint: r() });
    }
    // Shade inside the zoo, off the paths and out of the yards.
    for (let i = 0; i < 2200; i++) {
      const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
      if (!this.walkable(x, z)) continue;
      const p = this.nearestPath(x, z);
      if (p.d < 3.6 || p.d > 22) continue;
      if (this.halls.some((h) => Math.hypot(x - h.x, z - h.z) < h.r + 3)) continue;
      if ([...this.places.values()].some((pf) => Math.hypot(x - pf.x, z - pf.z) < pf.place.r * K + 4)) continue;
      if (Math.hypot(x - this.train.pts[0].x, z - this.train.pts[0].z) < 0) continue;
      if (this.nearTrack(x, z) < 3) continue;
      spots.push({ x, z, s: 1.1 + r() * 1.2, kind: r() < 0.2 ? 1 : 0, tint: r() });
    }
    // In the habitats, and the jungle and the dome's palms.
    for (const f of this.habitats.values()) for (const t of f.trees) spots.push({ x: t.x, z: t.z, s: t.h / 4.2, kind: f.def.ground === 'snow' ? 1 : f.def.ground === 'jungle' ? 2 : 0, tint: r() });
    for (const h of this.halls) if (h.kind === 'jungle') for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * h.r * 0.9;
      const x = h.x + Math.cos(a) * d, z = h.z + Math.sin(a) * d;
      if (this.habitatAt(x, z)) continue;
      if (this.nearestPath(x, z).d < 2.5 && d < h.r * 0.3) continue;
      spots.push({ x, z, s: 2 + r() * 1.6, kind: 2, tint: r() });
    }
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.24, 1, 6), flat('#6b4a2e'), spots.length);
    const round = spots.filter((s) => s.kind === 0), pine = spots.filter((s) => s.kind === 1), palm = spots.filter((s) => s.kind === 2);
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), round.length);
    const cones = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2.4, 7), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), pine.length);
    const fronds = new THREE.InstancedMesh(new THREE.ConeGeometry(1.6, 0.9, 6, 1, true), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true, side: THREE.DoubleSide }), palm.length);
    const c = new THREE.Color();
    const greens = ['#4f9a4a', '#5fae5b', '#3f8a46', '#6aaa4a', '#7cbf5a', '#3a7a4a'];
    let it = 0, ir = 0, ip = 0, ia = 0;
    for (const s of spots) {
      const y = this.groundAt(s.x, s.z);
      const H = 2.4 * s.s * (s.kind === 2 ? 1.8 : 1);
      trunks.setMatrixAt(it++, at(s.x, y + H / 2, s.z, 0, s.s, H, s.s));
      c.set(greens[Math.floor(s.tint * greens.length)]);
      if (s.kind === 0) { crowns.setMatrixAt(ir, at(s.x, y + H + s.s * 0.9, s.z, s.tint * 6, s.s * 1.5, s.s * 1.35, s.s * 1.5)); crowns.setColorAt(ir++, c); }
      else if (s.kind === 1) { cones.setMatrixAt(ip, at(s.x, y + H + s.s * 0.9, s.z, 0, s.s * 1.2, s.s * 1.3, s.s * 1.2)); cones.setColorAt(ip++, c.offsetHSL(0, 0, -0.08)); }
      else { fronds.setMatrixAt(ia, at(s.x, y + H, s.z, s.tint * 6, s.s, s.s, s.s)); fronds.setColorAt(ia++, c.set('#3f9a3a')); }
    }
    for (const m of [trunks, crowns, cones, fronds]) { m.castShadow = true; m.frustumCulled = false; this.group.add(m); }
  }
  private nearTrack(x: number, z: number) {
    let best = Infinity;
    const p = this.train.pts;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L));
      best = Math.min(best, Math.hypot(a.x + dx * t - x, a.z + dz * t - z));
    }
    return best;
  }

  /** Lamps along the paths, and benches. They glow after dark. */
  private buildLamps() {
    const spots: { x: number; z: number; ry: number }[] = [];
    for (const line of this.paths) for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], c = line[i];
      const L = Math.hypot(c.x - a.x, c.z - a.z);
      const n = Math.floor(L / 16);
      const ry = Math.atan2(c.x - a.x, c.z - a.z);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, side = k % 2 ? 1 : -1;
        const x = a.x + (c.x - a.x) * t + Math.cos(ry) * side * 3.1, z = a.z + (c.z - a.z) * t - Math.sin(ry) * side * 3.1;
        if (this.walkable(x, z)) spots.push({ x, z, ry });
      }
    }
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 3, 6), flat('#2f3540'), spots.length);
    const head = flat('#fff3c4', { emissive: '#ffd27a', intensity: 0.2 });
    this.glows.push(head);
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 8, 6), head, spots.length);
    const benches = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.14, 0.5), flat('#9a6b45'), spots.length);
    spots.forEach((s, i) => {
      const y = this.groundAt(s.x, s.z);
      posts.setMatrixAt(i, at(s.x, y + 1.5, s.z));
      heads.setMatrixAt(i, at(s.x, y + 3.1, s.z));
      const bx = s.x + Math.sin(s.ry) * 1.6, bz = s.z + Math.cos(s.ry) * 1.6;
      benches.setMatrixAt(i, at(bx, this.groundAt(bx, bz) + 0.45, bz, s.ry + Math.PI / 2));
    });
    for (const m of [posts, heads, benches]) { m.frustumCulled = false; this.group.add(m); }
    this.lampSpots = spots;
  }
  lampSpots: { x: number; z: number; ry: number }[] = [];

  /** Show or hide what an upgrade adds, and the broken-fence signs. */
  setState(owned: string[], broken: string[]) {
    for (const [id, sign] of this.brokenSigns) sign.visible = broken.includes(id);
    this.extrasOn.clear();
    for (const id of owned) this.extrasOn.add(id);
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    for (const t of this.textures) t.dispose();
  }
}

export type { Px };
