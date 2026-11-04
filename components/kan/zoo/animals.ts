import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { dyn, mat } from '../city/models';
import type { Look, Species } from '@/lib/kan/zoo/species';

/**
 * Every animal at the zoo, built from a few shapes: one builder per kind of body
 * (four legs, apes, monkeys, birds, penguins, seals, reptiles, snakes, fish, bats,
 * butterflies), each reading the species' look for its proportions and its extras
 * (a trunk, a mane, horns, a shell). In the style of the city's pets: flat-shaded,
 * round and friendly, with big eyes.
 *
 * A figure faces +z with its feet on y = 0, so the scene only places and turns it.
 * Bats are the exception: their origin is the branch they hang from, and they hang
 * below it unless they're flying. Fish sit with their belly on y = 0; put them at
 * whatever depth you like. Swimmers (pose 'swim') sink their own rig so that y = 0
 * is the water's surface.
 *
 * Geometry is shared (unit shapes, scaled per mesh); patterns are one canvas
 * texture per species, made once.
 */

export type AnimalState = 'stand' | 'walk' | 'run' | 'sleep' | 'eat' | 'swim' | 'fly' | 'climb' | 'sit';
export interface AnimalFig {
  group: THREE.Group;
  rig: THREE.Group;
  head: THREE.Group;
  height: number;
  pose(state: AnimalState, t: number, phase: number, speed: number): void;
}

// ---------- Shapes ----------

const GEO = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry) {
  let g = GEO.get(key);
  if (!g) { g = make(); GEO.set(key, g); }
  return g;
}
const SPH = () => geo('sph', () => new THREE.SphereGeometry(1, 12, 9));
/** Up from y = 0 to 1: radius 1 at the bottom, `top` at the top. */
const CYL = (top = 1) => geo(`cyl${top}`, () => new THREE.CylinderGeometry(top, 1, 1, 8).translate(0, 0.5, 0));
/** A cone standing on y = 0, its point at y = 1. */
const CONE = () => geo('cone', () => new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0));
const BOX = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1));
/** A ring around the z axis, radius 1. */
const TORUS = () => geo('torus', () => new THREE.TorusGeometry(1, 0.07, 5, 16));

function m(parent: THREE.Object3D, g: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const o = new THREE.Mesh(g, material);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  o.castShadow = true;
  parent.add(o);
  return o;
}
function grp(parent: THREE.Object3D, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
/** A leg (or arm) hanging down from where it's attached: radius r there, narrowing to the foot. */
function limb(parent: THREE.Object3D, material: THREE.Material, len: number, r: number, taper = 0.75) {
  const o = m(parent, CYL(taper), material, 0, 0, 0, r, len, r);
  o.rotation.x = Math.PI;
  return o;
}

/** A coat of quills, spread over the top of a unit sphere. */
const spinesGeo = () => geo('spines', () => {
  const parts: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), d = new THREE.Vector3();
  for (let i = 0; i < 5; i++) for (let j = 0; j < 7; j++) {
    const th = (j / 6 - 0.5) * Math.PI * 0.9, side = (i / 4 - 0.5) * Math.PI * 0.85;
    d.set(Math.sin(side) * Math.cos(th), Math.cos(side) * Math.cos(th), Math.sin(th)).normalize();
    const c = new THREE.ConeGeometry(0.07, 0.4, 4);
    c.applyQuaternion(q.setFromUnitVectors(up, d));
    c.translate(d.x * 1.05, d.y * 1.05, d.z * 1.05);
    parts.push(c);
  }
  return mergeGeometries(parts)!;
});
/** Three whiskers a side, as one shape. */
const whiskerGeo = () => geo('whiskers', () => {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) for (const k of [-1, 0, 1]) parts.push(new THREE.BoxGeometry(0.7, 0.025, 0.025).rotateZ(s * k * 0.18).translate(s * 0.55, k * 0.08, 0));
  return mergeGeometries(parts)!;
});

// ---------- Color ----------

const pale = (hex: string, k = 0.55) => '#' + new THREE.Color(hex).lerp(new THREE.Color('#fff8ee'), k).getHexString();
const shade = (hex: string, k: number) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
const DARK = () => mat('#1b1430');

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function strHash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const PATTERNED = new Map<string, THREE.Material>();
/**
 * The body (or tail) in its pattern: stripes, spots, patches or a pale belly drawn
 * once onto a small canvas and wrapped around the shape. Tails get rings.
 */
function patternMat(sp: Species, part: 'body' | 'tail'): THREE.Material {
  const L = sp.look, p = L.pattern;
  const plain = mat(L.color, { rough: 0.95 });
  if (!p) return plain;
  if (part === 'tail' && p !== 'rings' && p !== 'stripes') return plain;
  if (part === 'body' && p === 'rings') return plain;
  const key = `${sp.id}:${part}`;
  const hit = PATTERNED.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = L.color;
  x.fillRect(0, 0, 128, 64);
  const c2 = L.color2 ?? '#1d1d1f';
  const r = lcg(strHash(sp.id));
  x.fillStyle = c2;
  if (part === 'tail') {
    for (let i = 0; i < 9; i++) if (i % 2) x.fillRect(0, i * 7, 128, 7);
  } else if (p === 'stripes') {
    const depth = sp.id === 'tiger' || sp.id === 'meerkat' ? 38 : 56;
    for (let i = 0; i < 18; i++) {
      const cx = i * 7.1 + r() * 2, w = 2.2 + r() * 2.4, lean = (r() - 0.5) * 6;
      x.beginPath();
      x.moveTo(cx - w / 2, 0);
      x.lineTo(cx + w / 2, 0);
      x.lineTo(cx + lean + w * 0.15, depth);
      x.lineTo(cx + lean - w * 0.15, depth);
      x.fill();
    }
  } else if (p === 'spots') {
    for (let i = 0; i < 80; i++) {
      x.beginPath();
      x.ellipse(r() * 128, 4 + r() * 50, 1.6 + r() * 2.4, 1.3 + r() * 1.8, r() * 3, 0, Math.PI * 2);
      x.fill();
    }
  } else if (p === 'patches') {
    if ((L.neck ?? 0) > 2) {
      // A giraffe: brown patches with pale lines between.
      for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 9; gx++) {
        const px = gx * 14.2 + (gy % 2) * 7 + r() * 2, py = gy * 13 + r() * 2;
        x.beginPath();
        x.moveTo(px + 2, py + 1); x.lineTo(px + 12, py + 2 + r() * 2); x.lineTo(px + 13, py + 10); x.lineTo(px + 6, py + 12); x.lineTo(px + 1, py + 9);
        x.fill();
      }
    } else {
      for (let i = 0; i < 7; i++) {
        x.beginPath();
        x.ellipse(r() * 128, 6 + r() * 44, 7 + r() * 9, 5 + r() * 6, r() * 3, 0, Math.PI * 2);
        x.fill();
      }
    }
  } else if (p === 'belly') {
    x.globalAlpha = 0.5;
    x.fillRect(0, 36, 128, 4);
    x.globalAlpha = 1;
    x.fillRect(0, 40, 128, 24);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex, roughness: 0.95, flatShading: true });
  PATTERNED.set(key, material);
  return material;
}

let wingTex: THREE.MeshStandardMaterial | null = null;
function butterflyWing(color: string, edge: string) {
  if (wingTex) return wingTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = edge;
  x.fillRect(0, 0, 64, 64);
  const g = x.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, pale(color, 0.35));
  g.addColorStop(0.75, color);
  g.addColorStop(1, color);
  x.fillStyle = g;
  x.beginPath();
  x.arc(32, 32, 25, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#ffffff';
  for (let k = 0; k < 10; k++) { x.beginPath(); x.arc(32 + Math.cos(k * 0.63) * 28.5, 32 + Math.sin(k * 0.63) * 28.5, 1.6, 0, Math.PI * 2); x.fill(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  wingTex = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide, flatShading: true });
  return wingTex;
}

// ---------- Faces ----------

/** Big, friendly eyes: white, a dark (or colored) iris, a pupil if the iris is colored, and a glint. */
function addEyes(head: THREE.Object3D, r: number, x: number, y: number, z: number, iris = '#2a1a10', out = 0) {
  const eyes: THREE.Group[] = [];
  const colored = iris !== '#2a1a10' && iris !== '#1d1d1f';
  for (const s of [-1, 1]) {
    const e = grp(head, s * x, y, z);
    e.rotation.y = s * out;
    m(e, SPH(), mat('#ffffff', { rough: 0.3 }), 0, 0, 0, r, r, r * 0.8);
    m(e, SPH(), mat(iris, { rough: 0.3 }), 0, 0, r * 0.45, r * 0.7, r * 0.7, r * 0.5);
    if (colored) m(e, SPH(), DARK(), 0, 0, r * 0.62, r * 0.4, r * 0.4, r * 0.4);
    m(e, SPH(), mat('#ffffff', { emissive: '#ffffff', intensity: 0.6 }), s * r * 0.2, r * 0.28, r * 0.88, r * 0.22);
    eyes.push(e);
  }
  return eyes;
}
/** Now and then, a blink. */
function blink(eyes: THREE.Group[], t: number, ph: number) {
  if (Math.sin(t * 0.9 + ph * 7.3) > 0.985) for (const e of eyes) e.scale.y = 0.15;
}
function shut(eyes: THREE.Group[]) { for (const e of eyes) e.scale.y = 0.12; }

// ---------- Rest positions ----------

/** Every moving part's rest pose, put back before each frame's pose is applied. */
class Snap {
  private data: Float32Array;
  constructor(private objs: THREE.Object3D[]) {
    this.data = new Float32Array(objs.length * 9);
    objs.forEach((o, i) => {
      const k = i * 9;
      this.data[k] = o.position.x; this.data[k + 1] = o.position.y; this.data[k + 2] = o.position.z;
      this.data[k + 3] = o.rotation.x; this.data[k + 4] = o.rotation.y; this.data[k + 5] = o.rotation.z;
      this.data[k + 6] = o.scale.x; this.data[k + 7] = o.scale.y; this.data[k + 8] = o.scale.z;
    });
  }
  reset() {
    const d = this.data;
    for (let i = 0; i < this.objs.length; i++) {
      const o = this.objs[i], k = i * 9;
      o.position.set(d[k], d[k + 1], d[k + 2]);
      o.rotation.set(d[k + 3], d[k + 4], d[k + 5]);
      o.scale.set(d[k + 6], d[k + 7], d[k + 8]);
    }
  }
}

