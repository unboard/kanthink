import * as THREE from 'three';
import type { PlayerKit } from '../city/engine';
import { hash } from '@/lib/kan/city/layout';
import type { Species } from '@/lib/kan/zoo/species';
import type { Animal } from '@/lib/kan/zoo/sim';
import type { Touch } from '@/lib/kan/zoo/care';
import { animalFigure, type AnimalFig, type AnimalState } from './animals';

/**
 * A visit, one on one: just you and one animal (and its family, if it has one),
 * close enough to see its face. You stand at the fence, by the glass, or right
 * beside it, the way a real keeper would for that animal, and everything you do
 * plays out: food it walks over to eat (or sniffs and turns down), hearts when
 * it's petted, a toy it chases, the scale it stands on for a check-up.
 */

export interface VisitSetting {
  ground: string;
  /** Lives in water: stand it in a pool, or swim it in a tank. */
  water: boolean;
  tank: boolean;
  indoor: boolean;
  touch: Touch;
}
export type VisitAct = 'feed' | 'refuse' | 'pet' | 'play' | 'check' | 'baby' | 'goodnight' | 'happy';

interface Fig { a: Animal; sp: Species; fig: AnimalFig; x: number; z: number; y: number; heading: number; home: { x: number; z: number }; phase: number; to: { x: number; z: number } | null; wait: number }
interface Puff { obj: THREE.Sprite; vx: number; vy: number; vz: number; life: number; age: number; size: number; spin?: boolean }

const TEX = new Map<string, THREE.Texture>();
function emojiTex(e: string) {
  let t = TEX.get(e);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.font = '96px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(e, 64, 72);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  TEX.set(e, t);
  return t;
}
const flat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });
const turnTo = (from: number, to: number, k: number) => { let d = to - from; d = Math.atan2(Math.sin(d), Math.cos(d)); return from + d * k; };

export class ZooVisit {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
  private star: Fig;
  private family: Fig[] = [];
  private keeper: THREE.Group;
  private puffs: Puff[] = [];
  private props: { obj: THREE.Object3D; until: number; tick?: (t: number) => void }[] = [];
  private act: { kind: VisitAct; t: number; until: number; food?: THREE.Object3D } | null = null;
  private time = 0;
  private yaw = 0.95;
  private size: number;
  private center = new THREE.Vector3();
  private dist: number;
  private asleep = false;
  private zzz = 0;
  private disposed = false;
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  /** Where the keeper stands, and the fence or glass between you, if there is one. */
  private side: number;

  constructor(a: Animal, sp: Species, private set: VisitSetting, kin: { a: Animal; sp: Species }[], kit: PlayerKit) {
    this.star = this.addFig(a, sp, 0, 0);
    const box = new THREE.Box3().setFromObject(this.star.fig.group);
    this.size = Math.max(box.max.y, box.max.z - box.min.z, box.max.x - box.min.x, 0.6);
    const s = this.size;
    this.side = -(s * 0.7 + 1.3);
    // The family nearby: babies around mom, or mom beside her baby.
    kin.slice(0, 4).forEach((k, i) => {
      const ang = 0.9 + i * 0.9;
      const r = s * 0.75 + 0.8;
      this.family.push(this.addFig(k.a, k.sp, Math.cos(ang) * r + s * 0.2, Math.sin(ang) * r));
    });

    // The ground, a bit of the habitat around it, and the sky.
    this.ground();
    // You, facing it.
    this.keeper = kit.walker();
    this.keeper.position.set(this.side, set.tank ? 0 : 0.02, s * 0.25);
    this.keeper.rotation.y = Math.PI / 2;
    // A girl stands at her real size, so you see how big a giraffe really is next to her.
    this.keeper.scale.setScalar(this.keeper.userData.real ? 1 : THREE.MathUtils.clamp(0.5 + s * 0.15, 0.6, 1));
    this.scene.add(this.keeper);
    this.between();

    this.center.set(this.star.x * 0.75 + this.side * 0.25, Math.min(s * 0.45, 2.4) + (set.tank ? 0.6 : 0), 0);
    this.dist = Math.max(5.2, s * 1.8 + 3.4);
    this.camera.position.set(0, 2, 6);
  }

