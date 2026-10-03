// Clean Cut — the day's job board and the yards behind each job.
//
// Every yard is generated from a template plus a seed, so the daily challenge gives
// everyone the same lawns. Sites are plain data; the renderer and the field grid
// both read them.

import { makeRng, type Rng } from './rng';
import { Field, RES } from './field';
import { blob, chaikin, circlePoly, polyBounds, rect, stripPolys } from './geom';
import type {
  BedDef, FenceDef, HardDef, HouseDef, JobDef, PatternRequest, Poly, PropDef, SiteDef,
  TemplateId, TreeDef, TreeKind, Vec2,
} from './types';

// ———————————————————————————————————————— palettes

const BODY_COLORS = ['#e9e2d0', '#d8d2c4', '#c9d3d6', '#e6dcc0', '#b9c4b0', '#dcc9b5', '#f0ece2', '#a9b7c2'];
const TRIM_COLORS = ['#ffffff', '#f4f1ea', '#2e3a33', '#36414d'];
const DOOR_COLORS = ['#7a1f22', '#1f3b5c', '#2f4a2d', '#1d1d1d', '#a65a1c', '#5b2a4a'];
const FLOWER_SETS = [
  ['#e8433f', '#f2c14e', '#ffffff'],
  ['#c94f9b', '#f3a6c8', '#ffffff'],
  ['#f28c28', '#ffd23f', '#e8433f'],
  ['#7a5cc7', '#b9a3f0', '#ffffff'],
  ['#ff6f91', '#ffc75f', '#f9f871'],
];

function house(rng: Rng, partial: Partial<HouseDef> & Pick<HouseDef, 'x' | 'z' | 'w' | 'd'>): HouseDef {
  return {
    rot: 0,
    stories: rng.chance(0.55) ? 2 : 1,
    style: rng.pick(['brick', 'plaster', 'siding', 'siding'] as const),
    body: rng.pick(BODY_COLORS),
    trim: rng.pick(TRIM_COLORS),
    door: rng.pick(DOOR_COLORS),
    roof: rng.chance(0.3) ? 'hip' : 'gable',
    kind: 'home',
    ...partial,
  };
}

function tree(rng: Rng, x: number, z: number, kind?: TreeKind, ring = true, scale = 1): TreeDef {
  const k = kind ?? rng.pick(['oak', 'maple', 'maple', 'birch', 'oak', 'ornamental'] as const);
  const base = k === 'pine' ? 9 : k === 'ornamental' ? 4.2 : k === 'birch' ? 8 : 9.5;
  const height = base * rng.range(0.85, 1.15) * scale;
  const trunk = k === 'ornamental' ? 0.11 : k === 'birch' ? 0.14 : 0.2 + height * 0.012;
  const crown = k === 'pine' ? height * 0.28 : k === 'ornamental' ? 1.9 * scale : height * 0.42;
  return { x, z, kind: k, height, trunk, crown, ring: ring ? (k === 'ornamental' ? 0.7 : rng.range(0.85, 1.25)) : undefined };
}

// ———————————————————————————————————————— street furniture

interface StreetOpts {
  curbZ: number;
  x0: number;
  x1: number;
  drives: [number, number][]; // driveway x ranges that cut the curb
}

/** A street running along X with its curb at curbZ; the lot side is -Z. */
function frontStreet(site: SiteDef, o: StreetOpts) {
  const { curbZ, x0, x1 } = o;
  site.hard.push({ poly: rect(x0, curbZ, x1, curbZ + 8), kind: 'road', y: 0.005 });
  // curbs, split at driveways
  const cuts = [...o.drives].sort((a, b) => a[0] - b[0]);
  let cx = x0;
  for (const [d0, d1] of cuts) {
    if (d0 > cx) site.hard.push({ poly: rect(cx, curbZ - 0.16, d0, curbZ), kind: 'curb', y: 0.09 });
    cx = d1;
  }
  if (cx < x1) site.hard.push({ poly: rect(cx, curbZ - 0.16, x1, curbZ), kind: 'curb', y: 0.09 });
  site.hard.push({ poly: rect(x0, curbZ + 8, x1, curbZ + 8.16), kind: 'curb', y: 0.09 });
  site.hard.push({ poly: rect(x0, curbZ - 3.85, x1, curbZ - 2.35), kind: 'sidewalk', y: 0.045 });
  site.hard.push({ poly: rect(x0, curbZ + 10.5, x1, curbZ + 12), kind: 'sidewalk', y: 0.045 });
  site.lines.push({ a: [x0, curbZ + 4], b: [x1, curbZ + 4], color: '#e8c547', dashed: true, width: 0.12 });
  site.lines.push({ a: [x0, curbZ + 0.35], b: [x1, curbZ + 0.35], color: '#e9e9e2', width: 0.1 });
  site.lines.push({ a: [x0, curbZ + 7.65], b: [x1, curbZ + 7.65], color: '#e9e9e2', width: 0.1 });
}

/** A street running along Z with its curb at curbX; the lot side is -X. */
function sideStreet(site: SiteDef, curbX: number, z0: number, z1: number) {
  site.hard.push({ poly: rect(curbX, z0, curbX + 8, z1), kind: 'road', y: 0.006 });
  site.hard.push({ poly: rect(curbX - 0.16, z0, curbX, z1), kind: 'curb', y: 0.09 });
  site.hard.push({ poly: rect(curbX + 8, z0, curbX + 8.16, z1), kind: 'curb', y: 0.09 });
  site.hard.push({ poly: rect(curbX - 3.85, z0, curbX - 2.35, z1), kind: 'sidewalk', y: 0.045 });
  site.hard.push({ poly: rect(curbX + 10.5, z0, curbX + 12, z1), kind: 'sidewalk', y: 0.045 });
  site.lines.push({ a: [curbX + 4, z0], b: [curbX + 4, z1], color: '#e8c547', dashed: true, width: 0.12 });
}

