import * as THREE from 'three';
import { hash } from '@/lib/kan/city/layout';
import { Grid, ROAD, type Vec } from './grid';
import { dyn, mat, nightGlows, sign, windowBox } from './models';
import type { CityData } from './types';

/**
 * The Market: every app you've made, as a shop on a warm market square off the
 * near edge of town.
 *
 * Each shop is built for its app. What the app does picks the kind of shop and the
 * thing on its roof (an easel for a drawing tool, a book for a lesson, a joystick
 * for a game, a paper crane for a craft), its colors come from the app, and its
 * front window shows the app itself (its thumbnail). Money still shows: an app that
 * earns gets gold trim, a flag and the best corner; one for sale hangs a price tag.
 * Anything made in the last few days has balloons tied to its door.
 *
 * Same contract as the old Strip, so the engine walks, drives and picks the same way.
 */

export type MarketApp = CityData['apps'][number];
export interface Rect { x0: number; z0: number; x1: number; z1: number }
export interface MarketLot { app: MarketApp; group: THREE.Group; center: Vec; door: Vec; top: number; footprint: Rect }
export interface Market {
  group: THREE.Group;
  lots: MarketLot[];
  ticks: ((t: number, dt: number) => void)[];
  /** Where cars may drive. */
  roads: Rect[];
  /** The whole district, for walking and the camera. */
  bounds: Rect;
  /** Where the market road meets the city. */
  gate: Vec;
}

const LOT = 12;
const BAND = 32;
/** Made this recently: balloons on the door. */
export const NEW_MS = 3 * 24 * 3600_000;

const inside = (r: Rect, x: number, z: number, pad = 0) => x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
export { inside as inRect };