  private addFig(a: Animal, sp: Species, x: number, z: number): Fig {
    const seed = hash(a.id) >>> 0;
    const fig = animalFigure(sp, seed, a.born !== undefined);
    this.scene.add(fig.group);
    const y = this.set.tank ? (sp.look.body === 'fish' ? 1.2 : 0.2) : 0;
    const f: Fig = { a, sp, fig, x, z, y, heading: -Math.PI / 2 + 0.5, home: { x, z }, phase: (seed % 1000) / 100, to: null, wait: 1 + (seed % 30) / 10 };
    return f;
  }

  private ground() {
    const set = this.set, s = this.size;
    const R = Math.max(45, s * 12);
    const g = new THREE.Mesh(new THREE.CircleGeometry(R, 40), flat(set.ground));
    g.rotation.x = -Math.PI / 2;
    this.scene.add(g);
    this.own(g);
    if (set.water && !set.tank) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(s * 1.1 + 1.6, 36), new THREE.MeshStandardMaterial({ color: '#3a9ad9', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85, emissive: new THREE.Color('#1e5f8a'), emissiveIntensity: 0.25 }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(s * 0.4, 0.03, 0);
      this.scene.add(pool);
      this.own(pool);
      this.props.push({ obj: pool, until: Infinity, tick: (t) => { (pool.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.22 + Math.sin(t * 1.3) * 0.05; } });
    }
    // Grass tufts, rocks, bushes and a log around the edge, from the animal's own seed.
    const r0 = hash(this.star.a.id + 'g') >>> 0;
    const rnd = (k: number) => (((r0 * (k + 7) * 2654435761) >>> 0) % 1000) / 1000;
    const bush = flat(set.indoor ? '#4f8a3a' : '#5f9a4a'), rock = flat('#9a958c'), tuft = flat('#7bb35a'), wood = flat('#7a5636');
    const sph = new THREE.SphereGeometry(0.5, 8, 6), ico = new THREE.IcosahedronGeometry(0.5, 0), cone = new THREE.ConeGeometry(0.12, 0.5, 4), cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    this.geos.push(sph, ico, cone, cyl);
    for (let i = 0; i < 26; i++) {
      const a = rnd(i) * Math.PI * 2, d = s * 1.6 + 3 + rnd(i + 40) * (s * 3 + 10);
      const x = Math.cos(a) * d + s * 0.3, z = Math.sin(a) * d;
      if (x < this.side + 1.5 && Math.abs(z) < 4) continue;
      const k = i % 3;
      const m = new THREE.Mesh(k === 0 ? sph : ico, k === 0 ? bush : rock);
      const sc = 0.8 + rnd(i + 80) * 1.8;
      m.position.set(x, sc * 0.3, z);
      m.scale.set(sc * 1.4, sc, sc * 1.2);
      this.scene.add(m);
    }
    for (let i = 0; i < 60; i++) {
      const a = rnd(i + 200) * Math.PI * 2, d = 1.5 + rnd(i + 300) * (s * 4 + 10);
      const m = new THREE.Mesh(cone, tuft);
      m.position.set(Math.cos(a) * d, 0.2, Math.sin(a) * d);
      m.rotation.z = (rnd(i + 400) - 0.5) * 0.5;
      this.scene.add(m);
    }
    const log = new THREE.Mesh(cyl, wood);
    log.position.set(s * 0.6 + 2.2, 0.3, -s * 0.6 - 1.4);
    log.rotation.set(0, 0.6, Math.PI / 2);
    log.scale.set(0.6, 2.6, 0.6);
    this.scene.add(log);
    this.mats.push(bush, rock, tuft, wood);
    // A few trees behind, for a bit of height.
    if (!set.tank) for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.15 + i * 0.18) - Math.PI / 2, d = s * 2 + 7 + rnd(i + 500) * 4;
      const x = Math.cos(a) * d + 3, z = Math.sin(a) * d;
      const h = 3 + rnd(i + 600) * 3;
      const trunk = new THREE.Mesh(cyl, wood);
      trunk.position.set(x, h / 2, z);
      trunk.scale.set(0.4, h, 0.4);
      const top = new THREE.Mesh(sph, bush);
      top.position.set(x, h + 0.8, z);
      top.scale.set(3, 2.4, 3);
      this.scene.add(trunk, top);
    }
  }

  /** The fence, or the glass, between you, or nothing at all. */
  private between() {
    const s = this.size, set = this.set;
    const x = this.side + 0.75;
    if (set.tank) {
      // A tank, glass all round, full of water.
      const w = s * 1.8 + 2.4, h = Math.max(2.6, s * 1.2 + 1.4);
      const water = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshStandardMaterial({ color: '#3fa7e0', transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide }));
      water.position.set(x + w / 2 + 0.05, h / 2, 0);
      this.scene.add(water);
      this.own(water);
      const sand = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, w), flat('#e6cf98'));
      sand.position.set(water.position.x, 0.1, 0);
      this.scene.add(sand);
      this.own(sand);
      // Bubbles rising.
      for (let i = 0; i < 6; i++) this.props.push({ obj: new THREE.Object3D(), until: Infinity, tick: (t) => { if (Math.random() < 0.02) this.puff('🫧', water.position.x + (Math.random() - 0.5) * w * 0.8, 0.3, (Math.random() - 0.5) * w * 0.8, { vy: 0.6, life: h / 0.6, size: 0.25 }); void t; } });
      this.star.x = this.star.home.x = water.position.x;
      for (const f of this.family) { f.x += water.position.x; f.home.x += water.position.x; }
      return;
    }
    if (set.touch === 'pet') return;
    const post = flat('#6b4a2e'), mesh = set.touch === 'look' ? new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }) : flat('#8a6a48');
    this.mats.push(post, mesh);
    const span = Math.max(8, s * 3);
    if (set.touch === 'look') {
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(span, 2.6), mesh);
      glass.position.set(x, 1.3, 0);
      glass.rotation.y = Math.PI / 2;
      this.scene.add(glass);
      this.geos.push(glass.geometry);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, span), post);
      rail.position.set(x, 2.6, 0);
      this.scene.add(rail);
      this.geos.push(rail.geometry);
      return;
    }
    // A keeper's fence: posts and rails, low enough to reach over.
    const h = Math.min(1.3, Math.max(0.9, s * 0.35));
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.geos.push(box);
    for (let z = -span / 2; z <= span / 2; z += 1.6) {
      const p = new THREE.Mesh(box, post);
      p.position.set(x, h / 2, z);
      p.scale.set(0.18, h, 0.18);
      this.scene.add(p);
    }
    for (const y of [h * 0.45, h * 0.95]) {
      const r = new THREE.Mesh(box, mesh);
      r.position.set(x, y, 0);
      r.scale.set(0.1, 0.12, span);
      this.scene.add(r);
    }
  }

  private own(m: THREE.Mesh) {
    this.geos.push(m.geometry);
    this.mats.push(m.material as THREE.Material);
  }

  /** The light of the hour: day, golden evening, or night with a keeper's lantern. */
  light(hour: number) {
    const dark = hour >= 7 && hour < 18.5 ? 0 : hour >= 18.5 && hour < 20.5 ? (hour - 18.5) / 2 : hour >= 5 && hour < 7 ? 1 - (hour - 5) / 2 : 1;
    const bg = new THREE.Color(this.set.tank ? '#2f8fd0' : this.set.indoor ? '#a8d8b0' : '#9fd3f5').lerp(new THREE.Color('#0d1638'), this.set.indoor && !this.set.tank ? dark * 0.6 : dark);
    this.scene.background = bg;
    this.scene.fog = new THREE.Fog(bg, this.dist * 2.2, this.dist * 6);
    const hemi = new THREE.HemisphereLight('#ffffff', '#5a4a3a', 1.1 - dark * 0.55);
    const sun = new THREE.DirectionalLight(dark > 0.5 ? '#b8c8ff' : '#fff1d6', 1.5 - dark * 1.1);
    sun.position.set(-4, 10, 6);
    const lantern = new THREE.PointLight('#ffd89a', dark * 40, 14, 1.6);
    lantern.position.set(this.side + 0.4, 2.6, 0.8);
    this.scene.add(hemi, sun, lantern);
    if (dark > 0.6) {
      // Fireflies, when it's dark out.
      for (let i = 0; i < 14; i++) {
        const fly = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: '#f6ff8a' }));
        const ph = i * 1.7;
        this.scene.add(fly);
        this.own(fly);
        this.props.push({ obj: fly, until: Infinity, tick: (t) => { fly.position.set(Math.sin(t * 0.3 + ph) * 6 + 2, 1 + Math.sin(t * 0.7 + ph * 2) * 0.8 + 0.8, Math.cos(t * 0.25 + ph) * 6); fly.visible = Math.sin(t * 2.3 + ph) > -0.2; } });
      }
    }
  }

  setAsleep(on: boolean) { this.asleep = on; }

  /** Something you did, played out. */
  play(kind: VisitAct, extra?: string) {
    const t = this.time, f = this.star, s = this.size;
    // Food or toy lands between you.
    const fx = (this.side + 0.75 + f.x) / 2 + 0.6, fz = f.z + 0.4;
    const reach = this.set.tank ? f.y + 0.4 : 0.25;
    if (kind === 'feed' || kind === 'refuse') {
      const food = this.sprite(extra ?? '🍎', 0.7);
      food.position.set(fx, reach + 1.5, fz);
      this.act = { kind, t, until: t + (kind === 'feed' ? 5 : 3), food };
      this.props.push({ obj: food, until: t + (kind === 'feed' ? 4.6 : 2.6), tick: (tt) => {
        food.position.y = Math.max(reach + 0.3, food.position.y - 0.12);
        if (kind === 'feed' && tt > t + 2.2) food.scale.setScalar(Math.max(0.01, 0.7 * (1 - (tt - t - 2.2) / 2.4)));
      } });
      if (kind === 'refuse') this.puff('🤔', f.x, f.fig.height + 0.6, f.z, { vy: 0.15, life: 2.2, size: 0.8 });
    } else if (kind === 'play') {
      const toy = this.sprite(extra ?? '⚽', 0.6);
      this.act = { kind, t, until: t + 7, food: toy };
      const r = s * 0.6 + 1.6;
      this.props.push({ obj: toy, until: t + 7, tick: (tt) => {
        const k = (tt - t) * 1.6;
        toy.position.set(f.home.x + 0.8 + Math.cos(k) * r, reach + 0.3 + Math.abs(Math.sin(k * 3)) * 0.5, f.home.z + Math.sin(k) * r);
      } });
    } else {
      this.act = { kind, t, until: t + 3.5 };
    }
    if (kind === 'pet' || kind === 'happy' || kind === 'baby') for (let i = 0; i < 7; i++) this.puff(kind === 'baby' ? '💗' : '❤️', f.x + (Math.random() - 0.5) * s * 0.6, f.fig.height * 0.8, f.z + (Math.random() - 0.5) * s * 0.6, { vy: 0.7 + Math.random() * 0.5, life: 2.4, size: 0.45, delay: i * 0.12 });
    if (kind === 'pet' && this.set.touch !== 'pet') this.puff(this.set.touch === 'look' ? '👀' : '🪮', fx - 0.4, 1.4, fz, { vy: 0.1, life: 2, size: 0.6 });
    if (kind === 'check') {
      const scale = new THREE.Mesh(new THREE.BoxGeometry(s * 0.6 + 0.5, 0.12, s * 0.45 + 0.5), flat('#cbd5e1', { metalness: 0.5, roughness: 0.4 }));
      scale.position.set(f.x, 0.06, f.z);
      this.scene.add(scale);
      this.own(scale);
      this.props.push({ obj: scale, until: t + 6 });
      this.puff('🩺', f.x - s * 0.3, f.fig.height * 0.6, f.z + s * 0.4, { vy: 0.05, life: 3, size: 0.7 });
      if (f.a.expecting) this.puff(f.a.expecting.egg ? '🥚' : '💓', f.x, f.fig.height * 0.45, f.z + s * 0.45, { vy: 0.05, life: 3.4, size: 0.7, beat: true });
    }
    if (kind === 'goodnight') { this.puff('🌙', f.x, f.fig.height + 0.9, f.z, { vy: 0.1, life: 3, size: 0.9 }); }
  }

  private sprite(e: string, size: number) {
    const m = new THREE.SpriteMaterial({ map: emojiTex(e), transparent: true, depthWrite: false });
    const sp = new THREE.Sprite(m);
    sp.scale.setScalar(size);
    this.scene.add(sp);
    this.mats.push(m);
    return sp;
  }
  private puff(e: string, x: number, y: number, z: number, o: { vy: number; life: number; size: number; delay?: number; beat?: boolean }) {
    const sp = this.sprite(e, o.size);
    sp.position.set(x, y, z);
    sp.visible = !o.delay;
    this.puffs.push({ obj: sp, vx: (Math.random() - 0.5) * 0.3, vy: o.vy, vz: (Math.random() - 0.5) * 0.3, life: o.life, age: -(o.delay ?? 0), size: o.size, spin: o.beat });
  }

  turn(dx: number) { this.yaw = THREE.MathUtils.clamp(this.yaw + dx, -1.4, 1.6); }
  resize(aspect: number) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }

  step(dt: number) {
    if (this.disposed) return;
    this.time += dt;
    const t = this.time;
    const act = this.act && this.act.until > t ? this.act : null;
    if (!act) this.act = null;
    for (const f of [this.star, ...this.family]) this.stepFig(f, f === this.star ? act : null, dt, t);

    // You: a little bounce while you do things.
    const body = this.keeper.userData.body as THREE.Object3D | undefined;
    if (body) body.position.y = 0.8 + (act ? Math.abs(Math.sin(t * 6)) * 0.12 : Math.sin(t * 1.7) * 0.03);
    this.keeper.rotation.y = Math.PI / 2 + Math.sin(t * 0.4) * 0.08;

    // Zzz while it sleeps.
    if (this.asleep && (this.zzz -= dt) < 0) { this.zzz = 1.4; this.puff('💤', this.star.x + 0.2, this.star.fig.height + 0.3, this.star.z, { vy: 0.35, life: 2.6, size: 0.55 }); }

    for (const p of this.puffs) {
      p.age += dt;
      if (p.age < 0) continue;
      p.obj.visible = true;
      p.obj.position.x += p.vx * dt;
      p.obj.position.y += p.vy * dt;
      p.obj.position.z += p.vz * dt;
      const k = p.age / p.life;
      p.obj.scale.setScalar(p.size * (p.spin ? 1 + Math.max(0, Math.sin(p.age * 9)) * 0.35 : Math.min(1, p.age * 4)));
      (p.obj.material as THREE.SpriteMaterial).opacity = k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1;
    }
    for (const p of this.puffs) if (p.age > p.life) p.obj.removeFromParent();
    this.puffs = this.puffs.filter((p) => p.age <= p.life);
    for (const p of this.props) p.tick?.(t);
    for (const p of this.props) if (p.until < t) p.obj.removeFromParent();
    this.props = this.props.filter((p) => p.until >= t);

    // The camera: drifting slowly round, a little lower when it's small.
    const yaw = this.yaw + Math.sin(t * 0.15) * 0.12;
    const want = new THREE.Vector3(this.center.x + Math.sin(yaw) * this.dist * 0.9 - 0.4, this.center.y + Math.max(1.4, this.size * 0.55) + 0.6, this.center.z + Math.cos(yaw) * this.dist);
    this.camera.position.lerp(want, 1 - Math.exp(-dt * (t < 0.1 ? 60 : 4)));
    this.camera.lookAt(this.center);
  }

  private stepFig(f: Fig, act: ZooVisit['act'], dt: number, t: number) {
    let state: AnimalState = 'stand';
    let speed = 0;
    const s = f.sp.speed;
    const fish = f.sp.look.body === 'fish' || this.set.tank;
    const facing = Math.atan2(this.side - f.x, 0.25 - f.z);
    if (this.asleep && !fish) {
      state = 'sleep';
      f.to = null;
    } else if (act) {
      const age = t - act.t;
      if (act.kind === 'feed' && act.food) {
        const fx = act.food.position.x, fz = act.food.position.z;
        const d = Math.hypot(fx - f.x, fz - f.z), stop = f.fig.height * 0.25 + 0.5;
        f.to = d > stop ? { x: fx, z: fz } : null;
        f.heading = turnTo(f.heading, Math.atan2(fx - f.x, fz - f.z), Math.min(1, dt * 5));
        state = d > stop ? 'walk' : 'eat';
        speed = s * 1.2;
      } else if (act.kind === 'refuse' && act.food) {
        // A sniff, and a turn away.
        const away = Math.atan2(act.food.position.x - f.x, act.food.position.z - f.z) + (age > 1 ? Math.PI * 0.8 : 0);
        f.heading = turnTo(f.heading, away, Math.min(1, dt * 3));
        f.fig.head.rotation.y = age < 1 ? Math.sin(age * 14) * 0.25 : 0;
      } else if (act.kind === 'play' && act.food) {
        f.to = { x: act.food.position.x, z: act.food.position.z };
        speed = Math.max(2.4, s * 2.2);
      } else if (act.kind === 'check') {
        f.to = null;
        f.heading = turnTo(f.heading, facing, Math.min(1, dt * 3));
      } else {
        // Petted, or just happy: face you and hop.
        f.heading = turnTo(f.heading, facing, Math.min(1, dt * 4));
        f.y = (this.set.tank ? f.y : 0) + (act.kind === 'pet' || act.kind === 'happy' || act.kind === 'baby' ? Math.abs(Math.sin(age * 5)) * Math.min(0.3, this.size * 0.08) : 0);
        state = f.sp.look.body === 'quad' && act.kind === 'pet' && f.fig.height < 2 ? 'sit' : 'stand';
      }
    } else if (!f.to && (f.wait -= dt) < 0) {
      // Pottering about near you, coming back to say hello.
      const r = Math.random();
      if (r < 0.45) f.to = { x: f.home.x + (Math.random() - 0.3) * this.size * 0.8, z: f.home.z + (Math.random() - 0.5) * this.size * 1.2 };
      else f.heading = r < 0.8 ? facing : f.heading + (Math.random() - 0.5) * 1.5;
      f.wait = 1.5 + Math.random() * 3.5;
    }
    if (f.to) {
      const dx = f.to.x - f.x, dz = f.to.z - f.z, d = Math.hypot(dx, dz);
      if (d < 0.15) f.to = null;
      else {
        const mv = Math.min(d, (speed || s * 0.6) * dt);
        f.x += (dx / d) * mv;
        f.z += (dz / d) * mv;
        // Never through the fence.
        f.x = Math.max(f.x, this.side + 0.75 + this.size * 0.35 + 0.3);
        f.heading = turnTo(f.heading, Math.atan2(dx, dz), Math.min(1, dt * 6));
        if (state === 'stand') state = (speed || s * 0.6) > 3.2 ? 'run' : 'walk';
      }
    }
    if (fish) state = f.sp.look.body === 'fish' ? 'swim' : state === 'stand' ? 'swim' : state;
    if (!act || (act.kind !== 'pet' && act.kind !== 'happy' && act.kind !== 'baby')) f.y += ((this.set.tank ? (f.sp.look.body === 'fish' ? 1.2 + Math.sin(t * 0.8 + f.phase) * 0.3 : 0.2) : 0) - f.y) * Math.min(1, dt * 6);
    if (f.sp.look.body === 'bat') { f.fig.group.position.set(f.x, Math.max(2.2, this.size + 1.6), f.z); state = this.asleep ? 'sleep' : 'stand'; }
    else f.fig.group.position.set(f.x, f.y, f.z);
    f.fig.group.rotation.y = f.heading;
    f.fig.pose(state, t, f.phase, speed);
  }

  dispose() {
    this.disposed = true;
    for (const p of this.puffs) p.obj.removeFromParent();
    for (const m of this.mats) m.dispose();
    for (const g of this.geos) g.dispose();
    this.scene.clear();
  }
}
