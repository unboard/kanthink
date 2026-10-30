import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Archetype } from '@/lib/kan/city/layout';
import { rng } from './grid';

/**
 * Low-poly models for Kan City: a building for every kind of channel, Town Hall,
 * the park, trees, lamps, cars, bots, Kan and the little shrooms. Every model faces
 * +z (its door side) and stands on y = 0 at the middle of its plot; the scene turns
 * it to face its street.
 *
 * Window light is real: a building's lit windows follow how much attention Kan gives
 * its channel, and they all brighten together at night.
 */

// ---------- Materials ----------

const matCache = new Map<string, THREE.MeshStandardMaterial>();
/** Shared materials: anything drawn with one of these may be merged into one mesh. */
export const sharedMaterials = new Set<THREE.Material>();
/** Marks something that moves, so the scene never merges it into the static city. */
export function dyn<T extends THREE.Object3D>(o: T): T {
  o.userData.dynamic = true;
  return o;
}
export function mat(color: string, opts: { emissive?: string; intensity?: number; rough?: number; metal?: number; opacity?: number } = {}) {
  const key = `${color}|${opts.emissive ?? ''}|${opts.intensity ?? 0}|${opts.rough ?? 0.85}|${opts.metal ?? 0}|${opts.opacity ?? 1}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0, flatShading: true,
      ...(opts.emissive ? { emissive: new THREE.Color(opts.emissive), emissiveIntensity: opts.intensity ?? 1 } : {}),
      ...(opts.opacity !== undefined && opts.opacity < 1 ? { transparent: true, opacity: opts.opacity } : {}),
    });
    matCache.set(key, m);
    sharedMaterials.add(m);
  }
  return m;
}

/** Every material with lit windows, so the scene can brighten them all at night. */
export const windowMaterials = new Set<THREE.MeshStandardMaterial>();
/** Things that glow after dark: lamps, signs. Their intensity follows the hour. */
export const nightGlows = new Set<THREE.MeshStandardMaterial>();

const texCache = new Map<string, { map: THREE.Texture; emissive: THREE.Texture }>();

function facadeTextures(wall: string, lit: number, style: 'grid' | 'band' | 'glass' | 'shop') {
  const key = `${wall}|${lit.toFixed(2)}|${style}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const S = 128;
  const base = document.createElement('canvas');
  base.width = base.height = S;
  const glow = document.createElement('canvas');
  glow.width = glow.height = S;
  const b = base.getContext('2d')!;
  const g = glow.getContext('2d')!;
  b.fillStyle = wall;
  b.fillRect(0, 0, S, S);
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  const r = rng(key.length * 7919 + Math.round(lit * 1000));
  const cols = style === 'glass' ? 4 : 4;
  const rows = 4;
  const cw = S / cols, rh = S / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const on = r() < lit;
      let x = i * cw + cw * 0.22, y = j * rh + rh * 0.24, w = cw * 0.56, h = rh * 0.52;
      if (style === 'band') { x = i * cw; w = cw; y = j * rh + rh * 0.3; h = rh * 0.42; }
      if (style === 'glass') { x = i * cw + 2; y = j * rh + 2; w = cw - 4; h = rh - 4; }
      b.fillStyle = on ? '#ffd88a' : style === 'glass' ? '#4a5a86' : '#3d4566';
      b.fillRect(x, y, w, h);
      if (on) { g.fillStyle = '#fff'; g.fillRect(x, y, w, h); }
      if (style !== 'glass' && style !== 'band') {
        b.fillStyle = 'rgba(255,255,255,0.18)';
        b.fillRect(x, y + h - 2, w, 2);
      }
    }
  }
  const make = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 2;
    return t;
  };
  const out = { map: make(base), emissive: make(glow) };
  texCache.set(key, out);
  return out;
}

/**
 * A box with windows on its sides and a plain roof. Textures repeat by size, so a
 * window is about the same size on every building.
 */
export function windowBox(w: number, h: number, d: number, wall: string, roof: string, lit: number, style: 'grid' | 'band' | 'glass' | 'shop' = 'grid') {
  const t = facadeTextures(wall, lit, style);
  const side = (len: number) => {
    const map = t.map.clone();
    const em = t.emissive.clone();
    map.repeat.set(Math.max(1, Math.round(len / 3.2)) / 4, Math.max(1, Math.round(h / 1.6)) / 4);
    em.repeat.copy(map.repeat);
    map.needsUpdate = em.needsUpdate = true;
    const m = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: new THREE.Color('#ffc46b'), emissiveIntensity: 0.6, roughness: 0.8, flatShading: true });
    windowMaterials.add(m);
    return m;
  };
  const top = mat(roof);
  const sx = side(d), sz = side(w);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [sx, sx, top, top, sz, sz]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const signCache = new Map<string, THREE.MeshStandardMaterial>();
/** A flat sign with words on it. It glows after dark. */
export function sign(text: string, w: number, h: number, bg: string, fg: string) {
  const key = `${text}|${bg}|${fg}`;
  let m = signCache.get(key);
  if (!m) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = Math.max(32, Math.round(256 * (h / w)));
    const x = c.getContext('2d')!;
    x.fillStyle = bg;
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = fg;
    let size = c.height * 0.62;
    x.font = `800 ${size}px ui-sans-serif, system-ui, sans-serif`;
    while (x.measureText(text).width > c.width * 0.86 && size > 8) { size -= 2; x.font = `800 ${size}px ui-sans-serif, system-ui, sans-serif`; }
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(text, c.width / 2, c.height / 2 + 1);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.35, roughness: 0.6 });
    nightGlows.add(m);
    signCache.set(key, m);
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  return mesh;
}

// ---------- Primitives ----------

function box(g: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, shadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
function cyl(g: THREE.Object3D, rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
function sphere(g: THREE.Object3D, r: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 10) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}
/** A gable roof: a triangular prism along x. */
function gable(g: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0);
  shape.lineTo(d / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  geo.translate(0, 0, -w / 2);
  const mesh = new THREE.Mesh(geo, m);
  mesh.rotation.y = Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}
/** A striped awning over a door. */
function awning(g: THREE.Object3D, w: number, a: string, b: string, y: number, z: number) {
  const n = Math.max(3, Math.round(w / 0.8));
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w / n, 0.12, 1.4), mat(i % 2 ? a : b));
    s.position.set(-w / 2 + (i + 0.5) * (w / n), y, z + 0.6);
    s.rotation.x = 0.35;
    s.castShadow = true;
    g.add(s);
  }
}
function door(g: THREE.Object3D, z: number, w = 1.2, h = 2, color = '#5b3b2e') {
  box(g, w, h, 0.15, mat(color), 0, 0, z, false);
}
function glow(color: string, intensity = 1.2) {
  const m = mat(color, { emissive: color, intensity });
  nightGlows.add(m);
  return m;
}

