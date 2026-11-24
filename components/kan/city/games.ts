import * as THREE from 'three';
import { Grid, type Vec } from './grid';
import { botFigure, dyn, mat, sign, tree } from './models';
import { catTower, petFigure, toy } from './pets';
import type { Rect } from './market';

/**
 * The Game Park: the family's games, each on a plot of land that looks like the game.
 * An island off the east edge of town, across a short road, mirroring the Sprout Field
 * on the west. Four lots around a cross of paths:
 *
 *   Clean Cut       a lawn half mowed in stripes, a riding mower working the next row
 *   Volleyball      a sand court with a net, a palm, a ball going back and forth
 *   Pickleball      a blue court with its kitchen, a low net, a dink over it
 *   Whisker Wilds   a meadow with a pond, a cat tower and cats chasing yarn
 *
 * Each lot opens its game. Everything that moves is marked dyn() so the city's static
 * merge leaves it alone.
 */

export type GameId = 'mow' | 'volleyball' | 'pickleball' | 'catlife';

export const GAMES: Record<GameId, { name: string; path: string; blurb: string }> = {
  mow: { name: 'Clean Cut', path: '/mow', blurb: 'Mow lawns in perfect stripes' },
  volleyball: { name: 'Volleyball', path: '/volleyball', blurb: 'Bump, set, super spike' },
  pickleball: { name: 'Pickleball', path: '/pickleball', blurb: 'Doubles with hot streaks' },
  catlife: { name: 'Whisker Wilds', path: '/catlife', blurb: 'A cat clan on a wild island' },
};

export interface GameLot {
  id: GameId;
  group: THREE.Group;
  /** The middle of the lot, for the camera and labels. */
  center: Vec;
  /** Where the lot meets the path: walk up to here to play. */
  door: Vec;
  /** How high the tallest thing on it stands, for the label. */
  top: number;
}

export interface GamePark {
  group: THREE.Group;
  ticks: ((t: number, dt: number) => void)[];
  /** The whole island, for walking, the camera and the sea. */
  bounds: Rect;
  /** The road from town. */
  road: Rect;
  gate: Vec;
  lots: GameLot[];
}

const GAP = 14;
const LOT = 18;
const PATH = 4;
/** The top of the island's ground. */
const TOP = 0.36;

function box(g: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, shadow = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

function cyl(g: THREE.Object3D, r0: number, r1: number, h: number, m: THREE.Material, x: number, y: number, z: number, seg = 10, shadow = true) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

function ballMesh(r: number, m: THREE.Material) {
  const b = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), m);
  b.castShadow = true;
  return b;
}

/** A sign on two posts at the front of a lot, facing the path. */
function lotSign(g: THREE.Group, text: string, bg: string, fg: string, x: number, z: number, rot: number) {
  const s = new THREE.Group();
  s.position.set(x, TOP, z);
  s.rotation.y = rot;
  const wood = mat('#6b4f3a');
  for (const sx of [-1.7, 1.7]) box(s, 0.22, 2.4, 0.22, wood, sx, 0, 0, true);
  const board = sign(text, 4.2, 1, bg, fg);
  board.position.set(0, 2.1, 0.13);
  s.add(board);
  const back = board.clone();
  back.rotation.y = Math.PI;
  back.position.z = -0.13;
  s.add(back);
  g.add(s);
}

/** A ball on a parabola from a to b and back again, `period` seconds each way. */
function rally(ball: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, apex: number, period: number) {
  return (t: number) => {
    const n = Math.floor(t / period);
    let u = (t / period) % 1;
    if (n % 2) u = 1 - u;
    ball.position.set(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u + Math.sin(u * Math.PI) * apex, a.z + (b.z - a.z) * u);
  };
}

/** A player: one of the city's mushroom bots, hopping on their toes. */
function player(g: THREE.Group, seed: number, x: number, z: number, face: number, ticks: GamePark['ticks'], phase = 0) {
  const b = botFigure(seed);
  b.group.position.set(x, TOP, z);
  b.group.rotation.y = face;
  g.add(b.group);
  ticks.push((t) => {
    b.body.position.y = 0.8 + Math.abs(Math.sin(t * 3.2 + phase)) * 0.25;
    b.group.position.x = x + Math.sin(t * 0.9 + phase) * 1.4;
  });
}

