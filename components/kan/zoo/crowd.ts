import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ZooWorld } from './world';

/**
 * The visitors: families wandering the paths together, stopping to look at the
 * animals, kids hopping and pointing, a few with balloons, a few grown-ups pushing
 * strollers, grandparents taking it slow. As many as are in the zoo right now (more
 * on a sunny Saturday, a few keepers in khaki at night). After dark, on lantern
 * nights, they carry flashlights.
 *
 * Everyone is jointed like a real person (hips, knees, shoulders, elbows, a neck),
 * with a face, hair that sits on the head, and clothes. Each part is one instanced
 * mesh, placed down its joint chain each frame, so a couple of hundred people still
 * cost under thirty draw calls. Faces and small details are only drawn up close.
 */

type Kind = 'adult' | 'teen' | 'kid' | 'grand' | 'keeper';
/** 0 bald, 1 short, 2 long, 3 ponytail, 4 bun, 5 curly, 6 buzz, 7 braids, 8 pigtails. */
type Hair = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
interface Node { x: number; z: number; next: number[] }
interface Person {
  from: number; to: number; k: number; len: number;
  side: number; speed: number; pause: number; kind: Kind;
  /** 0 → 1 as they arrive, 1 → 0 as they leave. */
  fade: number; leaving: boolean; phase: number;
  x: number; z: number; heading: number;
  /** Where they're looking while stopped. */
  look: number;
  /** The grown-up this one follows, how far behind, and how far to the side. */
  lead: Person | null; back: number;
  walkT: number;
  /** Seconds left pointing at something, and hopping. */
  point: number; hop: number;
  /** Overall size, how broad, how big the head is for the body, and a stoop. */
  scale: number; w: number; hs: number; lean: number;
  shirt: THREE.Color; pants: THREE.Color; skin: THREE.Color; hairColor: THREE.Color; hatColor: THREE.Color; packColor: THREE.Color;
  shoes: THREE.Color; decoColor: THREE.Color;
  hair: Hair; hat: 0 | 1 | 2 | 3; skirt: boolean; shorts: boolean; longSleeves: boolean;
  /** 0 plain, 1 stripes, 2 a logo on the front. */
  deco: 0 | 1 | 2;
  glasses: boolean; pack: boolean; stroller: boolean; balloon: number;
  /** Already met an animal you were walking: once is the memory. */
  met?: boolean;
}
/** A guest, as the scene sees one: where they are and who they are. */
export type Guest = { readonly x: number; readonly z: number; readonly kind: Kind };
interface Slot { im: THREE.InstancedMesh; n: number }

const SHIRTS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f5f5f4', '#1f2937', '#a3e635', '#14b8a6', '#fb7185', '#fde047', '#60a5fa', '#9ca3af', '#0f766e', '#b91c1c'];
const PANTS = ['#1e3a8a', '#334155', '#3b5b8c', '#1f2937', '#a8a29e', '#57534e', '#d6c7a1', '#4b5563', '#2c4a6e'];
const SHORTS = ['#3b5b8c', '#d6c7a1', '#1f2937', '#78716c', '#16a34a', '#f472b6', '#e5e7eb', '#7c3aed'];
const SKIN = ['#f6d7c3', '#efc3a4', '#e3ad88', '#d29a72', '#bb8058', '#9c6744', '#7d4e32', '#5f3a25', '#4a2c1c'];
const HAIR = ['#1a1412', '#2e211a', '#4a3020', '#6b4528', '#8a5a32', '#a87943', '#c9a15d', '#e2c27f', '#8e3b1f'];
const GRAY = ['#d6d3d1', '#e7e5e4', '#a8a29e', '#f5f5f4', '#c4c0bb'];
const HATS = ['#fef3c7', '#f472b6', '#38bdf8', '#ef4444', '#22c55e', '#1f2937', '#f5f5f4'];
const SHOES = ['#f5f5f4', '#f5f5f4', '#1f2937', '#ef4444', '#3b82f6', '#ec4899', '#6b7280', '#78350f', '#a3e635'];
const DECO = ['#ffffff', '#fde047', '#1f2937', '#f472b6', '#38bdf8'];
const BALLOONS = ['#ef4444', '#3b82f6', '#facc15', '#22c55e', '#ec4899', '#a855f7'];
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const range = (a: number, b: number) => a + Math.random() * (b - a);