interface Ctx { sp: Species; L: Look; rig: THREE.Group; baby: boolean; seed: number }
interface Built {
  head: THREE.Group;
  /** The raw height `look.size` stands for; measured from the figure when left out. */
  unit?: number;
  /** Everything the pose moves, so it can be put back each frame. */
  moving: THREE.Object3D[];
  pose(state: AnimalState, t: number, ph: number, v: number): void;
}

/** The shape of a four-legged face, so a zebra doesn't wear a teddy bear's head. */
type Face = 'horse' | 'cat' | 'bear' | 'pig' | 'dog' | 'rhino' | 'elephant' | 'round';
const FACE: Record<string, Face> = {
  zebra: 'horse', okapi: 'horse', giraffe: 'horse', impala: 'horse', deer: 'horse', takin: 'horse', goat: 'horse',
  lion: 'cat', tiger: 'cat', cheetah: 'cat', snowleopard: 'cat', bobcat: 'cat',
  slothbear: 'bear',
  hog: 'pig', tapir: 'pig', aardvark: 'pig', pygmyhippo: 'pig', echidna: 'pig',
  batearedfox: 'dog', fossa: 'dog', meerkat: 'dog', redpanda: 'dog',
  rhino: 'rhino', indianrhino: 'rhino',
  elephant: 'elephant',
};
const FACE_SIZE: Record<Face, number> = { horse: 0.85, cat: 1, bear: 1, pig: 0.95, dog: 0.85, rhino: 1.15, elephant: 1.25, round: 1 };

const gaitOf = (size: number, v: number) => (3 + v * 2.2) / Math.sqrt(size + 0.3);

// ---------- Four legs ----------

