// Clean Cut — the lawn as a grid of grass cells.
//
// Every cell remembers whether it's been cut, at what deck height, which way the mower
// was heading (the last two passes — that's what makes stripes and checkerboards), and
// how many separate passes went over it. The renderer reads `tex` straight into a
// texture; scoring reads the arrays.

import { pointInPoly } from './geom';
import { grassBlockers } from './shapes';
import type { PatternRequest, Poly, SiteDef } from './types';

export const RES = 8; // cells per metre
export const UNCUT = 255;
export const TRIMMED = 20; // height code for string-trimmer cuts
const TAU = Math.PI * 2;

export interface FieldStats {
  grass: number;
  cut: number;
  firstDeck: number; // cells first cut by the deck
  swept: number; // deck passes over grass (first cuts + re-passes)
  secondPasses: number; // re-passes that were the 2nd pass on a cell
  edgeTotal: number;
  edgeCut: number;
  bedHit: number;
}

export interface TrimGroup {
  id: number;
  name: string;
  total: number;
  cut: number;
  done: boolean;
  cx: number;
  cz: number;
}

export class Field {
  readonly x0: number;
  readonly z0: number;
  readonly w: number;
  readonly h: number;
  readonly n: number;
  readonly grass: Uint8Array;
  readonly bed: Uint8Array;
  readonly height: Uint8Array;
  readonly dir1: Uint8Array;
  readonly dir2: Uint8Array;
  readonly passes: Uint8Array;
  readonly lastT: Float32Array;
  readonly edge: Uint8Array; // within ~0.45 m of something the deck can't get to
  readonly band: Uint8Array; // the perimeter band where border laps are judged
  readonly bandTan: Uint8Array; // edge tangent axis (0..255 ↔ 0..π)
  readonly group: Int16Array;
  readonly bedSeen: Uint8Array;
  readonly tex: Uint8Array;
  readonly groups: TrimGroup[] = [];
  readonly mainAxis: number;
  stats: FieldStats;
  dirty = true;
  // dirty rows for partial uploads
  dirtyMin = 0;
  dirtyMax = 0;

  constructor(site: SiteDef) {
    const b = site.bounds;
    this.x0 = b.x0;
    this.z0 = b.z0;
    this.w = Math.ceil((b.x1 - b.x0) * RES);
    this.h = Math.ceil((b.z1 - b.z0) * RES);
    this.n = this.w * this.h;
    const n = this.n;
    this.grass = new Uint8Array(n);
    this.bed = new Uint8Array(n);
    this.height = new Uint8Array(n).fill(UNCUT);
    this.dir1 = new Uint8Array(n);
    this.dir2 = new Uint8Array(n);
    this.passes = new Uint8Array(n);
    this.lastT = new Float32Array(n).fill(-100);
    this.edge = new Uint8Array(n);
    this.band = new Uint8Array(n);
    this.bandTan = new Uint8Array(n);
    this.group = new Int16Array(n).fill(-1);
    this.bedSeen = new Uint8Array(n);
    this.tex = new Uint8Array(n * 4);
    this.stats = { grass: 0, cut: 0, firstDeck: 0, swept: 0, secondPasses: 0, edgeTotal: 0, edgeCut: 0, bedHit: 0 };
    this.rasterize(site);
    this.mainAxis = lawnAxis(site.lawn);
    for (let i = 0; i < n; i++) this.writeTex(i);
    this.dirtyMin = 0;
    this.dirtyMax = this.h - 1;
  }

  // ——————————————————————————— setup