/** Paints a geometry one color, so parts merged into one mesh can be several colors (eyes and pupils). */
function tint(g: THREE.BufferGeometry, hex: string) {
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function merge(parts: THREE.BufferGeometry[]) {
  const list = parts.map((g) => { const x = g.index ? g.toNonIndexed() : g; x.deleteAttribute('uv'); return x; });
  return mergeGeometries(list, false)!;
}
const sphere = (r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);

// The skeleton, for a grown-up about 1.65 tall, from the ground up.
const HIP = 0.84, THIGH = 0.4, SHIN = 0.37, WAIST = 0.96;
const SHOULDER = 0.33, UPPER = 0.27, FORE = 0.24, NECK = 0.38, HEAD = 0.19;

export class Crowd {
  private nodes: Node[] = [];
  private gates: number[] = [];
  private people: Person[] = [];
  private slots: Slot[] = [];
  private thigh: Slot; private shin: Slot; private shoe: Slot; private sole: Slot; private pelvis: Slot; private torso: Slot;
  private stripe: Slot; private logo: Slot; private skirt: Slot; private sleeve: Slot; private upper: Slot; private fore: Slot; private hands: Slot;
  private head: Slot; private face: Slot; private brows: Slot; private specs: Slot;
  private hairCap: Slot; private hairLong: Slot; private curls: Slot; private hairPiece: Slot;
  private sunHat: Slot; private cap: Slot; private pack: Slot; private stroller: Slot;
  private balloons: Slot; private strings: Slot; private beams: Slot;
  private want = 0;
  private flashlights = false;
  private keepers = 0;
  // Scratch, so nothing is allocated per frame.
  private B = new THREE.Matrix4();
  private L = new THREE.Matrix4();
  private P = new THREE.Matrix4();
  private S = new THREE.Matrix4();
  private J = { hip: new THREE.Matrix4(), knee: new THREE.Matrix4(), ankle: new THREE.Matrix4(), waist: new THREE.Matrix4(), shoulder: new THREE.Matrix4(), elbow: new THREE.Matrix4(), wrist: new THREE.Matrix4(), head: new THREE.Matrix4(), part: new THREE.Matrix4() };
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  private hand = new THREE.Vector3();
  private tmp = new THREE.Color();

  constructor(private world: ZooWorld, readonly group: THREE.Group, private max = 260) {
    // The paths as a graph: shared corners join up.
    const id = (p: { x: number; z: number }) => {
      let i = this.nodes.findIndex((n) => Math.hypot(n.x - p.x, n.z - p.z) < 2.2);
      if (i < 0) { i = this.nodes.length; this.nodes.push({ x: p.x, z: p.z, next: [] }); }
      return i;
    };
    for (const line of world.paths) for (let i = 1; i < line.length; i++) {
      const a = id(line[i - 1]), b = id(line[i]);
      if (a === b) continue;
      if (!this.nodes[a].next.includes(b)) this.nodes[a].next.push(b);
      if (!this.nodes[b].next.includes(a)) this.nodes[b].next.push(a);
    }
    for (const g of ['entrance', 'north-entrance']) {
      const p = world.places.get(g)!;
      let best = 0, bd = Infinity;
      this.nodes.forEach((n, i) => { const d = Math.hypot(n.x - p.x, n.z - p.z); if (d < bd) { bd = d; best = i; } });
      this.gates.push(best);
    }

    const cloth = (vertexColors = false, side: THREE.Side = THREE.FrontSide) => new THREE.MeshStandardMaterial({ roughness: 0.88, vertexColors, side });
    const slot = (geo: THREE.BufferGeometry, mat: THREE.Material, per: number): Slot => {
      const im = new THREE.InstancedMesh(geo, mat, max * per);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = false;
      this.group.add(im);
      const s = { im, n: 0 };
      this.slots.push(s);
      return s;
    };
    // Legs hang from the hip and the knee; the shoe sits on the ankle, with a white sole under it.
    this.thigh = slot(new THREE.CylinderGeometry(0.078, 0.06, THIGH, 8, 1, true).translate(0, -THIGH / 2, 0), cloth(), 2);
    this.shin = slot(merge([new THREE.CylinderGeometry(0.058, 0.043, SHIN, 8, 1, true).translate(0, -SHIN / 2, 0), sphere(0.06, 6, 4)]), cloth(), 2);
    this.shoe = slot(merge([new THREE.BoxGeometry(0.098, 0.06, 0.15).translate(0, -0.035, 0.035), sphere(0.05, 6, 4).scale(1, 0.62, 1.1).translate(0, -0.04, 0.105)]), cloth(), 2);
    this.sole = slot(new THREE.BoxGeometry(0.104, 0.024, 0.22).translate(0, -0.066, 0.045), new THREE.MeshStandardMaterial({ color: '#f1f0ec', roughness: 0.9 }), 2);
    // Hips, then a body that's broad at the shoulders and narrower at the waist.
    this.pelvis = slot(new THREE.CylinderGeometry(0.148, 0.156, 0.18, 12).scale(1, 1, 0.66), cloth(), 1);
    this.torso = slot(merge([
      new THREE.CylinderGeometry(0.185, 0.148, 0.36, 10).scale(1, 1, 0.6).translate(0, 0.18, 0),
      new THREE.CapsuleGeometry(0.072, 0.25, 3, 8).rotateZ(Math.PI / 2).scale(1, 1, 0.85).translate(0, 0.33, 0),
      sphere(0.13, 10, 6).scale(1.2, 0.7, 0.72).translate(0, 0.32, 0.01),
    ]), cloth(), 1);
    this.stripe = slot(new THREE.CylinderGeometry(0.17, 0.17, 0.034, 14, 1, true).scale(1, 1, 0.6), cloth(false, THREE.DoubleSide), 2);
    this.logo = slot(new THREE.CircleGeometry(0.042, 12), cloth(), 1);
    this.skirt = slot(new THREE.CylinderGeometry(0.15, 0.25, 0.32, 14, 1, true).scale(1, 1, 0.75).translate(0, -0.16, 0), cloth(false, THREE.DoubleSide), 1);
    // Arms: a sleeve over the shoulder, the upper arm, the forearm and a hand.
    this.sleeve = slot(merge([sphere(0.064, 8, 5), new THREE.CylinderGeometry(0.064, 0.058, 0.13, 8, 1, true).translate(0, -0.065, 0)]), cloth(), 2);
    this.upper = slot(new THREE.CylinderGeometry(0.05, 0.043, UPPER, 7, 1, true).translate(0, -UPPER / 2, 0), cloth(), 2);
    this.fore = slot(merge([sphere(0.044, 6, 4), new THREE.CylinderGeometry(0.042, 0.032, FORE, 8, 1, true).translate(0, -FORE / 2, 0)]), cloth(), 2);
    this.hands = slot(merge([sphere(0.04, 6, 5).scale(0.75, 1.25, 0.55).translate(0, -0.045, 0), sphere(0.017, 5, 3).translate(0.03, -0.03, 0.015)]), new THREE.MeshStandardMaterial({ roughness: 0.65 }), 2);
    // A head with a neck, a jaw, ears and a nose, all one skin.
    this.head = slot(merge([
      sphere(0.11, 13, 9).scale(0.9, 1.08, 0.98),
      sphere(0.08, 9, 6).scale(0.92, 0.85, 0.95).translate(0, -0.036, 0.014),
      new THREE.CylinderGeometry(0.044, 0.05, 0.1, 8, 1, true).translate(0, -0.13, -0.01),
      ...[-1, 1].map((s) => sphere(0.03, 6, 4).scale(0.35, 0.8, 0.6).translate(s * 0.097, 0, -0.005)),
      sphere(0.02, 6, 4).scale(0.8, 1, 1.1).translate(0, -0.012, 0.106),
    ]), new THREE.MeshStandardMaterial({ roughness: 0.62 }), 1);
    // The face: eyes with dark pupils and a smile.
    this.face = slot(merge([
      ...[-1, 1].flatMap((s) => [
        tint(sphere(0.02, 8, 6).scale(1.1, 0.8, 0.42).translate(s * 0.037, 0.012, 0.094), '#fbfbf8'),
        tint(sphere(0.0105, 6, 4).scale(1, 1, 0.45).translate(s * 0.036, 0.011, 0.102), '#20160f'),
      ]),
      tint(new THREE.TorusGeometry(0.022, 0.0055, 4, 10, Math.PI).rotateZ(Math.PI).scale(1, 0.75, 1).translate(0, -0.042, 0.103), '#8a3f3a'),
    ]), new THREE.MeshStandardMaterial({ roughness: 0.5, vertexColors: true }), 1);
    this.brows = slot(new THREE.BoxGeometry(0.036, 0.008, 0.01), cloth(), 2);
    this.specs = slot(merge([
      ...[-1, 1].map((s) => new THREE.TorusGeometry(0.024, 0.0045, 4, 14).translate(s * 0.038, 0.012, 0.112)),
      new THREE.BoxGeometry(0.03, 0.005, 0.005).translate(0, 0.018, 0.113),
    ]), new THREE.MeshBasicMaterial({ color: '#2a2320' }), 1);
    // Hair: a cap that leaves the forehead and face clear, long hair down the back,
    // a mop of curls, and one piece reused for ponytails, buns, braids and pigtails.
    this.hairCap = slot(new THREE.SphereGeometry(0.116, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.56).rotateX(-0.6).scale(0.93, 1.05, 1).translate(0, 0.008, -0.004), cloth(), 1);
    this.hairLong = slot(new THREE.CylinderGeometry(0.112, 0.128, 0.3, 14, 1, true, Math.PI / 2 - 0.25, Math.PI + 0.5).scale(0.95, 1, 1).translate(0, -0.11, -0.008), cloth(false, THREE.DoubleSide), 1);
    const puffs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 30 && puffs.length < 14; i++) {
      const yy = 1 - (i / 29) * 2, rr = Math.sqrt(1 - yy * yy), a = i * 2.39996;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (yy < -0.35 || (z > 0.35 && yy < 0.5)) continue;
      puffs.push(sphere(0.05, 6, 4).translate(x * 0.112, yy * 0.12 + 0.012, z * 0.112 - 0.006));
    }
    this.curls = slot(merge(puffs), cloth(), 1);
    this.hairPiece = slot(sphere(0.05, 9, 7), cloth(), 2);
    this.sunHat = slot(merge([new THREE.CylinderGeometry(0.21, 0.21, 0.014, 18), new THREE.CylinderGeometry(0.1, 0.122, 0.1, 14).translate(0, 0.05, 0)]), cloth(), 1);
    this.cap = slot(merge([new THREE.SphereGeometry(0.124, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.BoxGeometry(0.13, 0.012, 0.1).translate(0, 0, 0.14)]), cloth(), 1);
    this.pack = slot(merge([new THREE.BoxGeometry(0.25, 0.28, 0.11), new THREE.BoxGeometry(0.19, 0.11, 0.04).translate(0, -0.06, -0.07)]), cloth(), 1);
    this.stroller = slot(merge([
      tint(new THREE.BoxGeometry(0.42, 0.24, 0.56).translate(0, 0.42, 0), '#ffffff'),
      tint(new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI, 0, Math.PI / 2).rotateY(Math.PI / 2).scale(0.75, 1, 1).translate(0, 0.54, -0.12), '#ffffff'),
      tint(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 5).rotateX(-0.5).translate(0, 0.74, -0.38), '#3f3f46'),
      ...[[-0.18, 0.2], [0.18, 0.2], [-0.18, -0.2], [0.18, -0.2]].map(([x, z]) => tint(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 10).rotateZ(Math.PI / 2).translate(x, 0.08, z), '#27272a')),
    ]), cloth(true), 1);
    this.balloons = slot(new THREE.SphereGeometry(0.3, 10, 8).scale(1, 1.15, 1), new THREE.MeshStandardMaterial({ roughness: 0.3 }), 1);
    this.strings = slot(new THREE.CylinderGeometry(0.01, 0.01, 1, 3).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: '#e5e7eb' }), 1);
    // A flashlight's beam, its point at the hand, shining ahead.
    this.beams = slot(new THREE.ConeGeometry(1.1, 5, 12, 1, true).translate(0, -2.5, 0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), 1);
  }

  /** How many people should be in the zoo, whether they're carrying flashlights, and how many keepers are about. */
  set(visitors: number, flashlights: boolean, keepers: number) {
    this.want = Math.min(this.max - keepers, Math.round(visitors));
    this.flashlights = flashlights;
    this.keepers = keepers;
  }

  private person(kind: Kind, lead: Person | null, at: number, anywhere: boolean): Person {
    const n = this.nodes[at];
    const to = lead ? lead.to : n.next[Math.floor(Math.random() * n.next.length)] ?? at;
    const keeper = kind === 'keeper', kid = kind === 'kid', grand = kind === 'grand';
    const girlish = Math.random() < 0.5;
    const hair: Hair = keeper ? pick<Hair>([1, 1, 3, 6, 5])
      : grand ? (girlish ? pick<Hair>([1, 4, 5, 1]) : pick<Hair>([0, 0, 1, 6]))
      : kind === 'adult' && !girlish && Math.random() < 0.15 ? 0
      : girlish ? pick<Hair>(kid ? [2, 3, 7, 8, 5, 3, 8] : [2, 3, 4, 5, 2, 3, 7, 1])
      : pick<Hair>([1, 1, 6, 5, 1, 6]);
    const hat: Person['hat'] = keeper ? 3 : Math.random() < (grand ? 0.35 : 0.2) ? (Math.random() < 0.5 ? 1 : 2) : 0;
    const shorts = !keeper && !grand && Math.random() < (kid ? 0.55 : 0.35);
    const skirt = !keeper && girlish && !shorts && Math.random() < (grand ? 0.4 : 0.35);
    return {
      from: lead ? lead.from : at, to, k: lead ? lead.k : 0, len: lead ? lead.len : Math.hypot(this.nodes[to].x - n.x, this.nodes[to].z - n.z) || 1,
      side: lead ? lead.side + (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.4) : (Math.random() - 0.5) * 2.6,
      speed: keeper ? 1.6 + Math.random() * 0.3 : grand ? 0.85 + Math.random() * 0.2 : 1.05 + Math.random() * 0.35, pause: 0, kind,
      fade: anywhere ? 1 : 0, leaving: false, phase: Math.random() * 10, x: n.x, z: n.z, heading: 0, look: 0,
      lead, back: lead ? 0.6 + Math.random() * 1.1 : 0, walkT: Math.random() * 10, point: 0, hop: 0,
      scale: kid ? range(0.56, 0.72) : kind === 'teen' ? range(0.86, 0.94) : grand ? range(0.88, 0.96) : range(0.92, 1.06),
      w: kid ? range(0.95, 1.08) : kind === 'teen' ? range(0.86, 0.98) : range(0.9, 1.2),
      hs: kid ? range(1.3, 1.42) : kind === 'teen' ? 1.06 : 1,
      lean: grand ? range(0.08, 0.16) : 0,
      shirt: new THREE.Color(keeper ? '#b9a46a' : pick(SHIRTS)),
      pants: new THREE.Color(keeper ? '#4d6b3a' : shorts || skirt ? pick(SHORTS) : pick(PANTS)),
      skin: new THREE.Color(pick(SKIN)),
      hairColor: new THREE.Color(grand ? pick(GRAY) : kind === 'adult' && Math.random() < 0.08 ? pick(GRAY) : pick(HAIR)),
      hatColor: new THREE.Color(keeper ? '#8a7448' : pick(HATS)), packColor: new THREE.Color(pick(SHIRTS)),
      shoes: new THREE.Color(keeper ? '#5b4030' : pick(SHOES)), decoColor: new THREE.Color(keeper ? '#166534' : pick(DECO)),
      hair, hat, skirt, shorts, longSleeves: keeper || grand ? Math.random() < 0.7 : Math.random() < 0.18,
      deco: keeper ? 2 : (Math.floor(Math.random() * 3) as 0 | 1 | 2),
      glasses: grand ? Math.random() < 0.7 : !kid && Math.random() < 0.15,
      pack: !keeper && !grand && Math.random() < (kid ? 0.4 : 0.2),
      stroller: false, balloon: kid && Math.random() < 0.4 ? 1 + Math.floor(Math.random() * BALLOONS.length) : 0,
    };
  }

  /** A family (or a keeper on rounds): a grown-up in front, and up to three others close behind. */
  private spawn(keeper: boolean, anywhere: boolean) {
    const at = anywhere ? Math.floor(Math.random() * this.nodes.length) : this.gates[Math.random() < 0.8 ? 0 : 1];
    if (keeper) { this.people.push(this.person('keeper', null, at, anywhere)); return; }
    const r = Math.random();
    const lead = this.person(r < 0.1 ? 'teen' : r < 0.22 ? 'grand' : 'adult', null, at, anywhere);
    this.people.push(lead);
    const size = pick([1, 2, 2, 3, 3, 4]);
    const room = this.want - this.people.filter((p) => p.kind !== 'keeper').length;
    let kids = 0;
    for (let i = 1; i < Math.min(size, room + 1); i++) {
      const kind: Kind = i === 1 && Math.random() < 0.4 ? (lead.kind === 'grand' ? 'grand' : 'adult') : Math.random() < 0.2 ? 'teen' : 'kid';
      if (kind === 'kid') kids++;
      this.people.push(this.person(kind, lead, at, anywhere));
    }
    lead.stroller = lead.kind === 'adult' && kids > 0 && Math.random() < 0.25;
  }
  private get keeperCount() { return this.people.filter((p) => p.kind === 'keeper' && !p.leaving).length; }

  /** Fill the zoo straight away (on arriving), rather than everyone walking in the gate. */
  fill() {
    while (this.people.filter((p) => p.kind !== 'keeper').length < this.want) this.spawn(false, true);
    while (this.keeperCount < this.keepers) this.spawn(true, true);
  }

  /** Turn to face the nearest habitat, to look at the animals. */
  private lookAt(p: Person) {
    let best = Infinity, ang = p.heading + (Math.random() - 0.5) * 2;
    for (const f of this.world.habitats.values()) {
      const d = Math.hypot(f.x - p.x, f.z - p.z) - Math.max(f.rx, f.rz);
      if (d < best && d < 30) { best = d; ang = Math.atan2(f.x - p.x, f.z - p.z); }
    }
    p.look = ang;
  }

  update(dt: number, t: number, cam: THREE.Vector3) {
    const guests = this.people.filter((p) => p.kind !== 'keeper' && !p.leaving).length;
    if (guests < this.want && Math.random() < dt * 3) this.spawn(false, false);
    if (guests > this.want + 2) {
      const p = this.people.find((x) => x.kind !== 'keeper' && !x.leaving && !x.lead);
      if (p) p.leaving = true;
    }
    const keepers = this.keeperCount;
    if (keepers < this.keepers) this.spawn(true, true);
    else if (keepers > this.keepers) { const p = this.people.find((x) => x.kind === 'keeper' && !x.leaving); if (p) p.leaving = true; }

    for (let j = this.people.length - 1; j >= 0; j--) {
      const p = this.people[j];
      if (p.lead?.leaving) p.leaving = true;
      p.fade = p.leaving ? p.fade - dt * 0.6 : Math.min(1, p.fade + dt * 0.8);
      if (p.fade <= 0 && p.leaving) { this.people.splice(j, 1); continue; }
      p.point = Math.max(0, p.point - dt);
      p.hop = Math.max(0, p.hop - dt);
      if (p.lead) {
        // Following a grown-up: a little behind and to the side, stopping when they stop.
        const l = p.lead;
        p.pause = l.pause;
        const fx = Math.sin(l.heading), fz = Math.cos(l.heading);
        const tx = l.x - fx * p.back + fz * (p.side - l.side), tz = l.z - fz * p.back - fx * (p.side - l.side);
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
        const mv = Math.min(d, (l.speed + d * 1.5) * dt);
        if (d > 0.01) { p.x += (dx / d) * mv; p.z += (dz / d) * mv; }
        p.walkT += mv * 2.4 / p.scale;
        const want = p.pause > 0 ? l.look : l.heading;
        let dh = want - p.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        p.heading += dh * Math.min(1, dt * 5);
        if (p.pause > 0 && p.kind === 'kid' && Math.random() < dt * 0.25) { if (Math.random() < 0.5) p.hop = 1.2; else p.point = 2; }
        continue;
      }
      if (p.pause > 0) {
        p.pause -= dt;
        if (Math.random() < dt * 0.15) p.point = 1.8;
      } else {
        p.k += (p.speed * dt) / p.len;
        p.walkT += p.speed * dt * 2.4 / p.scale;
        if (p.k >= 1) {
          const at = this.nodes[p.to];
          const back = p.from;
          p.from = p.to;
          const options = at.next.filter((n) => n !== back);
          const list = options.length ? options : at.next;
          p.to = list[Math.floor(Math.random() * list.length)] ?? p.from;
          p.k = 0;
          p.len = Math.hypot(this.nodes[p.to].x - at.x, this.nodes[p.to].z - at.z) || 1;
          // Stop and look now and then (keepers have work to do).
          if (Math.random() < (p.kind === 'keeper' ? 0.1 : 0.4)) { p.pause = 3 + Math.random() * 8; this.lookAt(p); }
        }
      }
      const a = this.nodes[p.from], b = this.nodes[p.to];
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
      const nx = -dz / L, nz = dx / L;
      p.x = a.x + dx * p.k + nx * p.side;
      p.z = a.z + dz * p.k + nz * p.side;
      const want = p.pause > 0 ? p.look : Math.atan2(dx, dz);
      let dh = want - p.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      p.heading += dh * Math.min(1, dt * 4);
    }
    this.draw(t, cam);
  }

  /** One part of a person: a local placement, turned and sized, on top of where they stand. */
  private put(s: Slot, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number, color?: THREE.Color) {
    this.L.compose(this.v.set(x, y, z), this.q.setFromEuler(this.e.set(rx, ry, rz)), this.s.set(sx, sy, sz));
    this.P.multiplyMatrices(this.B, this.L);
    s.im.setMatrixAt(s.n, this.P);
    if (color) s.im.setColorAt(s.n, color);
    s.n++;
  }
  /** A joint: an offset and a turn from its parent (or from where the person stands). */
  private joint(out: THREE.Matrix4, parent: THREE.Matrix4 | null, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    this.L.compose(this.v.set(x, y, z), this.q.setFromEuler(this.e.set(rx, ry, rz)), this.one);
    return parent ? out.multiplyMatrices(parent, this.L) : out.copy(this.L);
  }
  /** A part hung on a joint. */
  private emit(s: Slot, m: THREE.Matrix4, sx = 1, sy = 1, sz = 1, color?: THREE.Color) {
    this.S.makeScale(sx, sy, sz);
    this.P.multiplyMatrices(this.B, m).multiply(this.S);
    s.im.setMatrixAt(s.n, this.P);
    if (color) s.im.setColorAt(s.n, color);
    s.n++;
  }
  /** A part placed relative to a joint. */
  private on(s: Slot, parent: THREE.Matrix4 | null, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number, color?: THREE.Color) {
    this.emit(s, this.joint(this.J.part, parent, x, y, z, rx, ry, rz), sx, sy, sz, color);
  }

  private draw(t: number, cam: THREE.Vector3) {
    for (const s of this.slots) s.n = 0;
    const J = this.J;
    let shown = 0;
    for (const p of this.people) {
      if (shown >= this.max) break;
      const dist = Math.hypot(p.x - cam.x, p.z - cam.z);
      if (dist > 160) continue;
      shown++;
      // Faces, stripes and glasses only up close, where they can be seen.
      const near = dist < 42;
      const walking = p.pause <= 0 && (!p.lead || p.lead.pause <= 0);
      const kid = p.kind === 'kid';
      const ph = p.walkT * 2.2 + p.phase;
      const g = Math.sin(ph), c = Math.cos(ph);
      const amp = walking ? (p.kind === 'keeper' ? 0.5 : p.kind === 'grand' ? 0.32 : 0.44) : 0;
      // Up highest as the legs pass each other; a hop is a proper jump.
      const bob = walking ? (Math.abs(c) - 0.6) * 0.045 : p.hop > 0 ? Math.abs(Math.sin(t * 9 + p.phase)) * 0.35 : Math.sin(t * 1.5 + p.phase) * 0.006;
      const sc = p.scale * Math.min(1, p.fade * 1.4);
      // Standing on the path, which sits a little above the grass.
      const y = this.world.groundAt(p.x, p.z) + 0.17;
      this.B.compose(this.v.set(p.x, y + bob * p.scale, p.z), this.q.setFromEuler(this.e.set(0, p.heading, 0)), this.s.set(sc, sc, sc));
      const w = p.w;
      const bare = p.skirt || p.shorts;

      // Legs: the thigh swings from the hip, the knee bends as the foot comes through, and the foot stays flat-ish.
      for (const side of [-1, 1]) {
        const lp = side < 0 ? ph : ph + Math.PI;
        const thigh = -amp * Math.sin(lp);
        const knee = walking ? 0.08 + 1.5 * amp * Math.max(0, Math.cos(lp)) : p.kind === 'grand' ? 0.1 : 0.03;
        this.joint(J.hip, null, side * 0.082 * w, HIP, 0, thigh, 0, side * 0.015);
        this.emit(this.thigh, J.hip, w * 0.95 + 0.05, 1, w * 0.95 + 0.05, p.skirt ? p.skin : p.pants);
        this.joint(J.knee, J.hip, 0, -THIGH, 0, knee);
        this.emit(this.shin, J.knee, 1, 1, 1, bare ? p.skin : p.pants);
        this.joint(J.ankle, J.knee, 0, -SHIN, 0, -(thigh + knee) * 0.85 + (walking ? Math.max(0, Math.sin(lp)) * -0.15 : 0));
        this.emit(this.shoe, J.ankle, 1, 1, 1, p.shoes);
        this.emit(this.sole, J.ankle);
      }
      this.on(this.pelvis, null, 0, HIP + 0.05, 0, 0, -g * amp * 0.12, 0, w, 1, w, p.skirt ? p.shirt : p.pants);
      if (p.skirt) this.on(this.skirt, null, 0, WAIST + 0.02, 0, 0, 0, 0, w, 1, w, p.pants);

      // The body, twisting a little against the hips; grandparents stoop a bit.
      this.joint(J.waist, null, 0, WAIST, 0, p.lean + (walking ? 0.04 : 0), g * amp * 0.16, walking ? g * 0.025 : 0);
      this.emit(this.torso, J.waist, w, 1, w, p.shirt);
      if (near && p.deco === 1) {
        for (const sy of [0.13, 0.23]) { const r = 0.148 + (0.185 - 0.148) * (sy / 0.36) + 0.006; this.on(this.stripe, J.waist, 0, sy, 0, 0, 0, 0, (w * r) / 0.17, 1, (w * r) / 0.17, p.decoColor); }
      }
      if (near && p.deco === 2) this.on(this.logo, J.waist, p.kind === 'keeper' ? 0.07 * w : 0, 0.24, 0.6 * (0.148 + 0.037 * 0.67) * w + 0.004, 0, 0, 0, 1, 1, 1, p.decoColor);
      if (p.pack) this.on(this.pack, J.waist, 0, 0.2, -0.125 * w, 0, 0, 0, 1, 1, 1, p.packColor);

      // Arms: swinging opposite the legs, elbows bending as they come forward; one up to point;
      // both out front to push a stroller; a flashlight held out; a balloon held up.
      const torch = this.flashlights && p.kind !== 'keeper' && !kid;
      const arm = [{ rx: amp * g * 0.9, el: 0, rz: -0.07 }, { rx: -amp * g * 0.9, el: 0, rz: 0.07 }];
      for (const a of arm) a.el = -(0.15 + Math.max(0, -a.rx) * 0.7);
      if (p.stroller && walking) { arm[0] = { rx: -0.75, el: -0.55, rz: 0.05 }; arm[1] = { rx: -0.75, el: -0.55, rz: -0.05 }; }
      if (p.point > 0) arm[1] = { rx: -2.5, el: -0.05, rz: 0.12 };
      if (torch) arm[1] = { rx: -0.9, el: -0.35, rz: 0 };
      if (p.balloon) arm[0] = { rx: -0.1, el: -0.7, rz: -0.4 };
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1, a = arm[i];
        this.joint(J.shoulder, J.waist, side * 0.19 * w, SHOULDER, 0, a.rx, 0, a.rz);
        this.emit(this.sleeve, J.shoulder, w * 0.15 + 0.85, 1, w * 0.15 + 0.85, p.shirt);
        this.emit(this.upper, J.shoulder, 1, 1, 1, p.longSleeves ? p.shirt : p.skin);
        this.joint(J.elbow, J.shoulder, 0, -UPPER, 0, a.el);
        this.emit(this.fore, J.elbow, 1, 1, 1, p.longSleeves ? p.shirt : p.skin);
        this.joint(J.wrist, J.elbow, 0, -FORE, 0);
        this.emit(this.hands, J.wrist, 1, 1, 1, p.skin);
        if (i === 0 && p.balloon) this.hand.set(0, -0.06, 0).applyMatrix4(J.wrist);
        if (i === 1 && torch) this.hand.set(0, -0.06, 0.02).applyMatrix4(J.wrist);
      }

      // The head, looking around while they stand; kids' heads are bigger for their bodies.
      const hs = p.hs;
      const look = walking ? 0 : Math.sin(t * 0.7 + p.phase) * 0.35;
      const tilt = p.point > 0 ? -0.25 : kid && !walking ? -0.12 : -p.lean * 0.8;
      this.joint(J.head, J.waist, 0, NECK + 0.02 * hs, 0, tilt, look, 0);
      this.joint(J.head, J.head, 0, HEAD * 0.75 * hs, 0);
      this.emit(this.head, J.head, hs, hs, hs, p.skin);
      if (near) {
        this.emit(this.face, J.head, hs, hs, hs);
        for (const s of [-1, 1]) this.on(this.brows, J.head, s * 0.04 * hs, 0.047 * hs, 0.096 * hs, 0, 0, s * -0.12, hs, hs, hs, p.hairColor);
        if (p.glasses) this.emit(this.specs, J.head, hs, hs, hs);
      }
      const hc = p.hairColor;
      if (p.hair && p.hair !== 5) this.emit(this.hairCap, J.head, hs * (p.hair === 6 ? 0.97 : 1), hs * (p.hair === 6 ? 0.97 : 1), hs * (p.hair === 6 ? 0.97 : 1), hc);
      if (p.hair === 2) this.emit(this.hairLong, J.head, hs, hs * (kid ? 0.9 : 1.1), hs, hc);
      if (p.hair === 5) { this.emit(this.hairCap, J.head, hs, hs, hs, hc); this.emit(this.curls, J.head, hs * 1.04, hs * 1.04, hs * 1.04, hc); }
      const flick = Math.sin(t * 3 + p.phase) * (walking ? 0.3 : 0.06);
      if (p.hair === 3) this.on(this.hairPiece, J.head, 0, -0.01 * hs, -0.13 * hs, 0.45, 0, flick, hs * 0.75, hs * 1.9, hs * 0.75, hc);
      if (p.hair === 4) this.on(this.hairPiece, J.head, 0, 0.09 * hs, -0.09 * hs, 0, 0, 0, hs * 1.15, hs, hs * 1.15, hc);
      if (p.hair === 7) for (const s of [-1, 1]) this.on(this.hairPiece, J.head, s * 0.07 * hs, -0.13 * hs, -0.05 * hs, 0.1, 0, flick * 0.3, hs * 0.5, hs * 2.4, hs * 0.5, hc);
      if (p.hair === 8) for (const s of [-1, 1]) this.on(this.hairPiece, J.head, s * 0.115 * hs, 0.02 * hs, -0.04 * hs, 0, 0, s * (0.7 + flick * 0.3), hs * 0.75, hs * 1.4, hs * 0.75, hc);
      if (p.hat === 1 || p.hat === 3) this.on(this.sunHat, J.head, 0, 0.082 * hs, -0.005 * hs, -0.06, 0, 0, hs, hs, hs, p.hatColor);
      if (p.hat === 2) this.on(this.cap, J.head, 0, 0.035 * hs, 0, -0.1, 0, 0, hs * 0.98, hs, hs * 1.02, p.hatColor);
      if (p.stroller) this.put(this.stroller, 0, 0, 0.78, 0, 0, 0, 1, 1, 1, p.packColor);

      // A balloon tied to a raised hand.
      if (p.balloon) {
        const sway = Math.sin(t * 1.4 + p.phase) * 0.18;
        this.put(this.strings, this.hand.x, this.hand.y, this.hand.z, 0, 0, sway, 1, 1.25, 1);
        this.put(this.balloons, this.hand.x - Math.sin(sway) * 1.25, this.hand.y + Math.cos(sway) * 1.25 + 0.3, this.hand.z, 0, 0, 0, 1, 1, 1, this.tmp.set(BALLOONS[p.balloon - 1]));
      }
      // A flashlight beam from the hand, swept a little as they look around.
      if (torch) this.put(this.beams, this.hand.x, this.hand.y, this.hand.z, 0.32, Math.sin(t * 0.8 + p.phase) * 0.3, 0, 1, 1, 1);
    }
    for (const s of this.slots) {
      s.im.count = s.n;
      s.im.instanceMatrix.needsUpdate = true;
      if (s.im.instanceColor) s.im.instanceColor.needsUpdate = true;
    }
  }

  /** Where people are, for the minimap. */
  /** The nearest guest who hasn't met an animal yet, kids first; nobody leaving, nobody working. */
  meetNear(x: number, z: number, r: number): Guest | null {
    let best: Person | null = null, bd = Infinity;
    for (const p of this.people) {
      if (p.kind === 'keeper' || p.leaving || p.met || p.fade < 0.9) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d > r) continue;
      const score = d - (p.kind === 'kid' ? 1.5 : 0);
      if (score < bd) { bd = score; best = p; }
    }
    return best;
  }
  /** They stop, turn to look at what you're holding, and a kid hops and points. Their family stops too. */
  wow(g: Guest, x: number, z: number) {
    const p = g as Person;
    const family = this.people.filter((q) => q === p || q === p.lead || (p.lead ? q.lead === p.lead : q.lead === p));
    for (const q of family) {
      q.met = true;
      const at = q.lead ?? q;
      at.pause = Math.max(at.pause, 6);
      at.look = Math.atan2(x - at.x, z - at.z);
    }
    p.point = 3;
    if (p.kind === 'kid') p.hop = 2.5;
  }
  dots() { return this.people.map((p) => ({ x: p.x, z: p.z, keeper: p.kind === 'keeper' })); }

  dispose() {
    for (const s of this.slots) { s.im.geometry.dispose(); (s.im.material as THREE.Material).dispose(); }
  }
}
