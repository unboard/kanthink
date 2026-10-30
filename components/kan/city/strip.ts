import * as THREE from 'three';
import { hash } from '@/lib/kan/city/layout';
import { Grid, ROAD, type Vec } from './grid';
import { dyn, mat, nightGlows, sign, windowBox } from './models';
import type { CityData } from './types';

/**
 * The Strip: every app you've built, as a neon district off the edge of town.
 * It's the city's Las Vegas. Money decides the look and the address:
 *
 * - **Earning** apps are gold casinos with a giant spinning coin and marquee bulbs,
 *   on the lots nearest town.
 * - **Selling** apps (priced, or taking reservations) are dark towers in neon with a
 *   turning dollar sign.
 * - **Free** apps are small pastel places with one neon trim.
 *
 * Streets run across, a spine road runs out from the city to join them, and as you
 * build more apps the Strip grows another street.
 */

export type StripApp = CityData['apps'][number];
export interface Rect { x0: number; z0: number; x1: number; z1: number }
export interface StripLot { app: StripApp; group: THREE.Group; center: Vec; door: Vec; top: number; footprint: Rect }
export interface Strip {
  group: THREE.Group;
  lots: StripLot[];
  ticks: ((t: number, dt: number) => void)[];
  /** Where cars may drive. */
  roads: Rect[];
  /** The whole district, for walking and the camera. */
  bounds: Rect;
  /** Where the spine road meets the city. */
  gate: Vec;
}

const NEON = ['#ff3cac', '#00e5ff', '#7cff4f', '#ffd23f', '#b14bff', '#ff6b35'];
const PASTEL = ['#f7c6d9', '#c6e6f7', '#d9f7c6', '#f7ecc6', '#e3d1f7', '#ffd8c2'];
const LOT = 11;
const BAND = 30;

const inside = (r: Rect, x: number, z: number, pad = 0) => x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
export { inside as inRect };

function neonMat(color: string, intensity = 1.6) {
  const m = mat(color, { emissive: color, intensity });
  nightGlows.add(m);
  return m;
}

function box(g: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, shadow = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

/**
 * A neon frame around a roof's edge. Four strips standing just outside the walls,
 * never a slab: a slab level with the roof fights it for the same pixels and the
 * roof shimmers as you pan.
 */
function rim(g: THREE.Object3D, w: number, y: number, m: THREE.Material, t = 0.22, hgt = 0.26) {
  const o = w / 2 + t / 2 + 0.02;
  box(g, w + 2 * t + 0.04, hgt, t, m, 0, y, o);
  box(g, w + 2 * t + 0.04, hgt, t, m, 0, y, -o);
  box(g, t, hgt, w, m, o, y, 0);
  box(g, t, hgt, w, m, -o, y, 0);
}

function palm(g: THREE.Object3D, x: number, z: number) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 4.2, 6), mat('#8b6a45'));
  trunk.position.set(x, 2.1, z);
  trunk.rotation.z = 0.08;
  g.add(trunk);
  const leaf = mat('#3fa66a');
  for (let i = 0; i < 6; i++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.5), leaf);
    const a = (i / 6) * Math.PI * 2;
    l.position.set(x + Math.cos(a) * 0.9 + 0.3, 4.1, z + Math.sin(a) * 0.9);
    l.rotation.set(0, -a, -0.35);
    g.add(l);
  }
}

