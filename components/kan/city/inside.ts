import * as THREE from 'three';
import { hash as signedHash } from '@/lib/kan/city/layout';
import { DEFAULT_FEATURES, planInterior, roomAt, type Feature, type Floor, type InteriorStyle, type Plan, type PlanRoom, type Seg, type Slot } from '@/lib/kan/city/interior';
import type { ChannelBoard } from '@/lib/kan/city/channel';
import type { PlotTheme } from '@/lib/kan/city/style';
import { botFigure, kanFigure, mat, sign } from './models';
import { THEME_COLORS } from './themes';

/**
 * Inside a building. Each column is a room with its cards on the walls (pinned up,
 * shelved as books, or framed), the channel's apps are arcade cabinets, and its
 * resident works the front desk.
 *
 * Walking around is the point, so nothing may get in the way of seeing: there's no
 * ceiling, the camera looks down from behind you, and any wall between it and you
 * drops to a stub (the dollhouse cutaway) and comes back up once you've passed. The
 * middle of every room stays clear; furniture keeps to the walls and corners.
 *
 * You walk with the keys or the stick (relative to the screen, not to where you
 * face), or tap the floor and you walk there by yourself. Drag to turn the camera.
 */

export type InsidePick = { kind: 'card'; id: string } | { kind: 'app'; id: string } | { kind: 'bot'; id: string } | { kind: 'exit' };
export interface InsideNear { kind: 'card' | 'app' | 'bot' | 'exit'; id: string; name: string }
export interface InsideApp { id: string; title: string; thumbnail: string | null }
export interface InsideOf {
  channelId: string;
  name: string;
  resident: string;
  theme: PlotTheme | null;
  walls: string | null;
  style: InteriorStyle;
}
export interface InsideCallbacks {
  onPick(p: InsidePick): void;
  onNear(n: InsideNear | null): void;
  /** The room you walked into: its name and how many cards it has. */
  onRoom(room: { name: string; count: number | null; kind: PlanRoom['kind'] }): void;
}

/** Always a positive whole number, so it can index, shift and size things safely. */
const hash = (s: string) => signedHash(s) >>> 0;

const WALL_H = 2.8;
const STEP = 0.25;
const BODY_R = 0.38;
const CAM_BACK = 6.2, CAM_UP = 7.6;
const BOT_SCALE = 1;

type Vec = { x: number; z: number };

interface Wall { seg: Seg; group: THREE.Group; attach: THREE.Group; cut: number; holdCut: number }
interface Thing { kind: 'card' | 'app'; id: string; title: string; x: number; z: number; nx: number; nz: number; obj: THREE.Object3D }
interface Mover {
  id: string;
  name: string;
  fig: ReturnType<typeof botFigure>;
  x: number; z: number; heading: number;
  path: Vec[];
  wait: number;
  home: Vec | null;
  label: HTMLDivElement;
  bubble: HTMLDivElement;
  sayUntil: number;
  guest: boolean;
}

// ---------- Textures ----------

const floorTex = new Map<Floor, THREE.Texture>();
function floorTexture(kind: Floor): THREE.Texture {
  const hit = floorTex.get(kind);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  const r = (n: number) => { let s = n * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
  const rand = r(kind.length * 17);
  if (kind === 'wood') {
    for (let i = 0; i < 8; i++) {
      x.fillStyle = ['#b98a5e', '#a77a51', '#c29468', '#b08257'][i % 4];
      x.fillRect(0, i * 32, 256, 32);
      x.fillStyle = 'rgba(60,35,15,.35)';
      x.fillRect(0, i * 32, 256, 2);
      x.fillRect(((i * 97) % 200) + 20, i * 32, 2, 32);
    }
  } else if (kind === 'tile') {
    x.fillStyle = '#e7ecef'; x.fillRect(0, 0, 256, 256);
    x.fillStyle = '#c9d1d8';
    for (let i = 0; i <= 4; i++) { x.fillRect(i * 64 - 1, 0, 3, 256); x.fillRect(0, i * 64 - 1, 256, 3); }
  } else if (kind === 'carpet') {
    x.fillStyle = '#8f7fb5'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2500; i++) { x.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.07)'; x.fillRect(rand() * 256, rand() * 256, 2, 2); }
  } else if (kind === 'marble') {
    x.fillStyle = '#f3f1ee'; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(140,135,150,.35)'; x.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) { x.beginPath(); x.moveTo(rand() * 256, 0); for (let y = 0; y <= 256; y += 32) x.lineTo(rand() * 256, y); x.stroke(); }
    x.fillStyle = 'rgba(160,150,170,.25)';
    for (let i = 0; i <= 2; i++) { x.fillRect(i * 128 - 1, 0, 2, 256); x.fillRect(0, i * 128 - 1, 256, 2); }
  } else if (kind === 'grass') {
    x.fillStyle = '#7cbf5e'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3000; i++) { x.fillStyle = rand() > 0.5 ? '#8fd06c' : '#6aa94f'; x.fillRect(rand() * 256, rand() * 256, 2, 4); }
  } else {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#1d1b22' : '#f4f2ee'; x.fillRect(i * 64, j * 64, 64, 64); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  floorTex.set(kind, t);
  return t;
}

let spineTex: THREE.Texture | null = null;
/** A row of books, for filling out shelves. */
function spines(): THREE.Texture {
  if (spineTex) return spineTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d')!;
  const colors = ['#7c3aed', '#db2777', '#0284c7', '#059669', '#d97706', '#b91c1c', '#4b5563', '#a16207', '#0f766e', '#6d28d9'];
  let at = 0, i = 0;
  while (at < 256) {
    const w = 8 + ((i * 37) % 11);
    const top = (i * 13) % 14;
    x.fillStyle = colors[(i * 7) % colors.length];
    x.fillRect(at, top, w - 1, 64 - top);
    x.fillStyle = 'rgba(255,255,255,.35)';
    x.fillRect(at + 2, top + 10, w - 5, 2);
    at += w; i++;
  }
  spineTex = new THREE.CanvasTexture(c);
  spineTex.colorSpace = THREE.SRGBColorSpace;
  return spineTex;
}

const PAPER = ['#fff7ad', '#ffd6e7', '#c9f2ff', '#d8ffcf', '#ffe0b8', '#e8dcff'];
const ART = [['#7c3aed', '#f472b6'], ['#0ea5e9', '#22d3ee'], ['#f97316', '#facc15'], ['#10b981', '#a3e635'], ['#e11d48', '#fb7185'], ['#4f46e5', '#38bdf8']];