export function tree(g: THREE.Object3D, x: number, z: number, s = 1, kind: 'round' | 'pine' = 'round', tint = '#5fae6b') {
  cyl(g, 0.12 * s, 0.16 * s, 0.9 * s, mat('#7a5638'), x, 0, z, 6);
  if (kind === 'pine') {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.9 * s, 2.2 * s, 7), mat('#3f8f5a'));
    c.position.set(x, 0.9 * s + 1.1 * s, z);
    c.castShadow = true;
    g.add(c);
  } else {
    sphere(g, 0.85 * s, mat(tint), x, 1.55 * s, z, 7);
  }
}

export function lamp(g: THREE.Object3D, x: number, z: number) {
  cyl(g, 0.07, 0.09, 2.6, mat('#3a3a48'), x, 0, z, 6);
  const head = sphere(g, 0.22, glow('#ffe3a3', 1.4), x, 2.7, z, 8);
  head.castShadow = false;
}

function bench(g: THREE.Object3D, x: number, z: number, rot = 0) {
  const b = new THREE.Group();
  box(b, 1.6, 0.12, 0.5, mat('#9a6b45'), 0, 0.45, 0);
  box(b, 1.6, 0.5, 0.1, mat('#9a6b45'), 0, 0.5, -0.22);
  box(b, 0.1, 0.45, 0.4, mat('#444'), -0.7, 0, 0);
  box(b, 0.1, 0.45, 0.4, mat('#444'), 0.7, 0, 0);
  b.position.set(x, 0, z);
  b.rotation.y = rot;
  g.add(b);
}

// ---------- Palettes ----------

const WALLS = ['#f4e6d4', '#f2d7c4', '#e8dff5', '#d9ecf2', '#f6e3b8', '#e3efd9', '#f3d3dc', '#dfe4f0'];
const ROOFS = ['#7b6a8f', '#a15c5c', '#5c7a8f', '#8f7a5c', '#5c8f74'];

export interface BuildOpts {
  size: number;
  seed: number;
  /** 0 to 1: share of windows lit. */
  lit: number;
  muted: boolean;
}

export interface Built {
  group: THREE.Group;
  /** Where its label floats. */
  top: number;
  /** Bits that move: a ferris wheel, a telescope, smoke. Called each frame. */
  tick?: (t: number, dt: number) => void;
  /** Its window materials, so a busy building can light up. */
  windows: THREE.MeshStandardMaterial[];
}

function collectWindows(g: THREE.Object3D) {
  const out: THREE.MeshStandardMaterial[] = [];
  g.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    for (const x of Array.isArray(m) ? m : m ? [m] : []) if (windowMaterials.has(x as THREE.MeshStandardMaterial)) out.push(x as THREE.MeshStandardMaterial);
  });
  return out;
}

/** Smoke puffs rising from a point, as a tick. */
function smoke(g: THREE.Object3D, x: number, y: number, z: number, color = '#e9e4ef') {
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 5), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.7, roughness: 1, flatShading: true }));
    p.position.set(x, y, z);
    g.add(p);
    puffs.push(p);
  }
  return (t: number) => {
    puffs.forEach((p, i) => {
      const k = ((t * 0.35 + i / puffs.length) % 1);
      p.position.set(x + Math.sin(k * 3 + i) * 0.3, y + k * 3, z + k * 0.6);
      p.scale.setScalar(0.6 + k * 1.4);
      (p.material as THREE.MeshStandardMaterial).opacity = 0.7 * (1 - k);
    });
  };
}

// ---------- Buildings ----------

