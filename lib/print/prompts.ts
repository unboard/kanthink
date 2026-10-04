/**
 * What the image model is told.
 *
 * Print has rules a picture generator does not know: colour runs past the trim, words
 * stay inside the safe line, nothing crosses a fold, the die-cut shape is the piece.
 * Each rule is stated in the model's own frame — percentages of the image it returns
 * — because that is the only coordinate system it can act on. The percentages come
 * from the same geometry the crop and the preflight use (lib/print/spec), so the
 * brief, the trim and the check can't drift apart.
 */

import type { BrandKit, PageCopy, PrintBrief, PrintSpec, PreflightIssue } from './types'
import {
  bleedSize,
  foldsInFrame,
  formatSize,
  panelCount,
  safeMarginsInFrame,
  type Frame,
} from './spec'

export type RefRole = 'canvas' | 'logo' | 'asset' | 'inspiration' | 'page' | 'current' | 'marked'

export interface RefImage {
  role: RefRole
  url: string
  note?: string
  /** For `page` refs: which page it is. */
  label?: string
}

/** "Image 3" for the ref at a position, counting from one, as the model sees them. */
function imageName(index: number): string {
  return `Image ${index + 1}`
}

export function describeProduct(spec: PrintSpec): string {
  const orientation =
    spec.widthIn === spec.heightIn ? 'square' : spec.widthIn > spec.heightIn ? 'landscape' : 'portrait'
  return `a ${formatSize({ ...spec, unit: 'in' })} ${orientation} ${spec.kind ?? spec.name.toLowerCase()}`
}

/** Rough word budget for a page by its area, so a business card isn't asked for a paragraph. */
export function wordBudget(spec: PrintSpec): number {
  const area = (spec.widthIn * spec.heightIn) / panelCount(spec)
  const perPanel = Math.round(Math.min(160, Math.max(14, area * 1.6)))
  return perPanel * panelCount(spec)
}

/**
 * The print rules, in the frame the model draws.
 */
export function printRules(spec: PrintSpec, frame: Frame, hasCanvas: boolean): string[] {
  const m = safeMarginsInFrame(spec, frame)
  const lines: string[] = []
  const g = spec.guide

  if (g) {
    lines.push(
      `${hasCanvas ? 'Image 1' : 'The canvas'} is the die-cut guide for this piece: the WHITE shape is the finished piece, and everything BLACK is cut away and thrown out.`,
      'Design the piece to fill the white shape completely, and let its background colour, photo or pattern continue a little past the white shape’s edge into the black — that overlap is the bleed that keeps the cut edge clean.',
      'Leave the rest of the black area plain black. Do not draw the outline of the shape, a border along it, or any cut line.',
      'Keep every word, logo, phone number and face well inside the white shape: at least ' +
        `${Math.max(m.left, m.right)}% of the image width away from its left and right edges, and away from every curve and hole by the same distance.`,
    )
    if (g.kind === 'doorhanger') {
      lines.push(
        'The black circle near the top of the white shape is the hole that goes over a doorknob. Keep it clear: nothing important above it or around it; start the headline below it.',
      )
    }
    if (g.kind === 'circle') {
      lines.push('The piece is round. Compose for a circle: centred, with nothing important near the curve.')
    }
  } else {
    lines.push(
      hasCanvas
        ? 'Image 1 is a blank canvas. It only fixes the shape and proportions of the sheet — replace it entirely with the design. Nothing of its flat grey may remain.'
        : 'The image is the whole printed sheet.',
      'The image you return is the full sheet including the bleed that is trimmed off. The background colour, photos, textures and shapes must run all the way to every edge of the image. Never leave a white, blank or contrasting border or frame around the design — unless the design itself is deliberately on a white background, in which case white simply continues to the edges.',
      `All text, logos, phone numbers, QR codes and faces stay inside the safe area: at least ${m.left}% of the image width from the left edge, ${m.right}% from the right edge, ${m.top}% of the image height from the top and ${m.bottom}% from the bottom. Only background, photo and decorative shapes may go beyond that.`,
    )
  }

  if (spec.folds) {
    const folds = foldsInFrame(spec, frame)
    const axis = spec.folds.direction === 'vertical' ? 'from the left edge' : 'from the top edge'
    const panels = panelCount(spec)
    lines.push(
      `This sheet folds into ${panels} panels. The folds are at ${folds.map((f) => `${f}%`).join(' and ')} of the image ${spec.folds.direction === 'vertical' ? 'width' : 'height'} ${axis}.`,
      `Lay it out as ${panels} separate ${spec.folds.direction === 'vertical' ? 'columns' : 'rows'}, one per panel, each with its own margins. No text, logo or face may cross or touch a fold — keep each at least ${Math.max(m.left, 3)}% clear of every fold line. Backgrounds and photos may run across folds.`,
      'Do not draw the fold lines themselves.',
    )
  }

  lines.push(
    'It is the flat artwork itself, seen straight on and filling the whole image edge to edge — not a photo or mockup of a printed piece. Nothing is drawn around or outside the artwork: no frame, margin, shadow, table, hands, lines or marks, and no watermark.',
  )
  return lines
}