  private rasterize(site: SiteDef) {
    const { w, h } = this;
    const block = grassBlockers(site);
    const lawnBB = site.lawn.map(bbox);
    const blockBB = block.polys.map(bbox);
    const bedBB = site.beds.map((bd) => bbox(bd.poly));
    const inv = 1 / RES;
    for (let j = 0; j < h; j++) {
      const z = this.z0 + (j + 0.5) * inv;
      for (let i = 0; i < w; i++) {
        const x = this.x0 + (i + 0.5) * inv;
        const idx = j * w + i;
        let inLawn = false;
        for (let k = 0; k < site.lawn.length; k++) {
          const bb = lawnBB[k];
          if (x < bb[0] || x > bb[2] || z < bb[1] || z > bb[3]) continue;
          if (pointInPoly(x, z, site.lawn[k])) { inLawn = true; break; }
        }
        for (let k = 0; k < site.beds.length; k++) {
          const bb = bedBB[k];
          if (x < bb[0] || x > bb[2] || z < bb[1] || z > bb[3]) continue;
          if (pointInPoly(x, z, site.beds[k].poly)) { this.bed[idx] = site.beds[k].kind === 'flowers' ? 2 : 1; break; }
        }
        if (!inLawn) continue;
        let blocked = false;
        for (let k = 0; k < block.polys.length && !blocked; k++) {
          const bb = blockBB[k];
          if (x < bb[0] || x > bb[2] || z < bb[1] || z > bb[3]) continue;
          if (pointInPoly(x, z, block.polys[k])) blocked = true;
        }
        for (let k = 0; k < block.circles.length && !blocked; k++) {
          const c = block.circles[k];
          const dx = x - c[0];
          const dz = z - c[1];
          if (dx * dx + dz * dz < c[2] * c[2]) blocked = true;
        }
        for (let k = 0; k < block.segs.length && !blocked; k++) {
          const s = block.segs[k];
          if (segDist(x, z, s[0], s[1], s[2], s[3]) < s[4]) blocked = true;
        }
        if (!blocked) this.grass[idx] = 1;
      }
    }
    let total = 0;
    for (let i = 0; i < this.n; i++) total += this.grass[i];
    this.stats.grass = total;

    // distance (in cells) to the nearest non-grass cell, chamfer 3-4
    const dist = new Float32Array(this.n);
    const BIG = 1e6;
    for (let i = 0; i < this.n; i++) dist[i] = this.grass[i] ? BIG : 0;
    const D1 = 1;
    const D2 = Math.SQRT2;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const idx = j * w + i;
        if (!dist[idx]) continue;
        let d = dist[idx];
        if (i > 0) d = Math.min(d, dist[idx - 1] + D1); else d = Math.min(d, 0.5);
        if (j > 0) {
          d = Math.min(d, dist[idx - w] + D1);
          if (i > 0) d = Math.min(d, dist[idx - w - 1] + D2);
          if (i < w - 1) d = Math.min(d, dist[idx - w + 1] + D2);
        } else d = Math.min(d, 0.5);
        dist[idx] = d;
      }
    }
    for (let j = h - 1; j >= 0; j--) {
      for (let i = w - 1; i >= 0; i--) {
        const idx = j * w + i;
        if (!dist[idx]) continue;
        let d = dist[idx];
        if (i < w - 1) d = Math.min(d, dist[idx + 1] + D1); else d = Math.min(d, 0.5);
        if (j < h - 1) {
          d = Math.min(d, dist[idx + w] + D1);
          if (i < w - 1) d = Math.min(d, dist[idx + w + 1] + D2);
          if (i > 0) d = Math.min(d, dist[idx + w - 1] + D2);
        } else d = Math.min(d, 0.5);
        dist[idx] = d;
      }
    }
    const edgeCells = 0.45 * RES;
    const bandCells = 1.6 * RES;
    let edgeTotal = 0;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const idx = j * w + i;
        if (!this.grass[idx]) continue;
        const d = dist[idx];
        if (d <= edgeCells) {
          this.edge[idx] = 1;
          edgeTotal++;
        } else if (d <= bandCells) {
          this.band[idx] = 1;
          // tangent ⟂ distance gradient
          const gx = (i < w - 1 ? dist[idx + 1] : d) - (i > 0 ? dist[idx - 1] : d);
          const gz = (j < h - 1 ? dist[idx + w] : d) - (j > 0 ? dist[idx - w] : d);
          let a = Math.atan2(gx, -gz); // perpendicular to (gx, gz)
          if (a < 0) a += Math.PI;
          this.bandTan[idx] = Math.round((a / Math.PI) * 255) & 255;
        }
      }
    }
    this.stats.edgeTotal = edgeTotal;
    this.labelGroups(site);
  }

  /** Connected runs of edge cells become trim groups ("Oak tree", "Fence line" …). */
  private labelGroups(site: SiteDef) {
    const { w, h } = this;
    const stack: number[] = [];
    for (let start = 0; start < this.n; start++) {
      if (!this.edge[start] || this.group[start] !== -1) continue;
      const id = this.groups.length;
      let count = 0;
      let sx = 0;
      let sz = 0;
      stack.push(start);
      this.group[start] = id;
      while (stack.length) {
        const c = stack.pop()!;
        count++;
        const ci = c % w;
        const cj = (c - ci) / w;
        sx += ci;
        sz += cj;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ni = ci + di;
            const nj = cj + dj;
            if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
            const nidx = nj * w + ni;
            if (this.edge[nidx] && this.group[nidx] === -1) {
              this.group[nidx] = id;
              stack.push(nidx);
            }
          }
        }
      }
      const cx = this.x0 + (sx / count + 0.5) / RES;
      const cz = this.z0 + (sz / count + 0.5) / RES;
      this.groups.push({ id, name: nameNear(site, cx, cz), total: count, cut: 0, done: false, cx, cz });
    }
  }

  // ——————————————————————————— cutting

  cellAt(x: number, z: number): number {
    const i = Math.floor((x - this.x0) * RES);
    const j = Math.floor((z - this.z0) * RES);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }

  /**
   * The deck sweeping an oriented rectangle. Returns how many cells were freshly cut
   * and how many were re-cut (overlap).
   */
  deck(cx: number, cz: number, heading: number, halfLen: number, halfWid: number, code: number, now: number, out: { fresh: number; overlap: number; groupsDone: number[] }) {
    const fx = Math.cos(heading);
    const fz = Math.sin(heading);
    const rx = -fz;
    const rz = fx;
    const ext = Math.abs(fx) * halfLen + Math.abs(rx) * halfWid;
    const exz = Math.abs(fz) * halfLen + Math.abs(rz) * halfWid;
    const i0 = Math.max(0, Math.floor((cx - ext - this.x0) * RES));
    const i1 = Math.min(this.w - 1, Math.floor((cx + ext - this.x0) * RES));
    const j0 = Math.max(0, Math.floor((cz - exz - this.z0) * RES));
    const j1 = Math.min(this.h - 1, Math.floor((cz + exz - this.z0) * RES));
    if (i0 > i1 || j0 > j1) return;
    let a = heading % TAU;
    if (a < 0) a += TAU;
    const dirCode = Math.round((a / TAU) * 256) & 255;
    const inv = 1 / RES;
    for (let j = j0; j <= j1; j++) {
      const z = this.z0 + (j + 0.5) * inv - cz;
      for (let i = i0; i <= i1; i++) {
        const x = this.x0 + (i + 0.5) * inv - cx;
        const u = x * fx + z * fz;
        if (u > halfLen || u < -halfLen) continue;
        const v = x * rx + z * rz;
        if (v > halfWid || v < -halfWid) continue;
        const idx = j * this.w + i;
        if (!this.grass[idx]) continue;
        const gap = now - this.lastT[idx];
        this.lastT[idx] = now;
        if (this.height[idx] === UNCUT) {
          this.height[idx] = code;
          this.dir1[idx] = dirCode;
          this.dir2[idx] = dirCode;
          this.passes[idx] = 1;
          this.stats.cut++;
          this.stats.firstDeck++;
          this.stats.swept++;
          out.fresh++;
          this.onCut(idx, out.groupsDone);
        } else if (gap > 0.6) {
          // a separate pass over grass that was already cut
          if (this.passes[idx] < 255) this.passes[idx]++;
          if (this.passes[idx] === 2) this.stats.secondPasses++;
          this.stats.swept++;
          out.overlap++;
          this.dir2[idx] = this.dir1[idx];
          this.dir1[idx] = dirCode;
          this.height[idx] = this.height[idx] === TRIMMED ? code : Math.min(this.height[idx], code);
        } else {
          // still the same pass — follow the mower round the turn
          this.dir1[idx] = dirCode;
          if (this.passes[idx] <= 1) this.dir2[idx] = dirCode;
        }
        this.writeTex(idx);
        this.markDirty(j);
      }
    }
  }

  /** String trimmer — a small disc. No overlap penalty. */
  trim(cx: number, cz: number, r: number, swing: number, out: { fresh: number; groupsDone: number[] }) {
    const i0 = Math.max(0, Math.floor((cx - r - this.x0) * RES));
    const i1 = Math.min(this.w - 1, Math.floor((cx + r - this.x0) * RES));
    const j0 = Math.max(0, Math.floor((cz - r - this.z0) * RES));
    const j1 = Math.min(this.h - 1, Math.floor((cz + r - this.z0) * RES));
    const inv = 1 / RES;
    const r2 = r * r;
    for (let j = j0; j <= j1; j++) {
      const dz = this.z0 + (j + 0.5) * inv - cz;
      for (let i = i0; i <= i1; i++) {
        const dx = this.x0 + (i + 0.5) * inv - cx;
        if (dx * dx + dz * dz > r2) continue;
        const idx = j * this.w + i;
        if (!this.grass[idx] || this.height[idx] !== UNCUT) continue;
        this.height[idx] = TRIMMED;
        const ang = (Math.atan2(dz, dx) + swing + TAU) % TAU;
        this.dir1[idx] = Math.round((ang / TAU) * 256) & 255;
        this.dir2[idx] = (this.dir1[idx] + 64) & 255;
        this.stats.cut++;
        out.fresh++;
        this.onCut(idx, out.groupsDone);
        this.writeTex(idx);
        this.markDirty(j);
      }
    }
  }

  /** Wheels over a flower bed. Returns newly trampled bed cells. */
  trample(cx: number, cz: number, r: number): number {
    const i0 = Math.max(0, Math.floor((cx - r - this.x0) * RES));
    const i1 = Math.min(this.w - 1, Math.floor((cx + r - this.x0) * RES));
    const j0 = Math.max(0, Math.floor((cz - r - this.z0) * RES));
    const j1 = Math.min(this.h - 1, Math.floor((cz + r - this.z0) * RES));
    let hit = 0;
    const inv = 1 / RES;
    for (let j = j0; j <= j1; j++) {
      const dz = this.z0 + (j + 0.5) * inv - cz;
      for (let i = i0; i <= i1; i++) {
        const dx = this.x0 + (i + 0.5) * inv - cx;
        if (dx * dx + dz * dz > r * r) continue;
        const idx = j * this.w + i;
        if (this.bed[idx] && !this.bedSeen[idx]) {
          this.bedSeen[idx] = 1;
          hit++;
        }
      }
    }
    this.stats.bedHit += hit;
    return hit;
  }

  private onCut(idx: number, groupsDone: number[]) {
    if (!this.edge[idx]) return;
    this.stats.edgeCut++;
    const g = this.group[idx];
    if (g < 0) return;
    const grp = this.groups[g];
    grp.cut++;
    if (!grp.done && grp.cut >= grp.total * 0.97) {
      grp.done = true;
      groupsDone.push(g);
    }
  }

  private markDirty(j: number) {
    if (!this.dirty) {
      this.dirty = true;
      this.dirtyMin = j;
      this.dirtyMax = j;
    } else {
      if (j < this.dirtyMin) this.dirtyMin = j;
      if (j > this.dirtyMax) this.dirtyMax = j;
    }
  }

  /**
   * RGBA: R = grass height (255 uncut), G = mowable mask, BA = the light-bending direction
   * of the blades: a blend of the last two passes, which is what shows as stripes.
   */
  writeTex(idx: number) {
    const o = idx * 4;
    const t = this.tex;
    if (!this.grass[idx]) {
      t[o] = 0;
      t[o + 1] = 0;
      t[o + 2] = 128;
      t[o + 3] = 128;
      return;
    }
    const hgt = this.height[idx];
    t[o + 1] = 255;
    if (hgt === UNCUT) {
      t[o] = 255;
      t[o + 2] = 128;
      t[o + 3] = 128;
      return;
    }
    // cut height → 0..~200 so the shader can tell trimmed from mowed
    t[o] = hgt === TRIMMED ? 70 : 30 + hgt * 22;
    const a1 = (this.dir1[idx] / 256) * TAU;
    const a2 = (this.dir2[idx] / 256) * TAU;
    const k = hgt === TRIMMED ? 0.25 : 1;
    const vx = (Math.cos(a1) * 0.62 + Math.cos(a2) * 0.38) * k;
    const vz = (Math.sin(a1) * 0.62 + Math.sin(a2) * 0.38) * k;
    t[o + 2] = Math.max(0, Math.min(255, Math.round(vx * 127 + 128)));
    t[o + 3] = Math.max(0, Math.min(255, Math.round(vz * 127 + 128)));
  }

  get coverage() {
    return this.stats.grass ? this.stats.cut / this.stats.grass : 1;
  }

  get efficiency() {
    return this.stats.swept ? this.stats.firstDeck / this.stats.swept : 1;
  }

  get edgeCoverage() {
    return this.stats.edgeTotal ? this.stats.edgeCut / this.stats.edgeTotal : 1;
  }
}