export function building(kind: Archetype, o: BuildOpts): Built {
  const g = new THREE.Group();
  const r = rng(o.seed);
  const wall = o.muted ? '#c9c6cf' : WALLS[Math.floor(r() * WALLS.length)];
  const roof = o.muted ? '#8d8a96' : ROOFS[Math.floor(r() * ROOFS.length)];
  const lit = o.muted ? 0 : o.lit;
  const s = o.size;
  let top = 4;
  const ticks: ((t: number, dt: number) => void)[] = [];

  switch (kind) {
    case 'tower': {
      const h = 6 + s * 2.1;
      const body = windowBox(6, h, 6, o.muted ? '#a9acb8' : '#5d6c95', '#39415e', lit, 'glass');
      body.position.y = h / 2;
      g.add(body);
      const cap = windowBox(4.6, 2.4, 4.6, '#4a5578', '#2d3450', lit, 'glass');
      cap.position.y = h + 1.2;
      g.add(cap);
      const sg = sign('</> CODE', 3.8, 1.1, '#1d2238', '#ff7ad9');
      sg.position.set(0, h + 1.4, 2.31);
      g.add(sg);
      cyl(g, 0.06, 0.06, 2.4, mat('#ccc'), 0, h + 2.4, 0, 5);
      const tip = sphere(g, 0.18, glow('#ff4f7a', 2), 0, h + 4.9, 0, 6);
      ticks.push((t) => { (tip.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + Math.sin(t * 4) * 1; });
      top = h + 5.2;
      break;
    }
    case 'datacenter': {
      const h = 3.2 + s * 0.7;
      const body = windowBox(8.4, h, 6.4, o.muted ? '#bbb' : '#cfd4de', '#8b93a6', lit * 0.6, 'band');
      body.position.y = h / 2;
      g.add(body);
      for (let i = 0; i < 3; i++) box(g, 1.4, 0.9, 1.4, mat('#9aa3b5'), -2.6 + i * 2.6, h, -1.2);
      const strip = box(g, 8.42, 0.18, 6.42, glow('#62f0c6', 1.2), 0, h * 0.18, 0, false);
      ticks.push((t) => { (strip.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8 + Math.sin(t * 2.2) * 0.5; });
      const sg = sign('DATA', 3, 0.9, '#1e2a36', '#62f0c6');
      sg.position.set(0, h - 0.8, 3.22);
      g.add(sg);
      top = h + 2;
      break;
    }
    case 'library': {
      const h = 3.6 + s * 0.5;
      box(g, 8.2, 0.5, 6.4, mat('#e7e1d6'));
      box(g, 7, 0.35, 0.8, mat('#ddd6ca'), 0, 0, 3.4);
      const body = windowBox(7.4, h, 5, '#efe4cf', '#c4b49a', lit, 'grid');
      body.position.set(0, 0.5 + h / 2, -0.5);
      g.add(body);
      for (let i = 0; i < 6; i++) cyl(g, 0.24, 0.26, h, mat('#f6f1e7'), -3.1 + i * 1.24, 0.5, 2.4, 8);
      box(g, 7.8, 0.4, 1.4, mat('#f0e9dc'), 0, 0.5 + h, 2.2);
      gable(g, 7.8, 1.6, 6.6, mat(o.muted ? '#999' : '#b5523f'), 0, 0.9 + h, 0.2);
      const sg = sign('LIBRARY', 3.2, 0.6, '#f0e9dc', '#6a4b2f');
      sg.position.set(0, 0.5 + h + 0.2, 2.92);
      g.add(sg);
      top = h + 3;
      break;
    }
    case 'postoffice': {
      const h = 3 + s * 0.65;
      const body = windowBox(7.6, h, 6, o.muted ? '#bbb' : '#c9775c', '#7d4a3a', lit, 'grid');
      body.position.y = h / 2;
      g.add(body);
      box(g, 7.9, 0.5, 6.3, mat('#efe2d2'), 0, h, 0);
      door(g, 3.05, 1.6, 2.2);
      const sg = sign('POST', 2.8, 0.8, '#21407a', '#ffffff');
      sg.position.set(0, h - 0.7, 3.02);
      g.add(sg);
      // A mailbox and the parcels: shares waiting to be read.
      box(g, 0.7, 1.1, 0.6, mat('#2f5bb7'), 3, 0, 4.2);
      for (let i = 0; i < Math.min(6, s); i++) box(g, 0.7, 0.55, 0.6, mat(['#c9a36b', '#b98e57', '#d6b27c'][i % 3]), -3.2 + (i % 3) * 0.8, Math.floor(i / 3) * 0.56, 4.1);
      cyl(g, 0.06, 0.06, 4.5, mat('#ddd'), -3.6, h, -2.6, 5);
      const flag = box(g, 1.2, 0.7, 0.05, mat('#e24f4f'), -3, h + 3.6, -2.6, false);
      dyn(flag);
      ticks.push((t) => { flag.rotation.y = Math.sin(t * 3) * 0.25; });
      top = h + 4.6;
      break;
    }
    case 'school': {
      const h = 3 + s * 0.4;
      const body = windowBox(7.6, h, 5.2, o.muted ? '#bbb' : '#d65a4a', '#8a3a30', lit, 'grid');
      body.position.y = h / 2;
      g.add(body);
      gable(g, 8, 2.2, 5.8, mat('#efe6da'), 0, h, 0);
      box(g, 1.6, 2.2, 1.6, mat('#d65a4a'), 0, h + 0.6, 0);
      gable(g, 1.9, 1.2, 1.9, mat('#3d4b6b'), 0, h + 2.8, 0);
      sphere(g, 0.35, mat('#e0b64a', { metal: 0.6, rough: 0.3 }), 0, h + 1.9, 0.75, 8);
      door(g, 2.66, 1.4, 2.2, '#3d4b6b');
      const sg = sign('SCHOOL', 2.6, 0.6, '#efe6da', '#8a3a30');
      sg.position.set(0, h - 0.6, 2.62);
      g.add(sg);
      // A fence around the yard and a little swing set.
      for (let i = 0; i < 9; i++) box(g, 0.12, 0.7, 0.12, mat('#f5f5f5'), -4.4 + i * 1.1, 0, 4.4, false);
      box(g, 9, 0.1, 0.08, mat('#f5f5f5'), 0, 0.55, 4.4, false);
      box(g, 0.1, 1.8, 0.1, mat('#4a6fb5'), 2.8, 0, 3.4); box(g, 0.1, 1.8, 0.1, mat('#4a6fb5'), 4.2, 0, 3.4);
      box(g, 1.5, 0.1, 0.1, mat('#4a6fb5'), 3.5, 1.8, 3.4);
      const seat = box(g, 0.4, 0.06, 0.3, mat('#f0c040'), 3.5, 0.6, 3.4, false);
      dyn(seat);
      ticks.push((t) => { seat.position.z = 3.4 + Math.sin(t * 2) * 0.35; });
      top = h + 4.4;
      break;
    }
    case 'studio': {
      const h = 3.4 + s * 0.9;
      const body = windowBox(7.2, h, 6, o.muted ? '#999' : '#3b2a5c', '#24183a', lit * 0.7, 'band');
      body.position.y = h / 2;
      g.add(body);
      const neon = box(g, 7.24, 0.16, 6.04, glow('#ff5fd2', 1.6), 0, h - 0.5, 0, false);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.2), glow('#7c5cff', 0.9));
      screen.position.set(0, h * 0.55, 3.02);
      g.add(screen);
      ticks.push((t) => {
        (screen.material as THREE.MeshStandardMaterial).emissive.setHSL((t * 0.05) % 1, 0.8, 0.55);
        (neon.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 + Math.sin(t * 5) * 0.4;
      });
      const sg = sign('STUDIO', 3, 0.8, '#24183a', '#ff8fe0');
      sg.position.set(0, h + 0.5, 1.5);
      g.add(sg);
      top = h + 1.6;
      break;
    }
    case 'arcade': {
      const h = 3 + s * 0.35;
      const body = windowBox(5.6, h, 5, o.muted ? '#aaa' : '#ffb84d', '#c46a2a', lit, 'shop');
      body.position.set(-1.8, h / 2, -0.6);
      g.add(body);
      const sg = sign('ARCADE', 4, 0.9, '#2b1846', '#ffd84d');
      sg.position.set(-1.8, h + 0.6, 1.95);
      g.add(sg);
      // A ferris wheel: one car per app, up to a dozen.
      const wheel = new THREE.Group();
      dyn(wheel);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.09, 6, 24), mat('#ff6fa8'));
      wheel.add(ring);
      const cars: THREE.Mesh[] = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.4, 0.05), mat('#ffffff'));
        spoke.position.set(Math.cos(a) * 1.2, Math.sin(a) * 1.2, 0);
        spoke.rotation.z = a - Math.PI / 2;
        wheel.add(spoke);
        const car = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), glow(['#5fd3ff', '#ffd84d', '#9c7bff', '#6ff0a0'][i % 4], 0.6));
        car.position.set(Math.cos(a) * 2.4, Math.sin(a) * 2.4 - 0.3, 0);
        wheel.add(car);
        cars.push(car);
      }
      wheel.position.set(2.6, 3.1, 0.4);
      wheel.rotation.y = Math.PI / 2.4;
      g.add(wheel);
      box(g, 0.2, 3, 0.2, mat('#ddd'), 2.6, 0, -0.5); box(g, 0.2, 3, 0.2, mat('#ddd'), 2.6, 0, 1.3);
      ticks.push((_t, dt) => { wheel.rotateZ(dt * 0.3); for (const c of cars) c.rotation.z = -wheel.rotation.z; });
      top = Math.max(h + 2, 6.2);
      break;
    }
    case 'lab': {
      const h = 3 + s * 0.55;
      const body = windowBox(7, h, 5.6, o.muted ? '#bbb' : '#f3f6fb', '#c5cfdd', lit, 'band');
      body.position.y = h / 2;
      g.add(body);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#9fe6ff', { opacity: 0.55, rough: 0.2, emissive: '#7fdcff', intensity: 0.15 }));
      dome.position.set(1.2, h, 0);
      g.add(dome);
      // The bulb: ideas live here.
      const bulb = sphere(g, 0.55, glow('#ffe066', 1.2), -2, h + 1.2, 1, 10);
      cyl(g, 0.25, 0.25, 0.4, mat('#9aa'), -2, h + 0.35, 1, 8);
      ticks.push((t) => { (bulb.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9 + Math.max(0, Math.sin(t * 1.3)) * 1.2; });
      const sg = sign('LAB', 2, 0.7, '#e6ecf5', '#4060a0');
      sg.position.set(0, h - 0.7, 2.82);
      g.add(sg);
      top = h + 2.8;
      break;
    }
    case 'observatory': {
      const h = 2.6 + s * 0.5;
      cyl(g, 3, 3.2, h, mat(o.muted ? '#bbb' : '#e9e4f2'), 0, 0, 0, 16);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(2.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#c9ccd8', { metal: 0.4, rough: 0.35 }));
      dyn(dome);
      dome.position.y = h;
      dome.castShadow = true;
      g.add(dome);
      const slit = box(dome, 0.8, 2.6, 0.4, mat('#2b2f45'), 0, 0.2, 2.4, false);
      slit.rotation.x = -0.5;
      const scope = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.6, 8), mat('#4b4f6e'));
      tube.rotation.x = -0.9;
      tube.position.set(0, 1.4, 1.6);
      scope.add(tube);
      dome.add(scope);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const w = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), lit > r() ? glow('#ffd88a', 0.8) : mat('#3d4566'));
        w.position.set(Math.sin(a) * 3.11, h * 0.55, Math.cos(a) * 3.11);
        w.rotation.y = a;
        g.add(w);
      }
      ticks.push((t) => { dome.rotation.y = Math.sin(t * 0.15) * 1.2; });
      top = h + 3.6;
      break;
    }
    case 'office': {
      const h = 4 + s * 1.3;
      const body = windowBox(6.4, h, 5.4, wall, roof, lit, 'grid');
      body.position.y = h / 2;
      g.add(body);
      box(g, 6.8, 0.4, 5.8, mat('#d8d2c8'), 0, h, 0);
      // A water tower on the roof.
      for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) box(g, 0.1, 1, 0.1, mat('#6b5a4a'), 1.6 + x, h + 0.4, -1 + z);
      cyl(g, 0.9, 0.9, 1.2, mat('#9b7a5a'), 1.6, h + 1.4, -1, 10);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 0.6, 10), mat('#6b5a4a'));
      cone.position.set(1.6, h + 2.9, -1);
      g.add(cone);
      door(g, 2.72, 1.4, 2);
      top = h + 3.4;
      break;
    }
    case 'printshop': {
      const h = 3.2 + s * 0.5;
      const body = windowBox(7.4, h, 5.6, o.muted ? '#bbb' : '#f2f2f2', '#c9c9c9', lit, 'shop');
      body.position.y = h / 2;
      g.add(body);
      // CMYK stripes, because it's a print shop.
      ['#00aeef', '#ec008c', '#fff200', '#222'].forEach((c, i) => box(g, 7.42, 0.22, 5.62, mat(c), 0, h - 0.3 - i * 0.22, 0, false));
      awning(g, 4.4, '#ec008c', '#ffffff', 2.3, 2.8);
      const sg = sign('PRINT', 3, 0.8, '#222222', '#fff200');
      sg.position.set(0, h + 0.55, 1.5);
      g.add(sg);
      for (let i = 0; i < 3; i++) box(g, 0.9, 0.3 + i * 0.15, 0.65, mat('#fafafa'), -3 + i * 1.1, 0, 3.8);
      top = h + 1.8;
      break;
    }
    case 'clinic': {
      const h = 3.4 + s * 0.6;
      const body = windowBox(7, h, 5.6, o.muted ? '#bbb' : '#f7fbfa', '#cfe2de', lit, 'grid');
      body.position.y = h / 2;
      g.add(body);
      const cross = new THREE.Group();
      box(cross, 1.6, 0.5, 0.2, glow('#2fbf71', 1.2), 0, -0.25, 0, false);
      box(cross, 0.5, 1.6, 0.2, glow('#2fbf71', 1.2), 0, -0.8, 0, false);
      cross.position.set(0, h + 1.2, 1.4);
      g.add(cross);
      door(g, 2.82, 1.6, 2.1, '#8fd3c0');
      top = h + 2.4;
      break;
    }
    case 'cafe': {
      const h = 3 + s * 0.3;
      const body = windowBox(6, h, 4.6, o.muted ? '#bbb' : '#a8573a', '#6b3524', lit, 'shop');
      body.position.set(0, h / 2, -1.6);
      g.add(body);
      awning(g, 6, '#e94f3d', '#fff4e6', 2.4, 0.4);
      const sg = sign('CAFÉ', 2.6, 0.8, '#3a1f15', '#ffd9a8');
      sg.position.set(0, h + 0.5, -0.4);
      g.add(sg);
      // Tables out front under umbrellas.
      for (const x of [-2.4, 0.2, 2.8]) {
        cyl(g, 0.5, 0.5, 0.08, mat('#fafafa'), x, 0.75, 3.2, 10);
        cyl(g, 0.05, 0.05, 2.2, mat('#ccc'), x, 0, 3.2, 5);
        const u = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.5, 8), mat(x < 0 ? '#e94f3d' : '#3dbfa5'));
        u.position.set(x, 2.3, 3.2);
        u.castShadow = true;
        g.add(u);
      }
      const cup = smoke(g, 1.8, h + 0.3, -2.2, '#f4ede4');
      ticks.push(cup);
      cyl(g, 0.3, 0.3, 1, mat('#6b3524'), 1.8, h - 0.6, -2.2, 8);
      top = h + 2;
      break;
    }
    case 'bank': {
      const h = 3.4 + s * 0.6;
      box(g, 8, 0.6, 6.4, mat('#d9d3c5'));
      const body = windowBox(7, h, 4.4, o.muted ? '#bbb' : '#e8e2d2', '#bfb59f', lit * 0.6, 'grid');
      body.position.set(0, 0.6 + h / 2, -0.8);
      g.add(body);
      for (let i = 0; i < 4; i++) cyl(g, 0.3, 0.32, h, mat('#f4efe3'), -2.4 + i * 1.6, 0.6, 2, 10);
      box(g, 7.6, 0.6, 5.4, mat('#cbbf9f'), 0, 0.6 + h, -0.4);
      gable(g, 7.6, 1.2, 2.2, mat('#e2c46a', { metal: 0.5, rough: 0.4 }), 0, 1.2 + h, 1.6);
      const vault = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.2, 16), mat('#b8963e', { metal: 0.7, rough: 0.3 }));
      dyn(vault);
      vault.rotation.x = Math.PI / 2;
      vault.position.set(0, 1.6, 1.45);
      g.add(vault);
      ticks.push((t) => { vault.rotation.y = t * 0.4; });
      top = h + 3;
      break;
    }
    case 'park': {
      // Grass, a path, trees, birdhouses, and birds circling.
      box(g, 9.2, 0.08, 9.2, mat('#7cc47a'), 0, 0, 0, false);
      box(g, 1.4, 0.1, 9.2, mat('#e6d8b8'), 0, 0, 0, false);
      for (let i = 0; i < 6; i++) tree(g, (r() < 0.5 ? -1 : 1) * (2 + r() * 2.2), -3.8 + i * 1.5, 0.8 + r() * 0.5, r() < 0.4 ? 'pine' : 'round', ['#5fae6b', '#7cbf5a', '#4f9a6a'][i % 3]);
      for (let i = 0; i < 3; i++) {
        const x = -3.2 + i * 3.2;
        cyl(g, 0.06, 0.06, 1.8, mat('#7a5638'), x, 0, 3.8, 5);
        box(g, 0.6, 0.6, 0.6, mat(['#e9b44c', '#5aa7d6', '#e46b5b'][i]), x, 1.8, 3.8);
        gable(g, 0.8, 0.35, 0.8, mat('#6b4b3a'), x, 2.4, 3.8);
      }
      bench(g, 1.4, -0.5, -Math.PI / 2);
      const birds: THREE.Mesh[] = [];
      for (let i = 0; i < Math.min(6, 2 + s); i++) {
        const b = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 4), mat(['#3d5a80', '#e56b6f', '#f2cc8f'][i % 3]));
        dyn(b);
        b.rotation.z = Math.PI / 2;
        g.add(b);
        birds.push(b);
      }
      ticks.push((t) => birds.forEach((b, i) => {
        const a = t * (0.6 + i * 0.07) + i * 1.3;
        const rad = 2.5 + (i % 3);
        b.position.set(Math.cos(a) * rad, 4 + Math.sin(t * 2 + i) * 0.5 + (i % 2), Math.sin(a) * rad);
        b.rotation.y = -a;
      }));
      top = 5.5;
      break;
    }
    case 'pond': {
      box(g, 9.2, 0.08, 9.2, mat('#86c983'), 0, 0, 0, false);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.12, 24), mat('#4aa3d8', { rough: 0.15, metal: 0.2, emissive: '#1d6fa5', intensity: 0.15 }));
      water.scale.set(1, 1, 0.8);
      water.position.y = 0.1;
      g.add(water);
      for (let i = 0; i < 5; i++) {
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 8), mat('#3f8f4a'));
        pad.position.set(-2 + r() * 4, 0.18, -1.6 + r() * 3);
        g.add(pad);
      }
      box(g, 1, 0.2, 3, mat('#9b7350'), 2.6, 0.25, 1.8);
      cyl(g, 0.04, 0.04, 2, mat('#5a4030'), 2.8, 0.4, 0.5, 4).rotation.x = 0.6;
      for (let i = 0; i < 4; i++) tree(g, -4 + (i % 2) * 8, -4 + Math.floor(i / 2) * 8, 0.8, 'round', '#5fae6b');
      const fish = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 5), mat('#ff9447'));
      dyn(fish);
      g.add(fish);
      ticks.push((t) => {
        const k = (t * 0.4) % 3;
        fish.visible = k < 1;
        fish.position.set(-1 + k * 1.6, 0.2 + Math.sin(k * Math.PI) * 1.4, 0.5);
        fish.rotation.z = -Math.PI / 2 + Math.cos(k * Math.PI) * 1.2;
      });
      top = 4;
      break;
    }
    case 'garage': {
      const h = 3.2 + s * 0.3;
      const body = windowBox(7.6, h, 6, o.muted ? '#bbb' : '#8ea3b8', '#5d6f82', lit * 0.5, 'band');
      body.position.y = h / 2;
      g.add(body);
      for (let i = 0; i < 2; i++) {
        box(g, 2.6, 2.4, 0.12, mat('#d7dde3'), -1.8 + i * 3.6, 0, 3.02, false);
        for (let j = 0; j < 5; j++) box(g, 2.6, 0.04, 0.14, mat('#a9b2bc'), -1.8 + i * 3.6, 0.3 + j * 0.45, 3.04, false);
      }
      // A plow truck out front.
      const truck = new THREE.Group();
      box(truck, 1.6, 1.1, 1.4, mat('#f0a020'), 0.6, 0.3, 0);
      box(truck, 1.4, 0.7, 1.4, mat('#f0a020'), -0.9, 0.3, 0);
      box(truck, 0.2, 0.8, 1.9, mat('#d0d6dc'), 1.6, 0.1, 0);
      for (const [x, z] of [[-1, 0.7], [-1, -0.7], [0.8, 0.7], [0.8, -0.7]]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.25, 10), mat('#222'));
        w.rotation.x = Math.PI / 2;
        w.position.set(x, 0.32, z);
        truck.add(w);
      }
      truck.position.set(-2.4, 0, 4.4);
      g.add(truck);
      const sg = sign('GARAGE', 3, 0.7, '#2b3642', '#f0a020');
      sg.position.set(0, h - 0.5, 3.03);
      g.add(sg);
      top = h + 1.6;
      break;
    }
    case 'station': {
      const h = 2.8 + s * 0.4;
      const body = windowBox(5, h, 4, o.muted ? '#bbb' : '#e9c9a0', '#9a6b45', lit, 'grid');
      body.position.set(-1.6, h / 2, -1.6);
      g.add(body);
      gable(g, 5.4, 1.4, 4.4, mat('#4a5a7a'), -1.6, h, -1.6);
      box(g, 9, 0.4, 2.2, mat('#cfc8bd'), 0, 0, 2.6);
      for (const z of [3.9, 4.6]) box(g, 9.2, 0.08, 0.12, mat('#888'), 0, 0.05, z, false);
      const train = new THREE.Group();
      dyn(train);
      box(train, 3.2, 1.4, 1.1, mat('#e24f4f'), 0, 0.2, 0);
      box(train, 3.22, 0.3, 1.12, mat('#fff'), 0, 0.9, 0, false);
      train.position.set(0, 0, 4.25);
      g.add(train);
      ticks.push((t) => { train.position.x = Math.sin(t * 0.3) * 2.6; });
      const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16), mat('#fff'));
      clock.rotation.x = Math.PI / 2;
      clock.position.set(-1.6, h + 0.6, 0.7);
      g.add(clock);
      top = h + 2.4;
      break;
    }
    case 'house': {
      const h = 2.6 + s * 0.25;
      const body = windowBox(5.6, h, 4.6, wall, roof, lit, 'grid');
      body.position.set(0, h / 2, -0.6);
      g.add(body);
      gable(g, 6.2, 2, 5.2, mat(roof), 0, h, -0.6);
      box(g, 0.7, 1.6, 0.7, mat('#8d5a4a'), 1.6, h + 0.4, -1.4);
      ticks.push(smoke(g, 1.6, h + 2.2, -1.4));
      door(g, 1.72, 1, 1.8, '#4a6fb5');
      for (let i = 0; i < 3; i++) tree(g, -3.6 + i * 3.6, 3.6, 0.55, 'round');
      top = h + 3.4;
      break;
    }
    case 'factory': {
      const h = 3.4 + s * 0.45;
      const body = windowBox(8, h, 6, o.muted ? '#bbb' : '#c48b5a', '#7d5535', lit, 'band');
      body.position.y = h / 2;
      g.add(body);
      // A sawtooth roof and two stacks.
      for (let i = 0; i < 4; i++) gable(g, 8, 1.2, 1.5, mat('#6f8aa6'), 0, h, -2.25 + i * 1.5);
      cyl(g, 0.45, 0.55, 4, mat('#8d5a4a'), 2.6, h, -1.8, 10);
      cyl(g, 0.4, 0.5, 3.2, mat('#8d5a4a'), 3.6, h, -1.8, 10);
      ticks.push(smoke(g, 2.6, h + 4, -1.8, '#e4dfe8'));
      const sg = sign('STUDIO WORKS', 4.4, 0.8, '#2b2b38', '#ffb347');
      sg.position.set(0, h - 0.6, 3.02);
      g.add(sg);
      top = h + 5;
      break;
    }
    case 'helpdesk': {
      const h = 2.6 + s * 0.3;
      const body = windowBox(4.4, h, 3.6, o.muted ? '#bbb' : '#dfe8ff', '#9fb2dd', lit, 'shop');
      body.position.y = h / 2;
      g.add(body);
      const q = sign('?', 1.2, 1.2, '#3b6fe0', '#ffffff');
      q.position.set(0, h + 0.9, 1.82);
      g.add(q);
      cyl(g, 0.05, 0.05, 0.9, mat('#ccc'), 0, h, 1.7, 5);
      awning(g, 4.4, '#3b6fe0', '#ffffff', 2.2, 1.6);
      bench(g, -3, 3.4); bench(g, 3, 3.4);
      top = h + 2;
      break;
    }
    case 'depot': {
      const h = 3.2 + s * 0.4;
      const body = windowBox(7.6, h, 5.6, o.muted ? '#bbb' : '#2b2f3f', '#161926', lit * 0.8, 'band');
      body.position.y = h / 2;
      g.add(body);
      const sg = sign('BOT DEPOT', 4, 0.8, '#161926', '#7cf4ff');
      sg.position.set(0, h - 0.6, 2.82);
      g.add(sg);
      // Charging pads out front.
      const pads: THREE.Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 16), glow('#7cf4ff', 0.8));
        pad.position.set(-2.4 + i * 2.4, 0.05, 4);
        g.add(pad);
        pads.push(pad);
      }
      ticks.push((t) => pads.forEach((p, i) => { (p.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + Math.max(0, Math.sin(t * 2 - i)) * 1.2; }));
      const dish = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 3), mat('#ddd', { metal: 0.3 }));
      dyn(dish);
      dish.rotation.x = -0.9;
      dish.position.set(-2.4, h + 0.6, -1);
      g.add(dish);
      ticks.push((t) => { dish.rotation.z = Math.sin(t * 0.5) * 0.6; });
      top = h + 2;
      break;
    }
  }

  // A lamp post and a tree or two on every lot that isn't already all garden.
  if (kind !== 'park' && kind !== 'pond') {
    lamp(g, -4.4, 4.4);
    if (r() < 0.8) tree(g, 4.2, -4.1, 0.7 + r() * 0.3, r() < 0.3 ? 'pine' : 'round');
    if (r() < 0.5) tree(g, -4.2, -4.1, 0.6 + r() * 0.3, 'round', '#7cbf5a');
  }

  return {
    group: g,
    top,
    windows: collectWindows(g),
    tick: ticks.length ? (t, dt) => { for (const f of ticks) f(t, dt); } : undefined,
  };
}

