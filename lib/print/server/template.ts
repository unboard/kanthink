import sharp from 'sharp'
import { Type, type Schema } from '@google/genai'
import { getLLMClientForUser } from '@/lib/ai/llm'
import type { GuideShape, PrintSpec, Unit } from '../types'
import { asymmetry, cropToBleed, snapColor, snapFolds, traceDieLine } from '../dieline'
import { MM_PER_IN, validateSpec } from '../spec'
import { forModel, storeImage } from './images'
import { printProviderKeys, recordPrintUsage } from './meter'
import { pdfPageSizes, rasterizePdf } from './pdf'
import { geminiJson, parseLooseJson } from './understand'

/**
 * A product read off a printer's template: the guide sheet with its trim, bleed and
 * safe lines, folds and panel names ("fold in", "back", "cover").
 *
 * The result is a draft for a person to check, never saved on its own. Measurements
 * printed on the template win over anything estimated from pixels, and the person's
 * own notes win over both.
 */

export interface TemplateFile {
  data: Buffer
  type: string
  name: string
}

export interface TemplateReading {
  spec: PrintSpec
  /** One or two sentences on what was read. */
  summary: string
  /** What was assumed or unclear, for the person to check. */
  doubts: string[]
}

export class TemplateError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

const MAX_SHEETS = 2

const isPdf = (f: TemplateFile) => /pdf/i.test(f.type) || f.data.subarray(0, 5).toString('latin1') === '%PDF-'

interface Sheet {
  /** What the model reads. */
  image: { data: Buffer; mimeType: string }
  /** The full sheet, for tracing. */
  source: Buffer
  /** Pixels per inch of `source`, when the file itself says. */
  ppi: number | null
  facts: string
}

/** Long edge for PDF sheets: plenty to trace a hairline, small enough to label every pixel. */
const TRACE_EDGE = 3600

/** Each file as images a model can read, with what the file itself says about its size. */
async function toSheets(files: TemplateFile[]): Promise<Sheet[]> {
  const raw: Omit<Sheet, 'image'>[] = []
  for (const file of files) {
    const room = MAX_SHEETS - raw.length
    if (room <= 0) break
    if (isPdf(file)) {
      const [sizes, pages] = await Promise.all([pdfPageSizes(file.data, room), rasterizePdf(file.data, { maxPages: room, maxEdge: TRACE_EDGE })])
      for (const [i, data] of pages.entries()) {
        const s = sizes[i]
        const { width } = await sharp(data).metadata()
        raw.push({
          source: data,
          ppi: width ? width / s.widthIn : null,
          facts: `${file.name}, page ${i + 1}: a PDF whose page is exactly ${s.widthIn.toFixed(3)} × ${s.heightIn.toFixed(3)} in (${(s.widthIn * MM_PER_IN).toFixed(1)} × ${(s.heightIn * MM_PER_IN).toFixed(1)} mm).`,
        })
      }
    } else {
      const meta = await sharp(file.data, { failOn: 'none' }).metadata().catch(() => null)
      if (!meta?.width || !meta.height) throw new TemplateError(`${file.name} isn’t an image we can read.`)
      const dpi = meta.density && meta.density > 72 ? meta.density : null
      raw.push({
        source: file.data,
        // A 72 or 96 dpi tag is a screen default, not a statement about print size.
        ppi: dpi && dpi >= 150 ? dpi : null,
        facts: `${file.name}: an image ${meta.width} × ${meta.height} px${dpi ? `, tagged ${dpi} dpi (so ${(meta.width / dpi).toFixed(3)} × ${(meta.height / dpi).toFixed(3)} in if that tag is right)` : ', with no reliable size of its own'}.`,
      })
    }
  }
  // Text on templates is small; give the model enough pixels to read dimensions.
  return Promise.all(raw.map(async (r) => ({ ...r, image: await forModel(r.source, 2400) })))
}

const SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: 'Short product name, e.g. "Tri-fold brochure" or "Table tent". Include the finished size only if the notes ask.' },
    kind: { type: Type.STRING, description: 'One lowercase phrase for a designer brief, e.g. "letter-fold (tri-fold) brochure".' },
    unit: { type: Type.STRING, enum: ['in', 'mm'], description: 'The unit the template itself uses. Every length below is in this unit.' },
    trimWidth: { type: Type.NUMBER, description: 'Finished (trim) width of the flat sheet, before folding.' },
    trimHeight: { type: Type.NUMBER, description: 'Finished (trim) height of the flat sheet, before folding.' },
    bleed: { type: Type.NUMBER, description: 'Bleed past the trim on each side.' },
    safe: { type: Type.NUMBER, description: 'Safe margin inside the trim that text must stay within.' },
    foldDirection: { type: Type.STRING, enum: ['none', 'vertical', 'horizontal'], description: 'vertical = fold lines run top to bottom, making side-by-side panels.' },
    folds: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: 'Each fold line, measured from the LEFT trim edge (vertical folds) or TOP trim edge (horizontal folds). Not from the bleed edge.' },
    foldsPrinted: { type: Type.BOOLEAN, description: 'True only if the fold positions or panel widths are written as numbers on the template, or given in the notes.' },
    trimBox: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: 'Where the trim (cut) line sits in image 1, as [ymin, xmin, ymax, xmax] on a 0–1000 scale of the image. For a shaped piece, the box around the whole cut line, tabs included.' },
    foldLines: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: 'Where each fold line is drawn in image 1, on a 0–1000 scale across the image (x for vertical folds, y for horizontal). Same order as `folds`.' },
    shape: { type: Type.STRING, enum: ['rectangle', 'rounded', 'circle', 'doorhanger', 'other'] },
    cutLineColor: { type: Type.STRING, description: 'The color of the line that marks where the piece is cut (the die line or trim line) in image 1, as #rrggbb. Use the legend if there is one.' },
    cornerRadius: { type: Type.NUMBER, description: 'For rounded or doorhanger shapes.' },
    holeDiameter: { type: Type.NUMBER, description: 'Doorhanger only.' },
    holeCenterFromTop: { type: Type.NUMBER, description: 'Doorhanger only: from the top trim edge to the hole center.' },
    pages: {
      type: Type.ARRAY,
      description: 'One per printed side, in order. Usually one per template sheet.',
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING, description: 'The side, e.g. "Outside", "Inside", "Front", "Back".' },
          panels: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Folded pieces only: one name per panel, in order left to right (or top to bottom), as this side is seen flat. Use the template’s own names, tidied: "Fold-in flap", "Back cover", "Front cover", "Inside left". Empty when there are no folds.',
          },
          hint: { type: Type.STRING, description: 'One to three sentences telling the designer what content belongs on this side and on each panel, in order — not just naming them. E.g. "Outside, left to right: (1) the fold-in flap — a teaser, offer or testimonial; (2) the back cover — contact details, address, hours, map or website; (3) the front cover — logo, headline and a hero image, the first thing people see."' },
        },
        required: ['label', 'hint'],
      },
    },
    summary: { type: Type.STRING, description: 'One or two plain sentences: what this product is and the key numbers you read.' },
    doubts: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Each thing you estimated, assumed or could not read. Empty if everything was printed on the template.' },
  },
  required: ['name', 'unit', 'trimWidth', 'trimHeight', 'bleed', 'safe', 'foldDirection', 'shape', 'pages', 'summary'],
}

interface Raw {
  name?: string
  kind?: string
  unit?: string
  trimWidth?: number
  trimHeight?: number
  bleed?: number
  safe?: number
  foldDirection?: string
  folds?: number[]
  foldsPrinted?: boolean
  trimBox?: number[]
  foldLines?: number[]
  shape?: string
  cutLineColor?: string
  cornerRadius?: number
  holeDiameter?: number
  holeCenterFromTop?: number
  pages?: { label?: string; panels?: string[]; hint?: string }[]
  summary?: string
  doubts?: string[]
}