function quad({ sp, L, rig, baby, seed }: Ctx): Built {
  const ex = new Set(L.extras ?? []);
  const long = L.long ?? 1.2, lf = L.legs ?? 1, nn = L.neck ?? 0.6;
  const stout = ex.has('trunk') || ex.has('horn') || ex.has('horn2') || sp.id === 'pygmyhippo' || sp.id === 'tapir' || sp.id === 'slothbear';
  const legLen = 0.5 * lf;
  const hy = 0.27 + (lf < 0.8 ? 0.06 : 0);
  const hx = hy * (stout ? 1.05 : 0.85);
  const hz = 0.36 * long;
  const cy = legLen + hy * 0.75;
  const fur = mat(L.color, { rough: 0.95 });
  const body = patternMat(sp, 'body');
  const coat = L.pattern === 'stripes' || L.pattern === 'spots' || L.pattern === 'patches' ? body : fur;

  const torso = m(rig, SPH(), body, 0, cy, 0, hx, hy, hz);
  if (ex.has('hump')) m(rig, SPH(), fur, 0, cy + hy * 0.8, hz * 0.3, hx * 0.6, hy * 0.5, hz * 0.4);
  if (ex.has('spines')) m(rig, spinesGeo(), mat(L.color2 ?? '#e8dcc4', { rough: 0.9 }), 0, cy, 0, hx, hy, hz);

  const legR = stout ? 0.11 : lf >= 1.3 ? 0.045 : 0.065;
  const hipY = cy - hy * 0.25;
  const legs: THREE.Group[] = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const hip = grp(rig, sx * hx * 0.55, hipY, sz * hz * 0.62);
    limb(hip, coat, hipY, legR, 0.8);
    legs.push(hip);
  }

  // The neck leans forward from the shoulders; the head rides on its end, level.
  const nl = 0.1 + nn * 0.3;
  const neckA = nn > 2 ? 0.28 : nn >= 1 ? 0.6 : 0.95;
  const nb = cy + hy * 0.35;
  const neck = grp(rig, 0, nb, hz * 0.78);
  neck.rotation.x = neckA;
  const nr = nn > 2 ? 0.09 : Math.min(hx * 0.6, 0.08 + hy * 0.2);
  if (nn > 0.25) m(neck, CYL(0.8), coat, 0, -0.05, 0, nr, nl + 0.05, nr * 1.1);
  if (ex.has('mane') && nn >= 1) m(neck, BOX(), mat(L.color2 ?? '#1d1d1f'), 0, nl * 0.5, -nr * 0.85, nr * 0.35, nl, nr * 0.7);
  const head = grp(neck, 0, nl, 0);
  head.rotation.x = -neckA;
  const face: Face = FACE[sp.id] ?? 'round';
  const hs = (0.17 + hy * 0.3) * (sp.id === 'giraffe' ? 0.42 : FACE_SIZE[face]);
  const tip = mat(shade(L.color, 0.55), { rough: 0.9 });
  const muzzle = mat(pale(L.color, face === 'bear' ? 0.75 : 0.4), { rough: 0.95 });
  // Long and rhino heads slope nose-down from a skull group; everything on the face rides on it.
  const skull = grp(head);
  skull.rotation.x = face === 'horse' ? 0.45 : face === 'rhino' ? 0.75 : 0;
  const trunk: THREE.Group[] = [];
  let eyes: THREE.Group[];
  // Where the ears sit, and whether they ride on the tilted skull.
  let earAt: [number, number, number] = [hs * 0.5, hs * 0.7, -hs * 0.05];

  switch (face) {
    case 'horse': {
      m(skull, SPH(), fur, 0, hs * 0.05, hs * 0.15, hs * 0.55, hs * 0.58, hs * 0.62);
      m(skull, CYL(0.72), fur, 0, -hs * 0.08, hs * 0.3, hs * 0.42, hs * 1.15, hs * 0.38).rotation.x = Math.PI / 2;
      m(skull, SPH(), sp.id === 'zebra' ? mat(L.color2 ?? '#1d1d1f') : tip, 0, -hs * 0.08, hs * 1.45, hs * 0.31, hs * 0.29, hs * 0.2);
      for (const s of [-1, 1]) m(skull, SPH(), DARK(), s * hs * 0.13, -hs * 0.02, hs * 1.6, hs * 0.05);
      eyes = addEyes(skull, hs * 0.17, hs * 0.44, hs * 0.2, hs * 0.38, '#2a1a10', 0.95);
      earAt = [hs * 0.36, hs * 0.48, -hs * 0.12];
      if (ex.has('horns') && !baby) for (const s of [-1, 1]) {
        if (sp.id === 'giraffe') {
          const o = grp(skull, s * hs * 0.2, hs * 0.5, -hs * 0.05);
          o.rotation.set(-0.5, 0, -s * 0.2);
          m(o, CYL(0.8), fur, 0, 0, 0, hs * 0.1, hs * 0.55, hs * 0.1);
          m(o, SPH(), mat('#2a1d14'), 0, hs * 0.58, 0, hs * 0.11);
        } else {
          const h = m(skull, CONE(), mat('#d8ccb4'), s * hs * 0.25, hs * 0.45, -hs * 0.05, hs * 0.09, hs * 0.5, hs * 0.09);
          h.rotation.set(-0.8, 0, -s * (sp.id === 'takin' ? 1.4 : 0.35));
        }
      }
      if (ex.has('spiral') && !baby && seed % 2 === 0) for (const s of [-1, 1]) {
        const h = m(skull, CONE(), mat('#3a2e26'), s * hs * 0.22, hs * 0.48, -hs * 0.1, hs * 0.07, hs * 1.6, hs * 0.07);
        h.rotation.set(-1.0, 0, -s * 0.2);
      }
      if (ex.has('antlers') && !baby && seed % 2 === 0) for (const s of [-1, 1]) {
        const am = mat('#c8a878');
        const a = grp(skull, s * hs * 0.25, hs * 0.5, -hs * 0.05);
        a.rotation.set(-0.75, 0, -s * 0.5);
        m(a, CYL(0.6), am, 0, 0, 0, hs * 0.06, hs * 1.2, hs * 0.06);
        m(a, CYL(0.5), am, 0, hs * 0.45, 0, hs * 0.04, hs * 0.55, hs * 0.04).rotation.x = 0.9;
        m(a, CYL(0.5), am, 0, hs * 0.85, 0, hs * 0.04, hs * 0.5, hs * 0.04).rotation.z = s * 0.8;
      }
      break;
    }
    case 'cat': {
      m(head, SPH(), fur, 0, 0, hs * 0.1, hs, hs * 0.88, hs * 0.92);
      for (const s of [-1, 1]) m(head, SPH(), muzzle, s * hs * 0.2, -hs * 0.32, hs * 0.85, hs * 0.3, hs * 0.24, hs * 0.22);
      m(head, SPH(), muzzle, 0, -hs * 0.5, hs * 0.75, hs * 0.22, hs * 0.14, hs * 0.18);
      m(head, SPH(), mat('#3a2420'), 0, -hs * 0.14, hs * 1.0, hs * 0.14, hs * 0.1, hs * 0.08);
      eyes = addEyes(head, hs * 0.2, hs * 0.38, hs * 0.15, hs * 0.85, '#c89a2a', 0.15);
      if (sp.id === 'cheetah') for (const s of [-1, 1]) m(head, BOX(), mat('#1d1d1f'), s * hs * 0.3, -hs * 0.15, hs * 0.92, hs * 0.05, hs * 0.38, hs * 0.04).rotation.z = s * 0.25;
      if (ex.has('mane') && !(sp.id === 'lion' && (seed % 2 === 1 || baby))) {
        m(head, SPH(), mat(L.color2 ?? shade(L.color, 0.6), { rough: 1 }), 0, hs * 0.0, -hs * 0.15, hs * 1.55, hs * 1.5, hs * 0.9);
      }
      m(head, whiskerGeo(), mat('#f4f4f2'), 0, -hs * 0.3, hs * 1.0, hs * 0.9);
      earAt = [hs * 0.55, hs * 0.65, -hs * 0.05];
      break;
    }
    case 'bear':
      m(head, SPH(), fur, 0, 0, hs * 0.1, hs, hs * 0.9, hs * 0.95);
      m(head, SPH(), muzzle, 0, -hs * 0.25, hs * 1.05, hs * 0.42, hs * 0.38, hs * 0.75);
      m(head, SPH(), DARK(), 0, -hs * 0.16, hs * 1.78, hs * 0.2, hs * 0.15, hs * 0.1);
      eyes = addEyes(head, hs * 0.17, hs * 0.38, hs * 0.25, hs * 0.85);
      earAt = [hs * 0.62, hs * 0.62, -hs * 0.05];
      break;
    case 'pig': {
      m(head, SPH(), fur, 0, 0, hs * 0.15, hs * 0.85, hs * 0.8, hs * 0.95);
      const disc = mat('#c88a8a', { rough: 0.9 });
      if (sp.id === 'pygmyhippo') {
        m(head, SPH(), fur, 0, -hs * 0.2, hs * 0.95, hs * 0.75, hs * 0.55, hs * 0.6);
        for (const s of [-1, 1]) m(head, SPH(), DARK(), s * hs * 0.25, hs * 0.22, hs * 1.3, hs * 0.08, hs * 0.05, hs * 0.08);
      } else {
        // A snout pointing forward (a short drooping trunk on a tapir, long and thin on an aardvark), a disc on the end.
        const sn = grp(head, 0, -hs * 0.15, hs * 0.8);
        const [len, r, droop] = sp.id === 'tapir' ? [0.95, 0.24, 0.5] : sp.id === 'aardvark' ? [1.6, 0.16, 0.3] : sp.id === 'echidna' ? [1.4, 0.09, 0.35] : [0.75, 0.32, 0.05];
        sn.rotation.x = Math.PI / 2 + droop;
        m(sn, CYL(0.8), fur, 0, 0, 0, hs * r, hs * len, hs * r);
        m(sn, SPH(), sp.id === 'echidna' ? DARK() : disc, 0, hs * len, 0, hs * r * 0.85, hs * 0.05, hs * r * 0.85);
      }
      eyes = addEyes(head, hs * 0.18, hs * 0.42, hs * 0.25, hs * 0.85);
      earAt = [hs * 0.5, hs * 0.65, -hs * 0.05];
      break;
    }
    case 'dog': {
      m(head, SPH(), fur, 0, 0, hs * 0.1, hs * 0.85, hs * 0.8, hs * 0.85);
      m(head, CONE(), muzzle, 0, -hs * 0.2, hs * 0.55, hs * 0.38, hs * 0.95, hs * 0.32).rotation.x = Math.PI / 2;
      m(head, SPH(), DARK(), 0, -hs * 0.2, hs * 1.5, hs * 0.11, hs * 0.09, hs * 0.08);
      if (sp.id === 'redpanda') for (const s of [-1, 1]) m(head, SPH(), mat('#f5efe6'), s * hs * 0.35, -hs * 0.1, hs * 0.7, hs * 0.22, hs * 0.18, hs * 0.12);
      else if (ex.has('mask')) for (const s of [-1, 1]) m(head, SPH(), mat(L.color2 ?? '#1d1d1f'), s * hs * 0.32, hs * 0.18, hs * 0.72, hs * 0.2, hs * 0.16, hs * 0.1);
      eyes = addEyes(head, hs * 0.17, hs * 0.32, hs * 0.18, hs * 0.78);
      earAt = [hs * 0.45, hs * 0.6, -hs * 0.1];
      break;
    }
    case 'rhino': {
      m(skull, SPH(), fur, 0, 0, hs * 0.6, hs * 0.62, hs * 0.62, hs * 1.25);
      m(skull, SPH(), fur, 0, -hs * 0.05, hs * 1.7, hs * 0.5, hs * 0.48, hs * 0.5);
      const hornM = mat('#e2d6be', { rough: 0.7 });
      {
        const big = sp.id === 'rhino' ? 1.25 : 0.75;
        m(skull, CONE(), hornM, 0, hs * 0.35, hs * 1.75, hs * 0.24, hs * big * (baby ? 0.3 : 1), hs * 0.24).rotation.x = 0.3;
        if (ex.has('horn2') && !baby) m(skull, CONE(), hornM, 0, hs * 0.5, hs * 1.15, hs * 0.17, hs * 0.5, hs * 0.17).rotation.x = 0.15;
      }
      eyes = addEyes(skull, hs * 0.12, hs * 0.5, hs * 0.15, hs * 1.0, '#2a1a10', 0.9);
      earAt = [hs * 0.38, hs * 0.5, -hs * 0.25];
      break;
    }
    case 'elephant': {
      m(head, SPH(), fur, 0, 0, hs * 0.15, hs, hs * 1.0, hs * 0.85);
      m(head, SPH(), fur, 0, hs * 0.55, hs * 0.05, hs * 0.75, hs * 0.5, hs * 0.65);
      // The trunk hangs almost to the ground, curling out a little at the tip.
      const headY = nb + nl * Math.cos(neckA);
      const seg = Math.max(hs * 0.4, (headY - hs * 0.2) / 3.9);
      const bend = [-0.15, 0.05, 0.08, -0.4];
      let at: THREE.Object3D = head;
      for (let k = 0; k < 4; k++) {
        const g = grp(at, 0, k === 0 ? -hs * 0.2 : -seg, k === 0 ? hs * 0.95 : 0);
        g.rotation.x = bend[k];
        limb(g, fur, seg, hs * (0.3 - k * 0.05), 0.85);
        at = g;
        trunk.push(g);
      }
      if (!baby) for (const s of [-1, 1]) {
        const tk = m(head, CONE(), mat('#f4ecd8'), s * hs * 0.35, -hs * 0.45, hs * 0.75, hs * 0.09, hs * 0.85, hs * 0.09);
        tk.rotation.x = Math.PI / 2 + 0.3;
      }
      eyes = addEyes(head, hs * 0.13, hs * 0.55, hs * 0.1, hs * 0.75, '#2a1a10', 0.4);
      break;
    }
    default:
      m(head, SPH(), fur, 0, 0, hs * 0.2, hs, hs * 0.9, hs * 1.05);
      m(head, SPH(), muzzle, 0, -hs * 0.3, hs * 0.95, hs * 0.52, hs * 0.42, hs * 0.5);
      m(head, SPH(), DARK(), 0, -hs * 0.18, hs * 1.42, hs * 0.16, hs * 0.11, hs * 0.1);
      if (ex.has('whiskers')) m(head, whiskerGeo(), mat('#f4f4f2'), 0, -hs * 0.3, hs * 1.25, hs);
      eyes = addEyes(head, hs * 0.2, hs * 0.45, hs * 0.22, hs * 1.02);
  }
  // The Indian rhino's armor: folds around its middle.
  if (sp.id === 'indianrhino') for (const z of [0.3, -0.35]) m(rig, TORUS(), mat(shade(L.color, 0.78)), 0, cy, z * hz, hx * 1.02, hy * 1.02, 1);

  // Ears.
  const ears: THREE.Group[] = [];
  const inner = mat('#f2b8b0', { rough: 1 });
  const earParent = face === 'horse' || face === 'rhino' ? skull : head;
  for (const s of [-1, 1]) {
    const e = grp(earParent, s * earAt[0], earAt[1], earAt[2]);
    e.rotation.x = -skull.rotation.x * (earParent === skull ? 1 : 0);
    switch (face === 'rhino' ? 'pointy' : L.ears ?? 'round') {
      case 'round':
        m(e, SPH(), fur, 0, hs * 0.08, 0, hs * 0.26, hs * 0.26, hs * 0.1);
        break;
      case 'pointy':
        m(e, CONE(), fur, 0, 0, 0, hs * 0.17, hs * 0.45, hs * 0.08);
        e.rotation.z = -s * (face === 'horse' ? 0.6 : 0.35);
        break;
      case 'big':
        m(e, CONE(), fur, 0, 0, 0, hs * 0.3, hs * 1.0, hs * 0.08);
        m(e, CONE(), inner, 0, hs * 0.05, hs * 0.04, hs * 0.18, hs * 0.75, hs * 0.04);
        e.rotation.z = -s * (face === 'horse' ? 0.75 : 0.45);
        break;
      case 'tiny':
        m(e, SPH(), fur, 0, 0, 0, hs * 0.12);
        break;
      case 'flap':
        if (face === 'elephant') {
          e.position.set(s * hs * 0.85, hs * 0.1, -hs * 0.15);
          m(e, SPH(), mat(shade(L.color, 0.92), { rough: 0.95 }), s * hs * 0.15, -hs * 0.1, -hs * 0.2, hs * 0.12, hs * 1.05, hs * 0.9);
        } else {
          e.position.set(s * hs * 0.45, hs * 0.3, -hs * 0.05);
          e.rotation.z = s * 0.7;
          m(e, SPH(), fur, 0, -hs * 0.25, 0, hs * 0.12, hs * 0.38, hs * 0.2);
        }
        break;
    }
    ears.push(e);
  }

  // Tail.
  const tail = grp(rig, 0, cy + hy * 0.35, -hz * 0.95);
  const tm = patternMat(sp, 'tail');
  switch (L.tail ?? 'thin') {
    case 'thin':
      tail.rotation.x = -2.5;
      m(tail, CYL(0.6), tm, 0, 0, 0, 0.025, hz * 0.8, 0.025);
      break;
    case 'tuft':
      tail.rotation.x = -2.6;
      m(tail, CYL(0.6), tm, 0, 0, 0, 0.025, hz * 0.7, 0.025);
      m(tail, SPH(), mat(L.color2 ?? shade(L.color, 0.5)), 0, hz * 0.7, 0, 0.05, 0.09, 0.05);
      break;
    case 'long':
      tail.rotation.x = -2.2;
      m(tail, CYL(0.7), tm, 0, 0, 0, 0.035, hz * 1.4, 0.035);
      break;
    case 'bushy':
      tail.rotation.x = -1.9;
      m(tail, SPH(), tm, 0, hz * 0.6, 0, 0.1 + hy * 0.15, hz * 0.65, 0.1 + hy * 0.15);
      break;
    default:
      m(tail, SPH(), fur, 0, 0, 0, 0.06);
  }

  // How far the neck must bend to reach the ground (giraffes eat high).
  const reach = (drop: number) => Math.min(2.3, Math.acos(THREE.MathUtils.clamp((hs * 0.9 - (nb - drop)) / nl, -1, 1)));
  const eatA = nn > 2 ? 0.08 : Math.max(neckA, reach(0));
  const shortNeck = reach(0) >= 2.29;
  const sleepDrop = legLen * 0.85;
  const sleepA = nn > 2 ? 1.1 : Math.max(neckA, reach(sleepDrop));
  const elephant = trunk.length > 0;

  return {
    head,
    unit: cy + hy,
    moving: [rig, torso, neck, head, tail, ...legs, ...ears, ...eyes, ...trunk],
    pose(st, t, ph, v) {
      torso.scale.y = hy * (1 + Math.sin(t * 2 + ph) * 0.015);
      blink(eyes, t, ph);
      switch (st) {
        case 'walk': case 'run': case 'fly': {
          const run = st === 'run';
          const w = gaitOf(L.size, v) * (run ? 1.25 : 1);
          const s1 = Math.sin(w * t + ph), s2 = Math.sin(w * t + ph + (run ? 1.9 : Math.PI));
          const amp = run ? 0.75 : 0.45;
          legs[0].rotation.x = s1 * amp; legs[3].rotation.x = run ? s2 * amp : s1 * amp;
          legs[1].rotation.x = run ? s1 * amp * 0.9 : -s1 * amp; legs[2].rotation.x = run ? s2 * amp * 0.9 : -s1 * amp;
          rig.position.y = Math.abs(s1) * hy * (run ? 0.18 : 0.06);
          neck.rotation.x += Math.sin(w * t * 2 + ph) * 0.04;
          tail.rotation.z = Math.sin(w * t) * 0.2;
          for (let k = 0; k < trunk.length; k++) trunk[k].rotation.z = Math.sin(w * t * 0.5 + k) * 0.15;
          break;
        }
        case 'eat':
          neck.rotation.x = eatA + Math.sin(t * 5 + ph) * 0.05;
          head.rotation.x = nn > 2 ? -0.5 + Math.sin(t * 5) * 0.05 : -eatA + 0.6;
          if (shortNeck && !elephant) { rig.rotation.x = 0.12; head.rotation.x += 0.4; }
          for (let k = 0; k < trunk.length; k++) trunk[k].rotation.x = -0.65 + Math.sin(t * 2.5 + ph) * 0.12;
          tail.rotation.z = Math.sin(t * 1.6 + ph) * 0.35;
          break;
        case 'sleep':
          rig.position.y = -sleepDrop;
          legs[0].rotation.x = legs[1].rotation.x = -1.45;
          legs[2].rotation.x = legs[3].rotation.x = 1.45;
          neck.rotation.x = sleepA;
          head.rotation.x = -sleepA + 0.4;
          torso.scale.y = hy * (1 + Math.sin(t * 1.1 + ph) * 0.03);
          for (const k of trunk) k.rotation.x = 0.25;
          shut(eyes);
          break;
        case 'sit':
          rig.rotation.x = -0.45;
          rig.position.y = -legLen * 0.45;
          legs[0].rotation.x = legs[1].rotation.x = 0.45;
          legs[2].rotation.x = legs[3].rotation.x = -1.0;
          neck.rotation.x = neckA + 0.45;
          tail.rotation.x += 0.6;
          head.rotation.y = Math.sin(t * 0.37 + ph) * 0.4;
          break;
        case 'swim':
          rig.position.y = -(cy + hy * 0.3);
          for (let i = 0; i < 4; i++) legs[i].rotation.x = Math.sin(t * 6 + ph + i * 1.57) * 0.6;
          neck.rotation.x = Math.max(0.2, neckA - 0.35);
          tail.rotation.x = -1.6;
          break;
        case 'climb':
          rig.rotation.x = -0.8;
          rig.position.y = hz * 0.35;
          legs[0].rotation.x = -1.0 + Math.sin(t * 4 + ph) * 0.35;
          legs[1].rotation.x = -1.0 - Math.sin(t * 4 + ph) * 0.35;
          legs[2].rotation.x = legs[3].rotation.x = 0.6;
          neck.rotation.x = neckA + 0.5;
          break;
        default: {
          head.rotation.y = Math.sin(t * 0.37 + ph) * 0.45;
          head.rotation.x += Math.sin(t * 0.23 + ph * 2) * 0.08;
          const flick = Math.sin(t * 2.7 + ph * 5) > 0.96 ? 0.35 : 0;
          if (elephant) { ears[0].rotation.y = -Math.sin(t * 1.3 + ph) * 0.3; ears[1].rotation.y = Math.sin(t * 1.3 + ph) * 0.3; }
          else { ears[0].rotation.x -= flick; ears[1].rotation.x -= flick * 0.5; }
          tail.rotation.z = Math.sin(t * 1.6 + ph) * 0.35;
          for (let k = 0; k < trunk.length; k++) {
            trunk[k].rotation.x += Math.sin(t * 0.9 + ph + k * 0.7) * 0.1;
            trunk[k].rotation.z = Math.sin(t * 0.7 + ph + k * 0.5) * 0.12;
          }
          if (nn > 2) neck.rotation.z = Math.sin(t * 0.45 + ph) * 0.07;
        }
      }
    },
  };
}

