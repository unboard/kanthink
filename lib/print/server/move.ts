import sharp from 'sharp'
import { Type, type Schema } from '@google/genai'
import { bounds, markupSvg, placeWords, type Mark } from '../markup'
import { matteAlpha, padBox, refineMatte, unmix, type PlannedMove, type Placement, type ResolvedMove } from '../move'
import { centerCrop, safeRect, sheetRatio } from '../spec'
import type { PreflightElement, PrintSpec } from '../types'
import { geminiJson } from './understand'

/**
 * The server half of exact moves (see lib/print/move.ts): reading which marks ask for
 * a move, and the pixel work of lifting an element off a page and setting it down.
 */

const PLACEMENTS: Placement[] = ['center_in_mark', 'center_x_in_mark', 'center_y_in_mark', 'to_arrow_head', 'point']

const PLAN_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    moves: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          marks: { type: Type.ARRAY, items: { type: Type.INTEGER } },
          elements: { type: Type.ARRAY, items: { type: Type.INTEGER } },
          place: { type: Type.STRING, enum: PLACEMENTS },
          x: { type: Type.NUMBER },
          y: { type: Type.NUMBER },
          scale: { type: Type.NUMBER },
        },
        required: ['marks', 'elements', 'place'],
      },
    },
  },
  required: ['moves'],
}

const f = (v: number) => v.toFixed(3)

function planPrompt(spec: PrintSpec, elements: PreflightElement[], marks: Mark[], instruction: string): string {
  const safe = safeRect(spec)
  const kind: Record<Mark['kind'], string> = { draw: 'drawing', arrow: 'arrow', ellipse: 'circle', rect: 'box' }
  const markLines = marks.map((m) => {
    const b = bounds(m)
    const geo = m.kind === 'arrow'
      ? `from (${f(m.pts[0][0][0])}, ${f(m.pts[0][0][1])}) to (${f(m.pts[0].at(-1)![0])}, ${f(m.pts[0].at(-1)![1])})`
      : `box x ${f(b.x0)}–${f(b.x1)}, y ${f(b.y0)}–${f(b.y1)}`
    return `  Mark ${m.n} — ${kind[m.kind]} ${placeWords(m)}, ${geo}: ${m.note.trim() || '(no note)'}`
  })
  const elementLines = elements.map((e, i) => `  [${i}] ${e.kind}${e.text ? ` “${e.text}”` : ''} — x ${f(e.box[0])}–${f(e.box[2])}, y ${f(e.box[1])}–${f(e.box[3])}`)
  return [
    'This is a finished print design with a person’s markup drawn on it in pink, each mark numbered. Coordinates are fractions of the page: x across from the left, y down from the top.',
    `The safe area (where text must stay) is x ${f(safe.x)}–${f(safe.x + safe.w)}, y ${f(safe.y)}–${f(safe.y + safe.h)}.`,
    'Marks:',
    ...markLines,
    instruction ? `Also asked: ${instruction}` : '',
    'Elements found on the page:',
    ...elementLines,
    '',
    'Find the marks that ask only to MOVE (reposition) existing things, without changing their words, look or size (unless the note asks for bigger/smaller). For each such move, return:',
    '- marks: the mark numbers it answers.',
    '- elements: the indexes of every element that moves together. A multi-line title is all its lines; include each line the note refers to.',
    '- place, choosing the one that says it most exactly:',
    '  center_in_mark — center the group inside the mark’s box.',
    '  center_y_in_mark — center it vertically in the mark’s box; keep where it sits across.',
    '  center_x_in_mark — center it horizontally in the mark’s box; keep its height on the page.',
    '  to_arrow_head — an arrow with no more exact note: the thing at the tail goes where the arrow points.',
    '  point — anything else (e.g. “centered between the text above and the bar below”, “just under the safe line”): measure from the image and give x, y as where the CENTER of the group should end up.',
    '- scale: only when the note asks for a size change (1.2 = 20% bigger); otherwise leave it out.',
    'Leave out every mark that asks for anything other than a pure move — new words, spelling, color, removal, additions, restyling. Those are handled separately. If no mark is a pure move, return an empty list.',
  ].filter(Boolean).join('\n')
}

/** Which marks are pure moves, and of what. Null when the plan can't be made. */
export async function planMoves(
  apiKey: string,
  page: Buffer,
  spec: PrintSpec,
  elements: PreflightElement[],
  marks: Mark[],
  instruction: string,
): Promise<PlannedMove[] | null> {
  const meta = await sharp(page).metadata()
  const width = 1400
  const height = Math.round((width * (meta.height ?? 1)) / (meta.width ?? 1))
  const base = await sharp(page).resize(width, height, { fit: 'fill' }).png().toBuffer()
  const marked = await sharp(base).composite([{ input: Buffer.from(markupSvg(marks, width, height)) }]).jpeg({ quality: 86 }).toBuffer()
  try {
    const out = await geminiJson<{ moves?: PlannedMove[] }>(
      apiKey,
      [{ inlineData: { mimeType: 'image/jpeg', data: marked.toString('base64') } }, { text: planPrompt(spec, elements, marks, instruction) }],
      PLAN_SCHEMA,
    )
    const known = new Set(marks.map((m) => m.n))
    return (out.moves ?? []).filter(
      (m) => PLACEMENTS.includes(m.place) && m.marks?.length && m.marks.every((n) => known.has(n)) && m.elements?.length && m.elements.every((i) => i >= 0 && i < elements.length),
    )
  } catch (err) {
    console.error('[print] move plan failed:', err instanceof Error ? err.message : err)
    return null
  }
}

