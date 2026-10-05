/**
 * Markup: numbered marks drawn over a page, each with its own note.
 *
 * A mark is a freehand drawing, an arrow, a circle or a box, plus what the person
 * wants done about it. Marks live on the page, not on a version: they are drawn on one
 * version, sent with a change, and can be shown again on the version that came back to
 * see whether it landed. That also makes them the shape a reviewer's notes will take
 * when someone else — a customer approving a print order — marks up the same page.
 *
 * Coordinates are fractions of the page image (the full sheet with bleed), x across
 * and y down, so a mark stays put whatever size the page is shown at and whichever
 * version it is shown on. Everything here is pure; the studio draws marks with it and
 * the server draws the same marks onto the copy the image model sees.
 */

export type MarkKind = 'draw' | 'arrow' | 'ellipse' | 'rect'

export type Pt = [number, number]

export interface Mark {
  id: string
  /** The number shown on the page and used in notes: "mark 2". */
  n: number
  kind: MarkKind
  /**
   * Freehand: one array per stroke. Arrow: [[from, to]]. Ellipse and box: [[corner,
   * opposite corner]].
   */
  pts: Pt[][]
  note: string
  status: 'open' | 'done'
  /** Hidden from the page without being resolved. */
  hidden?: boolean
  /** The version it was drawn on. */
  versionId?: string
  /** Versions made from changes this mark was sent with. */
  sentIn?: string[]
  /** Who made it, once more than one person marks up a page. */
  by?: string
  at: number
}

export const MARK_KINDS: MarkKind[] = ['draw', 'arrow', 'ellipse', 'rect']

export const KIND_LABEL: Record<MarkKind, string> = {
  draw: 'Drawing',
  arrow: 'Arrow',
  ellipse: 'Circle',
  rect: 'Box',
}

/** The markup color. Loud on purpose: it must read as markup, never as design. */
export const MARK_COLOR = '#ff1aa8'

const clamp01 = (v: number) => Math.max(-0.05, Math.min(1.05, v))

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export function bounds(mark: Pick<Mark, 'pts'>): Box {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const stroke of mark.pts) {
    for (const [x, y] of stroke) {
      if (x < x0) x0 = x
      if (y < y0) y0 = y
      if (x > x1) x1 = x
      if (y > y1) y1 = y
    }
  }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 0, y1: 0 }
  return { x0, y0, x1, y1 }
}

export function moveMark<T extends Pick<Mark, 'pts'>>(mark: T, dx: number, dy: number): T {
  return { ...mark, pts: mark.pts.map((s) => s.map(([x, y]) => [clamp01(x + dx), clamp01(y + dy)] as Pt)) }
}

/**
 * Stretch a mark so its bounding box becomes `to`. Freehand marks and arrows scale as
 * a whole; for circles and boxes this is the same as dragging a corner.
 */
export function fitMark<T extends Pick<Mark, 'pts'>>(mark: T, to: Box): T {
  const from = bounds(mark)
  const sx = from.x1 - from.x0 > 1e-6 ? (to.x1 - to.x0) / (from.x1 - from.x0) : 1
  const sy = from.y1 - from.y0 > 1e-6 ? (to.y1 - to.y0) / (from.y1 - from.y0) : 1
  return {
    ...mark,
    pts: mark.pts.map((s) => s.map(([x, y]) => [clamp01(to.x0 + (x - from.x0) * sx), clamp01(to.y0 + (y - from.y0) * sy)] as Pt)),
  }
}

/** Replace one point: an arrow's end, dragged. */
export function movePoint<T extends Pick<Mark, 'pts'>>(mark: T, stroke: number, index: number, to: Pt): T {
  return {
    ...mark,
    pts: mark.pts.map((s, i) => (i === stroke ? s.map((p, j) => (j === index ? ([clamp01(to[0]), clamp01(to[1])] as Pt) : p)) : s)),
  }
}

/** Drop points closer together than `tol` along a stroke, so saved strokes stay small. */
export function simplify(stroke: Pt[], tol = 0.002): Pt[] {
  if (stroke.length <= 2) return stroke
  const out: Pt[] = [stroke[0]]
  for (let i = 1; i < stroke.length - 1; i++) {
    const [px, py] = out[out.length - 1]
    if (Math.hypot(stroke[i][0] - px, stroke[i][1] - py) >= tol) out.push(stroke[i])
  }
  out.push(stroke[stroke.length - 1])
  return out.map(([x, y]) => [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000])
}