// ---------- Town Hall, plaza, park, lots ----------

export function townHall(): Built {
  const g = new THREE.Group();
  // The plaza: the whole block, paved, with a fountain out front.
  box(g, 21, 0.1, 21, mat('#e8dccb'), 0, 0, 0, false);
  const h = 6;
  box(g, 13, 0.8, 9, mat('#efe6d8'), 0, 0, -3);
  box(g, 9, 0.5, 2, mat('#e2d6c4'), 0, 0, 2.2);
  const body = windowBox(12, h, 7.6, '#f6efe3', '#d8cbb5', 0.7, 'grid');
  body.position.set(0, 0.8 + h / 2, -3.4);
  g.add(body);
  for (let i = 0; i < 6; i++) cyl(g, 0.34, 0.36, h, mat('#fffaf0'), -4.5 + i * 1.8, 0.8, 0.9, 10);
  box(g, 12.4, 0.6, 2.2, mat('#efe6d8'), 0, 0.8 + h, 0.6);
  gable(g, 12.4, 1.6, 2.6, mat('#efe6d8'), 0, 1.4 + h, 0.6);
  // The drum and dome.
  cyl(g, 2.6, 2.8, 2.2, mat('#f6efe3'), 0, 0.8 + h, -3.4, 16);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#8c6cf2', { metal: 0.3, rough: 0.45 }));
  dome.position.set(0, 3 + h, -3.4);
  dome.castShadow = true;
  g.add(dome);
  const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 20), glow('#fff6dc', 0.5));
  clock.rotation.x = Math.PI / 2;
  clock.position.set(0, 1.9 + h, -0.8);
  g.add(clock);
  const hand = box(g, 0.08, 0.7, 0.05, mat('#333'), 0, 0, 0, false);
  dyn(hand);
  hand.position.set(0, 1.9 + h, -0.72);
  const sg = sign('TOWN HALL', 5, 0.8, '#efe6d8', '#5b3fbf');
  sg.position.set(0, 0.8 + h + 0.3, 1.72);
  g.add(sg);
  cyl(g, 0.06, 0.06, 3, mat('#ddd'), 0, 5.6 + h, -3.4, 5);
  const flag = box(g, 1.4, 0.8, 0.05, mat('#8c6cf2'), 0.7, 7.6 + h, -3.4, false);
  dyn(flag);
  // Fountain.
  cyl(g, 2.2, 2.4, 0.5, mat('#d8cdbd'), 0, 0, 6.4, 18);
  const water = cyl(g, 2, 2, 0.08, mat('#7cc6ef', { rough: 0.1, emissive: '#3a9bd6', intensity: 0.25 }), 0, 0.46, 6.4, 18);
  water.castShadow = false;
  cyl(g, 0.25, 0.35, 1.4, mat('#d8cdbd'), 0, 0.5, 6.4, 10);
  const jets: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const j = new THREE.Mesh(new THREE.SphereGeometry(0.12, 5, 4), mat('#bfe7ff', { emissive: '#bfe7ff', intensity: 0.3 }));
    dyn(j);
    g.add(j);
    jets.push(j);
  }
  for (const [x, z] of [[-8, 8], [8, 8], [-8, -8.6], [8, -8.6]]) tree(g, x, z, 1, 'round');
  for (const [x, z] of [[-4.5, 8.6], [4.5, 8.6]]) lamp(g, x, z);
  bench(g, -4, 5.2); bench(g, 4, 5.2);
  return {
    group: g,
    top: 12.5,
    windows: collectWindows(g),
    tick: (t) => {
      hand.rotation.z = -t * 0.2;
      flag.rotation.y = Math.sin(t * 2.6) * 0.2;
      jets.forEach((j, i) => {
        const k = (t * 0.9 + i / jets.length) % 1;
        const a = (i / jets.length) * Math.PI * 2;
        j.position.set(Math.cos(a) * k * 1.6, 1.9 + Math.sin(k * Math.PI) * 1.2, 6.4 + Math.sin(a) * k * 1.6);
      });
    },
  };
}

