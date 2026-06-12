// Wildwood — procedural world generation.
// A 96x96 isometric valley: a lake fed by a river, marsh edges, open meadow,
// deciduous forest, a pine ridge, and a cabin clearing where you live.

import type { Habitat } from './species';

export const MAP = 96;
export const TILE_W = 64;
export const TILE_H = 32;

export const T = {
  DEEP: 0,
  WATER: 1,
  SAND: 2,
  MARSH: 3,
  GRASS: 4,
  MEADOW: 5,
  FOREST: 6,
  PINE: 7,
  ROCK: 8,
  PATH: 9,
} as const;
export type TileId = (typeof T)[keyof typeof T];

export interface Tree {
  x: number;
  y: number;
  kind: 'oak' | 'pine' | 'birch';
  variant: number; // index into pre-rendered variants
  scale: number;
}

export interface World {
  seed: number;
  tiles: Uint8Array; // MAP*MAP
  trees: Tree[];
  treeGrid: Map<number, Tree[]>; // coarse grid for nearby-tree lookup (cell = 8 tiles)
  lake: { x: number; y: number; r: number };
  cabin: { x: number; y: number };
  spawn: { x: number; y: number };
  riverTiles: Set<number>;
  shoreTiles: { x: number; y: number }[]; // walkable tiles adjacent to water
}