function box(g: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, shadow = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
function cyl(g: THREE.Object3D, r0: number, r1: number, h: number, m: THREE.Material, x: number, y: number, z: number, seg = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}
function glow(color: string, intensity = 1.2) {
  const m = mat(color, { emissive: color, intensity });
  nightGlows.add(m);
  return m;
}

// --- What kind of shop an app is ---

export type ShopKind = 'studio' | 'arcade' | 'school' | 'music' | 'workshop' | 'cafe' | 'office' | 'library' | 'lab' | 'garden' | 'shop';

const KINDS: [ShopKind, RegExp][] = [
  ['studio', /\b(canvas|draw|doodle|paint|sketch|art|design|remix|sticker|image|photo|poster|color|style|visual|logo|collage|mood ?board)/i],
  ['arcade', /\b(game|play|quest|arcade|puzzle|challenge|race|battle|score|launch simulator|simulator|cup)/i],
  ['school', /\b(learn|lesson|math|explain|explainer|quiz|kids?|teach|tutor|practice|spelling|homework|stick-figure)/i],
  ['music', /\b(music|sound|beat|song|audio|piano|rhythm|podcast)/i],
  ['workshop', /\b(paper|craft|3d|build|maker|fold|origami|world|map|terrain|model)/i],
  ['cafe', /\b(food|recipe|coffee|espresso|kitchen|meal|cook|bake|drink)/i],
  ['office', /\b(plan|track|habit|budget|schedule|calendar|data|chart|dashboard|invoice|crm|time ?zone|meeting)/i],
  ['library', /\b(write|writing|story|book|blog|journal|notes?|read|poem)/i],
  ['lab', /\b(ai|chat|voice|talk|bot|assistant|agent|decision|prompt)/i],
  ['garden', /\b(garden|plant|bird|pond|nature|weather|pet|cat|dog)/i],
];
export function shopKind(app: Pick<MarketApp, 'title' | 'tagline'>): ShopKind {
  const text = `${app.title} ${app.tagline ?? ''}`;
  for (const [k, re] of KINDS) if (re.test(app.title)) return k;
  for (const [k, re] of KINDS) if (re.test(text)) return k;
  return 'shop';
}

/** Each kind's palette: wall, trim, awning stripe. A per-app hash picks within it. */
const PALETTE: Record<ShopKind, { wall: string[]; trim: string; stripe: string[] }> = {
  studio: { wall: ['#f6e7d8', '#fde2e4', '#e8f1fa'], trim: '#c2410c', stripe: ['#f97316', '#ec4899', '#8b5cf6'] },
  arcade: { wall: ['#2e2a5a', '#3b2d63', '#1f3a5f'], trim: '#22d3ee', stripe: ['#a855f7', '#22d3ee', '#f43f5e'] },
  school: { wall: ['#fff4d6', '#e9f7e4', '#e6f0ff'], trim: '#b45309', stripe: ['#ef4444', '#2563eb', '#16a34a'] },
  music: { wall: ['#26213a', '#f3e8ff', '#1e293b'], trim: '#facc15', stripe: ['#7c3aed', '#facc15', '#0ea5e9'] },
  workshop: { wall: ['#efe6d6', '#e7ded0', '#f4efe6'], trim: '#78583a', stripe: ['#0f766e', '#b45309', '#475569'] },
  cafe: { wall: ['#f5e6d3', '#fbe9e7', '#eef6ee'], trim: '#7c2d12', stripe: ['#16a34a', '#b91c1c', '#92400e'] },
  office: { wall: ['#e6eef7', '#eef2f6', '#e8f4f1'], trim: '#1e40af', stripe: ['#2563eb', '#0d9488', '#64748b'] },
  library: { wall: ['#f3ead8', '#e9e2f5', '#efe7dd'], trim: '#6b2737', stripe: ['#7f1d1d', '#1e3a8a', '#365314'] },
  lab: { wall: ['#e7f6f8', '#eef2ff', '#ecfdf5'], trim: '#0e7490', stripe: ['#06b6d4', '#6366f1', '#10b981'] },
  garden: { wall: ['#eef7e6', '#fdf6e3', '#e8f5ef'], trim: '#3f6212', stripe: ['#65a30d', '#f59e0b', '#059669'] },
  shop: { wall: ['#fdf2e9', '#eef6fb', '#f5f0fa'], trim: '#9d174d', stripe: ['#db2777', '#0891b2', '#ca8a04'] },
};

// --- Roof props: the thing that says what's inside ---

function prop(kind: ShopKind, accent: string, seed: number, ticks: Market['ticks']): THREE.Group {
  const g = new THREE.Group();
  const a = mat(accent, { rough: 0.5 });
  const wood = mat('#8b5a2b');
  const white = mat('#fafafa');
  switch (kind) {
    case 'studio': {
      // An easel with a canvas splashed in color, and a palette leaning on it.
      for (const [x, r] of [[-0.9, 0.22], [0.9, -0.22]] as const) { const l = box(g, 0.18, 4.4, 0.18, wood, x, 0, 0); l.rotation.z = r; }
      const leg = box(g, 0.18, 4, 0.18, wood, 0, 0, -0.9); leg.rotation.x = -0.3;
      box(g, 2.8, 2.2, 0.15, white, 0, 1.7, 0.15, true);
      const splash = ['#f97316', '#ec4899', '#22d3ee', '#facc15'];
      splash.forEach((c, i) => box(g, 0.7 + (i % 2) * 0.3, 0.5, 0.05, mat(c), -0.7 + (i % 3) * 0.6, 2 + (i > 1 ? 0.8 : 0), 0.25));
      const pal = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.1, 18), mat('#d6b48a'));
      pal.rotation.x = Math.PI / 2.4; pal.position.set(1.6, 0.8, 0.9); g.add(pal);
      break;
    }
    case 'arcade': {
      // A giant joystick that wiggles, and a star.
      box(g, 2.6, 0.7, 2, mat('#111827'), 0, 0, 0, true);
      const stick = new THREE.Group();
      cyl(stick, 0.16, 0.16, 2, mat('#d1d5db', { metal: 0.6 }), 0, 0, 0);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), glow(accent, 0.6)); ball.position.y = 2.2; stick.add(ball);
      stick.position.set(-0.4, 0.7, 0); g.add(dyn(stick));
      for (const [x, c] of [[0.7, '#ef4444'], [1.1, '#facc15']] as const) cyl(g, 0.22, 0.22, 0.15, glow(c, 0.8), x, 0.7, 0.3);
      ticks.push((t) => { stick.rotation.z = Math.sin(t * 2.2 + seed) * 0.25; stick.rotation.x = Math.cos(t * 1.7 + seed) * 0.15; });
      break;
    }
    case 'school': {
      // An open book and a pencil leaning on it.
      for (const s of [-1, 1]) { const p = box(g, 1.6, 0.12, 2.2, white, s * 0.8, 0.5, 0); p.rotation.z = -s * 0.18; }
      box(g, 3.4, 0.25, 2.4, a, 0, 0.25, 0, true);
      const pencil = new THREE.Group();
      cyl(pencil, 0.22, 0.22, 3.6, mat('#facc15'), 0, 0, 0, 6);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 6), mat('#f5d0a9')); tip.position.y = -0.3; tip.rotation.z = Math.PI; pencil.add(tip);
      cyl(pencil, 0.23, 0.23, 0.4, mat('#f472b6'), 0, 3.6, 0, 6);
      pencil.position.set(1.4, 0.6, 0.6); pencil.rotation.z = 0.5; g.add(pencil);
      break;
    }
    case 'music': {
      // A big note, bobbing.
      const note = new THREE.Group();
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), glow(accent, 0.5)); head.scale.set(1.2, 0.85, 0.8); note.add(head);
      box(note, 0.2, 3.2, 0.2, mat('#111827'), 0.75, 0, 0);
      const flag = box(note, 1.2, 0.35, 0.2, mat('#111827'), 1.3, 2.7, 0); flag.rotation.z = -0.5;
      note.position.y = 1; g.add(dyn(note));
      ticks.push((t) => { note.position.y = 1 + Math.sin(t * 2 + seed) * 0.3; note.rotation.y = Math.sin(t * 0.8 + seed) * 0.4; });
      break;
    }
    case 'workshop': {
      // A paper crane, folding slowly in the breeze.
      const crane = new THREE.Group();
      const paper = mat('#fefefe', { rough: 0.8 });
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.2, 4), paper); body.rotation.z = Math.PI / 2; crane.add(body);
      const wings: THREE.Mesh[] = [];
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.6, 3), mat(accent, { rough: 0.8 }));
        w.rotation.x = s * Math.PI / 2; w.position.z = s * 1.2; w.position.y = 0.3; crane.add(w); wings.push(w);
      }
      const neck = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.8, 4), paper); neck.position.set(1.3, 0.8, 0); neck.rotation.z = -0.6; crane.add(neck);
      crane.position.y = 2; g.add(dyn(crane));
      ticks.push((t) => { const f = Math.sin(t * 1.6 + seed) * 0.35; wings[0].rotation.x = -Math.PI / 2 + f; wings[1].rotation.x = Math.PI / 2 - f; crane.rotation.y = t * 0.3 + seed; });
      break;
    }
    case 'cafe': {
      // A steaming cup.
      cyl(g, 1, 0.8, 1.6, white, 0, 0, 0, 20);
      cyl(g, 0.92, 0.92, 0.1, mat('#6b3e26'), 0, 1.45, 0, 20);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.13, 8, 16), white); handle.position.set(1.05, 0.8, 0); g.add(handle);
      const puffs: THREE.Mesh[] = [];
      for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 })); g.add(dyn(p)); puffs.push(p); }
      ticks.push((t) => puffs.forEach((p, i) => { const k = ((t * 0.5 + i / 3 + seed) % 1); p.position.set(Math.sin(k * 6 + i) * 0.3, 1.8 + k * 2, 0); (p.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k); p.scale.setScalar(0.6 + k); }));
      break;
    }
    case 'office': {
      // A bar chart, growing.
      const bars: THREE.Mesh[] = [];
      ['#2563eb', '#0d9488', accent, '#f59e0b'].forEach((c, i) => { const b = box(g, 0.6, 1, 0.6, mat(c), -1.05 + i * 0.7, 0, 0, true); bars.push(b); });
      ticks.push((t) => bars.forEach((b, i) => { const hgt = 1 + i * 0.6 + Math.sin(t * 1.2 + i + seed) * 0.3; b.scale.y = hgt; b.position.y = hgt / 2; }));
      bars.forEach((b) => dyn(b));
      break;
    }
    case 'library': {
      // A stack of books.
      ['#7f1d1d', '#1e3a8a', '#365314', accent].forEach((c, i) => { const b = box(g, 2.2 - i * 0.2, 0.45, 1.5, mat(c), (i % 2) * 0.2 - 0.1, i * 0.45, 0, true); b.rotation.y = (i - 1.5) * 0.12; });
      break;
    }
    case 'lab': {
      // A dish listening to the sky, with a blinking light.
      cyl(g, 0.2, 0.3, 1.4, mat('#cbd5e1', { metal: 0.5 }), 0, 0, 0);
      const dish = new THREE.Mesh(new THREE.SphereGeometry(1.4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3.2), mat('#f1f5f9', { metal: 0.3 }));
      dish.material.side = THREE.DoubleSide; dish.rotation.x = Math.PI; dish.position.y = 2.6;
      const mount = new THREE.Group(); mount.add(dish); mount.position.y = 0; g.add(dyn(mount));
      const blink = glow(accent, 1.5);
      const tipBall = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), blink); tipBall.position.y = 1.6; mount.add(tipBall);
      ticks.push((t) => { mount.rotation.y = Math.sin(t * 0.4 + seed) * 0.8; (blink as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(t * 4 + seed) > 0 ? 2 : 0.2; });
      break;
    }
    case 'garden': {
      // A big flower in a pot.
      cyl(g, 0.8, 0.6, 1, mat('#c2410c'), 0, 0, 0);
      cyl(g, 0.08, 0.08, 2, mat('#15803d'), 0, 1, 0, 6);
      const bloom = new THREE.Group();
      for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), mat(accent)); const ang = (i / 6) * Math.PI * 2; p.position.set(Math.cos(ang) * 0.55, 0, Math.sin(ang) * 0.55); p.scale.y = 0.4; bloom.add(p); }
      bloom.add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), mat('#facc15')));
      bloom.position.y = 3.1; bloom.rotation.x = 0.5; g.add(dyn(bloom));
      ticks.push((t) => { bloom.rotation.y = t * 0.5 + seed; });
      break;
    }
    default: {
      // A star that turns.
      const s = new THREE.Shape();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.55 : 1.3, ang = (i / 10) * Math.PI * 2 - Math.PI / 2; if (i) s.lineTo(Math.cos(ang) * r, Math.sin(ang) * r); else s.moveTo(Math.cos(ang) * r, Math.sin(ang) * r); }
      const star = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: false }), glow(accent, 0.7));
      star.position.y = 1.8; g.add(dyn(star));
      ticks.push((t) => { star.rotation.y = t * 0.9 + seed; });
    }
  }
  return g;
}