// ---------- Apes (and the sloth) ----------

function ape({ sp, L, rig, seed, baby }: Ctx): Built {
  const fur = mat(L.color, { rough: 1 });
  const face = mat(L.color2 && sp.id !== 'gorilla' ? L.color2 : sp.id === 'gorilla' ? '#3a3638' : pale(L.color, 0.5), { rough: 0.9 });
  const slow = sp.id === 'sloth';
  const torso = m(rig, SPH(), fur, 0, 0.78, 0.02, 0.33, 0.42, 0.28);
  torso.rotation.x = slow ? 0.2 : 0.55;
  if (sp.id === 'gorilla' && seed % 2 === 0 && !baby) m(rig, SPH(), mat(L.color2 ?? '#5a5658', { rough: 1 }), 0, 0.9, -0.12, 0.27, 0.2, 0.2);
  const armLen = 1.02 * (sp.id === 'siamang' ? 1.3 : sp.id === 'orangutan' ? 1.15 : 1);
  const armR = sp.id === 'gorilla' ? 0.12 : 0.09;
  const armA = -Math.acos(Math.min(1, 1.02 / armLen));
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const arm = grp(rig, s * 0.33, 1.02, 0.18);
    arm.rotation.x = armA;
    limb(arm, fur, armLen, armR, 0.8);
    m(arm, SPH(), face, 0, -armLen, 0, armR * 0.9);
    legs.push(arm);
  }
  for (const s of [-1, 1]) {
    const hip = grp(rig, s * 0.17, 0.48, -0.12);
    limb(hip, fur, 0.48, 0.1, 0.8);
    legs.push(hip);
  }
  const head = grp(rig, 0, 1.12, 0.3);
  m(head, SPH(), fur, 0, 0, 0, 0.22, 0.22, 0.2);
  if (sp.id === 'gorilla') m(head, SPH(), fur, 0, 0.14, -0.04, 0.14);
  m(head, SPH(), face, 0, -0.02, 0.12, 0.16, 0.16, 0.1);
  m(head, SPH(), face, 0, -0.1, 0.17, 0.12, 0.08, 0.08);
  m(head, BOX(), sp.id === 'sloth' ? mat('#3a2a20') : fur, 0, 0.07, 0.17, sp.id === 'sloth' ? 0.28 : 0.24, 0.04, 0.06);
  m(head, SPH(), DARK(), 0, -0.07, 0.25, 0.04, 0.02, 0.02);
  for (const s of [-1, 1]) m(head, SPH(), face, s * 0.21, 0, 0, 0.05);
  const eyes = addEyes(head, 0.05, 0.07, 0.03, 0.19);
  const ph0 = seed % 7;

  return {
    head,
    moving: [rig, torso, head, ...legs, ...eyes],
    pose(st, t, ph, v) {
      torso.scale.y = 0.42 * (1 + Math.sin(t * 1.8 + ph) * 0.015);
      blink(eyes, t, ph);
      const tt = slow ? t * 0.3 : t;
      switch (st) {
        case 'walk': case 'run': case 'fly': case 'swim': {
          const w = gaitOf(L.size, v) * (slow ? 0.3 : 1);
          const s1 = Math.sin(w * t + ph);
          legs[0].rotation.x = armA + s1 * 0.45; legs[3].rotation.x = s1 * 0.45;
          legs[1].rotation.x = armA - s1 * 0.45; legs[2].rotation.x = -s1 * 0.45;
          rig.position.y = Math.abs(s1) * 0.04;
          break;
        }
        case 'sit': case 'eat':
          rig.position.y = -0.38;
          rig.rotation.x = -0.45;
          legs[2].rotation.x = legs[3].rotation.x = -1.3;
          legs[0].rotation.x = legs[1].rotation.x = -0.2;
          head.rotation.x = 0.35;
          if (st === 'eat') legs[0].rotation.x = -2.3 + Math.sin(tt * 4 + ph) * 0.2;
          else head.rotation.y = Math.sin(tt * 0.4 + ph) * 0.5;
          break;
        case 'climb':
          rig.rotation.x = -0.6;
          legs[0].rotation.x = -2.8 + Math.sin(tt * 3 + ph) * 0.3;
          legs[1].rotation.x = -2.8 - Math.sin(tt * 3 + ph) * 0.3;
          legs[2].rotation.x = -0.5 + Math.sin(tt * 3 + ph) * 0.3;
          legs[3].rotation.x = -0.5 - Math.sin(tt * 3 + ph) * 0.3;
          break;
        case 'sleep':
          rig.rotation.z = 1.45;
          rig.position.y = 0.28;
          legs[0].rotation.x = legs[1].rotation.x = -0.9;
          legs[2].rotation.x = legs[3].rotation.x = -0.8;
          torso.scale.y = 0.42 * (1 + Math.sin(t * 1.1 + ph) * 0.03);
          shut(eyes);
          break;
        default: {
          head.rotation.y = Math.sin(tt * 0.33 + ph) * 0.5;
          // Now and then a gorilla stands up and drums on its chest.
          if (sp.id === 'gorilla' && (t + ph * 13 + ph0) % 16 < 1.3) {
            rig.rotation.x = -0.45;
            const beat = Math.sin(t * 22) > 0 ? 0.25 : -0.25;
            legs[0].rotation.x = -1.5 + beat;
            legs[1].rotation.x = -1.5 - beat;
          }
        }
      }
    },
  };
}