export function centralPark(): Built {
  const g = new THREE.Group();
  box(g, 21, 0.1, 21, mat('#86c983'), 0, 0, 0, false);
  // Paths in a cross and a pond in the middle.
  box(g, 21, 0.12, 1.6, mat('#e9dcc0'), 0, 0, 0, false);
  box(g, 1.6, 0.12, 21, mat('#e9dcc0'), 0, 0, 0, false);
  const pond = cyl(g, 3, 3, 0.16, mat('#5ab0e0', { rough: 0.15, emissive: '#2a80bb', intensity: 0.15 }), 0, 0.05, 0, 22);
  pond.castShadow = false;
  const r = rng(42);
  for (let i = 0; i < 18; i++) {
    const qx = r() < 0.5 ? -1 : 1, qz = r() < 0.5 ? -1 : 1;
    tree(g, qx * (2.4 + r() * 7.4), qz * (2.4 + r() * 7.4), 0.8 + r() * 0.6, r() < 0.35 ? 'pine' : 'round', ['#5fae6b', '#7cbf5a', '#4f9a6a', '#8fcf6a'][i % 4]);
  }
  bench(g, -4.6, 1.4); bench(g, 4.6, 1.4); bench(g, -4.6, -1.4, Math.PI); bench(g, 4.6, -1.4, Math.PI);
  for (const [x, z] of [[-1.4, -6], [1.4, 6], [-6, 1.4], [6, -1.4]]) lamp(g, x, z);
  // Little flower beds.
  for (let i = 0; i < 24; i++) sphere(g, 0.16, mat(['#ff7aa2', '#ffd166', '#c77dff', '#ffffff'][i % 4]), -9 + r() * 18, 0.2, (r() < 0.5 ? -1 : 1) * (8.4 + r() * 1.4), 5);
  return { group: g, top: 4, windows: [] };
}