// ———————————————————————————————————————— helpers

function bbox(p: Poly): [number, number, number, number] {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of p) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return [x0, z0, x1, z1];
}

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1e-9;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** The lawn's long axis (mod π): the longest edge of the biggest polygon. */
export function lawnAxis(lawn: Poly[]): number {
  let best = 0;
  let bestLen = 0;
  let bigArea = -1;
  let big: Poly | null = null;
  for (const p of lawn) {
    let a = 0;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
    if (Math.abs(a) > bigArea) {
      bigArea = Math.abs(a);
      big = p;
    }
  }
  if (!big) return 0;
  for (let i = 0, j = big.length - 1; i < big.length; j = i++) {
    const dx = big[i][0] - big[j][0];
    const dz = big[i][1] - big[j][1];
    const l = Math.hypot(dx, dz);
    if (l > bestLen) {
      bestLen = l;
      best = Math.atan2(dz, dx);
    }
  }
  let a = best % Math.PI;
  if (a < 0) a += Math.PI;
  return a;
}

function nameNear(site: SiteDef, x: number, z: number): string {
  let best = 'Edge';
  let bestD = 3.5;
  const consider = (d: number, name: string) => {
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  };
  for (const t of site.trees) {
    const label = t.kind === 'ornamental' ? 'Dogwood' : t.kind[0].toUpperCase() + t.kind.slice(1) + ' tree';
    consider(Math.hypot(t.x - x, t.z - z) - (t.ring ?? t.trunk), label);
  }
  for (const b of site.beds) {
    let cx = 0;
    let cz = 0;
    for (const p of b.poly) {
      cx += p[0];
      cz += p[1];
    }
    cx /= b.poly.length;
    cz /= b.poly.length;
    const r = Math.sqrt(Math.max(...b.poly.map(([px, pz]) => (px - cx) ** 2 + (pz - cz) ** 2)));
    consider(Math.max(0, Math.hypot(cx - x, cz - z) - r) + 0.2, b.kind === 'flowers' ? 'Flower bed' : b.kind === 'shrubs' ? 'Shrub border' : 'Mulch bed');
  }
  for (const f of site.fences) {
    for (let i = 0; i < f.pts.length - 1; i++) {
      consider(segDist(x, z, f.pts[i][0], f.pts[i][1], f.pts[i + 1][0], f.pts[i + 1][1]) + 0.3, f.kind === 'hedge' ? 'Hedge line' : 'Fence line');
    }
  }
  for (const p of site.props) {
    if (p.kind === 'car') continue;
    const names: Partial<Record<string, string>> = {
      shed: 'Shed', trampoline: 'Trampoline', playset: 'Playset', raisedbed: 'Garden bed', ac: 'A/C unit', mailbox: 'Mailbox',
      birdbath: 'Birdbath', gnome: 'Garden gnome', boulder: 'Boulder', lamp: 'Lamp post', hydrant: 'Hydrant', flagpole: 'Flagpole',
      bench: 'Bench', fountain: 'Fountain', sign: 'Sign post', sprinkler: 'Sprinkler head', grill: 'Grill',
    };
    consider(Math.hypot(p.x - x, p.z - z) - 0.4, names[p.kind] ?? 'Edge');
  }
  return best;
}

