import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ZooWorld } from './world';

/**
 * The visitors: families wandering the paths together, stopping to look at the
 * animals, kids hopping and pointing, a few with balloons, a few grown-ups pushing
 * strollers. As many as are in the zoo right now (more on a sunny Saturday, a few
 * keepers in khaki at night). After dark, on lantern nights, they carry flashlights.
 *
 * Every person is built from the same handful of instanced parts (legs, arms, body,
 * head, eyes, hair, hats…), placed and swung each frame, so a couple of hundred
 * people still cost about fifteen draw calls.
 */

type Kind = 'adult' | 'teen' | 'kid' | 'keeper';
/** 0 bald, 1 short, 2 long, 3 ponytail, 4 bun, 5 curly. */
type Hair = 0 | 1 | 2 | 3 | 4 | 5;
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
  scale: number;
  shirt: THREE.Color; pants: THREE.Color; skin: THREE.Color; hairColor: THREE.Color; hatColor: THREE.Color; packColor: THREE.Color;
  hair: Hair; hat: 0 | 1 | 2 | 3; skirt: boolean; pack: boolean; stroller: boolean; balloon: number;
}
interface Slot { im: THREE.InstancedMesh; n: number }

const SHIRTS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f5f5f4', '#1f2937', '#a3e635', '#14b8a6', '#fb7185', '#fde047', '#60a5fa'];
const PANTS = ['#1e3a8a', '#334155', '#78716c', '#1f2937', '#a16207', '#3f6212', '#e5e7eb', '#7c2d12', '#4c1d95'];
const SKIN = ['#f5d0b5', '#e8b48a', '#c98d62', '#8d5a3c', '#5e3a26', '#f1c7a5', '#d9a07a'];
const HAIR = ['#1c1917', '#3f2a1d', '#6b4423', '#a16207', '#facc15', '#b45309', '#d6d3d1', '#7f1d1d'];
const HATS = ['#fef3c7', '#f472b6', '#38bdf8', '#ef4444', '#22c55e', '#1f2937'];
const BALLOONS = ['#ef4444', '#3b82f6', '#facc15', '#22c55e', '#ec4899', '#a855f7'];
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/** Paints a geometry one color, so parts merged into one mesh can be two-tone (a shoe on a leg). */
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

export class Crowd {
  private nodes: Node[] = [];
  private gates: number[] = [];
  private people: Person[] = [];
  private slots: Slot[] = [];
  private legs: Slot; private arms: Slot; private torso: Slot; private skirt: Slot; private head: Slot; private eyes: Slot;
  private hairCap: Slot; private hairKnob: Slot; private sunHat: Slot; private cap: Slot; private pack: Slot; private stroller: Slot;
  private balloons: Slot; private strings: Slot; private beams: Slot;
  private want = 0;
  private flashlights = false;
  private keepers = 0;
  // Scratch, so nothing is allocated per frame.
  private B = new THREE.Matrix4();
  private L = new THREE.Matrix4();
  private P = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
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