export function qualityRules(spec: PrintSpec): string[] {
  const budget = wordBudget(spec)
  return [
    'This is a professional print piece for a real small business. Clear hierarchy: one dominant headline, supporting text, an obvious call to action.',
    `Type is crisp and sized for print at ${formatSize({ ...spec, unit: 'in' })}: generous headline, body text comfortably readable in the hand. Strong contrast between text and what is behind it.`,
    `Keep the words to what is given — about ${budget} words at most. Spell every word exactly as written. No placeholder or lorem ipsum text, no invented phone numbers, addresses, prices or URLs, no fake QR codes or barcodes.`,
  ]
}

export function brandLines(kit: BrandKit | null, brief: PrintBrief, refs: RefImage[]): string[] {
  const lines: string[] = []
  refs.forEach((ref, i) => {
    const name = imageName(i)
    if (ref.role === 'logo') {
      lines.push(
        `${name} is the business’s logo. Place it on the design exactly as supplied — the same shapes, letters, proportions and colours. Never redraw, restyle, simplify, re-letter or invent a logo, and use no other logo.`,
      )
    } else if (ref.role === 'asset') {
      lines.push(`${name} is a photo or graphic the business supplied${ref.note ? ` (${ref.note})` : ''}. Use it in the design as it is — don’t alter what it shows.`)
    } else if (ref.role === 'inspiration') {
      lines.push(`${name} is inspiration for style only${ref.note ? ` (${ref.note})` : ''}: take its mood, layout ideas, typography feel and colour treatment. Don’t copy its words, logo, or subject.`)
    } else if (ref.role === 'page') {
      lines.push(`${name} is the ${ref.label ?? 'other'} page of this same piece, already designed. Match it as one family: same colours, typefaces, graphic language and photo style. Don’t repeat its content.`)
    }
  })

  if (kit && brief.useColors && kit.colors.length) {
    lines.push(
      `Brand colours: ${kit.colors.map((c) => (c.name ? `${c.name} ${c.hex}` : c.hex)).join(', ')}. Build the palette from these, with neutrals as needed.`,
    )
  }
  if (kit?.voice) lines.push(`Tone and audience: ${kit.voice}`)
  return lines
}

export function copyBlock(copy: PageCopy | undefined): string[] {
  if (!copy) return []
  const lines: string[] = []
  const words: string[] = []
  if (copy.headline) words.push(`Headline: ${copy.headline}`)
  if (copy.subhead) words.push(`Subheadline: ${copy.subhead}`)
  for (const b of copy.body ?? []) words.push(`Body: ${b}`)
  if (copy.cta) words.push(`Call to action: ${copy.cta}`)
  for (const d of copy.details ?? []) words.push(`Detail: ${d}`)
  if (words.length) {
    lines.push(
      'Put exactly this text on the page — word for word, spelled exactly as written, and nothing else (the labels before the colons are not printed):',
      ...words.map((w) => `  • ${w}`),
    )
  }
  if (copy.imagery) lines.push(`Imagery: ${copy.imagery}`)
  if (copy.layout) lines.push(`Layout: ${copy.layout}`)
  return lines
}

/**
 * Brief for drawing a page from nothing (or from the other pages).
 */