// ———————————————————————————————————————— pattern + payout

export interface PatternResult {
  score: number; // 0..~1.3 (style multipliers)
  name: string;
  coherence: number;
  regularity: number;
  border: number;
  kind: 'freestyle' | 'stripes' | 'diagonal' | 'checker' | 'diamond';
}

export const DECK_WIDTH = 1.32;

export function analysePattern(f: Field): PatternResult {
  const hist = new Float32Array(36);
  let interior = 0;
  let cross = 0;
  for (let i = 0; i < f.n; i++) {
    if (!f.grass[i] || f.edge[i] || f.band[i]) continue;
    const hgt = f.height[i];
    if (hgt === UNCUT || hgt === TRIMMED) continue;
    interior++;
    const ax1 = axisBin(f.dir1[i]);
    hist[ax1] += 1;
    if (f.passes[i] >= 2) {
      const ax2 = axisBin(f.dir2[i]);
      const d = Math.min(Math.abs(ax1 - ax2), 36 - Math.abs(ax1 - ax2));
      if (d >= 12) {
        cross++;
        hist[ax2] += 1;
      }
    }
  }
  if (interior < 40) return { score: 0, name: 'Not enough cut', coherence: 0, regularity: 0, border: 0, kind: 'freestyle' };

  // dominant axis (smoothed peak)
  let peak = 0;
  let peakV = -1;
  for (let b = 0; b < 36; b++) {
    const v = hist[b] + 0.6 * (hist[(b + 1) % 36] + hist[(b + 35) % 36]);
    if (v > peakV) {
      peakV = v;
      peak = b;
    }
  }
  const axis = ((peak + 0.5) / 36) * Math.PI;
  const checker = cross / interior > 0.4;
  const perp = (peak + 18) % 36;

  // coherence: share of cells lined up with the axis (or its perpendicular for checkerboards)
  let aligned = 0;
  for (let i = 0; i < f.n; i++) {
    if (!f.grass[i] || f.edge[i] || f.band[i]) continue;
    const hgt = f.height[i];
    if (hgt === UNCUT || hgt === TRIMMED) continue;
    const b = axisBin(f.dir1[i]);
    const d0 = Math.min(Math.abs(b - peak), 36 - Math.abs(b - peak));
    const d1 = Math.min(Math.abs(b - perp), 36 - Math.abs(b - perp));
    if (d0 <= 2 || (checker && d1 <= 2)) aligned++;
  }
  const coherence = aligned / interior;

  // regularity: walk across the stripes and measure runs of the same light/dark
  const regularity = checker
    ? (stripeRuns(f, axis, 1) + stripeRuns(f, axis + Math.PI / 2, 2)) / 2
    : stripeRuns(f, axis, 1);

  // border laps: perimeter band mowed parallel to the edge
  let bandN = 0;
  let bandOk = 0;
  for (let i = 0; i < f.n; i++) {
    if (!f.band[i]) continue;
    const hgt = f.height[i];
    if (hgt === UNCUT) continue;
    bandN++;
    const a = (f.dir1[i] / 256) * Math.PI * 2;
    const t = (f.bandTan[i] / 255) * Math.PI;
    if (Math.abs(Math.cos(a - t)) > 0.86) bandOk++;
  }
  const border = bandN ? bandOk / bandN : 0;

  let rel = Math.abs(((axis - f.mainAxis) % Math.PI + Math.PI) % Math.PI);
  if (rel > Math.PI / 2) rel = Math.PI - rel;
  const diag = rel > (25 * Math.PI) / 180 && rel < (65 * Math.PI) / 180;

  let kind: PatternResult['kind'] = 'stripes';
  let mult = 1;
  if (coherence < 0.45) {
    kind = 'freestyle';
    mult = 0.6;
  } else if (checker) {
    kind = diag ? 'diamond' : 'checker';
    mult = diag ? 1.35 : 1.25;
  } else if (diag) {
    kind = 'diagonal';
    mult = 1.12;
  }
  const raw = 0.4 * coherence + 0.4 * regularity + 0.2 * border;
  const names = { freestyle: 'Freestyle', stripes: 'Classic stripes', diagonal: 'Diagonal stripes', checker: 'Checkerboard', diamond: 'Diamond cut' };
  return { score: Math.min(1.35, raw * mult), name: names[kind], coherence, regularity, border, kind };
}

