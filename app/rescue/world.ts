// Paws & Found — world maps.
// Top-down tile maps for HQ and the five rescue regions. Fixed seeds so the
// maps are consistent — the girls learn the places; missions vary on top.

import type { Place } from './types';

export const TILE = 48; // world px per tile

export const G = {
  GRASS: 0,
  MEADOW: 1,
  PATH: 2,
  WATER: 3,
  DEEP: 4,
  SAND: 5,
  MUD: 6,
  ROCK: 7, // walkable stone
  CLIFF: 8, // blocked
  BOARD: 9, // boardwalk
  DIRT: 10, // farm soil
  TALLGRASS: 11,
} as const;
export type GroundId = (typeof G)[keyof typeof G];

export type PropKind =
  | 'tree'
  | 'willow'
  | 'pinetree'
  | 'bush'
  | 'berrybush'
  | 'appletree'
  | 'rock'
  | 'stump'
  | 'flower'
  | 'cattail'
  | 'haybale'
  | 'fence'
  | 'barn'
  | 'cottage'
  | 'sign'
  | 'bridge'
  | 'lilypad'
  | 'gardenbed'
  | 'tower'
  | 'cozyroom'
  | 'medbay'
  | 'playyard'
  | 'mailbox'
  | 'maptable'
  | 'waterfall'
  | 'log';

export interface Prop {
  x: number; // tile coords (float ok)
  y: number;
  kind: PropKind;
  v: number; // variant
  s: number; // scale
  upgradeId?: string; // facility props only drawn when owned
}

export interface RegionMap {
  id: Place;
  w: number;
  h: number;
  ground: Uint8Array;
  blocked: Uint8Array; // collision (1 = no walk)
  props: Prop[];
  entry: { x: number; y: number }; // player spawn
  hideSpots: { x: number; y: number }[]; // candidate animal hiding places
  // HQ specials
  gate?: { x: number; y: number }; // where owners appear
  table?: { x: number; y: number }; // map table
  yard?: { x: number; y: number; r: number }; // resident wandering area
}

function rng32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function h2(x: number, y: number, s = 1): number {
  let h = Math.imul(x, 668265263) + Math.imul(y, 374761393) + Math.imul(s, 1597334677);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noiseMaker(seed: number) {
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = sm(x - xi);
    const yf = sm(y - yi);
    const a = h2(xi, yi, seed);
    const b = h2(xi + 1, yi, seed);
    const c = h2(xi, yi + 1, seed);
    const d = h2(xi + 1, yi + 1, seed);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

class Builder {
  w: number;
  h: number;
  ground: Uint8Array;
  blocked: Uint8Array;
  props: Prop[] = [];
  constructor(w: number, h: number, fill: GroundId) {
    this.w = w;
    this.h = h;
    this.ground = new Uint8Array(w * h).fill(fill);
    this.blocked = new Uint8Array(w * h);
  }
  g(x: number, y: number, id: GroundId) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.ground[y * this.w + x] = id;
  }
  get(x: number, y: number): GroundId {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return G.CLIFF;
    return this.ground[y * this.w + x] as GroundId;
  }
  block(x: number, y: number, on = true) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.blocked[y * this.w + x] = on ? 1 : 0;
  }
  /** circle of ground */
  disc(cx: number, cy: number, r: number, id: GroundId) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++)
        if (Math.hypot(x - cx, y - cy) <= r) this.g(x, y, id);
  }
  /** wandering path between two points */
  trail(x0: number, y0: number, x1: number, y1: number, id: GroundId, rnd: () => number, width = 1) {
    let x = x0;
    let y = y0;
    for (let i = 0; i < 400; i++) {
      const dx = x1 - x;
      const dy = y1 - y;
      if (Math.hypot(dx, dy) < 1) break;
      const ang = Math.atan2(dy, dx) + (rnd() - 0.5) * 0.9;
      x += Math.cos(ang);
      y += Math.sin(ang);
      for (let oy = -width + 1; oy < width; oy++)
        for (let ox = -width + 1; ox < width; ox++) this.g(Math.round(x + ox), Math.round(y + oy), id);
    }
  }
  prop(x: number, y: number, kind: PropKind, v = 0, s = 1, blockR = 0, upgradeId?: string) {
    this.props.push({ x, y, kind, v, s, upgradeId });
    if (blockR > 0) {
      for (let by = Math.floor(y - blockR); by <= y + blockR; by++)
        for (let bx = Math.floor(x - blockR); bx <= x + blockR; bx++)
          if (Math.hypot(bx - x, by - y) <= blockR) this.block(bx, by);
    }
  }
  finishBlocking() {
    for (let i = 0; i < this.ground.length; i++) {
      const t = this.ground[i];
      if (t === G.WATER || t === G.DEEP || t === G.CLIFF) this.blocked[i] = 1;
    }
    // boardwalks over water are walkable
    for (let i = 0; i < this.ground.length; i++) {
      if (this.ground[i] === G.BOARD) this.blocked[i] = 0;
    }
  }
}

