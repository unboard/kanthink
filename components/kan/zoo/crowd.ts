import * as THREE from 'three';
import type { ZooWorld } from './world';

/**
 * The visitors: families wandering the paths, stopping at the animals, kids with
 * balloons. As many as are in the zoo right now (more on a sunny Saturday, a few
 * keepers at night). After dark, on lantern nights, they carry flashlights.
 *
 * Instanced, so a couple of hundred people cost a handful of draw calls.
 */

interface Node { x: number; z: number; next: number[] }
interface Person {
  from: number; to: number; k: number; len: number;
  side: number; speed: number; pause: number; kid: boolean; keeper: boolean;
  /** 0 → 1 as they arrive, 1 → 0 as they leave. */
  fade: number; leaving: boolean; phase: number;
  x: number; z: number; heading: number;
  shirt: THREE.Color; skin: THREE.Color; hat: number; balloon: number;
}

const SHIRTS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f5f5f4', '#1f2937', '#a3e635', '#14b8a6'];
const SKIN = ['#f5d0b5', '#e8b48a', '#c98d62', '#8d5a3c', '#5e3a26', '#f1c7a5'];
const BALLOONS = ['#ef4444', '#3b82f6', '#facc15', '#22c55e', '#ec4899', '#a855f7'];

export class Crowd {
  private nodes: Node[] = [];
  private gates: number[] = [];
  private people: Person[] = [];
  private bodies: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private hats: THREE.InstancedMesh;
  private balloons: THREE.InstancedMesh;
  private strings: THREE.InstancedMesh;
  private beams: THREE.InstancedMesh;
  private want = 0;
  private flashlights = false;
  private keepers = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(private world: ZooWorld, readonly group: THREE.Group, private max = 260) {
    // The paths as a graph: shared corners join up.
    const key = (x: number, z: number) => `${Math.round(x / 1.5)},${Math.round(z / 1.5)}`;
    const ids = new Map<string, number>();
    const id = (p: { x: number; z: number }) => {
      const k = key(p.x, p.z);
      let i = ids.get(k);
      if (i === undefined) {
        // Snap onto a nearby existing node so lines that meet join.
        i = this.nodes.findIndex((n) => Math.hypot(n.x - p.x, n.z - p.z) < 2.2);
        if (i < 0) { i = this.nodes.length; this.nodes.push({ x: p.x, z: p.z, next: [] }); }
        ids.set(k, i);
      }
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

    const body = new THREE.CapsuleGeometry(0.28, 0.6, 3, 8);
    body.translate(0, 0.62, 0);
    this.bodies = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), max);
    const head = new THREE.SphereGeometry(0.22, 10, 8);
    head.translate(0, 1.38, 0);
    this.heads = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ roughness: 0.8 }), max);
    const hat = new THREE.SphereGeometry(0.26, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    hat.scale(1, 0.7, 1);
    hat.translate(0, 1.48, 0);
    this.hats = new THREE.InstancedMesh(hat, new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), max);
    const balloon = new THREE.SphereGeometry(0.3, 10, 8);
    balloon.scale(1, 1.15, 1);
    balloon.translate(0.35, 2.55, 0);
    this.balloons = new THREE.InstancedMesh(balloon, new THREE.MeshStandardMaterial({ roughness: 0.35 }), max);
    const str = new THREE.CylinderGeometry(0.01, 0.01, 1.4, 3);
    str.translate(0.32, 1.65, 0);
    this.strings = new THREE.InstancedMesh(str, new THREE.MeshBasicMaterial({ color: '#e5e7eb' }), max);
    const beam = new THREE.ConeGeometry(1.1, 5, 12, 1, true);
    beam.rotateX(-Math.PI / 2 - 0.35);
    beam.translate(0, 0.4, 2.6);
    this.beams = new THREE.InstancedMesh(beam, new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), max);
    for (const im of [this.bodies, this.heads, this.hats, this.balloons, this.strings, this.beams]) {
      im.count = 0;
      im.frustumCulled = false;
      group.add(im);
    }
  }

  /** How many people should be in the zoo, whether they're carrying flashlights, and how many keepers are about. */
  set(visitors: number, flashlights: boolean, keepers: number) {
    this.want = Math.min(this.max - keepers, Math.round(visitors));
    this.flashlights = flashlights;
    this.keepers = keepers;
  }

  private spawn(keeper: boolean, anywhere: boolean) {
    const start = anywhere ? Math.floor(Math.random() * this.nodes.length) : this.gates[Math.random() < 0.8 ? 0 : 1];
    const n = this.nodes[start];
    const to = n.next[Math.floor(Math.random() * n.next.length)] ?? start;
    const kid = !keeper && Math.random() < 0.35;
    const shirt = new THREE.Color(keeper ? '#a3895a' : SHIRTS[Math.floor(Math.random() * SHIRTS.length)]);
    const p: Person = {
      from: start, to, k: 0, len: Math.hypot(this.nodes[to].x - n.x, this.nodes[to].z - n.z) || 1,
      side: (Math.random() - 0.5) * 3, speed: (kid ? 1.5 : 1.15) + Math.random() * 0.5, pause: 0, kid, keeper,
      fade: anywhere ? 1 : 0, leaving: false, phase: Math.random() * 10, x: n.x, z: n.z, heading: 0,
      shirt, skin: new THREE.Color(SKIN[Math.floor(Math.random() * SKIN.length)]), hat: keeper ? 1 : Math.random() < 0.3 ? 1 : 0,
      balloon: kid && Math.random() < 0.45 ? 1 : 0,
    };
    this.people.push(p);
  }

  /** Fill the zoo straight away (on arriving), rather than everyone walking in the gate. */
  fill() {
    while (this.people.filter((p) => !p.keeper).length < this.want) this.spawn(false, true);
    while (this.people.filter((p) => p.keeper).length < this.keepers) this.spawn(true, true);
  }

  update(dt: number, t: number, cam: THREE.Vector3) {
    const guests = this.people.filter((p) => !p.keeper && !p.leaving).length;
    if (guests < this.want && Math.random() < dt * 6) this.spawn(false, false);
    if (guests > this.want) {
      const p = this.people.find((x) => !x.keeper && !x.leaving);
      if (p) p.leaving = true;
    }
    const keepers = this.people.filter((p) => p.keeper && !p.leaving).length;
    if (keepers < this.keepers) this.spawn(true, true);
    else if (keepers > this.keepers) { const p = this.people.find((x) => x.keeper && !x.leaving); if (p) p.leaving = true; }

    let i = 0;
    const hatColor = new THREE.Color();
    for (let j = this.people.length - 1; j >= 0; j--) {
      const p = this.people[j];
      p.fade = p.leaving ? p.fade - dt * 0.6 : Math.min(1, p.fade + dt * 0.8);
      if (p.fade <= 0 && p.leaving) { this.people.splice(j, 1); continue; }
      if (p.pause > 0) p.pause -= dt;
      else {
        p.k += (p.speed * dt) / p.len;
        if (p.k >= 1) {
          const at = this.nodes[p.to];
          const back = p.from;
          p.from = p.to;
          const options = at.next.filter((n) => n !== back);
          p.to = (options.length ? options : at.next)[Math.floor(Math.random() * (options.length || at.next.length))] ?? p.from;
          p.k = 0;
          p.len = Math.hypot(this.nodes[p.to].x - at.x, this.nodes[p.to].z - at.z) || 1;
          // Stop and look now and then.
          if (Math.random() < 0.35) p.pause = 2 + Math.random() * 7;
        }
      }
      const a = this.nodes[p.from], b = this.nodes[p.to];
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
      const nx = -dz / L, nz = dx / L;
      const x = a.x + dx * p.k + nx * p.side, z = a.z + dz * p.k + nz * p.side;
      p.heading = p.pause > 0 ? p.heading + Math.sin(t * 0.5 + p.phase) * dt * 0.5 : Math.atan2(dx, dz);
      p.x = x; p.z = z;
    }
    // Draw only the people near enough to see.
    for (const p of this.people) {
      if (i >= this.max) break;
      const d = Math.hypot(p.x - cam.x, p.z - cam.z);
      if (d > 170) continue;
      const y = this.world.groundAt(p.x, p.z) + 0.05;
      const walking = p.pause <= 0;
      const bob = walking ? Math.abs(Math.sin(t * 7 * p.speed + p.phase)) * 0.08 : 0;
      const sc = (p.kid ? 0.68 : 1) * Math.min(1, p.fade * 1.4);
      this.e.set(0, p.heading, walking ? Math.sin(t * 7 * p.speed + p.phase) * 0.06 : 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(p.x, y + bob, p.z), this.q, this.s.set(sc, sc, sc));
      this.bodies.setMatrixAt(i, this.m);
      this.bodies.setColorAt(i, p.shirt);
      this.heads.setMatrixAt(i, this.m);
      this.heads.setColorAt(i, p.skin);
      if (p.hat) { this.hats.setMatrixAt(i, this.m); this.hats.setColorAt(i, hatColor.set(p.keeper ? '#6b5a3a' : '#fef3c7')); }
      else { this.hats.setMatrixAt(i, this.m.clone().scale(this.s.set(0, 0, 0))); }
      if (p.balloon) {
        this.m.compose(this.v.set(p.x, y + bob + Math.sin(t * 1.5 + p.phase) * 0.08, p.z), this.q, this.s.set(sc, sc, sc));
        this.balloons.setMatrixAt(i, this.m);
        this.balloons.setColorAt(i, hatColor.set(BALLOONS[Math.floor(p.phase) % BALLOONS.length]));
        this.strings.setMatrixAt(i, this.m);
      } else {
        this.m.makeScale(0, 0, 0);
        this.balloons.setMatrixAt(i, this.m);
        this.strings.setMatrixAt(i, this.m);
      }
      if (this.flashlights && !p.keeper) {
        this.e.set(0, p.heading + Math.sin(t * 0.8 + p.phase) * 0.4, 0);
        this.q.setFromEuler(this.e);
        this.m.compose(this.v.set(p.x, y + 1, p.z), this.q, this.s.set(sc, sc, sc));
        this.beams.setMatrixAt(i, this.m);
      } else {
        this.m.makeScale(0, 0, 0);
        this.beams.setMatrixAt(i, this.m);
      }
      i++;
    }
    for (const im of [this.bodies, this.heads, this.hats, this.balloons, this.strings, this.beams]) {
      im.count = i;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  /** Where people are, for the minimap. */
  dots() { return this.people.map((p) => ({ x: p.x, z: p.z, keeper: p.keeper })); }

  dispose() {
    for (const im of [this.bodies, this.heads, this.hats, this.balloons, this.strings, this.beams]) { im.geometry.dispose(); (im.material as THREE.Material).dispose(); }
  }
}