// --- The app's own face in the window ---

const loader = typeof window !== 'undefined' ? new THREE.TextureLoader() : null;
if (loader) loader.setCrossOrigin('anonymous');
const thumbCache = new Map<string, THREE.Texture>();
function thumbMat(url: string | null, fallback: string) {
  const m = new THREE.MeshStandardMaterial({ color: fallback, roughness: 0.35, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.12 });
  if (url && loader) {
    let t = thumbCache.get(url);
    if (!t) {
      // Cloudinary can hand back a small one; the window is a few meters wide.
      const small = url.includes('/upload/') ? url.replace('/upload/', '/upload/c_fill,w_512,h_384,q_auto,f_jpg/') : url;
      t = loader.load(small, (tex) => { tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true; });
      thumbCache.set(url, t);
    }
    m.map = t; m.emissiveMap = t; m.color.set('#ffffff'); m.emissiveIntensity = 0.45;
    nightGlows.add(m);
  }
  return m;
}

/** One app's shop. Its door faces +z; the caller turns it to face the street. */
function shop(app: MarketApp, ticks: Market['ticks'], now: number): { group: THREE.Group; top: number; half: number } {
  const g = new THREE.Group();
  const seed = hash(app.id);
  const kind = shopKind(app);
  const pal = PALETTE[kind];
  const wallC = pal.wall[seed % pal.wall.length];
  const stripe = pal.stripe[seed % pal.stripe.length];
  const gold = app.tier === 'earning';
  const trim = mat(gold ? '#d4a52c' : pal.trim, gold ? { metal: 0.6, rough: 0.35 } : {});

  // A stone step all round.
  box(g, 10, 0.25, 10, mat('#cbbfae', { rough: 0.95 }), 0, 0, 0);
  const w = 7.6 + (app.tier === 'free' ? 0 : 0.8);
  const floors = app.tier === 'earning' ? 3 : app.tier === 'selling' ? 2 : 1 + (seed % 2);
  const h = 3.4 + floors * 2.4;
  const body = windowBox(w, h, w, wallC, pal.trim, 0.4, floors > 1 ? 'grid' : 'shop');
  body.position.y = 0.25 + h / 2;
  g.add(body);

  // A roof with a little overhang, and a cornice in the trim color.
  box(g, w + 0.8, 0.45, w + 0.8, trim, 0, 0.25 + h, 0, true);

  // The front: a big window with the app itself in it.
  const winW = Math.min(w - 1.6, 5.6), winH = 2.6;
  const frame = box(g, winW + 0.4, winH + 0.4, 0.2, trim, 0, 0.9, w / 2 + 0.02);
  void frame;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), thumbMat(app.thumbnail, stripe));
  screen.position.set(0, 0.9 + (winH + 0.4) / 2, w / 2 + 0.13);
  g.add(dyn(screen));

  // A striped awning over it.
  const stripes = 6;
  for (let i = 0; i < stripes; i++) {
    const s = box(g, (winW + 1) / stripes, 0.12, 1.8, mat(i % 2 ? '#fffaf0' : stripe), -((winW + 1) / 2) + ((i + 0.5) * (winW + 1)) / stripes, 0, w / 2 + 0.95);
    s.position.y = 0.9 + winH + 0.75; s.rotation.x = 0.32;
  }
  // The name over the awning, and a hanging blade sign at the corner.
  const nameSign = sign(app.title, Math.min(w - 0.4, 7.2), 1.1, '#fffaf0', pal.trim);
  nameSign.position.set(0, 0.9 + winH + 1.9, w / 2 + 0.06);
  g.add(nameSign);

  // Flower boxes under the upper windows on a free shop; a price tag on one for sale; gold and a flag on one that earns.
  if (app.tier === 'free') {
    for (const s of [-1, 1]) { box(g, 1.6, 0.4, 0.5, mat('#7c4a2a'), s * (w / 2 - 1.3), 0.25, w / 2 + 0.25); for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), mat(['#f472b6', '#facc15', '#f97316', '#a78bfa'][(i + seed) % 4])); f.position.set(s * (w / 2 - 1.3) - 0.55 + i * 0.37, 0.8, w / 2 + 0.25); g.add(f); } }
  } else if (app.tier === 'selling') {
    const tag = sign(app.price ?? '$', 2.4, 1, '#fef3c7', '#92400e');
    tag.position.set(w / 2 - 0.2, 0.25 + h - 0.8, w / 2 + 0.6); tag.rotation.y = -0.4; g.add(tag);
  } else {
    cyl(g, 0.08, 0.08, 4, mat('#d1d5db', { metal: 0.6 }), w / 2 - 0.6, 0.7 + h, -w / 2 + 0.6, 6);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1, 6, 1), mat('#facc15'));
    (flag.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    flag.position.set(w / 2 - 0.6 + 0.9, 0.7 + h + 3.4, -w / 2 + 0.6); g.add(dyn(flag));
    ticks.push((t) => { flag.rotation.y = Math.sin(t * 2 + seed) * 0.25; });
  }

  // What it does, on the roof.
  const p = prop(kind, stripe, seed, ticks);
  p.position.set((seed % 3 - 1) * 1.2, 0.7 + h, -0.4);
  g.add(p);

  // Balloons on anything made in the last few days.
  let top = h + 5.2;
  if (app.at && now - app.at < NEW_MS) {
    const bunch = dyn(new THREE.Group());
    ['#f43f5e', '#facc15', '#22d3ee', '#a855f7'].forEach((c, i) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), mat(c, { rough: 0.25 }));
      b.scale.y = 1.2; b.position.set((i - 1.5) * 0.55, 3.6 + (i % 2) * 0.6, 0); bunch.add(b);
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.2, 3), mat('#e5e7eb')); string.position.set((i - 1.5) * 0.28, 1.8, 0); bunch.add(string);
    });
    bunch.position.set(w / 2 + 0.6, 0.25, w / 2 + 1.2);
    g.add(bunch);
    ticks.push((t) => { bunch.rotation.z = Math.sin(t * 1.3 + seed) * 0.08; bunch.position.y = 0.25 + Math.sin(t * 2 + seed) * 0.15; });
    top = Math.max(top, 6);
  }

  // A doorstep mat and two potted trees.
  box(g, 2, 0.04, 1.6, mat('#b45309'), 0, 0.25, w / 2 + 1.4);
  for (const s of [-1, 1]) { cyl(g, 0.45, 0.35, 0.7, mat('#9a3412'), s * (winW / 2 + 0.9), 0.25, w / 2 + 0.8); const crown = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), mat('#4d7c0f')); crown.position.set(s * (winW / 2 + 0.9), 1.6, w / 2 + 0.8); g.add(crown); }

  return { group: g, top: top + 0.25, half: w / 2 };
}