// ---------- Monkeys and lemurs ----------

function monkey({ sp, L, rig }: Ctx): Built {
  const ex = new Set(L.extras ?? []);
  const long = L.long ?? 1;
  const fur = mat(L.color, { rough: 0.95 });
  const body = patternMat(sp, 'body');
  const face = mat(sp.id === 'colobus' || sp.id === 'squirrelmonkey' ? L.color2 ?? '#f2ece2' : pale(L.color, 0.35), { rough: 0.9 });
  const torso = m(rig, SPH(), body, 0, 0.5, 0, 0.17, 0.17, 0.27 * long);
  const legs: THREE.Group[] = [];
  for (const [s, z, len] of [[-1, 0.18, 0.46], [1, 0.18, 0.46], [-1, -0.17, 0.5], [1, -0.17, 0.5]]) {
    const hip = grp(rig, s * 0.1, len, z * long);
    limb(hip, fur, len, 0.045, 0.8);
    legs.push(hip);
  }
  const head = grp(rig, 0, 0.7, 0.3 * long);
  m(head, SPH(), fur, 0, 0, 0, 0.16);
  m(head, SPH(), face, 0, -0.01, 0.09, 0.12, 0.12, 0.08);
  const snouty = sp.id === 'lemur' || sp.id === 'ruffedlemur' || sp.id === 'ayeaye';
  if (snouty) m(head, SPH(), face, 0, -0.04, 0.16, 0.07, 0.06, 0.11);
  m(head, SPH(), DARK(), 0, -0.03, snouty ? 0.26 : 0.17, 0.025, 0.02, 0.02);
  if (ex.has('mask')) m(head, SPH(), mat(L.color2 ?? '#1d1d1f'), 0, 0.03, 0.11, 0.13, 0.06, 0.07);
  const iris = sp.id === 'lemur' || sp.id === 'ruffedlemur' ? '#e8901c' : sp.id === 'ayeaye' ? '#e8b030' : '#2a1a10';
  const eyes = addEyes(head, sp.id === 'ayeaye' ? 0.06 : 0.048, 0.065, 0.03, 0.15, iris);
  for (const s of [-1, 1]) {
    if (L.ears === 'big') m(head, SPH(), fur, s * 0.14, 0.12, -0.02, 0.03, 0.12, 0.1).rotation.z = -s * 0.4;
    else if (L.ears === 'pointy') m(head, CONE(), fur, s * 0.1, 0.1, -0.03, 0.05, 0.1, 0.03).rotation.z = -s * 0.4;
    else m(head, SPH(), fur, s * 0.15, 0.03, -0.02, 0.04);
  }
  // A tail in three pieces: held up in a curl (ring-tails), else hanging.
  const curl = L.pattern === 'rings';
  const tm = patternMat(sp, 'tail');
  const tr = L.tail === 'bushy' ? 0.07 : 0.04;
  const tail: THREE.Group[] = [];
  let at: THREE.Object3D = rig;
  const base = curl ? [-0.7, 0.55, 0.65] : [-2.3, 0.35, 0.35];
  for (let k = 0; k < 3; k++) {
    const g = grp(at, 0, k === 0 ? 0.55 : 0.28, k === 0 ? -0.27 * long : 0);
    g.rotation.x = base[k];
    m(g, CYL(0.85), tm, 0, 0, 0, tr * (1 - k * 0.15), 0.29, tr * (1 - k * 0.15));
    at = g;
    tail.push(g);
  }

  return {
    head,
    unit: 0.67,
    moving: [rig, torso, head, ...legs, ...eyes, ...tail],
    pose(st, t, ph, v) {
      torso.scale.y = 0.17 * (1 + Math.sin(t * 2.4 + ph) * 0.02);
      blink(eyes, t, ph);
      for (let k = 0; k < 3; k++) tail[k].rotation.z = Math.sin(t * 1.4 + ph + k * 0.8) * 0.15;
      switch (st) {
        case 'walk': case 'run': case 'fly': case 'swim': {
          const w = gaitOf(L.size, v) * (st === 'run' ? 1.3 : 1);
          const s1 = Math.sin(w * t + ph), s2 = Math.sin(w * t + ph + Math.PI);
          legs[0].rotation.x = legs[1].rotation.x = s1 * 0.6;
          legs[2].rotation.x = legs[3].rotation.x = s2 * 0.6;
          rig.position.y = Math.abs(s1) * 0.05;
          break;
        }
        case 'sit': case 'eat':
          rig.rotation.x = -1.1;
          rig.position.set(0, -0.22, -0.1);
          legs[0].rotation.x = legs[1].rotation.x = 1.1;
          legs[2].rotation.x = legs[3].rotation.x = -0.4;
          head.rotation.x = 1.0;
          tail[0].rotation.x += 0.9;
          if (st === 'eat') legs[0].rotation.x = -0.6 + Math.sin(t * 5 + ph) * 0.2;
          else head.rotation.y = Math.sin(t * 0.5 + ph) * 0.5;
          break;
        case 'climb':
          rig.rotation.x = -1.35;
          rig.position.y = 0.3;
          legs[0].rotation.x = Math.sin(t * 5 + ph) * 0.4;
          legs[1].rotation.x = -Math.sin(t * 5 + ph) * 0.4;
          head.rotation.x = 1.0;
          break;
        case 'sleep':
          rig.position.y = -0.38;
          legs[0].rotation.x = legs[1].rotation.x = -1.4;
          legs[2].rotation.x = legs[3].rotation.x = 1.4;
          head.rotation.x = 0.6;
          tail[0].rotation.x = -1.7;
          shut(eyes);
          break;
        default:
          head.rotation.y = Math.sin(t * 0.5 + ph) * 0.6;
      }
    },
  };
}

// ---------- Birds ----------

const BEAK: Record<string, string> = {
  flamingo: '#f2e6e0', ostrich: '#e8c0a8', swan: '#d83a2a', macaw: '#f2ece2', budgie: '#e8d8a0', crane: '#c8b070',
  crownedcrane: '#2a2a2a', owl: '#d8c890', roadrunner: '#2a2a2a', ibis: '#e85a3a', spoonbill: '#c8b8a0',
};
const LEGS: Record<string, string> = { flamingo: '#f08aa0', ostrich: '#e89aa6', crane: '#3a3a3a', crownedcrane: '#3a3a3a', swan: '#2a2a2a', ibis: '#e85a3a', spoonbill: '#c87a8a' };