    const soft = (vertexColors = false) => new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true, vertexColors });
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
    // A leg hangs from the hip (origin at the top), with a dark shoe on the end.
    this.legs = slot(merge([tint(new THREE.CylinderGeometry(0.085, 0.072, 0.5, 7).translate(0, -0.25, 0), '#ffffff'), tint(new THREE.BoxGeometry(0.13, 0.08, 0.23).translate(0, -0.52, 0.04), '#2b2724')]), soft(true), 2);
    // An arm hangs from the shoulder, sleeve and all.
    this.arms = slot(new THREE.CapsuleGeometry(0.062, 0.34, 2, 7).translate(0, -0.22, 0), soft(), 2);
    this.torso = slot(new THREE.CapsuleGeometry(0.19, 0.28, 3, 9).scale(1.12, 1, 0.78), soft(), 1);
    this.skirt = slot(new THREE.CylinderGeometry(0.16, 0.3, 0.34, 10, 1, true), new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true, side: THREE.DoubleSide }), 1);
    this.head = slot(new THREE.SphereGeometry(0.19, 12, 10), new THREE.MeshStandardMaterial({ roughness: 0.7 }), 1);
    this.eyes = slot(new THREE.SphereGeometry(0.028, 6, 5), new THREE.MeshBasicMaterial({ color: '#1b1430' }), 2);
    // Hair: a cap over the top and back of the head, and a knob for ponytails, buns and long hair.
    this.hairCap = slot(new THREE.SphereGeometry(0.205, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.56).rotateX(-0.32), soft(), 1);
    this.hairKnob = slot(new THREE.SphereGeometry(0.1, 8, 6), soft(), 1);
    this.sunHat = slot(merge([new THREE.CylinderGeometry(0.34, 0.34, 0.025, 16), new THREE.CylinderGeometry(0.16, 0.2, 0.15, 12).translate(0, 0.08, 0)]), soft(), 1);
    this.cap = slot(merge([new THREE.SphereGeometry(0.205, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.BoxGeometry(0.22, 0.02, 0.17).translate(0, 0.0, 0.22)]), soft(), 1);
    this.pack = slot(new THREE.BoxGeometry(0.28, 0.32, 0.13), soft(), 1);
    this.stroller = slot(merge([
      tint(new THREE.BoxGeometry(0.42, 0.24, 0.56).translate(0, 0.42, 0), '#ffffff'),
      tint(new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI, 0, Math.PI / 2).rotateY(Math.PI / 2).scale(0.75, 1, 1).translate(0, 0.54, -0.12), '#ffffff'),
      tint(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 5).rotateX(-0.5).translate(0, 0.74, -0.38), '#3f3f46'),
      ...[[-0.18, 0.2], [0.18, 0.2], [-0.18, -0.2], [0.18, -0.2]].map(([x, z]) => tint(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 10).rotateZ(Math.PI / 2).translate(x, 0.08, z), '#27272a')),
    ]), soft(true), 1);
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
    const keeper = kind === 'keeper';
    const girlish = Math.random() < 0.5;
    const hair: Hair = keeper ? 1 : kind === 'adult' && !girlish && Math.random() < 0.18 ? 0 : girlish ? pick<Hair>([2, 3, 4, 5, 2, 3]) : pick<Hair>([1, 1, 5, 1]);
    const hat: Person['hat'] = keeper ? 3 : Math.random() < 0.22 ? (Math.random() < 0.5 ? 1 : 2) : 0;
    return {
      from: lead ? lead.from : at, to, k: lead ? lead.k : 0, len: lead ? lead.len : Math.hypot(this.nodes[to].x - n.x, this.nodes[to].z - n.z) || 1,
      side: lead ? lead.side + (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.4) : (Math.random() - 0.5) * 2.6,
      speed: keeper ? 1.6 + Math.random() * 0.3 : 1.05 + Math.random() * 0.35, pause: 0, kind,
      fade: anywhere ? 1 : 0, leaving: false, phase: Math.random() * 10, x: n.x, z: n.z, heading: 0, look: 0,
      lead, back: lead ? 0.6 + Math.random() * 1.1 : 0, walkT: Math.random() * 10, point: 0, hop: 0,
      scale: kind === 'kid' ? 0.6 + Math.random() * 0.08 : kind === 'teen' ? 0.86 + Math.random() * 0.05 : 0.95 + Math.random() * 0.1,
      shirt: new THREE.Color(keeper ? '#b9a46a' : pick(SHIRTS)), pants: new THREE.Color(keeper ? '#4d6b3a' : pick(PANTS)), skin: new THREE.Color(pick(SKIN)),
      hairColor: new THREE.Color(kind === 'adult' && Math.random() < 0.15 ? '#d6d3d1' : pick(HAIR.slice(0, 6))),
      hatColor: new THREE.Color(keeper ? '#8a7448' : pick(HATS)), packColor: new THREE.Color(pick(SHIRTS)),
      hair, hat, skirt: !keeper && girlish && Math.random() < 0.35, pack: !keeper && Math.random() < (kind === 'kid' ? 0.4 : 0.2),
      stroller: false, balloon: kind === 'kid' && Math.random() < 0.4 ? 1 + Math.floor(Math.random() * BALLOONS.length) : 0,
    };
  }

  /** A family (or a keeper on rounds): a grown-up in front, and up to three others close behind. */
  private spawn(keeper: boolean, anywhere: boolean) {
    const at = anywhere ? Math.floor(Math.random() * this.nodes.length) : this.gates[Math.random() < 0.8 ? 0 : 1];
    if (keeper) { this.people.push(this.person('keeper', null, at, anywhere)); return; }
    const lead = this.person(Math.random() < 0.12 ? 'teen' : 'adult', null, at, anywhere);
    this.people.push(lead);
    const size = pick([1, 2, 2, 3, 3, 4]);
    const room = this.want - this.people.filter((p) => p.kind !== 'keeper').length;
    let kids = 0;
    for (let i = 1; i < Math.min(size, room + 1); i++) {
      const kind: Kind = i === 1 && Math.random() < 0.4 ? 'adult' : Math.random() < 0.2 ? 'teen' : 'kid';
      if (kind === 'kid') kids++;
      this.people.push(this.person(kind, lead, at, anywhere));
    }
    lead.stroller = kids > 0 && Math.random() < 0.25;
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

  private draw(t: number, cam: THREE.Vector3) {
    for (const s of this.slots) s.n = 0;
    let shown = 0;
    for (const p of this.people) {
      if (shown >= this.max) break;
      if (Math.hypot(p.x - cam.x, p.z - cam.z) > 160) continue;
      shown++;
      const walking = p.pause <= 0 && (!p.lead || p.lead.pause <= 0);
      const kid = p.kind === 'kid';
      const g = Math.sin(p.walkT * 2.2 + p.phase);
      const swing = walking ? g * (p.kind === 'keeper' ? 0.55 : 0.5) : 0;
      const bob = walking ? Math.abs(g) * 0.05 : p.hop > 0 ? Math.abs(Math.sin(t * 9 + p.phase)) * 0.35 : Math.sin(t * 1.5 + p.phase) * 0.008;
      const sc = p.scale * Math.min(1, p.fade * 1.4);
      const y = this.world.groundAt(p.x, p.z) + 0.04;
      this.B.compose(this.v.set(p.x, y + bob * p.scale, p.z), this.q.setFromEuler(this.e.set(0, p.heading, walking ? g * 0.04 : 0)), this.s.set(sc, sc, sc));

      // Legs and body.
      this.put(this.legs, -0.1, 0.58, 0, swing, 0, 0, 1, 1, 1, p.pants);
      this.put(this.legs, 0.1, 0.58, 0, -swing, 0, 0, 1, 1, 1, p.pants);
      if (p.skirt) this.put(this.skirt, 0, 0.5, 0, 0, 0, 0, 1, 1, 1, p.pants);
      this.put(this.torso, 0, 0.84, 0, 0, 0, 0, 1, 1, 1, p.shirt);

      // Arms: swinging opposite the legs; one up to point; out front for a stroller or a flashlight.
      const torch = this.flashlights && p.kind !== 'keeper' && !kid;
      let left = -swing * 0.9, right = swing * 0.9;
      if (p.stroller && walking) { left = -1.1; right = -1.1; }
      if (p.point > 0) right = -2.4;
      if (torch) right = -1.25;
      if (p.balloon) left = -0.55;
      this.put(this.arms, -0.27, 1.02, 0, left, 0, -0.12, 1, 1, 1, p.shirt);
      this.put(this.arms, 0.27, 1.02, 0, right, 0, 0.12, 1, 1, 1, p.shirt);

      // Head, face, hair and hat. Kids have bigger heads.
      const hs = kid ? 1.32 : 1;
      const hy = 1.08 + 0.2 * hs;
      const nod = walking ? 0 : Math.sin(t * 0.7 + p.phase) * 0.12;
      this.put(this.head, 0, hy, 0, 0, nod, 0, hs, hs, hs, p.skin);
      const ey = hy + 0.03 * hs, ez = 0.165 * hs, ex = 0.068 * hs;
      this.put(this.eyes, -ex * Math.cos(nod) + ez * Math.sin(nod), ey, ez * Math.cos(nod) + ex * Math.sin(nod), 0, 0, 0, hs, hs, hs);
      this.put(this.eyes, ex * Math.cos(nod) + ez * Math.sin(nod), ey, ez * Math.cos(nod) - ex * Math.sin(nod), 0, 0, 0, hs, hs, hs);
      if (p.hair) {
        const puff = p.hair === 5 ? 1.22 : 1;
        this.put(this.hairCap, 0, hy + 0.01 * hs, -0.01 * hs, 0, nod, 0, hs * puff, hs * puff, hs * puff, p.hairColor);
        if (p.hair === 2) this.put(this.hairKnob, 0, hy - 0.12 * hs, -0.11 * hs, 0, nod, 0, hs * 1.75, hs * 2.1, hs * 0.85, p.hairColor);
        if (p.hair === 3) this.put(this.hairKnob, Math.sin(nod) * -0.2 * hs, hy - 0.04 * hs, -0.21 * hs, 0.5, nod, Math.sin(t * 3 + p.phase) * (walking ? 0.25 : 0.05), hs * 0.75, hs * 1.4, hs * 0.75, p.hairColor);
        if (p.hair === 4) this.put(this.hairKnob, 0, hy + 0.17 * hs, -0.08 * hs, 0, 0, 0, hs, hs, hs, p.hairColor);
      }
      if (p.hat === 1 || p.hat === 3) this.put(this.sunHat, 0, hy + 0.14 * hs, 0, -0.05, nod, 0, hs, hs, hs, p.hatColor);
      if (p.hat === 2) this.put(this.cap, 0, hy + 0.05 * hs, 0, -0.08, nod, 0, hs * 1.02, hs, hs * 1.02, p.hatColor);
      if (p.pack) this.put(this.pack, 0, 0.88, -0.2, 0, 0, 0, 1, 1, 1, p.packColor);
      if (p.stroller) this.put(this.stroller, 0, 0, 0.78, 0, 0, 0, 1, 1, 1, p.packColor);

      // A balloon tied to a raised hand.
      if (p.balloon) {
        this.hand.set(-0.3, 1.02 - Math.cos(left) * 0.48, -Math.sin(left) * 0.48);
        const sway = Math.sin(t * 1.4 + p.phase) * 0.18;
        this.put(this.strings, this.hand.x, this.hand.y, this.hand.z, 0, 0, sway, 1, 1.25, 1);
        this.put(this.balloons, this.hand.x - Math.sin(sway) * 1.25, this.hand.y + Math.cos(sway) * 1.25 + 0.3, this.hand.z, 0, 0, 0, 1, 1, 1, this.tmp.set(BALLOONS[p.balloon - 1]));
      }
      // A flashlight beam from the hand, swept a little as they look around.
      if (torch) {
        this.hand.set(0.3, 1.02 - Math.cos(right) * 0.48, -Math.sin(right) * 0.48);
        this.put(this.beams, this.hand.x, this.hand.y, this.hand.z, 0.32, Math.sin(t * 0.8 + p.phase) * 0.3, 0, 1, 1, 1);
      }
    }
    for (const s of this.slots) {
      s.im.count = s.n;
      s.im.instanceMatrix.needsUpdate = true;
      if (s.im.instanceColor) s.im.instanceColor.needsUpdate = true;
    }
  }

  /** Where people are, for the minimap. */
  dots() { return this.people.map((p) => ({ x: p.x, z: p.z, keeper: p.kind === 'keeper' })); }

  dispose() {
    for (const s of this.slots) { s.im.geometry.dispose(); (s.im.material as THREE.Material).dispose(); }
  }
}