// ---------------------------------------------------------------------------------
// region builders
// ---------------------------------------------------------------------------------

function buildWoods(): RegionMap {
  const W = 44;
  const r = rng32(7101);
  const n = noiseMaker(31);
  const b = new Builder(W, W, G.GRASS);
  // meadow patches + tall grass
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const v = n(x / 7, y / 7);
      if (v > 0.66) b.g(x, y, G.TALLGRASS);
      else if (v < 0.34) b.g(x, y, G.MEADOW);
    }
  // a pond
  b.disc(33, 12, 3.4, G.WATER);
  b.disc(33, 12, 1.6, G.DEEP);
  // winding path from south entry
  const entry = { x: 22, y: 41 };
  b.trail(22, 42, 20, 22, G.PATH, r);
  b.trail(20, 22, 10, 8, G.PATH, r);
  // trees — dense, but keep the path clear
  for (let y = 2; y < W - 2; y++)
    for (let x = 2; x < W - 2; x++) {
      if (b.get(x, y) !== G.GRASS && b.get(x, y) !== G.TALLGRASS) continue;
      const d = h2(x, y, 71);
      let nearPath = false;
      for (let oy = -1; oy <= 1 && !nearPath; oy++)
        for (let ox = -1; ox <= 1; ox++)
          if (b.get(x + ox, y + oy) === G.PATH) {
            nearPath = true;
            break;
          }
      if (nearPath) continue;
      if (d < 0.17) b.prop(x + h2(x, y, 3) * 0.6, y + h2(x, y, 4) * 0.6, h2(x, y, 5) < 0.2 ? 'willow' : 'tree', Math.floor(h2(x, y, 6) * 3), 0.95 + h2(x, y, 7) * 0.45, 0.5);
      else if (d < 0.17) b.prop(x, y, 'bush', Math.floor(h2(x, y, 8) * 3), 0.9 + h2(x, y, 9) * 0.3, 0.4);
      else if (d < 0.2) b.prop(x, y, 'berrybush', Math.floor(h2(x, y, 10) * 2), 1, 0.4);
      else if (d < 0.215) b.prop(x, y, 'stump', 0, 1, 0.3);
      else if (d < 0.25) b.prop(x, y, 'flower', Math.floor(h2(x, y, 11) * 4), 1, 0);
    }
  b.prop(22, 39.5, 'sign', 0, 1, 0);
  b.finishBlocking();
  const hideSpots = collectHideSpots(b, 90);
  return { id: 'woods', w: W, h: W, ground: b.ground, blocked: b.blocked, props: b.props, entry, hideSpots };
}

function buildFarm(): RegionMap {
  const W = 44;
  const r = rng32(7202);
  const n = noiseMaker(33);
  const b = new Builder(W, W, G.MEADOW);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) if (n(x / 8, y / 8) > 0.62) b.g(x, y, G.GRASS);
  // plowed field rows
  for (let y = 26; y < 34; y++) for (let x = 6; x < 18; x++) b.g(x, y, y % 2 ? G.DIRT : G.MEADOW);
  // farm path
  const entry = { x: 22, y: 41 };
  b.trail(22, 42, 24, 14, G.PATH, r);
  // barn
  b.prop(27, 12, 'barn', 0, 1, 0);
  for (let by = 9; by <= 13; by++) for (let bx = 24; bx <= 30; bx++) b.block(bx, by);
  // fences along the field
  for (let x = 5; x <= 19; x++) {
    b.prop(x, 24.6, 'fence', 0, 1, 0);
    b.block(x, 25);
  }
  // orchard corner
  for (let i = 0; i < 7; i++) {
    const ox = 33 + (i % 3) * 3.2 + h2(i, 1, 91) * 0.8;
    const oy = 28 + Math.floor(i / 3) * 3.4 + h2(i, 2, 91) * 0.8;
    b.prop(ox, oy, 'appletree', i % 2, 1, 0.5);
  }
  // hay bales + flowers + scattered trees
  for (let i = 0; i < 6; i++) b.prop(8 + h2(i, 3, 92) * 30, 17 + h2(i, 4, 92) * 6, 'haybale', 0, 1, 0.4);
  for (let i = 0; i < 52; i++) b.prop(3 + h2(i, 5, 93) * 38, 3 + h2(i, 6, 93) * 38, 'flower', i % 4, 1, 0);
  for (let i = 0; i < 14; i++) b.prop(4 + h2(i, 8, 95) * 36, 4 + h2(i, 9, 95) * 36, 'bush', i % 3, 1, 0.4);
  for (let i = 0; i < 9; i++) {
    const tx = 3 + h2(i, 11, 96) * 38;
    const ty = 34 + h2(i, 12, 96) * 8;
    b.prop(tx, ty, i % 3 ? 'tree' : 'willow', i % 3, 0.9 + h2(i, 13, 96) * 0.4, 0.5);
  }
  b.prop(22, 39.5, 'sign', 1, 1, 0);
  b.finishBlocking();
  return { id: 'farm', w: W, h: W, ground: b.ground, blocked: b.blocked, props: b.props, entry, hideSpots: collectHideSpots(b, 90) };
}