/** Neighbour houses along a street so the yard sits inside a believable block. */
function neighbours(site: SiteDef, rng: Rng, curbZ: number, xs: number[], across: number[]) {
  for (const x of xs) {
    const w = rng.range(12, 16);
    const d = rng.range(9, 11);
    const front = curbZ - rng.range(11, 14);
    site.houses.push(house(rng, { x, z: front - d / 2, w, d, decor: true, garage: rng.chance(0.5) ? 'left' : 'right' }));
    const gx = x + (rng.chance(0.5) ? -1 : 1) * (w / 2 - 3);
    site.hard.push({ poly: rect(gx - 2.5, front, gx + 2.5, curbZ), kind: 'driveway', y: 0.03 });
    if (rng.chance(0.8)) site.trees.push(tree(rng, x + rng.range(-5, 5), front + rng.range(3, 6), undefined, rng.chance(0.5)));
    if (rng.chance(0.6)) site.trees.push(tree(rng, x + rng.range(-8, 8), curbZ - 1.2, rng.pick(['maple', 'oak'] as const), false, 0.9));
    site.props.push({ kind: 'mailbox', x: gx + 3.1, z: curbZ - 0.9, rot: 0 });
  }
  const farCurb = curbZ + 8;
  for (const x of across) {
    const w = rng.range(12, 16);
    const d = rng.range(9, 11);
    const front = farCurb + rng.range(11, 14);
    site.houses.push(house(rng, { x, z: front + d / 2, w, d, rot: Math.PI, decor: true }));
    const gx = x + (rng.chance(0.5) ? -1 : 1) * (w / 2 - 3);
    site.hard.push({ poly: rect(gx - 2.5, farCurb + 0.16, gx + 2.5, front), kind: 'driveway', y: 0.03 });
    if (rng.chance(0.85)) site.trees.push(tree(rng, x + rng.range(-6, 6), farCurb + rng.range(4, 8)));
    if (rng.chance(0.5)) site.props.push({ kind: 'car', x: gx, z: front - 3, rot: Math.PI / 2 + rng.range(-0.05, 0.05), color: rng.pick(['#8a1c1c', '#1c3f8a', '#e5e5e5', '#222', '#6b6f73']) });
  }
}

function emptySite(template: TemplateId): SiteDef {
  return {
    template,
    lawn: [],
    bounds: { x0: 0, z0: 0, x1: 0, z1: 0 },
    world: { x0: -80, z0: -60, x1: 80, z1: 80 },
    houses: [],
    trees: [],
    props: [],
    beds: [],
    hard: [],
    fences: [],
    lines: [],
    start: { x: 0, z: 0, heading: 0 },
    trailer: { x: 0, z: 0, heading: 0 },
  };
}

function finish(site: SiteDef, margin = 2): SiteDef {
  const b = polyBounds(site.lawn);
  site.bounds = { x0: Math.floor(b.x0 - margin), z0: Math.floor(b.z0 - margin), x1: Math.ceil(b.x1 + margin), z1: Math.ceil(b.z1 + margin) };
  return site;
}

function flowerBed(rng: Rng, poly: Poly): BedDef {
  return { poly, kind: 'flowers', palette: rng.pick(FLOWER_SETS) };
}

// ———————————————————————————————————————— templates

