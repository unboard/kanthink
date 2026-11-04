import * as THREE from 'three';
import type { PlayerKit, ViewMode } from '../city/engine';
import { hash } from '@/lib/kan/city/layout';
import { EXHIBITS, K, toPx, toWorld, type Px } from '@/lib/kan/zoo/map';
import { species, awake, type Species } from '@/lib/kan/zoo/species';
import type { Animal, Weather, Zoo } from '@/lib/kan/zoo/sim';
import { animalFigure, type AnimalFig, type AnimalState } from './animals';
import { ZooWorld, flat, type HabitatFrame, type HallFrame, type PlaceFrame } from './world';
import { ZooSky } from './sky';
import { Crowd } from './crowd';

/**
 * Omaha's zoo, to walk around in: every exhibit from the zoo's own map, the animals
 * living their lives in their habitats (asleep when it's their bedtime, awake when
 * it's not), the visitors, the train on its loop, the Skyfari over the grasslands,
 * and the sky going from morning to night on the zoo's own clock.
 *
 * You get about as in the city (walk, scooter, cart, fly) with the same controls. The
 * game (money, visitors, what happens) lives in lib/kan/zoo/sim.ts; this draws it,
 * and tells the view what you're next to.
 */

export type ZooMode = Exclude<ViewMode, 'map'>;
export type ZooNear =
  | { kind: 'habitat'; id: string; name: string; inside: boolean }
  | { kind: 'house'; exhibit: string; name: string }
  /** The door of an exhibit you can go inside. */
  | { kind: 'hall'; exhibit: string; name: string }
  | { kind: 'place'; id: string; name: string; emoji: string; placeKind: string }
  | { kind: 'loose'; id: string; name: string }
  | { kind: 'kid'; name: string }
  | { kind: 'parent'; name: string }
  | { kind: 'exit' }
  | { kind: 'car'; name: string };
export type ZooPick = { kind: 'animal'; id: string } | { kind: 'exhibit'; id: string } | { kind: 'habitat'; id: string };
export type Ride = { kind: 'train'; stopped: string | null; next: string } | { kind: 'skyfari'; to: string } | null;

export interface ZooCallbacks {
  onNear(n: ZooNear | null): void;
  onPick(p: ZooPick): void;
  onModeChange(m: ZooMode): void;
  /** You walked an escaped animal back home. */
  onHome(animalId: string): void;
  /** The lost kid found their grown-up. */
  onReunited(): void;
  onRide(r: Ride): void;
  /** You came down (by parachute) somewhere worth a word: in with the lions, say. */
  onLanded?(where: string | null): void;
  /** Where you are, in map pixels, for the minimap. */
  onWhere?(px: Px, heading: number): void;
}

interface Critter {
  a: Animal;
  sp: Species;
  fig: AnimalFig;
  frame: HabitatFrame;
  baby: boolean;
  /** Inside a house you can't see into. */
  hidden: boolean;
  x: number; y: number; z: number; heading: number;
  to: { x: number; z: number; y?: number } | null;
  state: AnimalState;
  wait: number;
  phase: number;
  climb: { x: number; z: number; top: number; t: number; up: boolean; sit: number } | null;
  flyY: number;
  eatUntil: number;
  follow: boolean;
  label: HTMLDivElement;
  near: boolean;
  /** Where it was hiding when we last looked ('' when it's at home). */
  out: string;
}

interface Food { habitat: string; x: number; z: number; until: number; obj: THREE.Object3D }

const PERSON = 0.02;
/** Exhibits with an inside to explore: their doors take you in. */
export const INDOOR = new Set(['desert', 'night', 'jungle', 'aquarium', 'butterflies']);
/** Cats, dogs and the like sit down when they stop; rhinos and giraffes don't. */
const SITTERS = new Set(['lion', 'tiger', 'cheetah', 'snowleopard', 'bobcat', 'batearedfox', 'fossa', 'meerkat', 'redpanda', 'goat']);
const turn = (from: number, to: number, k: number) => { let d = to - from; d = Math.atan2(Math.sin(d), Math.cos(d)); return from + d * k; };

