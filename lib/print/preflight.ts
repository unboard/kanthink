/**
 * Print preflight: the deterministic half.
 *
 * A vision model finds where the words, logos and faces are and reads the text back.
 * Everything after that is arithmetic here — whether a box crosses the safe line, a
 * fold or the die line, whether an edge has a white frame, whether a word drifted
 * from the copy — so the verdict doesn't depend on a model's mood, and so it can be
 * tested.
 */

import type { PreflightElement, PreflightIssue, PrintSpec } from './types'
import { bleedSize, foldPositions, pieceDistance } from './spec'

// ---------------------------------------------------------------------------
// Distance fields for raster guides
// ---------------------------------------------------------------------------

/**
 * Signed distance, in pixels, from each pixel to the boundary of a mask: positive
 * inside, negative outside. Two-pass 3-4 chamfer — within a few percent of Euclidean,
 * which is far tighter than any print margin.
 */
export function distanceField(inside: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9
  const toEdge = (target: 1 | 0) => {
    const d = new Float32Array(w * h)
    for (let i = 0; i < d.length; i++) d[i] = inside[i] === target ? INF : 0
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        let v = d[i]
        if (v === 0) continue
        if (x > 0) v = Math.min(v, d[i - 1] + 3)
        if (y > 0) {
          v = Math.min(v, d[i - w] + 3)
          if (x > 0) v = Math.min(v, d[i - w - 1] + 4)
          if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4)
        }
        d[i] = v
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x
        let v = d[i]
        if (v === 0) continue
        if (x < w - 1) v = Math.min(v, d[i + 1] + 3)
        if (y < h - 1) {
          v = Math.min(v, d[i + w] + 3)
          if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4)
          if (x > 0) v = Math.min(v, d[i + w - 1] + 4)
        }
        d[i] = v
      }
    }
    return d
  }
  // Distance from inside pixels to the nearest outside one, and vice versa.
  const inDist = toEdge(1)
  const outDist = toEdge(0)
  const out = new Float32Array(w * h)
  for (let i = 0; i < out.length; i++) {
    out[i] = inside[i] ? inDist[i] / 3 : -outDist[i] / 3
  }
  return out
}

/** Distance (in inches, positive inside) at a point, for a raster guide covering the bleed sheet. */
export type DistanceSampler = (xIn: number, yIn: number) => number

export function rasterSampler(spec: PrintSpec, field: Float32Array, w: number, h: number): DistanceSampler {
  const b = bleedSize(spec)
  const inchesPerPx = b.w / w
  return (xIn, yIn) => {
    const px = Math.min(w - 1, Math.max(0, Math.round((xIn / b.w) * w - 0.5)))
    const py = Math.min(h - 1, Math.max(0, Math.round((yIn / b.h) * h - 0.5)))
    return field[py * w + px] * inchesPerPx
  }
}

export function samplerFor(spec: PrintSpec, raster?: DistanceSampler): DistanceSampler {
  if (spec.guide?.kind === 'image' && raster) return raster
  return (x, y) => pieceDistance(spec, x, y)
}

// ---------------------------------------------------------------------------
// Geometry checks
// ---------------------------------------------------------------------------

const KIND_NAME: Record<PreflightElement['kind'], string> = {
  text: 'Text',
  logo: 'The logo',
  qr: 'The QR code',
  face: 'A face',
  other: 'An element',
}

function describe(el: PreflightElement): string {
  if (el.kind === 'text' && el.text) {
    const t = el.text.replace(/\s+/g, ' ').trim()
    return `“${t.length > 40 ? `${t.slice(0, 38)}…` : t}”`
  }
  return KIND_NAME[el.kind]
}

/** Points along a box's edge, inset slightly: vision boxes run a little generous. */
function samplePoints(box: [number, number, number, number]): [number, number][] {
  const [x0, y0, x1, y1] = box
  // Capped, so a long line of text doesn't earn a long stretch of forgiveness.
  const ix = Math.min((x1 - x0) * 0.04, 0.005)
  const iy = Math.min((y1 - y0) * 0.08, 0.004)
  const a = x0 + ix
  const b = x1 - ix
  const c = y0 + iy
  const d = y1 - iy
  const pts: [number, number][] = []
  const steps = 6
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    pts.push([a + (b - a) * t, c], [a + (b - a) * t, d], [a, c + (d - c) * t], [b, c + (d - c) * t])
  }
  return pts
}

