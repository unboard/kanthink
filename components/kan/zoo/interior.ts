import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PlayerKit } from '../city/engine';
import { hash } from '@/lib/kan/city/layout';
import { EXHIBITS } from '@/lib/kan/zoo/map';
import { species, awake, type Species } from '@/lib/kan/zoo/species';
import type { Animal, Zoo } from '@/lib/kan/zoo/sim';
import { animalFigure, type AnimalFig, type AnimalState } from './animals';
import { flat, signTexture } from './world';

/**
 * Inside the zoo's big buildings, to walk around in: the Desert Dome with Kingdoms of
 * the Night underneath it, the Lied Jungle and its canopy walk, the Scott Aquarium and
 * its shark tunnel, and the Butterfly Pavilion.
 *
 * Each is its own scene, with levels: floors at different heights joined by stairs,
 * ramps, a spiral stair and glass elevators. Where you stand is whichever floor is
 * nearest your feet, so a walkway can pass over the floor below. You can't walk off
 * a ledge (there's no floor at your height there), and you bump your head under
 * anything too low.
 *
 * The animals are the game's own (same habitat ids), living in pens built for them:
 * swimming, flying, climbing and sleeping on their own clocks, except down in
 * Kingdoms of the Night, which is lit backwards so its animals are up by day.
 */

export type InteriorId = 'desert' | 'jungle' | 'aquarium' | 'butterflies';
/** Which interior an outside door leads into, and where inside you start: 'night' starts you down in Kingdoms of the Night. */
export const INTERIOR_FOR: Record<string, { id: InteriorId; start: 'main' | 'night' }> = {
  desert: { id: 'desert', start: 'main' },
  night: { id: 'desert', start: 'night' },
  jungle: { id: 'jungle', start: 'main' },
  aquarium: { id: 'aquarium', start: 'main' },
  butterflies: { id: 'butterflies', start: 'main' },
};
export type InteriorNear = { kind: 'habitat'; id: string; name: string } | { kind: 'exit' } | { kind: 'elevator'; label: string };
export interface InteriorCallbacks { onNear(n: InteriorNear | null): void; onPick(p: { kind: 'animal'; id: string }): void; onFloor?(name: string): void }

// ---------- Shapes, floors and walls ----------

interface Shape2 { x: number; z: number; r?: number; hw?: number; hd?: number }
const inShape = (s: Shape2, x: number, z: number, pad = 0) =>
  s.r !== undefined ? Math.hypot(x - s.x, z - s.z) < s.r + pad : Math.abs(x - s.x) < s.hw! + pad && Math.abs(z - s.z) < s.hd! + pad;
const edgeOf = (s: Shape2, x: number, z: number) =>
  s.r !== undefined ? Math.hypot(x - s.x, z - s.z) - s.r : Math.max(Math.abs(x - s.x) - s.hw!, Math.abs(z - s.z) - s.hd!);
function randIn(s: Shape2, k = 0.85) {
  if (s.r !== undefined) { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * s.r * k; return { x: s.x + Math.cos(a) * d, z: s.z + Math.sin(a) * d }; }
  return { x: s.x + (Math.random() * 2 - 1) * s.hw! * k, z: s.z + (Math.random() * 2 - 1) * s.hd! * k };
}
const rect = (x0: number, x1: number, z0: number, z1: number): Shape2 => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2 });
const circ = (x: number, z: number, r: number): Shape2 => ({ x, z, r });

/** A surface you can stand on: its height at a point, or null if it isn't there. */
interface Floor { name: string; h(x: number, z: number): number | null }
const holed = (holes: Shape2[], x: number, z: number) => holes.some((s) => inShape(s, x, z));
function areaFloor(name: string, s: Shape2, y: number, holes: Shape2[] = []): Floor {
  return { name, h: (x, z) => (inShape(s, x, z) && !holed(holes, x, z) ? y : null) };
}
/** A ramp or a staircase: its height runs from y0 at the low end of `axis` to y1 at the high end. */
function rampFloor(name: string, s: Shape2, axis: 'x' | 'z', y0: number, y1: number): Floor {
  return {
    name,
    h: (x, z) => {
      if (!inShape(s, x, z)) return null;
      const t = axis === 'x' ? (x - (s.x - s.hw!)) / (2 * s.hw!) : (z - (s.z - s.hd!)) / (2 * s.hd!);
      return y0 + (y1 - y0) * THREE.MathUtils.clamp(t, 0, 1);
    },
  };
}
/** A spiral stair: around a center, climbing from y0 at angle a0 to y1 at angle a1 (a1 > a0, less than a full turn). */
function spiralFloor(name: string, cx: number, cz: number, rIn: number, rOut: number, a0: number, a1: number, y0: number, y1: number): Floor {
  return {
    name,
    h: (x, z) => {
      const d = Math.hypot(x - cx, z - cz);
      if (d < rIn || d > rOut) return null;
      let a = Math.atan2(z - cz, x - cx);
      while (a < a0) a += Math.PI * 2;
      while (a > a0 + Math.PI * 2) a -= Math.PI * 2;
      if (a > a1) return null;
      return y0 + ((a - a0) / (a1 - a0)) * (y1 - y0);
    },
  };
}

interface Elevator { x: number; z: number; r: number; stops: number[]; labels: string[]; y: number; from: number; to: number; t: number; moving: boolean; platform: THREE.Group; names: string[] }

// ---------- The animals in their pens ----------

interface Pen {
  habitat: string;
  name: string;
  species?: string[];
  area: Shape2;
  /** Floor height inside. */
  y: number;
  walkIn?: boolean;
  water?: Shape2 & { level: number };
  trees?: { x: number; z: number; h: number }[];
  /** How high fliers fly, absolute. */
  fly?: [number, number];
  /** A 3D volume to swim in, for the shark tank; with a part to keep out of (the tunnel). */
  box?: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; avoid?: (x: number, y: number, z: number) => boolean };
  /** Where bats hang. */
  perch?: number;
  /** Lit backwards: up by day. */
  night?: boolean;
}
interface Critter {
  a: Animal; sp: Species; fig: AnimalFig; pen: Pen; baby: boolean;
  x: number; y: number; z: number; heading: number;
  to: { x: number; y: number; z: number } | null;
  state: AnimalState; wait: number; phase: number; speed: number;
  climb: { x: number; z: number; top: number; t: number; up: boolean; sit: number } | null;
  eatUntil: number;
  label: HTMLDivElement;
}

const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 7),
  sph: new THREE.SphereGeometry(0.5, 12, 8),
  rock: new THREE.IcosahedronGeometry(0.5, 0),
};
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler();
function at(x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  return M4.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz));
}
/** Merges static pieces that share a material. */
class Merge {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(geo: THREE.BufferGeometry, m: THREE.Material, matrix: THREE.Matrix4) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    g.applyMatrix4(matrix);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const list = this.parts.get(m) ?? [];
    list.push(g);
    this.parts.set(m, list);
  }
  build(into: THREE.Object3D) {
    for (const [m, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      mesh.matrixAutoUpdate = false;
      into.add(mesh);
    }
    this.parts.clear();
  }
}
const glass = (opacity = 0.18, color = '#cfe8ff') => new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });
const water = (color = '#2f8fd0', opacity = 0.78) => new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.1, metalness: 0.1, emissive: new THREE.Color(color), emissiveIntensity: 0.15, side: THREE.DoubleSide, depthWrite: false });
const glow = (color: string, intensity = 1.6) => new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.6 });

function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const turnTo = (from: number, to: number, k: number) => { let d = to - from; d = Math.atan2(Math.sin(d), Math.cos(d)); return from + d * k; };