export function buildCreatePrompt(options: {
  spec: PrintSpec
  pageIndex: number
  frame: Frame
  refs: RefImage[]
  kit: BrandKit | null
  brief: PrintBrief
  userPrompt: string
  copy?: PageCopy
}): string {
  const { spec, pageIndex, frame, refs, kit, brief, userPrompt, copy } = options
  const page = spec.pages[pageIndex]
  const hasCanvas = refs[0]?.role === 'canvas'
  const sides = spec.pages.length > 1 ? ` This is the ${page.label.toLowerCase()} (page ${pageIndex + 1} of ${spec.pages.length}).` : ''

  return [
    `Design ${describeProduct(spec)} for print.${sides}`,
    page.hint ? `What this page is for: ${page.hint}` : '',
    userPrompt ? `The request: ${userPrompt}` : '',
    '',
    ...printRules(spec, frame, hasCanvas),
    '',
    ...brandLines(kit, brief, refs),
    ...copyBlock(copy),
    '',
    ...qualityRules(spec),
  ]
    .filter((l, i, arr) => l !== '' || (i > 0 && arr[i - 1] !== ''))
    .join('\n')
}

/** A change to the whole page, keeping everything not mentioned. */
export function buildEditPrompt(spec: PrintSpec, frame: Frame, instruction: string, refs: RefImage[]): string {
  const extra = refs.slice(1)
  return [
    `Image 1 is a finished print design (${describeProduct(spec)}). Edit it: ${instruction}`,
    'Change only what that asks for. Keep everything else — layout, text, spelling, logo, photos, colours — exactly as it is, at the same size and position.',
    ...extra.map((r, i) =>
      r.role === 'logo'
        ? `Image ${i + 2} is the business’s logo, exactly as it must appear.`
        : r.role === 'asset'
          ? `Image ${i + 2} is a supplied photo or graphic${r.note ? ` (${r.note})` : ''}.`
          : `Image ${i + 2} is for reference${r.note ? ` (${r.note})` : ''}.`,
    ),
    '',
    ...printRules(spec, frame, false).slice(1),
  ].join('\n')
}

/** A change confined to a painted area. The composite afterwards enforces "only there". */
export function buildAreaPrompt(spec: PrintSpec, instruction: string, refs: RefImage[]): string {
  const extra = refs.slice(2)
  return [
    `Image 1 is a finished print design (${describeProduct(spec)}). Image 2 is the same design with one area highlighted in bright magenta.`,
    `Change only the highlighted area: ${instruction}`,
    'Everything outside the highlighted area must stay exactly as it is in Image 1 — same pixels, layout, text and colours. Blend the change seamlessly into its surroundings. The result must contain no magenta highlight.',
    'Return the whole design, the same size and framing as Image 1.',
    ...extra.map((r, i) =>
      r.role === 'logo'
        ? `Image ${i + 3} is the business’s logo, exactly as it must appear if the change involves it.`
        : `Image ${i + 3} is a supplied photo or graphic${r.note ? ` (${r.note})` : ''} to use if the change calls for it.`,
    ),
  ].join('\n')
}