function buildCreek(): RegionMap {
  const W = 44;
  const r = rng32(7303);
  const b = new Builder(W, W, G.GRASS);
  const n = noiseMaker(35);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) if (n(x / 7, y / 7) > 0.64) b.g(x, y, G.MEADOW);
  // cliff band at top with waterfall
  for (let y = 0; y < 5; y++) for (let x = 0; x < W; x++) b.g(x, y, G.CLIFF);
  // the creek: winds from the falls down the map
  let cx = 14;
  for (let y = 4; y < W; y++) {
    cx += Math.sin(y * 0.35) * 1.1 + (r() - 0.5) * 0.6;
    const width = 2 + Math.sin(y * 0.2) * 0.6;
    for (let x = Math.floor(cx - width); x <= cx + width; x++) b.g(x, Math.floor(y), G.WATER);
    b.g(Math.round(cx), y, G.DEEP);
    // sandy banks
    b.g(Math.floor(cx - width) - 1, y, G.SAND);
    b.g(Math.ceil(cx + width) + 1, y, G.SAND);
  }
  b.prop(14, 4.6, 'waterfall', 0, 1, 0);
  // bridge across the middle
  for (let x = 10; x <= 20; x++) {
    b.g(x, 22, G.BOARD);
    b.g(x, 23, G.BOARD);
  }
  b.prop(15, 21.4, 'bridge', 0, 1, 0);
  const entry = { x: 30, y: 41 };
  b.trail(30, 42, 24, 23, G.PATH, r);
  // trees & rocks
  for (let i = 0; i < 44; i++) {
    const x = 2 + h2(i, 1, 81) * 40;
    const y = 7 + h2(i, 2, 81) * 34;
    if (b.get(Math.round(x), Math.round(y)) !== G.GRASS && b.get(Math.round(x), Math.round(y)) !== G.MEADOW) continue;
    if (i % 3 === 0) b.prop(x, y, 'tree', i % 3, 0.9 + h2(i, 3, 81) * 0.3, 0.5);
    else if (i % 3 === 1) b.prop(x, y, 'rock', i % 2, 0.9, 0.4);
    else b.prop(x, y, 'bush', i % 3, 1, 0.4);
  }
  for (let i = 0; i < 5; i++) b.prop(12 + h2(i, 7, 82) * 8, 30 + h2(i, 8, 82) * 8, 'lilypad', 0, 1, 0);
  for (let i = 0; i < 14; i++) b.prop(3 + h2(i, 9, 83) * 38, 6 + h2(i, 10, 83) * 34, 'flower', i % 4, 1, 0);
  b.prop(30, 39.5, 'sign', 2, 1, 0);
  b.finishBlocking();
  return { id: 'creek', w: W, h: W, ground: b.ground, blocked: b.blocked, props: b.props, entry, hideSpots: collectHideSpots(b, 90) };
}

