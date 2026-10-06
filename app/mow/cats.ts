// Clean Cut — lost cats. Some jobs come with a neighbor's cat hiding somewhere in the yard.
// Find it, carry it back, and they'll thank you. This file is the pure part: who's lost,
// where they hide, where the owner waits. Same seed, same cat — so the daily is fair.

import { closestOnSeg, pointInPoly } from './geom';
import { makeRng } from './rng';
import { buildColliders, type Collider } from './shapes';
import type { JobDef, SiteDef, Vec2 } from './types';

export type CoatId = 'ginger' | 'grey' | 'tuxedo' | 'calico' | 'black' | 'siamese' | 'snow' | 'creamsicle';

export interface Coat {
  id: CoatId;
  label: string;
  base: string;
  marks: string | null; // stripes or patches
  marks2?: string; // calico's second color
  pattern: 'tabby' | 'patches' | 'solid' | 'points';
  bib: boolean; // white chest and paws
  eyes: string;
}

export const COATS: Record<CoatId, Coat> = {
  ginger: { id: 'ginger', label: 'ginger tabby', base: '#d9822b', marks: '#9c4f17', pattern: 'tabby', bib: false, eyes: '#9ccf3a' },
  grey: { id: 'grey', label: 'gray tabby', base: '#8f8f8c', marks: '#4a4a4a', pattern: 'tabby', bib: true, eyes: '#d9b13a' },
  tuxedo: { id: 'tuxedo', label: 'tuxedo', base: '#1c1c1f', marks: null, pattern: 'solid', bib: true, eyes: '#c9d93a' },
  calico: { id: 'calico', label: 'calico', base: '#f3efe6', marks: '#d27a2c', marks2: '#2a2522', pattern: 'patches', bib: false, eyes: '#b6c93a' },
  black: { id: 'black', label: 'black cat', base: '#151517', marks: null, pattern: 'solid', bib: false, eyes: '#f0c419' },
  siamese: { id: 'siamese', label: 'Siamese', base: '#eee0c6', marks: '#4a3426', pattern: 'points', bib: false, eyes: '#4aa3e8' },
  snow: { id: 'snow', label: 'fluffy white', base: '#f6f4ef', marks: null, pattern: 'solid', bib: false, eyes: '#5fb0e8' },
  creamsicle: { id: 'creamsicle', label: 'orange & white', base: '#e7953e', marks: '#b8641f', pattern: 'tabby', bib: true, eyes: '#c9b23a' },
};

const NAMES = [
  'Biscuit', 'Pumpkin', 'Mochi', 'Pickles', 'Luna', 'Oreo', 'Waffles', 'Marmalade', 'Socks', 'Peanut',
  'Clementine', 'Noodle', 'Pepper', 'Tofu', 'Ziggy', 'Muffin', 'Cinnamon', 'Pancake', 'Sprinkles', 'Button',
  'Nugget', 'Olive', 'Jellybean', 'Mittens', 'Snickers', 'Daisy', 'Tater Tot', 'Princess Fluff', 'Captain Whiskers', 'Beans',
];

const OWNERS = ['Mrs. Petrova', 'Grandma Rose', 'Mr. Delgado', 'Little Ava', 'The Hendersons', 'Ms. Kim', 'Old Mr. Abernathy', 'Rosie & Jack', 'Mrs. Featherstone', 'Mr. Tanaka'];

export interface LostCat {
  name: string;
  coat: CoatId;
  owner: string;
  reward: number;
  /** Hiding spots: the cat starts at [0] and bolts to the next one if the mower spooks it. */
  spots: Vec2[];
  ownerAt: { x: number; z: number; facing: number };
}

const CHANCE = 0.65;

function catRng(job: JobDef) {
  return makeRng((job.seed ^ 0xca7ca7) >>> 0);
}

/** Cheap check for the job board — no site needed. */
export function hasLostCat(job: JobDef): boolean {
  return catRng(job)() < CHANCE;
}

function clearance(x: number, z: number, colliders: Collider[]): number {
  let best = Infinity;
  for (const c of colliders) {
    let d: number;
    if (c.kind === 'circle') d = Math.hypot(x - c.x, z - c.z) - c.r;
    else if (c.kind === 'seg') {
      const [cx, cz] = closestOnSeg(x, z, c.ax, c.az, c.bx, c.bz);
      d = Math.hypot(x - cx, z - cz) - c.r;
    } else {
      if (pointInPoly(x, z, c.pts)) return -1;
      d = Infinity;
      for (let i = 0, j = c.pts.length - 1; i < c.pts.length; j = i++) {
        const [cx, cz] = closestOnSeg(x, z, c.pts[j][0], c.pts[j][1], c.pts[i][0], c.pts[i][1]);
        d = Math.min(d, Math.hypot(x - cx, z - cz));
      }
    }
    if (d < best) best = d;
  }
  return best;
}