function starter(rng: Rng): SiteDef {
  const site = emptySite('starter');
  const right = rng.chance(0.5);
  const s = right ? 1 : -1;
  const curbZ = 16;
  const hw = rng.range(7, 8);
  const front = 3;
  site.houses.push(house(rng, { x: 0, z: front - 5, w: hw * 2, d: 10, garage: right ? 'right' : 'left', porch: rng.chance(0.5) }));
  const d0 = s > 0 ? hw - 6 : -hw + 1;
  const dx0 = Math.min(d0, d0 + 5);
  const dx1 = dx0 + 5;
  site.hard.push({ poly: rect(dx0, front, dx1, curbZ), kind: 'driveway', y: 0.03 });
  // front walk from porch to driveway
  const doorX = -s * rng.range(1, 3);
  site.hard.push({ poly: rect(Math.min(doorX, dx0) - 0.6, front + 1.6, Math.max(doorX, dx0), front + 2.8), kind: 'path', y: 0.032 });
  frontStreet(site, { curbZ, x0: -80, x1: 80, drives: [[dx0, dx1]] });
  const L = -13;
  const R = 13;
  // the job: front yard either side of the drive + the verge + one side yard
  site.lawn.push(rect(L, front, dx0, curbZ - 3.85));
  site.lawn.push(rect(dx1, front, R, curbZ - 3.85));
  site.lawn.push(rect(L, curbZ - 2.35, dx0, curbZ - 0.16));
  site.lawn.push(rect(dx1, curbZ - 2.35, R, curbZ - 0.16));
  const sideX0 = s > 0 ? L : hw;
  const sideX1 = s > 0 ? -hw : R;
  site.lawn.push(rect(sideX0, -7, sideX1, front));
  site.fences.push({ pts: [[sideX0, -7], [sideX1, -7]], kind: 'privacy', h: 1.8 });
  // foundation shrubs across the house front (away from the garage)
  const bx0 = s > 0 ? -hw : dx1;
  const bx1 = s > 0 ? dx0 : hw;
  site.beds.push({ poly: rect(bx0 + 0.2, front, bx1 - 0.2, front + 1.3), kind: 'shrubs' });
  // a tree in the open lawn
  const tx = s > 0 ? rng.range(-10, -5) : rng.range(5, 10);
  site.trees.push(tree(rng, tx, rng.range(7, 9.5), rng.pick(['maple', 'ornamental', 'oak'] as const)));
  // street tree on the verge
  if (rng.chance(0.7)) site.trees.push(tree(rng, s > 0 ? rng.range(-9, -4) : rng.range(4, 9), curbZ - 1.25, 'maple', false, 0.85));
  if (rng.chance(0.6)) {
    const fx = s > 0 ? rng.range(-11, -9) : rng.range(9, 11);
    site.beds.push(flowerBed(rng, blob(fx, 5.6, 1.6, 1.1, 0.12, rng() * 6)));
  }
  site.props.push({ kind: 'mailbox', x: s > 0 ? dx0 - 0.9 : dx1 + 0.9, z: curbZ - 0.9, rot: 0 });
  site.props.push({ kind: 'ac', x: s > 0 ? -hw - 0.7 : hw + 0.7, z: -3, rot: 0 });
  if (rng.chance(0.5)) site.props.push({ kind: 'gnome', x: s > 0 ? -5 : 5, z: front + 1.6, rot: rng.range(-0.5, 0.5) });
  site.props.push({ kind: 'hydrant', x: s > 0 ? R - 1 : L + 1, z: curbZ - 1, rot: 0 });
  neighbours(site, rng, curbZ, [-28, 28, -54, 54], [-26, 0, 26, -52, 52]);
  site.trailer = { x: (dx0 + dx1) / 2 - 12, z: curbZ + 1.7, heading: 0 };
  site.start = { x: (dx0 + dx1) / 2, z: curbZ + 2.2, heading: -Math.PI / 2 };
  return finish(site);
}

function corner(rng: Rng): SiteDef {
  const site = emptySite('corner');
  const curbZ = 16;
  const curbX = 18;
  const front = 1;
  site.houses.push(house(rng, { x: -2, z: front - 5, w: 15, d: 10, garage: 'left', porch: true }));
  const dx0 = -9.2;
  const dx1 = -4.2;
  site.hard.push({ poly: rect(dx0, front, dx1, curbZ), kind: 'driveway', y: 0.03 });
  site.hard.push({ poly: rect(-2, front, -0.8, curbZ - 3.85), kind: 'path', y: 0.032 });
  frontStreet(site, { curbZ, x0: -80, x1: curbX - 3.85, drives: [[dx0, dx1]] });
  site.hard.push({ poly: rect(curbX - 3.85, curbZ, 60, curbZ + 8), kind: 'road', y: 0.005 });
  site.hard.push({ poly: rect(curbX - 3.85, curbZ - 3.85, curbX - 2.35, curbZ - 2.35), kind: 'sidewalk', y: 0.045 });
  sideStreet(site, curbX, -60, curbZ);
  // lawn
  const L = -14;
  site.lawn.push(rect(L, front, dx0, curbZ - 3.85));
  site.lawn.push(rect(dx1, front, -2, curbZ - 3.85));
  site.lawn.push(rect(-0.8, front, curbX - 3.85, curbZ - 3.85));
  site.lawn.push(rect(5.5, -16, curbX - 3.85, front));
  site.lawn.push(rect(L, curbZ - 2.35, dx0, curbZ - 0.16));
  site.lawn.push(rect(dx1, curbZ - 2.35, curbX - 2.35, curbZ - 0.16));
  site.lawn.push(rect(curbX - 2.35, -16, curbX - 0.16, curbZ - 0.16));
  site.fences.push({ pts: [[-9.5, -16], [5.5, -16], [curbX - 3.85, -16]], kind: 'picket', h: 1.1 });
  site.fences.push({ pts: [[5.5, -9], [5.5, -16]], kind: 'picket', h: 1.1 });
  // beds
  site.beds.push(flowerBed(rng, blob(curbX - 7.5, curbZ - 7.5, 2.4, 1.8, 0.15, rng() * 6, 36, 0.6)));
  site.beds.push({ poly: rect(-0.6, front, 5.4, front + 1.4), kind: 'shrubs' });
  site.beds.push(flowerBed(rng, blob(10, -10, 1.3, 2.8, 0.1, rng() * 6)));
  site.trees.push(tree(rng, rng.range(-12, -10.5), rng.range(6, 9), 'oak'));
  site.trees.push(tree(rng, rng.range(8, 11), rng.range(4, 7)));
  site.trees.push(tree(rng, curbX - 1.25, rng.range(-12, -4), 'maple', false));
  site.trees.push(tree(rng, rng.range(-2, 4), curbZ - 1.25, 'maple', false, 0.9));
  site.props.push({ kind: 'lamp', x: curbX - 1.1, z: curbZ - 1.1, rot: 0 });
  site.props.push({ kind: 'hydrant', x: curbX - 0.9, z: 6, rot: 0 });
  site.props.push({ kind: 'mailbox', x: dx0 - 0.8, z: curbZ - 0.9, rot: 0 });
  site.props.push({ kind: 'birdbath', x: rng.range(8, 10), z: -4, rot: 0 });
  site.props.push({ kind: 'sign', x: curbX - 0.6, z: curbZ - 0.6, rot: 0 });
  neighbours(site, rng, curbZ, [-30, -56], [-30, 0, -56, 30]);
  site.houses.push(house(rng, { x: 2, z: -30, w: 14, d: 10, decor: true }));
  site.houses.push(house(rng, { x: curbX + 22, z: -8, w: 10, d: 14, rot: -Math.PI / 2, decor: true }));
  site.trailer = { x: dx0 - 13, z: curbZ + 1.7, heading: 0 };
  site.start = { x: (dx0 + dx1) / 2, z: curbZ + 2.2, heading: -Math.PI / 2 };
  return finish(site);
}