export function buildRetextPrompt(spec: PrintSpec, frame: Frame, before: PageCopy | undefined, after: PageCopy): string {
  return [
    `Image 1 is a finished print design (${describeProduct(spec)}). Update its words.`,
    ...copyBlock({ ...after, imagery: undefined, layout: undefined }),
    before ? 'Replace the existing text with this, keeping each piece in the same place, typeface, size, weight and colour as the text it replaces. Where text is new, set it to match the design.' : '',
    'Keep the layout, imagery, logo and colours exactly as they are.',
    '',
    ...printRules(spec, frame, false).slice(1),
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildFixPrompt(spec: PrintSpec, frame: Frame, issues: PreflightIssue[]): string {
  const asks = issues.map((issue) => {
    switch (issue.kind) {
      case 'border':
        return `- ${issue.message} Extend the background, colour or photo so it runs fully off that edge — no white strip.`
      case 'safe':
      case 'cut':
        return `- ${issue.message} Move or shrink it so it sits comfortably inside the safe area described below.`
      case 'fold':
        return `- ${issue.message} Move it so it sits entirely within one panel, clear of the fold.`
      case 'spelling':
        return `- ${issue.message}`
      default:
        return `- ${issue.message}`
    }
  })
  return [
    `Image 1 is a print design (${describeProduct(spec)}) that failed a print check. Fix these problems:`,
    ...asks,
    'Change as little as possible otherwise: keep the same design, words, imagery, logo and colours.',
    '',
    ...printRules(spec, frame, false).slice(1),
  ].join('\n')
}

export function buildUpscalePrompt(spec: PrintSpec): string {
  return [
    `Image 1 is a finished print design (${describeProduct(spec)}).`,
    'Reproduce it exactly at higher resolution for print: identical layout, wording, spelling, logo, colours and imagery, with sharper type, cleaner edges and finer photographic detail.',
    'Change nothing else. Do not add, remove, move or restyle anything.',
  ].join('\n')
}

/** Brief for the copywriter that runs before the first draw of a page. */
export function buildCopyPrompt(options: {
  spec: PrintSpec
  pageIndex: number
  userPrompt: string
  kit: BrandKit | null
  brief: PrintBrief
  otherCopy: { label: string; copy: PageCopy }[]
  assetNotes: string[]
}): string {
  const { spec, pageIndex, userPrompt, kit, brief, otherCopy, assetNotes } = options
  const page = spec.pages[pageIndex]
  const d = kit && brief.useDetails ? kit.details : {}
  const facts = [
    d.business && `Business: ${d.business}`,
    d.tagline && `Tagline: ${d.tagline}`,
    d.phone && `Phone: ${d.phone}`,
    d.email && `Email: ${d.email}`,
    d.website && `Website: ${d.website}`,
    d.address && `Address: ${d.address}`,
    d.other && `Other details: ${d.other}`,
    kit?.voice && `Tone and audience: ${kit.voice}`,
  ].filter(Boolean)

  const area = (spec.widthIn * spec.heightIn).toFixed(0)
  return [
    `You are the copywriter and art director for ${describeProduct(spec)}, ${area} square inches of paper${spec.folds ? ` folded into ${panelCount(spec)} panels` : ''}.`,
    spec.pages.length > 1 ? `Write page ${pageIndex + 1} of ${spec.pages.length}: the ${page.label}.` : '',
    page.hint ? `This page’s job: ${page.hint}` : '',
    `The request: ${userPrompt || '(none given — continue the piece sensibly from the other pages and the business details)'}`,
    facts.length ? `Facts you may use (use them verbatim, never alter a phone number, address or URL):\n${facts.join('\n')}` : 'No business details were given. Do not invent a phone number, address, email, URL or price — leave them out.',
    assetNotes.length ? `Supplied photos/graphics: ${assetNotes.join('; ')}` : '',
    otherCopy.length
      ? `Already written for the other pages (don’t repeat it; continue the same voice):\n${otherCopy.map((o) => `${o.label}: ${JSON.stringify(o.copy)}`).join('\n')}`
      : '',
    '',
    'Rules:',
    '- If the request quotes exact words, use them exactly.',
    `- Total printed words for this page: at most about ${wordBudget(spec)}. Fewer is better. Headline ≤ 8 words.`,
    '- Plain, confident, specific small-business copy. No clichés like "Look no further", no exclamation-mark spam, no emoji.',
    '- Never invent facts: no made-up prices, dates, phone numbers, addresses, awards or statistics. Only use what the request or the facts give.',
    '- `details` holds contact lines and small print, each one line.',
    '- `imagery` describes the photo or illustration to show (not printed). `layout` is a one-sentence composition note (not printed).',
    `- Leave a field out rather than pad it.${spec.folds ? ' For a folded piece, say in `layout` which panel gets what.' : ''}`,
    '',
    'Reply with JSON only: {"headline": string, "subhead"?: string, "body"?: string[], "cta"?: string, "details"?: string[], "imagery": string, "layout": string}',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Words the copy puts on paper, flattened, for the spelling check. */
export function printedWords(copy: PageCopy | undefined, kit?: BrandKit | null): string[] {
  if (!copy) return []
  const parts = [copy.headline, copy.subhead, ...(copy.body ?? []), copy.cta, ...(copy.details ?? [])]
  if (kit) {
    const d = kit.details
    parts.push(d.business, d.tagline, d.phone, d.email, d.website, d.address)
  }
  return parts.filter((p): p is string => !!p)
}

export function sheetInches(spec: PrintSpec): string {
  const b = bleedSize(spec)
  return `${b.w.toFixed(3)} × ${b.h.toFixed(3)} in`
}