export class ZooInterior {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 600);
  private layer: HTMLDivElement;
  private floors: Floor[] = [];
  /** Walls and pens: true where you can't stand. */
  private walls: ((x: number, z: number, y: number) => boolean)[] = [];
  private pens: Pen[] = [];
  private exits: { x: number; y: number; z: number }[] = [];
  private elevators: Elevator[] = [];
  private critters = new Map<string, Critter>();
  private areaLabels: { el: HTMLDivElement; pos: THREE.Vector3 }[] = [];
  private colliders: THREE.Object3D[] = [];
  private ticks: ((t: number, dt: number) => void)[] = [];
  private textures: THREE.Texture[] = [];
  private foods: { pen: Pen; x: number; y: number; z: number; until: number; obj: THREE.Object3D }[] = [];
  private toys: { pen: Pen; obj: THREE.Mesh; x: number; z: number; vx: number; vz: number; until: number }[] = [];
  private player: { obj: THREE.Group; x: number; y: number; z: number; heading: number; speed: number };
  private look = 0;
  private walkT = 0;
  private time = 0;
  private hour = 12;
  private near: InteriorNear | null = null;
  private floorName = '';
  private disposed = false;
  private ray = new THREE.Raycaster();
  private hemi = new THREE.HemisphereLight('#ffffff', '#6a5a4a', 1);
  private sun = new THREE.DirectionalLight('#fff1d6', 1.2);
  /** How the place is lit, by level: the night level is dark blue. */
  private moods: { below?: number; bg: string; fog: [string, number, number]; hemi: number; sun: number }[] = [];
  private sky: { day: string; night: string } | null = null;
  private v3 = new THREE.Vector3();
  /** Where the camera may go, beyond the colliders: keeps it in the room. */
  private camBounds: (x: number, y: number, z: number, py: number) => { x: number; y: number; z: number };

  constructor(readonly id: InteriorId, start: 'main' | 'night', labels: HTMLDivElement, private cb: InteriorCallbacks, private kit: PlayerKit) {
    this.layer = document.createElement('div');
    this.layer.className = 'kz-labels';
    labels.appendChild(this.layer);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.sun.position.set(30, 60, 20);
    this.camBounds = (x, y, z) => ({ x, y, z });
    const merge = new Merge();
    let spawn = { x: 0, y: 0, z: 0, h: 0 };
    if (id === 'desert') spawn = this.buildDesert(merge, start);
    else if (id === 'jungle') spawn = this.buildJungle(merge);
    else if (id === 'aquarium') spawn = this.buildAquarium(merge);
    else spawn = this.buildButterflies(merge);
    merge.build(this.scene);
    const obj = kit.walker();
    this.scene.add(obj);
    // A few steps in from the door, so there's room behind you for the camera.
    this.player = { obj, x: spawn.x + Math.sin(spawn.h) * 3.5, y: spawn.y, z: spawn.z + Math.cos(spawn.h) * 3.5, heading: spawn.h, speed: 0 };
    const f = { x: Math.sin(spawn.h), z: Math.cos(spawn.h) };
    this.camera.position.set(spawn.x - f.x * 2.5, spawn.y + 3.5, spawn.z - f.z * 2.5);
    this.camera.lookAt(spawn.x, spawn.y + 1.4, spawn.z);
    this.applyMood(true);
  }

  // ---------- Pieces ----------

  private label(html: string, cls: string) {
    const el = document.createElement('div');
    el.className = `kz-label ${cls}`;
    el.innerHTML = html;
    el.style.display = 'none';
    this.layer.appendChild(el);
    return el;
  }
  private area(text: string, x: number, y: number, z: number) {
    this.areaLabels.push({ el: this.label(text, 'kz-exhibit'), pos: new THREE.Vector3(x, y, z) });
  }
  private sign(text: string, bg: string, x: number, y: number, z: number, ry: number, w = 6, emoji = '') {
    const tex = signTexture(text, bg, '#ffffff', 768, 128, emoji);
    this.textures.push(tex);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 6), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    this.scene.add(m);
  }
  /** A pen's low wall (or glass) all around, as a wall you can't walk into. */
  private pen(p: Pen, merge: Merge, wall: 'stone' | 'glass' | 'wood' | 'none' = 'stone', height = 1.1) {
    this.pens.push(p);
    if (!p.walkIn) this.walls.push((x, z, y) => Math.abs(y - p.y) < 3.5 && inShape(p.area, x, z, 0.5));
    const s = p.area;
    if (wall === 'none') return;
    const mat = wall === 'glass' ? null : flat(wall === 'stone' ? '#9a8a74' : '#7a5636');
    if (wall === 'glass') {
      const g = s.r !== undefined
        ? new THREE.Mesh(new THREE.CylinderGeometry(s.r + 0.3, s.r + 0.3, height, 32, 1, true), glass(0.2))
        : new THREE.Mesh(new THREE.BoxGeometry(s.hw! * 2 + 0.6, height, s.hd! * 2 + 0.6), glass(0.2));
      g.position.set(s.x, p.y + height / 2 - 0.05, s.z);
      this.scene.add(g);
      // A frame along the top.
      if (s.r !== undefined) merge.add(new THREE.TorusGeometry(s.r + 0.3, 0.06, 4, 32), flat('#5a6878'), at(s.x, p.y + height, s.z, 0, 1, 1, 1, Math.PI / 2));
      else merge.add(GEO.box, flat('#5a6878'), at(s.x, p.y + height, s.z, 0, s.hw! * 2 + 0.7, 0.1, s.hd! * 2 + 0.7));
      return;
    }
    if (s.r !== undefined) {
      const n = Math.max(12, Math.round(s.r * 4));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2, a2 = ((k + 1) / n) * Math.PI * 2;
        const x = s.x + Math.cos((a + a2) / 2) * (s.r + 0.3), z = s.z + Math.sin((a + a2) / 2) * (s.r + 0.3);
        merge.add(GEO.box, mat!, at(x, p.y + height / 2 - 0.1, z, -(a + a2) / 2, 0.35, height, 2 * (s.r + 0.3) * Math.sin(Math.PI / n) + 0.05));
      }
    } else {
      for (const [x, z, w, d] of [[s.x, s.z - s.hd! - 0.3, s.hw! * 2 + 0.6, 0.35], [s.x, s.z + s.hd! + 0.3, s.hw! * 2 + 0.6, 0.35], [s.x - s.hw! - 0.3, s.z, 0.35, s.hd! * 2 + 0.6], [s.x + s.hw! + 0.3, s.z, 0.35, s.hd! * 2 + 0.6]]) {
        merge.add(GEO.box, mat!, at(x, p.y + height / 2 - 0.1, z, 0, w, height, d));
      }
    }
  }
  /** Real stair steps over a ramp floor. */
  private steps(merge: Merge, s: Shape2, axis: 'x' | 'z', y0: number, y1: number, color = '#b8a88a', solid = false) {
    const len = axis === 'x' ? s.hw! * 2 : s.hd! * 2;
    const n = Math.max(4, Math.round(Math.abs(y1 - y0) / 0.32));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const y = y0 + (y1 - y0) * ((i + 1) / n);
      const along = (axis === 'x' ? s.x - s.hw! : s.z - s.hd!) + len * t;
      const h = solid ? Math.max(0.3, y - Math.min(y0, y1) + 0.3) : 0.25;
      const cy = solid ? y - h / 2 : y - 0.125;
      if (axis === 'x') merge.add(GEO.box, flat(color), at(along, cy, s.z, 0, len / n + 0.02, h, s.hd! * 2));
      else merge.add(GEO.box, flat(color), at(s.x, cy, along, 0, s.hw! * 2, h, len / n + 0.02));
    }
    // Hand rails.
    for (const side of [-1, 1]) {
      const a = axis === 'x' ? { x: s.x - s.hw!, z: s.z + side * s.hd! } : { x: s.x + side * s.hw!, z: s.z - s.hd! };
      const b = axis === 'x' ? { x: s.x + s.hw!, z: a.z } : { x: a.x, z: s.z + s.hd! };
      const mid = new THREE.Vector3((a.x + b.x) / 2, (y0 + y1) / 2 + 1, (a.z + b.z) / 2);
      const L = Math.hypot(len, y1 - y0);
      const m = new THREE.Mesh(GEO.cyl6);
      m.position.copy(mid);
      m.scale.set(0.08, L, 0.08);
      m.lookAt(b.x, y1 + 1, b.z);
      m.rotateX(Math.PI / 2);
      m.updateMatrix();
      merge.add(GEO.cyl6, flat('#3a3a42', { metal: 0.4, rough: 0.4 }), m.matrix);
      for (let k = 0; k <= 4; k++) {
        const t = k / 4;
        merge.add(GEO.cyl6, flat('#3a3a42', { metal: 0.4, rough: 0.4 }), at(a.x + (b.x - a.x) * t, y0 + (y1 - y0) * t + 0.5, a.z + (b.z - a.z) * t, 0, 0.07, 1, 0.07));
      }
    }
  }
  /** A glass elevator between its stops. */
  private elevator(merge: Merge, x: number, z: number, stops: number[], labels: string[], names: string[]) {
    const r = 1.6;
    const lo = Math.min(...stops), hi = Math.max(...stops);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.2, r + 0.2, hi - lo + 3.2, 24, 1, true), glass(0.16));
    shaft.position.set(x, (lo + hi) / 2 + 1.4, z);
    this.scene.add(shaft);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      merge.add(GEO.cyl6, flat('#c0c8d0', { metal: 0.5, rough: 0.3 }), at(x + Math.cos(a) * (r + 0.2), (lo + hi) / 2 + 1.4, z + Math.sin(a) * (r + 0.2), 0, 0.14, hi - lo + 3.2, 0.14));
    }
    const platform = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.25, 24), flat('#d6dde4', { metal: 0.3, rough: 0.4 }));
    disc.position.y = -0.125;
    platform.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r - 0.1, 0.05, 6, 24), glow('#facc15', 0.8));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    platform.add(ring);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(r - 0.05, 0.05, 6, 24, Math.PI * 1.4), flat('#9aa4ae', { metal: 0.6, rough: 0.3 }));
    rail.rotation.x = Math.PI / 2;
    rail.position.y = 1;
    platform.add(rail);
    const e: Elevator = { x, z, r, stops, labels, names, y: stops[0], from: stops[0], to: stops[0], t: 1, moving: false, platform };
    platform.position.set(x, e.y, z);
    this.scene.add(platform);
    this.elevators.push(e);
    // A touch wider than the platform, so there's no gap between it and the floor around the shaft.
    this.floors.push({ name: 'elevator', h: (px, pz) => (Math.hypot(px - x, pz - z) < r + 0.25 ? e.y : null) });
    // Nobody steps into the empty shaft.
    this.walls.push((px, pz, py) => { const d = Math.hypot(px - x, pz - z); return d < r + 0.25 && d > r - 0.25 && Math.abs(py - e.y) > 0.5; });
    return e;
  }
  private exit(merge: Merge, x: number, y: number, z: number, ry: number) {
    this.exits.push({ x, y, z });
    merge.add(GEO.box, flat('#1f2937'), at(x, y + 1.5, z, ry, 3.2, 3, 0.3));
    merge.add(GEO.box, glow('#22c55e', 1.2), at(x, y + 3.35, z, ry, 1.6, 0.5, 0.35));
    this.sign('Exit', '#16a34a', x - Math.sin(ry) * 0.25, y + 3.35, z - Math.cos(ry) * 0.25, ry, 1.6, '🚪');
  }
  private collider(mesh: THREE.Mesh) { this.colliders.push(mesh); }

  /** A geodesic glass dome: panes on a white frame. */
  private dome(r: number, h: number, y: number, frame = '#f4f4f0') {
    const ico = new THREE.IcosahedronGeometry(1, 3).toNonIndexed();
    const pos = ico.getAttribute('position');
    const keep: number[] = [];
    for (let i = 0; i < pos.count; i += 3) if (pos.getY(i) > -0.02 && pos.getY(i + 1) > -0.02 && pos.getY(i + 2) > -0.02) for (let k = 0; k < 3; k++) keep.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
    const half = new THREE.BufferGeometry();
    half.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
    half.computeVertexNormals();
    const shell = new THREE.Mesh(half, glass(0.12));
    shell.scale.set(r, h, r);
    shell.position.y = y;
    shell.renderOrder = 3;
    this.scene.add(shell);
    this.collider(shell);
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(half, 1), new THREE.LineBasicMaterial({ color: frame, transparent: true, opacity: 0.8 }));
    lines.scale.copy(shell.scale);
    lines.position.copy(shell.position);
    this.scene.add(lines);
  }
  /** A round wall all the way around, with a gap for the door. */
  private roundWall(merge: Merge, r: number, h: number, y: number, color: string, doorAngle: number, doorW = 4) {
    const n = 48;
    const g = new THREE.CylinderGeometry(r, r, h, n, 1, true);
    const wall = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide, flatShading: true }));
    wall.position.y = y + h / 2;
    this.scene.add(wall);
    this.collider(wall);
    this.walls.push((x, z) => Math.hypot(x, z) > r - 0.6 && !(Math.abs(Math.atan2(Math.sin(Math.atan2(z, x) - doorAngle), Math.cos(Math.atan2(z, x) - doorAngle))) * r < doorW / 2));
    void merge;
  }

  private ground(s: Shape2, y: number, color: string, holes: Shape2[] = [], thick = 0.4) {
    const shape = new THREE.Shape();
    const ring = (sh: Shape2, path: THREE.Path, rev = false) => {
      if (sh.r !== undefined) { path.absarc(sh.x, -sh.z, sh.r, 0, Math.PI * 2, rev); return; }
      const x0 = sh.x - sh.hw!, x1 = sh.x + sh.hw!, z0 = -(sh.z - sh.hd!), z1 = -(sh.z + sh.hd!);
      if (!rev) { path.moveTo(x0, z0); path.lineTo(x1, z0); path.lineTo(x1, z1); path.lineTo(x0, z1); path.lineTo(x0, z0); }
      else { path.moveTo(x0, z0); path.lineTo(x0, z1); path.lineTo(x1, z1); path.lineTo(x1, z0); path.lineTo(x0, z0); }
    };
    ring(s, shape);
    for (const h of holes) { const p = new THREE.Path(); ring(h, p, true); shape.holes.push(p); }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 32 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, y - thick, 0);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
    this.scene.add(mesh);
    this.collider(mesh);
    return mesh;
  }

  // ---------- The Desert Dome, and Kingdoms of the Night under it ----------

  private buildDesert(merge: Merge, start: 'main' | 'night') {
    const R = 32;
    const N = -10; // the night level
    this.sky = { day: '#9ccaf0', night: '#0b1430' };
    this.moods = [{ bg: '#9ccaf0', fog: ['#f3dcb0', 60, 160], hemi: 1.15, sun: 1.4 }, { below: -4, bg: '#060b1e', fog: ['#101c48', 10, 60], hemi: 0.6, sun: 0.12 }];
    this.dome(R, 26, -0.5);
    this.roundWall(merge, R - 0.5, 1.4, -0.4, '#c69a62', 0);
    // The desert floor, with the stairwell and the elevator cut out of it.
    const stairs = rect(2, 18, -21, -17.5);
    const lift = circ(-6, -14, 1.75);
    const sand = this.ground(circ(0, 0, R - 0.6), 0, '#e6c88f', [stairs, lift], 1.5);
    void sand;
    const walk = circ(0, 0, 25.5);
    this.floors.push(areaFloor('Desert floor', walk, 0, [stairs, lift]));
    this.floors.push(areaFloor('Desert floor', rect(24, 31.5, -2.6, 2.6), 0));
    // Dunes and canyon walls around the edge.
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + 0.12;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.32) continue;
      const rr = 27.5 + (i % 3);
      merge.add(GEO.sph, flat(i % 2 ? '#e9cd96' : '#dfbf86'), at(Math.cos(a) * rr, -0.4, Math.sin(a) * rr, a, 7 + (i % 4), 2.6 + (i % 3) * 0.8, 5));
    }
    for (const [x, z, s, ry] of [[-24, -12, 9, 0.4], [-26, 4, 11, 1.2], [-20, 16, 8, 2.2], [-12, 24, 7, 0.8]] as const) {
      merge.add(GEO.rock, flat('#c0743c'), at(x, s * 0.35, z, ry, s, s * 1.3, s * 0.8));
      merge.add(GEO.rock, flat('#a85f30'), at(x + 2, s * 0.15, z + 1.5, ry + 1, s * 0.7, s * 0.6, s * 0.6));
    }
    // Cactus.
    const cact = (x: number, z: number, h: number) => {
      merge.add(GEO.cyl, flat('#4f8a4a'), at(x, h / 2, z, 0, 0.6, h, 0.6));
      merge.add(GEO.cyl, flat('#4f8a4a'), at(x + 0.45, h * 0.6, z, 0, 0.36, h * 0.45, 0.36));
      merge.add(GEO.cyl, flat('#4f8a4a'), at(x - 0.4, h * 0.45, z, 0, 0.32, h * 0.35, 0.32));
      merge.add(GEO.sph, flat('#f472b6'), at(x, h + 0.15, z, 0, 0.35, 0.3, 0.35));
    };
    for (const [x, z, h] of [[18, 14, 3.2], [-6, 15, 2.5], [8, -10, 2.2], [-21, -1, 3], [20, -6, 2.6], [-12, -18, 2.4], [-4, 20, 2.8], [22, 8, 2]] as const) { cact(x, z, h); this.walls.push((px, pz, py) => py < 3 && Math.hypot(px - x, pz - z) < 0.7); }
    // Pens on the desert floor.
    const foxes: Pen = { habitat: 'foxes', name: 'Kalahari Dunes', area: circ(-12, 6, 5.5), y: 0 };
    this.pen(foxes, merge, 'stone', 1);
    merge.add(GEO.sph, flat('#e2bf80'), at(-12, -0.3, 6, 0, 7, 2, 6));
    for (const [x, z] of [[-14, 4], [-10, 8]] as const) merge.add(GEO.cyl, flat('#5a4630'), at(x, 0.15, z, 0, 0.9, 0.3, 0.9));
    const bobcats: Pen = { habitat: 'bobcats', name: 'Sonoran Canyon', area: circ(4, 9, 5), y: 0, trees: [{ x: 5.5, z: 11, h: 2.6 }] };
    this.pen(bobcats, merge, 'stone', 1.2);
    merge.add(GEO.rock, flat('#b8693a'), at(2.5, 0.9, 7.5, 0.4, 3.6, 2.4, 2.8));
    merge.add(GEO.rock, flat('#c0743c'), at(6, 0.5, 8, 1.2, 2.6, 1.4, 2.2));
    merge.add(GEO.cyl6, flat('#7a5636'), at(5.5, 1.3, 11, 0, 0.3, 2.6, 0.3));
    const wash: Pen = { habitat: 'roadrunners', name: 'Desert Wash', area: circ(0, -6, 6), y: 0, walkIn: true, fly: [0.6, 4] };
    this.pen(wash, merge, 'none');
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; merge.add(GEO.rock, flat('#d2b07a'), at(Math.cos(a) * 6.2, 0.15, -6 + Math.sin(a) * 6.2, a, 1, 0.35, 0.8)); }
    for (const [x, z] of [[-2, -7], [2.5, -4.5]] as const) { merge.add(GEO.cyl6, flat('#7a5636'), at(x, 0.9, z, 0, 0.18, 1.8, 0.18)); merge.add(GEO.box, flat('#7a5636'), at(x, 1.8, z, 0.6, 1.2, 0.12, 0.2)); }
    const reptiles: Pen = { habitat: 'reptiles', name: 'Reptile Rocks', area: rect(-20, -12, -10, -6.5), y: 0.9 };
    merge.add(GEO.box, flat('#7a5a3a'), at(-16, 0.45, -8.25, 0, 8.4, 0.9, 3.9));
    this.pen(reptiles, merge, 'glass', 1.5);
    this.walls.push((x, z, y) => y < 2 && inShape(reptiles.area, x, z, 0.6));
    merge.add(GEO.rock, flat('#c69a62'), at(-17.5, 1.2, -8.5, 0.3, 1.6, 0.8, 1.2));
    merge.add(GEO.rock, flat('#b88a52'), at(-14, 1.15, -7.8, 1.1, 1.4, 0.6, 1));
    this.area('🌵 Desert Dome', 0, 9, 0);

    // The overlook, up a staircase.
    const ramp = rect(14, 17.5, 4, 18);
    this.floors.push(rampFloor('Stairs', ramp, 'z', 0, 8));
    this.steps(merge, ramp, 'z', 0, 8, '#b8a88a', true);
    // The staircase is solid underneath.
    this.walls.push((x, z, y) => y < 0.6 && inShape(ramp, x, z) && z > 5.8);
    const deck = rect(-14, 17.5, 18, 24);
    this.floors.push(areaFloor('Desert overlook', deck, 8));
    merge.add(GEO.box, flat('#a08a6a'), at(deck.x, 7.8, deck.z, 0, deck.hw! * 2, 0.4, deck.hd! * 2));
    for (const [x, z] of [[-13, 18.5], [-4, 18.5], [5, 18.5], [13.5, 18.5], [-13, 23.5], [0, 23.5], [13.5, 23.5]] as const) merge.add(GEO.cyl6, flat('#6a5a48'), at(x, 3.8, z, 0, 0.5, 7.6, 0.5));
    for (let x = -14; x < 14; x += 2) merge.add(GEO.cyl6, flat('#3a3a42'), at(x + 1, 8.5, 17.8, 0, 0.06, 1, 0.06));
    merge.add(GEO.box, flat('#3a3a42'), at(0, 9, 17.8, 0, 28, 0.1, 0.1));
    this.walls.push((x, z, y) => Math.abs(y - 8) < 1 && z < 18.1 && z > 17.4 && x < 14 && x > -14.2);
    this.area('🔭 Overlook', 0, 11, 21);

    // Down the stairwell, or the elevator, to Kingdoms of the Night.
    this.floors.push(rampFloor('Stairs down', stairs, 'x', 0, N));
    this.steps(merge, stairs, 'x', 0, N, '#6a6a7a');
    for (const z of [stairs.z - stairs.hd! - 0.2, stairs.z + stairs.hd! + 0.2]) merge.add(GEO.box, flat('#3a3a42'), at(stairs.x, 1, z, 0, stairs.hw! * 2, 0.1, 0.1));
    this.sign('Kingdoms of the Night', '#312e81', 2.2, 2.6, -19.25, Math.PI / 2, 6, '🦇');
    const e = this.elevator(merge, lift.x, lift.z, [0, N], ['Ride down to Kingdoms of the Night', 'Ride up to the Desert Dome'], ['Desert floor', 'Kingdoms of the Night']);
    void e;

    // ---- Kingdoms of the Night ----
    const room = rect(-20, 26, -28, -8);
    const swamp = rect(-16, 6, -27, -16);
    const board = rect(-16, 6, -22.6, -20.4);
    this.floors.push(areaFloor('Kingdoms of the Night', room, N, [swamp, lift]));
    this.floors.push(areaFloor('Swamp boardwalk', board, N + 0.5));
    merge.add(GEO.box, flat('#1b1a24'), at(room.x, N - 0.25, room.z, 0, room.hw! * 2, 0.5, room.hd! * 2));
    // Walls and a ceiling (in tiles, with the stairwell and the elevator left open).
    for (const [x, z, w, d] of [[room.x, room.z - room.hd!, room.hw! * 2, 0.6], [room.x, room.z + room.hd!, room.hw! * 2, 0.6], [room.x - room.hw!, room.z, 0.6, room.hd! * 2], [room.x + room.hw!, room.z, 0.6, room.hd! * 2]] as const) {
      const m = new THREE.Mesh(GEO.box, flat('#2a2638'));
      m.position.set(x, N + 4.5, z);
      m.scale.set(w, 9.2, d);
      this.scene.add(m);
      this.collider(m);
    }
    this.walls.push((x, z, y) => y < -4 && !inShape(room, x, z, -0.5));
    const ceil = new Merge();
    for (let x = -20; x < 26; x += 2) for (let z = -28; z < -8; z += 2) {
      const cx = x + 1, cz = z + 1;
      if (inShape(stairs, cx, cz, 1) || inShape(lift, cx, cz, 1) || Math.hypot(cx, cz) < R - 1.5) continue;
      ceil.add(GEO.box, flat('#1d1a2a'), at(cx, -1.6, cz, 0, 2.02, 0.4, 2.02));
    }
    ceil.build(this.scene);
    // The swamp, the boardwalk and the alligators.
    const pond = new THREE.Mesh(new THREE.PlaneGeometry(swamp.hw! * 2, swamp.hd! * 2), water('#1c4a4a', 0.85));
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(swamp.x, N - 0.5, swamp.z);
    this.scene.add(pond);
    merge.add(GEO.box, flat('#2a3a28'), at(swamp.x, N - 1.2, swamp.z, 0, swamp.hw! * 2, 0.4, swamp.hd! * 2));
    merge.add(GEO.box, flat('#4a3a2a'), at(-11, N - 0.3, -26, 0, 8, 0.4, 2.2));
    for (let x = -15.5; x < 6; x += 0.8) merge.add(GEO.box, flat('#6b4a2e'), at(x, N + 0.4, board.z, 0, 0.7, 0.18, 2.2));
    for (const z of [board.z - 1.15, board.z + 1.15]) {
      merge.add(GEO.box, flat('#4a3424'), at(board.x, N + 1.4, z, 0, board.hw! * 2, 0.1, 0.1));
      for (let x = -16; x <= 6; x += 2) merge.add(GEO.cyl6, flat('#4a3424'), at(x, N + 0.6, z, 0, 0.14, 1.8, 0.14));
    }
    this.walls.push((x, z, y) => Math.abs(y - (N + 0.5)) < 0.3 && x > -16 && x < 6 && (Math.abs(z - (board.z - 1.15)) < 0.15 || Math.abs(z - (board.z + 1.15)) < 0.15));
    const gators: Pen = { habitat: 'swamp', name: 'Night Swamp', species: ['alligator'], area: swamp, y: N - 0.2, water: { ...swamp, level: N - 0.5 }, night: true };
    this.pens.push(gators);
    this.walls.push((x, z, y) => Math.abs(y - N) < 0.3 && inShape(swamp, x, z) && !inShape(board, x, z));
    // Cypress trees in the swamp.
    for (const [x, z] of [[-13, -18], [-6, -25.5], [3, -17], [-2, -24]] as const) {
      merge.add(GEO.cyl, flat('#3a2e22'), at(x, N + 2.5, z, 0, 0.7, 6, 0.7));
      merge.add(GEO.sph, flat('#1f3a2a'), at(x, N + 6, z, 0, 4, 2.4, 4));
    }
    // Bats in their cave.
    const cave = rect(10, 24, -27.5, -23);
    const bats: Pen = { habitat: 'swamp', name: 'Bat Cave', species: ['bat'], area: cave, y: N, fly: [N + 1.5, N + 6.5], perch: N + 7.2, night: true };
    this.pen(bats, merge, 'glass', 8);
    merge.add(GEO.rock, flat('#2a2433'), at(17, N + 8, -26, 0, 15, 3, 5));
    for (let k = 0; k < 8; k++) merge.add(GEO.cone, flat('#3a3348'), at(11 + k * 1.7, N + 6.6, -25 - (k % 2), Math.PI, 0.4, 1.2, 0.4, Math.PI));
    // Burrows behind glass, and the sloth's tree.
    const aard: Pen = { habitat: 'swamp', name: 'Aardvark Burrow', species: ['aardvark'], area: rect(8, 14, -12.5, -9), y: N, night: true };
    this.pen(aard, merge, 'glass', 2);
    merge.add(GEO.sph, flat('#6a4a2e'), at(10, N - 0.3, -11, 0, 3, 1.4, 2.4));
    const ech: Pen = { habitat: 'swamp', name: 'Echidna Den', species: ['echidna'], area: rect(16, 22, -12.5, -9), y: N, night: true };
    this.pen(ech, merge, 'glass', 2);
    merge.add(GEO.sph, flat('#5a4630'), at(20, N - 0.3, -11, 0, 2.6, 1.2, 2));
    const sloth: Pen = { habitat: 'swamp', name: 'Sloth Tree', species: ['sloth'], area: circ(-15.5, -11, 2.8), y: N, trees: [{ x: -15.5, z: -11, h: 6.5 }], night: true };
    this.pen(sloth, merge, 'glass', 2.2);
    merge.add(GEO.cyl, flat('#4a3a2a'), at(-15.5, N + 3.3, -11, 0, 0.6, 6.6, 0.6));
    merge.add(GEO.cyl6, flat('#4a3a2a'), at(-14.6, N + 5.8, -11, 0, 0.25, 2.2, 0.25, 0, -1.1));
    merge.add(GEO.sph, flat('#1f3a2a'), at(-15.5, N + 7, -11, 0, 3.6, 1.8, 3.6));
    // Moonlight and glowing mushrooms.
    const moon = new THREE.Mesh(new THREE.CircleGeometry(3, 32), glow('#e8ecff', 1.4));
    moon.position.set(-5, N + 6.5, -27.6);
    this.scene.add(moon);
    const shrooms: [number, number, string][] = [[-18, -9.5, '#60a5fa'], [-8, -9.5, '#a78bfa'], [0, -15, '#34d399'], [8, -15, '#60a5fa'], [24, -15, '#f472b6'], [-18, -26, '#a78bfa'], [7, -26.5, '#34d399'], [24, -9.5, '#60a5fa'], [-12, -15, '#f472b6']];
    for (const [x, z, c] of shrooms) {
      merge.add(GEO.cyl6, flat('#d6d0c0'), at(x, N + 0.3, z, 0, 0.18, 0.6, 0.18));
      merge.add(GEO.sph, glow(c, 1.6), at(x, N + 0.65, z, 0, 0.8, 0.35, 0.8));
      merge.add(GEO.sph, glow(c, 1.2), at(x + 0.5, N + 0.4, z + 0.3, 0, 0.45, 0.2, 0.45));
    }
    for (const [x, z, c] of [[-5, -20, '#7aa2ff'], [16, -18, '#a78bfa'], [16, -11, '#60a5fa']] as const) {
      const l = new THREE.PointLight(c, 30, 22, 1.4);
      l.position.set(x, N + 5, z);
      this.scene.add(l);
    }
    this.area('🦇 Kingdoms of the Night', 4, N + 6.5, -14);
    this.exit(merge, 25.6, N, -12, -Math.PI / 2);
    this.exit(merge, 31.4, 0, 0, -Math.PI / 2);
    this.sign('Desert Dome', '#b45309', 30.5, 4, 0, -Math.PI / 2, 7, '🌵');
    // The camera stays in the room downstairs, and under the dome upstairs.
    this.camBounds = (x, y, z, py) => {
      if (py < -4) return { x: THREE.MathUtils.clamp(x, -19.3, 25.3), y: Math.min(y, -2.3), z: THREE.MathUtils.clamp(z, -27.3, -8.7) };
      const d = Math.hypot(x, z);
      const k = d > R - 2 ? (R - 2) / d : 1;
      return { x: x * k, y: THREE.MathUtils.clamp(y, 0.6, 22), z: z * k };
    };
    return start === 'night' ? { x: 23, y: N, z: -12, h: -Math.PI / 2 } : { x: 28.5, y: 0, z: 0, h: -Math.PI / 2 };
  }

  // ---------- The Lied Jungle ----------

  private buildJungle(merge: Merge) {
    const R = 30;
    this.sky = { day: '#a8d8b0', night: '#0a1a14' };
    this.moods = [{ bg: '#a8d8b0', fog: ['#9fc8a0', 22, 95], hemi: 0.95, sun: 0.9 }];
    this.hemi.color.set('#e8ffe0');
    this.hemi.groundColor.set('#2a4a20');
    const roof = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass(0.14, '#dff5e0'));
    roof.scale.set(R, 24, R);
    roof.position.y = 4;
    this.scene.add(roof);
    this.collider(roof);
    const ribs = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), 1), new THREE.LineBasicMaterial({ color: '#3a4a3a' }));
    ribs.scale.copy(roof.scale);
    ribs.position.copy(roof.position);
    this.scene.add(ribs);
    this.roundWall(merge, R, 4.5, -0.2, '#6a5a48', 0);
    const lift = circ(-6, 2.2, 1.75);
    this.ground(circ(0, 0, R), 0, '#4a7a34', [lift], 0.8);
    this.floors.push(areaFloor('Jungle floor', circ(0, 0, R - 0.8), 0, [lift]));
    // A winding river path.
    const pathPts = [[27, 0], [18, 4], [10, 2], [2, 6], [-4, 12], [-14, 16], [-22, 8], [-24, -4], [-14, -14], [-6, -19], [4, -22], [14, -16], [20, -8], [26, -1]];
    for (let i = 1; i < pathPts.length; i++) {
      const [ax, az] = pathPts[i - 1], [bx, bz] = pathPts[i];
      const L = Math.hypot(bx - ax, bz - az);
      merge.add(GEO.box, flat('#9a7a52'), at((ax + bx) / 2, 0.03, (az + bz) / 2, Math.atan2(bx - ax, bz - az), 3.4, 0.06, L + 0.6));
    }
    // The waterfall, with a path behind it.
    this.walls.push((x, z) => z < -24.5 && Math.abs(x) < 11);
    this.walls.push((x, z) => Math.hypot(Math.abs(x) - 7.5, z + 23.5) < 2.5);
    merge.add(GEO.rock, flat('#5a5a54'), at(0, 8, -27.5, 0, 24, 18, 7));
    merge.add(GEO.rock, flat('#6a6a64'), at(-7, 5, -23, 0.5, 7, 10, 4));
    merge.add(GEO.rock, flat('#6a6a64'), at(7, 5, -23, -0.5, 7, 10, 4));
    const fall = canvasTex(64, 256, (x) => { for (let i = 0; i < 110; i++) { x.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.5})`; x.fillRect(Math.random() * 64, Math.random() * 256, 2 + Math.random() * 4, 20 + Math.random() * 50); } });
    this.textures.push(fall);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(7, 15), new THREE.MeshBasicMaterial({ map: fall, color: '#cdeeff', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    sheet.position.set(0, 7.5, -20.6);
    this.scene.add(sheet);
    this.ticks.push((t) => { fall.offset.y = t * 1.6; });
    const plunge = new THREE.Mesh(new THREE.CircleGeometry(5, 28), water('#3a9ad0'));
    plunge.rotation.x = -Math.PI / 2;
    plunge.position.set(0, 0.06, -16.5);
    this.scene.add(plunge);
    this.walls.push((x, z) => Math.hypot(x, z + 16.5) < 4.6);
    this.area('💦 Behind the waterfall', 0, 5, -22.5);
    // Trees, vines and big leaves everywhere.
    const r = (s: number) => { const v = Math.sin(s * 91.7) * 43758.5453; return v - Math.floor(v); };
    for (let i = 0; i < 40; i++) {
      const a = r(i) * Math.PI * 2, d = 12 + r(i + 50) * 15;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.hypot(x - 5, z + 8) < 8 || (x > 13 && x < 25 && z > -9 && z < 11) || Math.abs(x) < 9 && z < -14) continue;
      const h = 9 + r(i + 7) * 9;
      merge.add(GEO.cyl, flat('#5a4630'), at(x, h / 2, z, 0, 0.7 + r(i + 3) * 0.5, h, 0.7 + r(i + 3) * 0.5));
      for (let k = 0; k < 5; k++) merge.add(GEO.cone, flat(['#2f7a32', '#3f8f3a', '#4a9a3a'][k % 3]), at(x, h, z, (k / 5) * Math.PI * 2, 1.2, 0.5, 6, 1.2));
      if (i % 2) this.walls.push((px, pz) => Math.hypot(px - x, pz - z) < 0.7);
    }
    for (let i = 0; i < 70; i++) {
      const a = r(i + 200) * Math.PI * 2, d = 3 + r(i + 300) * 26;
      merge.add(GEO.cyl6, flat('#3f7a32'), at(Math.cos(a) * d, 14 + r(i) * 6, Math.sin(a) * d, 0, 0.06, 8 + r(i + 9) * 8, 0.06));
    }
    for (let i = 0; i < 60; i++) {
      const a = r(i + 400) * Math.PI * 2, d = 6 + r(i + 500) * 22;
      merge.add(GEO.sph, flat(['#3f8f3a', '#2f7a32', '#5aa04a'][i % 3]), at(Math.cos(a) * d, 0.5, Math.sin(a) * d, a, 2.4, 1.1, 1.6));
    }
    // Mist drifting.
    const mist = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 600 }, (_, i) => (i % 3 === 1 ? r(i) * 6 : (r(i) - 0.5) * 50)), 3)), new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, transparent: true, opacity: 0.22, depthWrite: false, map: softDot() }));
    this.scene.add(mist);
    this.ticks.push((t) => { mist.position.x = Math.sin(t * 0.07) * 3; mist.position.z = Math.cos(t * 0.05) * 3; });
    // Pens.
    const hippos: Pen = { habitat: 'hippos', name: 'Hippo River', area: circ(-12, 8, 6), y: 0, water: { ...circ(-12.5, 8.5, 3.6), level: 0.1 }, trees: [] };
    this.pen(hippos, merge, 'stone', 1);
    this.pool(hippos);
    const tapirs: Pen = { habitat: 'tapirs', name: 'Tapir Trail', area: circ(10, 10, 5), y: 0 };
    this.pen(tapirs, merge, 'wood', 1.1);
    for (const [x, z] of [[9, 12], [12, 8]] as const) merge.add(GEO.sph, flat('#3f8f3a'), at(x, 0.6, z, 0, 2.6, 1.4, 2.2));
    const otters: Pen = { habitat: 'otters', name: 'Otter Creek', area: circ(-17, -6, 3.6), y: 0, water: { ...circ(-17.5, -6.5, 2.2), level: 0.1 } };
    this.pen(otters, merge, 'glass', 1.2);
    this.pool(otters);
    merge.add(GEO.box, flat('#7a8a9a'), at(-15.6, 0.6, -5, 0.6, 0.8, 0.1, 2.6, 0.4));
    // The monkeys' trees, tall enough to reach the canopy walk.
    const mTrees = [{ x: 3, z: -10, h: 15 }, { x: 7.5, z: -6.5, h: 16 }, { x: 1.5, z: -5, h: 14 }, { x: 8, z: -11, h: 15.5 }];
    const monkeys: Pen = { habitat: 'monkeys', name: 'Monkey Canopy', area: circ(5, -8, 6.5), y: 0, trees: mTrees };
    this.pen(monkeys, merge, 'stone', 1);
    for (const t of mTrees) {
      merge.add(GEO.cyl, flat('#5a4630'), at(t.x, t.h / 2, t.z, 0, 0.9, t.h, 0.9));
      for (let k = 0; k < 6; k++) merge.add(GEO.cone, flat(['#2f7a32', '#3f8f3a'][k % 2]), at(t.x, t.h, t.z, (k / 6) * Math.PI * 2, 1.4, 0.5, 6.5, 1.25));
      merge.add(GEO.cyl6, flat('#7a5636'), at(t.x, t.h * 0.66, t.z, 0.7, 0.2, 5, 0.2, 0, Math.PI / 2));
    }
    // The canopy walk: stairs up, a platform, a swaying bridge, and the elevator down.
    const ramp = rect(20, 23.5, -2, 10);
    this.floors.push(rampFloor('Stairs', ramp, 'z', 10, 0));
    this.steps(merge, ramp, 'z', 10, 0, '#8a6a44');
    const p1 = rect(14, 23.5, -8, -2), bridge = rect(-4, 14, -5.5, -3.5), p2 = rect(-8, -4, -10, 0.6);
    this.floors.push(areaFloor('Canopy Walk', p1, 10), areaFloor('Canopy Walk', bridge, 10), areaFloor('Canopy Walk', p2, 10));
    for (const pl of [p1, p2]) {
      merge.add(GEO.box, flat('#7a5636'), at(pl.x, 9.8, pl.z, 0, pl.hw! * 2, 0.4, pl.hd! * 2));
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) merge.add(GEO.cyl6, flat('#5a4630'), at(pl.x + dx * (pl.hw! - 0.3), 4.9, pl.z + dz * (pl.hd! - 0.3), 0, 0.5, 9.8, 0.5));
    }
    const planks = new THREE.Group();
    for (let x = -3.6; x < 14; x += 0.75) {
      const m = new THREE.Mesh(GEO.box, flat(x % 1.5 < 0.75 ? '#9a7048' : '#8a6040'));
      m.scale.set(0.6, 0.14, 2);
      m.position.set(x, 9.93, -4.5);
      planks.add(m);
    }
    for (const z of [-5.55, -3.45]) {
      const rope = new THREE.Mesh(GEO.cyl6, flat('#c8b088'));
      rope.scale.set(0.07, 18, 0.07);
      rope.rotation.z = Math.PI / 2;
      rope.position.set(5, 11, z);
      planks.add(rope);
      for (let x = -3.5; x < 14; x += 1.5) { const s = new THREE.Mesh(GEO.cyl6, flat('#c8b088')); s.scale.set(0.04, 1, 0.04); s.position.set(x, 10.5, z); planks.add(s); }
    }
    this.scene.add(planks);
    this.ticks.push((t) => {
      // A gentle wobble, more in the middle.
      planks.children.forEach((c, i) => { if (i < 24) c.position.y = 9.93 + Math.sin(t * 2 + i * 0.4) * 0.05 * Math.sin((i / 24) * Math.PI); });
      planks.rotation.x = Math.sin(t * 0.9) * 0.012;
    });
    // Railings on the walk.
    this.walls.push((x, z, y) => Math.abs(y - 10) < 1 && ((x > -4 && x < 14 && (Math.abs(z + 5.5) < 0.12 || Math.abs(z + 3.5) < 0.12))));
    this.elevator(merge, lift.x, lift.z, [0, 10], ['Ride up to the Canopy Walk', 'Ride down to the jungle floor'], ['Jungle floor', 'Canopy Walk']);
    this.area('🌉 Canopy Walk', 5, 14, -4.5);
    this.area('🌴 Lied Jungle', 0, 8, 10);
    // Macaws flying round under the roof.
    const macaw = species('macaw');
    if (macaw) for (let k = 0; k < 4; k++) {
      const f = animalFigure(macaw, 70 + k);
      this.scene.add(f.group);
      const rr = 10 + k * 3, hh = 12 + k * 1.5, sp = 0.25 + k * 0.05;
      this.ticks.push((t) => {
        const a = t * sp + k * 1.6;
        f.group.position.set(Math.cos(a) * rr, hh + Math.sin(t + k) * 1.2, Math.sin(a) * rr);
        f.group.rotation.y = -a;
        f.pose('fly', t, k, 3);
      });
    }
    this.exit(merge, 29.4, 0, 0, -Math.PI / 2);
    this.camBounds = (x, y, z) => { const d = Math.hypot(x, z); const k = d > R - 1.5 ? (R - 1.5) / d : 1; return { x: x * k, y: THREE.MathUtils.clamp(y, 0.6, 24), z: z * k }; };
    return { x: 26.5, y: 0, z: 0, h: -Math.PI / 2 };
  }
  private pool(p: Pen) {
    const w = p.water!;
    const g = w.r !== undefined ? new THREE.CircleGeometry(w.r, 28) : new THREE.PlaneGeometry(w.hw! * 2, w.hd! * 2);
    const m = new THREE.Mesh(g, water());
    m.rotation.x = -Math.PI / 2;
    m.position.set(w.x, w.level, w.z);
    this.scene.add(m);
  }

  // ---------- The Scott Aquarium ----------

  private buildAquarium(merge: Merge) {
    this.sky = null;
    this.moods = [{ bg: '#0c3558', fog: ['#16507a', 40, 140], hemi: 1.55, sun: 0.9 }];
    this.hemi.color.set('#a8d8ff');
    this.hemi.groundColor.set('#0a2a4a');
    const room = rect(-30, 30, -20, 20);
    const corridor = rect(-6, 28, -14, -10);
    const rampDown = rect(-6, 2, -14, -10), tunnel = rect(2, 22, -14, -10), rampUp = rect(22, 28, -14, -10);
    this.floors.push(areaFloor('Aquarium', room, 0, [corridor]));
    this.floors.push(rampFloor('Into the tunnel', rampDown, 'x', 0, -3), areaFloor('Shark Tunnel', tunnel, -3), rampFloor('Out of the tunnel', rampUp, 'x', -3, 0));
    this.ground(room, 0, '#2a3a4a', [corridor], 0.5);
    merge.add(GEO.box, flat('#1a2a38'), at(12, -3.25, -12, 0, 34, 0.5, 4));
    this.steps(merge, rampDown, 'x', 0, -3, '#2f4a62', true);
    this.steps(merge, rampUp, 'x', -3, 0, '#2f4a62', true);
    // Walls and a ceiling.
    for (const [x, z, w, d] of [[0, -20, 60, 0.6], [0, 20, 60, 0.6], [-30, 0, 0.6, 40], [30, 0, 0.6, 40]] as const) {
      const m = new THREE.Mesh(GEO.box, flat('#16304a'));
      m.position.set(x, 4.5, z);
      m.scale.set(w, 9, d);
      this.scene.add(m);
      this.collider(m);
    }
    const ceiling = new THREE.Mesh(GEO.box, flat('#0e2236'));
    ceiling.position.set(0, 9.2, 0);
    ceiling.scale.set(60, 0.4, 40);
    this.scene.add(ceiling);
    this.collider(ceiling);
    for (let x = -24; x <= 24; x += 8) merge.add(GEO.box, glow('#7dd3fc', 0.9), at(x, 8.95, 4, 0, 4, 0.1, 0.6));
    this.walls.push((x, z) => !inShape(room, x, z, -0.6));
    // The shark tank, with the tunnel through it.
    const tank = { x0: 0, x1: 24, z0: -19.5, z1: -4.5, y0: -5, y1: 4.5 };
    const tankMesh = new THREE.Mesh(new THREE.BoxGeometry(tank.x1 - tank.x0, tank.y1 - tank.y0, tank.z1 - tank.z0), water('#1a6ab0', 0.32));
    tankMesh.position.set((tank.x0 + tank.x1) / 2, (tank.y0 + tank.y1) / 2, (tank.z0 + tank.z1) / 2);
    this.scene.add(tankMesh);
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(tank.x1 - tank.x0, tank.y1 - tank.y0, tank.z1 - tank.z0)), new THREE.LineBasicMaterial({ color: '#9fd8ff' }));
    frame.position.copy(tankMesh.position);
    this.scene.add(frame);
    this.walls.push((x, z, y) => y > -1.5 && x > tank.x0 - 0.4 && x < tank.x1 + 0.4 && z > tank.z0 - 0.4 && z < tank.z1 + 0.4 && !(z > -14 && z < -10));
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 20, 28, 1, true, Math.PI / 2, Math.PI), glass(0.14, '#bfe8ff'));
    tube.rotation.z = Math.PI / 2;
    tube.position.set(12, -3, -12);
    this.scene.add(tube);
    this.collider(tube);
    for (let x = 2.5; x <= 21.5; x += 2.5) merge.add(new THREE.TorusGeometry(2.32, 0.06, 4, 24, Math.PI), flat('#9fb8c8', { metal: 0.5, rough: 0.3 }), at(x, -3, -12, Math.PI / 2, 1, 1, 1));
    // Sand, rocks and kelp at the bottom of the tank.
    merge.add(GEO.box, flat('#c8b88a'), at(12, -5, -12, 0, 24, 0.3, 15));
    for (let i = 0; i < 14; i++) {
      const x = 1 + ((i * 7.3) % 22), z = i % 2 ? -18 + (i % 3) : -6.5 - (i % 3);
      merge.add(GEO.rock, flat('#6a7a7a'), at(x, -4.4, z, i, 1.6, 1.2, 1.4));
      merge.add(GEO.cyl6, flat('#2f8a5a'), at(x + 0.6, -2.5, z, 0, 0.12, 4.5, 0.12, 0.1, 0.1));
    }
    // Caustic light rippling over everything in the tunnel.
    const caustic = canvasTex(128, 128, (x) => {
      x.fillStyle = '#000';
      x.fillRect(0, 0, 128, 128);
      x.strokeStyle = 'rgba(160,220,255,0.7)';
      x.lineWidth = 3;
      for (let i = 0; i < 18; i++) { x.beginPath(); x.ellipse(Math.random() * 128, Math.random() * 128, 10 + Math.random() * 20, 6 + Math.random() * 12, Math.random() * 3, 0, Math.PI * 2); x.stroke(); }
    });
    caustic.repeat.set(6, 1.5);
    this.textures.push(caustic);
    const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(20, 4), new THREE.MeshBasicMaterial({ map: caustic, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    floorGlow.rotation.x = -Math.PI / 2;
    floorGlow.position.set(12, -2.97, -12);
    this.scene.add(floorGlow);
    const tl = new THREE.PointLight('#4fb3ff', 40, 30, 1.2);
    tl.position.set(12, 2, -12);
    this.scene.add(tl);
    this.ticks.push((t) => { caustic.offset.set(t * 0.03, Math.sin(t * 0.4) * 0.05); tl.intensity = 36 + Math.sin(t * 1.7) * 8; });
    const sharks: Pen = {
      habitat: 'sharks', name: 'Shark Reef', area: rect(0, 24, -19.5, -4.5), y: -4.6,
      box: { x0: 0.8, x1: 23.2, y0: -4.4, y1: 3.8, z0: -19, z1: -5, avoid: (x, y, z) => x > 1 && x < 23 && Math.hypot(y + 3, z + 12) < 3.2 },
    };
    this.pens.push(sharks);
    this.area('🦈 Shark Tunnel', 12, 1.5, -12);
    this.sign('Shark Tunnel', '#0369a1', -6.2, 3, -12, -Math.PI / 2, 6, '🦈');
    // Railings along the ramps.
    for (const z of [-14.2, -9.8]) merge.add(GEO.box, flat('#9fb8c8'), at(-2, 1, z, 0, 8, 0.1, 0.1));
    // Penguin coast: ice, snow and their pool, behind glass.
    const ice: Pen = { habitat: 'penguins', name: 'Penguin Coast', area: rect(-28.5, -10.5, -19, -7.5), y: 0.6, water: { ...rect(-28.5, -19, -19, -12.5), level: 0.35 } };
    this.pen(ice, merge, 'glass', 3);
    merge.add(GEO.box, flat('#eef6ff'), at(-14.5, 0.3, -13, 0, 8, 0.6, 11));
    merge.add(GEO.box, flat('#eef6ff'), at(-23.5, 0.3, -9.5, 0, 10, 0.6, 4));
    for (const [x, z, h] of [[-12, -18, 4], [-16, -18.5, 6], [-21, -19, 5], [-26, -18.5, 3.5]] as const) merge.add(GEO.box, flat('#dbeeff'), at(x, h / 2, z, 0.2, 3.5, h, 1.5));
    this.pool(ice);
    const snow = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 450 }, (_, i) => (i % 3 === 0 ? -28 + Math.random() * 17 : i % 3 === 1 ? Math.random() * 8 : -19 + Math.random() * 11)), 3)), new THREE.PointsMaterial({ color: '#ffffff', size: 0.12 }));
    this.scene.add(snow);
    this.ticks.push((t, dt) => { const p = snow.geometry.getAttribute('position') as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) { let y = p.getY(i) - dt * 0.8; if (y < 0.6) y = 8; p.setY(i, y); } p.needsUpdate = true; void t; });
    this.area('🐧 Penguin Coast', -19, 5, -12);
    // The octopus grotto.
    const octo: Pen = { habitat: 'octopus', name: 'Octopus Grotto', area: circ(-20, 10, 2.6), y: 0.4, box: { x0: -21.8, x1: -18.2, y0: 0.5, y1: 3.2, z0: 8.2, z1: 11.8 } };
    this.pen(octo, merge, 'glass', 3.6);
    const ot = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 3.4, 24), water('#7a2a3a', 0.3));
    ot.position.set(-20, 1.9, 10);
    this.scene.add(ot);
    merge.add(GEO.rock, flat('#5a4a5a'), at(-20.6, 0.8, 10.6, 0, 1.8, 1.2, 1.6));
    merge.add(GEO.cyl, flat('#334155'), at(-20, 0.1, 10, 0, 5.8, 0.4, 5.8));
    this.area('🐙 Octopus Grotto', -20, 5, 10);
    // The jellyfish wall: glowing jellies bobbing behind glass.
    const jw = new THREE.Mesh(new THREE.BoxGeometry(16, 6, 1.2), water('#1a1040', 0.5));
    jw.position.set(0, 3.5, 19);
    this.scene.add(jw);
    this.walls.push((x, z) => Math.abs(x) < 8.3 && z > 18);
    const bell = new THREE.SphereGeometry(0.4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const jellies: THREE.Mesh[] = [];
    for (let k = 0; k < 18; k++) {
      const m = new THREE.Mesh(bell, glow(['#f9a8d4', '#a5b4fc', '#67e8f9', '#fde68a'][k % 4], 1.4));
      (m.material as THREE.MeshStandardMaterial).transparent = true;
      (m.material as THREE.MeshStandardMaterial).opacity = 0.75;
      m.position.set(-7 + (k % 9) * 1.75, 1.5 + (k % 4) * 1.2, 19 + (k % 2 ? 0.25 : -0.25));
      for (let s = 0; s < 4; s++) { const ten = new THREE.Mesh(GEO.cyl6, m.material); ten.scale.set(0.03, 0.9, 0.03); ten.position.set((s - 1.5) * 0.15, -0.45, 0); m.add(ten); }
      this.scene.add(m);
      jellies.push(m);
    }
    this.ticks.push((t) => jellies.forEach((m, k) => { m.position.y = 1.6 + (k % 4) * 1.2 + Math.sin(t * 0.8 + k) * 0.4; m.scale.y = 1 + Math.sin(t * 2.4 + k) * 0.18; }));
    this.area('🪼 Jellyfish Wall', 0, 7, 18);
    // A coral reef, with little fish.
    const reef = new THREE.Mesh(new THREE.BoxGeometry(18, 4, 5), water('#1e7ac8', 0.3));
    reef.position.set(19, 2.2, 16.5);
    this.scene.add(reef);
    this.walls.push((x, z) => x > 9.7 && z > 13.7);
    const coral = ['#f472b6', '#fb923c', '#facc15', '#a78bfa', '#f87171', '#34d399'];
    for (let i = 0; i < 24; i++) {
      const x = 10.8 + (i * 0.7) % 16.5, z = 14.6 + (i % 4) * 1;
      merge.add(i % 2 ? GEO.cone : GEO.sph, flat(coral[i % coral.length]), at(x, 0.7 + (i % 3) * 0.2, z, i, 0.6 + (i % 3) * 0.3, 0.9 + (i % 4) * 0.4, 0.6));
    }
    const fishGeo = new THREE.ConeGeometry(0.12, 0.45, 6);
    fishGeo.rotateZ(-Math.PI / 2);
    const fish = new THREE.InstancedMesh(fishGeo, new THREE.MeshStandardMaterial({ roughness: 0.5 }), 40);
    const fc = new THREE.Color();
    for (let i = 0; i < 40; i++) fish.setColorAt(i, fc.set(['#fde047', '#38bdf8', '#fb923c', '#f472b6', '#ffffff'][i % 5]));
    this.scene.add(fish);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    this.ticks.push((t) => {
      for (let i = 0; i < 40; i++) {
        const a = t * (0.4 + (i % 5) * 0.08) + i;
        const x = 19 + Math.cos(a) * (6 + (i % 3)), z = 16.5 + Math.sin(a * 1.3) * 1.6, y = 1 + (i % 6) * 0.45 + Math.sin(t + i) * 0.2;
        e.set(0, -a - Math.PI / 2, 0);
        fish.setMatrixAt(i, m4.compose(v.set(x, y, z), q.setFromEuler(e), s));
      }
      fish.instanceMatrix.needsUpdate = true;
    });
    this.area('🐠 Coral Reef', 19, 5.5, 16);
    this.area('🐧 Scott Aquarium', 0, 6.5, 4);
    this.exit(merge, 29.6, 0, 4, -Math.PI / 2);
    this.camBounds = (x, y, z, py) => {
      if (py < -1.2) return { x: THREE.MathUtils.clamp(x, -6, 28), y: THREE.MathUtils.clamp(y, py + 0.6, -1.1), z: THREE.MathUtils.clamp(z, -13.3, -10.7) };
      return { x: THREE.MathUtils.clamp(x, -29.3, 29.3), y: THREE.MathUtils.clamp(y, 0.6, 8.6), z: THREE.MathUtils.clamp(z, -19.3, 19.3) };
    };
    return { x: 27.5, y: 0, z: 4, h: -Math.PI / 2 };
  }

  // ---------- The Butterfly & Insect Pavilion ----------

  private buildButterflies(merge: Merge) {
    const R = 18;
    this.sky = { day: '#bfe6ff', night: '#0e1630' };
    this.moods = [{ bg: '#bfe6ff', fog: ['#f4f0d8', 25, 80], hemi: 1.1, sun: 1.1 }];
    this.hemi.color.set('#fff6e0');
    const roof = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass(0.12, '#fff8e0'));
    roof.scale.set(R, 9, R);
    roof.position.y = 2;
    this.scene.add(roof);
    this.collider(roof);
    const ribs = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.SphereGeometry(1, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2), 1), new THREE.LineBasicMaterial({ color: '#f4f4f0' }));
    ribs.scale.copy(roof.scale);
    ribs.position.copy(roof.position);
    this.scene.add(ribs);
    this.roundWall(merge, R, 2.2, -0.2, '#b45f3a', 0);
    const pond = circ(-4, 2, 4.5);
    this.ground(circ(0, 0, R), 0, '#7fb35c', [pond], 0.6);
    const bridge = rect(-9, 1, 1, 3);
    this.floors.push(areaFloor('Butterfly Garden', circ(0, 0, R - 0.8), 0, [pond]), areaFloor('Lily Pond Bridge', bridge, 0.35));
    const pw = new THREE.Mesh(new THREE.CircleGeometry(4.5, 32), water('#3a9ad0'));
    pw.rotation.x = -Math.PI / 2;
    pw.position.set(-4, -0.25, 2);
    this.scene.add(pw);
    merge.add(GEO.cyl, flat('#2f6a8a'), at(-4, -0.6, 2, 0, 9, 0.4, 9));
    // A giant water lily, and a few small ones.
    merge.add(GEO.cyl, flat('#3f9a3a'), at(-5.5, -0.18, 4.2, 0, 3.4, 0.08, 3.4));
    merge.add(GEO.cyl, flat('#5aaa4a'), at(-5.5, -0.13, 4.2, 0, 3.6, 0.04, 3.6));
    for (const [x, z] of [[-2, 0], [-6.5, 0], [-1.5, 4]] as const) merge.add(GEO.cyl, flat('#4a9a3a'), at(x, -0.18, z, 0, 1, 0.06, 1));
    merge.add(GEO.sph, flat('#fbcfe8'), at(-5.5, 0, 4.2, 0, 0.5, 0.4, 0.5));
    this.walls.push((x, z, y) => y < 0.2 && inShape(pond, x, z) && !inShape(bridge, x, z));
    for (let x = -8.6; x < 1; x += 0.6) merge.add(GEO.box, flat('#a07048'), at(x, 0.3, 2, 0, 0.5, 0.12, 2.1));
    for (const z of [0.95, 3.05]) merge.add(GEO.box, flat('#7a5636'), at(-4, 1, z, 0, 10, 0.1, 0.1));
    this.walls.push((x, z, y) => Math.abs(y - 0.35) < 0.3 && x > -9 && x < 1 && (Math.abs(z - 0.95) < 0.12 || Math.abs(z - 3.05) < 0.12));
    // Flower beds and bushes.
    const flowers = ['#f472b6', '#facc15', '#fb923c', '#a78bfa', '#f87171', '#ffffff', '#38bdf8'];
    const beds: Shape2[] = [circ(6, 8, 2.4), circ(-10, -6, 2.6), circ(-11, 9, 2.2), circ(3, -11, 2), circ(12, 4, 2), circ(-2, 12, 2)];
    beds.forEach((b, i) => {
      merge.add(GEO.cyl, flat('#6a4a2e'), at(b.x, 0.2, b.z, 0, b.r! * 2, 0.4, b.r! * 2));
      for (let k = 0; k < 14; k++) {
        const a = k * 2.4 + i, d = (k % 4) * b.r! * 0.25;
        merge.add(GEO.sph, flat(flowers[(k + i) % flowers.length]), at(b.x + Math.cos(a) * d, 0.75 + (k % 3) * 0.15, b.z + Math.sin(a) * d, 0, 0.45, 0.35, 0.45));
        merge.add(GEO.cyl6, flat('#3f8f3a'), at(b.x + Math.cos(a) * d, 0.5, b.z + Math.sin(a) * d, 0, 0.05, 0.6, 0.05));
      }
      this.walls.push((x, z, y) => y < 1 && inShape(b, x, z, 0.2));
    });
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + 0.2; if (Math.abs(a - Math.PI * 2) < 0.4 || a < 0.4) continue; merge.add(GEO.sph, flat(['#3f8f3a', '#4f9a3a'][i % 2]), at(Math.cos(a) * 16, 0.9, Math.sin(a) * 16, 0, 2.6, 1.8, 2.2)); }
    // The spiral stair up to the overlook.
    const cx = 9, cz = -5, aEnd = -Math.PI / 2, a0 = aEnd - 5.0;
    this.floors.push(spiralFloor('Spiral stair', cx, cz, 0.55, 2.4, a0, aEnd, 0, 4));
    merge.add(GEO.cyl, flat('#5a6470', { metal: 0.4 }), at(cx, 2.5, cz, 0, 1, 5, 1));
    this.walls.push((x, z) => Math.hypot(x - cx, z - cz) < 0.55);
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = a0 + ((i + 0.5) / n) * (aEnd - a0);
      const y = ((i + 1) / n) * 4;
      merge.add(GEO.box, flat('#a07048'), at(cx + Math.cos(a) * 1.5, y - 0.1, cz + Math.sin(a) * 1.5, -a, 1.9, 0.18, 1.1));
      merge.add(GEO.cyl6, flat('#3a3a42'), at(cx + Math.cos(a) * 2.45, y + 0.5, cz + Math.sin(a) * 2.45, 0, 0.05, 1, 0.05));
    }
    const look = rect(6, 13, -12.5, -7);
    this.floors.push(areaFloor('Overlook', look, 4));
    merge.add(GEO.box, flat('#a07048'), at(look.x, 3.85, look.z, 0, look.hw! * 2, 0.3, look.hd! * 2));
    for (const [x, z] of [[6.3, -12.2], [12.7, -12.2], [12.7, -7.3], [6.3, -7.3]] as const) merge.add(GEO.cyl6, flat('#5a6470'), at(x, 1.9, z, 0, 0.3, 3.8, 0.3));
    merge.add(GEO.box, flat('#3a3a42'), at(look.x, 4.9, -12.5, 0, 7, 0.08, 0.08));
    merge.add(GEO.box, flat('#3a3a42'), at(6, 4.9, look.z, 0, 0.08, 0.08, 5.5));
    this.walls.push((x, z, y) => Math.abs(y - 4) < 0.8 && ((z < -12.4 && x > 6 && x < 13) || (x < 6.1 && z < -7.2 && z > -12.5)));
    // Butterflies everywhere: the game's, plus many more fluttering about.
    const garden: Pen = { habitat: 'butterflies', name: 'Butterfly Garden', area: circ(0, 0, 15), y: 0, walkIn: true, fly: [0.8, 6] };
    this.pens.push(garden);
    const wing = new THREE.PlaneGeometry(0.35, 0.3);
    wing.translate(0.18, 0, 0);
    const wings = new THREE.InstancedMesh(wing, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.6, emissive: new THREE.Color('#222'), emissiveIntensity: 0.2 }), 160);
    const wc = new THREE.Color();
    const cols = ['#2a7ae8', '#f59e0b', '#ef4444', '#facc15', '#a855f7', '#f472b6', '#22d3ee', '#ffffff'];
    for (let i = 0; i < 80; i++) { wings.setColorAt(i * 2, wc.set(cols[i % cols.length])); wings.setColorAt(i * 2 + 1, wc.set(cols[i % cols.length])); }
    this.scene.add(wings);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
    this.ticks.push((t) => {
      for (let i = 0; i < 80; i++) {
        const a = t * (0.15 + (i % 7) * 0.03) + i * 1.7;
        const rr = 3 + (i % 11) * 1.2;
        const x = Math.cos(a) * rr + Math.sin(t * 0.7 + i) * 1.2, z = Math.sin(a * 1.1) * rr, y = 0.9 + (i % 9) * 0.55 + Math.sin(t * 1.3 + i) * 0.4;
        const flap = Math.sin(t * 14 + i) * 0.9;
        for (const side of [1, -1]) {
          e.set(0, -a, side * flap);
          sc.set(side, 1, 1);
          wings.setMatrixAt(i * 2 + (side > 0 ? 0 : 1), m4.compose(v.set(x, y, z), q.setFromEuler(e), sc));
        }
      }
      wings.instanceMatrix.needsUpdate = true;
    });
    this.area('🦋 Butterfly Garden', 0, 6.5, -2);
    this.area('🪷 Lily Pond', -4, 3, 2);
    this.area('🔭 Overlook', 9.5, 7, -10);
    this.exit(merge, 17.6, 0, 0, -Math.PI / 2);
    this.camBounds = (x, y, z) => { const d = Math.hypot(x, z); const k = d > R - 1.2 ? (R - 1.2) / d : 1; return { x: x * k, y: THREE.MathUtils.clamp(y, 0.6, 9.5), z: z * k }; };
    return { x: 15.5, y: 0, z: 0, h: -Math.PI / 2 };
  }

  // ---------- Walking ----------

  /** The floor under you: the highest one within a step of your feet. */
  private floorAt(x: number, z: number, y: number): { h: number; name: string } | null {
    let best: { h: number; name: string } | null = null;
    for (const f of this.floors) {
      const h = f.h(x, z);
      if (h === null || h > y + 0.75 || h < y - 1.1) continue;
      if (!best || h > best.h) best = { h, name: f.name };
    }
    return best;
  }
  private blocked(x: number, z: number, y: number) {
    if (this.walls.some((w) => w(x, z, y))) return true;
    // Bump your head under anything just above you.
    for (const f of this.floors) { const h = f.h(x, z); if (h !== null && h - y > 0.75 && h - y < 2.2) return true; }
    return false;
  }
  private canStand(x: number, z: number, y: number) {
    const f = this.floorAt(x, z, y);
    return f && !this.blocked(x, z, f.h) ? f : null;
  }

  turn(dx: number) { this.look = THREE.MathUtils.clamp(this.look + dx, -Math.PI, Math.PI); }

  private elevatorUnder() {
    const p = this.player;
    return this.elevators.find((e) => Math.hypot(p.x - e.x, p.z - e.z) < e.r - 0.1 && Math.abs(p.y - e.y) < 0.6) ?? null;
  }
  /** An elevator waiting on another floor, at the doors right where you are. */
  private elevatorToCall() {
    const p = this.player;
    return this.elevators.find((e) => !e.moving && Math.hypot(p.x - e.x, p.z - e.z) < e.r + 1.6 && Math.abs(p.y - e.y) > 0.6 && e.stops.some((s) => Math.abs(s - p.y) < 0.6)) ?? null;
  }
  useElevator() {
    const call = this.elevatorToCall();
    if (call && !this.elevatorUnder()) {
      call.from = call.y;
      call.to = call.stops.find((s) => Math.abs(s - this.player.y) < 0.6)!;
      call.t = 0;
      call.moving = true;
      ding();
      return;
    }
    const e = this.elevatorUnder();
    if (!e || e.moving) return;
    const i = e.stops.indexOf(e.to);
    const next = e.stops[(i + 1) % e.stops.length];
    e.from = e.y;
    e.to = next;
    e.t = 0;
    e.moving = true;
    ding();
  }

  step(dt: number, input: { steer: number; push: number; boost: boolean }, hour: number) {
    if (this.disposed) return;
    this.time += dt;
    this.hour = hour;
    const t = this.time;
    const p = this.player;
    // The elevator, carrying you if you're on it.
    let riding = false;
    for (const e of this.elevators) {
      if (!e.moving) continue;
      const on = Math.hypot(p.x - e.x, p.z - e.z) < e.r && Math.abs(p.y - e.y) < 0.8;
      e.t = Math.min(1, e.t + dt / 2.6);
      const k = e.t * e.t * (3 - 2 * e.t);
      e.y = e.from + (e.to - e.from) * k;
      e.platform.position.y = e.y;
      if (on) { p.y = e.y; riding = true; }
      if (e.t >= 1) { e.moving = false; ding(); }
    }
    if (!riding) {
      p.speed += ((input.boost ? 10 : 5.5) * input.push - p.speed) * Math.min(1, dt * 10);
      p.heading -= input.steer * 2.6 * dt;
      const f = { x: Math.sin(p.heading), z: Math.cos(p.heading) };
      const nx = p.x + f.x * p.speed * dt, nz = p.z + f.z * p.speed * dt;
      let on = this.canStand(nx, nz, p.y);
      if (on) { p.x = nx; p.z = nz; }
      else if ((on = this.canStand(nx, p.z, p.y))) { p.x = nx; p.speed *= 1 - 2 * dt; }
      else if ((on = this.canStand(p.x, nz, p.y))) { p.z = nz; p.speed *= 1 - 2 * dt; }
      else p.speed = 0;
      const here = this.floorAt(p.x, p.z, p.y);
      if (here) {
        p.y += (here.h - p.y) * Math.min(1, dt * 14);
        if (here.name !== 'elevator' && here.name !== this.floorName) {
          const was = this.floorName;
          this.floorName = here.name;
          if (was) this.cb.onFloor?.(here.name);
          this.applyMood(false);
        }
      }
      if (Math.abs(input.push) > 0.1) this.look *= Math.exp(-dt * 1.2);
    }
    const moving = Math.abs(p.speed) > 0.3;
    this.walkT += dt * Math.abs(p.speed);
    const body = p.obj.userData.body as THREE.Object3D | undefined;
    if (body) {
      body.position.y = 0.8 + (moving ? Math.abs(Math.sin(this.walkT * 1.4)) * 0.18 : Math.sin(t * 1.7) * 0.03);
      body.rotation.z = moving ? Math.sin(this.walkT * 1.4) * 0.08 : 0;
    }
    p.obj.position.set(p.x, p.y + 0.02, p.z);
    p.obj.rotation.set(0, p.heading, 0);

    // The camera: behind you, closer than outside, and never through a wall.
    const yaw = p.heading + this.look;
    const head = new THREE.Vector3(p.x, p.y + 1.6, p.z);
    const want = new THREE.Vector3(p.x - Math.sin(yaw) * 8, p.y + 3.8, p.z - Math.cos(yaw) * 8);
    const dir = want.clone().sub(head);
    const full = dir.length();
    dir.normalize();
    this.ray.set(head, dir);
    this.ray.far = full;
    const hit = this.ray.intersectObjects(this.colliders, false)[0];
    if (hit) {
      // Pulled in by a wall behind you: rise up and look over your own head instead.
      const d = Math.max(0.6, hit.distance - 0.35);
      want.copy(head).addScaledVector(dir, d);
      want.y += (1 - d / full) * 2.2;
    }
    const c = this.camBounds(want.x, want.y, want.z, p.y);
    want.set(c.x, c.y, c.z);
    // Too close to see past yourself: fade you out.
    p.obj.visible = this.camera.position.distanceTo(head) > 1.8;
    this.camera.position.lerp(want, 1 - Math.exp(-dt * 8));
    this.camera.lookAt(p.x + Math.sin(yaw) * 4, p.y + 1.4, p.z + Math.cos(yaw) * 4);

    // The sky through the glass, and the mood of the level you're on.
    if (this.sky) {
      const dark = hour >= 7 && hour < 18.5 ? 0 : hour >= 18.5 && hour < 21 ? (hour - 18.5) / 2.5 : hour >= 5 && hour < 7 ? 1 - (hour - 5) / 2 : 1;
      const below = this.moods.find((m) => m.below !== undefined && p.y < m.below);
      if (!below) {
        (this.scene.background as THREE.Color).set(this.sky.day).lerp(new THREE.Color(this.sky.night), dark);
        this.sun.intensity = (this.moods[0].sun) * (1 - dark * 0.8);
        this.hemi.intensity = this.moods[0].hemi * (1 - dark * 0.5);
      }
    }

    for (const f of this.ticks) f(t, dt);
    this.stepCritters(dt, t);
    this.stepThings(dt);

    // What you're next to.
    let near: InteriorNear | null = null, best = Infinity;
    if (!riding) {
      const el = this.elevatorUnder();
      if (el && !el.moving) { near = { kind: 'elevator', label: el.labels[Math.max(0, el.stops.indexOf(el.to))] }; best = -1; }
      else if (this.elevatorToCall()) { near = { kind: 'elevator', label: 'Call the elevator' }; best = -1; }
      for (const x of this.exits) {
        const d = Math.hypot(x.x - p.x, x.z - p.z);
        if (d < 4 && Math.abs(x.y - p.y) < 1.5 && d < best) { near = { kind: 'exit' }; best = d; }
      }
      for (const pen of this.pens) {
        if (Math.abs(pen.y - p.y) > 3.5 && !(pen.box && p.y < pen.box.y1 && p.y > pen.box.y0 - 1)) continue;
        if (!this.critterList(pen).length) continue;
        const e = edgeOf(pen.area, p.x, p.z);
        const d = pen.walkIn ? (e < 0 ? 0.5 : e) : e;
        const reach = pen.box ? 4.5 : 4;
        if (d < reach && d < best) { near = { kind: 'habitat', id: pen.habitat, name: pen.name }; best = d; }
      }
    }
    const key = (n: InteriorNear | null) => (n ? JSON.stringify(n) : '');
    if (key(near) !== key(this.near)) { this.near = near; this.cb.onNear(near); }
  }

  private applyMood(first: boolean) {
    const p = this.player;
    const y = p ? p.y : 0;
    const m = this.moods.find((x) => x.below !== undefined && y < x.below) ?? this.moods[0];
    if (!m) return;
    this.scene.background = new THREE.Color(m.bg);
    this.scene.fog = new THREE.Fog(m.fog[0], m.fog[1], m.fog[2]);
    this.hemi.intensity = m.hemi;
    this.sun.intensity = m.sun;
    void first;
  }

  // ---------- The animals ----------

  private critterList(pen: Pen) { return [...this.critters.values()].filter((c) => c.pen === pen); }
  private penFor(a: Animal) {
    return this.pens.find((p) => p.habitat === a.habitat && (!p.species || p.species.includes(a.species))) ?? null;
  }

  sync(z: Zoo) {
    const seen = new Set<string>();
    for (const a of z.animals) {
      if (a.loose || a.habitat === '__away') continue;
      const pen = this.penFor(a);
      if (!pen) continue;
      seen.add(a.id);
      const baby = a.born !== undefined;
      let c = this.critters.get(a.id);
      if (c && c.baby !== baby) { this.drop(c); c = undefined; }
      if (!c) {
        const sp = species(a.species);
        if (!sp) continue;
        const seed = hash(a.id) >>> 0;
        const fig = animalFigure(sp, seed, baby);
        const spot = this.spot(pen, sp);
        c = {
          a, sp, fig, pen, baby, x: spot.x, y: spot.y, z: spot.z, heading: (seed % 628) / 100, to: null, state: 'stand',
          wait: (seed % 40) / 10, phase: (seed % 1000) / 100, speed: 0, climb: null, eatUntil: 0, label: this.label('', 'kz-animal'),
        };
        const id = a.id;
        c.label.onclick = () => this.cb.onPick({ kind: 'animal', id });
        fig.group.userData.critter = a.id;
        this.scene.add(fig.group);
        this.critters.set(a.id, c);
      }
      c.a = a;
      const html = `${a.sick ? '🤒 ' : ''}${baby ? '🍼 ' : ''}${a.name || 'New baby'}<i></i>`;
      if (c.label.dataset.html !== html) { c.label.innerHTML = html; c.label.dataset.html = html; }
    }
    for (const [id, c] of this.critters) if (!seen.has(id)) this.drop(c);
  }
  private drop(c: Critter) {
    c.fig.group.removeFromParent();
    c.label.remove();
    this.critters.delete(c.a.id);
  }

  /** Somewhere for an animal to go: in the water, in the air, or on the ground, as suits it. */
  private spot(pen: Pen, sp: Species, wantWater = false): { x: number; y: number; z: number } {
    const body = sp.look.body;
    if (pen.box && (body === 'fish' || sp.swims)) {
      const b = pen.box;
      for (let k = 0; k < 30; k++) {
        const x = b.x0 + Math.random() * (b.x1 - b.x0), y = b.y0 + Math.random() * (b.y1 - b.y0), z = b.z0 + Math.random() * (b.z1 - b.z0);
        if (!b.avoid?.(x, y, z)) return { x, y, z };
      }
      return { x: b.x0, y: b.y0, z: b.z0 };
    }
    if ((body === 'fish' || wantWater) && pen.water) {
      const s = randIn(pen.water, 0.8);
      return { x: s.x, y: body === 'fish' ? pen.water.level - 0.5 : pen.water.level, z: s.z };
    }
    for (let k = 0; k < 20; k++) {
      const s = randIn(pen.area, pen.walkIn ? 0.92 : 0.82);
      if (pen.water && inShape(pen.water, s.x, s.z, 0.3)) continue;
      return { x: s.x, y: pen.y, z: s.z };
    }
    return { x: pen.area.x, y: pen.y, z: pen.area.z };
  }

  private stepCritters(dt: number, t: number) {
    const cam = this.camera.position;
    for (const c of this.critters.values()) {
      const sp = c.sp, body = sp.look.body, pen = c.pen;
      const far = Math.hypot(c.x - cam.x, c.y - cam.y, c.z - cam.z) > 70;
      c.fig.group.visible = !far;
      if (far && Math.random() > 0.1) continue;
      const step = far ? dt * 10 : dt;
      const up = pen.night ? this.hour >= 6 && this.hour < 21 : awake(sp, this.hour);
      // Anything in a big tank swims all around it, up and down.
      const fish = body === 'fish' || Boolean(pen.box);
      const flier = body === 'bat' || body === 'butterfly' || (sp.flies && Boolean(pen.fly));
      let state: AnimalState = 'stand';
      let speed = 0;
      if (!up && !fish) {
        state = 'sleep';
        c.to = null;
        if (c.climb) c.climb.up = false;
        if (body === 'bat' && pen.perch !== undefined) c.y += (pen.perch - c.y) * Math.min(1, step * 2);
        else if (!c.climb) c.y += (pen.y - c.y) * Math.min(1, step * 2);
      } else {
        const food = this.foods.find((f) => f.pen === pen);
        const toy = this.toys.find((y) => y.pen === pen);
        if (c.eatUntil > t) { state = 'eat'; c.to = null; }
        else if (food && !flier && !c.climb) {
          const d = Math.hypot(food.x - c.x, food.z - c.z);
          if (d < 0.9 + c.fig.height * 0.3) { c.eatUntil = t + 6 + Math.random() * 6; c.heading = Math.atan2(food.x - c.x, food.z - c.z); }
          else c.to = { x: food.x + Math.sin(c.phase) * 0.6, y: fish ? food.y - 0.3 : pen.y, z: food.z + Math.cos(c.phase) * 0.6 };
          speed = sp.speed * 1.5;
        } else if (toy && !fish && !flier && !c.climb && body !== 'snake' && body !== 'reptile') {
          c.to = { x: toy.x, y: pen.y, z: toy.z };
          speed = sp.speed * 2;
        } else if (c.climb) {
          const cl = c.climb;
          if (cl.up) { cl.t = Math.min(1, cl.t + step * 0.22); if (cl.t >= 1) { cl.sit -= step; if (cl.sit < 0) cl.up = false; } }
          else { cl.t = Math.max(0, cl.t - step * 0.3); if (cl.t <= 0) c.climb = null; }
          c.x = cl.x; c.z = cl.z;
          c.y = pen.y + cl.top * cl.t;
          state = cl.t >= 1 ? 'sit' : 'climb';
        } else if (!c.to && (c.wait -= step) < 0) {
          const r = Math.random();
          if (sp.climbs && pen.trees?.length && r < 0.4) {
            const tr = pen.trees[Math.floor(Math.random() * pen.trees.length)];
            c.to = { x: tr.x + 0.45, y: pen.y, z: tr.z };
            (c.to as { tree?: number }).tree = tr.h * (sp.id === 'sloth' ? 0.85 : 0.68);
          } else if (flier && pen.fly && r < (body === 'bat' ? 0.85 : 0.7)) {
            const s = randIn(pen.area, 0.85);
            c.to = { x: s.x, y: pen.fly[0] + Math.random() * (pen.fly[1] - pen.fly[0]), z: s.z };
          } else {
            const s = this.spot(pen, sp, Boolean(sp.swims && pen.water && r < 0.5));
            c.to = s;
          }
          c.wait = (fish ? 0.4 : 2.5) + Math.random() * (fish ? 2 : 8);
        }
        if (!speed) speed = sp.speed * (fish ? 0.9 : 1) * (flier ? 1.4 : 1);
      }
      if (c.to && !c.climb) {
        const dx = c.to.x - c.x, dy = c.to.y - c.y, dz = c.to.z - c.z, d = Math.hypot(dx, dz, fish || flier ? dy : 0);
        if (d < 0.2) {
          const tree = (c.to as { tree?: number }).tree;
          c.to = null;
          if (tree && sp.climbs && up) c.climb = { x: c.x, z: c.z, top: tree, t: 0, up: true, sit: 6 + Math.random() * 10 };
        } else {
          const mv = Math.min(d, speed * step);
          c.x += (dx / d) * mv;
          c.z += (dz / d) * mv;
          if (fish || flier) c.y += (dy / d) * mv;
          c.heading = turnTo(c.heading, Math.atan2(dx, dz), Math.min(1, step * 5));
          state = speed > 3.2 ? 'run' : 'walk';
        }
      }
      if (!c.climb) {
        if (fish) state = 'swim';
        else if (flier && up) { if (c.y > pen.y + 0.4) state = 'fly'; else if (!c.to) c.y += (pen.y - c.y) * Math.min(1, step * 3); }
        else if (pen.water && sp.swims && inShape(pen.water, c.x, c.z) && state !== 'sleep') { c.y = pen.water.level; state = 'swim'; }
        else if (!flier && state !== 'sleep') c.y = pen.y;
        if (body === 'bat' && !up && pen.perch !== undefined) state = 'sleep';
      }
      c.state = state;
      if (!c.fig.group.visible) continue;
      c.fig.group.position.set(c.x, c.y, c.z);
      c.fig.group.rotation.y = c.heading;
      c.fig.pose(state, t, c.phase, speed);
    }
  }

  feed(habitatId: string) {
    const p = this.player;
    for (const pen of this.pens.filter((x) => x.habitat === habitatId)) {
      if (!this.critterList(pen).length) continue;
      const first = this.critterList(pen)[0].sp;
      const fishy = first.look.body === 'fish' || first.id === 'penguin' || first.id === 'alligator' || first.id === 'otter';
      for (let k = 0; k < 4; k++) {
        // On the side nearest you, a little way in.
        const dx = p.x - pen.area.x, dz = p.z - pen.area.z, d = Math.hypot(dx, dz) || 1;
        const reach = pen.area.r ?? Math.min(pen.area.hw!, pen.area.hd!);
        const off = reach * (0.45 + Math.random() * 0.2);
        const x = pen.area.x + (dx / d) * off + (Math.random() - 0.5) * 1.2, z = pen.area.z + (dz / d) * off + (Math.random() - 0.5) * 1.2;
        const y = pen.box ? pen.box.y1 - 0.5 : pen.water && inShape(pen.water, x, z) ? pen.water.level : pen.y;
        const g = new THREE.Group();
        const color = fishy ? '#9ca3af' : /meat/.test(first.food) ? '#b91c1c' : /fruit|banana|melon|orange/.test(first.food) ? '#f59e0b' : '#65a30d';
        for (let i = 0; i < 5; i++) {
          const m = new THREE.Mesh(fishy ? new THREE.ConeGeometry(0.1, 0.4, 5) : new THREE.IcosahedronGeometry(0.18, 0), flat(color));
          m.position.set((Math.random() - 0.5) * 0.5, 0.08 + Math.random() * 0.1, (Math.random() - 0.5) * 0.5);
          m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
          g.add(m);
        }
        g.position.set(x, y, z);
        this.scene.add(g);
        this.foods.push({ pen, x, y, z, until: this.time + 24, obj: g });
      }
    }
  }
  play(habitatId: string) {
    for (const pen of this.pens.filter((x) => x.habitat === habitatId && !x.box)) {
      if (!this.critterList(pen).length) continue;
      const obj = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), flat(['#ef4444', '#3b82f6', '#facc15', '#22c55e'][Math.floor(Math.random() * 4)]));
      this.scene.add(obj);
      const a = Math.random() * Math.PI * 2;
      this.toys.push({ pen, obj, x: pen.area.x, z: pen.area.z, vx: Math.cos(a) * 3, vz: Math.sin(a) * 3, until: this.time + 30 });
    }
  }
  private stepThings(dt: number) {
    for (let i = this.foods.length - 1; i >= 0; i--) if (this.foods[i].until < this.time) { this.foods[i].obj.removeFromParent(); this.foods.splice(i, 1); }
    for (let i = this.toys.length - 1; i >= 0; i--) {
      const y = this.toys[i];
      if (y.until < this.time) { y.obj.removeFromParent(); this.toys.splice(i, 1); continue; }
      for (const c of this.critters.values()) if (c.pen === y.pen && Math.hypot(c.x - y.x, c.z - y.z) < 0.8 + c.fig.height * 0.3) {
        const a = c.heading + (Math.random() - 0.5);
        y.vx += Math.sin(a) * 4; y.vz += Math.cos(a) * 4;
      }
      const nx = y.x + y.vx * dt, nz = y.z + y.vz * dt;
      if (edgeOf(y.pen.area, nx, nz) > -0.5) { y.vx *= -0.8; y.vz *= -0.8; } else { y.x = nx; y.z = nz; }
      y.vx *= 1 - dt * 0.8; y.vz *= 1 - dt * 0.8;
      const ground = y.pen.water && inShape(y.pen.water, y.x, y.z) ? y.pen.water.level : y.pen.y;
      y.obj.position.set(y.x, ground + 0.35, y.z);
      y.obj.rotation.x += y.vz * dt;
      y.obj.rotation.z -= y.vx * dt;
    }
  }

  // ---------- Taps, labels, the rest ----------

  tap(ndc: THREE.Vector2): { kind: 'animal'; id: string } | null {
    this.ray.setFromCamera(ndc, this.camera);
    this.ray.far = 80;
    const list = [...this.critters.values()].filter((c) => c.fig.group.visible);
    const hit = this.ray.intersectObjects(list.map((c) => c.fig.group), true)[0];
    if (!hit) return null;
    let o: THREE.Object3D | null = hit.object;
    while (o && !o.userData.critter) o = o.parent;
    return o ? { kind: 'animal', id: o.userData.critter } : null;
  }
  hover(ndc: THREE.Vector2) { return Boolean(this.tap(ndc)); }

  placeLabels(w: number, h: number) {
    const cam = this.camera.position;
    const place = (el: HTMLDivElement, pos: THREE.Vector3, maxD: number) => {
      const d = pos.distanceTo(cam);
      this.v3.copy(pos).project(this.camera);
      if (this.v3.z > 1 || d > maxD || Math.abs(this.v3.x) > 1.15 || Math.abs(this.v3.y) > 1.15) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
      el.style.display = '';
      el.style.opacity = String(Math.min(1, (maxD - d) / (maxD * 0.3)));
      el.style.transform = `translate(-50%, -100%) translate(${((this.v3.x + 1) / 2) * w}px, ${((1 - this.v3.y) / 2) * h}px)`;
    };
    const p = this.player;
    for (const l of this.areaLabels) place(l.el, l.pos, Math.abs(l.pos.y - p.y) > 12 ? 0 : 70);
    const list = [...this.critters.values()].map((c) => ({ c, d: Math.hypot(c.x - p.x, c.z - p.z, (c.y - p.y) * 1.5) })).sort((a, b) => a.d - b.d);
    // Only animals on your own level (or right there to look down at), not through the floor.
    const show = new Set(list.filter((x) => x.d < 20 && (x.c.y - p.y > -6 && x.c.y - p.y < 8)).slice(0, 10).map((x) => x.c));
    const pos = new THREE.Vector3();
    for (const { c } of list) {
      if (!show.has(c) || !c.fig.group.visible) { if (c.label.style.display !== 'none') c.label.style.display = 'none'; continue; }
      const zz = c.state === 'sleep' ? ' 💤' : '';
      const i = c.label.querySelector('i');
      if (i && i.textContent !== zz) i.textContent = zz;
      pos.set(c.x, c.y + (c.sp.look.body === 'bat' ? 0.4 : c.fig.height + 0.5), c.z);
      place(c.label, pos, 40);
    }
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    this.layer.remove();
    const shared = new Set<THREE.BufferGeometry>(Object.values(GEO));
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry && !shared.has(m.geometry)) m.geometry.dispose(); });
    for (const t of this.textures) t.dispose();
  }
}

/** A soft two-note ding for the elevator. */
let audio: AudioContext | null = null;
function ding() {
  try {
    audio ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const now = audio.currentTime;
    for (const [f, at] of [[880, 0], [660, 0.18]] as const) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + at);
      g.gain.exponentialRampToValueAtTime(0.08, now + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.6);
      o.connect(g).connect(audio.destination);
      o.start(now + at);
      o.stop(now + at + 0.7);
    }
  } catch { /* no sound, no matter */ }
}

/** The exhibits each interior holds, for anyone who needs to know where an animal lives. */
export const INTERIOR_EXHIBITS: Record<InteriorId, string[]> = {
  desert: ['desert', 'night'],
  jungle: ['jungle'],
  aquarium: ['aquarium'],
  butterflies: ['butterflies'],
};
void EXHIBITS;

/** A soft round puff, so mist reads as mist and not squares. */
let dot: THREE.Texture | null = null;
function softDot() {
  if (dot) return dot;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  dot = new THREE.CanvasTexture(c);
  return dot;
}