function backyard(rng: Rng): SiteDef {
  const site = emptySite('backyard');
  const curbZ = 18;
  const front = 5;
  site.houses.push(house(rng, { x: 0, z: 0, w: 16, d: 10, garage: 'right', porch: rng.chance(0.4) }));
  site.hard.push({ poly: rect(2.4, front, 7.6, curbZ), kind: 'driveway', y: 0.03 });
  frontStreet(site, { curbZ, x0: -80, x1: 80, drives: [[2.4, 7.6]] });
  // side yard → gate → backyard
  site.lawn.push(rect(8, -5, 14, 3));
  site.lawn.push(rect(-14, -27, 14, -5));
  site.lawn.push(rect(-14, -5, -8, -3));
  site.fences.push({ pts: [[-8, -3], [-14, -3], [-14, -27], [14, -27], [14, 3], [12.6, 3]], kind: 'privacy', h: 1.9 });
  site.fences.push({ pts: [[10, 3], [8, 3]], kind: 'privacy', h: 1.9 });
  site.hard.push({ poly: rect(-4.5, -9.5, 4.5, -5), kind: 'patio', y: 0.04 });
  site.hard.push({ poly: rect(10.2, 3, 12.4, 5), kind: 'path', y: 0.032 });
  const shedRot = rng.range(-0.15, 0.15);
  site.props.push({ kind: 'shed', x: rng.range(-11, -9.5), z: -24.2, rot: shedRot });
  const tx = rng.chance(0.5) ? rng.range(4, 8) : rng.range(-7, -3);
  site.props.push({ kind: 'trampoline', x: tx, z: rng.range(-20, -16), rot: 0 });
  site.props.push({ kind: 'playset', x: 9.4, z: -23.2, rot: rng.range(-0.2, 0.2) });
  site.props.push({ kind: 'raisedbed', x: -11.8, z: rng.range(-15, -11), rot: Math.PI / 2 });
  site.props.push({ kind: 'grill', x: 3.5, z: -8.2, rot: 0.3 });
  site.props.push({ kind: 'ac', x: 8.7, z: -2, rot: 0 });
  site.beds.push(flowerBed(rng, blob(rng.range(-2, 2), -25.3, 3.6, 1.1, 0.12, rng() * 6)));
  site.beds.push({ poly: rect(-8, -6.2, -4.6, -5), kind: 'shrubs' });
  site.trees.push(tree(rng, rng.range(-6, -2), rng.range(-16, -12), 'oak', true, 1.1));
  site.trees.push(tree(rng, rng.range(9, 11.5), rng.range(-12, -8), 'birch'));
  site.trees.push(tree(rng, rng.range(-12, -10), rng.range(-21, -19), 'maple'));
  // the front yard belongs to someone else's crew — already done
  site.trees.push(tree(rng, -6, 10, 'maple'));
  site.props.push({ kind: 'mailbox', x: 1.6, z: curbZ - 0.9, rot: 0 });
  neighbours(site, rng, curbZ, [-30, 30, -56, 56], [-26, 0, 26, -52, 52]);
  site.houses.push(house(rng, { x: -6, z: -42, w: 15, d: 10, rot: Math.PI, decor: true }));
  site.houses.push(house(rng, { x: 18, z: -42, w: 14, d: 10, rot: Math.PI, decor: true }));
  site.trailer = { x: -9, z: curbZ + 1.7, heading: 0 };
  site.start = { x: 5, z: curbZ + 2.2, heading: -Math.PI / 2 };
  return finish(site);
}