function prompt(sheets: Sheet[], notes: string): string {
  return [
    'You are a prepress technician. The image(s) are a print shop’s template for one product — the guide a designer lays artwork over.',
    'Read the product’s geometry and the role of each side and panel from it.',
    '',
    'What you have:',
    ...sheets.map((s, i) => `- Image ${i + 1}: ${s.facts}`),
    '',
    'How templates work:',
    '- They usually mark three lines: the bleed edge (outermost; artwork runs to it), the trim or cut line (the finished size), and a safe line inside the trim. Often they are colored and labeled, e.g. red for bleed, black for trim, blue or green for safe.',
    '- Fold lines are usually dashed and labeled "fold". Panel names are printed inside each panel: "cover", "back", "fold in", "inside flap", "inside left".',
    '- A PDF template’s page is usually the bleed edge, so trim = page size minus twice the bleed. Check that against the lines you see — some templates have extra slug area around the bleed.',
    '- Tri-fold panels are often unequal (the fold-in flap is about 1/16 in narrower so it tucks in). If fold positions are printed, use them exactly. If panel widths are printed, add them up from the left trim edge. The two sides of a tri-fold mirror each other, so their folds differ slightly: give the folds as they are on the FIRST side.',
    '- Measurements printed on the template are the truth. Only estimate from proportions when nothing is printed, and list every estimate in `doubts`.',
    '- Always locate the trim line (`trimBox`) and every drawn fold line (`foldLines`) in image 1, so the folds can be measured from the drawing. Set `foldsPrinted` only when the positions are written as numbers. Don’t list fold positions or panel widths in `doubts`; they are measured from the drawing separately.',
    '- When the template has two sides (two sheets, or both on one sheet), make one page per side. The outside of a tri-fold is usually: fold-in flap, back cover, front cover (left to right); the inside: three inside panels. But follow the labels on this template, not the usual order.',
    '- If there is no fold, leave `panels` empty. If no safe line is marked, use 0.125 in (3 mm). If no bleed is marked, use 0.125 in (3 mm) and say so in `doubts`.',
    '- `shape` is the cut outline. Use "other" for any custom die line — tabs, slots, notches, odd outlines — and give its `cutLineColor`; it is traced exactly from the drawing. For a die-cut piece, the trim size is the box around the whole cut line, tabs included.',
    '',
    notes.trim()
      ? `The person’s notes. Follow them over anything you read or assume — they may give the size, page labels or how to set it up:\n${notes.trim()}`
      : 'The person gave no notes.',
  ].join('\n')
}

/** Fold lines located in the image, as fractions of the trim located in the same image. */
function measuredFolds(raw: Raw, direction: 'vertical' | 'horizontal'): number[] {
  const box = raw.trimBox
  if (!Array.isArray(box) || box.length !== 4 || !box.every((v) => typeof v === 'number' && Number.isFinite(v))) return []
  const [ymin, xmin, ymax, xmax] = box
  const [start, end] = direction === 'vertical' ? [xmin, xmax] : [ymin, ymax]
  if (end - start < 100) return []
  return (raw.foldLines ?? [])
    .filter((v) => typeof v === 'number' && Number.isFinite(v))
    .map((v) => (v - start) / (end - start))
    .filter((f) => f > 0.01 && f < 0.99)
    .sort((a, b) => a - b)
}

interface Draft extends TemplateReading {
  /** The folds came from the drawing, not from printed numbers. */
  foldsMeasured: boolean
}