function bird({ sp, L, rig }: Ctx): Built {
  const ex = new Set(L.extras ?? []);
  const id = sp.id;
  const owl = id === 'owl', perch = id === 'macaw' || id === 'budgie';
  const legH = 0.32 * (L.legs ?? 1);
  const by = legH + 0.14;
  const fur = mat(L.color, { rough: 0.9 });
  const ostrich = id === 'ostrich';
  const torso = m(rig, SPH(), patternMat(sp, 'body'), 0, by, 0, owl ? 0.19 : ostrich ? 0.24 : 0.17, owl ? 0.24 : ostrich ? 0.2 : 0.16, owl ? 0.18 : ostrich ? 0.3 : 0.27);
  if (perch) torso.rotation.x = -0.7;
  // An ostrich is a big fluffy black puff of feathers.
  if (ostrich) for (const [x, y, z, r] of [[0.12, 0.08, -0.08, 0.15], [-0.12, 0.08, -0.08, 0.15], [0, 0.12, 0.08, 0.16], [0, -0.04, -0.16, 0.14]]) m(rig, SPH(), fur, x, by + y, z, r, r * 0.9, r);

  const legMat = mat(LEGS[id] ?? '#e0a050');
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const hip = grp(rig, s * 0.07, legH + 0.04, 0.02);
    limb(hip, legMat, legH + 0.04, id === 'ostrich' ? 0.05 : 0.022, 0.7);
    m(hip, SPH(), legMat, 0, -legH - 0.02, 0.04, 0.035, 0.015, 0.06);
    legs.push(hip);
  }

  // The neck in two pieces, so it can curve like an S.
  const nl = owl ? 0 : (ostrich ? 0.25 : 0.17) * (L.neck ?? 1);
  const n0 = grp(rig, 0, by + 0.08, perch ? 0.12 : owl ? 0.02 : 0.2);
  const [a0, a1] = id === 'swan' ? [0.25, -0.6] : id === 'flamingo' ? [0.5, -0.9] : id === 'ostrich' ? [0.15, -0.15] : owl ? [0, 0] : [0.35, -0.35];
  n0.rotation.x = a0;
  const n1 = grp(n0, 0, nl / 2, 0);
  n1.rotation.x = a1;
  const neckMat = id === 'crane' ? mat(L.color2 ?? '#f2f2f2') : ostrich ? mat('#d4aeb0') : fur;
  if (nl > 0.05) {
    m(n0, CYL(0.85), neckMat, 0, 0, 0, 0.045, nl / 2 + 0.01, 0.045);
    m(n1, CYL(0.85), neckMat, 0, 0, 0, 0.04, nl / 2 + 0.01, 0.04);
  }
  const hr = owl ? 0.16 : ostrich ? 0.055 : 0.085 * (perch ? 1.2 : 1);
  const head = grp(n1, 0, nl / 2 + (owl ? hr * 0.9 : hr * 0.5), 0);
  head.rotation.x = -(a0 + a1);
  const headMat = id === 'budgie' ? mat(L.color2 ?? '#f5e04a') : id === 'crownedcrane' ? mat('#1d1d1f') : ostrich ? mat('#d4aeb0') : fur;
  m(head, SPH(), headMat, 0, 0, 0, hr, hr, hr * 1.05);
  const beak = mat(BEAK[id] ?? '#e8a83a');
  if (ex.has('spoonbill')) {
    m(head, CYL(1), beak, 0, -hr * 0.1, hr * 0.8, hr * 0.12, hr * 2.2, hr * 0.1).rotation.x = Math.PI / 2 + 0.3;
    m(head, SPH(), beak, 0, -hr * 0.75, hr * 2.9, hr * 0.35, hr * 0.1, hr * 0.4);
  } else if (ex.has('longbeak')) {
    m(head, CONE(), beak, 0, -hr * 0.1, hr * 0.8, hr * 0.14, hr * 2.6, hr * 0.12).rotation.x = Math.PI / 2 + 0.55;
  } else if (id === 'flamingo') {
    m(head, CONE(), beak, 0, -hr * 0.2, hr * 0.8, hr * 0.3, hr * 1.3, hr * 0.25).rotation.x = Math.PI / 2 + 0.9;
  } else {
    const len = perch ? 0.9 : owl ? 0.5 : 1.3;
    m(head, CONE(), beak, 0, -hr * 0.15, hr * 0.85, hr * 0.3, hr * len, hr * 0.25).rotation.x = Math.PI / 2 + (perch || owl ? 0.6 : 0.15);
  }
  if (ex.has('mask')) m(head, SPH(), mat('#d8322a'), 0, hr * 0.2, hr * 0.5, hr * 0.6, hr * 0.4, hr * 0.45);
  const eyes = owl ? addEyes(head, hr * 0.32, hr * 0.4, hr * 0.15, hr * 0.82, '#f2b81e') : addEyes(head, hr * 0.24, hr * 0.62, hr * 0.2, hr * 0.62, '#1d1d1f', 0.6);
  if (id === 'crownedcrane') {
    m(head, SPH(), mat('#e8b84a', { rough: 1 }), 0, hr * 1.1, -hr * 0.1, hr * 0.55, hr * 0.45, hr * 0.55);
    m(head, SPH(), mat('#d8322a'), 0, -hr * 0.9, hr * 0.4, hr * 0.25, hr * 0.35, hr * 0.2);
  } else if (ex.has('crest')) {
    m(head, CONE(), mat(shade(L.color, 0.7)), 0, hr * 0.6, -hr * 0.3, hr * 0.3, hr * 1.0, hr * 0.2).rotation.x = -1.0;
  }

  const wingMat = id === 'macaw' || id === 'ostrich' ? mat(L.color2 ?? L.color, { rough: 0.9 }) : fur;
  const wings: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const w = grp(rig, s * (owl ? 0.18 : 0.16), by + 0.06, 0.02);
    if (perch) w.rotation.x = -0.7;
    m(w, SPH(), wingMat, s * 0.02, -0.03, -0.04, 0.035, owl ? 0.17 : 0.13, perch ? 0.2 : 0.25);
    wings.push(w);
  }
  const tail = grp(rig, 0, by, owl ? -0.16 : -0.24);
  if (L.tail === 'fan') m(tail, SPH(), mat(L.color2 ?? '#ffffff', { rough: 1 }), 0, 0.06, -0.02, 0.15, 0.13, 0.12);
  else if (L.tail === 'long') {
    tail.rotation.x = perch ? -2.6 : -1.3;
    m(tail, BOX(), perch ? mat(id === 'macaw' ? L.color2 ?? L.color : L.color) : fur, 0, 0.2, 0, 0.06, 0.4, 0.015);
  } else {
    tail.rotation.x = -Math.PI / 2 - 0.3;
    m(tail, CONE(), fur, 0, 0, 0, 0.07, 0.14, 0.035);
  }
  const wader = (L.legs ?? 1) >= 1.6;

  return {
    head,
    moving: [rig, torso, n0, n1, head, tail, ...legs, ...wings, ...eyes],
    pose(st, t, ph, v) {
      torso.scale.y = (owl ? 0.24 : 0.16) * (1 + Math.sin(t * 3 + ph) * 0.02);
      blink(eyes, t, ph);
      switch (st) {
        case 'walk': case 'run': {
          const w = gaitOf(L.size, v) * (st === 'run' ? 1.5 : 1.2);
          const s1 = Math.sin(w * t + ph);
          legs[0].rotation.x = s1 * 0.6;
          legs[1].rotation.x = -s1 * 0.6;
          rig.position.y = Math.abs(s1) * 0.03;
          n1.rotation.x += Math.sin(w * t * 2 + ph) * 0.15;
          if (st === 'run') { wings[0].rotation.z = -0.4; wings[1].rotation.z = 0.4; }
          break;
        }
        case 'fly': {
          const f = Math.sin(t * (L.size < 0.4 ? 22 : 11) + ph) * 0.9;
          wings[0].rotation.z = -0.3 - f;
          wings[1].rotation.z = 0.3 + f;
          legs[0].rotation.x = legs[1].rotation.x = 1.3;
          n0.rotation.x = a0 + 0.5;
          if (perch) torso.rotation.x = 0;
          break;
        }
        case 'sleep':
          if (wader) {
            legs[1].rotation.x = 2.6;
          } else {
            rig.position.y = -legH * 0.85;
            legs[0].rotation.x = legs[1].rotation.x = 1.5;
          }
          n0.rotation.x = -1.0;
          n1.rotation.x = 1.6;
          head.rotation.y = 2.2;
          shut(eyes);
          break;
        case 'sit':
          rig.position.y = -legH * 0.85;
          legs[0].rotation.x = legs[1].rotation.x = 1.5;
          head.rotation.y = Math.sin(t * 0.6 + ph) * 0.8;
          break;
        case 'eat':
          n0.rotation.x = 1.3 + Math.sin(t * 6 + ph) * 0.15;
          n1.rotation.x = 0.4;
          head.rotation.x = 0.2;
          break;
        case 'swim':
          rig.position.y = -(legH + 0.08);
          legs[0].rotation.x = Math.sin(t * 5 + ph) * 0.6;
          legs[1].rotation.x = -Math.sin(t * 5 + ph) * 0.6;
          head.rotation.y = Math.sin(t * 0.6 + ph) * 0.6;
          break;
        case 'climb':
          wings[0].rotation.z = -0.5;
          wings[1].rotation.z = 0.5;
          legs[0].rotation.x = Math.sin(t * 3 + ph) * 0.4;
          break;
        default: {
          head.rotation.y = Math.sin(t * 0.7 + ph) * (owl ? 1.4 : 0.7);
          if (owl) head.rotation.z = Math.sin(t * 0.4 + ph * 3) * 0.25;
          if (Math.sin(t * 0.8 + ph * 4) > 0.9) n0.rotation.x += 0.6;
        }
      }
    },
  };
}

// ---------- Penguins and puffins ----------

function penguin({ sp, L, rig }: Ctx): Built {
  const black = mat(L.color, { rough: 0.8 }), white = mat(L.color2 ?? '#f8f8f6', { rough: 0.8 });
  const puffin = sp.id === 'puffin';
  const torso = m(rig, SPH(), black, 0, 0.42, 0, 0.21, 0.36, 0.19);
  m(rig, SPH(), white, 0, 0.4, 0.05, 0.18, 0.3, 0.16);
  const head = grp(rig, 0, 0.82, 0.02);
  m(head, SPH(), black, 0, 0, 0, 0.15, 0.14, 0.15);
  if (puffin) m(head, SPH(), white, 0, -0.01, 0.05, 0.13, 0.11, 0.12);
  else for (const s of [-1, 1]) m(head, SPH(), white, s * 0.06, 0.07, 0.05, 0.04, 0.025, 0.04);
  const eyes = addEyes(head, 0.035, 0.065, 0.02, 0.12);
  if (puffin) {
    m(head, CONE(), mat('#f25a1e'), 0, -0.03, 0.12, 0.04, 0.13, 0.08).rotation.x = Math.PI / 2 + 0.1;
    for (const s of [-1, 1]) m(head, CONE(), mat('#f2d06a'), s * 0.08, 0.05, -0.08, 0.025, 0.18, 0.02).rotation.x = -1.9;
  } else {
    m(head, CONE(), mat('#ff6a2a'), 0, -0.02, 0.13, 0.04, 0.12, 0.03).rotation.x = Math.PI / 2 + 0.1;
  }
  const wings: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const w = grp(rig, s * 0.2, 0.62, 0);
    w.rotation.z = s * 0.15;
    m(w, SPH(), black, s * 0.02, -0.17, 0, 0.03, 0.2, 0.08);
    wings.push(w);
  }
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const f = grp(rig, s * 0.08, 0.06, 0.02);
    m(f, SPH(), mat('#ff8a3a'), 0, -0.04, 0.06, 0.06, 0.025, 0.1);
    legs.push(f);
  }
  m(rig, CONE(), black, 0, 0.12, -0.16, 0.06, 0.1, 0.03).rotation.x = -2.2;

  return {
    head,
    moving: [rig, torso, head, ...wings, ...legs, ...eyes],
    pose(st, t, ph, v) {
      blink(eyes, t, ph);
      switch (st) {
        case 'walk': case 'run': {
          const w = gaitOf(L.size, v) * (st === 'run' ? 1.8 : 1.4);
          const s1 = Math.sin(w * t + ph);
          rig.rotation.z = s1 * 0.15;
          legs[0].position.y += Math.max(0, s1) * 0.04;
          legs[1].position.y += Math.max(0, -s1) * 0.04;
          wings[0].rotation.z = -0.15 - 0.35;
          wings[1].rotation.z = 0.15 + 0.35;
          if (st === 'run') { wings[0].rotation.z -= Math.abs(s1) * 0.4; wings[1].rotation.z += Math.abs(s1) * 0.4; }
          break;
        }
        case 'swim': case 'fly': {
          rig.rotation.x = 1.45;
          rig.position.set(0, st === 'swim' ? -0.15 : 0.2, -0.4);
          const f = Math.sin(t * (st === 'fly' ? 20 : 7) + ph) * 0.8;
          wings[0].rotation.z = -0.4 - f;
          wings[1].rotation.z = 0.4 + f;
          head.rotation.x = -1.2;
          break;
        }
        case 'eat':
          rig.rotation.x = 0.5 + Math.sin(t * 6 + ph) * 0.1;
          break;
        case 'sleep': case 'sit':
          head.rotation.x = 0.4;
          rig.rotation.z = Math.sin(t * 0.8 + ph) * 0.04;
          if (st === 'sleep') shut(eyes);
          break;
        default:
          head.rotation.y = Math.sin(t * 0.6 + ph) * 0.7;
          if (Math.sin(t * 1.3 + ph * 3) > 0.92) { wings[0].rotation.z -= 0.5; wings[1].rotation.z += 0.5; }
      }
    },
  };
}