function wrap(x: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (x.measureText(next).width <= maxW) { line = next; continue; }
    if (line) lines.push(line);
    line = w;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s*\S*$/, '')}…`;
  return lines;
}

const TILE_W = 256, TILE_H = 192, ATLAS = 1024;
const PER_ATLAS = (ATLAS / TILE_W) * Math.floor(ATLAS / TILE_H);

type Card = ChannelBoard['columns'][number]['cards'][number];

/** Cards drawn onto shared textures, twenty to a sheet, as notes or as pictures. */
function cardAtlas(cards: Card[], look: 'note' | 'art'): { tex: THREE.Texture[]; uv: (i: number) => [number, number, number, number] } {
  const tex: THREE.Texture[] = [];
  const cols = ATLAS / TILE_W;
  for (let s = 0; s * PER_ATLAS < cards.length; s++) {
    const c = document.createElement('canvas');
    c.width = c.height = ATLAS;
    const x = c.getContext('2d')!;
    cards.slice(s * PER_ATLAS, (s + 1) * PER_ATLAS).forEach((card, i) => {
      const ox = (i % cols) * TILE_W, oy = Math.floor(i / cols) * TILE_H;
      const h = hash(card.id);
      if (look === 'note') {
        x.fillStyle = PAPER[h % PAPER.length];
        x.fillRect(ox, oy, TILE_W, TILE_H);
        x.fillStyle = 'rgba(0,0,0,.06)';
        x.fillRect(ox, oy + TILE_H - 10, TILE_W, 10);
        x.fillStyle = '#2b2233';
        x.font = '700 25px ui-sans-serif, system-ui, sans-serif';
        wrap(x, card.title || 'Untitled', TILE_W - 28, 4).forEach((l, j) => x.fillText(l, ox + 14, oy + 36 + j * 29));
      } else {
        const [a, b] = ART[h % ART.length];
        const g = x.createLinearGradient(ox, oy, ox + TILE_W, oy + TILE_H);
        g.addColorStop(0, a); g.addColorStop(1, b);
        x.fillStyle = g;
        x.fillRect(ox, oy, TILE_W, TILE_H);
        for (let k = 0; k < 4; k++) {
          x.fillStyle = `rgba(255,255,255,${0.12 + ((h >>> k) % 3) * 0.06})`;
          x.beginPath();
          x.arc(ox + ((h >>> (k * 3)) % TILE_W), oy + ((h >>> (k * 4)) % TILE_H), 18 + ((h >>> k) % 40), 0, Math.PI * 2);
          x.fill();
        }
        x.fillStyle = 'rgba(15,10,30,.55)';
        x.fillRect(ox, oy + TILE_H - 82, TILE_W, 82);
        x.fillStyle = '#fff';
        x.font = '700 23px ui-sans-serif, system-ui, sans-serif';
        wrap(x, card.title || 'Untitled', TILE_W - 24, 2).forEach((l, j) => x.fillText(l, ox + 12, oy + TILE_H - 50 + j * 27));
      }
      // What's on it: a thread, tasks, an app.
      const bits = [card.messageCount ? `💬 ${card.messageCount}` : '', card.taskCount ? `✓ ${card.tasksDone}/${card.taskCount}` : '', card.hasApp ? '🎮' : ''].filter(Boolean).join('   ');
      if (bits) {
        x.font = '600 17px ui-sans-serif, system-ui, sans-serif';
        x.fillStyle = look === 'note' ? 'rgba(43,34,51,.65)' : 'rgba(255,255,255,.9)';
        x.fillText(bits, ox + 14, look === 'note' ? oy + TILE_H - 20 : oy + 26);
      }
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    tex.push(t);
  }
  return {
    tex,
    uv: (i) => {
      const j = i % PER_ATLAS;
      const u0 = ((j % cols) * TILE_W) / ATLAS, v1 = 1 - (Math.floor(j / cols) * TILE_H) / ATLAS;
      return [u0, v1 - TILE_H / ATLAS, u0 + TILE_W / ATLAS, v1];
    },
  };
}

function tilePlane(w: number, h: number, uv: [number, number, number, number]) {
  const g = new THREE.PlaneGeometry(w, h);
  const [u0, v0, u1, v1] = uv;
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u1, v1, u0, v0, u1, v0], 2));
  return g;
}

/** An arcade screen: the app's name, until its thumbnail loads. */
function screenTexture(title: string, tone: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 192;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 256, 192);
  g.addColorStop(0, '#120a24'); g.addColorStop(1, tone);
  x.fillStyle = g; x.fillRect(0, 0, 256, 192);
  x.fillStyle = '#fff';
  x.font = '800 28px ui-sans-serif, system-ui, sans-serif';
  x.textAlign = 'center';
  wrap(x, title, 220, 3).forEach((l, j, all) => x.fillText(l, 128, 96 - (all.length - 1) * 16 + j * 32));
  x.font = '700 16px ui-sans-serif, system-ui, sans-serif';
  x.fillStyle = '#ffd23f';
  x.fillText('▶ PRESS TO PLAY', 128, 176);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- Little builders ----------

function box(g: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
function cyl(g: THREE.Object3D, rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 14) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}
function ball(g: THREE.Object3D, r: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}
const glow = (color: string, intensity = 1.4) => mat(color, { emissive: color, intensity });

/** A corner piece that suits the building's theme. Each stands in a circle of about 0.5. */
function prop(kind: string, seed: number, tick: (f: (t: number) => void) => void): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'plant') {
    cyl(g, 0.28, 0.22, 0.5, mat('#c26d4a'), 0, 0.25, 0);
    ball(g, 0.42, mat('#4f9a5a'), 0, 0.85, 0);
    ball(g, 0.3, mat('#5fae6b'), 0.18, 1.15, 0.05);
  } else if (kind === 'flowers') {
    cyl(g, 0.3, 0.24, 0.45, mat('#e2a46b'), 0, 0.22, 0);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      cyl(g, 0.02, 0.02, 0.6, mat('#3f8a3c'), Math.cos(a) * 0.12, 0.7, Math.sin(a) * 0.12, 5);
      ball(g, 0.11, mat(['#f472b6', '#facc15', '#fb7185', '#a78bfa', '#fff'][i]), Math.cos(a) * 0.14, 1.02, Math.sin(a) * 0.14);
    }
  } else if (kind === 'cat') {
    const bed = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.13, 8, 16), mat('#f28fae'));
    bed.rotation.x = Math.PI / 2; bed.position.y = 0.13; g.add(bed);
    const fur = mat(['#f2a65a', '#3a3a3a', '#e8e1d6'][seed % 3]);
    const body = ball(g, 0.27, fur, 0, 0.28, 0); body.scale.set(1.2, 0.75, 1);
    ball(g, 0.18, fur, 0.26, 0.42, 0);
    for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 4), fur); ear.position.set(0.3, 0.6, s * 0.08); g.add(ear); }
    tick((t) => { body.scale.y = 0.75 + Math.sin(t * 1.6 + seed) * 0.04; });
  } else if (kind === 'yarn') {
    const y = ball(g, 0.26, mat('#ff6fa8'), 0, 0.26, 0);
    const line = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.02, 4, 18), mat('#ffd0e3'));
    line.rotation.y = 0.7; line.position.y = 0.26; g.add(line);
    tick((t) => { y.rotation.y = t * 0.3; });
  } else if (kind === 'lollipop') {
    cyl(g, 0.04, 0.04, 1.4, mat('#ffffff'), 0, 0.7, 0, 6);
    const pop = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 20), mat(['#ff5fa2', '#5fd3b0', '#ffb347'][seed % 3]));
    pop.rotation.x = Math.PI / 2; pop.position.y = 1.55; pop.castShadow = true; g.add(pop);
    tick((t) => { pop.rotation.z = t * 0.6 + seed; });
  } else if (kind === 'gumdrop') {
    for (let i = 0; i < 3; i++) { const d = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.34, 10), mat(['#ff5fa2', '#7ee0b8', '#ffd23f'][i])); d.position.set((i - 1) * 0.3, 0.17, (i % 2) * 0.2); g.add(d); }
  } else if (kind === 'planet') {
    cyl(g, 0.06, 0.2, 1.1, mat('#3b3f6b'), 0, 0.55, 0, 8);
    const p = ball(g, 0.34, glow('#a78bfa', 0.6), 0, 1.4, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.04, 4, 24), glow('#fcd34d', 0.8));
    ring.rotation.x = 1.2; p.add(ring);
    tick((t) => { p.rotation.y = t * 0.5; });
  } else if (kind === 'rocket') {
    cyl(g, 0.22, 0.26, 1.0, mat('#f1f5f9'), 0, 0.7, 0);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 12), mat('#ef4444')); nose.position.y = 1.42; g.add(nose);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; box(g, 0.05, 0.4, 0.25, mat('#ef4444'), Math.cos(a) * 0.24, 0.3, Math.sin(a) * 0.24).rotation.y = -a; }
    ball(g, 0.08, glow('#38bdf8'), 0, 0.95, 0.22);
  } else if (kind === 'armor') {
    cyl(g, 0.2, 0.26, 0.9, mat('#a8b0bd', { metal: 0.6, rough: 0.35 }), 0, 0.75, 0);
    ball(g, 0.2, mat('#c3cad6', { metal: 0.6, rough: 0.3 }), 0, 1.38, 0);
    box(g, 0.05, 1.5, 0.05, mat('#6b4a2b'), 0.36, 0.75, 0);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 4), mat('#d6dbe3', { metal: 0.6 })); tip.position.set(0.36, 1.6, 0); g.add(tip);
    box(g, 0.5, 0.15, 0.4, mat('#6b6f78'), 0, 0.08, 0);
  } else if (kind === 'torch') {
    cyl(g, 0.08, 0.12, 1.3, mat('#5f6a7a'), 0, 0.65, 0, 6);
    const f = ball(g, 0.16, glow('#ff9a3c', 2), 0, 1.42, 0);
    tick((t) => { f.scale.setScalar(1 + Math.sin(t * 9 + seed) * 0.12); });
  } else if (kind === 'shell') {
    const s = ball(g, 0.3, mat('#ffd1dc'), 0, 0.2, 0); s.scale.set(1.2, 0.6, 1);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), mat('#ff8a5c')); star.scale.y = 0.25; star.position.set(0.32, 0.06, 0.22); g.add(star);
  } else if (kind === 'fishbowl') {
    cyl(g, 0.2, 0.25, 0.6, mat('#7c5a3c'), 0, 0.3, 0, 8);
    ball(g, 0.34, new THREE.MeshStandardMaterial({ color: '#9fe3ff', transparent: true, opacity: 0.45, roughness: 0.1 }), 0, 0.9, 0);
    const fish = ball(g, 0.08, glow('#ff8a1f', 0.6), 0, 0.9, 0); fish.scale.set(1.5, 1, 0.6);
    tick((t) => { fish.position.set(Math.cos(t + seed) * 0.15, 0.9, Math.sin(t + seed) * 0.15); fish.rotation.y = -t - seed; });
  } else if (kind === 'pumpkin') {
    const p = ball(g, 0.3, mat('#ff8a1f', { emissive: '#ff6a00', intensity: 0.35 }), 0, 0.26, 0); p.scale.y = 0.8;
    cyl(g, 0.04, 0.05, 0.14, mat('#3f6b2a'), 0, 0.55, 0, 5);
  } else if (kind === 'ghost') {
    const ghost = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.35, 4, 10), new THREE.MeshStandardMaterial({ color: '#f8f5ff', transparent: true, opacity: 0.85, emissive: new THREE.Color('#d9ccff'), emissiveIntensity: 0.4 }));
    ghost.add(b);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: '#1b1430' })); e.position.set(s * 0.08, 0.12, 0.2); ghost.add(e); }
    g.add(ghost);
    tick((t) => { ghost.position.y = 1.0 + Math.sin(t * 1.5 + seed) * 0.15; });
  } else if (kind === 'lamp') {
    cyl(g, 0.18, 0.22, 0.06, mat('#3a3340'), 0, 0.03, 0);
    cyl(g, 0.03, 0.03, 1.5, mat('#3a3340'), 0, 0.78, 0, 6);
    cyl(g, 0.18, 0.3, 0.36, glow('#ffe2b0', 1.2), 0, 1.6, 0);
  }
  return g;
}

/** Theme corner pieces, in pairs. */
const THEME_PROPS: Record<PlotTheme, [string, string]> = {
  cat: ['cat', 'yarn'], candy: ['lollipop', 'gumdrop'], garden: ['flowers', 'plant'], space: ['planet', 'rocket'],
  castle: ['armor', 'torch'], ocean: ['fishbowl', 'shell'], spooky: ['pumpkin', 'ghost'],
};

// ---------- The inside ----------

export class Inside {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.3, 200);
  private root = new THREE.Group();
  private plan!: Plan;
  private walls: Wall[] = [];
  private things: Thing[] = [];
  private pickables: THREE.Object3D[] = [];
  private ticks: ((t: number, dt: number) => void)[] = [];
  private anims: { obj: THREE.Object3D; delay: number; t: number; y: number; mode: 'drop' }[] = [];
  private grid: Uint8Array = new Uint8Array(0);
  private gw = 0;
  private gh = 0;
  private gx0 = 0;
  private gz0 = 0;
  private player: { fig: ReturnType<typeof botFigure>; x: number; z: number; heading: number; path: Vec[]; walk: number };
  private movers = new Map<string, Mover>();
  private camYaw = 0;
  private yawTarget = 0;
  private near: InsideNear | null = null;
  private nearT = 0;
  private room = '';
  private layer: HTMLDivElement;
  private hoverLabel: HTMLDivElement;
  private hovered: Thing | null = null;
  private kan: { obj: THREE.Group; pad: THREE.Mesh; bubble: HTMLDivElement; until: number } | null = null;
  private talking: string | null = null;
  private time = 0;
  private lights: THREE.Object3D[] = [];
  private party: THREE.PointLight[] = [];
  private textures: THREE.Texture[] = [];

  constructor(
    private of: InsideOf,
    private board: ChannelBoard,
    private apps: InsideApp[],
    labels: HTMLDivElement,
    private cb: InsideCallbacks,
    private boss: string,
  ) {
    this.scene.background = new THREE.Color('#15111d');
    this.scene.add(this.root);
    this.layer = document.createElement('div');
    this.layer.className = 'kc-in-labels';
    labels.appendChild(this.layer);
    this.hoverLabel = this.makeLabel('', 'kc-label kc-card');
    this.hoverLabel.style.display = 'none';
    const fig = botFigure(hash('you, the owner'));
    fig.group.scale.setScalar(BOT_SCALE);
    this.scene.add(fig.group);
    this.player = { fig, x: 0, z: 6.6, heading: Math.PI, path: [], walk: 0 };
    this.build(false);
    this.placeCamera(true);
  }

  // ---------- Public ----------

  /** New cards, apps or layout: rebuild around you. Furniture drops in when it's a redecoration. */
  update(board: ChannelBoard, apps: InsideApp[], style: InteriorStyle, theme: PlotTheme | null, walls: string | null) {
    const restyled = JSON.stringify(style) !== JSON.stringify(this.of.style) || theme !== this.of.theme || walls !== this.of.walls;
    const changed = restyled || JSON.stringify(board) !== JSON.stringify(this.board) || JSON.stringify(apps) !== JSON.stringify(this.apps);
    if (!changed) return;
    const was = { of: this.of, board: this.board, apps: this.apps };
    this.of = { ...this.of, style, theme, walls };
    this.board = board;
    this.apps = apps;
    try { this.build(restyled); } catch (err) {
      // Never take the page down over a room: go back to how it was.
      console.error('[city] inside', err);
      Object.assign(this, was);
      try { this.build(false); } catch { /* leave it as it is */ }
    }
  }

  /** You turned to talk with someone in here: they come over. Null when you're done. */
  talkTo(id: string | null) {
    this.talking = id;
    const m = id ? this.movers.get(id) : null;
    if (!m) return;
    const p = this.player;
    const f = { x: Math.sin(p.heading), z: Math.cos(p.heading) };
    const spot = this.nearestOpen(p.x + f.x * 1.7, p.z + f.z * 1.7);
    m.path = this.route(m, spot);
  }

  /** Another resident drops by. They come in the front door and find you. */
  invite(id: string, name: string, seed: number) {
    if (this.movers.has(id)) { this.say(id, `I’m right here, ${this.boss}!`); return; }
    const e = this.plan.entrance;
    const m = this.addMover(id, name, seed, { x: e.x, z: e.z + 1.2 }, null, true);
    m.path = [{ x: e.x, z: e.z - 1 }, ...this.route({ x: e.x, z: e.z - 1 }, this.nearestOpen(this.player.x + 1.4, this.player.z + 1.2))];
    m.wait = 6;
    this.say(id, `Hi ${this.boss}! Thanks for having me over.`);
  }

  guests() { return [...this.movers.values()].filter((m) => m.guest).map((m) => m.id); }

  /** A line over someone's head. */
  say(id: string, text: string) {
    const m = this.movers.get(id);
    if (!m) return;
    m.bubble.textContent = text.length > 140 ? `${text.slice(0, 137)}…` : text;
    m.sayUntil = performance.now() + Math.min(14_000, 3500 + text.length * 55);
  }

  /** Kan beams in to rearrange things, and says what it's doing; null sends it away. */
  kanHere(text: string | null, ms = 6000) {
    if (!text) { if (this.kan) this.kan.until = performance.now() + 600; return; }
    if (!this.kan) {
      const obj = kanFigure();
      obj.scale.setScalar(0.9);
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 1.1, 3.2, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: '#a78bfa', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      const lobby = this.plan.rooms.find((r) => r.kind === 'lobby')!.rect;
      const spot = this.nearestOpen((lobby.x0 + lobby.x1) / 2, lobby.z0 + 2.2);
      obj.position.set(spot.x, 0, spot.z);
      pad.position.set(spot.x, 1.6, spot.z);
      this.scene.add(obj, pad);
      const bubble = this.makeLabel('', 'kc-bubble kc-bubble-kan');
      this.kan = { obj, pad, bubble, until: 0 };
    }
    this.kan.bubble.textContent = text;
    this.kan.until = performance.now() + ms;
  }

  /** Turn the camera a quarter (or any amount) around you. */
  turn(by: number) { this.yawTarget += by; this.faceWall = null; }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.clear();
    this.player.fig.group.removeFromParent();
    for (const m of this.movers.values()) { m.label.remove(); m.bubble.remove(); }
    this.kan?.bubble.remove();
    this.layer.remove();
  }

  // ---------- Building it ----------

  private clear() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) m.geometry.dispose();
    });
    this.root.clear();
    for (const t of this.textures) t.dispose();
    this.textures = [];
    for (const l of this.lights) l.removeFromParent();
    this.lights = [];
    this.party = [];
    this.walls = [];
    this.things = [];
    this.pickables = [];
    this.ticks = [];
    this.anims = [];
  }

  private build(animate: boolean) {
    this.clear();
    const style = this.of.style;
    const cols = this.board.columns.map((c) => ({ id: c.id, name: c.name, cards: c.total }));
    const plan = planInterior({ columns: cols, apps: this.apps.length, style });
    this.plan = plan;
    const themed = this.of.theme ? THEME_COLORS[this.of.theme] : null;
    const wallColor = style.walls ?? this.of.walls ?? themed?.walls ?? '#efe7dc';
    const trim = themed?.roof ?? '#8b6fd6';
    const floor = style.floor ?? (this.of.theme === 'garden' ? 'grass' : this.of.theme === 'castle' ? 'marble' : 'wood');
    const features = new Set<Feature>(style.features ?? DEFAULT_FEATURES);
    const tick = (f: (t: number) => void) => this.ticks.push((t) => f(t));

    // Floors: the building's own, a rug in each room's color, grass in a courtyard.
    for (const r of plan.rooms) {
      const w = r.rect.x1 - r.rect.x0, d = r.rect.z1 - r.rect.z0;
      const kind: Floor = r.kind === 'court' ? 'grass' : r.kind === 'arcade' ? 'checker' : floor;
      const geo = new THREE.PlaneGeometry(w, d);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 2.5, uv.getY(i) * d / 2.5);
      const f = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: floorTexture(kind), roughness: kind === 'marble' ? 0.35 : 0.85 }));
      f.rotation.x = -Math.PI / 2;
      f.position.set((r.rect.x0 + r.rect.x1) / 2, r.kind === 'column' || r.kind === 'arcade' ? 0.004 : 0, (r.rect.z0 + r.rect.z1) / 2);
      f.receiveShadow = true;
      f.userData.floor = true;
      this.root.add(f);
      if (r.kind === 'column') {
        const rug = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(1, w - 2.6), Math.max(1, d - 2.6)), mat(r.color, { rough: 1 }));
        rug.rotation.x = -Math.PI / 2;
        rug.position.set((r.rect.x0 + r.rect.x1) / 2, 0.012, (r.rect.z0 + r.rect.z1) / 2);
        rug.receiveShadow = true;
        this.root.add(rug);
      }
    }
    // Outside the front door: a step and a mat, so the way out is obvious.
    const e = plan.entrance;
    const mat0 = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.2), mat('#7a4b35'));
    mat0.rotation.x = -Math.PI / 2;
    mat0.position.set(e.x, 0.01, e.z + 0.7);
    this.root.add(mat0);
    const out = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.3, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
    out.position.set(e.x, 1.15, e.z + 0.2);
    out.userData.pick = { kind: 'exit' } satisfies InsidePick;
    this.root.add(out);
    this.pickables.push(out);
    const exitSign = sign('Exit', 1.1, 0.34, '#16a34a', '#ffffff');
    exitSign.position.set(e.x, 2.55, e.z - 0.02);
    exitSign.rotation.y = Math.PI;
    this.root.add(exitSign);

    // Walls, each a group that can drop to a stub when it's in your way.
    const wallMat = mat(wallColor, { rough: 0.9 });
    const trimMat = mat(trim);
    for (const s of plan.walls) {
      const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
      const g = new THREE.Group();
      g.position.set((s.x0 + s.x1) / 2, 0, (s.z0 + s.z1) / 2);
      if (s.x0 === s.x1) g.rotation.y = Math.PI / 2;
      const body = box(g, len + 0.2, WALL_H, 0.2, wallMat, 0, WALL_H / 2, 0);
      body.castShadow = false;
      box(g, len + 0.24, 0.12, 0.26, trimMat, 0, WALL_H, 0).castShadow = false;
      box(g, len + 0.22, 0.16, 0.24, mat('#5b4636'), 0, 0.08, 0).castShadow = false;
      const attach = new THREE.Group();
      g.add(attach);
      // What hangs on the wall lives in the room's own frame, not the turned wall's.
      attach.rotation.y = -g.rotation.y;
      attach.position.set(0, 0, 0);
      this.root.add(g);
      this.walls.push({ seg: s, group: g, attach, cut: 0, holdCut: 0 });
    }
    for (const s of plan.dividers) {
      const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
      const g = new THREE.Group();
      g.position.set((s.x0 + s.x1) / 2, 0, (s.z0 + s.z1) / 2);
      if (s.x0 === s.x1) g.rotation.y = Math.PI / 2;
      box(g, len, 1.1, 0.24, wallMat, 0, 0.55, 0);
      box(g, len + 0.04, 0.08, 0.3, trimMat, 0, 1.12, 0);
      this.root.add(g);
    }

    // What fills each room.
    const obstacles: { x: number; z: number; r: number }[] = [];
    const rects: { x0: number; z0: number; x1: number; z1: number }[] = [];
    const cards = new Map(this.board.columns.map((c) => [c.id, c.cards]));
    for (const r of plan.rooms) {
      if (r.kind === 'column') this.fillColumn(r, cards.get(r.columnId!) ?? [], rects);
      if (r.kind === 'arcade') this.fillArcade(r, rects);
      if (r.door) {
        // Its name over the door, with how many cards are in it.
        const label = r.kind === 'column' ? `${r.name} · ${r.count}` : r.name;
        const s = sign(label, 2.2, 0.42, r.color, '#ffffff');
        const lift = plan.plan === 'open' ? 0 : 0.14;
        s.position.set(r.door.x + r.door.nx * lift, plan.plan === 'open' ? WALL_H + 0.45 : 2.45, r.door.z + r.door.nz * lift);
        s.rotation.y = Math.atan2(r.door.nx, r.door.nz);
        this.root.add(s);
        if (plan.plan !== 'open') {
          // A second face for inside the room.
          const back = s.clone();
          back.position.set(r.door.x - r.door.nx * 0.14, 2.45, r.door.z - r.door.nz * 0.14);
          back.rotation.y = Math.atan2(-r.door.nx, -r.door.nz);
          this.root.add(back);
        }
      }
      // Corner pieces, out of the way.
      if (r.kind === 'column' || r.kind === 'arcade' || r.kind === 'lobby') {
        const kinds = this.of.theme ? THEME_PROPS[this.of.theme] : features.has('plants') ? ['plant', 'flowers'] : features.has('lamps') ? ['lamp', 'lamp'] : null;
        if (kinds && plan.plan !== 'open') {
          const inset = 0.85;
          const corners = [[r.rect.x0 + inset, r.rect.z0 + inset], [r.rect.x1 - inset, r.rect.z0 + inset], [r.rect.x0 + inset, r.rect.z1 - inset], [r.rect.x1 - inset, r.rect.z1 - inset]];
          corners.forEach(([x, z], i) => {
            if (r.kind === 'lobby' && z > r.rect.z1 - 2) return; // keep the way in clear
            if (r.kind === 'lobby' && Math.abs(x) < 3) return;
            if (r.door && Math.hypot(x - r.door.x, z - r.door.z) < 2.2) return;
            const p = prop(kinds[i % 2], hash(`${r.id}${i}`), tick);
            p.position.set(x, 0, z);
            p.rotation.y = Math.atan2((r.rect.x0 + r.rect.x1) / 2 - x, (r.rect.z0 + r.rect.z1) / 2 - z);
            this.root.add(p);
            obstacles.push({ x, z, r: 0.55 });
          });
        }
      }
    }
    this.fillLobby(plan, features, obstacles, rects, tick);

    // Light.
    const L = style.light ?? (this.of.theme === 'spooky' ? 'cozy' : 'warm');
    const hemi = new THREE.HemisphereLight(
      L === 'daylight' ? '#eef6ff' : L === 'cozy' ? '#ffcf9a' : L === 'party' ? '#8c7cff' : '#fff1dc',
      L === 'party' ? '#2a1a4a' : '#7a6a58',
      L === 'cozy' ? 0.75 : L === 'party' ? 0.85 : L === 'daylight' ? 1.7 : 1.45,
    );
    const sun = new THREE.DirectionalLight(L === 'daylight' ? '#ffffff' : '#ffe6c4', L === 'cozy' ? 0.7 : L === 'party' ? 0.5 : L === 'daylight' ? 2.1 : 1.6);
    const b = plan.bounds;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    sun.position.set(cx + 8, 22, cz + 12);
    sun.target.position.set(cx, 0, cz);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const half = Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2 + 4;
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 70 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0008;
    this.scene.add(hemi, sun, sun.target);
    this.lights.push(hemi, sun, sun.target);
    if (L === 'cozy' || features.has('lamps')) {
      for (const r of plan.rooms.filter((x) => x.kind === 'lobby' || x.kind === 'column').slice(0, 4)) {
        const pl = new THREE.PointLight('#ffc98a', L === 'cozy' ? 9 : 4, 9, 1.6);
        pl.position.set((r.rect.x0 + r.rect.x1) / 2, 2.4, (r.rect.z0 + r.rect.z1) / 2);
        this.scene.add(pl);
        this.lights.push(pl);
      }
    }
    if (L === 'party' || features.has('disco')) {
      for (const [i, c] of ['#ff3cac', '#38bdf8', '#facc15'].entries()) {
        const pl = new THREE.PointLight(c, 14, 14, 1.4);
        pl.userData.phase = i * 2.1;
        this.scene.add(pl);
        this.lights.push(pl);
        this.party.push(pl);
      }
    }

    this.makeGrid(obstacles, rects);
    // Keep you where you were, if that's still somewhere to stand.
    if (!this.open(this.player.x, this.player.z)) { const s = this.nearestOpen(this.player.x, this.player.z); this.player.x = s.x; this.player.z = s.z; }
    this.player.path = [];
    this.placeResident();
    for (const m of this.movers.values()) {
      if (!this.open(m.x, m.z)) { const s = this.nearestOpen(m.x, m.z); m.x = s.x; m.z = s.z; }
      m.path = [];
    }
    this.room = '';

    if (animate) {
      // Rearranged: walls grow back up and everything else drops into place, nearest first.
      for (const w of this.walls) w.cut = 0.05;
      for (const o of this.root.children) {
        if (o.userData.floor || this.walls.some((w) => w.group === o)) continue;
        const d = Math.hypot(o.position.x - this.player.x, o.position.z - this.player.z);
        this.anims.push({ obj: o, delay: Math.min(1.1, d * 0.05), t: 0, y: o.position.y, mode: 'drop' });
        o.position.y += 7;
      }
    }
  }

  /** A column's room: its cards on the walls, the way the room says to show them. */
  private fillColumn(r: PlanRoom, cards: Card[], rects: { x0: number; z0: number; x1: number; z1: number }[]) {
    const shown = cards.slice(0, r.shown);
    const display = r.display ?? 'board';
    const atlas = display === 'shelves' ? null : cardAtlas(shown, display === 'gallery' ? 'art' : 'note');
    const mats = atlas?.tex.map((t) => { this.textures.push(t); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }); }) ?? [];
    let i = 0;
    for (const s of r.slots) {
      if (i >= shown.length) break;
      const wall = this.wallFor(s);
      const parent = wall?.attach ?? this.root;
      const base = new THREE.Group();
      // Into the wall's frame: the attach group undoes the wall's turn, so this is just a shift.
      const at = wall ? new THREE.Vector3(s.x, 0, s.z).sub(wall.group.position) : new THREE.Vector3(s.x, 0, s.z);
      base.position.copy(at);
      base.rotation.y = Math.atan2(s.nx, s.nz);
      parent.add(base);
      if (display === 'board') {
        box(base, 0.98, 1.62, 0.06, mat('#c9955e'), 0, 1.6, 0.13).castShadow = false;
        for (let k = 0; k < 2 && i < shown.length; k++, i++) {
          const card = shown[i];
          const note = new THREE.Mesh(tilePlane(0.82, 0.62, atlas!.uv(i)), mats[Math.floor(i / PER_ATLAS)]);
          note.position.set(0, 2.0 - k * 0.78, 0.17);
          note.rotation.z = ((hash(card.id) % 7) - 3) * 0.012;
          base.add(note);
          ball(base, 0.035, mat('#e11d48'), 0, 2.27 - k * 0.78, 0.19);
          this.addThing('card', card.id, card.title, s, note);
        }
      } else if (display === 'gallery') {
        for (let k = 0; k < 2 && i < shown.length; k++, i++) {
          const card = shown[i];
          const frame = box(base, 0.9, 0.7, 0.06, mat(hash(card.id) % 2 ? '#d4a017' : '#2b2233', { metal: 0.3, rough: 0.5 }), 0, 1.98 - k * 0.86, 0.14);
          frame.castShadow = false;
          const art = new THREE.Mesh(tilePlane(0.8, 0.6, atlas!.uv(i)), mats[Math.floor(i / PER_ATLAS)]);
          art.position.set(0, 1.98 - k * 0.86, 0.175);
          base.add(art);
          this.addThing('card', card.id, card.title, s, art);
        }
      } else {
        // A bookcase: the cards are the bright books; the rest is filler.
        const wood = mat('#6b4a2b');
        box(base, 1.0, 2.2, 0.08, wood, 0, 1.1, 0.14);
        for (const x of [-0.48, 0.48]) box(base, 0.05, 2.2, 0.42, wood, x, 1.1, 0.33);
        for (let k = 0; k < 5; k++) box(base, 0.96, 0.05, 0.42, wood, 0, 0.06 + k * 0.52, 0.33);
        const filler = new THREE.MeshStandardMaterial({ map: spines(), roughness: 0.8 });
        for (let k = 0; k < 4; k++) {
          const want = Math.min(3, shown.length - i);
          const fw = 0.9 - want * 0.15;
          if (fw > 0.1) {
            const row = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.36, 0.3), filler);
            row.position.set(0.45 - fw / 2, 0.27 + k * 0.52, 0.32);
            base.add(row);
          }
          for (let j = 0; j < want; j++, i++) {
            const card = shown[i];
            const h = hash(card.id);
            const book = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.4, 0.32), card.hasApp ? glow('#ff3cac', 0.5) : mat(['#7c3aed', '#db2777', '#0284c7', '#059669', '#d97706', '#b91c1c'][h % 6], { rough: 0.6 }));
            book.position.set(-0.4 + j * 0.15, 0.29 + k * 0.52, 0.33);
            book.rotation.z = j === want - 1 && fw > 0.2 ? -0.12 : 0;
            book.castShadow = true;
            base.add(book);
            this.addThing('card', card.id, card.title, s, book);
          }
        }
        rects.push(this.footprint(s, 0.5));
      }
    }
    // Nothing here yet: say so on the far wall, rather than leave a bare room.
    if (!shown.length && r.slots[0]) {
      const s0 = r.slots[0];
      const empty = sign('Empty for now', 1.8, 0.4, '#ffffff', '#6b6475');
      const wall = this.wallFor(s0);
      empty.position.set(s0.x + s0.nx * 0.13, 1.7, s0.z + s0.nz * 0.13);
      empty.rotation.y = Math.atan2(s0.nx, s0.nz);
      if (wall) { empty.position.sub(wall.group.position); wall.attach.add(empty); } else this.root.add(empty);
    }
    // More than fit: say so, by the door.
    if (r.count > r.shown && r.door) {
      const more = sign(`+${r.count - r.shown} more on the board`, 1.8, 0.3, '#2b2233', '#ffffff');
      const inward = { x: -r.door.nx, z: -r.door.nz };
      more.position.set(r.door.x + inward.x * 0.6, 0.9, r.door.z + inward.z * 0.6);
      more.rotation.y = Math.atan2(r.door.nx, r.door.nz);
      this.root.add(more);
    }
  }

  /** The arcade: a cabinet for each app, its screen showing the app. */
  private fillArcade(r: PlanRoom, rects: { x0: number; z0: number; x1: number; z1: number }[]) {
    const tones = ['#ff3cac', '#38bdf8', '#a3e635', '#facc15', '#a78bfa'];
    this.apps.slice(0, r.slots.length).forEach((app, i) => {
      const s = r.slots[i];
      const g = new THREE.Group();
      g.position.set(s.x + s.nx * 0.5, 0, s.z + s.nz * 0.5);
      g.rotation.y = Math.atan2(s.nx, s.nz);
      const tone = tones[i % tones.length];
      const body = mat('#1b1530', { rough: 0.5 });
      box(g, 0.86, 1.9, 0.7, body, 0, 0.95, -0.05);
      box(g, 0.9, 0.08, 0.74, glow(tone, 1.2), 0, 1.9, -0.05);
      const marquee = box(g, 0.86, 0.3, 0.12, glow(tone, 0.9), 0, 1.72, 0.3);
      marquee.castShadow = false;
      box(g, 0.8, 0.12, 0.3, mat('#2d2548'), 0, 0.98, 0.38);
      ball(g, 0.05, glow('#ef4444'), -0.15, 1.06, 0.4);
      ball(g, 0.05, glow('#facc15'), 0.05, 1.06, 0.4);
      cyl(g, 0.02, 0.02, 0.14, mat('#111'), 0.22, 1.1, 0.4, 5);
      const tex = screenTexture(app.title, tone);
      this.textures.push(tex);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.54), new THREE.MeshBasicMaterial({ map: tex }));
      screen.position.set(0, 1.38, 0.3);
      screen.rotation.x = -0.18;
      g.add(screen);
      if (app.thumbnail) {
        new THREE.TextureLoader().setCrossOrigin('anonymous').load(app.thumbnail, (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          this.textures.push(t);
          (screen.material as THREE.MeshBasicMaterial).map = t;
          (screen.material as THREE.MeshBasicMaterial).needsUpdate = true;
        }, undefined, () => {});
      }
      const pad = screen.material as THREE.MeshBasicMaterial;
      this.ticks.push((t) => { pad.color.setScalar(0.85 + Math.sin(t * 3 + i) * 0.15); });
      // On its wall, so it goes when the wall's cut away and never stands in your view.
      const wall = this.wallFor(s);
      if (wall) { g.position.sub(wall.group.position); wall.attach.add(g); } else this.root.add(g);
      this.addThing('app', app.id, app.title, s, g);
      rects.push(this.footprint(s, 0.95));
    });
  }

  private fillLobby(plan: Plan, features: Set<Feature>, obstacles: { x: number; z: number; r: number }[], rects: { x0: number; z0: number; x1: number; z1: number }[], tick: (f: (t: number) => void) => void) {
    const lobby = plan.rooms.find((r) => r.kind === 'lobby')!.rect;
    const L = lobby.x0, R = lobby.x1;
    // The front desk, where the resident works.
    const desk = new THREE.Group();
    desk.position.set(R - 2.6, 0, 4.3);
    box(desk, 2.6, 1.0, 0.8, mat('#7a5236', { rough: 0.6 }), 0, 0.5, 0);
    box(desk, 2.7, 0.08, 0.9, mat('#e8dccb'), 0, 1.04, 0);
    ball(desk, 0.09, mat('#d4a017', { metal: 0.6, rough: 0.3 }), 0.8, 1.13, 0.15);
    const nameplate = sign(this.of.name, 1.4, 0.26, '#2b2233', '#ffd23f');
    nameplate.position.set(-0.2, 0.62, 0.41);
    desk.add(nameplate);
    this.root.add(desk);
    rects.push({ x0: R - 3.9, z0: 3.9, x1: R - 1.3, z1: 4.7 });

    // The building's name, big, on the back wall.
    const title = sign(this.of.name, 2.6, 0.44, '#ffffff', '#2b2233');
    if (plan.plan === 'open') {
      title.scale.setScalar(1.6);
      title.position.set(0, WALL_H + 0.9, plan.bounds.z0 + 0.13);
      this.root.add(title);
    } else this.onWall(title, L + 2.6, 0, 2.2, 0.13);

    if (features.has('fireplace')) {
      const g = new THREE.Group();
      g.position.set(L + 0.45, 0, 3.4);
      g.rotation.y = Math.PI / 2;
      box(g, 2.0, 1.5, 0.5, mat('#9a8c80'), 0, 0.75, 0);
      box(g, 1.2, 0.8, 0.52, mat('#2a1d18'), 0, 0.5, 0.01);
      box(g, 2.3, 0.14, 0.6, mat('#6b4a2b'), 0, 1.55, 0.02);
      const flames: THREE.Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), glow(i === 1 ? '#ffd23f' : '#ff7a1a', 2));
        f.position.set((i - 1) * 0.25, 0.4, 0.15);
        g.add(f);
        flames.push(f);
      }
      const fire = new THREE.PointLight('#ff9a3c', 6, 6, 1.6);
      fire.position.set(0, 0.7, 0.8);
      g.add(fire);
      tick((t) => { flames.forEach((f, i) => { f.scale.y = 1 + Math.sin(t * 8 + i * 2) * 0.25; }); fire.intensity = 5 + Math.sin(t * 11) * 1.2; });
      this.root.add(g);
      rects.push({ x0: L, z0: 2.3, x1: L + 0.8, z1: 4.5 });
    }
    if (features.has('sofa')) {
      const g = new THREE.Group();
      g.position.set(L + 3.4, 0, 3.4);
      g.rotation.y = -Math.PI / 2;
      const fabric = mat(this.of.theme ? THEME_COLORS[this.of.theme].roof : '#8b6fd6', { rough: 1 });
      box(g, 2.0, 0.45, 0.85, fabric, 0, 0.32, 0);
      box(g, 2.0, 0.6, 0.22, fabric, 0, 0.7, -0.34);
      for (const x of [-1.0, 1.0]) box(g, 0.22, 0.6, 0.85, fabric, x, 0.45, 0);
      this.root.add(g);
      const table = new THREE.Group();
      table.position.set(L + 2.0, 0, 3.4);
      box(table, 0.9, 0.08, 1.2, mat('#6b4a2b'), 0, 0.42, 0);
      for (const [x, z] of [[-0.35, -0.5], [0.35, -0.5], [-0.35, 0.5], [0.35, 0.5]]) box(table, 0.06, 0.4, 0.06, mat('#3a2a1c'), x, 0.2, z);
      ball(table, 0.12, mat('#f472b6'), 0, 0.56, 0.2);
      this.root.add(table);
      rects.push({ x0: L + 1.4, z0: 2.2, x1: L + 3.9, z1: 4.6 });
    }
    if (features.has('aquarium')) {
      const g = new THREE.Group();
      g.position.set(plan.plan === 'open' ? L + 2.2 : R - 2.2, 0, 0.55);
      box(g, 2.4, 0.8, 0.7, mat('#3a2a1c'), 0, 0.4, 0);
      box(g, 2.4, 1.0, 0.66, new THREE.MeshStandardMaterial({ color: '#7fd6ff', transparent: true, opacity: 0.45, roughness: 0.1, emissive: new THREE.Color('#2aa6d8'), emissiveIntensity: 0.4 }), 0, 1.3, 0);
      const fish: THREE.Mesh[] = [];
      for (let i = 0; i < 5; i++) {
        const f = ball(g, 0.07, glow(['#ff8a1f', '#facc15', '#f472b6', '#38bdf8', '#a3e635'][i], 0.6), 0, 1.3, 0);
        f.scale.set(1.6, 1, 0.6);
        fish.push(f);
      }
      tick((t) => fish.forEach((f, i) => { const a = t * (0.4 + i * 0.08) + i; f.position.set(Math.sin(a) * 1.0, 1.1 + ((i * 0.13) % 0.5), Math.cos(a * 1.3) * 0.18); f.rotation.y = Math.cos(a) > 0 ? 0 : Math.PI; }));
      this.root.add(g);
      rects.push({ x0: g.position.x - 1.3, z0: 0, x1: g.position.x + 1.3, z1: 1.0 });
    }
    if (features.has('piano')) {
      const g = new THREE.Group();
      g.position.set(R - 1.2, 0, 1.6);
      g.rotation.y = -Math.PI / 2;
      box(g, 1.6, 1.2, 0.6, mat('#141018', { rough: 0.3 }), 0, 0.6, 0);
      box(g, 1.5, 0.06, 0.3, mat('#ffffff'), 0, 0.8, 0.4);
      box(g, 0.8, 0.45, 0.4, mat('#141018'), 0, 0.23, 0.95);
      this.root.add(g);
      rects.push({ x0: R - 1.8, z0: 0.7, x1: R, z1: 2.5 });
    }
    if (features.has('fountain')) {
      const court = plan.rooms.find((r) => r.kind === 'court')?.rect;
      const at = court ? { x: 0, z: (court.z0 + court.z1) / 2 } : { x: L + 2.2, z: 6.2 };
      const g = new THREE.Group();
      g.position.set(at.x, 0, at.z);
      cyl(g, 1.1, 1.2, 0.45, mat('#cfc8bb'), 0, 0.22, 0, 20);
      const water = cyl(g, 1.0, 1.0, 0.05, new THREE.MeshStandardMaterial({ color: '#6cc6f0', roughness: 0.1, emissive: new THREE.Color('#1f8ac0'), emissiveIntensity: 0.3 }), 0, 0.44, 0, 20);
      cyl(g, 0.15, 0.2, 1.0, mat('#cfc8bb'), 0, 0.9, 0, 8);
      const spray = ball(g, 0.25, new THREE.MeshStandardMaterial({ color: '#bfeaff', transparent: true, opacity: 0.6 }), 0, 1.45, 0);
      tick((t) => { spray.scale.setScalar(1 + Math.sin(t * 5) * 0.12); water.rotation.y = t * 0.2; });
      this.root.add(g);
      obstacles.push({ x: at.x, z: at.z, r: 1.35 });
    }
    // A courtyard always has a couple of trees.
    const court = plan.rooms.find((r) => r.kind === 'court')?.rect;
    if (court) {
      for (const [x, z] of [[court.x0 + 1.2, court.z0 + 1.6], [court.x1 - 1.2, court.z0 + 1.6]]) {
        const g = new THREE.Group();
        g.position.set(x, 0, z);
        cyl(g, 0.14, 0.2, 1.4, mat('#7a5236'), 0, 0.7, 0, 8);
        ball(g, 0.9, mat('#4f9a5a'), 0, 2.0, 0);
        ball(g, 0.6, mat('#5fae6b'), 0.4, 2.4, 0.2);
        this.root.add(g);
        obstacles.push({ x, z, r: 0.5 });
      }
    }
    if (features.has('disco')) {
      const ballMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshStandardMaterial({ color: '#e5e7eb', metalness: 0.9, roughness: 0.15, flatShading: true, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.15 }));
      ballMesh.position.set(0, 3.2, 4);
      this.root.add(ballMesh);
      tick((t) => { ballMesh.rotation.y = t * 0.8; });
    }
    if (features.has('lamps')) {
      for (const [x, z] of [[R - 0.7, 6.9], [L + 0.7, 6.9]]) {
        const p = prop('lamp', 0, tick);
        p.position.set(x, 0, z);
        this.root.add(p);
        obstacles.push({ x, z, r: 0.4 });
      }
    }
  }

  /** Hang something on the wall at (x, z), so it goes down with the wall when that's cut away. */
  private onWall(o: THREE.Object3D, x: number, z: number, y: number, out: number) {
    const w = this.wallFor({ x, z, nx: 0, nz: 1 });
    o.position.set(x, y, z + out);
    if (w) { o.position.sub(w.group.position); w.attach.add(o); } else this.root.add(o);
  }

  private wallFor(s: Slot): Wall | null {
    return this.walls.find((w) => {
      const g = w.seg;
      if (g.z0 === g.z1) return Math.abs(s.z - g.z0) < 0.01 && s.x >= Math.min(g.x0, g.x1) && s.x <= Math.max(g.x0, g.x1);
      return Math.abs(s.x - g.x0) < 0.01 && s.z >= Math.min(g.z0, g.z1) && s.z <= Math.max(g.z0, g.z1);
    }) ?? null;
  }

  /** What stands out from the wall at a slot, as a box on the floor you can't walk through. */
  private footprint(s: Slot, depth: number) {
    const a = { x: s.x - Math.abs(s.nz) * 0.5, z: s.z - Math.abs(s.nx) * 0.5 };
    const b = { x: s.x + Math.abs(s.nz) * 0.5 + s.nx * depth, z: s.z + Math.abs(s.nx) * 0.5 + s.nz * depth };
    return { x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), z1: Math.max(a.z, b.z) };
  }

  private addThing(kind: 'card' | 'app', id: string, title: string, s: Slot, obj: THREE.Object3D) {
    obj.userData.pick = { kind, id } satisfies InsidePick;
    this.pickables.push(obj);
    // Where you'd stand to look at it: a step out from the wall.
    this.things.push({ kind, id, title, x: s.x + s.nx * 0.6, z: s.z + s.nz * 0.6, nx: s.nx, nz: s.nz, obj });
  }

  // ---------- Walking ----------

  private makeGrid(obstacles: { x: number; z: number; r: number }[], rects: { x0: number; z0: number; x1: number; z1: number }[]) {
    const b = this.plan.bounds;
    this.gx0 = b.x0; this.gz0 = b.z0;
    // A little past the front door, so you can step out.
    this.gw = Math.ceil((b.x1 - b.x0) / STEP) + 1;
    this.gh = Math.ceil((b.z1 + 1.6 - b.z0) / STEP) + 1;
    this.grid = new Uint8Array(this.gw * this.gh);
    const segs = [...this.plan.walls, ...this.plan.dividers];
    const rooms = this.plan.rooms.map((r) => r.rect);
    const e = this.plan.entrance;
    for (let j = 0; j < this.gh; j++) for (let i = 0; i < this.gw; i++) {
      const x = this.gx0 + i * STEP, z = this.gz0 + j * STEP;
      const inRoom = rooms.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) || (Math.abs(x - e.x) < 1 && z >= e.z - 0.1 && z <= e.z + 1.4);
      if (!inRoom) continue;
      if (segs.some((s) => distSeg(x, z, s) < BODY_R)) continue;
      if (obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + BODY_R * 0.6)) continue;
      if (rects.some((r) => x > r.x0 - BODY_R && x < r.x1 + BODY_R && z > r.z0 - BODY_R && z < r.z1 + BODY_R)) continue;
      this.grid[j * this.gw + i] = 1;
    }
  }

  private cell(x: number, z: number) {
    const i = Math.round((x - this.gx0) / STEP), j = Math.round((z - this.gz0) / STEP);
    return i < 0 || j < 0 || i >= this.gw || j >= this.gh ? -1 : j * this.gw + i;
  }

  private open(x: number, z: number) {
    const c = this.cell(x, z);
    return c >= 0 && this.grid[c] === 1;
  }

  private nearestOpen(x: number, z: number): Vec {
    if (this.open(x, z)) return { x, z };
    for (let r = STEP; r < 30; r += STEP) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const nx = x + Math.cos(a) * r, nz = z + Math.sin(a) * r;
        if (this.open(nx, nz)) return { x: nx, z: nz };
      }
    }
    return { x: this.plan.entrance.x, z: this.plan.entrance.z - 1.5 };
  }

  private clear2(a: Vec, b: Vec) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.ceil(d / (STEP * 0.5));
    for (let k = 1; k <= n; k++) if (!this.open(a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n)) return false;
    return true;
  }

  /** A* over the floor, then pulled tight so you walk straight wherever you can. */
  private route(from: Vec, to: Vec): Vec[] {
    const goal = this.nearestOpen(to.x, to.z);
    if (this.clear2(from, goal)) return [goal];
    const s = this.cell(from.x, from.z), g = this.cell(goal.x, goal.z);
    if (s < 0 || g < 0) return [goal];
    const W = this.gw;
    const cost = new Float32Array(this.grid.length).fill(Infinity);
    const prev = new Int32Array(this.grid.length).fill(-1);
    const open: number[] = [s];
    cost[s] = 0;
    const gx = g % W, gz = Math.floor(g / W);
    const h = (c: number) => Math.hypot((c % W) - gx, Math.floor(c / W) - gz);
    const f = new Float32Array(this.grid.length).fill(Infinity);
    f[s] = h(s);
    let guard = 0;
    while (open.length && guard++ < 40000) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;
      const c = open.splice(bi, 1)[0];
      if (c === g) break;
      const cx = c % W, cz = Math.floor(c / W);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= this.gh) continue;
        const n = nz * W + nx;
        if (!this.grid[n]) continue;
        if (dx && dz && (!this.grid[cz * W + nx] || !this.grid[nz * W + cx])) continue;
        const nc = cost[c] + (dx && dz ? 1.414 : 1);
        if (nc < cost[n]) {
          cost[n] = nc; prev[n] = c; f[n] = nc + h(n);
          if (!open.includes(n)) open.push(n);
        }
      }
    }
    if (prev[g] < 0) return [];
    const cells: Vec[] = [];
    for (let c = g; c !== s && c >= 0; c = prev[c]) cells.unshift({ x: this.gx0 + (c % W) * STEP, z: this.gz0 + Math.floor(c / W) * STEP });
    // String-pull.
    const out: Vec[] = [];
    let at = from;
    let k = 0;
    while (k < cells.length) {
      let far = k;
      for (let m = cells.length - 1; m > k; m--) if (this.clear2(at, cells[m])) { far = m; break; }
      out.push(cells[far]);
      at = cells[far];
      k = far + 1;
    }
    return out;
  }

  /** Tap: walk to the floor there, or to the thing you tapped and look at it. */
  tap(ndc: THREE.Vector2): InsidePick | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const bots = [...this.movers.values()];
    const botHit = ray.intersectObjects(bots.map((m) => m.fig.group), true)[0];
    if (botHit) {
      const m = bots.find((b) => { let o: THREE.Object3D | null = botHit.object; while (o) { if (o === b.fig.group) return true; o = o.parent; } return false; });
      if (m) return { kind: 'bot', id: m.id };
    }
    const hit = ray.intersectObjects(this.pickables, false).find((h) => shown(h.object));
    if (hit) {
      const p = hit.object.userData.pick as InsidePick;
      if (p.kind === 'exit') return p;
      const th = this.things.find((t) => t.kind === p.kind && t.id === p.id);
      if (th) {
        this.player.path = this.route(this.player, th);
        // Once you're there, the camera comes round to face the wall with you.
        this.faceWall = { nx: th.nx, nz: th.nz };
      }
      return p;
    }
    const floor = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    if (floor) {
      const to = this.nearestOpen(floor.x, floor.z);
      this.player.path = this.route(this.player, to);
      this.marker(to);
    }
    return null;
  }

  private faceWall: { nx: number; nz: number } | null = null;
  private markerMesh: THREE.Mesh | null = null;
  private markerT = 0;
  private marker(at: Vec) {
    if (!this.markerMesh) {
      this.markerMesh = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.34, 24), new THREE.MeshBasicMaterial({ color: '#a78bfa', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
      this.markerMesh.rotation.x = -Math.PI / 2;
      this.scene.add(this.markerMesh);
    }
    this.markerMesh.position.set(at.x, 0.03, at.z);
    this.markerMesh.visible = true;
    this.markerT = 0;
  }

  /** Mouse hover: the card's name, so you can read it before you walk over. */
  hover(ndc: THREE.Vector2 | null) {
    if (!ndc) { this.hovered = null; return false; }
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObjects(this.pickables, false).find((h) => shown(h.object));
    const p = hit?.object.userData.pick as InsidePick | undefined;
    this.hovered = p && p.kind !== 'exit' ? this.things.find((t) => t.kind === p.kind && t.id === p.id) ?? null : null;
    const bot = ray.intersectObjects([...this.movers.values()].map((m) => m.fig.group), true).length > 0;
    return Boolean(p || bot);
  }

  private placeResident() {
    const lobby = this.plan.rooms.find((r) => r.kind === 'lobby')!.rect;
    const home = this.nearestOpen(lobby.x1 - 2.6, 3.3);
    const m = this.movers.get(this.of.channelId);
    if (m) { m.home = home; return; }
    const r = this.addMover(this.of.channelId, this.of.resident, hash(this.of.channelId), home, home, false);
    r.heading = 0;
  }

  private addMover(id: string, name: string, seed: number, at: Vec, home: Vec | null, guest: boolean): Mover {
    const fig = botFigure(seed);
    fig.group.scale.setScalar(BOT_SCALE);
    fig.group.position.set(at.x, 0, at.z);
    this.scene.add(fig.group);
    const label = this.makeLabel(name, 'kc-label kc-bot');
    label.style.setProperty('--dot', fig.color);
    label.addEventListener('click', (e) => { e.stopPropagation(); this.cb.onPick({ kind: 'bot', id }); });
    const bubble = this.makeLabel('', 'kc-bubble');
    bubble.addEventListener('click', (e) => { e.stopPropagation(); this.cb.onPick({ kind: 'bot', id }); });
    const m: Mover = { id, name, fig, x: at.x, z: at.z, heading: 0, path: [], wait: 4 + (seed % 5), home, label, bubble, sayUntil: 0, guest };
    this.movers.set(id, m);
    return m;
  }

  private makeLabel(text: string, cls: string) {
    const el = document.createElement('div');
    el.className = cls;
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    if (cls.includes('kc-label')) {
      const dot = document.createElement('span');
      dot.className = 'kc-dot';
      const name = document.createElement('span');
      name.className = 'kc-name';
      name.textContent = text;
      el.append(dot, name);
    } else el.textContent = text;
    this.layer.appendChild(el);
    return el;
  }

  // ---------- Every frame ----------

  step(dt: number, input: { steer: number; push: number; boost: boolean }) {
    this.time += dt;
    const t = this.time;
    const p = this.player;
    this.camYaw += (this.yawTarget - this.camYaw) * Math.min(1, dt * 6);

    // Keys and the stick move you relative to the screen; a tap's walk stops when you take over.
    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    let vx = fx * input.push + rx * input.steer, vz = fz * input.push + rz * input.steer;
    const mag = Math.hypot(vx, vz);
    const speed = input.boost ? 6.5 : 3.8;
    let moving = false;
    if (mag > 0.05) {
      p.path = [];
      this.faceWall = null;
      vx /= Math.max(1, mag); vz /= Math.max(1, mag);
      moving = this.slide(p, vx * speed * dt, vz * speed * dt);
      p.heading = turnToward(p.heading, Math.atan2(vx, vz), dt * 12);
    } else if (p.path.length) {
      moving = this.follow(p, p.path, speed, dt);
    } else if (this.faceWall) {
      // Behind you, on the room's side of the wall: the nearest way round to it.
      const want = Math.atan2(this.faceWall.nx, this.faceWall.nz);
      this.yawTarget = this.camYaw + Math.atan2(Math.sin(want - this.camYaw), Math.cos(want - this.camYaw));
      p.heading = turnToward(p.heading, want + Math.PI, 1);
      this.faceWall = null;
    }
    p.walk += moving ? dt * speed : 0;
    p.fig.group.position.set(p.x, 0, p.z);
    p.fig.group.rotation.y = p.heading;
    p.fig.body.position.y = 0.8 + (moving ? Math.abs(Math.sin(p.walk * 2.6)) * 0.1 : Math.sin(t * 1.8) * 0.02);
    p.fig.body.rotation.z = moving ? Math.sin(p.walk * 2.6) * 0.07 : 0;
    if (this.markerMesh?.visible) {
      this.markerT += dt;
      this.markerMesh.scale.setScalar(1 + Math.sin(this.markerT * 6) * 0.12);
      if (!p.path.length) this.markerMesh.visible = false;
    }

    // The resident and any guests.
    for (const m of this.movers.values()) {
      let walking = false;
      if (m.path.length) walking = this.follow(m, m.path, 2.6, dt);
      else if (this.talking === m.id) {
        m.heading = turnToward(m.heading, Math.atan2(p.x - m.x, p.z - m.z), dt * 6);
      } else {
        m.wait -= dt;
        if (m.wait <= 0) {
          // Pottering about: home to the desk, or into a room to look things over.
          const rooms = this.plan.rooms.filter((r) => r.kind === 'column' || r.kind === 'arcade' || r.kind === 'court');
          const r = rooms[Math.floor(Math.random() * rooms.length)];
          const back = m.home && Math.random() < 0.5;
          const to = back ? m.home! : r ? this.nearestOpen((r.rect.x0 + r.rect.x1) / 2 + (Math.random() - 0.5) * 2, (r.rect.z0 + r.rect.z1) / 2 + (Math.random() - 0.5) * 2) : this.nearestOpen(p.x + 2, p.z);
          m.path = this.route(m, to);
          m.wait = 8 + Math.random() * 10;
        } else if (m.home && Math.hypot(m.x - m.home.x, m.z - m.home.z) < 0.3) m.heading = turnToward(m.heading, 0, dt * 3);
      }
      m.fig.group.position.set(m.x, 0, m.z);
      m.fig.group.rotation.y = m.heading;
      m.fig.body.position.y = 0.8 + (walking ? Math.abs(Math.sin(t * 9 + m.x)) * 0.09 : 0);
      m.fig.body.scale.y = 0.95 - (walking ? 0 : Math.sin(t * 2 + m.z) * 0.03);
    }

    // Kan, when it's here to rearrange things.
    if (this.kan) {
      const k = this.kan;
      const leaving = performance.now() > k.until;
      const s = k.obj.scale.x + ((leaving ? 0 : 0.9) - k.obj.scale.x) * Math.min(1, dt * 5);
      k.obj.scale.setScalar(Math.max(0.001, s));
      k.obj.position.y = 0.15 + Math.sin(t * 2) * 0.08;
      k.obj.rotation.y = Math.atan2(p.x - k.obj.position.x, p.z - k.obj.position.z);
      (k.pad.material as THREE.MeshBasicMaterial).opacity = (0.16 + Math.sin(t * 5) * 0.05) * (s / 0.9);
      if (leaving && s < 0.02) { k.obj.removeFromParent(); k.pad.removeFromParent(); k.bubble.remove(); this.kan = null; }
    }

    for (const f of this.ticks) f(t, dt);
    for (const [i, pl] of this.party.entries()) {
      const b = this.plan.bounds;
      const a = t * 0.6 + (pl.userData.phase as number);
      pl.position.set((b.x0 + b.x1) / 2 + Math.cos(a) * (b.x1 - b.x0) * 0.3, 2.6, (b.z0 + b.z1) / 2 + Math.sin(a * 1.3 + i) * (b.z1 - b.z0) * 0.3);
    }
    for (const an of [...this.anims]) {
      an.t += dt;
      const k = Math.min(1, Math.max(0, (an.t - an.delay) / 0.55));
      const e = k < 1 ? 1 - Math.pow(1 - k, 3) : 1;
      an.obj.position.y = an.y + (1 - e) * 7 + (k === 1 ? 0 : Math.sin(e * Math.PI) * 0.2);
      if (k >= 1) this.anims = this.anims.filter((x) => x !== an);
    }

    this.placeCamera(false, dt);
    this.cutaway(dt);

    // What you're next to, a few times a second.
    this.nearT -= dt;
    if (this.nearT <= 0) {
      this.nearT = 0.15;
      this.checkNear();
      const r = roomAt(this.plan, p.x, p.z);
      const key = r ? r.id : '';
      if (key !== this.room) {
        this.room = key;
        if (r) this.cb.onRoom({ name: r.kind === 'lobby' ? this.of.name : r.name, count: r.kind === 'column' ? r.count : r.kind === 'arcade' ? this.apps.length : null, kind: r.kind });
      }
    }
  }

  /** Move by (dx, dz), sliding along whatever's in the way. */
  private slide(o: { x: number; z: number }, dx: number, dz: number) {
    if (this.open(o.x + dx, o.z + dz)) { o.x += dx; o.z += dz; return true; }
    if (this.open(o.x + dx, o.z)) { o.x += dx; return true; }
    if (this.open(o.x, o.z + dz)) { o.z += dz; return true; }
    return false;
  }

  private follow(o: { x: number; z: number; heading: number }, path: Vec[], speed: number, dt: number) {
    const to = path[0];
    const dx = to.x - o.x, dz = to.z - o.z, d = Math.hypot(dx, dz);
    const stepLen = speed * dt;
    if (d <= stepLen) { o.x = to.x; o.z = to.z; path.shift(); }
    else { o.x += (dx / d) * stepLen; o.z += (dz / d) * stepLen; }
    if (d > 0.001) o.heading = turnToward(o.heading, Math.atan2(dx, dz), dt * 10);
    return d > 0.001;
  }

  private placeCamera(snap: boolean, dt = 0) {
    const p = this.player;
    const want = new THREE.Vector3(p.x + Math.sin(this.camYaw) * CAM_BACK, CAM_UP, p.z + Math.cos(this.camYaw) * CAM_BACK);
    if (snap) this.camera.position.copy(want);
    else this.camera.position.lerp(want, 1 - Math.exp(-dt * 5));
    this.camera.lookAt(p.x, 0.9, p.z);
  }

  /**
   * Walls between the camera and you drop to a stub, and so does one you're standing
   * right up against on the camera's side. They wait a moment before coming back up,
   * so a wall doesn't flicker as you walk along it.
   */
  private cutaway(dt: number) {
    const c = { x: this.camera.position.x, z: this.camera.position.z };
    const p = this.player;
    const side = { x: Math.cos(this.camYaw) * 0.9, z: -Math.sin(this.camYaw) * 0.9 };
    // Your shoulders count too, but only on open floor: a point past the wall you're
    // facing would cut away the very wall you walked up to read.
    const targets = [{ x: p.x, z: p.z }, { x: p.x + side.x, z: p.z + side.z }, { x: p.x - side.x, z: p.z - side.z }].filter((tg, k) => k === 0 || this.open(tg.x, tg.z));
    // Whoever you're talking with, too.
    const talk = this.talking ? this.movers.get(this.talking) : null;
    if (talk) targets.push({ x: talk.x, z: talk.z });
    for (const w of this.walls) {
      const s = w.seg;
      const block = targets.some((tg) => crosses(c, tg, { x: s.x0, z: s.z0 }, { x: s.x1, z: s.z1 }));
      if (block) w.holdCut = 0.5; else w.holdCut -= dt;
      const want = w.holdCut > 0 ? 0.1 : 1;
      w.cut += (want - w.cut) * Math.min(1, dt * 9);
      w.group.scale.y = Math.max(0.05, w.cut);
      w.attach.scale.y = 1 / Math.max(0.05, w.cut);
      w.attach.visible = w.cut > 0.92;
    }
  }

  private checkNear() {
    const p = this.player;
    const f = { x: Math.sin(p.heading), z: Math.cos(p.heading) };
    let best: InsideNear | null = null, bestD = Infinity;
    const consider = (n: InsideNear, x: number, z: number, reach: number) => {
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d > reach) return;
      // Things in front of you count for more than things behind.
      const ahead = d > 0.01 ? (dx * f.x + dz * f.z) / d : 1;
      const score = d - ahead * 0.8;
      if (score < bestD) { bestD = score; best = n; }
    };
    for (const th of this.things) {
      if (!shown(th.obj)) continue;
      consider({ kind: th.kind, id: th.id, name: th.title }, th.x, th.z, 1.6);
    }
    for (const m of this.movers.values()) consider({ kind: 'bot', id: m.id, name: m.name }, m.x, m.z, 2.2);
    const e = this.plan.entrance;
    consider({ kind: 'exit', id: 'exit', name: 'outside' }, e.x, e.z - 0.4, 1.8);
    const b = best as InsideNear | null;
    if (b?.kind !== this.near?.kind || b?.id !== this.near?.id) {
      this.near = b;
      this.cb.onNear(b);
    }
  }

  placeLabels(w: number, h: number) {
    const v = new THREE.Vector3();
    const put = (el: HTMLElement, pos: THREE.Vector3, show: boolean, dy = 0) => {
      if (!show) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
      v.copy(pos).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h + dy;
      const off = v.z > 1 || x < -80 || x > w + 80 || y < -40 || y > h + 40;
      el.style.display = off ? 'none' : '';
      if (!off) el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    };
    const now = performance.now();
    for (const m of this.movers.values()) {
      const pos = new THREE.Vector3(m.x, 2.0, m.z);
      put(m.label, pos, true);
      put(m.bubble, new THREE.Vector3(m.x, 2.55, m.z), now < m.sayUntil && Boolean(m.bubble.textContent), -6);
    }
    if (this.kan) put(this.kan.bubble, this.kan.obj.position.clone().setY(2.4), Boolean(this.kan.bubble.textContent));
    // The card under the mouse, or the one you're next to.
    const th = this.hovered ?? (this.near && this.near.kind !== 'bot' && this.near.kind !== 'exit' ? this.things.find((x) => x.id === this.near!.id) : null) ?? null;
    if (th) {
      (this.hoverLabel.querySelector('.kc-name') as HTMLSpanElement).textContent = th.title;
      const at = new THREE.Vector3();
      th.obj.getWorldPosition(at);
      put(this.hoverLabel, at.add(new THREE.Vector3(0, 0.45, 0)), shown(th.obj));
    } else put(this.hoverLabel, v, false);
  }
}

function shown(o: THREE.Object3D) {
  for (let x: THREE.Object3D | null = o; x; x = x.parent) if (!x.visible) return false;
  return true;
}

function turnToward(from: number, to: number, k: number) {
  let d = to - from;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return from + d * Math.min(1, k);
}

function distSeg(x: number, z: number, s: Seg) {
  const dx = s.x1 - s.x0, dz = s.z1 - s.z0;
  const l2 = dx * dx + dz * dz || 1;
  const k = Math.max(0, Math.min(1, ((x - s.x0) * dx + (z - s.z0) * dz) / l2));
  return Math.hypot(x - (s.x0 + k * dx), z - (s.z0 + k * dz));
}

/** Whether segment a-b crosses segment c-d (on the floor). */
function crosses(a: Vec, b: Vec, c: Vec, d: Vec) {
  const o = (p: Vec, q: Vec, r: Vec) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}