// ————— the lots, each built in its own frame: 18 × 18, the path along local +z —————

function mowLot(ticks: GamePark['ticks']): { group: THREE.Group; top: number } {
  const g = new THREE.Group();
  const H = LOT / 2;
  // The lawn: the near two thirds mowed in alternating stripes, the far third still long.
  const stripes = 7;
  const cut = LOT * 0.64;
  const w = cut / stripes;
  for (let k = 0; k < stripes; k++) box(g, w, 0.06, LOT - 2, mat(k % 2 ? '#6fbf4e' : '#8fd468'), -H + w / 2 + k * w, TOP - 0.02, -0.4);
  const longZ0 = -H + cut;
  box(g, LOT - cut, 0.18, LOT - 2, mat('#4f9a3a', { rough: 1 }), (longZ0 + H) / 2, TOP - 0.02, -0.4);
  // Tufts on the long grass.
  const tuft = mat('#3f8a2e', { rough: 1 });
  for (let i = 0; i < 26; i++) {
    const x = longZ0 + 0.6 + ((i * 37) % 100) / 100 * (LOT - cut - 1.2);
    const z = -H + 1.4 + ((i * 61) % 100) / 100 * (LOT - 3);
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 5), tuft);
    c.position.set(x, TOP + 0.45, z);
    g.add(c);
  }
  // Hedges along the back, a flower bed, and a little shed with a striped awning.
  for (let i = 0; i < 6; i++) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(1.25, 9, 7), mat('#3e8e47'));
    h.scale.set(1.25, 0.85, 0.9);
    h.position.set(-H + 1.6 + i * 3, TOP + 0.8, -H + 0.6);
    h.castShadow = true;
    g.add(h);
  }
  box(g, 5.5, 0.4, 1.6, mat('#7a5a40', { rough: 1 }), -H + 4, TOP, H - 1.6);
  const petals = ['#f472b6', '#facc15', '#f97316', '#a78bfa', '#ffffff'];
  for (let i = 0; i < 12; i++) {
    const f = ballMesh(0.22, mat(petals[i % petals.length]));
    f.position.set(-H + 1.8 + (i % 6) * 0.9, TOP + 0.6, H - 2 + Math.floor(i / 6) * 0.7);
    g.add(f);
  }
  const shed = new THREE.Group();
  shed.position.set(H - 2.6, TOP, -H + 2.6);
  box(shed, 3.6, 2.6, 3.2, mat('#e8dcc4'), 0, 0, 0, true);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 1.5, 4), mat('#b45309'));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 3.35;
  roof.castShadow = true;
  shed.add(roof);
  box(shed, 1.1, 1.8, 0.08, mat('#7c4a24'), 0, 0, 1.62);
  g.add(shed);
  // The mower: works up and down the edge of the cut, turning at each end.
  const mower = dyn(new THREE.Group());
  const red = mat('#dc2626', { rough: 0.5 });
  box(mower, 1.3, 0.55, 2, red, 0, 0.3, 0, true);
  box(mower, 1.4, 0.18, 1.4, mat('#1f2937'), 0, 0.18, -0.1, true);
  box(mower, 0.7, 0.7, 0.18, mat('#111827'), 0, 0.85, 0.55, true);
  box(mower, 0.75, 0.14, 0.7, mat('#111827'), 0, 0.85, 0.2, true);
  for (const [sx, sz, r] of [[-0.7, 0.65, 0.38], [0.7, 0.65, 0.38], [-0.62, -0.7, 0.26], [0.62, -0.7, 0.26]] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.25, 12), mat('#111827'));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx, r, sz);
    wheel.castShadow = true;
    mower.add(wheel);
  }
  const steer = cyl(mower, 0.03, 0.03, 0.6, mat('#9ca3af'), 0, 0.85, -0.45, 6);
  steer.rotation.x = -0.5;
  const driver = botFigure(41);
  driver.group.scale.setScalar(0.62);
  driver.group.position.set(0, 0.65, 0.2);
  driver.group.rotation.y = Math.PI;
  mower.add(driver.group);
  // Clippings that fly out the side chute.
  const bits = dyn(new THREE.Group());
  const bitM = mat('#9be37a');
  for (let i = 0; i < 8; i++) bits.add(ballMesh(0.07, bitM));
  g.add(mower, bits);
  const x = longZ0 - 0.9;
  ticks.push((t) => {
    const span = LOT - 5;
    const p = (t * 0.22) % 2;
    const u = p < 1 ? p : 2 - p;
    const z = -H + 2.5 + u * span;
    mower.position.set(x, TOP, z);
    mower.rotation.y = p < 1 ? Math.PI : 0;
    mower.position.y = TOP + Math.abs(Math.sin(t * 14)) * 0.04;
    bits.children.forEach((b, i) => {
      const k = ((t * 1.6 + i / 8) % 1);
      b.position.set(x - 0.9 - k * 1.6, TOP + 0.4 + Math.sin(k * Math.PI) * 0.9, z + (i % 3 - 1) * 0.3);
      b.visible = k < 0.9;
    });
  });
  return { group: g, top: 4.6 };
}