export class ZooScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.3, 2400);
  readonly world: ZooWorld;
  private sky: ZooSky;
  private crowd: Crowd;
  private layer: HTMLDivElement;
  private critters = new Map<string, Critter>();
  private foods: Food[] = [];
  private toys: { habitat: string; obj: THREE.Mesh; x: number; z: number; vx: number; vz: number; until: number }[] = [];
  private exLabels: { el: HTMLDivElement; pos: THREE.Vector3; id: string }[] = [];
  private mode: ZooMode = 'walk';
  private player!: { obj: THREE.Group; x: number; y: number; z: number; heading: number; speed: number; roll: number };
  private parked: { obj: THREE.Group; x: number; z: number; heading: number; kind: 'drive' | 'ride' } | null = null;
  private walkT = 0;
  private near: ZooNear | null = null;
  private time = 0;
  private hour = 9;
  private weather: Weather = 'sunny';
  private light: THREE.SpotLight;
  private beam: THREE.Mesh;
  private flashOn = false;
  /** Looking around (drag): an extra turn of the camera around you. */
  private look = 0;
  /** Coming down under a parachute. */
  private chute: { canopy: THREE.Group; t: number; glider: { obj: THREE.Group; x: number; y: number; z: number; heading: number; speed: number; t: number } | null } | null = null;
  // The train and the Skyfari.
  private train: { cars: THREE.Group[]; s: number; speed: number; stop: number; stations: { id: string; name: string; s: number }[]; puffs: THREE.Mesh[]; puffT: number; atStation: string | null };
  private chairs: THREE.Group[] = [];
  private chairU: number[] = [];
  private ride: { kind: 'train' } | { kind: 'skyfari'; chair: number; from: number } | null = null;
  // The lost kid and their grown-up.
  private kid: { name: string; obj: THREE.Group; x: number; z: number; parent: THREE.Group; px: number; pz: number; follow: boolean; label: HTMLDivElement; plabel: HTMLDivElement } | null = null;
  private disposed = false;
  /** Whatever special is happening, floating over where it is. */
  private hapLabel!: HTMLDivElement;
  private hapPos = new THREE.Vector3();
  private hapOn = false;
  private ray = new THREE.Raycaster();
  private v3 = new THREE.Vector3();

  constructor(labels: HTMLDivElement, private cb: ZooCallbacks, private kit: PlayerKit) {
    this.layer = document.createElement('div');
    this.layer.className = 'kz-labels';
    labels.appendChild(this.layer);
    this.world = new ZooWorld();
    this.scene.add(this.world.group);
    this.sky = new ZooSky(this.scene, this.world);
    const people = new THREE.Group();
    this.scene.add(people);
    this.crowd = new Crowd(this.world, people);

    // Your flashlight, for after dark.
    this.light = new THREE.SpotLight('#fff4d6', 0, 46, 0.5, 0.55, 1.1);
    this.light.visible = false;
    this.scene.add(this.light, this.light.target);
    const bm = new THREE.ConeGeometry(2.6, 12, 18, 1, true);
    bm.translate(0, -7, 0);
    bm.rotateX(-Math.PI / 2);
    this.beam = new THREE.Mesh(bm, new THREE.MeshBasicMaterial({ color: '#fff7d6', transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide }));
    this.beam.visible = false;
    this.scene.add(this.beam);

    // Exhibit names.
    for (const e of EXHIBITS) {
      const c = toWorld(e.at);
      const el = this.label(`<span class="kz-em">${e.emoji}</span> ${e.name}<span class="kz-badges"></span>`, 'kz-exhibit');
      el.onclick = () => this.cb.onPick({ kind: 'exhibit', id: e.id });
      const top = e.hall ? Math.min(e.hall.height, 14) + 2 : 5;
      this.exLabels.push({ el, pos: new THREE.Vector3(c.x, this.world.groundAt(c.x, c.z) + top, c.z), id: e.id });
    }

    this.hapLabel = this.label('', 'kz-happening');
    this.train = this.buildTrain();
    this.buildChairs();
    const gate = this.world.places.get('entrance')!;
    this.spawn('walk', gate.x, gate.z - 4, Math.PI);
  }

  private label(html: string, cls: string) {
    const el = document.createElement('div');
    el.className = `kz-label ${cls}`;
    el.innerHTML = html;
    el.style.display = 'none';
    this.layer.appendChild(el);
    return el;
  }

  // ---------- You ----------

  private makeFor(mode: ZooMode) {
    return mode === 'drive' ? this.kit.car() : mode === 'ride' ? this.kit.moped() : mode === 'walk' ? this.kit.walker() : this.kit.flyer();
  }
  private spawn(mode: ZooMode, x: number, z: number, heading: number) {
    const obj = this.makeFor(mode);
    this.scene.add(obj);
    this.mode = mode;
    const g = this.world.groundAt(x, z);
    this.player = { obj, x, y: mode === 'fly' ? g + 30 : g, z, heading, speed: mode === 'fly' ? 14 : 0, roll: 0 };
    const f = { x: Math.sin(heading), z: Math.cos(heading) };
    this.camera.position.set(x - f.x * 9, g + 5, z - f.z * 9);
    this.camera.lookAt(x, g + 1.5, z);
  }
  getMode() { return this.mode; }
  setMode(mode: ZooMode) {
    if (this.ride) return;
    if (mode === this.mode) return;
    if (this.parked) { this.parked.obj.removeFromParent(); this.parked = null; }
    const p = this.player;
    p.obj.removeFromParent();
    let { x, z } = p;
    if (mode !== 'fly' && !this.world.walkable(x, z)) ({ x, z } = this.world.nearestWalkable(x, z));
    const obj = this.makeFor(mode);
    this.scene.add(obj);
    this.mode = mode;
    const g = this.world.groundAt(x, z);
    this.player = { obj, x, y: mode === 'fly' ? Math.max(g + 30, p.y) : g, z, heading: p.heading, speed: mode === 'fly' ? 14 : 0, roll: 0 };
    this.setNear(null);
  }
  getOut() {
    const p = this.player;
    if (this.mode !== 'drive' && this.mode !== 'ride') return;
    (p.obj.userData.driver as THREE.Object3D | undefined)?.removeFromParent();
    this.parked = { obj: p.obj, x: p.x, z: p.z, heading: p.heading, kind: this.mode };
    let spot = { x: p.x + Math.cos(p.heading) * 2.4, z: p.z - Math.sin(p.heading) * 2.4 };
    if (!this.world.walkable(spot.x, spot.z)) spot = this.world.nearestWalkable(p.x, p.z);
    const walker = this.kit.walker();
    this.scene.add(walker);
    this.player = { obj: walker, x: spot.x, y: this.world.groundAt(spot.x, spot.z), z: spot.z, heading: p.heading, speed: 0, roll: 0 };
    this.mode = 'walk';
    this.setNear(null);
    this.cb.onModeChange('walk');
  }
  getIn() {
    const p = this.player, car = this.parked;
    if (this.mode !== 'walk' || !car) return;
    p.obj.removeFromParent();
    this.kit.seat(car.obj);
    this.player = { obj: car.obj, x: car.x, y: this.world.groundAt(car.x, car.z), z: car.z, heading: car.heading, speed: 0, roll: 0 };
    this.parked = null;
    this.mode = car.kind;
    this.setNear(null);
    this.cb.onModeChange(car.kind);
  }

  /** Over to a spot on the map (in map pixels), on foot. */
  jumpTo(px: Px) {
    if (this.ride) this.getOff();
    const c = toWorld(px);
    const spot = this.world.walkable(c.x, c.z) ? c : this.world.nearestWalkable(c.x, c.z);
    if (this.parked) { this.parked.obj.removeFromParent(); this.parked = null; }
    this.player.obj.removeFromParent();
    const heading = Math.atan2(c.x - spot.x, c.z - spot.z) || this.player.heading;
    this.spawn('walk', spot.x, spot.z, heading);
    this.cb.onModeChange('walk');
    this.setNear(null);
  }
  where(): Px { return toPx(this.player.x, this.player.z); }

  flashlight(on: boolean) { this.flashOn = on; }

  private setNear(n: ZooNear | null) {
    const key = (x: ZooNear | null) => (x ? JSON.stringify(x) : '');
    if (key(n) === key(this.near)) return;
    this.near = n;
    this.cb.onNear(n);
  }

  private stepPlayer(dt: number, input: { steer: number; push: number; boost: boolean }) {
    const p = this.player;
    const { steer, push, boost } = input;
    const W = this.world;
    if (this.mode === 'fly') {
      const target = boost ? 40 : 18;
      p.speed += (target - p.speed) * Math.min(1, dt * 1.5);
      p.heading -= steer * 1.35 * dt;
      const f = { x: Math.sin(p.heading), z: Math.cos(p.heading) };
      p.x += f.x * p.speed * dt;
      p.z += f.z * p.speed * dt;
      const b = W.bounds;
      if (p.x < b.x0 - 60 || p.x > b.x1 + 60 || p.z < b.z0 - 60 || p.z > b.z1 + 60) {
        const home = Math.atan2(-p.x, -p.z);
        p.heading = turn(p.heading, home, Math.min(1, dt * 1.2));
      }
      const g = W.groundAt(p.x, p.z);
      p.y = THREE.MathUtils.clamp(p.y + push * 14 * dt, g + 4, g + 140);
      p.roll += (steer * 0.55 - p.roll) * Math.min(1, dt * 4);
      p.obj.position.set(p.x, p.y, p.z);
      p.obj.rotation.set(0, p.heading, 0);
      p.obj.rotateZ(p.roll);
      p.obj.rotateX(-push * 0.18);
      this.camera.position.lerp(this.v3.set(p.x - f.x * 15, p.y + 5.5, p.z - f.z * 15), 1 - Math.exp(-dt * 4));
      this.camera.lookAt(p.x + f.x * 10, p.y - 1, p.z + f.z * 10);
      return;
    }
    const walking = this.mode === 'walk', riding = this.mode === 'ride';
    if (walking) {
      p.speed += ((boost ? 13 : 6.5) * push - p.speed) * Math.min(1, dt * 10);
      p.heading -= steer * 2.8 * dt;
    } else {
      const top = riding ? (boost ? 22 : 14) : boost ? 24 : 16;
      if (push > 0) p.speed = Math.min(top, p.speed + push * 26 * dt);
      else if (push < 0) p.speed = Math.max(-6, p.speed + push * (p.speed > 0 ? 40 : 14) * dt);
      else p.speed -= Math.sign(p.speed) * Math.min(Math.abs(p.speed), 10 * dt);
      p.heading -= steer * (riding ? 3 : 2.4) * dt * THREE.MathUtils.clamp(Math.abs(p.speed) / 5, 0, 1) * Math.sign(p.speed || 1);
    }
    const f = { x: Math.sin(p.heading), z: Math.cos(p.heading) };
    const nx = p.x + f.x * p.speed * dt, nz = p.z + f.z * p.speed * dt;
    // Landed in a yard (by parachute)? You can always walk out: the fence only keeps people from climbing in.
    const stuck = !W.walkable(p.x, p.z);
    const ok = (x: number, z: number) => W.walkable(x, z) || (stuck && W.inZoo(x, z) && !W.solidAt(x, z));
    if (ok(nx, nz)) { p.x = nx; p.z = nz; }
    else if (ok(nx, p.z)) { p.x = nx; p.speed *= 1 - 2 * dt; }
    else if (ok(p.x, nz)) { p.z = nz; p.speed *= 1 - 2 * dt; }
    else p.speed *= walking ? 0 : -0.25;
    const g = W.groundAt(p.x, p.z);
    p.y += (g - p.y) * Math.min(1, dt * 14);
    // Inside a hall, the camera comes in close so the roof isn't in the way.
    const indoors = this.hallAt(p.x, p.z);
    const back = walking ? (indoors ? 6.5 : 8.5) : riding ? 9.5 : 12;
    const up = walking ? (indoors ? 3.4 : 4.4) : riding ? 4.2 : 5.6;
    if (walking) {
      const moving = Math.abs(p.speed) > 0.3;
      this.walkT += dt * Math.abs(p.speed);
      const body = p.obj.userData.body as THREE.Object3D | undefined;
      if (body) {
        body.position.y = 0.8 + (moving ? Math.abs(Math.sin(this.walkT * 1.4)) * 0.18 : Math.sin(performance.now() / 600) * 0.03);
        body.rotation.z = moving ? Math.sin(this.walkT * 1.4) * 0.08 : 0;
      }
      p.obj.position.set(p.x, p.y + PERSON, p.z);
      p.obj.rotation.set(0, p.heading, 0);
    } else {
      p.roll += (-steer * Math.min(1, Math.abs(p.speed) / 12) * (riding ? 0.38 : 0.08) - p.roll) * Math.min(1, dt * 5);
      for (const w of (p.obj.userData.wheels as THREE.Object3D[] | undefined) ?? []) w.rotation.y -= (p.speed * dt) / (riding ? 0.38 : 0.48);
      p.obj.position.set(p.x, p.y + 0.05, p.z);
      p.obj.rotation.set(0, p.heading - Math.PI / 2, 0);
      p.obj.rotateX(p.roll);
    }
    // Pull in closer when a building's behind you, so the camera never ends up inside a roof.
    // Drag to look around; it drifts back behind you once you walk.
    if (Math.abs(p.speed) > 0.5) this.look *= 1 - Math.min(1, dt * 1.5);
    const lf = { x: Math.sin(p.heading + this.look), z: Math.cos(p.heading + this.look) };
    let reach = back;
    while (reach > 2.5 && W.solidAt(p.x - lf.x * reach, p.z - lf.z * reach)) reach -= 0.75;
    const want = this.v3.set(p.x - lf.x * reach, p.y + up * (0.55 + 0.45 * (reach / back)), p.z - lf.z * reach);
    // Don't let the camera dip under a hill.
    want.y = Math.max(want.y, W.groundAt(want.x, want.z) + 1.5);
    this.camera.position.lerp(want, 1 - Math.exp(-dt * 6));
    this.camera.lookAt(p.x + lf.x * 5, p.y + (walking ? 1.8 : 1.4), p.z + lf.z * 5);
  }
  private hallAt(x: number, z: number): HallFrame | null {
    for (const h of this.world.halls) if (h.kind !== 'house' && Math.hypot(x - h.x, z - h.z) < h.r) return h;
    return null;
  }

  // ---------- The animals ----------

  /** Bring the scene in line with the game: who lives where, who's loose, babies, broken fences, the lost kid. */
  sync(z: Zoo) {
    const seen = new Set<string>();
    for (const a of z.animals) {
      seen.add(a.id);
      const baby = a.born !== undefined;
      let c = this.critters.get(a.id);
      // Babies grow up, and animals move house (or go visit another zoo).
      if (c && (c.baby !== baby || c.frame.def.id !== a.habitat)) { this.dropCritter(c); c = undefined; }
      if (!c) c = this.addCritter(a, baby) ?? undefined;
      if (!c) continue;
      // The game changes its animals in place, so remember for ourselves where this one was.
      const wasLoose = c.out;
      c.a = a;
      c.out = a.loose ? a.loose.join(',') : '';
      if (a.loose && c.out !== wasLoose) {
        const w = toWorld(a.loose);
        const s = this.world.walkable(w.x, w.z) ? w : this.world.nearestWalkable(w.x, w.z);
        c.x = s.x; c.z = s.z; c.to = null; c.follow = false; c.climb = null;
      }
      if (!a.loose && wasLoose) {
        c.follow = false;
        const home = this.spotIn(c.frame);
        c.x = home.x; c.z = home.z; c.to = null;
      }
      this.badge(c);
    }
    for (const [id, c] of this.critters) if (!seen.has(id)) this.dropCritter(c);
    this.world.setState(z.owned, z.broken);
    // Exhibit badges: sick, babies, broken fences.
    for (const l of this.exLabels) {
      const e = EXHIBITS.find((x) => x.id === l.id)!;
      const ids = new Set(e.habitats.map((h) => h.id));
      const here = z.animals.filter((a) => ids.has(a.habitat));
      const b = [here.some((a) => a.sick) ? '🤒' : '', here.some((a) => a.born !== undefined) ? '🍼' : '', z.broken.some((h) => ids.has(h)) ? '🔧' : '', here.some((a) => a.loose) ? '❗' : ''].join('');
      const slot = l.el.querySelector('.kz-badges') as HTMLSpanElement;
      if (slot.textContent !== b) slot.textContent = b;
    }
    // Something special going on: a party, a TV crew, a festival.
    const hap = z.happening && z.happening.until > z.clock ? z.happening : null;
    if (hap) {
      const w = toWorld(hap.at);
      this.hapPos.set(w.x, this.world.groundAt(w.x, w.z) + 9, w.z);
      const html = `<span class="kz-em">${hap.emoji}</span> ${hap.label}`;
      if (this.hapLabel.dataset.html !== html) { this.hapLabel.innerHTML = html; this.hapLabel.dataset.html = html; }
    }
    this.hapOn = Boolean(hap);
    // The lost kid.
    if (z.lost && !this.kid) this.addKid(z.lost.name, z.lost.at, z.lost.parent);
    if (!z.lost && this.kid) this.dropKid();
  }

  private badge(c: Critter) {
    const html = `${c.a.sick ? '🤒 ' : ''}${c.baby ? '🍼 ' : ''}${c.a.name || 'New baby'}<i></i>`;
    if (c.label.dataset.html !== html) { c.label.innerHTML = html; c.label.dataset.html = html; }
  }

  private addCritter(a: Animal, baby: boolean): Critter | null {
    const sp = species(a.species);
    const frame = this.world.habitats.get(a.habitat);
    if (!sp || !frame) return null;
    const hall = EXHIBITS.find((e) => e.id === frame.def.exhibit)?.hall;
    const hidden = hall?.kind === 'house';
    const seed = hash(a.id) >>> 0;
    const fig = animalFigure(sp, seed, baby);
    const start = this.spotIn(frame, sp);
    const c: Critter = {
      a, sp, fig, frame, baby, hidden, x: start.x, y: 0, z: start.z, heading: (seed % 628) / 100, to: null, state: 'stand', wait: (seed % 50) / 10,
      phase: (seed % 1000) / 100, climb: null, flyY: 0, eatUntil: 0, follow: false, near: false, out: '',
      label: this.label('', 'kz-animal'),
    };
    c.label.onclick = () => this.cb.onPick({ kind: 'animal', id: a.id });
    fig.group.userData.critter = a.id;
    fig.group.visible = !hidden;
    if (!hidden) this.scene.add(fig.group);
    this.critters.set(a.id, c);
    this.badge(c);
    return c;
  }
  private dropCritter(c: Critter) {
    c.fig.group.removeFromParent();
    c.label.remove();
    this.critters.delete(c.a.id);
  }

  /** A spot inside a habitat; fish and swimmers might pick the water. */
  private spotIn(f: HabitatFrame, sp?: Species, water = false) {
    const wantWater = sp?.look.body === 'fish' || water;
    for (let k = 0; k < 24; k++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * (f.def.moat ? 0.62 : 0.84);
      const ux = Math.cos(a) * f.rx * d, uz = Math.sin(a) * f.rz * d;
      const x = f.x + ux * Math.cos(f.angle) - uz * Math.sin(f.angle), z = f.z + ux * Math.sin(f.angle) + uz * Math.cos(f.angle);
      const wet = this.world.waterAt(x, z) !== null;
      if (wantWater ? wet : !wet || f.def.pool === 1) return { x, z };
      if (wantWater && !f.pool) return { x, z };
    }
    if (wantWater && f.pool) return { x: f.pool.x, z: f.pool.z };
    return { x: f.x, z: f.z };
  }

  private stepCritters(dt: number, t: number) {
    const cam = this.camera.position;
    const p = this.player;
    const W = this.world;
    for (const c of this.critters.values()) {
      if (c.hidden && !c.a.loose) { c.label.style.display = 'none'; continue; }
      const dCam = Math.hypot(c.x - cam.x, c.z - cam.z);
      const far = dCam > 115;
      if (c.hidden && c.a.loose && !c.fig.group.parent) this.scene.add(c.fig.group);
      c.fig.group.visible = !far;
      // Far away, only now and then, and nothing to draw.
      if (far && Math.random() > 0.1) continue;
      const step = far ? dt * 10 : dt;
      const sp = c.sp, body = sp.look.body;
      const up = awake(sp, this.hour) || c.frame.def.tank && c.frame.def.exhibit === 'night';
      let speed = 0;
      let state: AnimalState = 'stand';
      const fish = body === 'fish';
      const flier = body === 'butterfly' || (sp.flies && c.frame.def.walkIn && body !== 'penguin');

      if (c.a.loose) {
        // Out and about: hiding near its spot, or trotting after you.
        if (c.follow) {
          const d = Math.hypot(p.x - c.x, p.z - c.z);
          if (d > 2.4) { c.to = { x: p.x - Math.sin(p.heading) * 1.8, z: p.z - Math.cos(p.heading) * 1.8 }; }
          else c.to = null;
          // Home!
          if (W.habitatD(c.frame, c.x, c.z) < 1.5) { c.follow = false; this.cb.onHome(c.a.id); }
        } else if (!c.to && (c.wait -= step) < 0) {
          const home = toWorld(c.a.loose);
          const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 4;
          const tx = home.x + Math.cos(a) * r, tz = home.z + Math.sin(a) * r;
          if (W.walkable(tx, tz)) c.to = { x: tx, z: tz };
          c.wait = 2 + Math.random() * 4;
        }
        speed = c.follow ? Math.max(sp.speed * 1.4, Math.min(8, Math.hypot(p.x - c.x, p.z - c.z) * 1.5)) : sp.speed * 0.7;
      } else if (!up && !fish) {
        state = 'sleep';
        c.to = null;
        if (c.climb) { c.climb.up = false; }
      } else {
        // Food in the habitat? Go and eat.
        const food = this.foods.find((f) => f.habitat === c.a.habitat);
        const toy = this.toys.find((y) => y.habitat === c.a.habitat);
        if (c.eatUntil > t) { state = 'eat'; c.to = null; }
        else if (food && !fish && !flier && !c.climb) {
          const d = Math.hypot(food.x - c.x, food.z - c.z);
          if (d < 1.2 + c.fig.height * 0.3) { c.eatUntil = t + 6 + Math.random() * 6; c.heading = Math.atan2(food.x - c.x, food.z - c.z); }
          else c.to = { x: food.x + Math.sin(c.phase) * 0.8, z: food.z + Math.cos(c.phase) * 0.8 };
          speed = sp.speed * 1.6;
        } else if (toy && !fish && !flier && !c.climb && body !== 'snake' && body !== 'reptile') {
          c.to = { x: toy.x, z: toy.z };
          speed = sp.speed * 2.2;
        } else if (c.climb) {
          // Up a tree or a pole, a sit at the top, and back down.
          const cl = c.climb;
          const g = W.groundAt(cl.x, cl.z);
          if (cl.up) { cl.t = Math.min(1, cl.t + step * 0.25); if (cl.t >= 1) { cl.sit -= step; if (cl.sit < 0) cl.up = false; } }
          else { cl.t = Math.max(0, cl.t - step * 0.3); if (cl.t <= 0) c.climb = null; }
          c.x = cl.x; c.z = cl.z;
          c.y = g + cl.top * cl.t;
          state = cl.t >= 1 ? 'sit' : 'climb';
        } else if (!c.to && (c.wait -= step) < 0) {
          const r = Math.random();
          if (sp.climbs && c.frame.trees.length && r < 0.25 && body !== 'butterfly') {
            const tr = c.frame.trees[Math.floor(Math.random() * c.frame.trees.length)];
            c.to = { x: tr.x + 0.4, z: tr.z };
            c.climb = null;
            c.flyY = tr.h * 0.62;
          } else {
            const water = Boolean(sp.swims && c.frame.pool && r < 0.45);
            c.to = this.spotIn(c.frame, sp, water);
            c.flyY = flier ? 1.5 + Math.random() * (body === 'butterfly' ? 2.5 : 5) : 0;
          }
          c.wait = (fish ? 0.5 : 3) + Math.random() * (fish ? 2 : 9);
        }
        if (!speed) speed = sp.speed * (fish ? 0.8 : 1);
      }

      // Walk (or swim, or fly) toward the target.
      if (c.to && !(c.climb && !c.a.loose)) {
        const dx = c.to.x - c.x, dz = c.to.z - c.z, d = Math.hypot(dx, dz);
        if (d < 0.25) {
          c.to = null;
          // Arrived at a tree: start climbing.
          if (c.flyY > 0 && sp.climbs && !flier && !c.a.loose && up) c.climb = { x: c.x, z: c.z, top: c.flyY, t: 0, up: true, sit: 5 + Math.random() * 10 };
        } else {
          const mv = Math.min(d, speed * step);
          c.x += (dx / d) * mv;
          c.z += (dz / d) * mv;
          c.heading = turn(c.heading, Math.atan2(dx, dz), Math.min(1, step * 6));
          state = speed > 3.2 ? 'run' : 'walk';
        }
      }
      // Height: ground, water, air or tree.
      const water = W.waterAt(c.x, c.z);
      if (!c.climb || c.a.loose) {
        const g = W.groundAt(c.x, c.z);
        if (fish) {
          const lvl = water ?? g;
          const depth = sp.id === 'stingray' || sp.id === 'koi' ? 0.25 : 0.7 + Math.sin(t * 0.4 + c.phase) * 0.25;
          c.y = lvl - depth - sp.look.size * 0.3;
          state = 'swim';
        } else if (flier && up && !c.a.loose) {
          const tgt = c.to ? g + c.flyY : g + (body === 'butterfly' ? 0.6 + Math.sin(t + c.phase) * 0.3 : 0);
          c.y += (tgt - c.y) * Math.min(1, step * 2);
          if (c.y > g + 0.4) state = 'fly';
        } else if (water !== null && sp.swims && state !== 'sleep') {
          c.y = water;
          state = 'swim';
        } else {
          c.y = water !== null && state === 'sleep' ? g : g;
        }
      }
      if (state === 'stand' && (c.state === 'sit' || c.state === 'stand') && SITTERS.has(sp.id) && (c.state === 'sit' || Math.random() < step * 0.05)) state = 'sit';
      c.state = state;
      if (!c.fig.group.visible) continue;
      c.fig.group.position.set(c.x, c.y, c.z);
      c.fig.group.rotation.y = c.heading;
      c.fig.pose(state === 'sit' && c.state === 'sit' ? 'sit' : state, t, c.phase, speed);
    }
  }

  /** Feed the animals in a habitat: food lands inside the fence, near you, and they come. */
  feed(habitatId: string) {
    const f = this.world.habitats.get(habitatId);
    if (!f) return;
    const p = this.player;
    // The edge nearest you, a little way in.
    const dx = p.x - f.x, dz = p.z - f.z, d = Math.hypot(dx, dz) || 1;
    const sp = [...this.critters.values()].find((c) => c.a.habitat === habitatId)?.sp;
    const fish = sp?.look.body === 'fish' || sp?.look.body === 'seal' || sp?.id === 'penguin';
    for (let k = 0; k < 4; k++) {
      const inK = 0.55 + Math.random() * 0.15;
      const spread = (Math.random() - 0.5) * 0.5;
      const ang = Math.atan2(dz, dx) + spread;
      const ex = Math.cos(ang) * d, ez = Math.sin(ang) * d;
      // Scale the direction to land inside the ellipse.
      const dd = this.world.habitatD(f, f.x + ex, f.z + ez) || 1;
      const x = f.x + (ex / dd) * inK, z = f.z + (ez / dd) * inK;
      const obj = this.foodMesh(sp?.food ?? '', fish);
      const y = this.world.waterAt(x, z) ?? this.world.groundAt(x, z);
      obj.position.set(x, y + 0.15, z);
      this.scene.add(obj);
      this.foods.push({ habitat: habitatId, x, z, until: this.time + 24, obj });
    }
  }
  private foodMesh(food: string, fish: boolean) {
    const g = new THREE.Group();
    const color = fish ? '#9ca3af' : /meat/.test(food) ? '#b91c1c' : /fruit|melon|banana|orange/.test(food) ? '#f59e0b' : /hay|grass|grain/.test(food) ? '#d4b26a' : '#65a30d';
    for (let k = 0; k < 5; k++) {
      const m = new THREE.Mesh(fish ? new THREE.ConeGeometry(0.12, 0.45, 5) : new THREE.IcosahedronGeometry(0.22, 0), flat(color));
      m.position.set((Math.random() - 0.5) * 0.7, 0.05 + Math.random() * 0.15, (Math.random() - 0.5) * 0.7);
      m.rotation.set(Math.random() * 3, Math.random() * 3, fish ? Math.PI / 2 : 0);
      g.add(m);
    }
    return g;
  }
  /** Toss a toy in: a big ball they chase around. */
  play(habitatId: string) {
    const f = this.world.habitats.get(habitatId);
    if (!f) return;
    const obj = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), flat(['#ef4444', '#3b82f6', '#facc15', '#22c55e'][Math.floor(Math.random() * 4)]));
    this.scene.add(obj);
    const a = Math.random() * Math.PI * 2;
    this.toys.push({ habitat: habitatId, obj, x: f.x, z: f.z, vx: Math.cos(a) * 4, vz: Math.sin(a) * 4, until: this.time + 30 });
  }
  private stepThings(dt: number) {
    for (let i = this.foods.length - 1; i >= 0; i--) if (this.foods[i].until < this.time) { this.foods[i].obj.removeFromParent(); this.foods.splice(i, 1); }
    for (let i = this.toys.length - 1; i >= 0; i--) {
      const y = this.toys[i];
      if (y.until < this.time) { y.obj.removeFromParent(); this.toys.splice(i, 1); continue; }
      const f = this.world.habitats.get(y.habitat)!;
      // Nudged by whoever's closest.
      for (const c of this.critters.values()) if (c.a.habitat === y.habitat && Math.hypot(c.x - y.x, c.z - y.z) < 1 + c.fig.height * 0.3) {
        const a = c.heading + (Math.random() - 0.5);
        y.vx += Math.sin(a) * 6; y.vz += Math.cos(a) * 6;
      }
      const nx = y.x + y.vx * dt, nz = y.z + y.vz * dt;
      if (this.world.habitatD(f, nx, nz) > 0.85) { y.vx *= -0.8; y.vz *= -0.8; } else { y.x = nx; y.z = nz; }
      y.vx *= 1 - dt * 0.8; y.vz *= 1 - dt * 0.8;
      const g = this.world.waterAt(y.x, y.z) ?? this.world.groundAt(y.x, y.z);
      y.obj.position.set(y.x, g + 0.45, y.z);
      y.obj.rotation.x += y.vz * dt;
      y.obj.rotation.z -= y.vx * dt;
    }
  }

  /** Coax an escaped animal: it follows you home. */
  lure(id: string) {
    const c = this.critters.get(id);
    if (c?.a.loose) c.follow = true;
  }
  isFollowing(id: string) { return Boolean(this.critters.get(id)?.follow); }

  // ---------- The lost kid ----------

  private person(shirt: string, kid: boolean) {
    const g = new THREE.Group();
    const s = kid ? 0.68 : 1;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28 * s, 0.6 * s, 3, 8), flat(shirt));
    body.position.y = 0.62 * s;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22 * s, 10, 8), flat('#f1c7a5'));
    head.position.y = 1.38 * s;
    g.add(head);
    if (kid) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), flat('#ef4444', { rough: 0.3 }));
      b.position.set(0.4, 2.4, 0);
      g.add(b);
    }
    return g;
  }
  private addKid(name: string, at: [number, number], parentAt: [number, number]) {
    const a = toWorld(at), pa = toWorld(parentAt);
    const s1 = this.world.walkable(a.x, a.z) ? a : this.world.nearestWalkable(a.x, a.z);
    const s2 = this.world.walkable(pa.x, pa.z) ? pa : this.world.nearestWalkable(pa.x, pa.z);
    const obj = this.person('#f472b6', true), parent = this.person('#2563eb', false);
    this.scene.add(obj, parent);
    this.kid = { name, obj, x: s1.x, z: s1.z, parent, px: s2.x, pz: s2.z, follow: false, label: this.label(`🧒 ${name}`, 'kz-kid'), plabel: this.label(`👋 ${name}’s grown-up`, 'kz-kid') };
  }
  private dropKid() {
    if (!this.kid) return;
    this.kid.obj.removeFromParent();
    this.kid.parent.removeFromParent();
    this.kid.label.remove();
    this.kid.plabel.remove();
    this.kid = null;
  }
  helpKid() { if (this.kid) this.kid.follow = true; }
  private stepKid(dt: number, t: number) {
    const k = this.kid;
    if (!k) return;
    const p = this.player;
    if (k.follow) {
      const d = Math.hypot(p.x - k.x, p.z - k.z);
      if (d > 2) { const mv = Math.min(d - 1.6, 7 * dt); k.x += ((p.x - k.x) / d) * mv; k.z += ((p.z - k.z) / d) * mv; }
      if (Math.hypot(k.px - k.x, k.pz - k.z) < 3) { this.cb.onReunited(); k.follow = false; }
    }
    const g = this.world.groundAt(k.x, k.z);
    k.obj.position.set(k.x, g + (k.follow ? Math.abs(Math.sin(t * 8)) * 0.1 : 0), k.z);
    k.obj.rotation.y = Math.atan2(p.x - k.x, p.z - k.z);
    k.parent.position.set(k.px, this.world.groundAt(k.px, k.pz), k.pz);
    k.parent.rotation.y = Math.sin(t * 0.7) * 1.2;
    k.parent.rotation.z = k.follow ? 0 : Math.sin(t * 3) * 0.05;
    void dt;
  }

  // ---------- The train and the Skyfari ----------

  private buildTrain() {
    const W = this.world;
    const cars: THREE.Group[] = [];
    const engine = new THREE.Group();
    const add = (g: THREE.Group, geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, opts: { rx?: number; rz?: number } = {}) => {
      const m = new THREE.Mesh(geo, flat(color, { rough: 0.5, metal: 0.2 }));
      m.position.set(x, y, z);
      if (opts.rx) m.rotation.x = opts.rx;
      if (opts.rz) m.rotation.z = opts.rz;
      g.add(m);
      return m;
    };
    add(engine, new THREE.CylinderGeometry(0.85, 0.85, 3.4, 14), '#14532d', 0, 1.5, 0.6, { rx: Math.PI / 2 });
    add(engine, new THREE.BoxGeometry(2, 2.2, 1.8), '#7f1d1d', 0, 1.9, -1.8);
    add(engine, new THREE.BoxGeometry(2.3, 0.2, 2.2), '#1c1917', 0, 3.1, -1.8);
    add(engine, new THREE.CylinderGeometry(0.28, 0.4, 1.3, 10), '#1c1917', 0, 2.8, 1.6);
    add(engine, new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10), '#fbbf24', 0, 1.6, 2.35, { rx: Math.PI / 2 });
    add(engine, new THREE.BoxGeometry(2, 0.4, 5.4), '#1c1917', 0, 0.55, -0.4);
    for (const z of [-2, -0.4, 1.4]) for (const s of [-1, 1]) add(engine, new THREE.CylinderGeometry(0.45, 0.45, 0.2, 12), '#b91c1c', s * 1.05, 0.5, z, { rz: Math.PI / 2 });
    cars.push(engine);
    const colors = ['#facc15', '#38bdf8', '#f472b6', '#a3e635'];
    for (let k = 0; k < 4; k++) {
      const car = new THREE.Group();
      add(car, new THREE.BoxGeometry(2, 0.5, 4.2), colors[k], 0, 0.75, 0);
      add(car, new THREE.BoxGeometry(2, 0.7, 0.15), colors[k], 0, 1.3, 2.05);
      add(car, new THREE.BoxGeometry(2, 0.7, 0.15), colors[k], 0, 1.3, -2.05);
      add(car, new THREE.BoxGeometry(2.2, 0.12, 4.4), '#f5f5f4', 0, 2.9, 0);
      for (const s of [-1, 1]) for (const z of [-1.9, 1.9]) add(car, new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), '#57534e', s * 0.95, 2.1, z);
      for (const z of [-1.4, 1.4]) for (const s of [-1, 1]) add(car, new THREE.CylinderGeometry(0.35, 0.35, 0.18, 10), '#1c1917', s * 1.05, 0.4, z, { rz: Math.PI / 2 });
      // Riders.
      for (let r = 0; r < 3; r++) {
        if (Math.random() < 0.3) continue;
        const pp = this.person(['#ef4444', '#3b82f6', '#22c55e', '#f97316', '#a855f7'][Math.floor(Math.random() * 5)], Math.random() < 0.4);
        pp.position.set((Math.random() - 0.5) * 0.8, 0.9, -1.3 + r * 1.3);
        pp.scale.setScalar(0.85);
        car.add(pp);
      }
      cars.push(car);
    }
    if (cars.length === 5) cars[4].visible = false;
    for (const c of cars) this.scene.add(c);
    const stationS = (id: string) => {
      const pl = W.places.get(id)!;
      let best = 0, bd = Infinity;
      const pts = W.train.pts, L = W.train.lengths;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const dx = b.x - a.x, dz = b.z - a.z, LL = dx * dx + dz * dz || 1;
        const tt = Math.max(0, Math.min(1, ((pl.x - a.x) * dx + (pl.z - a.z) * dz) / LL));
        const d = Math.hypot(a.x + dx * tt - pl.x, a.z + dz * tt - pl.z);
        if (d < bd) { bd = d; best = L[i] + tt * (L[i + 1] - L[i]); }
      }
      return best;
    };
    const puffs: THREE.Mesh[] = [];
    for (let k = 0; k < 14; k++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshStandardMaterial({ color: '#f5f5f4', transparent: true, opacity: 0, roughness: 1, depthWrite: false }));
      this.scene.add(m);
      puffs.push(m);
    }
    return { cars, s: stationS('depot') + 10, speed: 0, stop: 0, stations: [{ id: 'depot', name: 'Omaha Train Depot', s: stationS('depot') }, { id: 'kenefick', name: 'Kenefick Station', s: stationS('kenefick') }], puffs, puffT: 0, atStation: null as string | null };
  }

  private trackAt(s: number) {
    const tr = this.world.train;
    s = ((s % tr.total) + tr.total) % tr.total;
    let i = 1;
    while (i < tr.lengths.length && tr.lengths[i] < s) i++;
    const a = tr.pts[(i - 1) % tr.pts.length], b = tr.pts[i % tr.pts.length];
    const k = (s - tr.lengths[i - 1]) / Math.max(1e-6, tr.lengths[i] - tr.lengths[i - 1]);
    const x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k;
    return { x, z, y: this.world.trackY(x, z), heading: Math.atan2(b.x - a.x, b.z - a.z) };
  }

  private stepTrain(dt: number, t: number, cars: number) {
    const tr = this.train, total = this.world.train.total;
    tr.cars.forEach((c, i) => { c.visible = i <= cars; });
    // Ahead to the next station: slow down, stop for a bit, then off again.
    const ahead = tr.stations.map((s) => ({ ...s, d: ((s.s - tr.s) % total + total) % total })).sort((a, b) => a.d - b.d)[0];
    if (tr.stop > 0) {
      tr.stop -= dt;
      tr.speed = 0;
      if (tr.stop <= 0) { tr.atStation = null; tr.s += 0.6; }
    } else {
      const want = ahead.d < 18 ? Math.max(1.2, ahead.d * 0.45) : 8;
      tr.speed += (want - tr.speed) * Math.min(1, dt * 1.2);
      tr.s += tr.speed * dt;
      if (ahead.d < 0.5) { tr.stop = 12; tr.atStation = ahead.id; }
    }
    tr.cars.forEach((c, i) => {
      const at = this.trackAt(tr.s - i * 5.4 - (i ? 1.2 : 0));
      const at2 = this.trackAt(tr.s - i * 5.4 - (i ? 1.2 : 0) + 1);
      c.position.set(at.x, at.y + 0.1, at.z);
      c.rotation.set(Math.atan2(at.y - at2.y, 1) * 0.6, Math.atan2(at2.x - at.x, at2.z - at.z), 0);
    });
    // Steam puffs.
    tr.puffT -= dt;
    if (tr.puffT < 0) {
      tr.puffT = tr.speed > 1 ? 0.25 : 0.9;
      const m = tr.puffs.find((x) => (x.material as THREE.MeshStandardMaterial).opacity <= 0.01) ?? tr.puffs[0];
      const e = tr.cars[0];
      m.position.copy(e.localToWorld(this.v3.set(0, 3.5, 1.6)));
      m.scale.setScalar(0.6);
      (m.material as THREE.MeshStandardMaterial).opacity = 0.75;
      m.userData.vy = 1.6;
    }
    for (const m of tr.puffs) {
      const mm = m.material as THREE.MeshStandardMaterial;
      if (mm.opacity <= 0) continue;
      m.position.y += (m.userData.vy ?? 1) * dt;
      m.scale.multiplyScalar(1 + dt * 0.9);
      mm.opacity = Math.max(0, mm.opacity - dt * 0.35);
    }
    void t;
  }

  private buildChairs() {
    const n = 16;
    for (let k = 0; k < n; k++) {
      const g = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 0.8), flat(['#f97316', '#facc15', '#22c55e', '#3b82f6'][k % 4]));
      seat.position.y = -2.4;
      g.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 0.12), seat.material);
      back.position.set(0, -2, -0.4);
      g.add(back);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), flat('#475569'));
      rod.position.y = -1.2;
      g.add(rod);
      if (Math.random() < 0.6) { const pp = this.person(['#ef4444', '#a855f7', '#06b6d4'][k % 3], Math.random() < 0.5); pp.position.set(0, -2.3, 0); pp.scale.setScalar(0.7); g.add(pp); }
      this.scene.add(g);
      this.chairs.push(g);
      this.chairU.push((k / n) * 2);
    }
  }
  private chairAt(u: number) {
    const { a, b } = this.world.skyfari;
    u = ((u % 2) + 2) % 2;
    const going = u < 1, k = going ? u : u - 1;
    const from = going ? a : b, to = going ? b : a;
    const ry = Math.atan2(b.x - a.x, b.z - a.z);
    const side = going ? 1.6 : -1.6;
    const x = from.x + (to.x - from.x) * k + Math.cos(ry) * side, z = from.z + (to.z - from.z) * k - Math.sin(ry) * side;
    const y = from.y + (to.y - from.y) * k - Math.sin(Math.PI * k) * 2.5;
    return { x, y, z, heading: Math.atan2(to.x - from.x, to.z - from.z), k, going };
  }
  private stepChairs(dt: number) {
    const L = this.world.skyfari.a.distanceTo(this.world.skyfari.b);
    const du = (3.2 * dt) / L;
    this.chairs.forEach((c, i) => {
      this.chairU[i] = (this.chairU[i] + du) % 2;
      const p = this.chairAt(this.chairU[i]);
      c.position.set(p.x, p.y, p.z);
      c.rotation.y = p.heading;
    });
  }

  /** On the train, from the station you're at. */
  rideTrain() {
    if (this.ride || !this.train.atStation) return;
    if (this.parked) { this.parked.obj.removeFromParent(); this.parked = null; }
    if (this.mode !== 'walk') { this.player.obj.removeFromParent(); const w = this.kit.walker(); this.scene.add(w); this.player.obj = w; this.mode = 'walk'; this.cb.onModeChange('walk'); }
    this.seat(this.train.cars[1], 0, 0.9, 0.6);
    this.ride = { kind: 'train' };
    this.train.stop = Math.max(this.train.stop, 2);
    this.emitRide();
  }
  /** Up (or down) the Skyfari. */
  rideSkyfari() {
    if (this.ride) return;
    const p = this.player;
    const { a, b } = this.world.skyfari;
    const atBottom = Math.hypot(p.x - a.x, p.z - a.z) < Math.hypot(p.x - b.x, p.z - b.z);
    // The next chair coming in to this end.
    let best = 0, bd = Infinity;
    this.chairU.forEach((u, i) => {
      const start = atBottom ? 0 : 1;
      const d = ((start - u) % 2 + 2) % 2;
      if (d < bd) { bd = d; best = i; }
    });
    this.chairU[best] = atBottom ? 0 : 1;
    if (this.mode !== 'walk') this.setMode('walk');
    this.seat(this.chairs[best], 0, -2.35, 0.05);
    this.ride = { kind: 'skyfari', chair: best, from: atBottom ? 0 : 1 };
    this.emitRide();
  }
  /** Sit you down in a seat that moves (a train car, a Skyfari chair). */
  private seat(on: THREE.Object3D, x: number, y: number, z: number) {
    const o = this.player.obj;
    o.removeFromParent();
    o.position.set(x, y, z);
    o.rotation.set(0, 0, 0);
    o.scale.setScalar(0.75);
    on.add(o);
    this.look = 0;
  }
  private unseat() {
    const o = this.player.obj;
    o.removeFromParent();
    o.scale.setScalar(1);
    o.visible = true;
    this.scene.add(o);
  }
  /** Jump: out of the plane, or off the Skyfari, and the parachute opens. */
  jump() {
    const r = this.ride;
    if (this.chute) return;
    if (r?.kind === 'skyfari') {
      const p = this.chairAt(this.chairU[r.chair]);
      this.ride = null;
      this.unseat();
      this.player.obj.removeFromParent();
      this.openChute(p.x, p.y - 2.4, p.z, p.heading, null);
      this.emitRide();
      return;
    }
    if (this.mode !== 'fly' || r) return;
    const p = this.player;
    this.openChute(p.x, p.y - 1.2, p.z, p.heading, { obj: p.obj, x: p.x, y: p.y, z: p.z, heading: p.heading, speed: p.speed, t: 0 });
  }
  private openChute(x: number, y: number, z: number, heading: number, glider: { obj: THREE.Group; x: number; y: number; z: number; heading: number; speed: number; t: number } | null) {
    const walker = this.kit.walker();
    const canopy = this.kit.canopy();
    canopy.scale.setScalar(0.15);
    walker.add(canopy);
    this.scene.add(walker);
    this.chute = { canopy, t: 0, glider };
    this.player = { obj: walker, x, y, z, heading, speed: 0, roll: 0 };
    this.mode = 'walk';
    this.setNear(null);
    this.cb.onModeChange('walk');
  }
  parachuting() { return Boolean(this.chute); }
  /** Drifting down: A D turn, W glides farther, S drops faster. Lands wherever it lands, yards included. */
  private stepChute(dt: number, input: { steer: number; push: number }) {
    const p = this.player, c = this.chute!;
    c.t += dt;
    const gl = c.glider;
    if (gl) {
      gl.t += dt;
      gl.x += Math.sin(gl.heading) * gl.speed * dt;
      gl.z += Math.cos(gl.heading) * gl.speed * dt;
      gl.y += 5 * dt;
      gl.obj.position.set(gl.x, gl.y, gl.z);
      if (gl.t > 4) { gl.obj.removeFromParent(); c.glider = null; }
    }
    c.canopy.scale.setScalar(Math.min(1, 0.15 + c.t * 2.2));
    p.heading -= input.steer * 1.7 * dt;
    const drift = 5 + Math.max(0, input.push) * 7;
    const nx = p.x + Math.sin(p.heading) * drift * dt, nz = p.z + Math.cos(p.heading) * drift * dt;
    if (this.world.inZoo(nx, nz) || this.world.walkable(nx, nz)) { p.x = nx; p.z = nz; }
    const floor = this.world.groundAt(p.x, p.z);
    p.y = Math.max(floor, p.y - (4.5 + Math.max(0, -input.push) * 9) * dt);
    p.roll += (input.steer * 0.3 - p.roll) * Math.min(1, dt * 3);
    p.obj.position.set(p.x, p.y, p.z);
    p.obj.rotation.set(0, p.heading, 0);
    p.obj.rotateZ(-p.roll + Math.sin(c.t * 1.6) * 0.05);
    const body = p.obj.userData.body as THREE.Object3D | undefined;
    if (body) body.position.y = 0.8;
    const f = { x: Math.sin(p.heading + this.look), z: Math.cos(p.heading + this.look) };
    this.camera.position.lerp(this.v3.set(p.x - f.x * 15, p.y + 4, p.z - f.z * 15), 1 - Math.exp(-dt * 4));
    this.camera.lookAt(p.x + f.x * 6, p.y + 1, p.z + f.z * 6);
    if (p.y <= floor + 0.01) {
      // Down. On a roof or a dome, slide off to the nearest path; anywhere else (a yard!) you stay put.
      if (this.world.solidAt(p.x, p.z) || this.hallAt(p.x, p.z) || !this.world.inZoo(p.x, p.z)) { const s = this.world.nearestWalkable(p.x, p.z); p.x = s.x; p.z = s.z; p.y = this.world.groundAt(s.x, s.z); }
      c.canopy.removeFromParent();
      c.glider?.obj.removeFromParent();
      this.chute = null;
      const f2 = this.world.walkable(p.x, p.z) ? null : this.world.habitatAt(p.x, p.z);
      this.cb.onLanded?.(f2 ? f2.def.name : null);
    }
  }
  getOff() {
    const r = this.ride;
    if (!r) return;
    this.ride = null;
    this.unseat();
    let spot: { x: number; z: number };
    if (r.kind === 'train') {
      const st = this.world.places.get(this.train.atStation ?? 'depot')!;
      spot = st.door;
    } else {
      const u = this.chairU[r.chair];
      const atTop = u >= 0.5 && u < 1.5;
      spot = this.world.places.get(atTop ? 'skyfari-top' : 'skyfari')!.door;
    }
    const s = this.world.walkable(spot.x, spot.z) ? spot : this.world.nearestWalkable(spot.x, spot.z);
    this.player.x = s.x; this.player.z = s.z; this.player.y = this.world.groundAt(s.x, s.z);
    this.player.obj.position.set(s.x, this.player.y, s.z);
    this.emitRide();
  }
  private emitRide() {
    const r = this.ride;
    if (!r) { this.cb.onRide(null); return; }
    if (r.kind === 'train') {
      const tr = this.train, total = this.world.train.total;
      const next = tr.stations.map((s) => ({ ...s, d: ((s.s - tr.s - 1) % total + total) % total })).sort((a, b) => a.d - b.d)[0];
      this.cb.onRide({ kind: 'train', stopped: tr.atStation ? tr.stations.find((s) => s.id === tr.atStation)!.name : null, next: next.name });
    } else this.cb.onRide({ kind: 'skyfari', to: r.from === 0 ? 'the lions' : 'the butterflies' });
  }
  private rideKey = '';
  private stepRide(dt: number) {
    const r = this.ride;
    if (!r) return;
    let pos: THREE.Vector3, heading: number;
    if (r.kind === 'train') {
      const c = this.train.cars[1];
      pos = c.position.clone();
      heading = c.rotation.y;
      // Off to the side and up a little, looking ahead along the train.
      const f = { x: Math.sin(heading + this.look), z: Math.cos(heading + this.look) };
      const want = this.v3.set(pos.x - f.x * 10 + f.z * 5, pos.y + 5, pos.z - f.z * 10 - f.x * 5);
      this.camera.position.lerp(want, 1 - Math.exp(-dt * 3));
      this.camera.lookAt(pos.x + f.x * 8, pos.y + 1.5, pos.z + f.z * 8);
      this.player.x = pos.x; this.player.z = pos.z;
    } else {
      const u = this.chairU[r.chair];
      const k = r.from === 0 ? u : u - 1;
      const p = this.chairAt(u);
      heading = p.heading;
      const f = { x: Math.sin(heading + this.look), z: Math.cos(heading + this.look) };
      // Behind and a little above you in the chair; drag to look all around.
      this.camera.position.lerp(this.v3.set(p.x - f.x * 7, p.y + 0.6, p.z - f.z * 7), 1 - Math.exp(-dt * 4));
      this.camera.lookAt(p.x + f.x * 14, p.y - 5, p.z + f.z * 14);
      this.player.x = p.x; this.player.z = p.z;
      if (k >= 0.995 || k < 0) this.getOff();
    }
    const key = r.kind === 'train' ? `t:${this.train.atStation}` : 's';
    if (key !== this.rideKey) { this.rideKey = key; this.emitRide(); }
  }
  riding() { return this.ride?.kind ?? null; }
  /** Hide the outdoor labels while you're inside a building. */
  hideLabels(on: boolean) { this.layer.style.display = on ? 'none' : ''; }
  /** Out through an exhibit's door, facing away from it. */
  outside(exhibitId: string) {
    const h = this.world.halls.find((x) => x.exhibit.id === exhibitId);
    if (!h) return;
    const away = toPx(h.door.x + (h.door.x - h.x) * 0.15, h.door.z + (h.door.z - h.z) * 0.15);
    this.jumpTo(away);
    this.player.heading = Math.atan2(h.door.x - h.x, h.door.z - h.z);
    this.look = 0;
  }
  /** Drag to look around: on foot, on the train, in a Skyfari chair, under the parachute. */
  turn(dx: number) { this.look = Math.atan2(Math.sin(this.look + dx), Math.cos(this.look + dx)); }

  // ---------- Each frame ----------

  step(dt: number, input: { steer: number; push: number; boost: boolean }, hour: number, weather: Weather, people: { visitors: number; afterDark: boolean; trainCars: number }) {
    if (this.disposed) return;
    this.time += dt;
    const t = this.time;
    if (weather === 'storm' && this.weather !== 'storm') this.sky.thunder();
    this.hour = hour;
    this.weather = weather;
    if (this.ride) this.stepRide(dt);
    else if (this.chute) this.stepChute(dt, input);
    else if (!this.posing) this.stepPlayer(dt, input);
    const p = this.player;
    this.sky.update(dt, t, hour, weather, this.camera.position);
    const dark = this.sky.night;
    for (const m of this.world.glows) m.emissiveIntensity = 0.15 + dark * 1.6;
    for (const f of this.world.ticks) f(t, dt);
    this.stepCritters(dt, t);
    this.stepThings(dt);
    this.stepKid(dt, t);
    this.stepTrain(dt, t, people.trainCars);
    this.stepChairs(dt);
    const keepers = dark > 0.5 && !people.afterDark ? 6 : 4;
    this.crowd.set(people.visitors, dark > 0.45 && people.afterDark, keepers);
    if (!this.filled) { this.crowd.fill(); this.filled = true; }
    this.crowd.update(dt, t, this.camera.position);

    // The flashlight: where you're facing, from about head height.
    const on = this.flashOn && !this.ride;
    this.light.visible = on;
    this.beam.visible = on && dark > 0.3;
    if (on) {
      const f = { x: Math.sin(p.heading), z: Math.cos(p.heading) };
      const y = p.y + (this.mode === 'walk' ? 1.3 : 1.6);
      this.light.intensity = 90;
      this.light.position.set(p.x + f.x * 0.4, y, p.z + f.z * 0.4);
      this.light.target.position.set(p.x + f.x * 12, this.world.groundAt(p.x + f.x * 12, p.z + f.z * 12), p.z + f.z * 12);
      this.beam.position.copy(this.light.position);
      this.beam.lookAt(this.light.target.position);
    }
    if (this.ride) { this.setNear(null); this.cb.onWhere?.(toPx(p.x, p.z), p.heading); return; }

    // What you're next to.
    let near: ZooNear | null = null, best = Infinity;
    const flying = this.mode === 'fly';
    if (!flying) {
      const consider = (n: ZooNear, d: number) => { if (d < best) { near = n; best = d; } };
      for (const c of this.critters.values()) if (c.a.loose && !c.follow) {
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < 4.5) consider({ kind: 'loose', id: c.a.id, name: c.a.name }, d - 3);
      }
      if (this.kid) {
        const k = this.kid;
        if (!k.follow) { const d = Math.hypot(k.x - p.x, k.z - p.z); if (d < 4) consider({ kind: 'kid', name: k.name }, d - 3); }
        else { const d = Math.hypot(k.px - p.x, k.pz - p.z); if (d < 5) consider({ kind: 'parent', name: k.name }, d - 3); }
      }
      for (const f of this.world.habitats.values()) {
        const e = EXHIBITS.find((x) => x.id === f.def.exhibit)!;
        if (e.hall && (e.hall.kind === 'house' || INDOOR.has(e.id))) continue;
        const d = this.world.habitatD(f, p.x, p.z);
        const edge = (d - (f.def.moat ? 1.36 : 1)) * Math.min(f.rx, f.rz);
        if (f.def.walkIn ? d < 1 : edge < 6) consider({ kind: 'habitat', id: f.def.id, name: f.def.name, inside: Boolean(f.def.walkIn && d < 1) }, Math.max(0, edge) + (f.def.walkIn ? 1 : 0));
      }
      for (const h of this.world.halls) {
        const d = Math.hypot(h.door.x - p.x, h.door.z - p.z);
        if (d < (h.kind === 'house' ? 6 : 8)) consider(INDOOR.has(h.exhibit.id) ? { kind: 'hall', exhibit: h.exhibit.id, name: h.exhibit.name } : { kind: 'house', exhibit: h.exhibit.id, name: h.exhibit.name }, d);
      }
      for (const pf of this.world.places.values()) {
        const pl = pf.place;
        if (pl.kind === 'entrance' && pl.id === 'entrance') {
          const d = Math.hypot(pf.x - p.x, pf.z + 6 - p.z);
          if (d < 9) consider({ kind: 'exit' }, d + 1);
          continue;
        }
        if (pl.kind === 'entrance' || pl.kind === 'building' && !['wildkingdom', 'lozier'].includes(pl.id)) continue;
        const d = this.placeD(pf, p.x, p.z);
        if (d < 6) consider({ kind: 'place', id: pl.id, name: pl.name, emoji: pl.emoji, placeKind: pl.kind }, d + 0.5);
      }
      if (this.mode === 'walk' && this.parked && Math.hypot(this.parked.x - p.x, this.parked.z - p.z) < 5) consider({ kind: 'car', name: this.parked.kind === 'ride' ? 'your scooter' : 'your cart' }, -5);
    }
    this.setNear(near);
    this.cb.onWhere?.(toPx(p.x, p.z), p.heading);
  }
  private filled = false;
  private placeD(pf: PlaceFrame, x: number, z: number) {
    return Math.min(Math.hypot(pf.door.x - x, pf.door.z - z), Math.hypot(pf.x - x, pf.z - z) - pf.place.r * K);
  }

  /** Is the train in, at a station near here? */
  trainHere(placeId: string) { return this.train.atStation === placeId; }

  tap(ndc: THREE.Vector2): ZooPick | null {
    this.ray.setFromCamera(ndc, this.camera);
    const list = [...this.critters.values()].filter((c) => c.fig.group.visible && c.fig.group.parent && Math.hypot(c.x - this.camera.position.x, c.z - this.camera.position.z) < 80);
    const hit = this.ray.intersectObjects(list.map((c) => c.fig.group), true)[0];
    if (hit) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.critter) o = o.parent;
      if (o) return { kind: 'animal', id: o.userData.critter };
    }
    return null;
  }
  hover(ndc: THREE.Vector2) { return Boolean(this.tap(ndc)); }

  placeLabels(w: number, h: number) {
    const cam = this.camera.position;
    const place = (el: HTMLDivElement, pos: THREE.Vector3, maxD: number) => {
      const d = pos.distanceTo(cam);
      this.v3.copy(pos).project(this.camera);
      if (this.v3.z > 1 || d > maxD || Math.abs(this.v3.x) > 1.15 || Math.abs(this.v3.y) > 1.15) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
      el.style.display = '';
      el.style.opacity = String(Math.min(1, (maxD - d) / (maxD * 0.25)));
      el.style.transform = `translate(-50%, -100%) translate(${((this.v3.x + 1) / 2) * w}px, ${((1 - this.v3.y) / 2) * h}px)`;
    };
    const p = this.player;
    for (const l of this.exLabels) place(l.el, l.pos, this.mode === 'fly' ? 420 : 150);
    if (this.hapOn) place(this.hapLabel, this.hapPos, 600); else this.hapLabel.style.display = 'none';
    // Names over the nearest animals.
    const close = [...this.critters.values()].filter((c) => !c.hidden || c.a.loose).map((c) => ({ c, d: Math.hypot(c.x - p.x, c.z - p.z) }));
    close.sort((a, b) => a.d - b.d);
    const show = new Set(close.filter((x) => x.d < 26).slice(0, 10).map((x) => x.c));
    const pos = new THREE.Vector3();
    for (const { c, d } of close) {
      const loose = Boolean(c.a.loose);
      const visible = show.has(c) || (loose && d < 30) || (c.a.sick && d < 40);
      if (!visible || !c.fig.group.visible) { if (c.label.style.display !== 'none') c.label.style.display = 'none'; continue; }
      const z = c.state === 'sleep' ? ' 💤' : '';
      const i = c.label.querySelector('i');
      if (i && i.textContent !== z) i.textContent = z;
      c.label.classList.toggle('kz-loose', loose);
      pos.set(c.x, c.y + c.fig.height + 0.6, c.z);
      place(c.label, pos, loose ? 40 : 60);
    }
    if (this.kid) {
      const k = this.kid;
      place(k.label, pos.set(k.x, this.world.groundAt(k.x, k.z) + 3.2, k.z), 50);
      if (k.follow) place(k.plabel, pos.set(k.px, this.world.groundAt(k.px, k.pz) + 2.6, k.pz), 400);
      else k.plabel.style.display = 'none';
    }
  }

  /** Where the loose animals and the lost kid are, for the map. */
  markers() {
    const out: { kind: 'loose' | 'kid' | 'parent' | 'train'; px: Px; name: string }[] = [];
    for (const c of this.critters.values()) if (c.a.loose) out.push({ kind: 'loose', px: toPx(c.x, c.z), name: c.a.name });
    if (this.kid) { out.push({ kind: 'kid', px: toPx(this.kid.x, this.kid.z), name: this.kid.name }); if (this.kid.follow) out.push({ kind: 'parent', px: toPx(this.kid.px, this.kid.pz), name: this.kid.name }); }
    out.push({ kind: 'train', px: toPx(this.train.cars[0].position.x, this.train.cars[0].position.z), name: 'Train' });
    return out;
  }

  /** For checking the animals: every species in rows on the entrance plaza, and the camera on them. Development only. */
  private posing = false;
  lineup(ids: string[], baby = false) {
    this.posing = ids.length > 0;
    this.player.obj.visible = !this.posing;
    const old = this.scene.getObjectByName('lineup');
    if (old) old.removeFromParent();
    const g = new THREE.Group();
    g.name = 'lineup';
    const gate = this.world.places.get('entrance')!;
    const y = this.world.groundAt(gate.x, gate.z);
    const per = 6;
    if (!ids.length) return;
    ids.forEach((id, i) => {
      const sp = species(id);
      if (!sp) return;
      const f = animalFigure(sp, 2 + i, baby);
      const row = Math.floor(i / per), col = i % per;
      f.group.position.set(gate.x - 15 + col * 6, y + (sp.look.body === 'fish' ? 0.4 : sp.look.body === 'bat' ? 2 : 0), gate.z - 6 - row * 7);
      f.group.rotation.y = 0.6;
      f.pose('stand', 1, 0, 0);
      g.add(f.group);
    });
    this.scene.add(g);
    this.camera.position.set(gate.x, y + 6, gate.z + 10);
    this.camera.lookAt(gate.x, y + 1, gate.z - 8);
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    this.layer.remove();
    this.crowd.dispose();
    this.sky.dispose();
    this.world.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
  }
}