/** An empty lot, waiting for whatever Kan starts next. */
export function freeLot(): Built {
  const g = new THREE.Group();
  box(g, 9.4, 0.06, 9.4, mat('#cdb991'), 0, 0, 0, false);
  for (let i = 0; i < 4; i++) box(g, 0.1, 0.5, 0.1, mat('#f5f5f5'), -4.4 + i * 2.9, 0, 4.5, false);
  box(g, 9, 0.06, 0.06, mat('#f5f5f5'), 0, 0.42, 4.5, false);
  cyl(g, 0.05, 0.05, 1.4, mat('#7a5638'), 3, 0, 3, 5);
  const s = sign('FREE', 1.6, 0.8, '#ffffff', '#5b3fbf');
  s.position.set(3, 1.6, 3.05);
  g.add(s);
  return { group: g, top: 2.5, windows: [] };
}

/**
 * A tower crane, for a lot Kan wants to build on or a building whose app is being
 * built. Its jib swings while it works.
 */
export function crane(height = 12, color = '#f2b632'): Built & { jib: THREE.Group } {
  const g = dyn(new THREE.Group());
  const m = mat(color);
  for (let i = 0; i < Math.round(height / 1.2); i++) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.6), new THREE.MeshStandardMaterial({ color, wireframe: true }));
    seg.position.y = 0.6 + i * 1.2;
    g.add(seg);
  }
  box(g, 0.5, height, 0.5, m, 0, 0, 0).scale.set(0.35, 1, 0.35);
  const jib = new THREE.Group();
  box(jib, 9, 0.4, 0.4, m, 2.2, 0, 0);
  box(jib, 1.2, 0.9, 0.9, mat('#555'), -2.6, -0.2, 0);
  box(jib, 0.9, 0.9, 0.9, mat('#3b4a66'), 0, -0.9, 0);
  const cable = box(jib, 0.04, 4, 0.04, mat('#333'), 5.4, -4, 0, false);
  const hook = box(jib, 0.7, 0.5, 0.7, mat('#c64'), 5.4, -4.5, 0);
  jib.position.y = height;
  g.add(jib);
  const tip = sphere(g, 0.15, glow('#ff4040', 2), 6.6, height + 0.5, 0, 5);
  jib.add(tip);
  tip.position.set(6.6, 0.4, 0);
  return {
    group: g,
    jib,
    top: height + 1,
    windows: [],
    tick: (t) => {
      jib.rotation.y = Math.sin(t * 0.25) * 1.4;
      const drop = 3 + Math.sin(t * 0.7) * 1.5;
      cable.scale.y = drop / 4;
      cable.position.y = -drop;
      hook.position.y = -drop - 0.5;
    },
  };
}