/** How soon, and how near, a stroke must follow the last to count as the same mark. */
export const GROUP_MS = 1200
export const GROUP_REACH = 0.06

/**
 * Whether a new freehand stroke belongs to the mark just drawn. An arrow drawn by hand
 * is a shaft and two strokes of head; a circle drawn in two goes is two strokes. People
 * draw those in quick succession and close together, so that is what joins them.
 */
export function joinsLast(last: Pick<Mark, 'kind' | 'pts'> | null, lastAt: number, stroke: Pt[], now: number): boolean {
  if (!last || last.kind !== 'draw' || now - lastAt > GROUP_MS || !stroke.length) return false
  const b = bounds(last)
  const [x, y] = stroke[0]
  return x >= b.x0 - GROUP_REACH && x <= b.x1 + GROUP_REACH && y >= b.y0 - GROUP_REACH && y <= b.y1 + GROUP_REACH
}

/** The next free number on a page. Numbers are never reused while their mark exists. */
export function nextNumber(marks: Pick<Mark, 'n'>[]): number {
  return marks.reduce((m, k) => Math.max(m, k.n), 0) + 1
}

/** Where a mark's number badge sits: just off its top-left, kept on the page. */
export function badgeAt(mark: Pick<Mark, 'kind' | 'pts'>): Pt {
  if (mark.kind === 'arrow' && mark.pts[0]?.length === 2) {
    // At the tail, so it doesn't sit on what the arrow points at.
    const [x, y] = mark.pts[0][0]
    return [Math.max(0.01, Math.min(0.99, x)), Math.max(0.01, Math.min(0.99, y))]
  }
  const b = bounds(mark)
  return [Math.max(0.01, Math.min(0.99, b.x0)), Math.max(0.01, Math.min(0.99, b.y0))]
}

/** "upper left", "middle", "lower right" — where on the page a mark is, in words. */
export function placeWords(mark: Pick<Mark, 'pts' | 'kind'>): string {
  const at = (x: number, y: number) => {
    const v = y < 0.34 ? 'upper' : y > 0.66 ? 'lower' : 'middle'
    const h = x < 0.34 ? 'left' : x > 0.66 ? 'right' : 'center'
    if (v === 'middle' && h === 'center') return 'the middle'
    if (v === 'middle') return `the middle ${h}`
    if (h === 'center') return `the ${v} middle`
    return `the ${v} ${h}`
  }
  if (mark.kind === 'arrow' && mark.pts[0]?.length === 2) {
    const [[ax, ay], [bx, by]] = mark.pts[0]
    return `from ${at(ax, ay)} toward ${at(bx, by)}`
  }
  const b = bounds(mark)
  return `in ${at((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2)}`
}

// ---------------------------------------------------------------------------
// Drawing, in pixels
// ---------------------------------------------------------------------------

/** SVG path for a mark's body at a pixel size. Arrowheads are sized to the page. */
export function markPath(mark: Pick<Mark, 'kind' | 'pts'>, w: number, h: number): string {
  const P = ([x, y]: Pt) => `${(x * w).toFixed(1)} ${(y * h).toFixed(1)}`
  if (mark.kind === 'draw') {
    return mark.pts
      .filter((s) => s.length)
      .map((s) => (s.length === 1 ? `M${P(s[0])}l0.1 0` : `M${P(s[0])}${s.slice(1).map((p) => `L${P(p)}`).join('')}`))
      .join('')
  }
  const [a, b] = mark.pts[0] ?? []
  if (!a || !b) return ''
  if (mark.kind === 'arrow') {
    const ax = a[0] * w
    const ay = a[1] * h
    const bx = b[0] * w
    const by = b[1] * h
    const len = Math.hypot(bx - ax, by - ay) || 1
    const head = Math.min(len * 0.45, Math.max(10, Math.min(w, h) * 0.045))
    const ux = (bx - ax) / len
    const uy = (by - ay) / len
    const l = [bx - ux * head - uy * head * 0.55, by - uy * head + ux * head * 0.55]
    const r = [bx - ux * head + uy * head * 0.55, by - uy * head - ux * head * 0.55]
    const f = (n: number) => n.toFixed(1)
    return `M${f(ax)} ${f(ay)}L${f(bx)} ${f(by)}M${f(l[0])} ${f(l[1])}L${f(bx)} ${f(by)}L${f(r[0])} ${f(r[1])}`
  }
  const x0 = Math.min(a[0], b[0]) * w
  const y0 = Math.min(a[1], b[1]) * h
  const x1 = Math.max(a[0], b[0]) * w
  const y1 = Math.max(a[1], b[1]) * h
  if (mark.kind === 'rect') return `M${x0.toFixed(1)} ${y0.toFixed(1)}H${x1.toFixed(1)}V${y1.toFixed(1)}H${x0.toFixed(1)}Z`
  const rx = (x1 - x0) / 2
  const ry = (y1 - y0) / 2
  const cx = x0 + rx
  const cy = y0 + ry
  return `M${(cx - rx).toFixed(1)} ${cy.toFixed(1)}a${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(2 * rx).toFixed(1)} 0a${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(-2 * rx).toFixed(1)} 0`
}