function estate(rng: Rng): SiteDef {
  const site = emptySite('estate');
  const curbZ = 24;
  const front = -7;
  const W = rng.range(27, 31);
  site.houses.push(house(rng, { x: 0, z: front - 8, w: 26, d: 16, stories: 2, style: rng.pick(['brick', 'plaster'] as const), roof: 'hip', porch: true, garage: 'right' }));
  // horseshoe drive
  const ex = rng.range(12, 15);
  const raw: Vec2[] = [[-ex, curbZ], [-ex, 12], [-ex + 2, 4], [-7, -1], [0, -2.2], [7, -1], [ex - 2, 4], [ex, 12], [ex, curbZ]];
  const path = chaikin(raw, 3);
  for (const p of stripPolys(path, 5)) site.hard.push({ poly: p, kind: 'driveway', y: 0.03 });
  site.hard.push({ poly: rect(-9, front, 9, -1.8), kind: 'driveway', y: 0.031 });
  frontStreet(site, { curbZ, x0: -90, x1: 90, drives: [[-ex - 2.5, -ex + 2.5], [ex - 2.5, ex + 2.5]] });
  site.lawn.push(rect(-W, front, W, curbZ - 3.85));
  site.lawn.push(rect(-W, curbZ - 2.35, W, curbZ - 0.16));
  // hedges hugging the house front, open at the door
  site.fences.push({ pts: [[-12.6, front + 0.9], [-2.4, front + 0.9]], kind: 'hedge', h: 1.1 });
  site.fences.push({ pts: [[2.4, front + 0.9], [12.6, front + 0.9]], kind: 'hedge', h: 1.1 });
  site.fences.push({ pts: [[-W, front - 4], [-W, curbZ - 3.85]], kind: 'rail', h: 1.1 });
  site.fences.push({ pts: [[W, front - 4], [W, curbZ - 3.85]], kind: 'rail', h: 1.1 });
  site.props.push({ kind: 'fountain', x: 0, z: rng.range(9, 12), rot: 0 });
  site.beds.push(flowerBed(rng, circlePoly(0, site.props[site.props.length - 1].z, 3.4, 40)));
  const spots: Vec2[] = [[-W + 6, 2], [-W + 9, 14], [W - 6, 3], [W - 8, 15], [-20, -3], [21, -2], [-19, 18], [20, 18]];
  for (const [x, z] of spots) {
    if (rng.chance(0.75)) site.trees.push(tree(rng, x + rng.range(-2, 2), z + rng.range(-2, 2), rng.pick(['oak', 'maple', 'pine', 'birch'] as const), true, 1.1));
  }
  for (const z of [6, 16]) {
    site.props.push({ kind: 'lamp', x: -ex - 3, z, rot: 0 });
    site.props.push({ kind: 'lamp', x: ex + 3, z, rot: 0 });
  }
  site.beds.push(flowerBed(rng, blob(-ex - 4.5, curbZ - 5.6, 1.8, 1.0, 0.1, rng() * 6)));
  site.beds.push(flowerBed(rng, blob(ex + 4.5, curbZ - 5.6, 1.8, 1.0, 0.1, rng() * 6)));
  site.props.push({ kind: 'mailbox', x: ex + 3.3, z: curbZ - 0.9, rot: 0 });
  neighbours(site, rng, curbZ, [-58, 58], [-36, -8, 20, 48]);
  site.trailer = { x: -ex - 12, z: curbZ + 1.7, heading: 0 };
  site.start = { x: -ex, z: curbZ + 2.2, heading: -Math.PI / 2 };
  site.world = { x0: -100, z0: -70, x1: 100, z1: 90 };
  return finish(site);
}

function field(rng: Rng): SiteDef {
  const site = emptySite('field');
  const curbZ = 28;
  const hw = rng.range(22, 26);
  const hd = rng.range(14, 16);
  frontStreet(site, { curbZ, x0: -100, x1: 100, drives: [[-30, -24]] });
  // path loop around the field
  const pw = 1.6;
  site.hard.push({ poly: rect(-hw - pw, -hd - pw, hw + pw, -hd), kind: 'path', y: 0.035 });
  site.hard.push({ poly: rect(-hw - pw, hd, hw + pw, hd + pw), kind: 'path', y: 0.035 });
  site.hard.push({ poly: rect(-hw - pw, -hd, -hw, hd), kind: 'path', y: 0.035 });
  site.hard.push({ poly: rect(hw, -hd, hw + pw, hd), kind: 'path', y: 0.035 });
  site.hard.push({ poly: rect(-1, hd + pw, 1, curbZ - 3.85), kind: 'path', y: 0.034 });
  site.hard.push({ poly: rect(-30, -hd - 18, -24, curbZ), kind: 'parking', y: 0.02 });
  site.lawn.push(rect(-hw, -hd, hw, hd));
  site.houses.push(house(rng, { x: 0, z: -hd - 16, w: 22, d: 14, stories: 2, style: 'brick', kind: 'church', roof: 'gable', door: '#5a2b1a', trim: '#f4f1ea' }));
  site.props.push({ kind: 'flagpole', x: 4, z: hd + pw + 2, rot: 0 });
  site.props.push({ kind: 'bench', x: -8, z: hd + pw + 0.8, rot: 0 });
  site.props.push({ kind: 'bench', x: 10, z: hd + pw + 0.8, rot: 0 });
  site.props.push({ kind: 'sign', x: -3, z: curbZ - 5, rot: 0, scale: 2.2 });
  for (const [x, z] of [[-hw - 6, -hd + 3], [-hw - 7, hd - 2], [hw + 6, -hd + 4], [hw + 7, hd - 1], [-hw + 8, hd + 8], [hw - 8, hd + 8]] as Vec2[]) {
    site.trees.push(tree(rng, x + rng.range(-1.5, 1.5), z + rng.range(-1.5, 1.5), rng.pick(['oak', 'maple', 'pine'] as const), false, 1.15));
  }
  // sprinkler heads poke out of the turf — trim around them
  for (let i = 0; i < 4; i++) site.props.push({ kind: 'sprinkler', x: rng.range(-hw + 4, hw - 4), z: rng.range(-hd + 3, hd - 3), rot: 0 });
  neighbours(site, rng, curbZ, [-64, 64], [-40, -12, 16, 44]);
  site.trailer = { x: -15, z: curbZ + 1.7, heading: 0 };
  site.start = { x: -1, z: curbZ + 2.2, heading: -Math.PI / 2 };
  site.world = { x0: -100, z0: -70, x1: 100, z1: 90 };
  return finish(site);
}

