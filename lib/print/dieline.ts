/**
 * Tracing a die line off a printer's template, so any cut shape — tabs, slots, notches,
 * a bollard wrap — becomes the same white-on-black guide a person could upload.
 *
 * The template already draws the shape: a closed line in one color. Split the image
 * into regions that line separates, then count how many cut lines lie between each
 * region and the outside of the sheet. One crossing is the piece, two is a hole cut
 * out of it, three is an island inside that hole, and so on — so the piece is every
 * region an odd number of crossings in. Other lines (bleed, safe, folds, labels) are
 * other colors and don't separate anything.
 *
 * Pure arithmetic on pixels, so it is tested without a model or a server.
 */

export interface TraceInput {
  /** RGBA pixels, row-major. */
  data: Uint8Array | Uint8ClampedArray
  width: number
  height: number
  /** The cut line's color as `#rrggbb`. */
  color: string
  /**
   * Regions smaller than this, in pixels, never count as a crossing: the counters of
   * letters drawn in the cut color, specks, gaps between dashes.
   */
  minRegion?: number
}

export interface TraceResult {
  /** 1 inside the finished piece, 0 cut away. */
  inside: Uint8Array
  width: number
  height: number
  /** The piece's bounding box in pixels — the trim of a die-cut piece. */
  box: { x: number; y: number; w: number; h: number }
  /** Holes cut out of the piece that were big enough to keep. */
  holes: number
  /** The share of its bounding box the piece covers: 1 for a plain rectangle. */
  fill: number
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Pixels that are the cut color laid over white paper, anti-aliasing included: the
 * pixel's departure from white must point the same way as the line color's and go
 * at least a third of the way there.
 */
export function lineMask(data: TraceInput['data'], width: number, height: number, color: [number, number, number]): Uint8Array {
  const dr = 255 - color[0]
  const dg = 255 - color[1]
  const db = 255 - color[2]
  const len2 = dr * dr + dg * dg + db * db
  const out = new Uint8Array(width * height)
  if (len2 < 900) return out // A line almost white can't be told from paper.
  const len = Math.sqrt(len2)
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    const a = data[p + 3] / 255
    // Transparent pixels are paper.
    const r = 255 - (255 - data[p]) * a
    const g = 255 - (255 - data[p + 1]) * a
    const b = 255 - (255 - data[p + 2]) * a
    const vr = 255 - r
    const vg = 255 - g
    const vb = 255 - b
    const t = (vr * dr + vg * dg + vb * db) / len2
    if (t < 0.35) continue
    const er = vr - t * dr
    const eg = vg - t * dg
    const eb = vb - t * db
    if (Math.sqrt(er * er + eg * eg + eb * eb) <= 0.3 * len + 18) out[i] = 1
  }
  return out
}

/** Grow a mask by one pixel in every direction, so a hairline seals even where anti-aliasing thinned it. */
function dilate(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx >= 0 && xx < width) out[yy * width + xx] = 1
        }
      }
    }
  }
  return out
}

/** Label 4-connected components where `mask[i] === want`. Returns labels (−1 elsewhere), counts and border contact. */
function components(mask: Uint8Array, width: number, height: number, want: 0 | 1) {
  const labels = new Int32Array(mask.length).fill(-1)
  const areas: number[] = []
  const border: boolean[] = []
  const queue = new Int32Array(mask.length)
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== want || labels[start] !== -1) continue
    const id = areas.length
    let head = 0
    let tail = 0
    let area = 0
    let touches = false
    labels[start] = id
    queue[tail++] = start
    while (head < tail) {
      const i = queue[head++]
      area++
      const x = i % width
      const y = (i - x) / width
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touches = true
      const push = (j: number) => {
        if (mask[j] === want && labels[j] === -1) {
          labels[j] = id
          queue[tail++] = j
        }
      }
      if (x > 0) push(i - 1)
      if (x < width - 1) push(i + 1)
      if (y > 0) push(i - width)
      if (y < height - 1) push(i + width)
    }
    areas.push(area)
    border.push(touches)
  }
  return { labels, areas, border }
}