function buildRidge(): RegionMap {
  const W = 44;
  const r = rng32(7404);
  const n = noiseMaker(37);
  const b = new Builder(W, W, G.GRASS);
  // elevation bands: south low grass → mid rock shelf → high cliffs north
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const elev = (W - y) / W + (n(x / 9, y / 9) - 0.5) * 0.28;
      if (elev > 0.82) b.g(x, y, G.CLIFF);
      else if (elev > 0.55) b.g(x, y, G.ROCK);
      else if (n(x / 6, y / 6) > 0.68) b.g(x, y, G.TALLGRASS);
    }
  // carve two ramp passes through the cliff band
  for (const px of [12, 30]) {
    for (let y = 2; y < W; y++) {
      for (let ox = -1; ox <= 1; ox++) {
        const i = y * W + px + ox;
        if (b.ground[i] === G.CLIFF) b.ground[i] = G.ROCK;
      }
    }
  }
  const entry = { x: 22, y: 41 };
  b.trail(22, 42, 12, 20, G.PATH, r);
  // boulders, pines, ledg props
  for (let i = 0; i < 30; i++) {
    const x = 2 + h2(i, 1, 61) * 40;
    const y = 3 + h2(i, 2, 61) * 38;
    const t = b.get(Math.round(x), Math.round(y));
    if (t === G.CLIFF) continue;
    if (t === G.ROCK) {
      if (i % 2) b.prop(x, y, 'rock', i % 2, 1 + h2(i, 3, 61) * 0.5, 0.5);
      else if (i % 5 === 0) b.prop(x, y, 'pinetree', 0, 0.9, 0.5);
    } else {
      if (i % 3 === 0) b.prop(x, y, 'pinetree', 0, 0.9 + h2(i, 4, 61) * 0.4, 0.5);
      else if (i % 3 === 1) b.prop(x, y, 'bush', i % 3, 1, 0.4);
      else b.prop(x, y, 'flower', i % 4, 1, 0);
    }
  }
  b.prop(22, 39.5, 'sign', 3, 1, 0);
  b.finishBlocking();
  return { id: 'ridge', w: W, h: W, ground: b.ground, blocked: b.blocked, props: b.props, entry, hideSpots: collectHideSpots(b, 90) };
}

function buildMarsh(): RegionMap {
  const W = 44;
  const r = rng32(7505);
  const n = noiseMaker(39);
  const b = new Builder(W, W, G.MUD);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const v = n(x / 6, y / 6);
      if (v < 0.4) b.g(x, y, G.WATER);
      else if (v > 0.62) b.g(x, y, G.GRASS);
    }
  // boardwalk paths from entry across the wet bits
  const entry = { x: 22, y: 41 };
  const walk = (x0: number, y0: number, x1: number, y1: number) => {
    let x = x0;
    let y = y0;
    for (let i = 0; i < 300; i++) {
      const dx = x1 - x;
      const dy = y1 - y;
      if (Math.hypot(dx, dy) < 1) break;
      const ang = Math.atan2(dy, dx) + (r() - 0.5) * 0.5;
      x += Math.cos(ang);
      y += Math.sin(ang);
      b.g(Math.round(x), Math.round(y), G.BOARD);
      b.g(Math.round(x + 1), Math.round(y), G.BOARD);
    }
  };
  walk(22, 42, 14, 20);
  walk(22, 36, 32, 14);
  // cattails & lilypads
  for (let y = 2; y < W - 2; y++)
    for (let x = 2; x < W - 2; x++) {
      const t = b.get(x, y);
      const d = h2(x, y, 51);
      if (t === G.MUD && d < 0.1) b.prop(x + d * 4, y, 'cattail', Math.floor(h2(x, y, 52) * 2), 1, 0);
      else if (t === G.WATER && d > 0.94) b.prop(x, y, 'lilypad', 0, 1, 0);
      else if (t === G.GRASS && d < 0.06) b.prop(x, y, 'willow', 0, 0.85 + h2(x, y, 53) * 0.3, 0.5);
      else if (t === G.GRASS && d > 0.95) b.prop(x, y, 'log', 0, 1, 0.4);
    }
  b.prop(22, 39.5, 'sign', 4, 1, 0);
  b.finishBlocking();
  return { id: 'marsh', w: W, h: W, ground: b.ground, blocked: b.blocked, props: b.props, entry, hideSpots: collectHideSpots(b, 90) };
}

