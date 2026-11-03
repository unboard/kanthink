import * as THREE from 'three';
import type { Billboard, FreewayDay } from '@/lib/kanwatch/freeway';
import { hash as signedHash } from '@/lib/kan/city/layout';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { crane, windowBox } from '../city/models';

/**
 * The Kanwatch Freeway: your days as a road through the country, oldest first.
 *
 * Each day is a building on the left, stacked in floors of what it went into (the
 * biggest at the bottom), as tall as the hours were long, with that day's hours
 * glowing in a strip across its front and its kind of work on the roof. Across the
 * road, billboards: each month's breakdown where the month begins, and between them
 * the things you kept coming back to. Weeks start under a green highway sign.
 *
 * Driving is on the road, never off it: forward is forward in time, the stick or the
 * arrow keys set your speed and your lane. The sky turns gold beside every building
 * and goes to dusk between them, so the road keeps a rhythm of days, and the trees
 * turn with the months. Pull up beside a day to go inside it.
 */

const hash = (s: string) => signedHash(s) >>> 0;
/** Road length per day. */
const SEG = 64;
/** Empty road before the first day and after the last. */
const LEAD = 2;
const ROAD_W = 6;
const SETBACK = 24;
const BOARD_SIDE = 19;

export type FreewayPick = { kind: 'day'; date: string } | { kind: 'billboard'; index: number } | { kind: 'exit' };
export interface FreewayCallbacks {
  onPick(p: FreewayPick): void;
  /** The day you've pulled up beside (slow, and level with it), or the way out. */
  onNear(n: { kind: 'day'; date: string } | { kind: 'exit' } | null): void;
  /** The day you're passing, for the timeline. */
  onDay(date: string, progress: number): void;
}

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
}

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
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.5, 2400);
  private curve: THREE.CatmullRomCurve3;
  private length = 0;
  private views: DayView[] = [];
  private pickables: THREE.Object3D[] = [];
  /** Everything beside the road, by where it stands, so only what's near is drawn. */
  private cullables: { s: number; objs: THREE.Object3D[] }[] = [];
  private ticks: ((t: number, dt: number) => void)[] = [];
  private layer: HTMLDivElement;
  private car: THREE.Group;
  private s = 0;
  private v = 0;
  private lane = 2.6;
  private time = 0;
  private near: string | null = null;
  private dayAt = '';
  private warp: { from: number; to: number; t: number } | null = null;
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

  constructor(
    private days: FreewayDay[],
    private billboards: Billboard[],
    labels: HTMLDivElement,
    private cb: FreewayCallbacks,
    makeCar: () => THREE.Group,
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
      const y = 2.6 * Math.sin(k * 0.41) + 1.8 * Math.sin(k * 0.17 + 2);
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

    // Falling leaves or snow, in a box that rides along with you.
    const n = 420;
    const fp = new Float32Array(n * 3);
    this.fallVel = new Float32Array(n);
    for (let i = 0; i < n; i++) { fp[i * 3] = (Math.random() - 0.5) * 90; fp[i * 3 + 1] = Math.random() * 30; fp[i * 3 + 2] = (Math.random() - 0.5) * 90; this.fallVel[i] = 0.6 + Math.random(); }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    this.fall = new THREE.Points(fg, new THREE.PointsMaterial({ color: '#e07b2e', size: 0.45, transparent: true, opacity: 0.9, depthWrite: false }));
    this.scene.add(this.fall);

    this.car = makeCar();
    this.scene.add(this.car);
    const from = start ? this.views.find((v) => v.day.date >= start) ?? this.views[this.views.length - 1] : this.views[Math.max(0, this.views.length - 7)];
    this.s = from ? from.s - SEG * 0.08 : this.exits[0] + 4;
    this.placeCar(0, true);
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
  /** 0 at the boundary between two days, 1 level with a day's building. */
  private beside(s: number) {
    const f = (s / this.length) * (this.days.length + LEAD * 2) - LEAD - 0.5;
    return 0.5 + 0.5 * Math.cos((f - Math.round(f)) * Math.PI * 2);
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
      } else if (!t.season.bare || i % 3 === 0) {
        if (t.season.bare) sc.setScalar(t.s * 0.55), m.compose(v, q, sc);
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
    // Lamps come on as the light goes.
    this.ticks.push(() => {
      const night = 1 - this.beside(this.s);
      headMat.color.setRGB(0.55 + night * 0.45, 0.5 + night * 0.39, 0.38 + night * 0.26);
    });
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
    const view: DayView = { day, s, group: g, proxy, label, windows, beacon, beam, star, top, pos };
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
      const mm = scr.material as THREE.MeshBasicMaterial;
      this.ticks.push((t) => { mm.color.setHSL(((t * 0.08 + seed * 0.001) % 1), 0.7, 0.6); });
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
    this.ticks.push((t) => { tip.visible = Math.sin(t * 3 + seed) > -0.2; });
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
    this.ticks.push((time) => { neon.color.setHSL(0.83 + Math.sin(time * 1.4) * 0.04, 0.9, 0.62 + Math.sin(time * 3) * 0.06); });
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
    this.ticks.push((time) => { disc.rotation.z = time * 0.8; ring.scale.setScalar(1 + Math.sin(time * 2) * 0.02); });
    const el = document.createElement('div');
    el.className = 'kc-label kc-townhall';
    el.textContent = label;
    el.addEventListener('click', () => this.cb.onPick({ kind: 'exit' }));
    this.layer.appendChild(el);
    this.portalLabels.push({ el, pos: new THREE.Vector3(p.x, p.y + ROAD_W * 2 + 1.5, p.z) });
  }
  private portalLabels: { el: HTMLDivElement; pos: THREE.Vector3 }[] = [];

  // ---------- Driving ----------

  /** Take the road to a day, quickly. */
  jumpTo(date: string) {
    const v = this.views.find((x) => x.day.date === date);
    if (!v) return;
    this.warp = { from: this.s, to: v.s - SEG * 0.08, t: 0 };
    this.v = 0;
  }

  private placeCar(dt: number, snap = false) {
    const { p, t, r } = this.frame(this.s);
    const pos = p.clone().add(r.clone().multiplyScalar(this.lane));
    pos.y += 0.06;
    this.car.position.copy(pos);
    // The car's nose is +x; turn it to face along the road.
    this.car.rotation.set(0, Math.atan2(t.x, t.z) - Math.PI / 2, 0);
    for (const w of (this.car.userData.wheels as THREE.Object3D[] | undefined) ?? []) w.rotation.y -= (this.v * dt) / 0.48;

    // Behind and above, looking down the road; as you slow beside a day, the camera
    // swings out to show its building.
    const slow = 1 - Math.min(1, Math.abs(this.v) / 14);
    const look = this.beside(this.s) * slow;
    const back = t.clone().multiplyScalar(-(13 + look * 2));
    const want = pos.clone().add(back).add(new THREE.Vector3(0, 5.6 + look * 2.4, 0)).add(r.clone().multiplyScalar(look * 7));
    const target = pos.clone().add(t.clone().multiplyScalar(10 - look * 5)).add(r.clone().multiplyScalar(-look * 9)).add(new THREE.Vector3(0, 1.4 + look * 3, 0));
    if (snap) { this.camera.position.copy(want); this.camTarget.copy(target); }
    else {
      const k = 1 - Math.exp(-dt * (this.warp ? 10 : 3.2));
      this.camera.position.lerp(want, k);
      this.camTarget.lerp(target, k);
    }
    this.camera.lookAt(this.camTarget);
  }
  private camTarget = new THREE.Vector3();

  step(dt: number, input: { steer: number; push: number; boost: boolean }) {
    if (this.disposed) return;
    this.time += dt;
    const t = this.time;
    if (this.warp) {
      const w = this.warp;
      w.t = Math.min(1, w.t + dt * 0.9);
      const e = w.t < 0.5 ? 4 * w.t ** 3 : 1 - Math.pow(-2 * w.t + 2, 3) / 2;
      this.s = w.from + (w.to - w.from) * e;
      this.camera.fov = 58 + Math.sin(w.t * Math.PI) * 22;
      this.camera.updateProjectionMatrix();
      if (w.t >= 1) { this.warp = null; this.camera.fov = 58; this.camera.updateProjectionMatrix(); }
    } else {
      const max = input.boost ? 62 : 34;
      if (input.push !== 0) {
        const braking = Math.sign(input.push) !== Math.sign(this.v) && Math.abs(this.v) > 0.5;
        this.v += input.push * (braking ? 40 : input.boost ? 30 : 16) * dt;
      } else {
        this.v *= Math.exp(-dt * 1.1);
        if (Math.abs(this.v) < 0.4) this.v = 0;
      }
      this.v = THREE.MathUtils.clamp(this.v, -16, max);
      this.s += this.v * dt;
      // Lanes: steer to change, settle back into the right-hand one.
      if (input.steer !== 0) this.lane = THREE.MathUtils.clamp(this.lane + input.steer * dt * 7, -ROAD_W + 1.6, ROAD_W - 1.6);
      else this.lane += (2.6 - this.lane) * Math.min(1, dt * 0.6);
    }
    const lo = this.exits[0] - SEG * 0.3, hi = this.exits[1] + SEG * 0.3;
    if (this.s < lo) { this.s = lo; this.v = 0; }
    if (this.s > hi) { this.s = hi; this.v = 0; }
    this.placeCar(dt);

    // Sky: gold beside a day, dusk between days; tinted by the month.
    const b = this.beside(this.s);
    const i = this.dayIndexAt(this.s);
    const season = seasonOf(dateParts(this.days[i]?.date ?? '2026-10-15').month);
    this.seasonAt = season;
    const cold = season.fall === 'snow' ? 0.35 : 0;
    const top = new THREE.Color('#1d1640').lerp(new THREE.Color('#5b7fd6'), b).lerp(new THREE.Color('#7a8fb8'), cold * b);
    const horizon = new THREE.Color('#9a5a9e').lerp(new THREE.Color('#ffc48a'), b).lerp(new THREE.Color('#dfe7f5'), cold * b);
    this.skyMat.uniforms.top.value.copy(top);
    this.skyMat.uniforms.horizon.value.copy(horizon);
    (this.scene.fog as THREE.Fog).color.copy(horizon).lerp(top, 0.25);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, 0.9 - b * 1.6);
    this.sun.intensity = 0.35 + b * 1.5;
    this.sun.color.set('#ffb070').lerp(new THREE.Color('#fff1d6'), b * 0.5);
    this.hemi.intensity = 0.45 + b * 0.6;
    const cam = this.camera.position;
    this.sky.position.copy(cam);
    this.stars.position.copy(cam);
    this.sun.position.copy(cam).add(new THREE.Vector3(-120, 90 + b * 60, -60));
    this.sun.target.position.copy(cam);
    for (const c of this.cullables) {
      const d = c.s - this.s;
      const show = d > -110 && d < 560;
      for (const o of c.objs) o.visible = show;
    }
    for (const v of this.views) {
      if (!v.group.visible) continue;
      for (const m of v.windows) m.emissiveIntensity = 0.35 + (1 - b) * 1.5;
      if (v.beam.visible) (v.beam.material as THREE.MeshBasicMaterial).opacity = 0.1 + (1 - b) * 0.18 + Math.sin(t * 2.4 + v.s) * 0.04;
      v.beacon.scale.setScalar(1 + Math.sin(t * 3 + v.s) * 0.15);
      if (v.star.visible) v.star.rotation.y = t * 1.2;
    }
    for (const f of this.ticks) f(t, dt);
    this.stepFall(dt);

    // Where you are: the day you're passing, and the one you've pulled up beside.
    const day = this.days[i];
    if (day && day.date !== this.dayAt) { this.dayAt = day.date; }
    this.cb.onDay(this.dayAt, this.s / this.length);
    let near: string | null = null;
    if (this.s < this.exits[0] || this.s > this.exits[1]) near = 'exit';
    else if (day && Math.abs(this.views[i].s - this.s) < SEG * 0.4 && Math.abs(this.v) < 12 && !this.warp) near = day.date;
    if (near !== this.near) {
      this.near = near;
      this.cb.onNear(near === 'exit' ? { kind: 'exit' } : near ? { kind: 'day', date: near } : null);
    }
  }

  private stepFall(dt: number) {
    const s = this.seasonAt;
    this.fall.visible = Boolean(s.fall);
    if (!s.fall) return;
    const mm = this.fall.material as THREE.PointsMaterial;
    mm.color.set(s.fallColors[Math.floor(this.time * 0.2) % s.fallColors.length]);
    mm.size = s.fall === 'snow' ? 0.32 : 0.5;
    const arr = (this.fall.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const c = this.car.position;
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

  get speed() { return this.v; }

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