function volleyLot(ticks: GamePark['ticks']): { group: THREE.Group; top: number } {
  const g = new THREE.Group();
  const H = LOT / 2;
  // Sand, a little raised, with blue boundary tape.
  box(g, LOT - 0.6, 0.14, LOT - 0.6, mat('#ead29f', { rough: 1 }), 0, TOP - 0.08, 0);
  const tape = mat('#2563eb');
  const cw = 6.2, cl = 12.4;
  box(g, cw * 2, 0.04, 0.16, tape, 0, TOP + 0.06, -cl / 2);
  box(g, cw * 2, 0.04, 0.16, tape, 0, TOP + 0.06, cl / 2);
  box(g, 0.16, 0.04, cl, tape, -cw, TOP + 0.06, 0);
  box(g, 0.16, 0.04, cl, tape, cw, TOP + 0.06, 0);
  // Footprints and ripples in the sand.
  const dent = mat('#d9bd86', { rough: 1 });
  for (let i = 0; i < 18; i++) {
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.22, 7), dent);
    d.rotation.x = -Math.PI / 2;
    d.scale.set(1, 1.7, 1);
    d.position.set(((i * 41) % 100) / 100 * 11 - 5.5, TOP + 0.07, ((i * 67) % 100) / 100 * 11 - 5.5);
    g.add(d);
  }
  // The net across the middle: padded posts, a mesh, a white band on top.
  const netH = 3.4;
  for (const sx of [-1, 1]) {
    cyl(g, 0.14, 0.14, netH + 0.5, mat('#e5e7eb', { metal: 0.5, rough: 0.4 }), sx * (cw + 0.8), TOP, 0, 10);
    cyl(g, 0.32, 0.32, 2.2, mat(sx > 0 ? '#00b4d8' : '#ff5a5f'), sx * (cw + 0.8), TOP, 0, 12);
  }
  box(g, (cw + 0.8) * 2, 1.3, 0.05, mat('#1f2937', { opacity: 0.55 }), 0, TOP + netH - 1.3, 0);
  box(g, (cw + 0.8) * 2, 0.2, 0.08, mat('#ffffff'), 0, TOP + netH - 0.1, 0, true);
  // A palm, an umbrella and a cooler.
  const palm = new THREE.Group();
  palm.position.set(H - 1.6, TOP, -H + 1.8);
  for (let k = 0; k < 6; k++) {
    const s = cyl(palm, 0.3 - k * 0.02, 0.34 - k * 0.02, 1.15, mat('#8a6b48'), 0.12 * k * k * 0.1, k * 1.08, 0, 7);
    s.rotation.z = -0.05 * k;
  }
  const leafM = mat('#2f8f3f');
  for (let k = 0; k < 7; k++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3.4, 4), leafM);
    leaf.scale.set(1, 1, 0.25);
    const holder = new THREE.Group();
    holder.position.set(0.5, 6.6, 0);
    holder.rotation.y = (k / 7) * Math.PI * 2;
    leaf.rotation.z = Math.PI / 2 + 0.45;
    leaf.position.x = 1.5;
    leaf.castShadow = true;
    holder.add(leaf);
    palm.add(holder);
  }
  g.add(palm);
  const umb = new THREE.Group();
  umb.position.set(-H + 2, TOP, H - 2.2);
  cyl(umb, 0.05, 0.05, 3.2, mat('#f8fafc'), 0, 0, 0, 6);
  const top = new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.8, 8), mat('#f97316'));
  top.position.y = 3.3;
  top.castShadow = true;
  umb.add(top);
  const stripe = new THREE.Mesh(new THREE.ConeGeometry(2.12, 0.8, 8, 1, true, 0, Math.PI / 4), mat('#ffffff'));
  stripe.position.y = 3.3;
  umb.add(stripe);
  box(umb, 1.6, 0.05, 2.6, mat('#38bdf8'), 1.2, 0, 0.4);
  box(umb, 0.9, 0.6, 0.6, mat('#ef4444'), -1.1, 0, 1, true);
  g.add(umb);
  // Two players on each side and the ball going back and forth over the net.
  player(g, 11, -2.2, 3.8, Math.PI, ticks, 0);
  player(g, 12, 2.4, 4.6, Math.PI, ticks, 1.4);
  player(g, 13, -2.6, -4.4, 0, ticks, 0.7);
  player(g, 14, 2.1, -3.6, 0, ticks, 2.1);
  const ball = dyn(new THREE.Group());
  const v = ballMesh(0.36, mat('#fde047'));
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 6, 16), mat('#2563eb'));
  band.rotation.x = 1;
  ball.add(v, band);
  g.add(ball);
  const spin = rally(ball, new THREE.Vector3(-1, TOP + 2.8, 4), new THREE.Vector3(1.4, TOP + 2.8, -4), 4.2, 1.5);
  ticks.push((t) => { spin(t); ball.rotation.x = t * 5; });
  return { group: g, top: 7.4 };
}