function clean(raw: Raw | null): Draft {
  if (!raw) throw new TemplateError('Couldn’t read that template. Try a clearer image or add the size in the notes.', 502)
  const unit: Unit = raw.unit === 'mm' ? 'mm' : 'in'
  const inches = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? (unit === 'mm' ? v / MM_PER_IN : v) : NaN)
  const widthIn = inches(raw.trimWidth)
  const heightIn = inches(raw.trimHeight)
  const doubts = (raw.doubts ?? []).filter((d) => typeof d === 'string' && d.trim()).map((d) => d.trim().slice(0, 240)).slice(0, 8)

  let folds: PrintSpec['folds']
  let foldsMeasured = false
  const direction = raw.foldDirection === 'horizontal' ? 'horizontal' : raw.foldDirection === 'vertical' ? 'vertical' : null
  if (direction) {
    const len = direction === 'vertical' ? widthIn : heightIn
    const fractions = (list: number[]) => list.filter((f) => f > 0.01 && f < 0.99).sort((a, b) => a - b)
    const stated = Array.isArray(raw.folds) ? fractions(raw.folds.map((f) => inches(f) / len)) : []
    const measured = measuredFolds(raw, direction)
    // A model asked for positions nobody printed recalls a standard rather than reading
    // the drawing; where it points is far more reliable than what it computes.
    const at = !raw.foldsPrinted && measured.length ? measured : stated.length ? stated : measured
    if (at.length) folds = { direction, at }
    foldsMeasured = !raw.foldsPrinted && at.length > 0 && at === measured
  }

  let guide: GuideShape | undefined
  const r = inches(raw.cornerRadius)
  if (raw.shape === 'circle') guide = { kind: 'circle' }
  else if (raw.shape === 'rounded' && r > 0) guide = { kind: 'rounded', radiusIn: r }
  else if (raw.shape === 'doorhanger') {
    const hole = inches(raw.holeDiameter)
    const center = inches(raw.holeCenterFromTop)
    if (hole > 0 && center > 0) guide = { kind: 'doorhanger', holeDiameterIn: hole, holeCenterFromTopIn: center, cornerIn: r > 0 ? r : 0 }
  }

  const panelTotal = folds ? folds.at.length + 1 : 0
  const pages = (raw.pages ?? []).slice(0, 12).map((p, i) => {
    const panels = (p.panels ?? []).map((x) => String(x ?? '').trim()).filter(Boolean)
    return {
      label: String(p.label ?? '').trim() || `Page ${i + 1}`,
      hint: p.hint?.trim() || undefined,
      panels: panelTotal && panels.length === panelTotal ? panels : undefined,
    }
  })

  const spec = validateSpec({
    id: 'custom',
    name: raw.name?.trim() || 'From template',
    kind: raw.kind?.trim() || undefined,
    widthIn,
    heightIn,
    bleedIn: inches(raw.bleed),
    safeIn: inches(raw.safe),
    unit,
    folds,
    guide,
    pages: pages.length ? pages : [{ label: 'Front' }],
  })
  if (!spec) throw new TemplateError('Couldn’t make out the size from that template. Add it in the notes — “11 × 8.5 in flat, 0.125 bleed” — and read it again.', 422)
  if (folds && pages.some((p) => !p.panels)) doubts.push('Some panels weren’t named on the template. Name them below so the designer knows which is the cover.')
  return { spec, summary: (raw.summary ?? '').trim().slice(0, 400), doubts, foldsMeasured }
}

/** The note for folds measured off the drawing, written from the final folds. */
function foldNote(spec: PrintSpec): string | null {
  if (!spec.folds) return null
  const unit = spec.unit ?? 'in'
  const vertical = spec.folds.direction === 'vertical'
  const len = vertical ? spec.widthIn : spec.heightIn
  const list = spec.folds.at.map((f) => fmtLen(f * len, unit)).join(', ')
  return `The fold positions weren’t printed, so they’re measured from the drawing (${list} from the ${vertical ? 'left' : 'top'}). Check them against the printer’s spec.`
}

