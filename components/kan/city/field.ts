import * as THREE from 'three';
import { hash } from '@/lib/kan/city/layout';
import { Grid, type Vec } from './grid';
import { botFigure, dyn, mat, sign, tree, type BotFig } from './models';
import type { Rect } from './market';
import type { CityData } from './types';

/**
 * The Sprout Field: countryside out past the west edge of Kan City, where ideas grow
 * before they're born. Each sprout is a baby bot buried in a row of tilled soil,
 * poking further out of the ground the more it has grown. A rain cloud hangs over
 * the ones that grew in the last day; the ready ones glow. When one is sent to the
 * big city it pops out of the ground, and a cab brings it into town from this side.
 *
 * A dirt road runs from the field's gate to the city's west edge.
 */

export type FieldSprout = CityData['field'][number];

export interface Field {
  group: THREE.Group;
  ticks: ((t: number, dt: number) => void)[];
  /** The whole field, for walking and the camera. */
  bounds: Rect;
  /** The dirt road to town. */
  road: Rect;
  /** Where each sprout can grow, nearest the gate first. */
  slots: Vec[];
  /** The gate, where the road meets the field. */
  gate: Vec;
}

const GAP = 14;
const COLS = 4;
const ROWS = 3;
const SPACE_X = 8;
const SPACE_Z = 9;

function box(g: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, shadow = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

export function buildField(grid: Grid): Field {
  const g = new THREE.Group();
  const ticks: Field['ticks'] = [];
  const W = grid.width;
  const w = COLS * SPACE_X + 10, d = ROWS * SPACE_Z + 12;
  const x1 = -W / 2 - 3 - GAP, x0 = x1 - w;
  const z0 = -d / 2, z1 = d / 2;
  const cx = (x0 + x1) / 2;
  const bounds: Rect = { x0, z0, x1, z1 };

  // The ground: earth under grass, the same height as the city's island.
  const earth = new THREE.Mesh(new THREE.BoxGeometry(w, 5, d), mat('#6b4f3a'));
  earth.position.set(cx, -2.6, 0);
  g.add(earth);
  box(g, w, 0.56, d, mat('#9fcf7e'), cx, -0.2, 0);

  // Tilled rows, one per row of sprouts.
  const slots: Vec[] = [];
  const soil = mat('#7a5a40', { rough: 1 });
  const furrow = mat('#5f4532', { rough: 1 });
  for (let r = 0; r < ROWS; r++) {
    const z = z0 + 8 + r * SPACE_Z;
    box(g, w - 6, 0.08, 4.2, soil, cx, 0.32, z);
    for (const dz of [-1.3, 0, 1.3]) box(g, w - 6.4, 0.06, 0.22, furrow, cx, 0.4, z + dz);
    for (let c = 0; c < COLS; c++) slots.push({ x: x1 - 6 - c * SPACE_X, z });
  }
  // Scattered across the rows, so even a few sprouts fill the field. (Slot k is column k % 4, east first.)
  const order = Array.from({ length: COLS * ROWS }, (_, k) => [1, 0, 2][(k + Math.floor(k / COLS)) % ROWS] * COLS + (k % COLS));
  const scattered = order.map((i) => slots[i]);
  slots.length = 0;
  slots.push(...scattered);

  // A split-rail fence, with a gap for the gate on the town side.
  const wood = mat('#a47a52');
  const gate = { x: x1, z: 0 };
  const posts: Vec[] = [];
  for (let x = x0 + 1; x <= x1 - 1; x += 4) { posts.push({ x, z: z0 + 1 }, { x, z: z1 - 1 }); }
  for (let z = z0 + 1; z <= z1 - 1; z += 4) { posts.push({ x: x0 + 1, z }); if (Math.abs(z) > 3) posts.push({ x: x1 - 1, z }); }
  for (const p of posts) box(g, 0.3, 1.4, 0.3, wood, p.x, 0.3, p.z, true);
  for (const y of [0.85, 1.35]) {
    box(g, w - 2, 0.12, 0.12, wood, cx, y, z0 + 1);
    box(g, w - 2, 0.12, 0.12, wood, cx, y, z1 - 1);
    box(g, 0.12, 0.12, d - 2, wood, x0 + 1, y, 0);
    for (const s of [-1, 1]) box(g, 0.12, 0.12, d / 2 - 4, wood, x1 - 1, y, s * (d / 4 + 1.5));
  }

  // The sign over the gate.
  for (const s of [-1, 1]) box(g, 0.4, 4.6, 0.4, wood, x1 - 1, 0.3, s * 3, true);
  const board = sign('SPROUT FIELD', 6.4, 1.3, '#5b3f2a', '#f8e7b0');
  board.position.set(x1 - 0.7, 4.3, 0);
  board.rotation.y = Math.PI / 2;
  g.add(board);
  const back = board.clone();
  back.rotation.y = -Math.PI / 2;
  back.position.x = x1 - 1.3;
  g.add(back);

  // The road to town, and a little stop where the city cab picks them up.
  const road: Rect = { x0: x1 - 2, z0: -2.2, x1: -W / 2 - 2, z1: 2.2 };
  box(g, road.x1 - road.x0, 0.1, road.z1 - road.z0, mat('#c9a77c', { rough: 1 }), (road.x0 + road.x1) / 2, 0.05, 0);
  box(g, 0.18, 2.6, 0.18, mat('#4b5563'), x1 + 3, 0.1, 3.2, true);
  const stop = sign('TO THE BIG CITY →', 3.2, 0.7, '#facc15', '#1f2937');
  stop.position.set(x1 + 3, 2.4, 3.3);
  g.add(stop);

  // Trees along the far edges, and a scarecrow keeping watch.
  for (let i = 0; i < 7; i++) tree(g, x0 - 2.5, z0 + 3 + i * (d - 6) / 6, 0.9 + (i % 3) * 0.15, i % 2 ? 'pine' : 'round');
  for (let i = 0; i < 5; i++) tree(g, cx - w / 2 + 6 + i * (w - 12) / 4, z0 - 2.5, 0.8 + (i % 2) * 0.2, 'round', '#7cbf5a');
  const crow = new THREE.Group();
  box(crow, 0.18, 2.6, 0.18, wood, 0, 0, 0, true);
  box(crow, 2.2, 0.16, 0.16, wood, 0, 1.9, 0, true);
  box(crow, 0.9, 1, 0.5, mat('#3b82f6'), 0, 1.4, 0, true);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), mat('#f5deb3'));
  head.position.y = 2.75;
  crow.add(head);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.55, 10), mat('#d4a24c'));
  hat.position.y = 3.15;
  crow.add(hat);
  crow.position.set(x0 + 4, 0.3, z1 - 4);
  g.add(crow);

  return { group: g, ticks, bounds, road, slots, gate };
}