function pickleLot(ticks: GamePark['ticks']): { group: THREE.Group; top: number } {
  const g = new THREE.Group();
  const H = LOT / 2;
  // Green surround, a blue court with a lighter kitchen, white lines.
  box(g, LOT - 0.6, 0.08, LOT - 0.6, mat('#2f7058'), 0, TOP - 0.04, 0);
  const cw = 4.4, cl = 7.6, kitchen = 2.4;
  box(g, cw * 2, 0.04, cl * 2, mat('#2a5f8f', { rough: 0.7 }), 0, TOP + 0.04, 0);
  box(g, cw * 2, 0.045, kitchen * 2, mat('#3d79aa', { rough: 0.7 }), 0, TOP + 0.04, 0);
  const line = mat('#f6f2e6');
  const ln = (w: number, d: number, x: number, z: number) => box(g, w, 0.05, d, line, x, TOP + 0.05, z);
  ln(cw * 2, 0.12, 0, -cl); ln(cw * 2, 0.12, 0, cl);
  ln(0.12, cl * 2, -cw, 0); ln(0.12, cl * 2, cw, 0);
  ln(cw * 2, 0.12, 0, -kitchen); ln(cw * 2, 0.12, 0, kitchen);
  ln(0.12, cl - kitchen, 0, -(kitchen + (cl - kitchen) / 2)); ln(0.12, cl - kitchen, 0, kitchen + (cl - kitchen) / 2);
  // The net, low, with its center strap.
  for (const sx of [-1, 1]) cyl(g, 0.08, 0.08, 1.2, mat('#2a2f36', { metal: 0.5 }), sx * (cw + 0.5), TOP, 0, 8);
  box(g, (cw + 0.5) * 2, 0.9, 0.04, mat('#111827', { opacity: 0.6 }), 0, TOP + 0.2, 0);
  box(g, (cw + 0.5) * 2, 0.12, 0.07, mat('#ffffff'), 0, TOP + 1.05, 0, true);
  // A low fence along the sides, a bench, and a light pole.
  const steel = mat('#4b5563', { metal: 0.6, rough: 0.4 });
  for (const sx of [-1, 1]) {
    for (let z = -H + 1; z <= H - 1; z += 4) cyl(g, 0.06, 0.06, 1.6, steel, sx * (H - 0.8), TOP, z, 6, false);
    box(g, 0.06, 0.06, LOT - 2, steel, sx * (H - 0.8), TOP + 1.55, 0);
    box(g, 0.03, 1.4, LOT - 2, mat('#1f2937', { opacity: 0.25 }), sx * (H - 0.8), TOP + 0.1, 0);
  }
  const wood = mat('#8a5a34');
  box(g, 0.6, 0.12, 3, wood, H - 2.2, TOP + 0.7, -4);
  box(g, 0.1, 0.6, 3, wood, H - 1.9, TOP + 0.85, -4);
  for (const dz of [-1.2, 1.2]) box(g, 0.5, 0.7, 0.1, steel, H - 2.2, TOP, -4 + dz);
  cyl(g, 0.1, 0.14, 7.5, steel, -H + 1.4, TOP, -H + 1.4, 8);
  const lampHead = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.7), mat('#fff7e0', { emissive: '#fff1d0', intensity: 1.2 }));
  lampHead.position.set(-H + 1.9, TOP + 7.6, -H + 1.9);
  lampHead.rotation.y = Math.PI / 4;
  g.add(lampHead);
  // Doubles: two on each side, and a dink going back and forth.
  player(g, 21, -2, 4.6, Math.PI, ticks, 0.3);
  player(g, 22, 2, 5.4, Math.PI, ticks, 1.1);
  player(g, 23, -1.8, -4.8, 0, ticks, 1.9);
  player(g, 24, 2.2, -5.6, 0, ticks, 2.7);
  const ball = dyn(ballMesh(0.2, mat('#dcff3d', { emissive: '#dcff3d', intensity: 0.25 })));
  g.add(ball);
  const hit = rally(ball, new THREE.Vector3(1.4, TOP + 1.3, 3.8), new THREE.Vector3(-1.2, TOP + 1.3, -4), 1.6, 1.1);
  ticks.push(hit);
  return { group: g, top: 8 };
}