function office(rng: Rng): SiteDef {
  const site = emptySite('office');
  const curbZ = 24;
  frontStreet(site, { curbZ, x0: -100, x1: 100, drives: [[-4, 4]] });
  // parking lot
  site.hard.push({ poly: rect(-30, -14, 30, 16), kind: 'parking', y: 0.02 });
  site.hard.push({ poly: rect(-4, 16, 4, curbZ), kind: 'parking', y: 0.021 });
  site.houses.push(house(rng, { x: 0, z: -24, w: 44, d: 16, stories: 2, style: 'plaster', roof: 'flat', kind: 'office', body: '#d9d6cf', trim: '#3a4048', door: '#2a2f36' }));
  // islands with clipped ends
  const islands: Poly[] = [];
  for (const z of [-4.5, 5.5]) {
    const isl: Poly = [[-24, z - 1.3], [22, z - 1.3], [24, z], [22, z + 1.3], [-24, z + 1.3], [-26, z]];
    islands.push(isl);
  }
  // front berm + entrance corners
  site.lawn.push(...islands);
  site.lawn.push(rect(-36, 16, -4, curbZ - 3.85));
  site.lawn.push(rect(4, 16, 36, curbZ - 3.85));
  site.lawn.push(rect(-36, curbZ - 2.35, -4, curbZ - 0.16));
  site.lawn.push(rect(4, curbZ - 2.35, 36, curbZ - 0.16));
  site.lawn.push([[-30, -16], [30, -16], [30, -14], [-30, -14]]);
  site.lawn.push([[30, -16], [36, -16], [36, 16], [30, 16]]);
  site.lawn.push([[-36, -16], [-30, -16], [-30, 16], [-36, 16]]);
  for (const isl of islands) {
    const z = (isl[0][1] + isl[3][1]) / 2;
    for (const x of [-15, 0, 15]) {
      if (rng.chance(0.85)) site.trees.push(tree(rng, x + rng.range(-2, 2), z, rng.pick(['maple', 'ornamental', 'oak'] as const), true, 0.9));
    }
    for (let x = -22; x <= 22; x += 2.8) {
      if (Math.abs(x) < 3) continue;
      site.lines.push({ a: [x, z + 1.3], b: [x, z + 6.3], color: '#f2f2ec', width: 0.1 });
      site.lines.push({ a: [x, z - 1.3], b: [x, z - 6.3], color: '#f2f2ec', width: 0.1 });
    }
  }
  site.beds.push({ poly: blob(-18, 19.5, 4.5, 1.4, 0.08, rng() * 6), kind: 'shrubs' });
  site.beds.push(flowerBed(rng, blob(18, 19.5, 4.5, 1.4, 0.08, rng() * 6)));
  site.props.push({ kind: 'sign', x: 8, z: 19, rot: 0, scale: 2.6 });
  for (const x of [-22, -8, 8, 22]) site.props.push({ kind: 'lamp', x, z: -4.5 + (x > 0 ? 10 : 0), rot: 0 });
  // parked cars
  const colors = ['#8a1c1c', '#1c3f8a', '#e5e5e5', '#222222', '#6b6f73', '#c9b27a', '#2f5d3a'];
  for (let i = 0; i < 9; i++) {
    const row = rng.pick([-10.2, 0.6, 1.2, 9.9]);
    const x = -21 + rng.int(0, 15) * 2.8 + 1.4;
    if (Math.abs(x) < 4) continue;
    site.props.push({ kind: 'car', x, z: row, rot: rng.range(-0.04, 0.04) + (rng.chance(0.5) ? 0 : Math.PI), color: rng.pick(colors) });
  }
  neighbours(site, rng, curbZ, [-62, 62], [-36, -8, 20, 48]);
  site.trailer = { x: -14, z: curbZ + 1.7, heading: 0 };
  site.start = { x: 0, z: curbZ + 2.2, heading: -Math.PI / 2 };
  site.world = { x0: -100, z0: -70, x1: 100, z1: 90 };
  return finish(site);
}