/** A market stall with a striped canopy and goods on the counter. */
function stall(g: THREE.Group, x: number, z: number, seed: number) {
  const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6'];
  const c = colors[seed % colors.length];
  box(g, 3, 1, 1.6, mat('#a16207'), x, 0, z);
  for (const [dx, dz] of [[-1.4, -0.7], [1.4, -0.7], [-1.4, 0.7], [1.4, 0.7]]) box(g, 0.12, 2.6, 0.12, mat('#78350f'), x + dx, 0, z + dz);
  for (let i = 0; i < 5; i++) box(g, 0.64, 0.12, 2, mat(i % 2 ? '#fffaf0' : c), x - 1.28 + i * 0.64, 2.6, z);
  for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), mat(colors[(seed + i) % colors.length])); f.position.set(x - 1 + (i % 3) * 1, 1.15, z - 0.3 + Math.floor(i / 3) * 0.6); g.add(f); }
}

function tree(g: THREE.Group, x: number, z: number, seed: number) {
  cyl(g, 0.18, 0.26, 2.2, mat('#7c5a3a'), x, 0, z, 6);
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 + (seed % 3) * 0.2, 0), mat(['#4d7c0f', '#3f6212', '#65a30d'][seed % 3], { rough: 0.9 }));
  crown.position.set(x, 3.2, z); crown.castShadow = true; g.add(crown);
}