/** How far out of the ground a sprout stands, from its growth. */
export function sproutDepth(growth: number) {
  const k = Math.max(0, Math.min(100, growth)) / 100;
  return 2.25 - 1.95 * k;
}

export interface SproutView {
  sprout: FieldSprout;
  fig: BotFig;
  group: THREE.Group;
  mound: THREE.Mesh;
  cloud: THREE.Group;
  glow: THREE.Mesh;
  at: Vec;
  /** Where it's rising to, so a watered sprout grows up rather than jumps. */
  depth: number;
  shown: number;
  /** Set when it's leaving for the city: when it started. */
  leaving: number | null;
}

/** A baby bot in its mound, with its own rain cloud and glow (shown when they apply). */
export function sproutView(s: FieldSprout, at: Vec, ground: number): SproutView {
  const group = dyn(new THREE.Group());
  group.position.set(at.x, 0, at.z);
  const fig = botFigure(hash(s.id));
  fig.band.visible = false;
  fig.sweat.visible = false;
  fig.group.scale.setScalar(1.8);
  fig.group.rotation.y = Math.PI / 2;
  const depth = sproutDepth(s.growth);
  fig.group.position.y = ground - depth;
  group.add(fig.group);

  const mound = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.2, 0.3, 12), mat('#6b4c35', { rough: 1 }));
  mound.position.y = ground;
  mound.receiveShadow = true;
  group.add(mound);

  // A soft ring of light under one that's ready for the city.
  const glow = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.75, 28), new THREE.MeshBasicMaterial({ color: '#fde68a', transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = ground + 0.2;
  group.add(glow);

  // Its rain cloud: a few puffs and falling drops.
  const cloud = new THREE.Group();
  const puff = new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 1, flatShading: true });
  for (const [x, y, r] of [[-0.7, 0, 0.75], [0.1, 0.2, 0.95], [0.85, 0, 0.7], [0.15, -0.15, 0.7]] as const) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), puff);
    m.position.set(x, y, 0);
    cloud.add(m);
  }
  const dropMat = new THREE.MeshBasicMaterial({ color: '#60a5fa' });
  const drops: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const drop = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.36, 0.07), dropMat);
    drop.position.set(((i * 37) % 13) / 13 * 1.8 - 0.9, 0, ((i * 53) % 7) / 7 * 0.8 - 0.4);
    drop.userData.phase = i / 7;
    cloud.add(drop);
    drops.push(drop);
  }
  cloud.userData.drops = drops;
  cloud.position.y = 6.2;
  group.add(cloud);

  return { sprout: s, fig, group, mound, cloud, glow, at, depth, shown: depth, leaving: null };
}

/** One frame: rise toward its growth, rain, glow, wiggle; or pop out and leave. */
export function stepSprout(v: SproutView, t: number, dt: number, ground: number): boolean {
  const s = v.sprout;
  if (v.leaving !== null) {
    // Out of the ground, a happy hop, then off it goes.
    const k = (t - v.leaving) / 1.6;
    v.shown = Math.max(-0.2, v.shown - dt * 3);
    const hop = k > 0.4 ? Math.abs(Math.sin((k - 0.4) * 9)) * 1.2 : 0;
    v.fig.group.position.y = ground - v.shown + hop;
    v.cloud.visible = false;
    v.glow.visible = false;
    if (k > 1) v.fig.group.scale.setScalar(Math.max(0.01, 1.8 * (1 - (k - 1) * 2)));
    return k < 1.5;
  }
  v.shown += (v.depth - v.shown) * Math.min(1, dt * 1.5);
  const wiggle = Math.sin(t * 2 + hash(s.id) % 10) * 0.08;
  v.fig.group.position.y = ground - v.shown + (s.ready ? Math.abs(Math.sin(t * 2.4 + (hash(s.id) % 7))) * 0.25 : 0);
  v.fig.group.rotation.z = wiggle;
  v.cloud.visible = s.raining;
  if (s.raining) {
    v.cloud.position.x = Math.sin(t * 0.6 + (hash(s.id) % 5)) * 0.3;
    for (const d of v.cloud.userData.drops as THREE.Mesh[]) {
      const p = (t * 1.3 + (d.userData.phase as number)) % 1;
      d.position.y = -0.6 - p * (6.2 - ground - 0.4);
    }
  }
  v.glow.visible = s.ready;
  if (s.ready) (v.glow.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 3) * 0.3;
  return true;
}