export function checkPlacement(
  spec: PrintSpec,
  elements: PreflightElement[],
  sampler: DistanceSampler,
): PreflightIssue[] {
  const issues: PreflightIssue[] = []
  const sheet = bleedSize(spec)
  // A box this close to the line is a vision rounding error, not a real problem.
  const slack = Math.min(0.04, spec.safeIn * 0.3)

  elements.forEach((el, n) => {
    if (el.kind === 'other') return
    let worst = Infinity
    for (const [fx, fy] of samplePoints(el.box)) {
      worst = Math.min(worst, sampler(fx * sheet.w, fy * sheet.h))
    }
    if (worst < -0.01) {
      issues.push({
        id: `cut-${n}`,
        kind: 'cut',
        severity: 'error',
        message: `${describe(el)} runs past the ${spec.guide ? 'die-cut' : 'trim'} edge and would be cut off.`,
        box: el.box,
      })
    } else if (worst < spec.safeIn - slack) {
      issues.push({
        id: `safe-${n}`,
        kind: 'safe',
        severity: worst < spec.safeIn * 0.5 ? 'error' : 'warn',
        message: `${describe(el)} is ${worst < 0.02 ? 'right at' : 'too close to'} the ${spec.guide ? 'cut line' : 'edge'} — outside the safe area.`,
        box: el.box,
      })
    }
  })

  if (spec.folds) {
    const vertical = spec.folds.direction === 'vertical'
    const full = vertical ? sheet.w : sheet.h
    const clearance = Math.max(0.0625, spec.safeIn * 0.5) / full
    for (const f of foldPositions(spec)) {
      elements.forEach((el, n) => {
        if (el.kind === 'other') return
        const lo = vertical ? el.box[0] : el.box[1]
        const hi = vertical ? el.box[2] : el.box[3]
        const span = hi - lo
        const inset = span * 0.05
        if (lo + inset < f && hi - inset > f) {
          issues.push({
            id: `fold-${n}-${f.toFixed(3)}`,
            kind: 'fold',
            severity: 'error',
            message: `${describe(el)} crosses a fold.`,
            box: el.box,
          })
        } else if (Math.min(Math.abs(lo - f), Math.abs(hi - f)) < clearance) {
          issues.push({
            id: `foldnear-${n}-${f.toFixed(3)}`,
            kind: 'fold',
            severity: 'warn',
            message: `${describe(el)} sits right against a fold.`,
            box: el.box,
          })
        }
      })
    }
  }
  return issues
}

// ---------------------------------------------------------------------------
// White frame detection
// ---------------------------------------------------------------------------

function isNearWhite(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return min > 232 && max - min < 18
}

/**
 * Flag an edge framed by a plain band — white, cream, or any flat colour — that the
 * design just inside it does not continue. That is the "picture in a frame" failure
 * that ruins a full-bleed print: the knife never lands exactly, so the frame prints as
 * an uneven sliver. A design whose ground really is that colour carries it inward too,
 * and passes.
 *
 * Returns the issue and the frame's colour, which is what a trim should cut against.
 * `pixels` is the trimmed-with-bleed page, downsampled, `channels` per pixel.
 */