export function traceDieLine(input: TraceInput): TraceResult | null {
  const { data, width, height } = input
  const rgb = parseHex(input.color)
  if (!rgb || width < 8 || height < 8) return null
  const minRegion = input.minRegion ?? Math.max(64, Math.round(width * height * 0.0004))

  const line = dilate(lineMask(data, width, height, rgb), width, height)
  const regions = components(line, width, height, 0)
  const lines = components(line, width, height, 1)

  // Which regions each connected line touches.
  const touching: Set<number>[] = lines.areas.map(() => new Set<number>())
  for (let i = 0; i < line.length; i++) {
    const l = lines.labels[i]
    if (l < 0) continue
    const x = i % width
    const check = (j: number) => {
      const r = regions.labels[j]
      if (r >= 0) touching[l].add(r)
    }
    if (x > 0) check(i - 1)
    if (x < width - 1) check(i + 1)
    if (i >= width) check(i - width)
    if (i + width < line.length) check(i + width)
  }
  const linesOf: number[][] = regions.areas.map(() => [])
  touching.forEach((set, l) => set.forEach((r) => linesOf[r].push(l)))

  // Crossings from the outside, a level at a time. Stepping into a small region is
  // free, so it joins the level it was reached from.
  const depth = new Int32Array(regions.areas.length).fill(-1)
  let level: number[] = []
  regions.border.forEach((b, r) => {
    if (b) {
      depth[r] = 0
      level.push(r)
    }
  })
  if (!level.length) return null
  const lineDone = new Uint8Array(lines.areas.length)
  for (let d = 0; level.length; d++) {
    const next: number[] = []
    for (let k = 0; k < level.length; k++) {
      const r = level[k]
      for (const l of linesOf[r]) {
        if (lineDone[l]) continue
        lineDone[l] = 1
        for (const n of touching[l]) {
          if (depth[n] !== -1) continue
          if (regions.areas[n] >= minRegion) {
            depth[n] = d + 1
            next.push(n)
          } else {
            depth[n] = d
            level.push(n)
          }
        }
      }
    }
    level = next
  }

  const inside = new Uint8Array(line.length)
  let holes = 0
  regions.areas.forEach((area, r) => {
    if (depth[r] >= 2 && depth[r] % 2 === 0 && area >= minRegion) holes++
  })
  for (let i = 0; i < inside.length; i++) {
    const r = regions.labels[i]
    if (r >= 0 && depth[r] > 0 && depth[r] % 2 === 1) inside[i] = 1
  }
  // The cut line itself: sealing widened it by a pixel each side, so the piece grows
  // two steps into it, which puts the edge on the line as drawn.
  for (let step = 0; step < 2; step++) {
    for (let i = 0; i < inside.length; i++) {
      if (!line[i] || inside[i]) continue
      const x = i % width
      const was = (j: number) => inside[j] === 1
      if ((x > 0 && was(i - 1)) || (x < width - 1 && was(i + 1)) || (i >= width && was(i - width)) || (i + width < inside.length && was(i + width))) {
        inside[i] = 2
      }
    }
    for (let i = 0; i < inside.length; i++) if (inside[i] === 2) inside[i] = 1
  }

  // Specks: a letter drawn in the cut color leaves a black fleck in the piece, a stray
  // mark a white one outside it. Islands too small to be a hole or a part go.
  for (const value of [0, 1] as const) {
    const islands = components(inside, width, height, value)
    for (let i = 0; i < inside.length; i++) {
      const c = islands.labels[i]
      if (c >= 0 && !islands.border[c] && islands.areas[c] < minRegion) inside[i] = value ? 0 : 1
    }
  }

  let x0 = width
  let y0 = height
  let x1 = -1
  let y1 = -1
  let area = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!inside[y * width + x]) continue
      area++
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  // Nothing enclosed, or something too small to be the product: not a die line.
  if (x1 < 0 || area < width * height * 0.04) return null
  const box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
  return { inside, width, height, box, holes, fill: area / (box.w * box.h) }
}

/** The share of the piece that differs from its own mirror image, left to right. */
export function asymmetry(t: TraceResult): number {
  const { inside, width, box } = t
  let diff = 0
  let total = 0
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const a = inside[y * width + x]
      const b = inside[y * width + (box.x + box.w - 1 - (x - box.x))]
      if (a) total++
      if (a !== b) diff++
    }
  }
  return total ? diff / 2 / total : 0
}

/**
 * The piece cut out to the bleed sheet: its box grown by the bleed on every side,
 * black wherever that runs past the template's edge.
 */
export function cropToBleed(t: TraceResult, bleedPx: number): { mask: Uint8Array; width: number; height: number } {
  const b = Math.max(0, Math.round(bleedPx))
  const width = t.box.w + 2 * b
  const height = t.box.h + 2 * b
  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const sy = t.box.y - b + y
    if (sy < 0 || sy >= t.height) continue
    for (let x = 0; x < width; x++) {
      const sx = t.box.x - b + x
      if (sx >= 0 && sx < t.width && t.inside[sy * t.width + sx]) mask[y * width + x] = 255
    }
  }
  return { mask, width, height }
}

/**
 * The drawn color nearest to a hint. A model names the cut line's color well but not
 * its exact value ("magenta" comes back as #ff00ff for a line drawn #ec008c), so the
 * hint picks among the inks the template actually uses in quantity.
 *
 * Inks are grouped by their direction away from white — the hue and its depth, which
 * is what `lineMask` matches on — so anti-aliasing and compression, which smear one
 * line across many exact colors, keep it in one group.
 */