// ---------- Seals and sea lions ----------

function seal({ sp, L, rig }: Ctx): Built {
  const fur = mat(L.color, { rough: 0.7 });
  const body = patternMat(sp, 'body');
  const chest = m(rig, SPH(), body, 0, 0.32, 0.18, 0.22, 0.24, 0.3);
  m(rig, SPH(), body, 0, 0.18, -0.3, 0.2, 0.16, 0.42);
  const neck = grp(rig, 0, 0.45, 0.32);
  const head = grp(neck, 0, 0.08, 0.04);
  m(head, SPH(), fur, 0, 0, 0, 0.15, 0.14, 0.16);
  m(head, SPH(), mat(pale(L.color, 0.3)), 0, -0.04, 0.13, 0.08, 0.06, 0.08);
  m(head, SPH(), DARK(), 0, -0.01, 0.2, 0.03, 0.02, 0.02);
  m(head, whiskerGeo(), mat('#f4f4f2'), 0, -0.05, 0.17, 0.15);
  if (sp.id === 'sealion') for (const s of [-1, 1]) m(head, SPH(), fur, s * 0.12, 0.06, -0.02, 0.02, 0.03, 0.02);
  const eyes = addEyes(head, 0.045, 0.07, 0.04, 0.11);
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const f = grp(rig, s * 0.2, 0.22, 0.24);
    f.rotation.z = s * 0.5;
    m(f, SPH(), fur, s * 0.02, -0.12, 0.04, 0.04, 0.14, 0.09);
    legs.push(f);
  }
  const tail = grp(rig, 0, 0.1, -0.7);
  for (const s of [-1, 1]) m(tail, SPH(), fur, s * 0.07, 0, -0.06, 0.06, 0.02, 0.12).rotation.y = s * 0.4;

  return {
    head,
    moving: [rig, chest, neck, head, tail, ...legs, ...eyes],
    pose(st, t, ph, v) {
      blink(eyes, t, ph);
      tail.rotation.y = Math.sin(t * 1.2 + ph) * 0.15;
      switch (st) {
        case 'walk': case 'run': case 'climb': case 'fly': {
          const w = gaitOf(L.size, v) * 1.2;
          const s1 = Math.sin(w * t + ph);
          rig.rotation.x = s1 * 0.12;
          rig.position.y = Math.max(0, s1) * 0.05;
          legs[0].rotation.x = s1 * 0.5;
          legs[1].rotation.x = s1 * 0.5;
          break;
        }
        case 'swim':
          rig.rotation.x = 0.35;
          rig.position.y = -0.3;
          tail.rotation.y = Math.sin(t * 5 + ph) * 0.5;
          legs[0].rotation.z = 0.5 + Math.sin(t * 3 + ph) * 0.3;
          legs[1].rotation.z = -0.5 - Math.sin(t * 3 + ph) * 0.3;
          neck.rotation.x = -0.2;
          break;
        case 'sleep': case 'sit':
          rig.rotation.x = 0.3;
          rig.position.y = -0.08;
          neck.rotation.x = 0.5;
          if (st === 'sleep') shut(eyes);
          break;
        case 'eat':
          neck.rotation.x = -0.5 + Math.sin(t * 7 + ph) * 0.2;
          break;
        default:
          if (sp.id === 'seal') { rig.rotation.x = 0.22; rig.position.y = -0.06; }
          head.rotation.y = Math.sin(t * 0.5 + ph) * 0.6;
          neck.rotation.x = Math.sin(t * 0.3 + ph) * 0.15 - 0.1;
      }
    },
  };
}

// ---------- Reptiles ----------

function reptile({ sp, L, rig }: Ctx): Built {
  const ex = new Set(L.extras ?? []);
  const long = L.long ?? 1.5;
  const skin = mat(L.color, { rough: 0.85 });
  const shell = ex.has('shell');
  const sea = sp.id === 'seaturtle';
  let torso: THREE.Mesh;
  const legs: THREE.Group[] = [];
  const hipY = shell ? 0.14 : 0.12;
  if (shell) {
    torso = m(rig, SPH(), patternMat(sp, 'body'), 0, 0.16, 0, 0.32, 0.22, 0.38);
    m(rig, SPH(), mat(L.color2 ?? '#c8b07a'), 0, 0.1, 0, 0.29, 0.06, 0.34);
  } else {
    torso = m(rig, SPH(), patternMat(sp, 'body'), 0, 0.13, 0, 0.18, 0.1, 0.25 * long);
  }
  const legMat = shell ? mat(shade(L.color === '#3a2e1c' ? '#8a7a5a' : L.color, 1)) : skin;
  const lz = shell ? 0.24 : 0.22 * long * 0.6;
  for (const [s, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const hip = grp(rig, s * (shell ? 0.24 : 0.16), hipY, z * lz);
    hip.rotation.z = s * (sea ? 1.3 : shell ? 0.3 : 0.9);
    if (sea) m(hip, SPH(), legMat, 0, -0.14, 0, 0.05, 0.16, z > 0 ? 0.1 : 0.07);
    else limb(hip, legMat, hipY + 0.04, 0.05, 0.8);
    legs.push(hip);
  }
  const neck = grp(rig, 0, shell ? 0.12 : 0.13, shell ? 0.38 : 0.25 * long);
  const head = grp(neck, 0, 0, shell ? 0.08 : 0.08);
  const hs = shell ? 0.08 : 0.1;
  m(head, SPH(), skin, 0, 0, 0, hs, hs * 0.75, hs * 1.15);
  if (ex.has('snout')) {
    m(head, SPH(), skin, 0, -hs * 0.2, hs * 2.2, hs * 0.75, hs * 0.45, hs * 1.8);
    for (const s of [-1, 1]) m(head, SPH(), mat('#f4f0e0'), s * hs * 0.6, -hs * 0.35, hs * 2.4, hs * 0.08, hs * 0.12, hs * 1.4);
  }
  const eyes = addEyes(head, hs * 0.3, hs * 0.5, hs * 0.45, hs * 0.55, sp.id === 'alligator' ? '#c8a02a' : '#2a1a10', 0.4);
  const tail = grp(rig, 0, 0.12, shell ? -0.36 : -0.25 * long);
  tail.rotation.x = -Math.PI / 2 - 0.05;
  const tl = shell ? 0.1 : 0.3 * long;
  m(tail, CYL(0.15), skin, 0, 0, 0, shell ? 0.04 : 0.09, tl, shell ? 0.03 : 0.07);

  return {
    head,
    moving: [rig, torso, neck, head, tail, ...legs, ...eyes],
    pose(st, t, ph, v) {
      blink(eyes, t, ph);
      switch (st) {
        case 'walk': case 'run': case 'climb': case 'fly': {
          const w = gaitOf(L.size, v) * (shell ? 0.6 : 1.4);
          const s1 = Math.sin(w * t + ph);
          legs[0].rotation.x = legs[3].rotation.x = s1 * 0.5;
          legs[1].rotation.x = legs[2].rotation.x = -s1 * 0.5;
          if (!shell) { rig.rotation.y = s1 * 0.08; tail.rotation.z = s1 * 0.3; }
          break;
        }
        case 'swim': {
          rig.position.y = shell ? -0.18 : -0.12;
          const s1 = Math.sin(t * (sea ? 2 : 3) + ph);
          if (sea) { legs[0].rotation.x = legs[1].rotation.x = s1 * 0.7; }
          else tail.rotation.z = s1 * 0.6;
          break;
        }
        case 'sleep':
          rig.position.y = -0.04;
          if (shell) neck.position.z -= 0.08;
          shut(eyes);
          break;
        case 'eat':
          neck.rotation.x = 0.4 + Math.sin(t * 4 + ph) * 0.12;
          break;
        default:
          head.rotation.y = Math.sin(t * 0.3 + ph) * 0.35;
          tail.rotation.z = Math.sin(t * 0.5 + ph) * 0.1;
      }
    },
  };
}

// ---------- Snakes ----------

function snake({ sp, L, rig }: Ctx): Built {
  const N = 10;
  const r = 0.1;
  const gap = 0.11 * (L.long ?? 4) / 4;
  const skin = patternMat(sp, 'body');
  const segs: THREE.Mesh[] = [];
  const radii: number[] = [];
  for (let i = 0; i < N; i++) {
    const ri = r * (i < 2 ? 1 : 1 - ((i - 2) / N) * 0.8);
    radii.push(ri);
    segs.push(m(rig, SPH(), skin, 0, ri, (N / 2 - i) * gap, ri, ri * 0.85, ri * 1.3));
  }
  const head = grp(rig, 0, r * 1.05, (N / 2) * gap + 0.12);
  m(head, SPH(), mat(L.color, { rough: 0.8 }), 0, 0, 0, 0.11, 0.08, 0.15);
  const eyes = addEyes(head, 0.035, 0.06, 0.04, 0.09);
  const tongue = m(head, BOX(), mat('#e8325a'), 0, -0.02, 0.18, 0.015, 0.006, 0.1);

  return {
    head,
    unit: 2 * r,
    moving: [rig, head, tongue, ...segs, ...eyes],
    pose(st, t, ph, v) {
      blink(eyes, t, ph);
      tongue.visible = Math.sin(t * 3 + ph) > 0.6;
      if (st === 'sleep') {
        for (let i = 0; i < N; i++) {
          const a = i * 0.75, R = 0.08 + i * 0.022;
          segs[i].position.set(Math.cos(a) * R, radii[i], Math.sin(a) * R);
        }
        head.position.set(0, r * 2.2, 0);
        shut(eyes);
        return;
      }
      const moving = st === 'walk' || st === 'run' || st === 'swim';
      const amp = moving ? 0.12 : 0.03;
      const w = moving ? 4 + v * 3 : 1;
      for (let i = 0; i < N; i++) segs[i].position.x = Math.sin(t * w - i * 0.8 + ph) * amp * (0.4 + i / N);
      head.position.x = Math.sin(t * w + 0.8 + ph) * amp * 0.3;
      head.rotation.y = Math.cos(t * w + 0.8 + ph) * amp * 2;
      if (st === 'eat') head.rotation.x = 0.4;
    },
  };
}

// ---------- Fish, rays and the octopus ----------

function fish({ sp, L, rig }: Ctx): Built {
  const ex = new Set(L.extras ?? []);
  const skin = mat(L.color, { rough: 0.6 });
  const moving: THREE.Object3D[] = [rig];
  const flaps: THREE.Group[] = [];
  let tail: THREE.Group | null = null;
  let head: THREE.Group;
  let eyes: THREE.Group[];
  const kind = ex.has('tentacles') ? 'octopus' : sp.id === 'stingray' ? 'ray' : 'fish';

  if (kind === 'octopus') {
    head = grp(rig, 0, 0.45, 0);
    m(head, SPH(), skin, 0, 0.12, -0.08, 0.25, 0.3, 0.25).rotation.x = -0.4;
    eyes = addEyes(head, 0.06, 0.11, -0.02, 0.14, '#f2c12e');
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const g = grp(rig, Math.cos(a) * 0.12, 0.4, Math.sin(a) * 0.12);
      g.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      limb(g, skin, 0.5, 0.06, 0.2);
      flaps.push(g);
    }
  } else if (kind === 'ray') {
    m(rig, SPH(), skin, 0, 0.07, 0, 0.12, 0.07, 0.25);
    for (const s of [-1, 1]) {
      const w = grp(rig, s * 0.08, 0.07, 0);
      m(w, SPH(), skin, s * 0.18, 0, -0.02, 0.22, 0.025, 0.2);
      flaps.push(w);
    }
    tail = grp(rig, 0, 0.07, -0.22);
    tail.rotation.x = -Math.PI / 2;
    m(tail, CYL(0.2), skin, 0, 0, 0, 0.02, 0.45, 0.02);
    head = grp(rig, 0, 0.1, 0.18);
    eyes = addEyes(head, 0.03, 0.07, 0.02, 0, '#2a1a10', 0.6);
  } else {
    const hz = 0.17 * (L.long ?? 3);
    const body = m(rig, SPH(), patternMat(sp, 'body'), 0, 0.17, 0, 0.13, 0.17, hz);
    moving.push(body);
    head = grp(rig, 0, 0.19, hz * 0.6);
    eyes = addEyes(head, 0.04, 0.09, 0.02, 0.04, '#1d1d1f', 1.2);
    tail = grp(rig, 0, 0.17, -hz * 0.92);
    for (const s of [-1, 1]) {
      const fin = m(tail, CONE(), skin, 0, 0, 0, 0.02, 0.24, 0.12);
      fin.rotation.x = -Math.PI / 2 + s * 0.7;
    }
    if (ex.has('fin')) m(rig, CONE(), skin, 0, 0.3, -hz * 0.05, 0.02, sp.id === 'shark' ? 0.26 : 0.12, 0.14).rotation.x = -0.35;
    for (const s of [-1, 1]) {
      const p = grp(rig, s * 0.12, 0.1, hz * 0.3);
      m(p, SPH(), skin, s * 0.08, 0, 0, 0.1, 0.015, 0.06);
      p.rotation.z = s * -0.3;
      flaps.push(p);
    }
  }
  moving.push(head, ...flaps, ...eyes);
  if (tail) moving.push(tail);

  return {
    head,
    moving,
    pose(st, t, ph, v) {
      blink(eyes, t, ph);
      const fast = st === 'swim' || st === 'walk' || st === 'run' ? 1 + v * 0.8 : 0.4;
      if (kind === 'octopus') {
        for (let k = 0; k < flaps.length; k++) {
          flaps[k].rotation.x += Math.sin(t * 2 * fast + k + ph) * 0.25;
          flaps[k].rotation.z += Math.cos(t * 1.7 * fast + k * 1.3 + ph) * 0.25;
        }
        rig.position.y = Math.sin(t * 1.2 + ph) * 0.05;
        return;
      }
      if (kind === 'ray') {
        const f = Math.sin(t * 3 * fast + ph) * 0.45;
        flaps[0].rotation.z = -f;
        flaps[1].rotation.z = f;
        if (tail) tail.rotation.z = Math.sin(t * 2 + ph) * 0.2;
        return;
      }
      if (tail) tail.rotation.y = Math.sin(t * 5 * fast + ph) * 0.45;
      rig.rotation.y = Math.sin(t * 5 * fast + ph + 1.2) * 0.06;
      flaps[0].rotation.z = 0.3 + Math.sin(t * 3 + ph) * 0.2;
      flaps[1].rotation.z = -0.3 - Math.sin(t * 3 + ph) * 0.2;
    },
  };
}