function axisBin(code: number): number {
  // direction code 0..255 over 2π → axis bin 0..35 over π
  const a = ((code / 256) * Math.PI * 2) % Math.PI;
  return Math.min(35, Math.floor((a / Math.PI) * 36));
}

/** Fraction of stripe length (across the stripes) that comes in deck-width bands. */
function stripeRuns(f: Field, axis: number, layer: 1 | 2): number {
  const ax = Math.cos(axis);
  const az = Math.sin(axis);
  const px = -az;
  const pz = ax;
  const cx = f.x0 + f.w / RES / 2;
  const cz = f.z0 + f.h / RES / 2;
  const span = Math.hypot(f.w, f.h) / RES / 2 + 1;
  const step = 1 / RES;
  const good0 = DECK_WIDTH * 0.55;
  const good1 = DECK_WIDTH * 1.6;
  let goodLen = 0;
  let judged = 0;
  for (let s = -span; s <= span; s += 1.5) {
    let runSign = 0;
    let runLen = 0;
    let runOpen = false; // a run only counts if it started on a sign change
    for (let t = -span; t <= span; t += step) {
      const x = cx + ax * s + px * t;
      const z = cz + az * s + pz * t;
      const idx = f.cellAt(x, z);
      const ok = idx >= 0 && f.grass[idx] && !f.edge[idx] && !f.band[idx] && f.height[idx] !== UNCUT && f.height[idx] !== TRIMMED;
      if (!ok) {
        runSign = 0;
        runLen = 0;
        runOpen = false;
        continue;
      }
      const code = layer === 1 || f.passes[idx] < 2 ? f.dir1[idx] : f.dir2[idx];
      const a = (code / 256) * Math.PI * 2;
      const d = Math.cos(a) * ax + Math.sin(a) * az;
      const sign = Math.abs(d) < 0.5 ? 0 : d > 0 ? 1 : -1;
      if (sign === 0) {
        runSign = 0;
        runLen = 0;
        runOpen = false;
        continue;
      }
      if (sign === runSign) {
        runLen += step;
      } else {
        if (runOpen && runSign !== 0) {
          judged += runLen;
          if (runLen >= good0 && runLen <= good1) goodLen += runLen;
        }
        runOpen = runSign !== 0;
        runSign = sign;
        runLen = step;
      }
    }
  }
  return judged > 0 ? goodLen / judged : 0;
}