function catLot(ticks: GamePark['ticks']): { group: THREE.Group; top: number } {
  const g = new THREE.Group();
  const H = LOT / 2;
  // A wild meadow: tall grass patches, wildflowers, a pond with lily pads, a log.
  box(g, LOT - 0.6, 0.1, LOT - 0.6, mat('#86c96a', { rough: 1 }), 0, TOP - 0.06, 0);
  const tall = mat('#5fae4f', { rough: 1 });
  for (let i = 0; i < 40; i++) {
    const x = ((i * 53) % 100) / 100 * (LOT - 3) - (LOT - 3) / 2;
    const z = ((i * 29) % 100) / 100 * (LOT - 3) - (LOT - 3) / 2;
    if (Math.hypot(x + 3, z + 2.5) < 3.6 || Math.hypot(x - 2.5, z - 1.5) < 3) continue;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.9, 4), tall);
    c.position.set(x, TOP + 0.45, z);
    g.add(c);
  }
  const petals = ['#f9a8d4', '#fde68a', '#c4b5fd', '#ffffff'];
  for (let i = 0; i < 16; i++) {
    const f = ballMesh(0.16, mat(petals[i % 4]));
    f.position.set(((i * 71) % 100) / 100 * (LOT - 4) - (LOT - 4) / 2, TOP + 0.35, ((i * 43) % 100) / 100 * (LOT - 4) - (LOT - 4) / 2);
    g.add(f);
  }
  const pond = new THREE.Mesh(new THREE.CircleGeometry(2.8, 24), mat('#3b9fd8', { rough: 0.15, metal: 0.2 }));
  pond.rotation.x = -Math.PI / 2;
  pond.scale.set(1, 0.75, 1);
  pond.position.set(-3, TOP + 0.08, -2.5);
  g.add(pond);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.25, 6, 24), mat('#9ca3af', { rough: 1 }));
  rim.rotation.x = -Math.PI / 2;
  rim.scale.set(1, 0.75, 1);
  rim.position.set(-3, TOP + 0.08, -2.5);
  g.add(rim);
  for (const [x, z] of [[-3.8, -2.8], [-2.2, -2], [-3, -3.4]]) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.4, 10), mat('#4ade80'));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(x, TOP + 0.1, z);
    g.add(pad);
  }
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3.4, 10), mat('#7a5638'));
  log.rotation.z = Math.PI / 2;
  log.position.set(3.4, TOP + 0.5, 4.6);
  log.castShadow = true;
  g.add(log);
  tree(g, H - 2, -H + 2, 1.8, 'round', '#4f9a4a');
  tree(g, -H + 1.8, H - 2.4, 1.5, 'pine');
  tree(g, H - 2.2, H - 6, 1.3, 'round', '#6ab04c');
  // A cat tower, scaled to the city, with a cat on top.
  const tower = catTower((f) => ticks.push(f));
  tower.scale.setScalar(2.2);
  tower.position.set(2.6, TOP, -1.8);
  tower.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  dyn(tower);
  g.add(tower);
  const furs = ['#f59e0b', '#374151', '#e5e7eb', '#9a7b5c', '#111827'];
  const cats = furs.map((fur) => {
    const c = petFigure('cat', fur);
    dyn(c.group);
    c.group.scale.multiplyScalar(1.5);
    g.add(c.group);
    return c;
  });
  // Perched on the tower.
  cats[0].group.position.set(2.6 + 0.05 * 2.2, TOP + 2.24 * 2.2, -1.8 + 0.02 * 2.2);
  // Asleep by the pond.
  cats[1].group.position.set(-0.4, TOP, -0.6);
  cats[1].group.rotation.y = 2.2;
  // On the log.
  cats[2].group.position.set(3.2, TOP + 1, 4.6);
  cats[2].group.rotation.y = -1.2;
  // Two chasing a ball of yarn around the meadow.
  const yarn = toy(1);
  yarn.scale.setScalar(2.4);
  dyn(yarn);
  g.add(yarn);
  ticks.push((t) => {
    const a = t * 0.7;
    const at = (k: number) => ({ x: 0.8 + Math.cos(a - k) * 4.2, z: 2.6 + Math.sin(a - k) * 2.4 });
    const y = at(0);
    yarn.position.set(y.x, TOP, y.z);
    yarn.rotation.z = -t * 3;
    [cats[3], cats[4]].forEach((c, i) => {
      const p = at(0.55 + i * 0.5);
      const q = at(0.5 + i * 0.5);
      c.group.position.set(p.x, TOP + Math.abs(Math.sin(t * 7 + i)) * 0.18, p.z);
      c.group.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
      c.legs.forEach((l, k) => { l.rotation.x = Math.sin(t * 12 + (k % 2 ? Math.PI : 0) + i) * 0.6; });
      c.tail.rotation.x = 0.6 + Math.sin(t * 6 + i) * 0.3;
    });
    cats[0].tail.rotation.z = Math.sin(t * 1.4) * 0.5;
    cats[0].head.rotation.y = Math.sin(t * 0.6) * 0.6;
    cats[1].rig.scale.y = 0.62 + Math.sin(t * 1.3) * 0.03;
    cats[2].head.rotation.y = Math.sin(t * 0.8 + 1) * 0.7;
  });
  return { group: g, top: 7 };
}

