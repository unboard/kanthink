import * as THREE from 'three';
import type { Billboard, FreewayDay } from '@/lib/kanwatch/freeway';
import { hash as signedHash } from '@/lib/kan/city/layout';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { crane, windowBox } from '../city/models';
import type { PlayerKit, ViewMode } from '../city/engine';
import { petFigure, type PetFig } from '../city/pets';
import type { Stray } from './rescue';

/**
 * The Kanwatch Freeway: your days as a road through the country, oldest first.
 *
 * Each day is a building on the left, stacked in floors of what it went into (the
 * biggest at the bottom), as tall as the hours were long, with that day's hours
 * glowing in a strip across its front and its kind of work on the roof. Across the
 * road, billboards: each month's breakdown where the month begins, and between them
 * the things you kept coming back to. Weeks start under a green highway sign.
 *
 * You get about the way you do in the city (on foot, by moped, in the car or on the
 * glider with its parachute) with the same controls and the same cameras. The
 * ground is level along the road so all of that just works; the hills rise beyond
 * it. The sky holds still, turning only with the months, as the trees do. Pull up
 * at a day's door to go inside it.
 */

const hash = (s: string) => signedHash(s) >>> 0;
/** Road length per day. */
const SEG = 64;
/** Empty road before the first day and after the last. */
const LEAD = 2;
const ROAD_W = 6;
const SETBACK = 24;
const BOARD_SIDE = 19;

export type FreewayPick = { kind: 'day'; date: string } | { kind: 'billboard'; index: number } | { kind: 'exit' } | { kind: 'rescue' } | { kind: 'cat'; id: string };
export type FreewayNear = { kind: 'day'; date: string } | { kind: 'billboard'; index: number } | { kind: 'exit' } | { kind: 'car'; name: string } | { kind: 'cat'; id: string; name: string; energy: Stray['energy']; ready: boolean } | { kind: 'rescue' };
export type FreewayMode = Exclude<ViewMode, 'map'>;
export interface FreewayCallbacks {
  onPick(p: FreewayPick): void;
  /** What you're next to: a day's door, a billboard, your parked car, or the way out. */
  onNear(n: FreewayNear | null): void;
  /** The day you're passing, for the timeline. */
  onDay(date: string, progress: number): void;
  /** The scene changed mode on its own: out of the car, or down under the parachute. */
  onModeChange(mode: FreewayMode): void;
  /** A hidden stray you can hear but not yet see. */
  onMeow?(name: string | null): void;
}

/** The height a figure stands at, as in the city. */
const GROUND_Y = 0.36;

interface DayView {
  day: FreewayDay;
  s: number;
  group: THREE.Group;
  proxy: THREE.Mesh;
  label: HTMLDivElement;
  windows: THREE.MeshStandardMaterial[];
  beacon: THREE.Mesh;
  beam: THREE.Mesh;
  star: THREE.Mesh;
  top: number;
  pos: THREE.Vector3;
  /** Its footprint, and the turn of its front toward the road. */
  w: number;
  d: number;
  rot: number;
  door: THREE.Vector3;
}

/** Something standing beside the road that you can't walk or drive through. */
type Block = Pick<DayView, 's' | 'pos' | 'rot' | 'w' | 'd' | 'top'>;

/** A stray waiting by a day, and the cats walking along behind you. */
interface StrayCat {
  s: Stray; fig: PetFig; at: number; x: number; z: number; home: { x: number; z: number }; to: { x: number; z: number } | null;
  heading: number; wait: number; phase: number; label: HTMLDivElement;
  /** What it's up to: about its business, bolting, heading for a treat, eating one, or chasing the feather. */
  state: 'idle' | 'walk' | 'flee' | 'treat' | 'eat' | 'play';
  eatUntil: number;
  run: number;
}
/** A cat you've caught: following along behind, or up on your shoulder purring. */
interface Follower { id: string; fig: PetFig; x: number; z: number; heading: number; phase: number; held: boolean }

/** A held cat rides on top of you (Kan's cap, or a kid's head), a little back and to one side, and shrinks to fit. */
const PERCH = { sink: 0.18, side: 0.2, back: 0.15, scale: 0.7 };

const PALETTE = ['#8b5cf6', '#f472b6', '#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#818cf8', '#2dd4bf', '#f97316', '#a3e635', '#60a5fa', '#e879f9'];
export function tierColor(key: string) {
  if (key === 'other') return '#a8a29e';
  if (key === 'not_work') return '#94a3b8';
  if (key === 'private') return '#64748b';
  if (key === 'new_work') return '#facc15';
  return PALETTE[hash(key) % PALETTE.length];
}

interface Season { ground: string; far: string; trees: string[]; bare: boolean; pine: boolean; fall: 'leaves' | 'snow' | 'petals' | null; fallColors: string[] }
function seasonOf(month: number): Season {
  if (month === 11 || month <= 1) return { ground: '#dfe6ee', far: '#c9d3df', trees: ['#2f5d4a', '#3b6b55'], bare: false, pine: true, fall: 'snow', fallColors: ['#ffffff'] };
  if (month <= 4) return { ground: '#7fb35c', far: '#6a9a52', trees: ['#f4a6c6', '#f9c8dc', '#7fbf5e', '#5fa04a'], bare: false, pine: false, fall: 'petals', fallColors: ['#f9c8dc', '#ffffff'] };
  if (month <= 7) return { ground: '#5f9e48', far: '#4f8a40', trees: ['#3f8f4a', '#4f9f52', '#2f7a42'], bare: false, pine: false, fall: null, fallColors: [] };
  if (month === 8) return { ground: '#7a9a4a', far: '#6b8a45', trees: ['#7fae4b', '#a5b84a', '#5f9a52', '#d4a03a'], bare: false, pine: false, fall: null, fallColors: [] };
  if (month === 9) return { ground: '#8d8a48', far: '#7a7442', trees: ['#e07b2e', '#c9472f', '#e8b13a', '#b5552a', '#d89a2c'], bare: false, pine: false, fall: 'leaves', fallColors: ['#e07b2e', '#c9472f', '#e8b13a'] };
  return { ground: '#7f775a', far: '#6c6650', trees: ['#8a6d4a', '#9a7a52', '#b08a5a'], bare: true, pine: false, fall: 'snow', fallColors: ['#f1f5f9'] };
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const dateParts = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  return { wd: WEEKDAYS[d.getUTCDay()], mon: MONTHS[d.getUTCMonth()], day: d.getUTCDate(), month: d.getUTCMonth(), dow: d.getUTCDay() };
};
const hoursText = (m: number) => (m >= 60 ? `${(m / 60).toFixed(m >= 600 ? 0 : 1)} h` : `${m} min`);

