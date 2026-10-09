import sharp from 'sharp'
import { Type, type Schema } from '@google/genai'
import { getLLMClientForUser } from '@/lib/ai/llm'
import type { GuideShape, PrintSpec, Unit } from '../types'
import { MM_PER_IN, validateSpec } from '../spec'
import { forModel } from './images'
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
  image: { data: Buffer; mimeType: string }
  facts: string
}

/** Each file as images a model can read, with what the file itself says about its size. */
async function toSheets(files: TemplateFile[]): Promise<Sheet[]> {
  const raw: { data: Buffer; facts: string }[] = []
  for (const file of files) {
    const room = MAX_SHEETS - raw.length
    if (room <= 0) break
    if (isPdf(file)) {
      const [sizes, pages] = await Promise.all([pdfPageSizes(file.data, room), rasterizePdf(file.data, { maxPages: room })])
      pages.forEach((data, i) => {
        const s = sizes[i]
        raw.push({
          data,
          facts: `${file.name}, page ${i + 1}: a PDF whose page is exactly ${s.widthIn.toFixed(3)} × ${s.heightIn.toFixed(3)} in (${(s.widthIn * MM_PER_IN).toFixed(1)} × ${(s.heightIn * MM_PER_IN).toFixed(1)} mm).`,
        })
      })
    } else {
      const meta = await sharp(file.data, { failOn: 'none' }).metadata().catch(() => null)
      if (!meta?.width || !meta.height) throw new TemplateError(`${file.name} isn’t an image we can read.`)
      const dpi = meta.density && meta.density > 72 ? meta.density : null
      raw.push({
        data: file.data,
        facts: `${file.name}: an image ${meta.width} × ${meta.height} px${dpi ? `, tagged ${dpi} dpi (so ${(meta.width / dpi).toFixed(3)} × ${(meta.height / dpi).toFixed(3)} in if that tag is right)` : ', with no reliable size of its own'}.`,
      })
    }
  }
  // Text on templates is small; give the model enough pixels to read dimensions.
  return Promise.all(raw.map(async (r) => ({ image: await forModel(r.data, 2400), facts: r.facts })))
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
    trimBox: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: 'Where the trim (cut) line sits in image 1, as [ymin, xmin, ymax, xmax] on a 0–1000 scale of the image.' },
    foldLines: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: 'Where each fold line is drawn in image 1, on a 0–1000 scale across the image (x for vertical folds, y for horizontal). Same order as `folds`.' },
    shape: { type: Type.STRING, enum: ['rectangle', 'rounded', 'circle', 'doorhanger', 'other'] },
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
    '- Always locate the trim line (`trimBox`) and every drawn fold line (`foldLines`) in image 1, so the folds can be measured from the drawing. Set `foldsPrinted` only when the positions are written as numbers.',
    '- When the template has two sides (two sheets, or both on one sheet), make one page per side. The outside of a tri-fold is usually: fold-in flap, back cover, front cover (left to right); the inside: three inside panels. But follow the labels on this template, not the usual order.',
    '- If there is no fold, leave `panels` empty. If no safe line is marked, use 0.125 in (3 mm). If no bleed is marked, use 0.125 in (3 mm) and say so in `doubts`.',
    '- `shape` is the cut outline: "other" means a custom die line you cannot describe with the other options.',
    '',
    notes.trim()
      ? `The person’s notes. Follow them over anything you read or assume — they may give the size, page labels or how to set it up:\n${notes.trim()}`
      : 'The person gave no notes.',
  ].join('\n')
}

const toUnitNum = (inches: number, unit: Unit) => (unit === 'mm' ? inches * MM_PER_IN : inches)

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

function clean(raw: Raw | null): TemplateReading {
  if (!raw) throw new TemplateError('Couldn’t read that template. Try a clearer image or add the size in the notes.', 502)
  const unit: Unit = raw.unit === 'mm' ? 'mm' : 'in'
  const inches = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? (unit === 'mm' ? v / MM_PER_IN : v) : NaN)
  const widthIn = inches(raw.trimWidth)
  const heightIn = inches(raw.trimHeight)
  const doubts = (raw.doubts ?? []).filter((d) => typeof d === 'string' && d.trim()).map((d) => d.trim().slice(0, 240)).slice(0, 8)

  let folds: PrintSpec['folds']
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
    if (!raw.foldsPrinted && at === measured) {
      doubts.push(`The fold positions weren’t printed, so they’re measured from the drawing (${at.map((f) => `${Number(toUnitNum(f * len, unit).toFixed(unit === 'mm' ? 1 : 3))} ${unit}`).join(', ')} from the ${direction === 'vertical' ? 'left' : 'top'}). Check them against the printer’s spec.`)
    }
  }

  let guide: GuideShape | undefined
  const r = inches(raw.cornerRadius)
  if (raw.shape === 'circle') guide = { kind: 'circle' }
  else if (raw.shape === 'rounded' && r > 0) guide = { kind: 'rounded', radiusIn: r }
  else if (raw.shape === 'doorhanger') {
    const hole = inches(raw.holeDiameter)
    const center = inches(raw.holeCenterFromTop)
    if (hole > 0 && center > 0) guide = { kind: 'doorhanger', holeDiameterIn: hole, holeCenterFromTopIn: center, cornerIn: r > 0 ? r : 0 }
  } else if (raw.shape === 'other') {
    doubts.push('The cut shape isn’t one we can draw from a template, so this is set up as a rectangle. For a custom shape, use Custom size and upload a die line.')
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
  return { spec, summary: (raw.summary ?? '').trim().slice(0, 400), doubts }
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
              text: `${text}\n\nReply with JSON only, with these keys: name, kind, unit ("in"|"mm"), trimWidth, trimHeight, bleed, safe, foldDirection ("none"|"vertical"|"horizontal"), folds (numbers from the left/top trim edge), foldsPrinted (boolean), trimBox ([ymin,xmin,ymax,xmax] 0–1000 in image 1), foldLines (0–1000 across image 1), shape ("rectangle"|"rounded"|"circle"|"doorhanger"|"other"), cornerRadius, holeDiameter, holeCenterFromTop, pages ([{label, panels: string[], hint}]), summary, doubts (string[]).`,
            },
          ],
        },
      ],
      { maxTokens: 2500 },
    )
    raw = parseLooseJson<Raw>(res.content)
  }
  await recordPrintUsage(userId, 'print-template').catch(() => {})
  return clean(raw)
}