export async function readTemplate(userId: string, files: TemplateFile[], notes: string): Promise<TemplateReading> {
  if (!files.length) throw new TemplateError('Add the template image or PDF.')
  const { keys, error, quotaExhausted, quotaMessage } = await printProviderKeys(userId)
  if (error) throw new TemplateError(error)
  if (quotaExhausted) throw new TemplateError(quotaMessage ?? 'This account is out of AI quota.', 403)

  const sheets = await toSheets(files)
  const text = prompt(sheets, notes.slice(0, 2000))

  let raw: Raw | null
  if (keys.google) {
    raw = await geminiJson<Raw>(
      keys.google.apiKey,
      [...sheets.map((s) => ({ inlineData: { mimeType: s.image.mimeType, data: s.image.data.toString('base64') } })), { text }],
      SCHEMA,
    )
  } else {
    const { client } = await getLLMClientForUser(userId, undefined, 'apps')
    if (!client) throw new TemplateError('Add a Google or OpenAI key in Settings → AI to read templates.')
    const res = await client.complete(
      [
        {
          role: 'user',
          content: [
            ...sheets.map((s) => ({ type: 'image_url' as const, image_url: { url: `data:${s.image.mimeType};base64,${s.image.data.toString('base64')}` } })),
            {
              type: 'text' as const,
              text: `${text}\n\nReply with JSON only, with these keys: name, kind, unit ("in"|"mm"), trimWidth, trimHeight, bleed, safe, foldDirection ("none"|"vertical"|"horizontal"), folds (numbers from the left/top trim edge), foldsPrinted (boolean), trimBox ([ymin,xmin,ymax,xmax] 0–1000 in image 1), foldLines (0–1000 across image 1), shape ("rectangle"|"rounded"|"circle"|"doorhanger"|"other"), cutLineColor ("#rrggbb"), cornerRadius, holeDiameter, holeCenterFromTop, pages ([{label, panels: string[], hint}]), summary, doubts (string[]).`,
            },
          ],
        },
      ],
      { maxTokens: 2500 },
    )
    raw = parseLooseJson<Raw>(res.content)
  }
  await recordPrintUsage(userId, 'print-template').catch(() => {})
  const draft = clean(raw)
  const { foldsMeasured, ...reading } = draft
  // Whether a template is "a rectangle" is the model's guess; the drawing settles it.
  const traceable = raw && (raw.shape === 'other' || raw.shape === 'rectangle' || !raw.shape) && !!raw.cutLineColor
  const result = traceable || raw?.shape === 'other' ? await withTracedShape(userId, reading, raw!, sheets[0]) : reading
  const note = foldsMeasured ? foldNote(result.spec) : null
  if (!note) return result
  // The measured note replaces whatever the model guessed about the folds.
  const aboutFoldPlaces = (d: string) =>
    /\b(folds?|panels?)\b/i.test(d) && /position|width|wide|measur|calculat|estimat|assum|standard/i.test(d) && !/\b(names?|named|labels?|labeled)\b/i.test(d)
  const others = result.doubts.filter((d) => !aboutFoldPlaces(d) || /^The (cut shape|traced)/.test(d))
  return { ...result, doubts: [note, ...others] }
}

const fmtLen = (inches: number, unit: Unit) => `${Number((unit === 'mm' ? inches * MM_PER_IN : inches).toFixed(unit === 'mm' ? 1 : 3))} ${unit}`

/**
 * A custom die line traced from the first sheet. Its outline becomes the guide and its
 * bounding box the trim — measured, so on a PDF the size is exact rather than read.
 * Folds are re-measured against the same box.
 */