function wedge(rng: Rng): SiteDef {
  const site = emptySite('wedge');
  const C: Vec2 = [0, 24];
  const R = 11;
  const a0 = -Math.PI / 2 - rng.range(0.55, 0.7);
  const a1 = -Math.PI / 2 + rng.range(0.55, 0.7);
  const at = (a: number, r: number): Vec2 => [C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r];
  // cul-de-sac bulb + its entry road
  site.hard.push({ poly: circlePoly(C[0], C[1], R, 48), kind: 'road', y: 0.005 });
  site.hard.push({ poly: rect(-4, C[1], 4, 90), kind: 'road', y: 0.004 });
  const ring = (r0: number, r1: number, from: number, to: number, n = 40): Poly => {
    const pts: Poly = [];
    for (let i = 0; i <= n; i++) pts.push(at(from + ((to - from) * i) / n, r0));
    for (let i = n; i >= 0; i--) pts.push(at(from + ((to - from) * i) / n, r1));
    return pts;
  };
  const da = -Math.PI / 2 + rng.range(-0.25, 0.25);
  const dHalf = 2.5 / (R + 6);
  site.hard.push({ poly: ring(R, R + 0.16, -Math.PI / 2 - 1.9, da - dHalf), kind: 'curb', y: 0.09 });
  site.hard.push({ poly: ring(R, R + 0.16, da + dHalf, -Math.PI / 2 + 1.9), kind: 'curb', y: 0.09 });
  site.hard.push({ poly: ring(R + 2.5, R + 4, -Math.PI / 2 - 1.9, -Math.PI / 2 + 1.9, 60), kind: 'sidewalk', y: 0.045 });
  // the pie-slice lot
  const rIn = R + 4;
  const rOut = rng.range(35, 38);
  const lot = ring(rIn, rOut, a0, a1, 40);
  site.lawn.push(lot);
  site.lawn.push(ring(R + 0.16, R + 2.5, a0, a1, 40));
  // house facing the bulb
  const hr = rng.range(24, 26);
  const [hx, hz] = at(-Math.PI / 2, hr + 5);
  site.houses.push(house(rng, { x: hx, z: hz, w: 15, d: 10, garage: 'right', porch: true }));
  // driveway along a ray
  const dp0 = at(da, R);
  const dp1: Vec2 = [hx + 4.4, hz + 5];
  for (const p of stripPolys([dp0, dp1], 4.6)) site.hard.push({ poly: p, kind: 'driveway', y: 0.03 });
  site.hard.push({ poly: rect(hx + 2, hz + 5, hx + 6.8, hz + 6.6), kind: 'driveway', y: 0.031 });
  // lot fences along the rays and the back
  const back: Vec2[] = [];
  for (let i = 0; i <= 10; i++) back.push(at(a0 + ((a1 - a0) * i) / 10, rOut));
  site.fences.push({ pts: [at(a0, rIn + 9), at(a0, rOut), ...back.slice(1, -1), at(a1, rOut), at(a1, rIn + 9)], kind: rng.chance(0.5) ? 'rail' : 'privacy', h: 1.6 });
  // curvy beds and garden bits — lots of edges
  const midA = (a0 + a1) / 2;
  const [b1x, b1z] = at(midA - 0.28, rIn + 6.5);
  site.beds.push(flowerBed(rng, blob(b1x, b1z, 2.8, 1.5, 0.18, rng() * 6, 40, rng.range(-0.5, 0.5))));
  const [b2x, b2z] = at(midA + 0.3, rIn + 4.2);
  site.beds.push({ poly: blob(b2x, b2z, 1.9, 1.2, 0.15, rng() * 6, 32, 0.4), kind: 'mulch' });
  site.props.push({ kind: 'boulder', x: b2x - 0.4, z: b2z, rot: rng() * 6, scale: 0.8 });
  site.props.push({ kind: 'boulder', x: b2x + 0.8, z: b2z + 0.3, rot: rng() * 6, scale: 0.55 });
  site.beds.push({ poly: rect(hx - 7.5, hz + 5, hx + 1.8, hz + 6.2), kind: 'shrubs' });
  const [b3x, b3z] = at(midA - 0.05, rOut - 4.5);
  site.beds.push(flowerBed(rng, blob(b3x, b3z, 4.2, 1.3, 0.12, rng() * 6, 36, midA + Math.PI / 2)));
  const [t1x, t1z] = at(a0 + 0.2, rIn + 7);
  site.trees.push(tree(rng, t1x, t1z, 'maple'));
  const [t2x, t2z] = at(a1 - 0.18, rIn + 11);
  site.trees.push(tree(rng, t2x, t2z, rng.pick(['birch', 'oak'] as const)));
  const [t3x, t3z] = at(a0 + 0.15, rOut - 3);
  site.trees.push(tree(rng, t3x, t3z, 'pine', true, 1.1));
  const [bbx, bbz] = at(midA + 0.18, rIn + 9.5);
  site.props.push({ kind: 'birdbath', x: bbx, z: bbz, rot: 0 });
  const [gx, gz] = at(midA - 0.33, rIn + 3.2);
  site.props.push({ kind: 'gnome', x: gx, z: gz, rot: 0.4 });
  const [mx, mz] = at(da + dHalf + 0.06, R + 1.2);
  site.props.push({ kind: 'mailbox', x: mx, z: mz, rot: 0 });
  // neighbours around the bulb
  for (const ang of [-Math.PI / 2 - 1.55, -Math.PI / 2 + 1.55, 0.35, Math.PI - 0.35]) {
    const [nx, nz] = at(ang, 27);
    // front (+Z local) turned to face the bulb centre
    const rot = Math.atan2(-Math.cos(ang), -Math.sin(ang));
    site.houses.push(house(rng, { x: nx, z: nz, w: 14, d: 10, rot, decor: true }));
    const [tx, tz] = at(ang + 0.12, 18);
    site.trees.push(tree(rng, tx, tz));
  }
  site.trailer = { x: 0, z: 46, heading: -Math.PI / 2 };
  site.start = { x: -1.5, z: 36, heading: -Math.PI / 2 };
  site.world = { x0: -90, z0: -60, x1: 90, z1: 100 };
  return finish(site);
}

const TEMPLATES: Record<TemplateId, (rng: Rng) => SiteDef> = { starter, corner, backyard, estate, field, office, wedge };

export function buildSite(template: TemplateId, seed: number): SiteDef {
  return TEMPLATES[template](makeRng(seed));
}

// ———————————————————————————————————————— job board

const CLIENTS: Record<TemplateId, string[]> = {
  starter: ['The Nguyens', 'Mrs. Alvarez', 'Tom & Becca', 'The Lindqvists', 'Mr. Pruitt', 'Janelle Ford'],
  corner: ['The Okafors', 'Dale Whitaker', 'Mrs. Hennessey', 'The Castellanos', 'Gary Holt'],
  backyard: ['The Brennans', 'Coach Ramirez', 'The Patels', 'Marcy & Lou', 'The Kowalskis'],
  estate: ['Harrington Estate', 'The Vanderhoffs', 'Bellmere House', 'Judge Ashworth'],
  field: ["St. Brendan's", 'Riverside Little League', 'Oak Hollow Church', 'Kingsley Park'],
  office: ['Brightline Dental', 'Greenway Offices', 'Summit Credit Union', 'Northgate Medical'],
  wedge: ['The Fairbanks', 'Linda Park', 'The Moreaus', 'Ray & Donna Kemp'],
};