// ---------- Bats ----------

function bat({ L, rig }: Ctx): Built {
  // Built hanging: feet at the origin, the body below, head at the bottom.
  const fur = mat(L.color, { rough: 1 });
  const membrane = mat(shade(L.color, 0.8), { rough: 0.9 });
  m(rig, CYL(1), fur, -0.03, -0.04, 0, 0.012, 0.05, 0.012);
  m(rig, CYL(1), fur, 0.03, -0.04, 0, 0.012, 0.05, 0.012);
  const torso = m(rig, SPH(), fur, 0, -0.18, 0, 0.08, 0.13, 0.07);
  m(rig, SPH(), mat(L.color2 ?? '#c8783c', { rough: 1 }), 0, -0.26, 0.01, 0.075, 0.05, 0.07);
  const head = grp(rig, 0, -0.34, 0.01);
  m(head, SPH(), fur, 0, 0, 0, 0.075);
  m(head, SPH(), fur, 0, -0.02, 0.06, 0.035, 0.03, 0.04);
  for (const s of [-1, 1]) m(head, CONE(), fur, s * 0.045, -0.05, -0.01, 0.025, 0.07, 0.015).rotation.z = Math.PI + s * 0.35;
  const eyes = addEyes(head, 0.022, 0.03, 0.01, 0.06);
  const wings: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const w = grp(rig, s * 0.06, -0.2, 0);
    m(w, SPH(), membrane, s * 0.22, 0, 0, 0.24, 0.14, 0.012);
    wings.push(w);
  }
  return {
    head,
    unit: 0.5,
    moving: [rig, torso, head, ...wings, ...eyes],
    pose(st, t, ph) {
      blink(eyes, t, ph);
      if (st === 'fly' || st === 'walk' || st === 'run') {
        rig.rotation.x = -Math.PI / 2;
        rig.position.z = 0.2;
        const f = Math.sin(t * 13 + ph) * 0.9;
        wings[0].rotation.y = f;
        wings[1].rotation.y = -f;
        head.rotation.x = 0.8;
        return;
      }
      // Hanging, wings wrapped.
      wings[0].rotation.y = -1.5;
      wings[1].rotation.y = 1.5;
      wings[0].scale.x = wings[1].scale.x = 0.45;
      rig.rotation.z = Math.sin(t * 0.7 + ph) * 0.08;
      if (st === 'sleep') shut(eyes);
      else head.rotation.y = Math.sin(t * 0.8 + ph) * 0.5;
    },
  };
}

// ---------- Butterflies ----------

function butterfly({ L, rig }: Ctx): Built {
  const dark = mat(L.color2 ?? '#1d1d24');
  const bodyM = m(rig, CYL(0.7), dark, 0, 0.05, -0.08, 0.018, 0.2, 0.018);
  bodyM.rotation.x = Math.PI / 2;
  const head = grp(rig, 0, 0.05, 0.13);
  m(head, SPH(), dark, 0, 0, 0, 0.025);
  for (const s of [-1, 1]) m(head, CYL(0.5), dark, s * 0.01, 0.01, 0.01, 0.004, 0.09, 0.004).rotation.set(0.6, 0, -s * 0.4);
  const wm = butterflyWing(L.color, L.color2 ?? '#1d1d24');
  const wings: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const w = grp(rig, 0, 0.05, 0.02);
    m(w, SPH(), wm, s * 0.15, 0, 0.05, 0.15, 0.008, 0.12);
    m(w, SPH(), wm, s * 0.11, 0, -0.09, 0.1, 0.008, 0.08);
    wings.push(w);
  }
  return {
    head,
    unit: 0.3,
    moving: [rig, head, ...wings],
    pose(st, t, ph) {
      const flying = st === 'fly' || st === 'walk' || st === 'run';
      const f = flying ? 0.2 + Math.abs(Math.sin(t * 14 + ph)) * 1.2 : 0.6 + Math.sin(t * 1.5 + ph) * 0.6;
      wings[0].rotation.z = f;
      wings[1].rotation.z = -f;
      if (flying) rig.position.y = Math.sin(t * 6 + ph) * 0.04;
    },
  };
}

const BUILD: Record<Look['body'], (c: Ctx) => Built> = { quad, ape, monkey, bird, penguin, seal, reptile, snake, fish, bat, butterfly };

/** One animal, built for its species, a little different by its seed; babies are small with big heads. */
export function animalFigure(sp: Species, seed: number, baby = false): AnimalFig {
  const group = dyn(new THREE.Group());
  const rig = new THREE.Group();
  group.add(rig);
  const b = BUILD[sp.look.body]({ sp, L: sp.look, rig, baby, seed });
  let unit = b.unit;
  if (!unit) {
    rig.updateMatrixWorld(true);
    unit = new THREE.Box3().setFromObject(rig).max.y || 1;
  }
  const scale = (sp.look.size / unit) * (baby ? 0.55 : 1) * (0.94 + (seed % 13) / 100);
  group.scale.setScalar(scale);
  if (baby) b.head.scale.multiplyScalar(1.3);
  group.updateMatrixWorld(true);
  const height = sp.look.body === 'bat' ? 0.1 * scale : new THREE.Box3().setFromObject(group).max.y;
  const snap = new Snap(b.moving);
  return {
    group, rig, head: b.head, height,
    pose(state, t, phase, speed) {
      snap.reset();
      b.pose(state, t, phase, speed);
    },
  };
}