/** A construction site: a foundation, a fence and a crane. */
export function constructionSite(): Built {
  const g = new THREE.Group();
  box(g, 9.4, 0.06, 9.4, mat('#b9a27a'), 0, 0, 0, false);
  box(g, 6, 0.6, 6, mat('#a8a8a8'), 0, 0, -0.4);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) box(g, 0.2, 1.6 + ((i + j) % 3) * 0.8, 0.2, mat('#8a7f70'), -2.6 + i * 1.75, 0.6, -3 + j * 1.75);
  const c = crane(13);
  c.group.position.set(3.6, 0, -3.6);
  g.add(c.group);
  for (let i = 0; i < 5; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 6), mat(i % 2 ? '#ff7a2f' : '#ffffff'));
    cone.position.set(-4 + i * 2, 0.3, 4.3);
    g.add(cone);
  }
  return { group: g, top: 14.5, windows: [], tick: c.tick };
}

// ---------- People and things that move ----------

const bakedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: true });
/**
 * Squash a little model into one mesh, its parts' colors painted on its vertices, so
 * a car or a shroom is one draw call instead of eight.
 */
function bake(g: THREE.Group): THREE.Group {
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const parts: THREE.BufferGeometry[] = [];
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const material = m.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
    if ((material as THREE.MeshBasicMaterial).isMeshBasicMaterial) return; // shadows stay as they are
    let geo = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    if (geo.index) geo = geo.toNonIndexed();
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
    const c = material.color.clone();
    const std = material as THREE.MeshStandardMaterial;
    if (std.emissive && std.emissiveIntensity) c.add(std.emissive.clone().multiplyScalar(std.emissiveIntensity * 0.5));
    const colors = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(geo);
  });
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  const out = dyn(new THREE.Group());
  if (merged) out.add(new THREE.Mesh(merged, bakedMat));
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && (m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial) out.add(m.clone()); });
  return out;
}