/** Room around an element's box for its glow, shadow and the reader's loose edges. */
export function liftPad(spec: PrintSpec): { x: number; y: number } {
  // The same distance both ways: 1.5% of the page's short side.
  const r = sheetRatio(spec)
  const d = 0.015
  return r >= 1 ? { x: d / r, y: d } : { x: d, y: d * r }
}

/** The mask to erase the moving elements with, in page coordinates: white where they are. */
export async function eraseMask(spec: PrintSpec, boxes: { x0: number; y0: number; x1: number; y1: number }[], width = 1600): Promise<Buffer> {
  const height = Math.round(width / sheetRatio(spec))
  const pad = liftPad(spec)
  const rects = boxes
    .map((b) => padBox(b, pad.x, pad.y))
    .map((b) => `<rect x="${b.x0 * width}" y="${b.y0 * height}" width="${(b.x1 - b.x0) * width}" height="${(b.y1 - b.y0) * height}" fill="#fff"/>`)
    .join('')
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects}</svg>`)).png().toBuffer()
}

/**
 * Lift each moving group off `original` and set it down on `clean` (the same frame
 * with those groups erased) at its destination.
 *
 * The matte is the difference between the two: whatever erasing removed is the element,
 * glow and shadow included, and nothing else is. Work is in the raw frame; page boxes
 * map into it through the sheet's centered crop.
 */
export async function liftAndPlace(original: Buffer, clean: Buffer, spec: PrintSpec, moves: ResolvedMove[]): Promise<Buffer> {
  const { data: o, info } = await sharp(original).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const H = info.height
  const c = await sharp(clean).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer()
  const crop = centerCrop(W / H, sheetRatio(spec))
  const px = (x: number) => (crop.x + x * crop.w) * W
  const py = (y: number) => (crop.y + y * crop.h) * H
  const pad = liftPad(spec)

  const layers: sharp.OverlayOptions[] = []
  for (const mv of moves) {
    const src = padBox(mv.from, pad.x, pad.y)
    const left = Math.max(0, Math.floor(px(src.x0)))
    const top = Math.max(0, Math.floor(py(src.y0)))
    const w = Math.min(W, Math.ceil(px(src.x1))) - left
    const h = Math.min(H, Math.ceil(py(src.y1))) - top
    if (w < 2 || h < 2) continue
    const alpha = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = ((top + y) * W + left + x) * 3
        alpha[y * w + x] = matteAlpha(Math.max(Math.abs(o[i] - c[i]), Math.abs(o[i + 1] - c[i + 1]), Math.abs(o[i + 2] - c[i + 2])))
      }
    }
    // The element's measured box inside the cut; the padding is only room for its edges.
    const core = { x0: px(mv.from.x0) - left, y0: py(mv.from.y0) - top, x1: px(mv.from.x1) - left, y1: py(mv.from.y1) - top }
    const margin = Math.max(2, Math.min(px(src.x1) - px(mv.from.x1), py(src.y1) - py(mv.from.y1)))
    const textH = Math.max(8, core.y1 - core.y0)
    refineMatte(alpha, w, h, core, margin, Math.round((textH * 0.06) ** 2))
    const rgba = Buffer.alloc(w * h * 4)
    for (let k = 0; k < w * h; k++) {
      const x = k % w
      const i = ((top + (k - x) / w) * W + left + x) * 3
      const a = alpha[k]
      const j = k * 4
      rgba[j] = unmix(o[i], c[i], a)
      rgba[j + 1] = unmix(o[i + 1], c[i + 1], a)
      rgba[j + 2] = unmix(o[i + 2], c[i + 2], a)
      rgba[j + 3] = Math.round(a * 255)
    }
    // The cut keeps the same padding around the group at its destination, scaled with it.
    const sx = (mv.to.x1 - mv.to.x0) / (mv.from.x1 - mv.from.x0)
    const sy = (mv.to.y1 - mv.to.y0) / (mv.from.y1 - mv.from.y0)
    const nw = Math.max(1, Math.round(w * sx))
    const nh = Math.max(1, Math.round(h * sy))
    let piece = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
    if (nw !== w || nh !== h) piece = await sharp(piece).resize(nw, nh, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer()
    let dl = Math.round(left + (px(mv.to.x0) - px(mv.from.x0)))
    let dt = Math.round(top + (py(mv.to.y0) - py(mv.from.y0)))
    // sharp refuses overlays that hang off the frame, so trim what would.
    const cl = Math.max(0, -dl)
    const ct = Math.max(0, -dt)
    const cw = Math.min(nw - cl, W - Math.max(0, dl))
    const ch = Math.min(nh - ct, H - Math.max(0, dt))
    if (cw < 1 || ch < 1) continue
    if (cl || ct || cw < nw || ch < nh) piece = await sharp(piece).extract({ left: cl, top: ct, width: cw, height: ch }).png().toBuffer()
    dl = Math.max(0, dl)
    dt = Math.max(0, dt)
    layers.push({ input: piece, left: dl, top: dt })
  }
  const base = await sharp(c, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer()
  return sharp(base).composite(layers).jpeg({ quality: 95 }).toBuffer()
}