export function buildMarket(grid: Grid, apps: MarketApp[], now = Date.now()): Market | null {
  if (!apps.length) return null;
  const g = new THREE.Group();
  const ticks: Market['ticks'] = [];
  const W = grid.width, D = grid.depth;
  const sx = grid.lineX(Math.floor(grid.blocksX / 2));
  const z0 = D / 2 + 7;

  const xs: number[] = [];
  for (let x = -W / 2 + 8; x <= W / 2 - 8; x += LOT) if (Math.abs(x - sx) > 9) xs.push(x);
  const perStreet = xs.length * 2;
  const streets = Math.max(1, Math.ceil(apps.length / perStreet));
  const zEnd = z0 + streets * BAND;
  const bounds: Rect = { x0: -W / 2 - 3, z0: D / 2 + 3, x1: W / 2 + 3, z1: zEnd + 2 };

  // Warm stone underfoot, and lanes of brick.
  const base = new THREE.Mesh(new THREE.BoxGeometry(bounds.x1 - bounds.x0, 5, bounds.z1 - bounds.z0), mat('#a89a86'));
  base.position.set(0, -2.6, (bounds.z0 + bounds.z1) / 2);
  g.add(base);
  box(g, bounds.x1 - bounds.x0, 0.2, bounds.z1 - bounds.z0, mat('#d9cdb8', { rough: 0.95 }), 0, -0.1, (bounds.z0 + bounds.z1) / 2);
  const roads: Rect[] = [];
  const lane = mat('#b9826a', { rough: 0.9 });
  const edge = mat('#efe6d6', { rough: 0.9 });
  const lastRoad = z0 + (streets - 1) * BAND + 16;
  const spine: Rect = { x0: sx - ROAD / 2 - 0.5, z0: grid.lineZ(grid.blocksZ) - ROAD / 2, x1: sx + ROAD / 2 + 0.5, z1: lastRoad + 3.5 };
  roads.push(spine);
  box(g, spine.x1 - spine.x0, 0.06, spine.z1 - (D / 2 + 3), lane, sx, 0.1, (D / 2 + 3 + spine.z1) / 2);
  const slots: { x: number; z: number; facing: 1 | -1; street: number }[] = [];
  // String lights strung across each lane, glowing at night.
  const bulbA = glow('#fde68a', 1.4), bulbB = glow('#fca5a5', 1.2), bulbC = glow('#a5f3fc', 1.2);
  const bulbGeo = new THREE.SphereGeometry(0.14, 6, 4);
  for (let s = 0; s < streets; s++) {
    const zr = z0 + s * BAND + 16;
    const r: Rect = { x0: bounds.x0 + 1, z0: zr - 3.5, x1: bounds.x1 - 1, z1: zr + 3.5 };
    roads.push(r);
    box(g, r.x1 - r.x0, 0.06, 7, lane, 0, 0.1, zr);
    for (const side of [-1, 1]) box(g, r.x1 - r.x0, 0.1, 0.4, edge, 0, 0.1, zr + side * 3.7);
    for (const x of xs) {
      slots.push({ x, z: zr - 10.2, facing: 1, street: s });
      slots.push({ x, z: zr + 10.2, facing: -1, street: s });
    }
    // Lamp posts along the lane with lights strung between them, zigzagging across.
    let prev: THREE.Vector3 | null = null;
    let k = 0;
    for (let x = r.x0 + 4; x < r.x1 - 2; x += LOT / 2, k++) {
      if (Math.abs(x - sx) < 5) { prev = null; continue; }
      const side = k % 2 ? 1 : -1;
      const pz = zr + side * 4.4;
      cyl(g, 0.1, 0.12, 5, mat('#334155', { metal: 0.4 }), x, 0, pz, 6);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), glow('#fef3c7', 1.6)); lamp.position.set(x, 5.1, pz); g.add(lamp);
      const here = new THREE.Vector3(x, 4.8, pz);
      if (prev) {
        for (let i = 1; i < 8; i++) {
          const f = i / 8, sag = Math.sin(f * Math.PI) * 0.8;
          const b = new THREE.Mesh(bulbGeo, [bulbA, bulbB, bulbC][i % 3]);
          b.position.set(prev.x + (here.x - prev.x) * f, prev.y + (here.y - prev.y) * f - sag, prev.z + (here.z - prev.z) * f);
          g.add(b);
        }
      }
      prev = here;
    }
    // Stalls and trees in the gaps between shops.
    xs.forEach((x, i) => {
      if (i % 3 === 1) { stall(g, x + LOT / 2, zr - 5.6, i + s); stall(g, x + LOT / 2, zr + 5.6, i + s + 3); }
      else { tree(g, x + LOT / 2, zr - 5.4, i + s); tree(g, x + LOT / 2, zr + 5.4, i + s + 1); }
    });
  }
  slots.sort((a, b) => a.street - b.street || Math.abs(a.x - sx) - Math.abs(b.x - sx) || a.facing - b.facing || a.x - b.x);

  // The gate: two stone pillars, a painted sign and a fountain just inside.
  const archZ = D / 2 + 5;
  const stone = mat('#e7dccb', { rough: 0.9 });
  for (const side of [-1, 1]) { box(g, 1.2, 8.4, 1.2, stone, sx + side * 5.4, 0, archZ); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), glow('#fde68a', 0.9)); cap.position.set(sx + side * 5.4, 9, archZ); g.add(cap); }
  box(g, 11.6, 0.5, 1, mat('#9d174d'), sx, 7.4, archZ);
  const archSign = sign('THE MARKET', 10.4, 2, '#fffaf0', '#9d174d');
  archSign.position.set(sx, 8.1, archZ + 0.52);
  g.add(archSign);
  const back = archSign.clone(); back.rotation.y = Math.PI; back.position.z = archZ - 0.52; g.add(back);
  const fz = archZ + 9, fx = sx + 12;
  cyl(g, 3, 3.2, 0.8, stone, fx, 0, fz, 24);
  cyl(g, 2.6, 2.6, 0.1, mat('#38bdf8', { rough: 0.1, metal: 0.2 }), fx, 0.75, fz, 24);
  cyl(g, 0.4, 0.6, 2.4, stone, fx, 0.8, fz, 10);
  const water = dyn(new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshStandardMaterial({ color: '#bae6fd', transparent: true, opacity: 0.7, roughness: 0.1 })));
  water.position.set(fx, 3.4, fz); g.add(water);
  ticks.push((t) => { const s = 1 + Math.sin(t * 3) * 0.12; water.scale.set(s, 1 / s, s); });

  const lots: MarketLot[] = [];
  apps.forEach((app, i) => {
    const slot = slots[i];
    if (!slot) return;
    const c = shop(app, ticks, now);
    c.group.position.set(slot.x, 0.05, slot.z);
    c.group.rotation.y = slot.facing === 1 ? 0 : Math.PI;
    g.add(c.group);
    lots.push({
      app,
      group: c.group,
      center: { x: slot.x, z: slot.z },
      door: { x: slot.x, z: slot.z + slot.facing * (c.half + 2.4) },
      top: c.top,
      footprint: { x0: slot.x - c.half - 0.3, z0: slot.z - c.half - 0.3, x1: slot.x + c.half + 0.3, z1: slot.z + c.half + 0.3 },
    });
  });

  // A couple of delivery carts trundling down the lanes.
  for (let i = 0; i < Math.min(4, streets * 2); i++) {
    const s = i % streets;
    const zr = z0 + s * BAND + 16 + (i % 2 ? 1.4 : -1.4);
    const cart = dyn(new THREE.Group());
    box(cart, 2.2, 0.9, 1.2, mat(['#f59e0b', '#10b981', '#3b82f6', '#ec4899'][i % 4], { rough: 0.5 }), 0, 0.35, 0);
    box(cart, 2.4, 0.1, 1.4, mat('#fffaf0'), 0, 1.6, 0);
    for (const dx of [-0.7, 0.7]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.15, 10), mat('#1f2937')); wh.rotation.x = Math.PI / 2; wh.position.set(dx, 0.35, 0.65); cart.add(wh); }
    g.add(cart);
    const dir = i % 2 ? 1 : -1;
    const span = bounds.x1 - bounds.x0 - 6;
    const speed = 4 + (i % 3);
    ticks.push((t) => {
      const k = ((t * speed + i * 41) % span) - span / 2;
      cart.position.set(dir * k, 0.1, zr);
      cart.rotation.y = dir === 1 ? 0 : Math.PI;
    });
  }

  return { group: g, lots, ticks, roads, bounds, gate: { x: sx, z: archZ } };
}