const STREETS = ['Maple Ct', 'Birch Ln', 'Sycamore Dr', 'Larkspur Way', 'Fox Run', 'Willow Bend', 'Quail Hollow', 'Elm St', 'Juniper Cir', 'Cedar Ridge Rd', 'Primrose Ln', 'Hawthorne Ave'];

const TITLES: Record<TemplateId, string> = {
  starter: 'Front Yard',
  corner: 'Corner Lot',
  backyard: 'Fenced Backyard',
  estate: 'Estate Lawn',
  field: 'Open Field',
  office: 'Office Park',
  wedge: 'Cul-de-sac Wedge',
};

const BLURBS: Record<TemplateId, string[]> = {
  starter: ['Quick front yard. One tree, a mailbox and a driveway to edge.', 'Small and tidy — they notice if the edges are ragged.'],
  corner: ['Wraps two streets. Long verge, picket fence, a flower bed on the corner.', 'Corner lot with a long side strip — plenty of edging.'],
  backyard: ['Through the side gate. Shed, trampoline, playset and three trees to work around.', 'Tight gate, busy yard. Lift the blades in the gaps.'],
  estate: ['Big open lawn with a horseshoe drive. Long straight runs — stripe heaven.', 'They expect showroom stripes. Specimen trees with mulch rings.'],
  field: ['Wide open turf. Nothing to hit, everything to show off.', 'Big rectangle. They want a pattern people photograph.'],
  office: ['Parking islands and a long front berm. Lots of curbs, lots of driving between.', 'Islands everywhere — blades up between them.'],
  wedge: ['Pie-shaped lot on a cul-de-sac. Curvy beds, odd angles, a birdbath.', 'Nothing is square here. Angles everywhere.'],
};

export interface Board {
  jobs: JobDef[];
}

function obstacleCount(site: SiteDef): number {
  return site.trees.length + site.beds.length + site.props.filter((p) => p.kind !== 'car').length + site.fences.length;
}

export function makeBoard(seed: number): Board {
  const rng = makeRng(seed ^ 0x9e3779b9);
  const order: TemplateId[] = ['starter', 'starter', 'corner', 'backyard', 'wedge', rng.pick(['estate', 'field'] as const), rng.pick(['office', 'field', 'estate'] as const)];
  const seen = new Set<string>();
  const jobs: JobDef[] = [];
  const mapSpots: Vec2[] = [];
  order.forEach((template, i) => {
    const jobSeed = (seed * 31 + i * 7919 + 13) >>> 0;
    const site = buildSite(template, jobSeed);
    const f = new Field(site);
    const area = f.stats.grass / (RES * RES);
    const edgeM2 = f.stats.edgeTotal / (RES * RES);
    const obstacles = obstacleCount(site);
    let client = rng.pick(CLIENTS[template]);
    for (let t = 0; t < 12 && seen.has(client); t++) client = rng.pick(CLIENTS[template]);
    seen.add(client);
    const fiddly = template === 'office' || template === 'wedge' || template === 'backyard' ? 1.15 : 1;
    const pay = Math.round(((area * 0.17 + edgeM2 * 0.5 + 15) * fiddly) / 5) * 5;
    const difficulty = Math.max(1, Math.min(5, Math.round(0.6 + area / 450 + (fiddly - 1) * 10 + edgeM2 / 120))) as JobDef['difficulty'];
    let pattern: PatternRequest = 'any';
    if (template === 'field') pattern = rng.pick(['checker', 'diagonal', 'checker'] as const);
    else if (template === 'estate') pattern = rng.pick(['stripes', 'diagonal'] as const);
    else if (template === 'starter' || template === 'corner') pattern = rng.pick(['any', 'stripes'] as const);
    // spread pins across the town map
    let mx = 0;
    let my = 0;
    for (let tries = 0; tries < 30; tries++) {
      mx = rng.range(0.1, 0.92);
      my = rng.range(0.12, 0.88);
      if (Math.hypot(mx - 0.14, my - 0.82) > 0.18 && mapSpots.every(([x, y]) => Math.hypot(x - mx, y - my) > 0.17)) break;
    }
    mapSpots.push([mx, my]);
    jobs.push({
      id: `${seed}-${i}`,
      seed: jobSeed,
      template,
      title: TITLES[template],
      client,
      street: `${rng.int(12, 980)} ${rng.pick(STREETS)}`,
      blurb: rng.pick(BLURBS[template]),
      pay,
      area: Math.round(area),
      difficulty,
      obstacles,
      pattern,
      heightIn: rng.pick([2.5, 3, 3, 3.5]),
      mapX: mx,
      mapY: my,
    });
  });
  return { jobs };
}

export const SHOP = { x: 0.14, y: 0.82 };

/** Minutes to drive between two map points (trailer in tow). */
export function travelMinutes(ax: number, ay: number, bx: number, by: number): number {
  return Math.round(6 + Math.hypot(ax - bx, ay - by) * 48);
}

export const DAY_START = 8 * 60;
export const DAY_END = 18 * 60;

export const DECK_HEIGHTS = [1.5, 2, 2.5, 3, 3.5, 4];

export type { HardDef, FenceDef, PropDef };