export function planLostCat(job: JobDef, site: SiteDef): LostCat | null {
  const rng = catRng(job);
  if (rng() >= CHANCE) return null;
  const name = rng.pick(NAMES);
  const coat = rng.pick(Object.keys(COATS) as CoatId[]);
  const owner = rng.pick(OWNERS);
  const reward = Math.round((25 + rng() * 25 + job.pay * 0.12) / 5) * 5;
  const colliders = buildColliders(site);
  const W = site.world;
  const b = site.bounds;
  const s = site.start;
  const inWorld = (x: number, z: number) => x > W.x0 + 4 && x < W.x1 - 4 && z > W.z0 + 4 && z < W.z1 - 4;
  const ok = (x: number, z: number, minClear: number) => inWorld(x, z) && clearance(x, z, colliders) > minClear;

  // cosy places a cat would pick: tucked against trunks, sheds, play sets, in flower beds
  const nooks: Vec2[] = [];
  for (const t of site.trees) {
    for (let k = 0; k < 6; k++) {
      const a = rng() * Math.PI * 2;
      nooks.push([t.x + Math.cos(a) * (t.trunk + 0.4), t.z + Math.sin(a) * (t.trunk + 0.4)]);
    }
  }
  for (const p of site.props) {
    if (!['shed', 'playset', 'trampoline', 'grill', 'ac', 'bench', 'raisedbed', 'birdbath', 'boulder', 'fountain'].includes(p.kind)) continue;
    for (let k = 0; k < 8; k++) {
      const a = rng() * Math.PI * 2;
      const r = p.kind === 'shed' || p.kind === 'playset' ? 2 : p.kind === 'trampoline' ? 2.2 : 1;
      nooks.push([p.x + Math.cos(a) * r, p.z + Math.sin(a) * r]);
    }
  }
  for (const bed of site.beds) {
    const [cx, cz] = bed.poly.reduce<Vec2>((acc, [x, z]) => [acc[0] + x / bed.poly.length, acc[1] + z / bed.poly.length], [0, 0]);
    nooks.push([cx, cz]);
  }
  const far = (x: number, z: number, d: number) => Math.hypot(x - s.x, z - s.z) > d;
  // only in (or right beside) the yard you're mowing — never across the street
  const inYard = (x: number, z: number) => x > b.x0 - 2 && x < b.x1 + 2 && z > b.z0 - 2 && z < b.z1 + 2;
  let spots = nooks.filter(([x, z]) => inYard(x, z) && far(x, z, 7) && ok(x, z, 0.3));
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  // anywhere in the yard as a fallback
  for (let tries = 0; spots.length < 3 && tries < 400; tries++) {
    const x = rng.range(b.x0, b.x1);
    const z = rng.range(b.z0, b.z1);
    if (far(x, z, 7) && ok(x, z, 0.6)) spots.push([x, z]);
  }
  if (!spots.length) return null;
  // spread the bolt spots out so a spooked cat really goes somewhere
  const chosen: Vec2[] = [spots[0]];
  for (const p of spots) {
    if (chosen.length >= 3) break;
    if (chosen.every(([x, z]) => Math.hypot(x - p[0], z - p[1]) > 5)) chosen.push(p);
  }
  spots = chosen;

  // the owner waits on a path or the sidewalk near where you parked
  let ownerAt: LostCat['ownerAt'] | null = null;
  const hard = site.hard.filter((h) => h.kind === 'sidewalk' || h.kind === 'driveway' || h.kind === 'path' || h.kind === 'patio');
  let bestScore = Infinity;
  for (const h of hard) {
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (const [x, z] of h.poly) {
      minx = Math.min(minx, x); maxx = Math.max(maxx, x);
      minz = Math.min(minz, z); maxz = Math.max(maxz, z);
    }
    for (let x = minx; x <= maxx; x += 0.7) {
      for (let z = minz; z <= maxz; z += 0.7) {
        if (!pointInPoly(x, z, h.poly) || !ok(x, z, 0.8)) continue;
        const d = Math.hypot(x - s.x, z - s.z);
        if (d < 5) continue;
        const score = Math.abs(d - 8);
        if (score < bestScore) {
          bestScore = score;
          ownerAt = { x, z, facing: 0 };
        }
      }
    }
  }
  if (!ownerAt) {
    for (let tries = 0; tries < 60 && !ownerAt; tries++) {
      const a = rng() * Math.PI * 2;
      const x = s.x + Math.cos(a) * 6;
      const z = s.z + Math.sin(a) * 6;
      if (ok(x, z, 0.8)) ownerAt = { x, z, facing: 0 };
    }
  }
  if (!ownerAt) ownerAt = { x: s.x + 3, z: s.z, facing: 0 };
  ownerAt.facing = Math.atan2(spots[0][1] - ownerAt.z, spots[0][0] - ownerAt.x);
  return { name, coat, owner, reward, spots, ownerAt };
}