// ---- deterministic random ----------------------------------------------------

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** fast deterministic hash of two ints -> [0,1) — used for per-tile detail */
export function hash2(x: number, y: number, seed = 1): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// value noise + fbm
function makeNoise(seed: number) {
  const grid = (x: number, y: number) => hash2(x, y, seed);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const a = grid(xi, yi);
    const b = grid(xi + 1, yi);
    const c = grid(xi, yi + 1);
    const d = grid(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

function fbm(noise: (x: number, y: number) => number, x: number, y: number, octaves = 4) {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * noise(x * freq, y * freq);
    amp *= 0.5;
    freq *= 2;
  }
  return v;
}

// ---- generation ---------------------------------------------------------------

export function generateWorld(seed = 20260612): World {
  const rng = mulberry32(seed);
  const elevN = makeNoise(seed * 7 + 1);
  const vegN = makeNoise(seed * 13 + 5);
  const wetN = makeNoise(seed * 31 + 9);

  const tiles = new Uint8Array(MAP * MAP).fill(T.GRASS);
  const idx = (x: number, y: number) => y * MAP + x;

  const lake = { x: 62, y: 58, r: 15 };
  const cabin = { x: 38, y: 50 };

  // elevation field with a lake basin carved out
  const elev = new Float32Array(MAP * MAP);
  for (let y = 0; y < MAP; y++) {
    for (let x = 0; x < MAP; x++) {
      let e = fbm(elevN, x / 22, y / 22, 4); // ~0..1
      const dl = Math.hypot(x - lake.x, y - lake.y);
      e -= Math.max(0, 1 - dl / lake.r) * 0.85; // lake basin
      // gentle rise toward the NW corner (pine ridge)
      e += Math.max(0, 1 - Math.hypot(x - 14, y - 14) / 34) * 0.32;
      elev[idx(x, y)] = e;
    }
  }

  // river: meanders from the north edge down into the lake
  const riverTiles = new Set<number>();
  {
    let rx = 70;
    for (let ry = 0; ry < MAP; ry++) {
      rx += Math.sin(ry * 0.18 + 2.1) * 0.9 + (rng() - 0.5) * 0.5;
      rx = Math.max(4, Math.min(MAP - 5, rx));
      const dl = Math.hypot(rx - lake.x, ry - lake.y);
      if (dl < lake.r * 0.7) break; // reached the lake
      const w = 1 + Math.max(0, 1 - dl / (lake.r + 8)) * 1.6; // widen near the mouth
      for (let dx = -Math.ceil(w); dx <= Math.ceil(w); dx++) {
        const tx = Math.round(rx) + dx;
        if (tx < 0 || tx >= MAP) continue;
        if (Math.abs(dx) <= w) {
          elev[idx(tx, ry)] = Math.min(elev[idx(tx, ry)], 0.18);
          riverTiles.add(idx(tx, ry));
        }
      }
    }
  }

  // water levels
  const WATER_LVL = 0.3;
  for (let y = 0; y < MAP; y++) {
    for (let x = 0; x < MAP; x++) {
      const e = elev[idx(x, y)];
      if (e < WATER_LVL - 0.18) tiles[idx(x, y)] = T.DEEP;
      else if (e < WATER_LVL) tiles[idx(x, y)] = T.WATER;
    }
  }

  const isWaterTile = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= MAP || y >= MAP) return false;
    const t = tiles[idx(x, y)];
    return t === T.DEEP || t === T.WATER;
  };

  // land cover
  for (let y = 0; y < MAP; y++) {
    for (let x = 0; x < MAP; x++) {
      const i = idx(x, y);
      if (tiles[i] === T.DEEP || tiles[i] === T.WATER) continue;
      const e = elev[i];
      const veg = fbm(vegN, x / 16, y / 16, 3);
      const wet = fbm(wetN, x / 12, y / 12, 3);

      // distance-to-water (within 3) for shores and marsh
      let nearWater = 0;
      outer: for (let d = 1; d <= 3; d++) {
        for (let dy = -d; dy <= d; dy++) {
          for (let dx = -d; dx <= d; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
            if (isWaterTile(x + dx, y + dy)) {
              nearWater = 4 - d;
              break outer;
            }
          }
        }
      }

      if (nearWater >= 3) {
        tiles[i] = wet > 0.52 ? T.MARSH : T.SAND;
      } else if (nearWater === 2 && wet > 0.58) {
        tiles[i] = T.MARSH;
      } else if (e > 0.78 && veg < 0.5) {
        tiles[i] = T.ROCK;
      } else if (veg > 0.62) {
        tiles[i] = e > 0.62 ? T.PINE : T.FOREST;
      } else if (veg < 0.42 && wet < 0.55) {
        tiles[i] = T.MEADOW;
      } else {
        tiles[i] = T.GRASS;
      }
    }
  }

  // cabin clearing: soft circle of grass, no forest
  const CLEAR_R = 7;
  for (let y = cabin.y - CLEAR_R - 1; y <= cabin.y + CLEAR_R + 1; y++) {
    for (let x = cabin.x - CLEAR_R - 1; x <= cabin.x + CLEAR_R + 1; x++) {
      if (x < 0 || y < 0 || x >= MAP || y >= MAP) continue;
      const d = Math.hypot(x - cabin.x, y - cabin.y);
      const t = tiles[idx(x, y)];
      if (t === T.DEEP || t === T.WATER) continue;
      if (d <= CLEAR_R) tiles[idx(x, y)] = T.GRASS;
      else if (d <= CLEAR_R + 1.5 && (t === T.FOREST || t === T.PINE) && hash2(x, y, 77) < 0.5)
        tiles[idx(x, y)] = T.GRASS;
    }
  }

  // a worn path from the cabin toward the lake shore
  {
    let px = cabin.x + 1;
    let py = cabin.y;
    for (let s = 0; s < 60; s++) {
      const ang = Math.atan2(lake.y - py, lake.x - px);
      px += Math.cos(ang) + (rng() - 0.5) * 0.6;
      py += Math.sin(ang) + (rng() - 0.5) * 0.6;
      const tx = Math.round(px);
      const ty = Math.round(py);
      if (tx < 0 || ty < 0 || tx >= MAP || ty >= MAP) break;
      const t = tiles[idx(tx, ty)];
      if (t === T.WATER || t === T.DEEP) break;
      if (t !== T.MARSH && t !== T.SAND) tiles[idx(tx, ty)] = T.PATH;
    }
  }

  // trees
  const trees: Tree[] = [];
  for (let y = 1; y < MAP - 1; y++) {
    for (let x = 1; x < MAP - 1; x++) {
      const t = tiles[idx(x, y)];
      const r = hash2(x, y, 991);
      const nearCabin = Math.hypot(x - cabin.x, y - cabin.y) < CLEAR_R + 1;
      if (nearCabin) continue;
      let kind: Tree['kind'] | null = null;
      if (t === T.FOREST && r < 0.5) kind = r < 0.08 ? 'birch' : 'oak';
      else if (t === T.PINE && r < 0.55) kind = 'pine';
      else if ((t === T.GRASS || t === T.MEADOW) && r < 0.018) kind = r < 0.009 ? 'oak' : 'birch';
      if (!kind) continue;
      trees.push({
        x: x + (hash2(x, y, 12) - 0.5) * 0.7,
        y: y + (hash2(x, y, 13) - 0.5) * 0.7,
        kind,
        variant: Math.floor(hash2(x, y, 14) * 4),
        scale: 0.8 + hash2(x, y, 15) * 0.5,
      });
    }
  }

  // coarse spatial grid for trees (cells of 8x8 tiles)
  const treeGrid = new Map<number, Tree[]>();
  for (const tr of trees) {
    const key = Math.floor(tr.y / 8) * 16 + Math.floor(tr.x / 8);
    let arr = treeGrid.get(key);
    if (!arr) treeGrid.set(key, (arr = []));
    arr.push(tr);
  }

  // shore tiles (walkable, adjacent to water) — fishing spots & shorebird habitat
  const shoreTiles: { x: number; y: number }[] = [];
  for (let y = 1; y < MAP - 1; y++) {
    for (let x = 1; x < MAP - 1; x++) {
      const t = tiles[idx(x, y)];
      if (t === T.DEEP || t === T.WATER) continue;
      if (isWaterTile(x + 1, y) || isWaterTile(x - 1, y) || isWaterTile(x, y + 1) || isWaterTile(x, y - 1)) {
        shoreTiles.push({ x, y });
      }
    }
  }

  return {
    seed,
    tiles,
    trees,
    treeGrid,
    lake,
    cabin,
    spawn: { x: cabin.x + 2.5, y: cabin.y + 1.5 },
    riverTiles,
    shoreTiles,
  };
}