function buildHQ(): RegionMap {
  const W = 36;
  const r = rng32(7000);
  const b = new Builder(W, W, G.GRASS);
  const n = noiseMaker(41);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) if (n(x / 7, y / 7) > 0.62) b.g(x, y, G.MEADOW);
  // cottage (the rescue center) upper middle
  b.prop(18, 10, 'cottage', 0, 1, 0);
  for (let by = 6; by <= 11; by++) for (let bx = 14; bx <= 22; bx++) b.block(bx, by);
  // path from gate (south) to door
  b.trail(18, 31, 18, 12, G.PATH, r);
  // perimeter fence with a south gate
  for (let x = 4; x <= 31; x++) {
    if (Math.abs(x - 18) > 1.5) {
      b.prop(x, 31.6, 'fence', 0, 1, 0);
      b.block(x, 32);
    }
    b.prop(x, 3.6, 'fence', 0, 1, 0);
    b.block(x, 4);
  }
  for (let y = 4; y <= 31; y++) {
    b.prop(3.6, y, 'fence', 1, 1, 0);
    b.block(3, y);
    b.prop(31.6, y, 'fence', 1, 1, 0);
    b.block(32, y);
  }
  // pond, garden flowers, trees
  b.disc(9, 24, 2.4, G.WATER);
  b.prop(9, 22, 'lilypad', 0, 1, 0);
  b.prop(6, 8, 'tree', 0, 1, 0.5);
  b.prop(28, 7, 'tree', 1, 1, 0.5);
  b.prop(27, 27, 'willow', 0, 1, 0.5);
  for (let i = 0; i < 16; i++) b.prop(5 + h2(i, 1, 11) * 26, 14 + h2(i, 2, 11) * 15, 'flower', i % 4, 1, 0);
  for (let i = 0; i < 4; i++) b.prop(6 + h2(i, 3, 12) * 24, 6 + h2(i, 4, 12) * 4, 'bush', i % 3, 1, 0.4);
  // the map table on the porch side
  b.prop(23.5, 12.5, 'maptable', 0, 1, 0.4);
  b.prop(13, 13, 'mailbox', 0, 1, 0.3);
  // facility upgrade spots (drawn only when owned)
  b.prop(8.5, 11, 'medbay', 0, 1, 0, 'medbay');
  b.prop(27, 12.5, 'cozyroom', 0, 1, 0, 'cozyroom');
  b.prop(12, 19, 'gardenbed', 0, 1, 0, 'garden');
  b.prop(28, 20, 'tower', 0, 1, 0, 'tower');
  b.prop(19, 23, 'playyard', 0, 1, 0, 'playyard');
  b.finishBlocking();
  // make sure the gate row stays open
  for (let x = 16; x <= 20; x++) b.block(x, 32, false);
  return {
    id: 'hq',
    w: W,
    h: W,
    ground: b.ground,
    blocked: b.blocked,
    props: b.props,
    entry: { x: 18, y: 28 },
    hideSpots: [],
    gate: { x: 18, y: 30.5 },
    table: { x: 23.5, y: 13.5 },
    yard: { x: 18, y: 20, r: 9 },
  };
}

function collectHideSpots(b: Builder, want: number): { x: number; y: number }[] {
  // walkable tiles adjacent to cover (bush/tree/rock props or tall grass)
  const spots: { x: number; y: number }[] = [];
  const coverAt = new Set<number>();
  for (const p of b.props) {
    if (p.kind === 'bush' || p.kind === 'berrybush' || p.kind === 'tree' || p.kind === 'willow' || p.kind === 'rock' || p.kind === 'pinetree' || p.kind === 'haybale' || p.kind === 'cattail' || p.kind === 'log' || p.kind === 'appletree' || p.kind === 'stump') {
      coverAt.add(Math.round(p.y) * b.w + Math.round(p.x));
    }
  }
  for (let y = 3; y < b.h - 3; y++) {
    for (let x = 3; x < b.w - 3; x++) {
      if (b.blocked[y * b.w + x]) continue;
      const t = b.ground[y * b.w + x];
      const nearCover =
        coverAt.has(y * b.w + x + 1) ||
        coverAt.has(y * b.w + x - 1) ||
        coverAt.has((y + 1) * b.w + x) ||
        coverAt.has((y - 1) * b.w + x) ||
        t === G.TALLGRASS;
      if (nearCover && h2(x, y, 99) < 0.5) spots.push({ x: x + 0.5, y: y + 0.5 });
      if (spots.length >= want) return spots;
    }
  }
  return spots;
}

// ---------------------------------------------------------------------------------

const cache = new Map<Place, RegionMap>();

export function getMap(place: Place): RegionMap {
  let m = cache.get(place);
  if (m) return m;
  switch (place) {
    case 'hq':
      m = buildHQ();
      break;
    case 'woods':
      m = buildWoods();
      break;
    case 'farm':
      m = buildFarm();
      break;
    case 'creek':
      m = buildCreek();
      break;
    case 'ridge':
      m = buildRidge();
      break;
    case 'marsh':
      m = buildMarsh();
      break;
  }
  cache.set(place, m);
  return m;
}

export function walkable(m: RegionMap, x: number, y: number): boolean {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= m.w || yi >= m.h) return false;
  return !m.blocked[yi * m.w + xi];
}

export function groundAt(m: RegionMap, x: number, y: number): GroundId {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= m.w || yi >= m.h) return G.CLIFF;
  return m.ground[yi * m.w + xi] as GroundId;
}