/** One app's building. Its door faces +z; the caller turns it to face the street. */
function casino(app: StripApp, bulbs: [THREE.Material, THREE.Material], ticks: Strip['ticks']): { group: THREE.Group; top: number; half: number } {
  const g = new THREE.Group();
  const seed = hash(app.id);
  const neon = NEON[seed % NEON.length];
  box(g, 9.6, 0.2, 9.6, mat('#1d1a2b'), 0, 0, 0);

  let w: number, h: number, top: number;
  if (app.tier === 'earning') {
    w = 8.2;
    h = 12 + Math.min(9, Math.log2(1 + app.earnedCents / 100) * 2.2);
    const body = windowBox(w, h, w, '#e9cf86', '#b8902f', 0.85, 'glass');
    body.position.y = 0.2 + h / 2;
    g.add(body);
    // A gold crown and a giant coin that never stops turning.
    box(g, w + 0.6, 0.6, w + 0.6, mat('#d4a52c', { metal: 0.6, rough: 0.35 }), 0, 0.2 + h, 0, true);
    const coin = dyn(new THREE.Group());
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.5, 32), mat('#ffcc33', { metal: 0.7, rough: 0.3, emissive: '#ffae00', intensity: 0.6 }));
    disc.rotation.x = Math.PI / 2;
    coin.add(disc);
    for (const side of [1, -1]) {
      const face = sign('$', 3, 3, '#ffcc33', '#9a6400');
      face.position.z = side * 0.27;
      face.rotation.y = side === 1 ? 0 : Math.PI;
      coin.add(face);
    }
    coin.position.y = 0.2 + h + 0.6 + 3;
    g.add(coin);
    ticks.push((t) => { coin.rotation.y = t * 1.6 + seed; coin.position.y = 0.2 + h + 3.6 + Math.sin(t * 2 + seed) * 0.25; });
    // A gold beam into the sky.
    const beam = dyn(new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 2.2, 40, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    ));
    beam.position.y = 0.2 + h + 22;
    g.add(beam);
    top = h + 7;
  } else if (app.tier === 'selling') {
    w = 7.6;
    h = 9 + (seed % 4);
    const body = windowBox(w, h, w, '#2b2140', '#1a1428', 0.55, 'glass');
    body.position.y = 0.2 + h / 2;
    g.add(body);
    const n = neonMat(neon, 1.8);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 0.22, h, 0.22, n, (x * w) / 2, 0.2, (z * w) / 2);
    rim(g, w, 0.2 + h - 0.2, n);
    // A neon dollar sign that turns slowly on the roof.
    const spin = dyn(new THREE.Group());
    for (const side of [1, -1]) {
      const face = sign('$', 2.6, 2.6, '#140d22', neon);
      face.position.z = side * 0.05;
      face.rotation.y = side === 1 ? 0 : Math.PI;
      spin.add(face);
    }
    spin.position.y = 0.2 + h + 2;
    g.add(spin);
    ticks.push((t) => { spin.rotation.y = t * 0.8 + seed; });
    top = h + 3.5;
  } else {
    w = 6.8;
    h = 4.5 + (seed % 3) * 0.9;
    const body = windowBox(w, h, w, PASTEL[seed % PASTEL.length], PASTEL[(seed + 3) % PASTEL.length], 0.45, 'shop');
    body.position.y = 0.2 + h / 2;
    g.add(body);
    rim(g, w, 0.2 + h - 0.18, neonMat(neon, 1.3), 0.18, 0.22);
    top = h;
  }

  // The marquee over the door, with its name.
  const marquee = sign(app.title, Math.min(w, 7.4), 1.5, '#120d1f', app.tier === 'earning' ? '#ffd76a' : neon);
  marquee.position.set(0, Math.min(3.4, h - 0.8), w / 2 + 0.08);
  g.add(marquee);
  if (app.tier !== 'free') {
    // Bulbs that chase around the marquee.
    const bulb = new THREE.SphereGeometry(0.13, 6, 4);
    const mw = Math.min(w, 7.4), y0 = Math.min(3.4, h - 0.8);
    let i = 0;
    for (let x = -mw / 2; x <= mw / 2 + 0.01; x += 0.62) {
      for (const dy of [-0.88, 0.88]) {
        const b = new THREE.Mesh(bulb, bulbs[i++ % 2]);
        b.position.set(x, y0 + dy, w / 2 + 0.16);
        g.add(b);
      }
    }
  }
  // A canopy and a red carpet, so the door reads as the way in.
  box(g, 3.2, 0.12, 1.6, neonMat(app.tier === 'earning' ? '#ffcc33' : neon, 0.9), 0, 2.4, w / 2 + 0.8);
  box(g, 2, 0.04, 2.4, mat(app.tier === 'earning' ? '#b3122e' : '#3a2b55'), 0, 0.2, w / 2 + 1.3);
  return { group: g, top: top + 0.2, half: w / 2 };
}