export function detectFrame(
  spec: PrintSpec,
  pixels: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  channels: number,
): { issues: PreflightIssue[]; color: [number, number, number] | null } {
  if (spec.guide) return { issues: [], color: null }
  const sheet = bleedSize(spec)
  const bandX = Math.max(2, Math.round(Math.max(spec.bleedIn / sheet.w, 0.012) * w))
  const bandY = Math.max(2, Math.round(Math.max(spec.bleedIn / sheet.h, 0.012) * h))

  type Rect = [number, number, number, number]
  const each = (r: Rect, fn: (i: number) => void) => {
    for (let y = Math.max(0, r[1]); y < Math.min(h, r[3]); y++) {
      for (let x = Math.max(0, r[0]); x < Math.min(w, r[2]); x++) fn((y * w + x) * channels)
    }
  }
  const median = (r: Rect): [number, number, number] => {
    const cs: number[][] = [[], [], []]
    each(r, (i) => {
      cs[0].push(pixels[i])
      cs[1].push(pixels[i + 1])
      cs[2].push(pixels[i + 2])
    })
    return cs.map((c) => (c.length ? c.sort((a, b) => a - b)[c.length >> 1] : 0)) as [number, number, number]
  }
  const share = (r: Rect, color: [number, number, number], tol: number) => {
    let near = 0
    let total = 0
    each(r, (i) => {
      total++
      const d = Math.abs(pixels[i] - color[0]) + Math.abs(pixels[i + 1] - color[1]) + Math.abs(pixels[i + 2] - color[2])
      if (d <= tol) near++
    })
    return total ? near / total : 0
  }

  const sides: { name: string; outer: Rect; inner: Rect; box: Rect }[] = [
    { name: 'top', outer: [0, 0, w, bandY], inner: [bandX * 2, bandY * 2, w - bandX * 2, bandY * 5], box: [0, 0, 1, bandY / h] },
    { name: 'bottom', outer: [0, h - bandY, w, h], inner: [bandX * 2, h - bandY * 5, w - bandX * 2, h - bandY * 2], box: [0, 1 - bandY / h, 1, 1] },
    { name: 'left', outer: [0, 0, bandX, h], inner: [bandX * 2, bandY * 2, bandX * 5, h - bandY * 2], box: [0, 0, bandX / w, 1] },
    { name: 'right', outer: [w - bandX, 0, w, h], inner: [w - bandX * 5, bandY * 2, w - bandX * 2, h - bandY * 2], box: [1 - bandX / w, 0, 1, 1] },
  ]

  const framed: { name: string; box: Rect; color: [number, number, number] }[] = []
  for (const side of sides) {
    const color = median(side.outer)
    // The band is one flat colour (crop marks drawn in it are a few stray pixels)...
    if (share(side.outer, color, 36) < 0.86) continue
    // ...that the design just inside does not carry on.
    if (share(side.inner, color, 54) >= 0.5) continue
    framed.push({ name: side.name, box: side.box, color })
  }
  if (framed.length === 0) return { issues: [], color: null }

  const names = framed.map((s) => s.name)
  const where =
    names.length === 4
      ? 'all four edges'
      : names.length === 1
        ? `the ${names[0]} edge`
        : `the ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} edges`
  const color = framed[0].color
  const kind = isNearWhite(...color) ? 'white border' : 'plain border'
  return {
    color,
    issues: [
      {
        id: `border-${names.join('-')}`,
        kind: 'border',
        severity: 'error',
        message: `There’s a ${kind} along ${where}. After trimming it will print as an uneven edge.`,
        box: framed.length === 1 ? framed[0].box : undefined,
      },
    ],
  }
}

/** The frame issues alone, for callers that don't trim. */
export function detectWhiteBorders(
  spec: PrintSpec,
  pixels: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  channels: number,
): PreflightIssue[] {
  return detectFrame(spec, pixels, w, h, channels).issues
}

// ---------------------------------------------------------------------------
// Spelling against the copy
// ---------------------------------------------------------------------------

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu) ?? []).map((t) => t.replace(/[’']s$/, '').replace(/[’']/g, ''))
}

function digitRuns(text: string): string[] {
  return (text.match(/\d[\d\s().-]{5,}\d/g) ?? []).map((d) => d.replace(/\D/g, '')).filter((d) => d.length >= 7)
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

/**
 * Words on the page that are a letter or two away from a word that was meant to be
 * there, and phone-like numbers that don't match any given. Only near-misses count:
 * a word nobody planned is the model's prerogative, a misspelled one is a reprint.
 */
export function checkSpelling(printed: string[], planned: string[]): PreflightIssue[] {
  if (planned.length === 0) return []
  const plannedTokens = new Set(planned.flatMap(tokens))
  const plannedList = [...plannedTokens].filter((t) => t.length >= 3)
  const plannedDigits = new Set(planned.flatMap(digitRuns))
  const issues: PreflightIssue[] = []
  const seen = new Set<string>()

  for (const text of printed) {
    for (const t of tokens(text)) {
      if (t.length < 4 || plannedTokens.has(t) || seen.has(t) || /^\d+$/.test(t)) continue
      let best: string | null = null
      let bestD = Infinity
      for (const p of plannedList) {
        if (Math.abs(p.length - t.length) > 2) continue
        const d = levenshtein(t, p)
        if (d < bestD) {
          bestD = d
          best = p
        }
      }
      const limit = t.length >= 8 ? 2 : 1
      if (best && bestD > 0 && bestD <= limit) {
        seen.add(t)
        issues.push({
          id: `spell-${t}`,
          kind: 'spelling',
          severity: 'error',
          message: `“${t}” looks misspelled — it should read “${best}”.`,
        })
      }
    }
    if (plannedDigits.size) {
      for (const d of digitRuns(text)) {
        if (plannedDigits.has(d) || seen.has(d)) continue
        const near = [...plannedDigits].find((p) => Math.abs(p.length - d.length) <= 1 && levenshtein(p, d) <= 2)
        if (near) {
          seen.add(d)
          issues.push({
            id: `digits-${d}`,
            kind: 'spelling',
            severity: 'error',
            message: `A number reads ${d} but should be ${near}.`,
          })
        }
      }
    }
  }
  return issues
}