const BOT_COLORS = ['#2fd3b0', '#ff5d8f', '#ff9f1c', '#8b5cf6', '#3b82f6', '#22c55e', '#06b6d4', '#f43f5e', '#eab308', '#a855f7'];

/** A bot: a soft blob with two eyes, in its own color. */
export function botFigure(seed: number): { group: THREE.Group; body: THREE.Mesh; color: string } {
  const g = dyn(new THREE.Group());
  const color = BOT_COLORS[seed % BOT_COLORS.length];
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.45, emissive: new THREE.Color(color), emissiveIntensity: 0.15 }));
  body.scale.set(1, 0.95, 0.9);
  body.position.y = 0.8;
  body.castShadow = true;
  g.add(body);
  for (const x of [-0.24, 0.24]) {
    const eye = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.18, 3, 6), mat('#ffffff', { emissive: '#ffffff', intensity: 0.4 }));
    eye.position.set(x, 0.95, 0.66);
    g.add(eye);
  }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 14), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  g.add(shadow);
  return { group: g, body, color };
}

/** Kan: the mushroom, violet cap with spots. */
export function kanFigure(): THREE.Group {
  const g = dyn(new THREE.Group());
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 1.1, 12), mat('#f6ecd9', { rough: 0.6 }));
  stem.position.y = 0.55;
  stem.castShadow = true;
  g.add(stem);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1.05, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#8b5cf6', roughness: 0.5, emissive: new THREE.Color('#8b5cf6'), emissiveIntensity: 0.25 }));
  cap.scale.set(1, 0.75, 1);
  cap.position.y = 1.05;
  cap.castShadow = true;
  g.add(cap);
  for (const [x, y, z] of [[0.4, 1.6, 0.5], [-0.5, 1.5, 0.45], [0, 1.78, -0.2], [0.65, 1.4, -0.45]]) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), mat('#ffffff'));
    s.position.set(x, y, z);
    g.add(s);
  }
  for (const x of [-0.16, 0.16]) {
    const eye = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.12, 3, 6), mat('#2b2140'));
    eye.position.set(x, 0.7, 0.44);
    g.add(eye);
  }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.8, 14), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  g.add(shadow);
  return g;
}

/** A little shroom that lives in a yard. Automatic ones glow. */
export function shroomFigure(seed: number, automatic: boolean): THREE.Group {
  const g = dyn(new THREE.Group());
  const caps = ['#ef4444', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6'];
  const c = caps[seed % caps.length];
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.4, 8), mat('#f6ecd9'));
  stem.position.y = 0.2;
  g.add(stem);
  const capMat = automatic ? glow(c, 0.5) : mat(c);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
  cap.position.y = 0.38;
  cap.scale.set(1, 0.8, 1);
  cap.castShadow = true;
  g.add(cap);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), mat('#ffffff'));
  dot.position.set(0.12, 0.6, 0.1);
  g.add(dot);
  return bake(g);
}

const CAR_COLORS = ['#e94f3d', '#3b82f6', '#f5f5f5', '#22c55e', '#8b5cf6', '#ff9f1c', '#1f2937'];
export function car(seed: number, cab = false): THREE.Group {
  const g = dyn(new THREE.Group());
  const color = cab ? '#f7c531' : CAR_COLORS[seed % CAR_COLORS.length];
  box(g, 2.2, 0.7, 1.1, mat(color, { rough: 0.4 }), 0, 0.25, 0);
  box(g, 1.2, 0.55, 1, mat('#a8c8e8', { rough: 0.2, metal: 0.3 }), -0.1, 0.95, 0);
  if (cab) box(g, 0.5, 0.2, 0.3, glow('#fff3b0', 1), -0.1, 1.5, 0);
  for (const [x, z] of [[-0.7, 0.55], [-0.7, -0.55], [0.7, 0.55], [0.7, -0.55]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.2, 8), mat('#1a1a1a'));
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.25, z);
    g.add(w);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.8), glow('#fff6d0', 1.2));
  head.position.set(1.11, 0.5, 0);
  g.add(head);
  return bake(g);
}

/** An unbuilt lot on the edge of town: trees, flowers, sometimes a little pond. */
export function grove(seed: number): Built {
  const g = new THREE.Group();
  const r = rng(seed);
  box(g, 9.6, 0.06, 9.6, mat(r() < 0.5 ? '#a9d48f' : '#9fcd8a'), 0, 0, 0, false);
  if (r() < 0.25) {
    const w = cyl(g, 1.8, 1.8, 0.1, mat('#5ab0e0', { rough: 0.15, emissive: '#2a80bb', intensity: 0.15 }), (r() - 0.5) * 3, 0.04, (r() - 0.5) * 3, 16);
    w.castShadow = false;
  }
  const n = 3 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) tree(g, (r() - 0.5) * 8, (r() - 0.5) * 8, 0.7 + r() * 0.6, r() < 0.4 ? 'pine' : 'round', ['#5fae6b', '#7cbf5a', '#4f9a6a', '#8fcf6a'][i % 4]);
  for (let i = 0; i < 8; i++) sphere(g, 0.14, mat(['#ff7aa2', '#ffd166', '#c77dff', '#ffffff'][i % 4]), (r() - 0.5) * 8.6, 0.16, (r() - 0.5) * 8.6, 5);
  return { group: g, top: 3, windows: [] };
}