export function snapColor(data: TraceInput['data'], width: number, height: number, hint: string): string {
  const target = parseHex(hint)
  if (!target) return hint
  const tv = target.map((c) => 255 - c)
  const tl = Math.hypot(tv[0], tv[1], tv[2])
  if (tl < 30) return hint
  const unit = (v: number[], l: number) => v.map((c) => c / l)
  const hintDir = unit(tv, tl)
  const L = 8
  const keyOf = (u: number[]) => (Math.round(u[0] * L) * (L + 1) + Math.round(u[1] * L)) * (L + 1) + Math.round(u[2] * L)

  const counts = new Map<number, { n: number; u: number[] }>()
  let inked = 0
  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    if (data[p + 3] < 128) continue
    const v = [255 - data[p], 255 - data[p + 1], 255 - data[p + 2]]
    const l = Math.hypot(v[0], v[1], v[2])
    if (l < 60) continue // paper and faint edges
    inked++
    const u = unit(v, l)
    const key = keyOf(u)
    const bin = counts.get(key) ?? { n: 0, u: [0, 0, 0] }
    bin.n++
    bin.u[0] += u[0]
    bin.u[1] += u[1]
    bin.u[2] += u[2]
    counts.set(key, bin)
  }
  // The nearest ink to the hint, not the most used: a red bleed line sits close to a
  // magenta cut line and usually runs longer.
  const floor = Math.max(40, inked * 0.002)
  let dir: number[] | null = null
  let nearest = 0.9
  for (const bin of counts.values()) {
    if (bin.n < floor) continue
    const l = Math.hypot(bin.u[0], bin.u[1], bin.u[2])
    const u = unit(bin.u, l)
    const cos = u[0] * hintDir[0] + u[1] * hintDir[1] + u[2] * hintDir[2]
    if (cos > nearest) {
      nearest = cos
      dir = u
    }
  }
  if (!dir) return hint

  // The line's own color: its solid core, the strong end of the pixels in that direction.
  const along: number[] = []
  const lens: number[] = []
  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    if (data[p + 3] < 128) continue
    const v = [255 - data[p], 255 - data[p + 1], 255 - data[p + 2]]
    const l = Math.hypot(v[0], v[1], v[2])
    if (l < 60) continue
    if ((v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2]) / l < 0.985) continue
    along.push(p)
    lens.push(l)
  }
  if (!lens.length) return hint
  const core = [...lens].sort((a, b) => a - b)[Math.floor(lens.length * 0.9)] * 0.8
  const sum = [0, 0, 0]
  let n = 0
  for (const p of along) {
    const v = [255 - data[p], 255 - data[p + 1], 255 - data[p + 2]]
    if (Math.hypot(v[0], v[1], v[2]) < core) continue
    sum[0] += data[p]
    sum[1] += data[p + 1]
    sum[2] += data[p + 2]
    n++
  }
  if (!n) return hint
  return `#${sum.map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('')}`
}

/**
 * Fold lines found near where a model says they are. A fold runs the whole height of
 * the piece (or width, for horizontal folds): a column inked along a good part of it.
 * Each hint moves to the nearest such line, not the strongest — a safe line half an
 * inch away can carry more ink than a dashed fold, but the hint is closer to the fold.
 * A hint with no line nearby is kept as it is.
 *
 * Positions are pixels along the fold axis of the image.
 */
export function snapFolds(
  data: TraceInput['data'],
  width: number,
  height: number,
  box: TraceResult['box'],
  direction: 'vertical' | 'horizontal',
  hints: number[],
): number[] {
  const vertical = direction === 'vertical'
  const start = vertical ? box.x : box.y
  const len = vertical ? box.w : box.h
  const span = vertical ? box.h : box.w
  const across = vertical ? [box.y, box.y + box.h] : [box.x, box.x + box.w]
  const profile = new Float64Array(len)
  for (let k = 0; k < len; k++) {
    let count = 0
    for (let j = across[0]; j < across[1]; j++) {
      const x = vertical ? start + k : j
      const y = vertical ? j : start + k
      const p = (y * width + x) * 4
      if (data[p + 3] >= 128 && Math.hypot(255 - data[p], 255 - data[p + 1], 255 - data[p + 2]) >= 60) count++
    }
    profile[k] = count / span
  }
  const reach = Math.round(len * 0.08)
  const edge = Math.round(len * 0.02)
  return hints.map((hint) => {
    const h = Math.round(hint - start)
    // The nearest line: the closest column that is inked enough and tops its neighbors.
    let peak = -1
    for (let d = 0; d <= reach && peak < 0; d++) {
      for (const k of d ? [h - d, h + d] : [h]) {
        if (k < edge || k > len - 1 - edge || profile[k] < 0.25) continue
        let top = true
        for (let j = Math.max(0, k - 3); j <= Math.min(len - 1, k + 3); j++) if (profile[j] > profile[k]) top = false
        if (top) {
          peak = k
          break
        }
      }
    }
    if (peak < 0) return hint
    let sum = 0
    let weight = 0
    for (let k = Math.max(0, peak - 4); k <= Math.min(len - 1, peak + 4); k++) {
      if (profile[k] < profile[peak] * 0.5) continue
      sum += k * profile[k]
      weight += profile[k]
    }
    return start + sum / weight
  })
}