export function buildStrip(grid: Grid, apps: StripApp[]): Strip | null {
  if (!apps.length) return null;
  const g = new THREE.Group();
  const ticks: Strip['ticks'] = [];
  const W = grid.width, D = grid.depth;
  const sx = grid.lineX(Math.floor(grid.blocksX / 2));
  const z0 = D / 2 + 7;

  // Lots along each street, both sides, skipping the spine.
  const xs: number[] = [];
  for (let x = -W / 2 + 7; x <= W / 2 - 7; x += LOT) if (Math.abs(x - sx) > 8) xs.push(x);
  const perStreet = xs.length * 2;
  const streets = Math.max(1, Math.ceil(apps.length / perStreet));
  const zEnd = z0 + streets * BAND;
  const bounds: Rect = { x0: -W / 2 - 3, z0: D / 2 + 3, x1: W / 2 + 3, z1: zEnd + 2 };

  // The ground: a dark plaza, a road along each street and a spine out from the city.
  const base = new THREE.Mesh(new THREE.BoxGeometry(bounds.x1 - bounds.x0, 5, bounds.z1 - bounds.z0), mat('#2a2440'));
  base.position.set(0, -2.6, (bounds.z0 + bounds.z1) / 2);
  g.add(base);
  box(g, bounds.x1 - bounds.x0, 0.2, bounds.z1 - bounds.z0, mat('#3a3550', { rough: 0.95 }), 0, -0.1, (bounds.z0 + bounds.z1) / 2);
  const roads: Rect[] = [];
  const asphalt = mat('#24212f', { rough: 0.9 });
  const dash = neonMat('#ffd23f', 0.6);
  const curb = neonMat('#ff3cac', 0.7);
  const lastRoad = z0 + (streets - 1) * BAND + 15;
  const spine: Rect = { x0: sx - ROAD / 2 - 0.5, z0: grid.lineZ(grid.blocksZ) - ROAD / 2, x1: sx + ROAD / 2 + 0.5, z1: lastRoad + 3.5 };
  roads.push(spine);
  box(g, spine.x1 - spine.x0, 0.06, spine.z1 - (D / 2 + 3), asphalt, sx, 0.1, (D / 2 + 3 + spine.z1) / 2);
  for (let z = D / 2 + 5; z < spine.z1 - 2; z += 3) box(g, 0.16, 0.04, 1.4, dash, sx, 0.17, z);
  const slots: { x: number; z: number; facing: 1 | -1; street: number }[] = [];
  for (let s = 0; s < streets; s++) {
    const zr = z0 + s * BAND + 15;
    const r: Rect = { x0: bounds.x0 + 1, z0: zr - 3.5, x1: bounds.x1 - 1, z1: zr + 3.5 };
    roads.push(r);
    box(g, r.x1 - r.x0, 0.06, 7, asphalt, 0, 0.1, zr);
    for (let x = r.x0 + 2; x < r.x1 - 2; x += 3) if (Math.abs(x - sx) > 4) box(g, 1.4, 0.04, 0.16, dash, x, 0.17, zr);
    // Neon curbs on both sides of the street.
    for (const side of [-1, 1]) box(g, r.x1 - r.x0, 0.12, 0.18, curb, 0, 0.1, zr + side * 3.6);
    for (const x of xs) {
      slots.push({ x, z: zr - 9.6, facing: 1, street: s });
      slots.push({ x, z: zr + 9.6, facing: -1, street: s });
      if (Math.round((x - xs[0]) / LOT) % 2 === 0) { palm(g, x + LOT / 2, zr - 4.6); palm(g, x + LOT / 2, zr + 4.6); }
    }
  }
  // The best lots are nearest the city, on the first street, closest to the spine.
  slots.sort((a, b) => a.street - b.street || Math.abs(a.x - sx) - Math.abs(b.x - sx) || a.facing - b.facing || a.x - b.x);

  // The arch where the spine leaves the city.
  const archZ = D / 2 + 5;
  const pylon = neonMat('#ff3cac', 1.4);
  for (const side of [-1, 1]) box(g, 0.8, 9, 0.8, pylon, sx + side * 5.2, 0, archZ);
  const archSign = sign('THE STRIP', 11, 2.4, '#1a0f2e', '#ffd23f');
  archSign.position.set(sx, 8.4, archZ);
  g.add(archSign);
  const back = archSign.clone();
  back.rotation.y = Math.PI;
  back.position.z = archZ - 0.02;
  g.add(back);

  // Marquee bulbs blink in two alternating sets.
  const bulbs: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial] = [
    mat('#fff2c0', { emissive: '#ffd66b', intensity: 1.6 }) as THREE.MeshStandardMaterial,
    mat('#fff2c1', { emissive: '#ffd66c', intensity: 0.3 }) as THREE.MeshStandardMaterial,
  ];
  ticks.push((t) => {
    const on = Math.floor(t * 3) % 2 === 0;
    bulbs[0].emissiveIntensity = on ? 1.8 : 0.25;
    bulbs[1].emissiveIntensity = on ? 0.25 : 1.8;
  });

  const lots: StripLot[] = [];
  apps.forEach((app, i) => {
    const slot = slots[i];
    if (!slot) return;
    const c = casino(app, bulbs, ticks);
    c.group.position.set(slot.x, 0.05, slot.z);
    c.group.rotation.y = slot.facing === 1 ? 0 : Math.PI;
    g.add(c.group);
    lots.push({
      app,
      group: c.group,
      center: { x: slot.x, z: slot.z },
      door: { x: slot.x, z: slot.z + slot.facing * (c.half + 2.2) },
      top: c.top,
      footprint: { x0: slot.x - c.half - 0.3, z0: slot.z - c.half - 0.3, x1: slot.x + c.half + 0.3, z1: slot.z + c.half + 0.3 },
    });
  });

  // A few cars cruising the Strip.
  for (let i = 0; i < Math.min(6, streets * 2); i++) {
    const s = i % streets;
    const zr = z0 + s * BAND + 15 + (i % 2 ? 1.4 : -1.4);
    const carG = dyn(new THREE.Group());
    box(carG, 2.2, 0.7, 1.1, mat(NEON[(i * 2) % NEON.length], { rough: 0.35 }), 0, 0.25, 0);
    box(carG, 1.2, 0.55, 1, mat('#a8c8e8', { rough: 0.2, metal: 0.3 }), -0.1, 0.95, 0);
    g.add(carG);
    const dir = i % 2 ? 1 : -1;
    const span = bounds.x1 - bounds.x0 - 6;
    const speed = 7 + (i % 3) * 2;
    ticks.push((t) => {
      const k = ((t * speed + i * 37) % span) - span / 2;
      carG.position.set(dir * k, 0.15, zr);
      carG.rotation.y = dir === 1 ? 0 : Math.PI;
    });
  }

  return { group: g, lots, ticks, roads, bounds, gate: { x: sx, z: archZ } };
}
