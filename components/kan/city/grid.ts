/**
 * The city's street grid, in world units. Cells come in 2×2 blocks; a road runs
 * around every block. Everyone walks and drives on the road lines, so a route is
 * just a walk through intersections, Manhattan style.
 */

export const CELL = 10
/** The strip of grass between the two plots of a block. */
export const GAP = 1.2
export const ROAD = 5
export const BLOCK = CELL * 2 + GAP
export const PITCH = BLOCK + ROAD

export interface Vec { x: number; z: number }

export class Grid {
  readonly blocksX: number
  readonly blocksZ: number
  readonly width: number
  readonly depth: number

  constructor(cols: number, rows: number) {
    this.blocksX = Math.ceil(cols / 2)
    this.blocksZ = Math.ceil(rows / 2)
    this.width = ROAD + this.blocksX * PITCH
    this.depth = ROAD + this.blocksZ * PITCH
  }

  /** Road centerlines: vertical ones by x, horizontal ones by z. */
  lineX(k: number) { return ROAD / 2 + k * PITCH - this.width / 2 }
  lineZ(m: number) { return ROAD / 2 + m * PITCH - this.depth / 2 }

  /** Where a block starts (its top-left corner, past the road). */
  blockOrigin(bx: number, bz: number): Vec {
    return { x: ROAD + bx * PITCH - this.width / 2, z: ROAD + bz * PITCH - this.depth / 2 }
  }

  /** The middle of a cell's plot. */
  cellCenter(cx: number, cz: number): Vec {
    const o = this.blockOrigin(Math.floor(cx / 2), Math.floor(cz / 2))
    return { x: o.x + (cx % 2) * (CELL + GAP) + CELL / 2, z: o.z + (cz % 2) * (CELL + GAP) + CELL / 2 }
  }

  /** The middle of a whole block, given its top-left cell. */
  blockCenter(cx: number, cz: number): Vec {
    const o = this.blockOrigin(Math.floor(cx / 2), Math.floor(cz / 2))
    return { x: o.x + BLOCK / 2, z: o.z + BLOCK / 2 }
  }

  /**
   * The spot on the street in front of a cell, where its door is. Cells in the top
   * row of a block face the road above them; the bottom row faces the road below.
   */
  door(cx: number, cz: number): Vec & { m: number; facing: 1 | -1 } {
    const c = this.cellCenter(cx, cz)
    const bz = Math.floor(cz / 2)
    const top = cz % 2 === 0
    const m = top ? bz : bz + 1
    return { x: c.x, z: this.lineZ(m), m, facing: top ? -1 : 1 }
  }

  /** The intersection nearest a point. */
  nearestNode(p: Vec): { k: number; m: number } {
    const k = Math.max(0, Math.min(this.blocksX, Math.round((p.x + this.width / 2 - ROAD / 2) / PITCH)))
    const m = Math.max(0, Math.min(this.blocksZ, Math.round((p.z + this.depth / 2 - ROAD / 2) / PITCH)))
    return { k, m }
  }

  node(k: number, m: number): Vec { return { x: this.lineX(k), z: this.lineZ(m) } }

  /**
   * A route along the streets from a point on a road to a point on a horizontal
   * road (every door is on one). Goes to the nearest corner, across, down, and along.
   */
  route(from: Vec, to: Vec & { m: number }): Vec[] {
    const pts: Vec[] = []
    const onVertical = (p: Vec) => Math.abs(((p.x + this.width / 2 - ROAD / 2) % PITCH + PITCH) % PITCH) < 0.01 ||
      Math.abs(((p.x + this.width / 2 - ROAD / 2) % PITCH + PITCH) % PITCH - PITCH) < 0.01
    // Already on the same street: walk straight there.
    if (Math.abs(from.z - to.z) < 0.01) return [{ x: to.x, z: to.z }]
    let cur = { ...from }
    if (!onVertical(cur)) {
      // On a horizontal road: walk to the corner nearest the destination's side.
      const kA = Math.floor((cur.x + this.width / 2 - ROAD / 2) / PITCH)
      const a = this.lineX(Math.max(0, kA)), b = this.lineX(Math.min(this.blocksX, kA + 1))
      const x = Math.abs(a - to.x) + Math.abs(a - cur.x) <= Math.abs(b - to.x) + Math.abs(b - cur.x) ? a : b
      cur = { x, z: cur.z }
      pts.push(cur)
    }
    // Down the vertical road to the destination's street, then along it.
    pts.push({ x: cur.x, z: to.z })
    pts.push({ x: to.x, z: to.z })
    return pts
  }

  /** The four roads leaving an intersection that stay inside the city. */
  neighbors(k: number, m: number): { k: number; m: number }[] {
    return [{ k: k + 1, m }, { k: k - 1, m }, { k, m: m + 1 }, { k, m: m - 1 }]
      .filter((n) => n.k >= 0 && n.k <= this.blocksX && n.m >= 0 && n.m <= this.blocksZ)
  }
}

/** A seeded random, so every visit scatters trees and windows the same way. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