function canvasTexture(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function wrap(x: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (x.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '…');
  return lines;
}
function fit(x: CanvasRenderingContext2D, text: string, weight: number, size: number, maxW: number) {
  let s = size;
  x.font = `${weight} ${s}px ui-sans-serif, system-ui, sans-serif`;
  while (x.measureText(text).width > maxW && s > 12) { s -= 2; x.font = `${weight} ${s}px ui-sans-serif, system-ui, sans-serif`; }
  return s;
}

export class Freeway {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.5, 2500);
  private curve: THREE.CatmullRomCurve3;
  private length = 0;
  private views: DayView[] = [];
  private pickables: THREE.Object3D[] = [];
  /** Everything beside the road, by where it stands, so only what's near is drawn. */
  private cullables: { s: number; objs: THREE.Object3D[] }[] = [];
  private ticks: ((t: number, dt: number) => void)[] = [];
  private layer: HTMLDivElement;
  private time = 0;
  private near: FreewayNear | null = null;
  private dayAt = '';
  /** Where you are along the road. */
  private s = 0;
  private mode: FreewayMode = 'drive';
  private player!: { obj: THREE.Group; x: number; y: number; z: number; heading: number; speed: number; roll: number };
  private parked: { obj: THREE.Group; x: number; z: number; heading: number; kind: 'drive' | 'ride' } | null = null;
  private chute: { canopy: THREE.Group; t: number; slide: { x: number; z: number } | null; glider: { obj: THREE.Group; x: number; y: number; z: number; heading: number; speed: number; t: number } | null } | null = null;
  private walkT = 0;
  /** The road as points, for finding where on it anything is. */
  private line: { x: Float32Array; z: Float32Array; rx: Float32Array; rz: Float32Array; s: Float32Array } | null = null;
  private hint = 0;
  private boardSpots: { index: number; x: number; z: number }[] = [];
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private stars: THREE.Points;
  private sun = new THREE.DirectionalLight('#ffd7a0', 1.6);
  private hemi = new THREE.HemisphereLight('#bcd4ff', '#5a4a3a', 0.9);
  private fall: THREE.Points;
  private fallVel: Float32Array;
  private seasonAt: Season = seasonOf(9);
  private textures: THREE.Texture[] = [];
  private exits: [number, number];
  private hovered: DayView | null = null;
  private disposed = false;
  /** The cat rescue at the end of the road, the strays, and who's following you. */
  private rescue: (Block & { door: THREE.Vector3; label: HTMLDivElement }) | null = null;
  private strays = new Map<string, StrayCat>();
  private followers: Follower[] = [];
  private trail: { x: number; z: number }[] = [];
  private treats: { x: number; z: number; obj: THREE.Group; until: number; taken: string | null }[] = [];
  private meow: string | null = null;
  /** The feather wand, while it's out: the stick, the string and the feather on the end. */
  private wand: { stick: THREE.Mesh; line: THREE.Line; feather: THREE.Group; x: number; y: number; z: number; side: number } | null = null;
  /** A pet makes the cat on your shoulder purr harder for a moment. */
  private pettedAt = -10;
  /** Running (Shift) on foot, which sends shy cats off. */
  private rushing = false;

  constructor(
    private days: FreewayDay[],
    private billboards: Billboard[],
    labels: HTMLDivElement,
    private cb: FreewayCallbacks,
    private kit: PlayerKit,
    start?: string,
  ) {
    this.layer = document.createElement('div');
    this.layer.className = 'kc-fw-labels';
    labels.appendChild(this.layer);

    // The road's line: a heading that drifts in long S-curves, over rolling hills.
    const pts: THREE.Vector3[] = [];
    let x = 0, z = 0, heading = 0;
    const count = days.length + LEAD * 2 + 1;
    for (let k = 0; k < count; k++) {
      heading = 0.55 * Math.sin(k * 0.23) + 0.28 * Math.sin(k * 0.61 + 1.3);
      // Level along the road, so walking and driving are as in the city.
      const y = 0;
      pts.push(new THREE.Vector3(x, y, z));
      x += Math.sin(heading) * SEG;
      z += Math.cos(heading) * SEG;
    }
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    this.length = this.curve.getLength();
    this.curve.arcLengthDivisions = Math.max(400, count * 30);
    this.curve.updateArcLengths();
    this.length = this.curve.getLength();
    this.exits = [SEG * 0.9, this.length - SEG * 0.9];
    const samples = Math.ceil(this.length / 2) + 1;
    const line = { x: new Float32Array(samples), z: new Float32Array(samples), rx: new Float32Array(samples), rz: new Float32Array(samples), s: new Float32Array(samples) };
    for (let k = 0; k < samples; k++) {
      const ss = Math.min(this.length, k * 2);
      const f = this.frame(ss);
      line.x[k] = f.p.x; line.z[k] = f.p.z; line.rx[k] = f.r.x; line.rz[k] = f.r.z; line.s[k] = ss;
    }
    this.line = line;

    this.scene.fog = new THREE.Fog('#f0b48a', 140, 560);
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.sun.castShadow = false;

    // Sky: a dome with a gradient, and stars that come out between days.
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#5b7fd6') }, horizon: { value: new THREE.Color('#ffc48a') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.08,0.,1.); gl_FragColor = vec4(mix(horizon, top, pow(h,0.7)),1.); }',
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1600, 24, 12), this.skyMat);
    this.scene.add(this.sky);
    const starGeo = new THREE.BufferGeometry();
    const sp: number[] = [];
    for (let i = 0; i < 900; i++) {
      const a = Math.random() * Math.PI * 2, e = 0.15 + Math.random() * 1.2;
      sp.push(Math.cos(a) * Math.cos(e) * 1500, Math.sin(e) * 1500, Math.sin(a) * Math.cos(e) * 1500);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.scene.add(this.stars);

    this.buildGround();
    this.buildRoad();
    this.buildTrees();
    this.buildLamps();
    days.forEach((d, i) => this.buildDay(d, i));
    this.buildWeeks();
    billboards.forEach((b, i) => this.buildBillboard(b, i));
    this.buildPortal(this.exits[0] - SEG * 0.35, 'Back to Kan City');
    this.buildPortal(this.exits[1] + SEG * 0.35, 'Back to Kan City');
    this.buildRescue();
    this.allBlocks = this.rescue ? [...this.views, this.rescue] : this.views;

    // Falling leaves or snow, in a box that rides along with you.
    const n = 420;
    const fp = new Float32Array(n * 3);
    this.fallVel = new Float32Array(n);
    for (let i = 0; i < n; i++) { fp[i * 3] = (Math.random() - 0.5) * 90; fp[i * 3 + 1] = Math.random() * 30; fp[i * 3 + 2] = (Math.random() - 0.5) * 90; this.fallVel[i] = 0.6 + Math.random(); }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    this.fall = new THREE.Points(fg, new THREE.PointsMaterial({ color: '#e07b2e', size: 0.45, transparent: true, opacity: 0.9, depthWrite: false }));
    this.scene.add(this.fall);

    const from = start ? this.views.find((v) => v.day.date >= start) ?? this.views[this.views.length - 1] : this.views[Math.max(0, this.views.length - 7)];
    this.spawn('drive', from ? from.s - 14 : this.exits[0] + 4);
  }

  // ---------- The road ----------

  private frame(s: number) {
    const u = THREE.MathUtils.clamp(s / this.length, 0, 1);
    const p = this.curve.getPointAt(u);
    const t = this.curve.getTangentAt(u);
    t.y = 0;
    t.normalize();
    const r = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
    return { p, t, r };
  }
  private dayS(i: number) { return this.length * (i + LEAD + 0.5) / (this.days.length + LEAD * 2); }
  private dayIndexAt(s: number) {
    const f = (s / this.length) * (this.days.length + LEAD * 2) - LEAD - 0.5;
    return THREE.MathUtils.clamp(Math.round(f), 0, this.days.length - 1);
  }

  /** The ground: a broad valley along the road, rising into hills on both sides, in each month's colors. */
  private buildGround() {
    const across = [-260, -170, -110, -70, -44, -30, -18, -9, 0, 9, 18, 30, 44, 70, 110, 170, 260];
    const step = 6;
    const rows = Math.ceil(this.length / step) + 1;
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const c = new THREE.Color(), far = new THREE.Color();
    for (let j = 0; j < rows; j++) {
      const s = Math.min(this.length, j * step);
      const { p, r } = this.frame(s);
      const season = seasonOf(dateParts(this.days[this.dayIndexAt(s)]?.date ?? '2026-10-15').month);
      c.set(season.ground);
      far.set(season.far);
      for (const d of across) {
        const out = Math.max(0, Math.abs(d) - 36);
        const hill = Math.pow(out / 110, 1.5) * 34 * (0.7 + 0.3 * Math.sin(s * 0.013 + d * 0.02)) + Math.sin(s * 0.05 + d * 0.11) * Math.min(1, out / 30) * 2.2;
        pos.push(p.x + r.x * d, p.y - 0.08 + hill, p.z + r.z * d);
        const k = Math.min(1, out / 120);
        const n = 0.93 + 0.07 * Math.sin(s * 0.21 + d * 0.37);
        col.push((c.r + (far.r - c.r) * k) * n, (c.g + (far.g - c.g) * k) * n, (c.b + (far.b - c.b) * k) * n);
      }
    }
    const w = across.length;
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < w - 1; i++) {
      const a = j * w + i, b = a + 1, c2 = a + w, d2 = c2 + 1;
      idx.push(a, b, c2, b, d2, c2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    this.scene.add(m);
  }

  private buildRoad() {
    const tex = canvasTexture(256, 512, (x) => {
      x.fillStyle = '#3a3942';
      x.fillRect(0, 0, 256, 512);
      for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; x.fillRect(Math.random() * 256, Math.random() * 512, 2, 2); }
      x.fillStyle = '#f5f5f4';
      x.fillRect(10, 0, 7, 512);
      x.fillRect(239, 0, 7, 512);
      x.fillStyle = '#facc15';
      x.fillRect(119, 0, 6, 512);
      x.fillRect(131, 0, 6, 512);
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    this.textures.push(tex);
    const step = 2;
    const rows = Math.ceil(this.length / step) + 1;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const shoulder: number[] = [], sidx: number[] = [];
    for (let j = 0; j < rows; j++) {
      const s = Math.min(this.length, j * step);
      const { p, r } = this.frame(s);
      pos.push(p.x - r.x * ROAD_W, p.y + 0.05, p.z - r.z * ROAD_W, p.x + r.x * ROAD_W, p.y + 0.05, p.z + r.z * ROAD_W);
      uv.push(0, s / 16, 1, s / 16);
      for (const d of [-ROAD_W - 2.2, -ROAD_W, ROAD_W, ROAD_W + 2.2]) shoulder.push(p.x + r.x * d, p.y + 0.03, p.z + r.z * d);
      if (j < rows - 1) {
        const a = j * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        const b = j * 4;
        sidx.push(b, b + 1, b + 4, b + 1, b + 5, b + 4, b + 2, b + 3, b + 6, b + 3, b + 7, b + 6);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 })));
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(shoulder, 3));
    sg.setIndex(sidx);
    sg.computeVertexNormals();
    this.scene.add(new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: '#8a7f6c', roughness: 1, side: THREE.DoubleSide })));
  }

  /** Trees in the months' colors, kept clear of the road, the buildings and the billboards. */
  private buildTrees() {
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 2.2, 5);
    trunkGeo.translate(0, 1.1, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1.7, 0);
    crownGeo.translate(0, 3.4, 0);
    const pineGeo = new THREE.ConeGeometry(1.7, 4.4, 6);
    pineGeo.translate(0, 3.9, 0);
    const spots: { x: number; y: number; z: number; s: number; season: Season; rot: number }[] = [];
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let s = 0; s < this.length; s += 5) {
      const { p, r } = this.frame(s);
      const i = this.dayIndexAt(s);
      const season = seasonOf(dateParts(this.days[i]?.date ?? '2026-10-15').month);
      const nearDay = Math.abs(s - this.dayS(i)) < 20;
      for (let k = 0; k < 3; k++) {
        const side = rnd() < 0.5 ? -1 : 1;
        const d = side * (13 + rnd() * 70);
        if (side < 0 && nearDay && d > -SETBACK - 14) continue;
        if (side > 0 && d < BOARD_SIDE + 8 && rnd() < 0.6) continue;
        const out = Math.max(0, Math.abs(d) - 36);
        const hill = Math.pow(out / 110, 1.5) * 34 * (0.7 + 0.3 * Math.sin(s * 0.013 + d * 0.02)) + Math.sin(s * 0.05 + d * 0.11) * Math.min(1, out / 30) * 2.2;
        spots.push({ x: p.x + r.x * d, y: p.y + hill - 0.2, z: p.z + r.z * d, s: 0.7 + rnd() * 0.8, season, rot: rnd() * 6 });
      }
    }
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: '#6b4a32', roughness: 1, flatShading: true }), spots.length);
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }), spots.length);
    const pines = new THREE.InstancedMesh(pineGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }), spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v = new THREE.Vector3(), c = new THREE.Color();
    let ci = 0, pi = 0;
    spots.forEach((t, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot);
      sc.setScalar(t.s);
      m.compose(v.set(t.x, t.y, t.z), q, sc);
      trunks.setMatrixAt(i, m);
      c.set(t.season.trees[(i * 7) % t.season.trees.length]);
      if (t.season.pine || (!t.season.bare && i % 5 === 0)) {
        pines.setMatrixAt(pi, m);
        pines.setColorAt(pi++, t.season.pine ? c : c.multiplyScalar(0.8));
      } else {
        // Bare branches: a smaller, thinner crown in the wood's own color.
        if (t.season.bare) { sc.set(t.s * 0.7, t.s * 0.85, t.s * 0.7); m.compose(v, q, sc); }
        crowns.setMatrixAt(ci, m);
        crowns.setColorAt(ci++, c);
      }
    });
    crowns.count = ci;
    pines.count = pi;
    this.scene.add(trunks, crowns, pines);
  }

  private buildLamps() {
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 6, 5);
    poleGeo.translate(0, 3, 0);
    const headGeo = new THREE.SphereGeometry(0.42, 8, 6);
    headGeo.translate(0, 6.2, 0);
    const n = Math.floor(this.length / 36) * 2;
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: '#33323d' }), n);
    const headMat = new THREE.MeshBasicMaterial({ color: '#ffe3a3' });
    const heads = new THREE.InstancedMesh(headGeo, headMat, n);
    const m = new THREE.Matrix4();
    let i = 0;
    for (let s = 18; s < this.length && i < n - 1; s += 36) {
      const { p, r } = this.frame(s);
      for (const d of [-ROAD_W - 2.6, ROAD_W + 2.6]) {
        m.makeTranslation(p.x + r.x * d, p.y, p.z + r.z * d);
        poles.setMatrixAt(i, m);
        heads.setMatrixAt(i++, m);
      }
    }
    poles.count = heads.count = i;
    this.scene.add(poles, heads);
  }

  // ---------- A day ----------

  private buildDay(day: FreewayDay, i: number) {
    const s = this.dayS(i);
    const { p, r, t } = this.frame(s);
    const g = new THREE.Group();
    const pos = new THREE.Vector3(p.x - r.x * SETBACK, p.y, p.z - r.z * SETBACK);
    g.position.copy(pos);
    // Its front, with the door, faces the road.
    g.rotation.y = Math.atan2(r.x, r.z);
    const hours = day.minutes / 60;
    const H = 2.6 + hours * 2.5;
    const W = 7.5 + Math.min(5, day.tiers.length * 1.1);
    const D = 7.5;
    const windows: THREE.MeshStandardMaterial[] = [];
    const tiers = day.tiers.length ? day.tiers : [{ key: 'other', label: 'Other', folder: null, minutes: day.minutes }];
    const total = tiers.reduce((n, x) => n + x.minutes, 0) || 1;
    let y = 0;
    tiers.forEach((tier, k) => {
      const h = Math.max(1.7, H * (tier.minutes / total));
      const w = W * (1 - k * 0.1), d = D * (1 - k * 0.09);
      const color = new THREE.Color(tierColor(tier.key));
      const wall = `#${color.clone().lerp(new THREE.Color('#ffffff'), 0.5).getHexString()}`;
      const block = windowBox(w, h, d, wall, `#${color.getHexString()}`, 0.35 + Math.min(0.55, tier.minutes / 300), k === 0 ? 'grid' : k % 2 ? 'band' : 'glass');
      block.position.set(((hash(day.date + k) % 7) - 3) * 0.12, y + h / 2, 0);
      g.add(block);
      // A cornice in the floor's own color, so the floors read apart.
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.28, d + 0.3), new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: true }));
      cap.position.set(block.position.x, y + h, 0);
      g.add(cap);
      const mats = block.material as THREE.MeshStandardMaterial[];
      for (const mm of mats) if (mm.emissiveMap) windows.push(mm);
      y += h + 0.28;
    });
    const top = y;

    // The day's hours, glowing across the front: brighter where more of it went. One mesh.
    const cell = (W - 1.2) / 24;
    const parts: THREE.BufferGeometry[] = [];
    day.hours.forEach((m, h) => {
      const k = Math.min(1, m / 50);
      const c = new THREE.Color('#2a2238').lerp(new THREE.Color('#ffd166'), k);
      const bg = new THREE.BoxGeometry(cell * 0.82, 0.2 + k * 0.5, 0.12).toNonIndexed();
      bg.translate(-W / 2 + 0.6 + cell * (h + 0.5), 0.35 + (0.2 + k * 0.5) / 2, D / 2 + 0.08);
      const n = bg.attributes.position.count;
      const cols = new Float32Array(n * 3);
      for (let q = 0; q < n; q++) { cols[q * 3] = c.r; cols[q * 3 + 1] = c.g; cols[q * 3 + 2] = c.b; }
      bg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      bg.deleteAttribute('uv');
      bg.deleteAttribute('normal');
      parts.push(bg);
    });
    const strip = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ vertexColors: true }));
    for (const x of parts) x.dispose();
    g.add(strip);
    // A door with a light over it.
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 0.2), new THREE.MeshStandardMaterial({ color: '#3b2f4a' }));
    door.position.set(W / 2 - 1.6, 1.1, D / 2 + 0.06);
    g.add(door);
    const doorLight = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 0.3), new THREE.MeshBasicMaterial({ color: '#fde68a' }));
    doorLight.position.set(door.position.x, 2.4, D / 2 + 0.15);
    g.add(doorLight);

    // On the roof, what kind of day it was.
    this.roof(g, day.mode, top, hash(day.date));
    // The beacon: a pillar of light while there's sorting to do, a gold star once it's done.
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), new THREE.MeshBasicMaterial({ color: '#c4b5fd' }));
    beacon.position.set(-W / 2 + 1.2, top + 0.7, -D / 2 + 1.2);
    g.add(beacon);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.4, 60, 10, 1, true), new THREE.MeshBasicMaterial({ color: '#a78bfa', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.position.set(beacon.position.x, top + 30, beacon.position.z);
    g.add(beam);
    const star = new THREE.Mesh(starGeometry(), new THREE.MeshStandardMaterial({ color: '#fbbf24', emissive: '#f59e0b', emissiveIntensity: 0.8, metalness: 0.3, roughness: 0.3, flatShading: true }));
    star.position.copy(beacon.position).add(new THREE.Vector3(0, 1.2, 0));
    star.visible = false;
    g.add(star);

    // The motel-style pylon at the end of the driveway: the date, and how long the day was.
    const tex = canvasTexture(256, 384, (x) => {
      const grd = x.createLinearGradient(0, 0, 0, 384);
      grd.addColorStop(0, '#1e1533');
      grd.addColorStop(1, '#2d1b4e');
      x.fillStyle = grd;
      x.fillRect(0, 0, 256, 384);
      x.strokeStyle = tierColor(tiers[0].key);
      x.lineWidth = 10;
      x.strokeRect(8, 8, 240, 368);
      const { wd, mon, day: dd } = dateParts(day.date);
      x.textAlign = 'center';
      x.fillStyle = '#fde68a';
      x.font = '800 54px ui-sans-serif, system-ui, sans-serif';
      x.fillText(wd, 128, 84);
      x.fillStyle = '#ffffff';
      x.font = '900 120px ui-sans-serif, system-ui, sans-serif';
      x.fillText(String(dd), 128, 214);
      x.font = '800 46px ui-sans-serif, system-ui, sans-serif';
      x.fillStyle = '#f9a8d4';
      x.fillText(mon, 128, 272);
      x.fillStyle = '#c4b5fd';
      x.font = '700 36px ui-sans-serif, system-ui, sans-serif';
      x.fillText(hoursText(day.minutes), 128, 336);
    });
    this.textures.push(tex);
    const pylon = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 0.3), new THREE.MeshStandardMaterial({ color: '#4b4458' }));
    post.position.y = 2.5;
    pylon.add(post);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.9), new THREE.MeshBasicMaterial({ map: tex }));
    face.position.set(0, 6.6, 0.18);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.8, 4.1, 0.3), new THREE.MeshStandardMaterial({ color: '#1e1533' }));
    back.position.set(0, 6.6, 0);
    pylon.add(back, face);
    // Turned to catch the eye of whoever is coming.
    const pp = new THREE.Vector3(p.x - r.x * (ROAD_W + 4.5), p.y, p.z - r.z * (ROAD_W + 4.5)).add(t.clone().multiplyScalar(-9));
    pylon.position.copy(pp);
    const facing = r.clone().multiplyScalar(0.55).add(t.clone().multiplyScalar(-0.85));
    pylon.rotation.y = Math.atan2(facing.x, facing.z);
    this.scene.add(pylon);

    // A driveway from the road to the door.
    const a = new THREE.Vector3(p.x - r.x * ROAD_W, p.y + 0.04, p.z - r.z * ROAD_W);
    const len = SETBACK - D / 2 - ROAD_W;
    const dg = new THREE.Group();
    dg.position.copy(a).add(r.clone().multiplyScalar(-len / 2));
    dg.rotation.y = Math.atan2(r.x, r.z);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(4.2, len), new THREE.MeshStandardMaterial({ color: '#5a5560', roughness: 1 }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.x = W / 2 - 1.6;
    dg.add(plane);
    this.scene.add(dg);
    this.cullables.push({ s, objs: [g, pylon, dg] });

    const proxy = new THREE.Mesh(new THREE.BoxGeometry(W + 1, top + 2, D + 1), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.y = (top + 2) / 2;
    proxy.userData.pick = { kind: 'day', date: day.date } satisfies FreewayPick;
    g.add(proxy);
    this.pickables.push(proxy);
    this.scene.add(g);

    const label = document.createElement('div');
    label.className = 'kc-label kc-fw-day';
    label.addEventListener('click', () => this.cb.onPick({ kind: 'day', date: day.date }));
    this.layer.appendChild(label);
    const doorAt = new THREE.Vector3(W / 2 - 1.6, 0, D / 2 + 1.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(pos);
    const view: DayView = { day, s, group: g, proxy, label, windows, beacon, beam, star, top, pos, w: W, d: D, rot: g.rotation.y, door: doorAt };
    this.views.push(view);
    this.paintDay(view);
  }

  private roof(g: THREE.Group, mode: string | null, top: number, seed: number) {
    const m = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, flatShading: true });
    if (mode === 'building') {
      const c = crane(7, '#f2b632');
      c.group.scale.setScalar(0.75);
      c.group.position.set(1.5, top, 0);
      g.add(c.group);
      if (c.tick) { const tick = c.tick; this.ticks.push((t, dt) => tick(t + seed, dt)); }
      return;
    }
    if (mode === 'researching') {
      // A dish listening to the sky.
      const dish = new THREE.Mesh(new THREE.SphereGeometry(1.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), new THREE.MeshStandardMaterial({ color: '#e5e7eb', side: THREE.DoubleSide, metalness: 0.3, roughness: 0.4 }));
      dish.rotation.x = Math.PI * 0.75;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.6, 6), m('#6b7280'));
      mast.position.set(1.4, top + 0.8, 0.5);
      dish.position.set(1.4, top + 1.9, 0.5);
      g.add(mast, dish);
      this.ticks.push((t) => { dish.rotation.z = Math.sin(t * 0.3 + seed) * 0.6; });
      return;
    }
    if (mode === 'admin' || mode === 'communicating') {
      // A water tower, and a blinking aerial.
      for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2, 5), m('#7c5c3e'));
        leg.position.set(1.4 + x, top + 1, z);
        g.add(leg);
      }
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.8, 10), m('#a0714a'));
      tank.position.set(1.4, top + 2.9, 0);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.9, 10), m('#7c4a2e'));
      cone.position.set(1.4, top + 4.25, 0);
      g.add(tank, cone);
    }
    if (mode === 'news_social' || mode === 'entertainment') {
      // A rooftop screen, flickering.
      const scr = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 0.2), new THREE.MeshBasicMaterial({ color: '#38bdf8' }));
      scr.position.set(0.8, top + 1.6, 0);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), m('#4b5563'));
      leg.position.set(0.8, top + 0.4, 0);
      g.add(scr, leg);
      (scr.material as THREE.MeshBasicMaterial).color.setHSL((seed % 360) / 360, 0.6, 0.6);
      return;
    }
    if (mode === 'shopping') {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 1), m('#f472b6'));
      bag.position.set(1.2, top + 0.9, 0);
      g.add(bag);
      return;
    }
    if (mode === 'learning' || mode === 'planning') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m('#c7d2fe'));
      dome.position.set(1, top, 0);
      g.add(dome);
      return;
    }
    // Anything else: an aerial with a light.
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 3.2, 5), m('#6b7280'));
    rod.position.set(1.6, top + 1.6, 0);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), new THREE.MeshBasicMaterial({ color: '#ef4444' }));
    tip.position.set(1.6, top + 3.3, 0);
    g.add(rod, tip);
  }

  private paintDay(v: DayView) {
    const b = v.day.board;
    const done = b && b.cards > 0 && b.sorted >= b.cards;
    const waiting = b ? b.cards - b.sorted : null;
    v.star.visible = Boolean(done);
    v.beam.visible = !done;
    (v.beam.material as THREE.MeshBasicMaterial).color.set(b ? '#a78bfa' : '#e0e7ff');
    (v.beacon.material as THREE.MeshBasicMaterial).color.set(done ? '#fbbf24' : b ? '#c4b5fd' : '#e0e7ff');
    const { wd, mon, day } = dateParts(v.day.date);
    const badge = done ? '<span class="kc-badge" data-tone="gold">Sorted</span>'
      : waiting ? `<span class="kc-badge">${waiting} to sort</span>` : '';
    v.label.innerHTML = `${wd[0]}${wd.slice(1).toLowerCase()} ${mon[0]}${mon.slice(1).toLowerCase()} ${day} · ${hoursText(v.day.minutes)} ${badge}`;
  }

  /** A day's board changed: its beacon and label catch up. */
  setBoard(date: string, board: { cards: number; sorted: number } | null) {
    const v = this.views.find((x) => x.day.date === date);
    if (!v) return;
    v.day = { ...v.day, board };
    this.paintDay(v);
  }

  // ---------- Weeks, months and billboards ----------

  /** A green highway sign over the road where each week begins. */
  private buildWeeks() {
    this.days.forEach((d, i) => {
      const { dow } = dateParts(d.date);
      const first = i === 0 || dateParts(this.days[i - 1].date).dow > dow || Date.parse(d.date) - Date.parse(this.days[i - 1].date) > 6 * 86400_000;
      if (dow !== 1 && !(first && i === 0)) return;
      const week = this.days.filter((x) => Date.parse(x.date) >= Date.parse(d.date) && Date.parse(x.date) < Date.parse(d.date) + 7 * 86400_000);
      const mins = week.reduce((n, x) => n + x.minutes, 0);
      const { mon, day } = dateParts(d.date);
      const tex = canvasTexture(1024, 300, (x) => {
        x.fillStyle = '#0f6b3a';
        x.fillRect(0, 0, 1024, 300);
        x.strokeStyle = '#ffffff';
        x.lineWidth = 10;
        x.beginPath();
        x.roundRect(14, 14, 996, 272, 24);
        x.stroke();
        x.fillStyle = '#ffffff';
        x.textAlign = 'left';
        x.font = '800 92px ui-sans-serif, system-ui, sans-serif';
        x.fillText(`WEEK OF ${mon} ${day}`, 56, 128);
        x.font = '600 58px ui-sans-serif, system-ui, sans-serif';
        x.fillStyle = '#d1fae5';
        x.fillText(`${hoursText(mins)} over ${week.length} day${week.length === 1 ? '' : 's'}`, 56, 222);
        // The arrow, as on a real one.
        x.fillStyle = '#ffffff';
        x.beginPath();
        x.moveTo(930, 210); x.lineTo(880, 120); x.lineTo(980, 120);
        x.closePath();
        x.fill();
      });
      this.textures.push(tex);
      const s = this.dayS(i) - SEG * 0.5 + 6;
      const { p, t } = this.frame(s);
      const g = new THREE.Group();
      g.position.copy(p);
      g.rotation.y = Math.atan2(-t.x, -t.z);
      const steel = new THREE.MeshStandardMaterial({ color: '#9ca3af', metalness: 0.5, roughness: 0.5 });
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.45, 9, 0.45), steel);
        post.position.set(side * (ROAD_W + 2), 4.5, 0);
        g.add(post);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W * 2 + 4.5, 0.5, 0.5), steel);
      beam.position.y = 8.6;
      g.add(beam);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.9), new THREE.MeshBasicMaterial({ map: tex }));
      panel.position.set(-2.2, 7.4, 0.32);
      g.add(panel);
      this.scene.add(g);
      this.cullables.push({ s, objs: [g] });
    });
  }

  private buildBillboard(b: Billboard, index: number) {
    const i = this.days.findIndex((d) => d.date === b.at);
    if (i < 0) return;
    const month = b.kind === 'month';
    const tex = canvasTexture(1024, 512, (x) => this.drawBillboard(x, b));
    this.textures.push(tex);
    const s = month ? this.dayS(i) - SEG * 0.5 + 22 : this.dayS(i) + SEG * 0.1;
    const { p, r, t } = this.frame(s);
    const g = new THREE.Group();
    const side = BOARD_SIDE + (month ? 4 : 0);
    g.position.set(p.x + r.x * side, p.y, p.z + r.z * side);
    const facing = r.clone().multiplyScalar(-0.5).add(t.clone().multiplyScalar(-0.86));
    g.rotation.y = Math.atan2(facing.x, facing.z);
    const W = month ? 22 : 16, H = W / 2, lift = month ? 7 : 5.5;
    const wood = new THREE.MeshStandardMaterial({ color: '#4b3b2f', roughness: 1 });
    for (const x of [-W * 0.3, W * 0.3]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.55, lift + 0.4, 0.55), wood);
      post.position.set(x, (lift + 0.4) / 2, -0.3);
      g.add(post);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, H + 0.6, 0.4), new THREE.MeshStandardMaterial({ color: month ? '#1e1b2e' : '#f8fafc' }));
    back.position.set(0, lift + H / 2, -0.2);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex }));
    face.position.set(0, lift + H / 2, 0.02);
    face.userData.pick = { kind: 'billboard', index } satisfies FreewayPick;
    this.boardSpots.push({ index, x: g.position.x - r.x * 3, z: g.position.z - r.z * 3 });
    this.pickables.push(face);
    // Two lamps leaning over the top, for reading it after dark.
    for (const x of [-W * 0.3, W * 0.3]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.4), wood);
      arm.position.set(x, lift + H + 0.5, 0.5);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 5), new THREE.MeshBasicMaterial({ color: '#fff7d6' }));
      bulb.position.set(x, lift + H + 0.4, 1.2);
      g.add(arm, bulb);
    }
    g.add(back, face);
    this.scene.add(g);
    this.cullables.push({ s, objs: [g] });
    if (month) this.buildArch(this.dayS(i) - SEG * 0.5, b.month);
  }

  private drawBillboard(x: CanvasRenderingContext2D, b: Billboard) {
    const W = 1024, H = 512;
    if (b.kind === 'month') {
      const grd = x.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, '#2e1065');
      grd.addColorStop(1, '#831843');
      x.fillStyle = grd;
      x.fillRect(0, 0, W, H);
      x.fillStyle = '#fde68a';
      fit(x, b.month.toUpperCase(), 900, 86, 924);
      x.fillText(b.month.toUpperCase(), 48, 108);
      x.fillStyle = '#f5d0fe';
      const sub = `${b.hours} hours over ${b.days} days${b.busiest ? ` · busiest ${dateParts(b.busiest.date).mon} ${dateParts(b.busiest.date).day} (${b.busiest.hours} h)` : ''}`;
      fit(x, sub, 600, 38, 924);
      x.fillText(sub, 50, 166);
      const max = Math.max(1, ...b.top.map((t) => t.hours));
      b.top.slice(0, 4).forEach((t, k) => {
        const y = 222 + k * 68;
        x.fillStyle = 'rgba(255,255,255,.12)';
        x.fillRect(50, y, 924, 50);
        x.fillStyle = PALETTE[(k * 3 + 1) % PALETTE.length];
        x.fillRect(50, y, 924 * (t.hours / max), 50);
        x.fillStyle = '#ffffff';
        fit(x, t.label, 700, 32, 640);
        x.fillText(t.label, 68, y + 36);
        x.textAlign = 'right';
        x.font = '800 32px ui-sans-serif, system-ui, sans-serif';
        x.fillText(`${t.hours} h`, 956, y + 36);
        x.textAlign = 'left';
      });
      return;
    }
    if (b.kind === 'again') {
      x.fillStyle = '#fff7ed';
      x.fillRect(0, 0, W, H);
      x.fillStyle = '#ea580c';
      x.fillRect(0, 0, 22, H);
      x.fillStyle = '#9a3412';
      x.font = '800 40px ui-sans-serif, system-ui, sans-serif';
      x.fillText('YOU KEEP COMING BACK TO', 70, 100);
      x.fillStyle = '#1c1917';
      const size = fit(x, b.label, 900, 110, 880);
      x.fillText(b.label, 66, 120 + size);
      x.fillStyle = '#57534e';
      x.font = '600 42px ui-sans-serif, system-ui, sans-serif';
      const a = dateParts(b.first), z = dateParts(b.last);
      x.fillText(`${b.days} days · ${b.hours} hours · ${a.mon} ${a.day} → ${z.mon} ${z.day}`, 70, 400);
      return;
    }
    x.fillStyle = '#0f172a';
    x.fillRect(0, 0, W, H);
    x.fillStyle = '#38bdf8';
    x.font = '800 38px ui-sans-serif, system-ui, sans-serif';
    x.fillText(`WORTH A LOOK${b.site ? ` · ${b.site.replace(/^www\./, '').toUpperCase()}` : ''}`, 56, 84);
    x.fillStyle = '#ffffff';
    x.font = '800 54px ui-sans-serif, system-ui, sans-serif';
    const title = wrap(x, b.title.replace(/^\(\d+\)\s*/, ''), 912, 2);
    title.forEach((l, k) => x.fillText(l, 56, 160 + k * 62));
    x.fillStyle = '#cbd5e1';
    x.font = '500 36px ui-sans-serif, system-ui, sans-serif';
    wrap(x, b.tldr, 912, 4).forEach((l, k) => x.fillText(l, 56, 160 + title.length * 62 + 30 + k * 46));
  }

  /** A glowing arch over the road where a month begins. */
  private buildArch(s: number, month: string) {
    const { p, t } = this.frame(s);
    const g = new THREE.Group();
    g.position.copy(p);
    g.rotation.y = Math.atan2(t.x, t.z);
    const tex = canvasTexture(1024, 160, (x) => {
      x.fillStyle = '#1e1533';
      x.fillRect(0, 0, 1024, 160);
      x.textAlign = 'center';
      x.shadowColor = '#f0abfc';
      x.shadowBlur = 24;
      x.fillStyle = '#fdf4ff';
      x.font = '900 104px ui-sans-serif, system-ui, sans-serif';
      x.fillText(month.toUpperCase(), 512, 118);
    });
    this.textures.push(tex);
    const neon = new THREE.MeshBasicMaterial({ color: '#e879f9' });
    const arc = new THREE.Mesh(new THREE.TorusGeometry(ROAD_W + 4, 0.38, 8, 40, Math.PI), neon);
    arc.position.y = 3.5;
    g.add(arc);
    // The sign hangs from the top of the arch.
    for (const side of [-1, 1]) {
      const wire = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), neon);
      wire.position.set(side * 5.6, ROAD_W + 8.2, 0);
      g.add(wire);
    }
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.5, 0.7), neon);
      leg.position.set(side * (ROAD_W + 4), 1.75, 0);
      g.add(leg);
    }
    for (const dir of [1, -1]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(13, 2), new THREE.MeshBasicMaterial({ map: tex }));
      panel.position.set(0, ROAD_W + 9.6, dir * 0.05);
      if (dir < 0) panel.rotation.y = Math.PI;
      g.add(panel);
    }
    this.scene.add(g);
    this.cullables.push({ s, objs: [g] });
  }

  /** The way back: a swirling ring across the road. */
  private buildPortal(s: number, label: string) {
    const { p, t } = this.frame(s);
    const g = new THREE.Group();
    g.position.copy(p);
    g.rotation.y = Math.atan2(t.x, t.z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ROAD_W + 1.5, 0.6, 10, 48), new THREE.MeshBasicMaterial({ color: '#a78bfa' }));
    ring.position.y = ROAD_W - 0.5;
    const swirlTex = canvasTexture(256, 256, (x) => {
      const grd = x.createRadialGradient(128, 128, 10, 128, 128, 128);
      grd.addColorStop(0, 'rgba(255,255,255,.95)');
      grd.addColorStop(0.35, 'rgba(196,181,253,.7)');
      grd.addColorStop(1, 'rgba(124,58,237,0)');
      x.fillStyle = grd;
      x.fillRect(0, 0, 256, 256);
      x.strokeStyle = 'rgba(255,255,255,.5)';
      x.lineWidth = 6;
      for (let k = 0; k < 5; k++) { x.beginPath(); x.arc(128, 128, 30 + k * 20, k, k + 2.2); x.stroke(); }
    });
    this.textures.push(swirlTex);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(ROAD_W + 1.2, 40), new THREE.MeshBasicMaterial({ map: swirlTex, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    disc.position.y = ROAD_W - 0.5;
    disc.userData.pick = { kind: 'exit' } satisfies FreewayPick;
    this.pickables.push(disc);
    g.add(ring, disc);
    this.scene.add(g);
    this.ticks.push((time) => { disc.rotation.z = time * 0.5; });
    const el = document.createElement('div');
    el.className = 'kc-label kc-townhall';
    el.textContent = label;
    el.addEventListener('click', () => this.cb.onPick({ kind: 'exit' }));
    this.layer.appendChild(el);
    this.portalLabels.push({ el, pos: new THREE.Vector3(p.x, p.y + ROAD_W * 2 + 1.5, p.z) });
  }
  private portalLabels: { el: HTMLDivElement; pos: THREE.Vector3 }[] = [];

  // ---------- Getting about ----------

  private forward(h: number) { return { x: Math.sin(h), z: Math.cos(h) }; }

  /** The nearest point of the road: how far along it, and how far to its side (right +). */
  private nearRoad(x: number, z: number) {
    const L = this.line!;
    const n = L.x.length;
    const look = (from: number, to: number) => {
      let best = -1, bd = Infinity;
      for (let k = Math.max(0, from); k < Math.min(n, to); k++) {
        const dx = x - L.x[k], dz = z - L.z[k];
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = k; }
      }
      return { best, bd };
    };
    let r = look(this.hint - 60, this.hint + 60);
    if (r.bd > 50 * 50) r = look(0, n);
    const k = r.best;
    return { k, s: L.s[k], d: (x - L.x[k]) * L.rx[k] + (z - L.z[k]) * L.rz[k], x: L.x[k], z: L.z[k] };
  }

  /** The day building at this spot, if any (pad widens it). */
  private buildingAt(x: number, z: number, s: number, pad: number): Block | null {
    for (const v of this.blocks()) {
      if (Math.abs(v.s - s) > 50) continue;
      const dx = x - v.pos.x, dz = z - v.pos.z;
      const c = Math.cos(v.rot), sn = Math.sin(v.rot);
      const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      if (Math.abs(lx) < v.w / 2 + pad && Math.abs(lz) < v.d / 2 + pad) return v;
    }
    return null;
  }

  /** Off the road but on a day's driveway. */
  private onDriveway(x: number, z: number, s: number) {
    for (const v of this.blocks()) {
      const len = SETBACK - v.d / 2 - ROAD_W;
      if (Math.abs(v.s - s) > 50) continue;
      const dx = x - v.pos.x, dz = z - v.pos.z;
      const c = Math.cos(v.rot), sn = Math.sin(v.rot);
      const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      if (Math.abs(lx - (v.w / 2 - 1.6)) < 2.3 && lz > v.d / 2 - 0.3 && lz < v.d / 2 + len + 1) return true;
    }
    return false;
  }

  private allBlocks: Block[] | null = null;
  private blocks(): Block[] { return this.allBlocks ?? this.views; }

  private walkable(x: number, z: number) {
    const n = this.nearRoad(x, z);
    if (n.s < 3 || n.s > this.length - 3 || Math.abs(n.d) > 46) return false;
    return !this.buildingAt(x, z, n.s, 0.4);
  }
  private drivable(x: number, z: number) {
    const n = this.nearRoad(x, z);
    if (n.s < 3 || n.s > this.length - 3) return false;
    return Math.abs(n.d) <= ROAD_W + 2 || this.onDriveway(x, z, n.s);
  }
  private groundAt(x: number, z: number) {
    const n = this.nearRoad(x, z);
    const b = this.buildingAt(x, z, n.s, 0.4);
    return b ? b.top + GROUND_Y : GROUND_Y;
  }
  private nearestWalkable(x: number, z: number) {
    for (let r = 1; r <= 40; r += 0.75) {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const nx = x + Math.cos(a) * r, nz = z + Math.sin(a) * r;
        if (this.walkable(nx, nz)) return { x: nx, z: nz };
      }
    }
    const n = this.nearRoad(x, z);
    return { x: n.x, z: n.z };
  }

  private makeFor(mode: FreewayMode) {
    return mode === 'drive' ? this.kit.car() : mode === 'ride' ? this.kit.moped() : mode === 'walk' ? this.kit.walker() : this.kit.flyer();
  }

  /** Put you on the road at s, in the right-hand lane, facing the way the days go. */
  private spawn(mode: FreewayMode, s: number) {
    const { p, t, r } = this.frame(s);
    const lane = mode === 'walk' ? ROAD_W + 1.2 : 2.6;
    const x = p.x + r.x * lane, z = p.z + r.z * lane;
    const heading = Math.atan2(t.x, t.z);
    const obj = this.makeFor(mode);
    this.scene.add(obj);
    this.mode = mode;
    this.player = { obj, x, y: mode === 'fly' ? 26 : mode === 'walk' ? GROUND_Y : 0.1, z, heading, speed: mode === 'fly' ? 16 : 0, roll: 0 };
    this.s = s;
    this.hint = Math.round(s / 2);
    const f = this.forward(heading);
    this.camera.position.set(x - f.x * 14, this.player.y + 7, z - f.z * 14);
    this.camera.lookAt(x, this.player.y, z);
  }

  getMode() { return this.mode; }

  /** Walk, ride, drive or fly, from wherever you are now. */
  setMode(mode: FreewayMode) {
    if (mode === this.mode && !this.chute) return;
    this.endChute();
    if (this.parked) { this.parked.obj.removeFromParent(); this.parked = null; }
    const p = this.player;
    p.obj.removeFromParent();
    const ok = mode === 'walk' ? this.walkable(p.x, p.z) : mode === 'fly' ? true : this.drivable(p.x, p.z);
    if (!ok) { this.spawn(mode, this.s); this.setNear(null); return; }
    const obj = this.makeFor(mode);
    this.scene.add(obj);
    this.mode = mode;
    this.player = { obj, x: p.x, y: mode === 'fly' ? Math.max(26, p.y) : mode === 'walk' ? GROUND_Y : 0.1, z: p.z, heading: p.heading, speed: mode === 'fly' ? 16 : 0, roll: 0 };
    this.setNear(null);
  }

  /** Mid-flight: hop out under a parachute and come down beside the road. */
  jump() {
    const p = this.player;
    if (this.mode !== 'fly' || this.chute) return;
    const walker = this.kit.walker();
    const canopy = this.kit.canopy();
    canopy.scale.setScalar(0.15);
    walker.add(canopy);
    this.scene.add(walker);
    this.chute = { canopy, t: 0, slide: null, glider: { obj: p.obj, x: p.x, y: p.y, z: p.z, heading: p.heading, speed: p.speed, t: 0 } };
    this.player = { obj: walker, x: p.x, y: p.y - 1.2, z: p.z, heading: p.heading, speed: 0, roll: 0 };
    this.mode = 'walk';
    this.setNear(null);
    this.cb.onModeChange('walk');
  }

  /** Pull over and get out: the car (or moped) stays parked and you walk. */
  getOut() {
    const p = this.player;
    if (this.mode !== 'drive' && this.mode !== 'ride') return;
    (p.obj.userData.driver as THREE.Object3D | undefined)?.removeFromParent();
    this.parked = { obj: p.obj, x: p.x, z: p.z, heading: p.heading, kind: this.mode };
    const f = this.forward(p.heading);
    let spot = { x: p.x + f.z * 2.6, z: p.z - f.x * 2.6 };
    if (!this.walkable(spot.x, spot.z)) spot = this.nearestWalkable(p.x, p.z);
    const walker = this.kit.walker();
    this.scene.add(walker);
    this.player = { obj: walker, x: spot.x, y: GROUND_Y, z: spot.z, heading: p.heading, speed: 0, roll: 0 };
    this.mode = 'walk';
    this.setNear(null);
    this.cb.onModeChange('walk');
  }

  /** Back in the car (or on the moped) you parked. */
  getIn() {
    const p = this.player, car = this.parked;
    if (this.mode !== 'walk' || !car) return;
    p.obj.removeFromParent();
    this.kit.seat(car.obj);
    this.player = { obj: car.obj, x: car.x, y: 0.1, z: car.z, heading: car.heading, speed: 0, roll: 0 };
    this.parked = null;
    this.mode = car.kind;
    this.setNear(null);
    this.cb.onModeChange(car.kind);
  }

  private endChute() {
    const c = this.chute;
    if (!c) return;
    c.canopy.removeFromParent();
    c.glider?.obj.removeFromParent();
    this.chute = null;
  }

  /** Over to a day, the way you're getting about now. */
  jumpTo(date: string) {
    const v = this.views.find((x) => x.day.date === date);
    if (!v) return;
    this.endChute();
    if (this.parked) { this.parked.obj.removeFromParent(); this.parked = null; }
    this.player.obj.removeFromParent();
    this.spawn(this.mode, v.s - 14);
    this.setNear(null);
  }

  private setNear(n: FreewayNear | null) {
    const key = (x: FreewayNear | null) => (x ? JSON.stringify(x) : '');
    if (key(n) === key(this.near)) return;
    this.near = n;
    this.cb.onNear(n);
  }

  /** Drifting down: A D turn, W glides farther, S spills air and drops faster. */
  private stepChute(dt: number, input: { steer: number; push: number }) {
    const p = this.player, c = this.chute!;
    const { steer, push } = input;
    c.t += dt;
    const gl = c.glider;
    if (gl) {
      gl.t += dt;
      const gf = this.forward(gl.heading);
      gl.x += gf.x * gl.speed * dt;
      gl.z += gf.z * gl.speed * dt;
      gl.y += 5 * dt;
      gl.obj.position.set(gl.x, gl.y, gl.z);
      gl.obj.rotation.set(0, gl.heading, 0);
      gl.obj.rotateX(-0.25);
      if (gl.t > 4) { gl.obj.removeFromParent(); c.glider = null; }
    }
    c.canopy.scale.setScalar(Math.min(1, 0.15 + c.t * 2.2));
    p.heading -= steer * 1.7 * dt;
    const f = this.forward(p.heading);
    if (c.slide) {
      const dx = c.slide.x - p.x, dz = c.slide.z - p.z, d = Math.hypot(dx, dz);
      const stepLen = Math.min(d, 11 * dt);
      if (d > 0.01) { p.x += (dx / d) * stepLen; p.z += (dz / d) * stepLen; }
      if (d < 0.05) c.slide = null;
    } else {
      const drift = 6 + Math.max(0, push) * 7;
      p.x += f.x * drift * dt;
      p.z += f.z * drift * dt;
    }
    const fall = c.slide ? 6 : 4.5 + Math.max(0, -push) * 9;
    const floor = this.groundAt(p.x, p.z);
    p.y = Math.max(floor, p.y - fall * dt);
    if (p.y <= floor + 0.01) {
      if (floor <= GROUND_Y + 0.01 && this.walkable(p.x, p.z)) {
        c.slide = null;
        this.endChute();
        p.y = GROUND_Y;
        p.speed = 0;
      } else if (!c.slide) c.slide = this.nearestWalkable(p.x, p.z);
    }
    p.roll += (steer * 0.3 - p.roll) * Math.min(1, dt * 3);
    p.obj.position.set(p.x, p.y, p.z);
    p.obj.rotation.set(0, p.heading, 0);
    p.obj.rotateZ(-p.roll + Math.sin(c.t * 1.6) * 0.05);
    const body = p.obj.userData.body as THREE.Object3D | undefined;
    if (body) body.position.y = 0.8;
    this.camera.position.lerp(new THREE.Vector3(p.x - f.x * 15, p.y + 4, p.z - f.z * 15), 1 - Math.exp(-dt * 4));
    this.camera.lookAt(p.x + f.x * 6, p.y + 1, p.z + f.z * 6);
  }

  /** The city's own handling and cameras, mode for mode. */
  private stepPlayer(dt: number, input: { steer: number; push: number; boost: boolean }) {
    if (this.chute) { this.stepChute(dt, input); return; }
    const p = this.player;
    const { steer, push, boost } = input;
    if (this.mode === 'fly') {
      const target = boost ? 46 : 22;
      p.speed += (target - p.speed) * Math.min(1, dt * 1.5);
      p.heading -= steer * 1.35 * dt;
      p.y += push * 15 * dt;
      const n = this.nearRoad(p.x, p.z);
      const b = this.buildingAt(p.x, p.z, n.s, 1);
      p.y = THREE.MathUtils.clamp(p.y, (b ? b.top : 0.5) + GROUND_Y + 3, 150);
      const f = this.forward(p.heading);
      p.x += f.x * p.speed * dt;
      p.z += f.z * p.speed * dt;
      // Too far from the road (or past either end), it banks you back toward it.
      const ahead = this.frame(THREE.MathUtils.clamp(n.s, SEG, this.length - SEG)).p;
      if (Math.abs(n.d) > 150 || n.s < SEG * 0.5 || n.s > this.length - SEG * 0.5) {
        const home = Math.atan2(ahead.x - p.x, ahead.z - p.z);
        let d = home - p.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        p.heading += Math.sign(d) * Math.min(Math.abs(d), dt * 1.2);
      }
      p.roll += (steer * 0.55 - p.roll) * Math.min(1, dt * 4);
      p.obj.position.set(p.x, p.y, p.z);
      p.obj.rotation.set(0, p.heading, 0);
      p.obj.rotateZ(p.roll);
      p.obj.rotateX(-push * 0.18);
      this.camera.position.lerp(new THREE.Vector3(p.x - f.x * 15, p.y + 5.5, p.z - f.z * 15), 1 - Math.exp(-dt * 4));
      this.camera.lookAt(p.x + f.x * 10, p.y - 1, p.z + f.z * 10);
      return;
    }
    const walking = this.mode === 'walk', riding = this.mode === 'ride';
    const ok = (x: number, z: number) => (walking ? this.walkable(x, z) : this.drivable(x, z) || (riding && this.walkable(x, z)));
    if (walking) {
      p.speed += ((boost ? 14 : 7.5) * push - p.speed) * Math.min(1, dt * 10);
      p.heading -= steer * 2.8 * dt;
    } else if (riding) {
      const top = boost ? 30 : 19;
      if (push > 0) p.speed = Math.min(top, p.speed + push * 34 * dt);
      else if (push < 0) p.speed = Math.max(-5, p.speed + push * (p.speed > 0 ? 44 : 12) * dt);
      else p.speed -= Math.sign(p.speed) * Math.min(Math.abs(p.speed), 11 * dt);
      p.heading -= steer * 3.1 * dt * THREE.MathUtils.clamp(Math.abs(p.speed) / 3.5, 0, 1) * Math.sign(p.speed || 1);
    } else {
      const top = boost ? 36 : 24;
      if (push > 0) p.speed = Math.min(top, p.speed + push * 26 * dt);
      else if (push < 0) p.speed = Math.max(-9, p.speed + push * (p.speed > 0 ? 40 : 16) * dt);
      else p.speed -= Math.sign(p.speed) * Math.min(Math.abs(p.speed), 9 * dt);
      p.heading -= steer * 2.3 * dt * THREE.MathUtils.clamp(Math.abs(p.speed) / 7, 0, 1) * Math.sign(p.speed || 1);
    }
    const f = this.forward(p.heading);
    const nx = p.x + f.x * p.speed * dt, nz = p.z + f.z * p.speed * dt;
    if (ok(nx, nz)) { p.x = nx; p.z = nz; }
    else if (ok(nx, p.z)) { p.x = nx; p.speed *= 1 - 2 * dt; }
    else if (ok(p.x, nz)) { p.z = nz; p.speed *= 1 - 2 * dt; }
    else p.speed *= walking ? 0 : -0.25;
    if (walking) {
      const moving = Math.abs(p.speed) > 0.3;
      this.walkT += dt * Math.abs(p.speed);
      const body = p.obj.userData.body as THREE.Object3D | undefined;
      if (body) {
        body.position.y = 0.8 + (moving ? Math.abs(Math.sin(this.walkT * 1.4)) * 0.18 : Math.sin(performance.now() / 600) * 0.03);
        body.rotation.z = moving ? Math.sin(this.walkT * 1.4) * 0.08 : 0;
      }
      p.obj.position.set(p.x, GROUND_Y, p.z);
      p.obj.rotation.set(0, p.heading, 0);
      this.camera.position.lerp(new THREE.Vector3(p.x - f.x * 8.5, 4.6, p.z - f.z * 8.5), 1 - Math.exp(-dt * 6));
      this.camera.lookAt(p.x + f.x * 5, 2.2, p.z + f.z * 5);
    } else if (riding) {
      p.roll += (-steer * Math.min(1, Math.abs(p.speed) / 12) * 0.38 - p.roll) * Math.min(1, dt * 5);
      for (const w of (p.obj.userData.wheels as THREE.Object3D[] | undefined) ?? []) w.rotation.y -= (p.speed * dt) / 0.38;
      p.obj.position.set(p.x, 0.12, p.z);
      p.obj.rotation.set(0, p.heading - Math.PI / 2, 0);
      p.obj.rotateX(p.roll);
      this.camera.position.lerp(new THREE.Vector3(p.x - f.x * 9.5, 4.4, p.z - f.z * 9.5), 1 - Math.exp(-dt * 5.5));
      this.camera.lookAt(p.x + f.x * 6, 1.8, p.z + f.z * 6);
    } else {
      p.roll += (-steer * Math.min(1, Math.abs(p.speed) / 20) * 0.08 - p.roll) * Math.min(1, dt * 6);
      for (const w of (p.obj.userData.wheels as THREE.Object3D[] | undefined) ?? []) w.rotation.y -= (p.speed * dt) / 0.48;
      p.obj.position.set(p.x, 0.12, p.z);
      p.obj.rotation.set(0, p.heading - Math.PI / 2, 0);
      p.obj.rotateX(p.roll);
      this.camera.position.lerp(new THREE.Vector3(p.x - f.x * 13, 6.2, p.z - f.z * 13), 1 - Math.exp(-dt * 5));
      this.camera.lookAt(p.x + f.x * 8, 1.6, p.z + f.z * 8);
    }
  }

  step(dt: number, input: { steer: number; push: number; boost: boolean }) {
    if (this.disposed) return;
    this.time += dt;
    const t = this.time;
    this.stepPlayer(dt, input);
    this.rushing = input.boost && Math.abs(this.player.speed) > 9;
    const p = this.player;
    const n = this.nearRoad(p.x, p.z);
    this.hint = n.k;
    this.s = n.s;

    // The sky holds still; only the month tints it, and that changes slowly.
    const i = this.dayIndexAt(this.s);
    const season = seasonOf(dateParts(this.days[i]?.date ?? '2026-10-15').month);
    this.seasonAt = season;
    const cold = season.fall === 'snow' ? 0.4 : 0;
    const k = 1 - Math.exp(-dt * 0.6);
    this.skyMat.uniforms.top.value.lerp(this.skyTop.set('#5b7fd6').lerp(this.skyCold.set('#8094bd'), cold), k);
    this.skyMat.uniforms.horizon.value.lerp(this.skyHorizon.set('#ffcf9e').lerp(this.skyCold.set('#e3e9f4'), cold), k);
    (this.scene.fog as THREE.Fog).color.copy(this.skyMat.uniforms.horizon.value).lerp(this.skyMat.uniforms.top.value, 0.25);
    const cam = this.camera.position;
    this.sky.position.copy(cam);
    this.stars.position.copy(cam);
    this.sun.position.copy(cam).add(new THREE.Vector3(-120, 150, -60));
    this.sun.target.position.copy(cam);

    for (const c of this.cullables) {
      const d = c.s - this.s;
      const show = Math.abs(d) < 480;
      for (const o of c.objs) o.visible = show;
    }
    for (const v of this.views) if (v.group.visible && v.star.visible) v.star.rotation.y = t * 0.8;
    for (const f of this.ticks) f(t, dt);
    this.stepWand(dt, t);
    this.stepCats(dt, t);
    this.stepFall(dt);

    const day = this.days[i];
    if (day && day.date !== this.dayAt) this.dayAt = day.date;
    this.cb.onDay(this.dayAt, this.s / this.length);

    // What you're next to: a day's door, a billboard, your parked car, the way out.
    let near: FreewayNear | null = null, best = Infinity;
    const flying = this.mode === 'fly';
    if (!this.chute) {
      for (const v of this.views) {
        if (Math.abs(v.s - this.s) > 60) continue;
        const d = flying ? Math.hypot(v.pos.x - p.x, v.pos.z - p.z) : Math.hypot(v.door.x - p.x, v.door.z - p.z);
        const reach = this.mode === 'walk' ? 5 : this.mode === 'drive' ? 10 : this.mode === 'ride' ? 8 : 16;
        if (d < reach && d < best && (!flying || p.y < v.top + 30)) { near = { kind: 'day', date: v.day.date }; best = d; }
      }
      if (!flying) for (const b of this.boardSpots) {
        const d = Math.hypot(b.x - p.x, b.z - p.z);
        if (d < (this.mode === 'walk' ? 6 : 9) && d < best) { near = { kind: 'billboard', index: b.index }; best = d; }
      }
      if (!flying && this.rescue && Math.abs(this.rescue.s - this.s) < 60) {
        const d = Math.hypot(this.rescue.door.x - p.x, this.rescue.door.z - p.z);
        if (d < (this.mode === 'walk' ? 5 : 10) && d < best) { near = { kind: 'rescue' }; best = d; }
      }
      if (!flying) for (const c of this.strays.values()) {
        if (Math.abs(c.at - this.s) > 60) continue;
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < (this.mode === 'walk' ? 3.4 : 7) && d < best + 2) { near = { kind: 'cat', id: c.s.id, name: c.s.name, energy: c.s.energy ?? 'curious', ready: this.ready(c) }; best = d; }
      }
      if (this.mode === 'walk' && this.parked && Math.hypot(this.parked.x - p.x, this.parked.z - p.z) < 5) near = { kind: 'car', name: this.parked.kind === 'ride' ? 'your moped' : 'your car' };
      if ((this.s < this.exits[0] || this.s > this.exits[1]) && !flying) near = { kind: 'exit' };
    }
    this.setNear(near);
  }
  private skyTop = new THREE.Color();
  private skyHorizon = new THREE.Color();
  private skyCold = new THREE.Color();

  private stepFall(dt: number) {
    const s = this.seasonAt;
    this.fall.visible = Boolean(s.fall);
    if (!s.fall) return;
    const mm = this.fall.material as THREE.PointsMaterial;
    mm.color.set(s.fallColors[Math.floor(this.time * 0.2) % s.fallColors.length]);
    mm.size = s.fall === 'snow' ? 0.32 : 0.5;
    const arr = (this.fall.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const c = this.player.obj.position;
    for (let k = 0; k < this.fallVel.length; k++) {
      const v = this.fallVel[k];
      arr[k * 3 + 1] -= dt * (s.fall === 'snow' ? 2.2 : 3.2) * v;
      arr[k * 3] += Math.sin(this.time * v + k) * dt * (s.fall === 'leaves' ? 1.6 : 0.6);
      // Keep the flurry around you as you drive.
      let x = arr[k * 3], z = arr[k * 3 + 2];
      if (x - c.x > 45) x -= 90; else if (x - c.x < -45) x += 90;
      if (z - c.z > 45) z -= 90; else if (z - c.z < -45) z += 90;
      arr[k * 3] = x;
      arr[k * 3 + 2] = z;
      if (arr[k * 3 + 1] < c.y - 2) arr[k * 3 + 1] = c.y + 26 + Math.random() * 6;
    }
    this.fall.geometry.attributes.position.needsUpdate = true;
  }


  // ---------- The cat rescue ----------

  /** A cozy house with cat ears on the roof, past the last day, before the way out. */
  private buildRescue() {
    const s = this.dayS(this.days.length - 1) + SEG * 0.6;
    const { p, r } = this.frame(s);
    const W = 10, D = 8, H = 4.4;
    const pos = new THREE.Vector3(p.x - r.x * SETBACK, 0, p.z - r.z * SETBACK);
    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = Math.atan2(r.x, r.z);
    const m = (c: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };
    box(W, H, D, m('#fbcfe8'), 0, H / 2, 0);
    box(W + 0.4, 0.3, D + 0.4, m('#f9a8d4'), 0, 0.15, 0);
    // A pitched roof, and two ears on it.
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(W, D) / 2 + 0.6, 3.2, 4), m('#be185d'));
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1, 1, D / W);
    roof.position.y = H + 1.6;
    g.add(roof);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2, 4), m('#be185d'));
      ear.position.set(side * 2.4, H + 2.6, 0.6);
      ear.rotation.z = -side * 0.35;
      g.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 4), m('#fda4af'));
      inner.position.set(side * 2.4, H + 2.5, 1.05);
      inner.rotation.z = -side * 0.35;
      g.add(inner);
    }
    // Door and windows, with a cat in one of them.
    box(1.8, 2.8, 0.2, m('#7c2d12'), W / 2 - 1.6, 1.4, D / 2 + 0.05);
    box(0.25, 0.25, 0.1, m('#fde047', { emissive: '#fde047', emissiveIntensity: 0.6 }), W / 2 - 1.0, 1.4, D / 2 + 0.2);
    for (const x of [-3, -0.6]) box(1.6, 1.2, 0.15, m('#fef9c3', { emissive: '#fde68a', emissiveIntensity: 0.7 }), x, 1.9, D / 2 + 0.05);
    // The sign over the door: a paw print and the name.
    const tex = canvasTexture(1024, 256, (x) => {
      x.fillStyle = '#fff1f2';
      x.beginPath(); x.roundRect(8, 8, 1008, 240, 60); x.fill();
      x.strokeStyle = '#be185d'; x.lineWidth = 12; x.stroke();
      x.fillStyle = '#be185d';
      const paw = (cx: number, cy: number, k: number) => {
        x.beginPath(); x.ellipse(cx, cy + 18 * k, 34 * k, 28 * k, 0, 0, Math.PI * 2); x.fill();
        for (const [dx, dy] of [[-38, -22], [-14, -44], [14, -44], [38, -22]]) { x.beginPath(); x.ellipse(cx + dx * k, cy + dy * k, 12 * k, 15 * k, 0, 0, Math.PI * 2); x.fill(); }
      };
      paw(120, 130, 1.3);
      paw(904, 130, 1.3);
      x.font = '800 92px ui-sans-serif, system-ui, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('Kan Cat Rescue', 512, 132);
    });
    this.textures.push(tex);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.4), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    sign.position.set(-0.6, H - 0.85, D / 2 + 0.12);
    g.add(sign);
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(W + 1, H + 5, D + 1), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.y = (H + 5) / 2;
    proxy.userData.pick = { kind: 'rescue' } satisfies FreewayPick;
    g.add(proxy);
    this.pickables.push(proxy);
    this.scene.add(g);
    // Its driveway.
    const len = SETBACK - D / 2 - ROAD_W;
    const a = new THREE.Vector3(p.x - r.x * ROAD_W, 0.04, p.z - r.z * ROAD_W);
    const dg = new THREE.Group();
    dg.position.copy(a).add(r.clone().multiplyScalar(-len / 2));
    dg.rotation.y = Math.atan2(r.x, r.z);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(4.2, len), m('#5a5560', { roughness: 1 }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.x = W / 2 - 1.6;
    dg.add(plane);
    this.scene.add(dg);
    this.cullables.push({ s, objs: [g, dg] });
    const label = document.createElement('div');
    label.className = 'kc-label kc-townhall';
    label.addEventListener('click', () => this.cb.onPick({ kind: 'rescue' }));
    this.layer.appendChild(label);
    const door = new THREE.Vector3(W / 2 - 1.6, 0, D / 2 + 1.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(pos);
    this.rescue = { s, pos, rot: g.rotation.y, w: W, d: D, top: H + 3.2, door, label };
    this.setRescueNews(0);
  }

  /** The rescue's sign says when there's good news waiting. */
  setRescueNews(n: number) {
    if (!this.rescue) return;
    this.rescue.label.textContent = n > 0 ? `🐾 Kan Cat Rescue · 💌 ${n} good news` : '🐾 Kan Cat Rescue';
  }

  /** The strays waiting by the road (the ones not yet rescued). Some sit in plain sight; some hide. */
  setStrays(list: Stray[]) {
    for (const c of this.strays.values()) { c.fig.group.removeFromParent(); c.label.remove(); }
    this.strays.clear();
    for (const st of list) {
      const i = this.days.findIndex((d) => d.date === st.date);
      const v = this.views[i];
      if (!v) continue;
      const at = this.dayS(i) + ((st.seed % 2) ? 9 : -9) + ((st.seed >>> 4) % 5) - 2;
      const { p, r, t } = this.frame(at);
      let spot: { x: number; z: number };
      if (st.hidden && (st.seed >>> 5) % 2 === 0) {
        // Round the back of the day's building.
        const back = r.clone().multiplyScalar(-(v.d / 2 + 2.6)).add(t.clone().multiplyScalar(((st.seed >>> 8) % 5) - 2));
        spot = this.nearestWalkable(v.pos.x + back.x, v.pos.z + back.z);
      } else if (st.hidden) {
        // Out among the trees, well off the road.
        spot = this.nearestWalkable(p.x - r.x * (SETBACK + 14), p.z - r.z * (SETBACK + 14));
      } else {
        const side = ROAD_W + 3.5 + ((st.seed >>> 6) % 4);
        spot = this.nearestWalkable(p.x - r.x * side, p.z - r.z * side);
      }
      const fig = petFigure(st.kind, st.color, st.marks);
      fig.group.scale.multiplyScalar(1.6);
      fig.group.position.set(spot.x, GROUND_Y - 0.36, spot.z);
      const proxy = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.4), new THREE.MeshBasicMaterial({ visible: false }));
      proxy.position.y = 0.4;
      proxy.userData.pick = { kind: 'cat', id: st.id } satisfies FreewayPick;
      fig.group.add(proxy);
      this.pickables.push(proxy);
      this.scene.add(fig.group);
      const label = document.createElement('div');
      label.className = 'kc-label';
      label.textContent = `🐱 ${st.name} ${({ sleepy: '💤', curious: '❓', shy: '🙈', zoomy: '💨' } as const)[st.energy ?? 'curious']}`;
      label.addEventListener('click', () => this.cb.onPick({ kind: 'cat', id: st.id }));
      this.layer.appendChild(label);
      this.strays.set(st.id, { s: st, fig, at, x: spot.x, z: spot.z, home: spot, to: null, heading: (st.seed % 628) / 100, wait: 1 + (st.seed % 5), phase: 0, label, state: 'idle', eatUntil: 0, run: 0 });
    }
  }

  /** Whether it'll let you pick it up right now. */
  private ready(c: StrayCat) {
    if (c.state === 'eat' || c.state === 'play') return true;
    if (c.state === 'flee') return false;
    const e = c.s.energy ?? 'curious';
    if (e === 'zoomy') return false;
    if (e === 'shy') return this.mode === 'walk' && !this.rushing;
    return true;
  }

  /** Scoop it up: it follows you (or rides along) until you reach the rescue. */
  catchCat(id: string) {
    const c = this.strays.get(id);
    if (!c || !this.ready(c)) return false;
    this.strays.delete(id);
    c.label.remove();
    const proxy = c.fig.group.children.find((o) => o.userData.pick);
    if (proxy) { this.pickables = this.pickables.filter((x) => x !== proxy); proxy.removeFromParent(); }
    // Straight up onto your shoulder (when you're on foot), purring.
    const held = this.mode === 'walk' && !this.followers.some((f) => f.held);
    const f: Follower = { id, fig: c.fig, x: c.x, z: c.z, heading: c.heading, phase: 0, held: false };
    this.followers.push(f);
    if (held) this.settle(f, true);
    return true;
  }

  /** Who's on your shoulder, if anyone. */
  holding() { return this.followers.find((f) => f.held)?.id ?? null; }

  /** Pick up the nearest cat that's following you, or put down the one you're holding. */
  hold() {
    if (this.mode !== 'walk' || this.chute) return null;
    const cur = this.followers.find((f) => f.held);
    if (cur) { this.settle(cur, false); return null; }
    const p = this.player;
    const pick = [...this.followers].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (!pick) return null;
    this.settle(pick, true);
    return pick.id;
  }

  /** How tall the walker is (Kan's cap, or the top of a kid's head), measured once. */
  private topOf(obj: THREE.Object3D) {
    if (typeof obj.userData.top === 'number') return obj.userData.top as number;
    obj.updateMatrixWorld(true);
    const body = obj.userData.body as THREE.Object3D | undefined;
    const top = new THREE.Box3().setFromObject(obj).max.y - (body ? body.position.y - 0.8 : 0);
    obj.userData.top = top;
    return top;
  }

  /** Give the cat on your shoulder a pet. */
  pet() { if (this.followers.some((f) => f.held)) this.pettedAt = this.time; }

  private settle(f: Follower, held: boolean) {
    f.held = held;
    f.fig.group.scale.setScalar(f.fig.scale * 1.6 * (held ? PERCH.scale : 1));
    if (!held) { f.x = this.player.x; f.z = this.player.z; }
  }

  /** Take out the feather wand, or put it away. Null if you need to be on foot first. */
  toggleWand(): boolean | null {
    if (this.wand) { this.dropWand(); return false; }
    if (this.mode !== 'walk' || this.chute) return null;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1, 6), new THREE.MeshStandardMaterial({ color: '#c9925a', roughness: 0.7 }));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 10 }, () => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: '#ffffff' }));
    line.frustumCulled = false;
    const feather = new THREE.Group();
    feather.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.4 })));
    ([['#f472b6', 0], ['#2dd4bf', 0.7], ['#a78bfa', -0.7], ['#fb923c', 1.4]] as const).forEach(([color, a]) => {
      const plume = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.55, 6), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
      plume.position.set(Math.sin(a) * 0.12, -0.3, Math.cos(a) * 0.05);
      plume.rotation.set(Math.PI + Math.cos(a) * 0.2, 0, a * 0.35);
      plume.scale.set(1, 1, 0.35);
      feather.add(plume);
    });
    feather.scale.setScalar(1.7);
    this.scene.add(stick, line, feather);
    const p = this.player;
    this.wand = { stick, line, feather, x: p.x, y: 1, z: p.z, side: 1 };
    return true;
  }
  wandOut() { return Boolean(this.wand); }
  private dropWand() {
    if (!this.wand) return;
    this.wand.stick.removeFromParent(); this.wand.line.removeFromParent(); this.wand.feather.removeFromParent();
    this.wand = null;
  }

  /** The wand in your hand, and the feather dancing along the ground in front of you. */
  private stepWand(dt: number, t: number) {
    const w = this.wand;
    if (!w) return;
    if (this.mode !== 'walk' || this.chute) { this.dropWand(); return; }
    const p = this.player;
    const f = this.forward(p.heading), r = { x: -f.z, z: f.x };
    const hand = new THREE.Vector3(p.x + r.x * 0.5 * w.side + f.x * 0.3, GROUND_Y + 1.05, p.z + r.z * 0.5 * w.side + f.z * 0.3);
    const sway = Math.sin(t * 2.3) * 0.35;
    const tip = new THREE.Vector3(hand.x + f.x * 3 + r.x * (2.2 + sway) * w.side, GROUND_Y + 2.8 + Math.sin(t * 3.1) * 0.15, hand.z + f.z * 3 + r.z * (2.2 + sway) * w.side);
    // The feather skitters side to side and hops, like something worth pouncing on.
    // Out on whichever side is further from the road, so the cats aren't chasing it into traffic.
    const off = (sg: number) => Math.abs(this.nearRoad(p.x + f.x * 5 + r.x * 3.4 * sg, p.z + f.z * 5 + r.z * 3.4 * sg).d);
    if (off(-w.side) > off(w.side) + 2) w.side = -w.side;
    const side = (3.4 + Math.sin(t * 1.5) * 1.3 + Math.sin(t * 4.3) * 0.2) * w.side;
    const goal = { x: p.x + f.x * 5 + r.x * side, y: GROUND_Y - 0.2 + Math.abs(Math.sin(t * 4.2)) * 0.6, z: p.z + f.z * 5 + r.z * side };
    const k = 1 - Math.exp(-dt * 7);
    w.x += (goal.x - w.x) * k; w.y += (goal.y - w.y) * k; w.z += (goal.z - w.z) * k;
    w.feather.position.set(w.x, w.y + 0.75, w.z);
    w.feather.rotation.set(Math.sin(t * 5) * 0.4, t * 1.5, Math.cos(t * 4) * 0.3);
    const dir = tip.clone().sub(hand);
    w.stick.position.copy(hand).addScaledVector(dir, 0.5);
    w.stick.scale.set(1, dir.length(), 1);
    w.stick.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    // The string sags a little between the tip and the feather.
    const end = new THREE.Vector3(w.x, w.y + 0.85, w.z), mid = tip.clone().lerp(end, 0.5);
    mid.y -= 0.3;
    const pos = w.line.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const u = i / (pos.count - 1), a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      pos.setXYZ(i, tip.x * a + mid.x * b + end.x * c, tip.y * a + mid.y * b + end.y * c, tip.z * a + mid.z * b + end.z * c);
    }
    pos.needsUpdate = true;
  }

  /** A fish treat in a little dish, set down in front of you: any cat that smells it comes over to eat. */
  dropTreat() {
    if (this.mode !== 'walk' || this.chute) return false;
    const p = this.player;
    const f = this.forward(p.heading);
    let at = { x: p.x + f.x * 1.6, z: p.z + f.z * 1.6 };
    if (!this.walkable(at.x, at.z)) at = { x: p.x, z: p.z };
    const g = new THREE.Group();
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.14, 16), new THREE.MeshStandardMaterial({ color: '#f472b6', roughness: 0.6 }));
    dish.position.y = 0.07;
    const fish = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshStandardMaterial({ color: '#fb923c', roughness: 0.5 }));
    fish.scale.set(1.6, 0.6, 0.8);
    fish.position.y = 0.2;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 3), fish.material);
    tail.rotation.z = Math.PI / 2;
    tail.position.set(-0.36, 0.2, 0);
    g.add(dish, fish, tail);
    g.position.set(at.x, 0, at.z);
    this.scene.add(g);
    this.treats.push({ x: at.x, z: at.z, obj: g, until: this.time + 45, taken: null });
    return true;
  }

  /** Into the rescue they go. */
  dropOff() {
    const n = this.followers.length;
    this.pettedAt = -10;
    for (const f of this.followers) f.fig.group.removeFromParent();
    this.followers = [];
    return n;
  }

  carrying() { return this.followers.length; }

  /** Over to the rescue's door. */
  jumpToRescue() {
    if (!this.rescue) return;
    this.endChute();
    if (this.parked) { this.parked.obj.removeFromParent(); this.parked = null; }
    this.player.obj.removeFromParent();
    this.spawn(this.mode === 'fly' ? 'drive' : this.mode, this.rescue.s - 42);
    if (this.mode !== 'drive') this.cb.onModeChange(this.mode);
    this.setNear(null);
  }

  /** Off it goes, somewhere a good way from you, and lives there now. */
  private flee(c: StrayCat, p: { x: number; z: number }) {
    for (let k = 0; k < 8; k++) {
      const a = Math.atan2(c.x - p.x, c.z - p.z) + (Math.random() - 0.5) * 1.6;
      const d = 9 + Math.random() * 6;
      const to = { x: c.x + Math.sin(a) * d, z: c.z + Math.cos(a) * d };
      if (this.walkable(to.x, to.z)) { c.to = to; c.home = to; c.state = 'flee'; c.run = c.s.energy === 'zoomy' ? 10 : 7.5; return; }
    }
  }

  private stepCats(dt: number, t: number) {
    const p = this.player;
    // Treats go stale after a while if nobody comes for them.
    this.treats = this.treats.filter((tr) => {
      if (tr.until > this.time || tr.taken) return true;
      tr.obj.removeFromParent();
      return false;
    });
    let meow: string | null = null, meowD = 40;
    for (const c of this.strays.values()) {
      const show = Math.abs(c.at - this.s) < 200;
      c.fig.group.visible = show;
      if (!show) continue;
      const e = c.s.energy ?? 'curious';
      const dp = Math.hypot(p.x - c.x, p.z - c.z);
      if (c.s.hidden && dp > 11 && dp < meowD) { meow = c.s.name; meowD = dp; }
      // Noticing a treat (a sleepy one only if it's right under its nose).
      if (c.state !== 'eat' && c.state !== 'treat') {
        const tr = this.treats.find((x) => !x.taken && Math.hypot(x.x - c.x, x.z - c.z) < (e === 'sleepy' ? 7 : 24));
        if (tr) { tr.taken = c.s.id; c.state = 'treat'; c.to = { x: tr.x - 0.6, z: tr.z - 0.6 }; c.run = e === 'zoomy' ? 6 : 3.5; }
      }
      // The feather: any cat close enough comes to chase it (a sleepy one only if it lands right by them).
      const w = this.wand;
      const wd = w ? Math.hypot(w.x - c.x, w.z - c.z) : Infinity;
      if (c.state === 'idle' || c.state === 'walk' || c.state === 'play') {
        if (wd < (c.state === 'play' ? 16 : e === 'sleepy' ? 4.5 : 13)) { c.state = 'play'; c.to = null; }
        else if (c.state === 'play') { c.state = 'idle'; c.home = { x: c.x, z: c.z }; c.wait = 2; }
      }
      // Rushed or crowded, the shy and the zoomy bolt.
      if (c.state === 'idle' || c.state === 'walk') {
        if (e === 'zoomy' && dp < 6.5) this.flee(c, p);
        else if (e === 'shy' && dp < 7 && (this.rushing || this.mode !== 'walk')) this.flee(c, p);
      }
      // A curious one trots over to see who you are.
      if (e === 'curious' && c.state === 'idle' && this.mode === 'walk' && dp < 11 && dp > 2.2 && !c.to) {
        c.to = { x: p.x + (c.x - p.x) / dp * 1.6, z: p.z + (c.z - p.z) / dp * 1.6 };
        c.state = 'walk';
      }
      let walking = false, pounce = false;
      if (c.state === 'play' && w) {
        // Right up to the feather, then up on the back legs batting at it.
        const gx = w.x + (c.x - w.x) / (wd || 1) * 0.6, gz = w.z + (c.z - w.z) / (wd || 1) * 0.6;
        const dx = gx - c.x, dz = gz - c.z, d = Math.hypot(dx, dz);
        if (d > 0.8) {
          const k = Math.min(d, (e === 'zoomy' ? 7 : e === 'sleepy' ? 3 : 5) * dt);
          const nx = c.x + (dx / d) * k, nz = c.z + (dz / d) * k;
          if (this.walkable(nx, nz)) { c.x = nx; c.z = nz; walking = true; }
        }
        pounce = !walking;
        c.heading = turn(c.heading, Math.atan2(w.x - c.x, w.z - c.z), dt * 9);
      } else if (c.state === 'eat') {
        const tr = this.treats.find((x) => x.taken === c.s.id);
        if (tr) c.heading = turn(c.heading, Math.atan2(tr.x - c.x, tr.z - c.z), dt * 6);
        if (this.time > c.eatUntil) {
          if (tr) { tr.obj.removeFromParent(); this.treats = this.treats.filter((x) => x !== tr); }
          c.state = 'idle';
          c.home = { x: c.x, z: c.z };
          c.wait = 3;
        }
      } else if (c.to) {
        const dx = c.to.x - c.x, dz = c.to.z - c.z, d = Math.hypot(dx, dz);
        if (d < 0.15) {
          c.to = null;
          if (c.state === 'treat') { c.state = 'eat'; c.eatUntil = this.time + 12; }
          else c.state = 'idle';
        } else {
          const speed = c.state === 'flee' || c.state === 'treat' ? c.run : e === 'zoomy' ? 3.2 : 1.6;
          const k = Math.min(d, speed * dt);
          const nx = c.x + (dx / d) * k, nz = c.z + (dz / d) * k;
          if (this.walkable(nx, nz)) { c.x = nx; c.z = nz; } else { c.to = null; c.state = c.state === 'treat' ? 'eat' : 'idle'; c.eatUntil = this.time + 12; }
          c.heading = turn(c.heading, Math.atan2(dx, dz), dt * 8);
          walking = true;
        }
      } else {
        c.wait -= dt;
        if (dp < 9) c.heading = turn(c.heading, Math.atan2(p.x - c.x, p.z - c.z), dt * 3);
        if (c.wait <= 0) {
          // Pottering about home: the zoomy ones never really stop.
          const a = Math.random() * Math.PI * 2, rr = Math.random() * (e === 'zoomy' ? 5 : 2.2);
          const to = { x: c.home.x + Math.cos(a) * rr, z: c.home.z + Math.sin(a) * rr };
          if (e !== 'sleepy' && this.walkable(to.x, to.z)) { c.to = to; c.state = 'walk'; }
          c.wait = e === 'zoomy' ? 0.8 + Math.random() * 1.5 : e === 'sleepy' ? 12 + Math.random() * 8 : 3 + Math.random() * 5;
        }
      }
      this.poseCat(c.fig, walking, c, t, dp < 9, pounce ? 'play' : c.state === 'eat' ? 'eat' : e === 'sleepy' && !walking ? 'sleep' : 'sit', walking && (c.state === 'flee' || c.state === 'treat' || c.state === 'play'));
      c.fig.group.position.set(c.x, GROUND_Y - 0.36, c.z);
      c.fig.group.rotation.y = c.heading;
    }
    if (meow !== this.meow) { this.meow = meow; this.cb.onMeow?.(meow); }
    // Followers: a little parade along the path you walked, out of sight while you drive.
    const walking = this.mode === 'walk' && !this.chute;
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 0.45) {
      this.trail.push({ x: p.x, z: p.z });
      if (this.trail.length > 120) this.trail.shift();
    }
    const w = this.wand;
    const still = Math.abs(p.speed) < 0.5;
    const pf = this.forward(p.heading), pr = { x: -pf.z, z: pf.x };
    this.followers.filter((f) => !f.held).forEach((f, i) => {
      f.fig.group.visible = walking;
      if (!walking) { f.x = p.x; f.z = p.z; return; }
      // With the feather out and you standing still, they gather round it to play.
      const play = Boolean(w && still);
      const a = i * 2.1 + 0.6;
      const goal = play && w ? { x: w.x + Math.sin(a) * 0.75, z: w.z + Math.cos(a) * 0.75 }
        : this.trail[Math.max(0, this.trail.length - 1 - (i + 1) * 4)] ?? { x: p.x, z: p.z };
      const dx = goal.x - f.x, dz = goal.z - f.z, d = Math.hypot(dx, dz);
      const moving = d > 0.3;
      if (play && w && !moving) {
        f.heading = turn(f.heading, Math.atan2(w.x - f.x, w.z - f.z), dt * 9);
        this.poseCat(f.fig, false, f, t, true, 'play', false);
        f.fig.group.position.set(f.x, GROUND_Y - 0.36, f.z);
        f.fig.group.rotation.y = f.heading;
        return;
      }
      if (d > 14) { f.x = goal.x; f.z = goal.z; }
      else if (moving) {
        const k = Math.min(d, Math.max(3, d * 3) * dt);
        f.x += (dx / d) * k; f.z += (dz / d) * k;
        f.heading = turn(f.heading, Math.atan2(dx, dz), dt * 8);
      }
      this.poseCat(f.fig, moving, f, t, false, 'sit', play && moving);
      f.fig.group.position.set(f.x, GROUND_Y - 0.36, f.z);
      f.fig.group.rotation.y = f.heading;
    });
    // The one on your shoulder: curled up, eyes half shut, rumbling.
    const held = this.followers.find((f) => f.held);
    if (held) {
      held.fig.group.visible = walking;
      const body = p.obj.userData.body as THREE.Object3D | undefined;
      const bob = body ? body.position.y - 0.8 : 0;
      held.x = p.x; held.z = p.z;
      const top = this.topOf(p.obj) + bob - PERCH.sink;
      held.fig.group.position.set(p.x + pr.x * PERCH.side - pf.x * PERCH.back, top, p.z + pr.z * PERCH.side - pf.z * PERCH.back);
      held.fig.group.rotation.y = p.heading + Math.PI / 2;
      this.poseCat(held.fig, false, held, t, true, 'purr', false);
      const petted = t - this.pettedAt < 2.5;
      held.fig.rig.position.x = Math.sin(t * (petted ? 95 : 70)) * (petted ? 0.012 : 0.006);
      held.fig.head.rotation.y = -0.5;
      if (petted) held.fig.head.rotation.z = Math.sin(t * 3) * 0.25;
    }
  }

  private poseCat(f: PetFig, walking: boolean, c: { phase: number }, t: number, watching: boolean, rest: 'sit' | 'sleep' | 'eat' | 'play' | 'purr', dash: boolean) {
    f.rig.position.set(0, 0, 0);
    f.rig.rotation.x = 0;
    f.head.rotation.set(0, 0, 0);
    f.tail.rotation.z = Math.sin(t * 2.2 + c.phase) * 0.35;
    for (const e of f.eyes) e.scale.y = rest === 'purr' ? 0.3 : 1;
    if (walking) {
      c.phase += dash ? 0.5 : 0.25;
      const sw = Math.sin(c.phase) * (dash ? 0.9 : 0.65);
      f.legs.forEach((l, i) => { l.rotation.x = i === 0 || i === 3 ? sw : -sw; });
      f.rig.position.y = Math.abs(Math.sin(c.phase)) * (dash ? 0.08 : 0.03);
    } else if (rest === 'sleep') {
      // Curled up asleep, breathing slowly; it only looks up when you're close.
      f.rig.position.y = -0.14 + Math.sin(t * 1.5) * 0.008;
      f.legs.forEach((l, i) => { l.rotation.x = i < 2 ? -1.35 : 1.35; });
      f.head.rotation.x = watching ? 0 : 0.4;
    } else if (rest === 'purr') {
      // A loaf on your shoulder, paws tucked, tail swaying slow.
      f.rig.position.y = -0.16 + Math.sin(t * 1.4) * 0.01;
      f.legs.forEach((l, i) => { l.rotation.x = i < 2 ? -1.4 : 1.4; });
      f.tail.rotation.z = Math.sin(t * 0.9 + c.phase) * 0.5;
    } else if (rest === 'play') {
      // Up on the back legs, batting at the feather with both front paws.
      const hop = Math.abs(Math.sin(t * 5 + c.phase));
      f.rig.rotation.x = -0.55 - hop * 0.35;
      f.rig.position.y = hop * 0.22;
      f.legs[0].rotation.x = -1.3 + Math.sin(t * 13 + c.phase) * 0.7;
      f.legs[1].rotation.x = -1.3 + Math.cos(t * 13 + c.phase) * 0.7;
      f.legs[2].rotation.x = f.legs[3].rotation.x = 0.5;
      f.head.rotation.x = -0.35;
      f.tail.rotation.z = Math.sin(t * 9 + c.phase) * 0.6;
    } else if (rest === 'eat') {
      // Head down in the dish, tail up and happy.
      f.rig.rotation.x = 0.25;
      f.head.rotation.x = 0.5 + Math.sin(t * 9) * 0.08;
      f.tail.rotation.z = Math.sin(t * 5) * 0.2;
    } else {
      // Sitting, now and then lifting a paw to wash.
      f.rig.rotation.x = -0.32;
      f.rig.position.y = -0.04;
      f.legs[2].rotation.x = f.legs[3].rotation.x = 1.0;
      f.legs[0].rotation.x = watching ? 0.3 : 0.3 - Math.max(0, Math.sin(t * 1.3)) * 0.9;
      f.legs[1].rotation.x = 0.3;
    }
  }

  // ---------- Picking and labels ----------

  private ray = new THREE.Raycaster();
  tap(ndc: THREE.Vector2): FreewayPick | null {
    this.ray.setFromCamera(ndc, this.camera);
    const hit = this.ray.intersectObjects(this.pickables, false).find((h) => h.object.visible !== false && h.object.parent?.visible !== false);
    return (hit?.object.userData.pick as FreewayPick | undefined) ?? null;
  }
  hover(ndc: THREE.Vector2 | null) {
    const p = ndc ? this.tap(ndc) : null;
    const v = p?.kind === 'day' ? this.views.find((x) => x.day.date === p.date) ?? null : null;
    if (v !== this.hovered) {
      this.hovered?.label.removeAttribute('data-selected');
      v?.label.setAttribute('data-selected', '1');
      this.hovered = v;
    }
    return Boolean(p);
  }

  placeLabels(w: number, h: number) {
    const v3 = new THREE.Vector3();
    const place = (el: HTMLDivElement, pos: THREE.Vector3, maxD: number) => {
      const d = pos.distanceTo(this.camera.position);
      v3.copy(pos).project(this.camera);
      if (v3.z > 1 || d > maxD || Math.abs(v3.x) > 1.2 || Math.abs(v3.y) > 1.2) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.style.opacity = String(Math.min(1, (maxD - d) / 60));
      el.style.transform = `translate(-50%, -100%) translate(${((v3.x + 1) / 2) * w}px, ${((1 - v3.y) / 2) * h}px)`;
    };
    for (const v of this.views) {
      if (!v.group.visible) { v.label.style.display = 'none'; continue; }
      place(v.label, new THREE.Vector3(v.pos.x, v.pos.y + v.top + 4.5, v.pos.z), 260);
    }
    for (const l of this.portalLabels) place(l.el, l.pos, 220);
    if (this.rescue) place(this.rescue.label, new THREE.Vector3(this.rescue.pos.x, this.rescue.top + 3, this.rescue.pos.z), 320);
    for (const c of this.strays.values()) place(c.label, new THREE.Vector3(c.x, 1.6, c.z), c.s.hidden ? 12 : 40);
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    this.layer.remove();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const x of mats) x.dispose();
    });
    for (const t of this.textures) t.dispose();
  }
}

function turn(from: number, to: number, k: number) {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + d * Math.min(1, k);
}

function starGeometry() {
  const shape = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
    const r = k % 2 ? 0.45 : 1;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (k === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: false });
  g.center();
  return g;
}