export interface Payout {
  coverage: number;
  efficiency: number;
  edges: number;
  heightMatch: number;
  pattern: PatternResult;
  patternMatched: boolean;
  damage: number;
  success: number;
  tip: number;
  earned: number;
  grade: string;
}

export function heightMatch(f: Field, deckIndexWanted: number): number {
  let n = 0;
  let ok = 0;
  const want = deckIndexWanted + 1;
  for (let i = 0; i < f.n; i++) {
    const hgt = f.height[i];
    if (!f.grass[i] || hgt === UNCUT) continue;
    n++;
    if (hgt === want || hgt === TRIMMED) ok++;
    else if (Math.abs(hgt - want) === 1) ok += 0.5;
  }
  return n ? ok / n : 0;
}

export function patternMatches(req: PatternRequest, p: PatternResult): boolean {
  if (req === 'any') return p.kind !== 'freestyle';
  if (req === 'stripes') return p.kind === 'stripes' || p.kind === 'diagonal';
  if (req === 'diagonal') return p.kind === 'diagonal' || p.kind === 'diamond';
  return p.kind === 'checker' || p.kind === 'diamond';
}

export function computePayout(f: Field, pay: number, req: PatternRequest, deckIndexWanted: number, bumps: number): Payout {
  const coverage = f.coverage;
  const s = f.stats;
  // a checkerboard needs a second pass everywhere — that pass is free when they asked for one
  const allowance = req === 'checker' ? s.secondPasses : 0;
  const efficiency = s.swept ? Math.min(1, s.firstDeck / Math.max(1, s.swept - allowance)) : 1;
  const edges = f.edgeCoverage;
  const hm = heightMatch(f, deckIndexWanted);
  const pattern = analysePattern(f);
  const matched = patternMatches(req, pattern);
  const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const covScore = coverage >= 0.995 ? 1 : Math.pow(clamp((coverage - 0.5) / 0.495), 1.6);
  const effScore = clamp((efficiency - 0.55) / 0.33);
  const edgeScore = edges * edges;
  const success = clamp(covScore * (0.62 + 0.18 * effScore + 0.12 * edgeScore + 0.08 * hm));
  const bedM2 = s.bedHit / (RES * RES);
  const damage = Math.round(bedM2 * 8 + bumps * 4);
  const reqBoost = req === 'any' ? 1 : matched ? 1.6 : 0.5;
  const tip = Math.round(pay * 0.22 * pattern.score * reqBoost * covScore);
  const earned = Math.max(0, Math.round(pay * success) + tip - damage);
  const grade = success >= 0.97 ? 'S' : success >= 0.9 ? 'A' : success >= 0.8 ? 'B' : success >= 0.65 ? 'C' : success >= 0.45 ? 'D' : 'F';
  return { coverage, efficiency, edges, heightMatch: hm, pattern, patternMatched: matched, damage, success, tip, earned, grade };
}
