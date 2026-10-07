import { bounds, type Box, type Mark } from './markup'
import type { PreflightElement } from './types'

/**
 * Moving things on a finished page, exactly.
 *
 * An image model asked to "move this down" redraws the whole page while being told to
 * preserve everything, so it nudges the element a little or not at all. A move is
 * geometry, not drawing: where the thing is, and where it should go. So moves are done
 * by measurement — the element's box comes from the preflight's reading of the page,
 * the destination from the mark — and the pixels are cut, the hole filled, and the cut
 * pasted at the destination. The model only ever paints the empty background.
 *
 * Everything here is pure and in page fractions (the full sheet with bleed, like marks).
 */

/** How a planned move says where the group goes. */
export type Placement =
  /** Centered in the mark's box, both ways. */
  | 'center_in_mark'
  /** Centered across the mark's box; its height on the page unchanged. */
  | 'center_x_in_mark'
  /** Centered down the mark's box; its place across the page unchanged. */
  | 'center_y_in_mark'
  /** Its center to the arrow's head (the tail picked the element). */
  | 'to_arrow_head'
  /** Its center to a point the planner measured from the page: `x`, `y`. */
  | 'point'

export interface PlannedMove {
  /** The marks this move answers. */
  marks: number[]
  /** Indexes into the page's element list: the things that move together. */
  elements: number[]
  place: Placement
  x?: number
  y?: number
  /** Size change, 1 when the note doesn't ask for one. */
  scale?: number
}

export interface ResolvedMove {
  marks: number[]
  /** The group's tight box where it is now. */
  from: Box
  /** Where that box lands. */
  to: Box
}

export function unionBox(boxes: Box[]): Box {
  return boxes.reduce(
    (a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }),
    { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
  )
}

export function elementBox(e: PreflightElement): Box {
  const [x0, y0, x1, y1] = e.box
  return { x0, y0, x1, y1 }
}

export function padBox(b: Box, px: number, py: number): Box {
  return { x0: Math.max(0, b.x0 - px), y0: Math.max(0, b.y0 - py), x1: Math.min(1, b.x1 + px), y1: Math.min(1, b.y1 + py) }
}

function arrowHead(m: Mark): [number, number] | null {
  const s = m.pts[0]
  return m.kind === 'arrow' && s && s.length >= 2 ? s[s.length - 1] : null
}

/**
 * Where a planned move puts its group. The centering cases are computed here rather
 * than by the planner: "center it in this box" has an exact answer, and a language
 * model's arithmetic is the least reliable thing in the loop.
 */
export function resolveMove(plan: PlannedMove, elements: PreflightElement[], marks: Mark[]): ResolvedMove | null {
  const picked = plan.elements.map((i) => elements[i]).filter(Boolean)
  if (!picked.length) return null
  const from = unionBox(picked.map(elementBox))
  const w = from.x1 - from.x0
  const h = from.y1 - from.y0
  if (!(w > 0 && h > 0)) return null
  const scale = plan.scale && plan.scale > 0.2 && plan.scale < 4 ? plan.scale : 1
  let cx = (from.x0 + from.x1) / 2
  let cy = (from.y0 + from.y1) / 2

  const mark = marks.find((m) => plan.marks.includes(m.n) && (plan.place === 'to_arrow_head' ? m.kind === 'arrow' : m.kind !== 'arrow'))
    ?? marks.find((m) => plan.marks.includes(m.n))
  const box = mark ? bounds(mark) : null
  if (plan.place === 'point') {
    if (!Number.isFinite(plan.x) || !Number.isFinite(plan.y)) return null
    cx = plan.x!
    cy = plan.y!
  } else if (plan.place === 'to_arrow_head') {
    const head = mark ? arrowHead(mark) : null
    if (!head) return null
    ;[cx, cy] = head
  } else {
    if (!box) return null
    if (plan.place !== 'center_y_in_mark') cx = (box.x0 + box.x1) / 2
    if (plan.place !== 'center_x_in_mark') cy = (box.y0 + box.y1) / 2
  }

  const nw = w * scale
  const nh = h * scale
  // Never off the sheet: a move that would push the group past an edge stops at it.
  cx = Math.min(1 - nw / 2, Math.max(nw / 2, cx))
  cy = Math.min(1 - nh / 2, Math.max(nh / 2, cy))
  const to = { x0: cx - nw / 2, y0: cy - nh / 2, x1: cx + nw / 2, y1: cy + nh / 2 }
  // Under a pixel's worth of change is no move at all.
  const moved = Math.abs(to.x0 - from.x0) + Math.abs(to.y0 - from.y0) + Math.abs(nw - w) + Math.abs(nh - h)
  if (moved < 0.002) return null
  return { marks: plan.marks, from, to }
}

/** The matte's response to how much a pixel changed when the element was erased. */
export function matteAlpha(diff: number, lo = 22, hi = 72): number {
  if (diff <= lo) return 0
  if (diff >= hi) return 1
  const t = (diff - lo) / (hi - lo)
  return t * t * (3 - 2 * t)
}

/**
 * The element's own color at a pixel, with the old background taken back out:
 * observed = a·fg + (1−a)·bg. Without this, anti-aliased edges carry a fringe of the
 * old background to wherever the element goes.
 */
export function unmix(observed: number, background: number, alpha: number): number {
  if (alpha >= 0.999 || alpha <= 0.05) return observed
  return Math.max(0, Math.min(255, Math.round((observed - (1 - alpha) * background) / alpha)))
}

/**
 * Clean up a difference matte in place. `alpha` is one value (0..1) per pixel of a
 * w×h region; `core` is the element's measured box within it, in pixels.
 *
 * Two things go wrong with a raw difference. Erasing repaints the background a little
 * differently, so stray texture near the element differs too and would travel with it;
 * the matte fades to nothing within `margin` outside the core. And where the element's
 * color happens to match what the eraser painted, the matte has pinholes; enclosed gaps
 * smaller than `maxHole` pixels are filled. Letter counters (the inside of an O) are far
 * larger than that, so they stay see-through.
 */
export function refineMatte(alpha: Float32Array, w: number, h: number, core: { x0: number; y0: number; x1: number; y1: number }, margin: number, maxHole: number): void {
  for (let y = 0; y < h; y++) {
    const dy = Math.max(core.y0 - y, y - core.y1, 0)
    for (let x = 0; x < w; x++) {
      const d = Math.max(Math.max(core.x0 - x, x - core.x1, 0), dy)
      if (d > 0) alpha[y * w + x] *= d >= margin ? 0 : 1 - d / margin
    }
  }
  // Gaps: 4-connected runs of low alpha. One that reaches the region's edge is outside
  // the element; a small one that doesn't is a pinhole.
  const seen = new Uint8Array(w * h)
  const stack: number[] = []
  const run: number[] = []
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || alpha[start] >= 0.5) continue
    seen[start] = 1
    stack.push(start)
    run.length = 0
    let edge = false
    while (stack.length) {
      const p = stack.pop()!
      run.push(p)
      const x = p % w
      const y = (p - x) / w
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true
      const next = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]
      for (const q of next) {
        if (q >= 0 && !seen[q] && alpha[q] < 0.5) {
          seen[q] = 1
          stack.push(q)
        }
      }
    }
    if (!edge && run.length <= maxHole) for (const p of run) alpha[p] = 1
  }
}