async function withTracedShape(userId: string, reading: TemplateReading, raw: Raw, sheet: Sheet): Promise<TemplateReading> {
  // A plain rectangle the model mistook for one is no failure: keep what was read.
  const custom = raw.shape === 'other'
  const failed = (why: string): TemplateReading => custom ? {
    ...reading,
    doubts: [
      ...reading.doubts,
      `${why} so this is set up as a rectangle for now. Read it again with the cut line’s color in the notes (“the cut line is magenta”), or use Custom size and upload a die line.`,
    ],
  } : reading
  if (!raw.cutLineColor) return failed('The cut line’s color wasn’t clear,')

  const meta = await sharp(sheet.source).metadata()
  const { data, info } = await sharp(sheet.source, { failOn: 'none' })
    .resize({ width: TRACE_EDGE, height: TRACE_EDGE, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const spec = reading.spec
  // Holes are told from specks by real size: anything under about a fifth of an inch
  // square is lettering or noise, while a tab slot is far bigger.
  const box = raw.trimBox
  const roughPpi =
    sheet.ppi && meta.width
      ? sheet.ppi * (info.width / meta.width)
      : Array.isArray(box) && box.length === 4 && box[3] > box[1]
        ? ((box[3] - box[1]) / 1000) * info.width / spec.widthIn
        : null
  const minRegion = roughPpi && Number.isFinite(roughPpi) ? Math.max(64, Math.round(0.04 * roughPpi * roughPpi)) : undefined
  const color = snapColor(data, info.width, info.height, raw.cutLineColor)
  const traced = traceDieLine({ data, width: info.width, height: info.height, color, minRegion })
  if (!traced) return failed(`Couldn’t find a closed ${raw.cutLineColor} cut line to trace,`)

  const unit = spec.unit ?? 'in'
  const ppi = sheet.ppi && meta.width ? sheet.ppi * (info.width / meta.width) : traced.box.w / spec.widthIn
  if (!Number.isFinite(ppi) || ppi <= 0) return failed('Couldn’t tell the template’s scale,')
  const widthIn = traced.box.w / ppi
  const heightIn = traced.box.h / ppi
  const doubts = [...reading.doubts]
  const off = (a: number, b: number) => Math.abs(a - b) / b > 0.02
  if (sheet.ppi && (off(widthIn, spec.widthIn) || off(heightIn, spec.heightIn))) {
    doubts.push(
      `The traced cut line measures ${fmtLen(widthIn, unit)} × ${fmtLen(heightIn, unit)} overall, not the ${fmtLen(spec.widthIn, unit)} × ${fmtLen(spec.heightIn, unit)} read from the template and notes. The measured size is used.`,
    )
  }

  const plain = traced.holes === 0 && traced.fill > 0.995

  let folds = spec.folds
  if (folds && !raw.foldsPrinted && Array.isArray(raw.foldLines) && raw.foldLines.length) {
    const vertical = folds.direction === 'vertical'
    const along = vertical ? info.width : info.height
    const [start, len] = vertical ? [traced.box.x, traced.box.w] : [traced.box.y, traced.box.h]
    const hints = raw.foldLines.filter((v) => typeof v === 'number' && Number.isFinite(v)).map((v) => (v / 1000) * along)
    const at = snapFolds(data, info.width, info.height, traced.box, folds.direction, hints)
      .map((px) => (px - start) / len)
      .filter((f) => f > 0.01 && f < 0.99)
      .sort((a, b) => a - b)
    if (at.length === folds.at.length) folds = { ...folds, at }
  }

  // A traced rectangle is just a rectangle: keep the vector trim, take the measurements.
  // It only refines a size already close to what was read — a rectangle far off is
  // most likely the bleed or safe line, traced by mistake.
  if (plain) {
    const gap = Math.max(Math.abs(widthIn - spec.widthIn) / spec.widthIn, Math.abs(heightIn - spec.heightIn) / spec.heightIn)
    if (!custom && gap > 0.03) return reading
    // Within half a percent, the read size is the printed or page-exact one; keep it.
    const next = validateSpec(gap < 0.005 ? { ...spec, folds } : { ...spec, widthIn, heightIn, folds })
    return next ? { ...reading, spec: next, doubts } : reading
  }

  const crop = cropToBleed(traced, spec.bleedIn * ppi)
  const png = await sharp(Buffer.from(crop.mask), { raw: { width: crop.width, height: crop.height, channels: 1 } }).png().toBuffer()
  const stored = await storeImage(png, userId, 'guides')

  doubts.push(
    `The cut shape was traced from the template’s ${color} line${traced.holes ? `, with ${traced.holes} cut-out${traced.holes === 1 ? '' : 's'}` : ''}. Check the outline in the preview below.`,
  )
  if (spec.pages.length > 1 && asymmetry(traced) > 0.01) {
    doubts.push('This shape isn’t symmetrical, and every side uses the same outline — on the back of a die-cut piece it should be mirrored. Check the back against the template.')
  }
  const next = validateSpec({ ...spec, widthIn, heightIn, folds, guide: { kind: 'image', url: stored.url, name: 'Traced from template' } })
  if (!next) return failed('The traced shape came out at a size that doesn’t look right,')
  return { ...reading, spec: next, doubts }
}