/** The stroke width marks are drawn with at a pixel size: readable, never heavy. */
export function markStroke(w: number, h: number): number {
  return Math.max(2.5, Math.min(w, h) * 0.008)
}

/**
 * The marks as one standalone SVG, sized in pixels: what the image model is shown.
 * Each mark gets a white halo so it reads on any design, and a numbered badge.
 */
export function markupSvg(marks: Pick<Mark, 'kind' | 'pts' | 'n'>[], w: number, h: number): string {
  const sw = markStroke(w, h)
  const r = Math.max(14, Math.min(w, h) * 0.028)
  const parts: string[] = []
  for (const m of marks) {
    const d = markPath(m, w, h)
    if (!d) continue
    parts.push(`<path d="${d}" fill="none" stroke="#fff" stroke-width="${(sw * 2.2).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`)
    parts.push(`<path d="${d}" fill="none" stroke="${MARK_COLOR}" stroke-width="${sw.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`)
  }
  for (const m of marks) {
    const [bx, by] = badgeAt(m)
    const cx = Math.max(r, Math.min(w - r, bx * w))
    const cy = Math.max(r, Math.min(h - r, by * h))
    parts.push(
      `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${MARK_COLOR}" stroke="#fff" stroke-width="${(r * 0.18).toFixed(1)}"/>`,
      `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" fill="#fff" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${(r * 1.15).toFixed(1)}" text-anchor="middle" dominant-baseline="central">${m.n}</text>`,
    )
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" height="${Math.round(h)}" viewBox="0 0 ${Math.round(w)} ${Math.round(h)}">${parts.join('')}</svg>`
}

// ---------------------------------------------------------------------------
// Validation, for anything that arrives from a client
// ---------------------------------------------------------------------------

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)

function cleanPt(p: unknown): Pt | null {
  if (!Array.isArray(p) || p.length !== 2 || !num(p[0]) || !num(p[1])) return null
  return [clamp01(p[0] as number), clamp01(p[1] as number)]
}

export function cleanMarks(input: unknown, max = 60): Mark[] {
  if (!Array.isArray(input)) return []
  const out: Mark[] = []
  for (const raw of input.slice(0, max)) {
    const m = raw as Partial<Mark>
    if (!m || typeof m.id !== 'string' || !MARK_KINDS.includes(m.kind as MarkKind) || !Array.isArray(m.pts)) continue
    const kind = m.kind as MarkKind
    const strokes = (m.pts as unknown[])
      .slice(0, kind === 'draw' ? 40 : 1)
      .map((s) => (Array.isArray(s) ? s.slice(0, 600).map(cleanPt).filter((p): p is Pt => !!p) : []))
      .filter((s) => s.length > 0)
    if (!strokes.length) continue
    if (kind !== 'draw' && strokes[0].length !== 2) continue
    out.push({
      id: m.id.slice(0, 40),
      n: Math.max(1, Math.min(999, Math.round(Number(m.n) || 1))),
      kind,
      pts: strokes,
      note: typeof m.note === 'string' ? m.note.slice(0, 1000) : '',
      status: m.status === 'done' ? 'done' : 'open',
      hidden: m.hidden === true || undefined,
      versionId: typeof m.versionId === 'string' ? m.versionId.slice(0, 40) : undefined,
      sentIn: Array.isArray(m.sentIn) ? m.sentIn.filter((s): s is string => typeof s === 'string').slice(-20).map((s) => s.slice(0, 40)) : undefined,
      by: typeof m.by === 'string' ? m.by.slice(0, 80) : undefined,
      at: Number(m.at) || 0,
    })
  }
  return out
}