// ---- queries -------------------------------------------------------------------

export function tileAt(w: World, x: number, y: number): TileId {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= MAP || yi >= MAP) return T.DEEP;
  return w.tiles[yi * MAP + xi] as TileId;
}

export function isWater(t: TileId) {
  return t === T.DEEP || t === T.WATER;
}

export function isWalkable(w: World, x: number, y: number) {
  return !isWater(tileAt(w, x, y));
}

/** which kind of water for fishing at tile (x,y) */
export function waterKindAt(w: World, x: number, y: number): 'lake' | 'river' | 'deep' {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (w.riverTiles.has(yi * MAP + xi)) return 'river';
  if (tileAt(w, x, y) === T.DEEP) return 'deep';
  return 'lake';
}

/** habitat classification for bird spawning */
export function habitatAt(w: World, x: number, y: number): Habitat {
  const dCabin = Math.hypot(x - w.cabin.x, y - w.cabin.y);
  if (dCabin < 8) return 'clearing';
  const t = tileAt(w, x, y);
  switch (t) {
    case T.DEEP:
    case T.WATER:
      return 'water';
    case T.SAND:
      return 'shore';
    case T.MARSH:
      return 'marsh';
    case T.FOREST:
      return 'forest';
    case T.PINE:
      return 'pine';
    case T.MEADOW:
      return 'meadow';
    case T.ROCK:
      return 'meadow';
    default:
      return 'clearing';
  }
}

/** nearest tree to a point within maxDist, or null */
export function nearestTree(w: World, x: number, y: number, maxDist = 6): Tree | null {
  let best: Tree | null = null;
  let bestD = maxDist;
  const cx = Math.floor(x / 8);
  const cy = Math.floor(y / 8);
  for (let gy = cy - 1; gy <= cy + 1; gy++) {
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      const arr = w.treeGrid.get(gy * 16 + gx);
      if (!arr) continue;
      for (const tr of arr) {
        const d = Math.hypot(tr.x - x, tr.y - y);
        if (d < bestD) {
          bestD = d;
          best = tr;
        }
      }
    }
  }
  return best;
}