export function buildGamePark(grid: Grid): GamePark {
  const g = new THREE.Group();
  const ticks: GamePark['ticks'] = [];
  const W = grid.width;
  const w = LOT * 2 + PATH * 3, d = LOT * 2 + PATH * 3;
  const x0 = W / 2 + 3 + GAP, x1 = x0 + w;
  const z0 = -d / 2, z1 = d / 2;
  const cx = (x0 + x1) / 2;
  const bounds: Rect = { x0, z0, x1, z1 };

  // The ground: earth under grass, the same height as the city's island.
  const earth = new THREE.Mesh(new THREE.BoxGeometry(w, 5, d), mat('#6b4f3a'));
  earth.position.set(cx, -2.6, 0);
  g.add(earth);
  box(g, w, 0.56, d, mat('#a6d98a'), cx, -0.2, 0);
  // A cross of paths from the gate, and a fountain where they meet.
  const pathM = mat('#e7dcc6', { rough: 1 });
  box(g, w - 2, 0.06, PATH, pathM, cx, TOP - 0.02, 0);
  box(g, PATH, 0.06, d - 2, pathM, cx, TOP - 0.02, 0);
  cyl(g, 2.2, 2.4, 0.6, mat('#cbd5e1'), cx, TOP, 0, 20);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.9, 20), mat('#60a5fa', { rough: 0.1, metal: 0.3 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(cx, TOP + 0.62, 0);
  g.add(water);
  cyl(g, 0.25, 0.3, 1.6, mat('#cbd5e1'), cx, TOP + 0.6, 0, 10);
  const spray = dyn(new THREE.Group());
  const drop = mat('#bfdbfe', { opacity: 0.85 });
  for (let i = 0; i < 10; i++) spray.add(ballMesh(0.12, drop));
  spray.position.set(cx, TOP + 2.2, 0);
  g.add(spray);
  ticks.push((t) => spray.children.forEach((s, i) => {
    const k = (t * 0.9 + i / 10) % 1;
    const a = (i / 10) * Math.PI * 2;
    s.position.set(Math.cos(a) * k * 1.6, Math.sin(k * Math.PI) * 1.1 - k * 0.6, Math.sin(a) * k * 1.6);
  }));

  // The four lots. Their own frame has the path along +z; turn each to face the cross.
  const builds: Record<GameId, (t: GamePark['ticks']) => { group: THREE.Group; top: number }> = { mow: mowLot, volleyball: volleyLot, pickleball: pickleLot, catlife: catLot };
  const signs: Record<GameId, [string, string, string]> = {
    mow: ['CLEAN CUT', '#166534', '#fef08a'],
    volleyball: ['VOLLEYBALL', '#0369a1', '#fde047'],
    pickleball: ['PICKLEBALL', '#1d3557', '#dcff3d'],
    catlife: ['WHISKER WILDS', '#7c2d12', '#fed7aa'],
  };
  const off = LOT / 2 + PATH / 2;
  // The two nearest the gate are the sports; the far two are the lawn and the cats.
  const spots: [GameId, number, number][] = [['volleyball', -1, -1], ['pickleball', -1, 1], ['mow', 1, -1], ['catlife', 1, 1]];
  const lots: GameLot[] = [];
  for (const [id, sx, sz] of spots) {
    const built = builds[id](ticks);
    const lx = cx + sx * off;
    const lz = sz * off;
    built.group.position.set(lx, 0, lz);
    // Local +z (where the path is) should point toward z = 0.
    built.group.rotation.y = sz > 0 ? Math.PI : 0;
    g.add(built.group);
    const [text, bg, fg] = signs[id];
    lotSign(g, text, bg, fg, lx + sx * -3.5, lz - sz * (LOT / 2 - 0.4), sz > 0 ? Math.PI : 0);
    lots.push({ id, group: built.group, center: { x: lx, z: lz }, door: { x: lx, z: lz - sz * (LOT / 2) }, top: built.top });
  }

  // The gate, on the town side, with the road back to town.
  const gate = { x: x0, z: 0 };
  const wood = mat('#4b5563');
  for (const s of [-1, 1]) box(g, 0.5, 5.4, 0.5, wood, x0 + 1, 0.3, s * 3, true);
  const board = sign('GAME PARK', 6.8, 1.4, '#1a0f2e', '#ffd23f');
  board.position.set(x0 + 1.3, 5, 0);
  board.rotation.y = -Math.PI / 2;
  g.add(board);
  const back = board.clone();
  back.rotation.y = Math.PI / 2;
  back.position.x = x0 + 0.7;
  g.add(back);
  // Bunting between the posts.
  const flags = ['#ff5a5f', '#00b4d8', '#facc15', '#22c55e', '#a855f7'];
  for (let i = 0; i < 9; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 3), mat(flags[i % flags.length]));
    f.rotation.x = Math.PI;
    f.position.set(x0 + 1, 5.6 - Math.sin((i / 8) * Math.PI) * 0.5, -2.8 + i * 0.7);
    g.add(f);
  }
  // Hedges around the edge, with a gap for the gate.
  const hedge = mat('#3e8e47');
  box(g, w - 2, 1.2, 0.9, hedge, cx, TOP - 0.1, z0 + 0.6, true);
  box(g, w - 2, 1.2, 0.9, hedge, cx, TOP - 0.1, z1 - 0.6, true);
  box(g, 0.9, 1.2, d - 2, hedge, x1 - 0.6, TOP - 0.1, 0, true);
  for (const s of [-1, 1]) box(g, 0.9, 1.2, d / 2 - 4, hedge, x0 + 0.6, TOP - 0.1, s * (d / 4 + 1.5), true);

  const road: Rect = { x0: W / 2 + 2, z0: -2.2, x1: x0 + 2, z1: 2.2 };
  box(g, road.x1 - road.x0, 0.1, road.z1 - road.z0, mat('#9ca3af', { rough: 0.9 }), (road.x0 + road.x1) / 2, 0.05, 0);
  for (let x = road.x0 + 1.5; x < road.x1 - 1; x += 3) box(g, 1.4, 0.02, 0.18, mat('#fde68a'), x, 0.12, 0);

  return { group: g, ticks, bounds, road, gate, lots };
}
