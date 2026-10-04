/**
 * Print geometry: the catalog, trim/bleed/safe arithmetic, die-cut shapes, and the
 * fit between a print ratio and the frames image models can actually produce.
 *
 * Pure functions only. The server uses this to brief the model, crop the result and
 * preflight it; the studio uses the same functions to draw guides and quote DPI.
 */

import type { GuideShape, PrintSpec, Unit } from './types'

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export interface CatalogProduct {
  key: string
  name: string
  group: 'Marketing' | 'Mail' | 'Cards' | 'Signs' | 'Die-cut'
  blurb: string
  spec: PrintSpec
  /** Page counts the person may choose at the start, when more than one makes sense. */
  pageOptions?: number[]
  /** Labels for each page count, when the default ones don't fit. */
  sampleIdeas: string[]
}

const BLEED = 0.125
const SAFE = 0.125

const POSTCARD_BACK_HINT =
  'Mailing side. Keep the right half of this side as a clean, light, unpatterned area for the recipient address and postage — at least 4 in wide and 2.5 in tall, touching nothing but background. Put the message, offer and return details on the left half.'

export const CATALOG: CatalogProduct[] = [
  {
    key: 'flyer-letter',
    name: 'Flyer',
    group: 'Marketing',
    blurb: '8.5 × 11 in',
    pageOptions: [1, 2],
    sampleIdeas: [
      'Grand opening flyer for a neighborhood bakery — free cookie with any coffee this Saturday',
      'Spring clean-up special for a lawn care company, 15% off for new customers',
      'Open house this Sunday 1–4pm for a 3-bed craftsman, warm and inviting',
    ],
    spec: {
      id: 'flyer-letter', name: 'Flyer', kind: 'flyer',
      widthIn: 8.5, heightIn: 11, bleedIn: BLEED, safeIn: SAFE,
      pages: [
        { label: 'Front', hint: 'The main side. One clear message that reads from across a room: headline, a strong image, the offer, and how to respond.' },
        { label: 'Back', hint: 'Supporting detail: services or menu, a short story, testimonials, and full contact details. Same design family as the front.' },
      ],
    },
  },
  {
    key: 'brochure-trifold',
    name: 'Tri-fold brochure',
    group: 'Marketing',
    blurb: '11 × 8.5 in · folds to 3.67 × 8.5',
    sampleIdeas: [
      'Services brochure for a family dental practice, calm and trustworthy',
      'Brochure for a dog grooming salon: services, prices, and booking',
      'Wedding venue brochure, elegant and photo-led',
    ],
    spec: {
      id: 'brochure-trifold', name: 'Tri-fold brochure', kind: 'letter-fold (tri-fold) brochure',
      widthIn: 11, heightIn: 8.5, bleedIn: BLEED, safeIn: SAFE,
      folds: { direction: 'vertical', at: [1 / 3, 2 / 3] },
      pages: [
        { label: 'Outside', hint: 'Outside of a tri-fold, three panels left to right: (1) the inside flap — a teaser, offer or testimonial; (2) the back cover — contact details, address, hours, map or website; (3) the front cover — logo, headline and a hero image. The right panel is what people see first.' },
        { label: 'Inside', hint: 'Inside of a tri-fold, three panels read left to right: the main story, services or products in detail, and a closing call to action. Each panel is its own column.' },
      ],
    },
  },
  {
    key: 'postcard-6x4',
    name: 'Postcard',
    group: 'Mail',
    blurb: '6 × 4 in',
    sampleIdeas: [
      'Just listed postcard for a realtor, modern home exterior',
      'We miss you! 20% off your next visit, for a hair salon',
      'Thank-you postcard for a landscaping company’s customers',
    ],
    spec: {
      id: 'postcard-6x4', name: 'Postcard', kind: 'mailing postcard',
      widthIn: 6, heightIn: 4, bleedIn: BLEED, safeIn: SAFE,
      pages: [
        { label: 'Front', hint: 'The picture side. Bold image, short headline, logo. Readable at arm’s length in a mailbox.' },
        { label: 'Back', hint: POSTCARD_BACK_HINT },
      ],
    },
  },
  {
    key: 'postcard-9x6',
    name: 'Jumbo postcard',
    group: 'Mail',
    blurb: '9 × 6 in',
    sampleIdeas: [
      'Every-door direct mail for a pizza shop with a coupon',
      'HVAC tune-up special before summer, $79',
    ],
    spec: {
      id: 'postcard-9x6', name: 'Jumbo postcard', kind: 'jumbo mailing postcard',
      widthIn: 9, heightIn: 6, bleedIn: BLEED, safeIn: SAFE,
      pages: [
        { label: 'Front', hint: 'The picture side. Bold image, big offer, logo.' },
        { label: 'Back', hint: POSTCARD_BACK_HINT },
      ],
    },
  },
  {
    key: 'business-card',
    name: 'Business card',
    group: 'Cards',
    blurb: '3.5 × 2 in',
    pageOptions: [1, 2],
    sampleIdeas: [
      'Business card for an independent electrician, bold and clean',
      'Minimal business card for a yoga instructor',
    ],
    spec: {
      id: 'business-card', name: 'Business card', kind: 'business card',
      widthIn: 3.5, heightIn: 2, bleedIn: BLEED, safeIn: SAFE,
      pages: [
        { label: 'Front', hint: 'Name, title, phone, email, website. Small type must stay legible: nothing smaller than about 7pt.' },
        { label: 'Back', hint: 'Logo-led and simple: the logo, a tagline, or a pattern in brand colours.' },
      ],
    },
  },
  {
    key: 'rack-card',
    name: 'Rack card',
    group: 'Cards',
    blurb: '4 × 9 in',
    sampleIdeas: ['Rack card for a kayak rental at a lake, summer hours and prices'],
    spec: {
      id: 'rack-card', name: 'Rack card', kind: 'rack card',
      widthIn: 4, heightIn: 9, bleedIn: BLEED, safeIn: SAFE,
      pages: [
        { label: 'Front', hint: 'The top third is all that shows in a display rack: put the logo and headline there.' },
        { label: 'Back', hint: 'Details, prices, hours, map or contact information.' },
      ],
    },
  },
  {
    key: 'door-hanger',
    name: 'Door hanger',
    group: 'Die-cut',
    blurb: '4.25 × 11 in · die-cut',
    sampleIdeas: [
      'Door hanger for a window cleaning company: “Your neighbors chose us”',
      'Pest control door hanger with a spring discount',
    ],
    spec: {
      id: 'door-hanger', name: 'Door hanger', kind: 'die-cut door hanger',
      widthIn: 4.25, heightIn: 11, bleedIn: BLEED, safeIn: SAFE,
      guide: { kind: 'doorhanger', holeDiameterIn: 1.5, holeCenterFromTopIn: 1.4, cornerIn: 0.5 },
      pages: [
        { label: 'Front', hint: 'Hangs on a doorknob. Logo and headline just below the hole, then the offer and a clear call to action.' },
        { label: 'Back', hint: 'Details, services, and contact information, below the hole.' },
      ],
    },
  },
  {
    key: 'sticker-circle',
    name: 'Round sticker',
    group: 'Die-cut',
    blurb: '3 in circle',
    sampleIdeas: ['Round sticker for a coffee roaster, vintage badge style'],
    spec: {
      id: 'sticker-circle', name: 'Round sticker', kind: 'die-cut round sticker',
      widthIn: 3, heightIn: 3, bleedIn: BLEED, safeIn: SAFE,
      guide: { kind: 'circle' },
      pages: [{ label: 'Sticker', hint: 'A badge that fills the circle. Logo or short phrase, centered.' }],
    },
  },
  {
    key: 'poster-18x24',
    name: 'Poster',
    group: 'Signs',
    blurb: '18 × 24 in',
    sampleIdeas: ['Summer concert series poster for a city park', 'Farmers market poster, every Saturday 8–1'],
    spec: {
      id: 'poster-18x24', name: 'Poster', kind: 'poster',
      widthIn: 18, heightIn: 24, bleedIn: BLEED, safeIn: 0.375,
      pages: [{ label: 'Poster', hint: 'Seen from a distance: one huge headline, one image, the essentials.' }],
    },
  },
  {
    key: 'yard-sign',
    name: 'Yard sign',
    group: 'Signs',
    blurb: '24 × 18 in',
    sampleIdeas: ['Yard sign for a roofing company: “Another roof by…” with phone number'],
    spec: {
      id: 'yard-sign', name: 'Yard sign', kind: 'yard sign',
      widthIn: 24, heightIn: 18, bleedIn: BLEED, safeIn: 0.75,
      pages: [{ label: 'Sign', hint: 'Read from a moving car: at most seven words plus a phone number, huge and high-contrast.' }],
    },
  },
]

export function catalogProduct(key: string): CatalogProduct | undefined {
  return CATALOG.find((p) => p.key === key)
}

/** A catalog spec with a chosen page count. Labels fall back to "Page n". */
export function specWithPageCount(spec: PrintSpec, count: number): PrintSpec {
  const n = Math.max(1, Math.min(12, Math.round(count)))
  const pages = Array.from({ length: n }, (_, i) => spec.pages[i] ?? { label: `Page ${i + 1}` })
  return { ...spec, pages }
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export const MM_PER_IN = 25.4

export function toUnit(inches: number, unit: Unit): number {
  return unit === 'mm' ? inches * MM_PER_IN : inches
}

export function fromUnit(value: number, unit: Unit): number {
  return unit === 'mm' ? value / MM_PER_IN : value
}

function trimNum(n: number, places: number): string {
  return String(Number(n.toFixed(places)))
}

export function formatLength(inches: number, unit: Unit = 'in'): string {
  return unit === 'mm' ? `${trimNum(inches * MM_PER_IN, 1)} mm` : `${trimNum(inches, 3)} in`
}

export function formatSize(spec: Pick<PrintSpec, 'widthIn' | 'heightIn' | 'unit'>): string {
  const unit = spec.unit ?? 'in'
  const w = toUnit(spec.widthIn, unit)
  const h = toUnit(spec.heightIn, unit)
  const places = unit === 'mm' ? 1 : 3
  return `${trimNum(w, places)} × ${trimNum(h, places)} ${unit}`
}

// ---------------------------------------------------------------------------
// Sheet geometry
// ---------------------------------------------------------------------------

/** A rectangle as fractions of some frame: x, y, w, h in 0..1. */
export interface FracRect {
  x: number
  y: number
  w: number
  h: number
}

export function bleedSize(spec: PrintSpec): { w: number; h: number } {
  return { w: spec.widthIn + 2 * spec.bleedIn, h: spec.heightIn + 2 * spec.bleedIn }
}

/** Width over height of the full sheet, bleed included. This is the page image's ratio. */
export function sheetRatio(spec: PrintSpec): number {
  const b = bleedSize(spec)
  return b.w / b.h
}

/** The trim line as fractions of the bleed sheet. */
export function trimRect(spec: PrintSpec): FracRect {
  const b = bleedSize(spec)
  return { x: spec.bleedIn / b.w, y: spec.bleedIn / b.h, w: spec.widthIn / b.w, h: spec.heightIn / b.h }
}

/** The safe area of a rectangular piece as fractions of the bleed sheet. */
export function safeRect(spec: PrintSpec): FracRect {
  const b = bleedSize(spec)
  const m = spec.bleedIn + spec.safeIn
  return { x: m / b.w, y: m / b.h, w: (b.w - 2 * m) / b.w, h: (b.h - 2 * m) / b.h }
}

/** Fold line positions as fractions of the bleed sheet along the fold axis. */
export function foldPositions(spec: PrintSpec): number[] {
  if (!spec.folds) return []
  const b = bleedSize(spec)
  const vertical = spec.folds.direction === 'vertical'
  const trimLen = vertical ? spec.widthIn : spec.heightIn
  const full = vertical ? b.w : b.h
  return spec.folds.at.map((f) => (spec.bleedIn + f * trimLen) / full)
}

/** Panels between folds, in inches of trim, for describing them. */
export function panelCount(spec: PrintSpec): number {
  return spec.folds ? spec.folds.at.length + 1 : 1
}

// ---------------------------------------------------------------------------
// Die-cut shapes as signed distance functions
// ---------------------------------------------------------------------------

/**
 * Signed distance to the cut line, in inches, at a point in sheet inches (origin at
 * the top-left of the bleed). Positive inside the finished piece, negative outside.
 *
 * Content is safe where the distance is at least `safeIn`. A rectangle is the trivial
 * shape, so plain products and die-cuts take exactly the same path through preflight.
 */
export function pieceDistance(spec: PrintSpec, x: number, y: number): number {
  const b = spec.bleedIn
  const W = spec.widthIn
  const H = spec.heightIn
  const px = x - b
  const py = y - b
  const g = spec.guide
  if (!g || g.kind === 'image') return rectDistance(px, py, W, H)

  if (g.kind === 'circle') {
    // An ellipse when the trim isn't square. Scaled-circle distance is close enough
    // for a margin check and exact for the circle it nearly always is.
    const rx = W / 2
    const ry = H / 2
    const nx = (px - rx) / rx
    const ny = (py - ry) / ry
    return (1 - Math.hypot(nx, ny)) * Math.min(rx, ry)
  }

  if (g.kind === 'rounded') {
    return roundedRectDistance(px, py, W, H, g.radiusIn)
  }

  // Door hanger: a rounded rectangle with a round hole for the doorknob.
  const body = roundedRectDistance(px, py, W, H, g.cornerIn)
  const r = g.holeDiameterIn / 2
  const hole = Math.hypot(px - W / 2, py - g.holeCenterFromTopIn) - r
  return Math.min(body, hole)
}

function rectDistance(px: number, py: number, W: number, H: number): number {
  const inside = Math.min(px, py, W - px, H - py)
  if (inside >= 0) return inside
  const dx = Math.max(-px, 0, px - W)
  const dy = Math.max(-py, 0, py - H)
  return -Math.hypot(dx, dy)
}

function roundedRectDistance(px: number, py: number, W: number, H: number, radius: number): number {
  const r = Math.max(0, Math.min(radius, W / 2, H / 2))
  // Standard rounded-box SDF, centred, sign flipped so inside is positive.
  const qx = Math.abs(px - W / 2) - (W / 2 - r)
  const qy = Math.abs(py - H / 2) - (H / 2 - r)
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  const inner = Math.min(Math.max(qx, qy), 0)
  return -(outside + inner - r)
}

/**
 * SVG path data for the cut line (inset 0) or the safe line (inset = safeIn), in sheet
 * inches. Uploaded guides have no vector path; they are drawn from the raster.
 */
export function shapePath(spec: PrintSpec, inset: number): string | null {
  const b = spec.bleedIn
  const W = spec.widthIn
  const H = spec.heightIn
  const g = spec.guide
  if (g?.kind === 'image') return null

  const rect = (x: number, y: number, w: number, h: number, r: number) => {
    if (w <= 0 || h <= 0) return ''
    const rr = Math.max(0, Math.min(r, w / 2, h / 2))
    if (rr === 0) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`
    return (
      `M${x + rr} ${y}H${x + w - rr}A${rr} ${rr} 0 0 1 ${x + w} ${y + rr}` +
      `V${y + h - rr}A${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}` +
      `H${x + rr}A${rr} ${rr} 0 0 1 ${x} ${y + h - rr}` +
      `V${y + rr}A${rr} ${rr} 0 0 1 ${x + rr} ${y}Z`
    )
  }
  const circle = (cx: number, cy: number, rx: number, ry: number) =>
    rx <= 0 || ry <= 0
      ? ''
      : `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`

  if (!g) return rect(b + inset, b + inset, W - 2 * inset, H - 2 * inset, 0)
  if (g.kind === 'circle') return circle(b + W / 2, b + H / 2, W / 2 - inset, H / 2 - inset)
  if (g.kind === 'rounded') return rect(b + inset, b + inset, W - 2 * inset, H - 2 * inset, g.radiusIn - inset)
  const outer = rect(b + inset, b + inset, W - 2 * inset, H - 2 * inset, g.cornerIn - inset)
  const r = g.holeDiameterIn / 2 + inset
  return `${outer}${circle(b + W / 2, b + g.holeCenterFromTopIn, r, r)}`
}

/** Human description of a guide for the prompt and the UI. */
export function guideLabel(guide: GuideShape | undefined): string | null {
  if (!guide) return null
  switch (guide.kind) {
    case 'circle': return 'Circle die-cut'
    case 'rounded': return `Rounded corners (${trimNum(guide.radiusIn, 3)} in)`
    case 'doorhanger': return 'Door hanger die-cut'
    case 'image': return guide.name ? `Custom guide · ${guide.name}` : 'Custom guide'
  }
}

// ---------------------------------------------------------------------------
// Model frames
// ---------------------------------------------------------------------------

export type ImageTier = '1K' | '2K' | '4K'

/** Aspect ratios Gemini's image models accept, as `w:h` labels. */
export const GEMINI_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', '1:4', '4:1'] as const

function ratioValue(label: string): number {
  const [w, h] = label.split(':').map(Number)
  return w / h
}

/** The supported ratio closest to a target, measured in log space so 2:1 and 1:2 are symmetric. */
export function nearestGeminiRatio(target: number): string {
  let best: string = GEMINI_RATIOS[0]
  let bestErr = Infinity
  for (const label of GEMINI_RATIOS) {
    const err = Math.abs(Math.log(ratioValue(label) / target))
    if (err < bestErr) {
      best = label
      bestErr = err
    }
  }
  return best
}

/** Approximate megapixels per Gemini tier, from measured outputs (3:4 at 4K is 3584×4800). */
const GEMINI_TIER_PIXELS: Record<ImageTier, number> = { '1K': 1.05e6, '2K': 4.2e6, '4K': 17.2e6 }

/** OpenAI's gpt-image sizes: multiples of 16, long edge to 3840, at most 3:1. */
const OPENAI_MAX_EDGE = 3840
const OPENAI_MAX_PIXELS = 3840 * 2160
const OPENAI_DRAFT_PIXELS = 1536 * 1024
const OPENAI_MAX_RATIO = 3

export interface Frame {
  provider: 'google' | 'openai'
  /** The frame's own ratio, width over height. */
  ratio: number
  /** Gemini only: the `aspectRatio` to request. */
  aspect?: string
  /** Gemini only: the `imageSize` to request. */
  tier?: ImageTier
  /** Expected output size. Exact for OpenAI, approximate for Gemini. */
  width: number
  height: number
  /** The sheet inside the frame, as fractions of it. Centred. */
  sheet: FracRect
  /** Effective resolution of the sheet at print size. */
  dpi: number
}

/** The centred region of a frame with ratio `frameRatio` that has ratio `targetRatio`. */
export function centerCrop(frameRatio: number, targetRatio: number): FracRect {
  if (frameRatio > targetRatio) {
    const w = targetRatio / frameRatio
    return { x: (1 - w) / 2, y: 0, w, h: 1 }
  }
  const h = frameRatio / targetRatio
  return { x: 0, y: (1 - h) / 2, w: 1, h }
}

function round16(n: number): number {
  return Math.max(16, Math.round(n / 16) * 16)
}

/**
 * Plan the frame a model will draw, for a sheet, at a quality.
 *
 * `print` picks the smallest frame that reaches 300 DPI at print size (or the largest
 * available when nothing does — big signs); `draft` is the cheap fast frame for
 * exploring. The sheet is always centred in the frame, so cropping the result is the
 * same centred crop whatever size actually comes back.
 */
export function planFrame(
  spec: PrintSpec,
  provider: 'google' | 'openai',
  quality: 'print' | 'draft',
  forceTier?: ImageTier,
): Frame {
  const target = sheetRatio(spec)
  const sheetIn = bleedSize(spec)

  if (provider === 'google') {
    const aspect = nearestGeminiRatio(target)
    const ratio = ratioValue(aspect)
    const sheet = centerCrop(ratio, target)
    const sizeFor = (tier: ImageTier) => {
      const px = GEMINI_TIER_PIXELS[tier]
      const width = Math.round(Math.sqrt(px * ratio))
      return { width, height: Math.round(width / ratio) }
    }
    const dpiFor = (tier: ImageTier) => (sizeFor(tier).width * sheet.w) / sheetIn.w
    let tier: ImageTier = forceTier ?? (quality === 'draft' ? '1K' : '4K')
    if (!forceTier && quality === 'print') {
      tier = (['1K', '2K', '4K'] as ImageTier[]).find((t) => dpiFor(t) >= 300) ?? '4K'
      // 1K text is soft even when the arithmetic says the DPI is there.
      if (tier === '1K') tier = '2K'
    }
    const { width, height } = sizeFor(tier)
    return { provider, ratio, aspect, tier, width, height, sheet, dpi: Math.round(dpiFor(tier)) }
  }

  const clamped = Math.min(OPENAI_MAX_RATIO, Math.max(1 / OPENAI_MAX_RATIO, target))
  const pixels = quality === 'draft' ? OPENAI_DRAFT_PIXELS : OPENAI_MAX_PIXELS
  let width = Math.sqrt(pixels * clamped)
  let height = width / clamped
  const over = Math.max(width, height) / OPENAI_MAX_EDGE
  if (over > 1) {
    width /= over
    height /= over
  }
  width = round16(Math.floor(width / 16) * 16 || 16)
  height = round16(Math.floor(height / 16) * 16 || 16)
  const ratio = width / height
  const sheet = centerCrop(ratio, target)
  return { provider, ratio, width, height, sheet, dpi: Math.round((width * sheet.w) / sheetIn.w) }
}

/** Effective DPI of a page image at its print size. */
export function effectiveDpi(spec: PrintSpec, pixelWidth: number): number {
  return Math.round(pixelWidth / bleedSize(spec).w)
}

/**
 * Margins of the sheet's safe area within a model frame, as whole percentages of the
 * frame, rounded outwards. This is what the prompt states, so it must never be looser
 * than the real safe area.
 */
export function safeMarginsInFrame(spec: PrintSpec, frame: Pick<Frame, 'sheet'>): {
  left: number
  right: number
  top: number
  bottom: number
} {
  const s = safeRect(spec)
  const f = frame.sheet
  const left = f.x + s.x * f.w
  const top = f.y + s.y * f.h
  const right = 1 - (f.x + (s.x + s.w) * f.w)
  const bottom = 1 - (f.y + (s.y + s.h) * f.h)
  const pct = (v: number) => Math.ceil(v * 100 + 0.5)
  return { left: pct(left), right: pct(right), top: pct(top), bottom: pct(bottom) }
}

/** Fold positions within a model frame, as percentages along the fold axis. */
export function foldsInFrame(spec: PrintSpec, frame: Pick<Frame, 'sheet'>): number[] {
  if (!spec.folds) return []
  const vertical = spec.folds.direction === 'vertical'
  const off = vertical ? frame.sheet.x : frame.sheet.y
  const len = vertical ? frame.sheet.w : frame.sheet.h
  return foldPositions(spec).map((p) => Math.round((off + p * len) * 1000) / 10)
}

/** A product that is not a plain rectangle. */
export function isShaped(spec: PrintSpec): boolean {
  return !!spec.guide
}

/** Basic sanity for a spec coming from a person or a client. */
export function validateSpec(input: unknown): PrintSpec | null {
  if (!input || typeof input !== 'object') return null
  const s = input as Partial<PrintSpec>
  const num = (v: unknown, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
  if (!num(s.widthIn, 0.5, 240) || !num(s.heightIn, 0.5, 240)) return null
  if (!num(s.bleedIn, 0, 2) || !num(s.safeIn, 0, 6)) return null
  if (!Array.isArray(s.pages) || s.pages.length < 1 || s.pages.length > 12) return null
  const pages = s.pages.map((p, i) => ({
    label: String(p?.label ?? `Page ${i + 1}`).slice(0, 40) || `Page ${i + 1}`,
    hint: p?.hint ? String(p.hint).slice(0, 600) : undefined,
  }))
  let guide: GuideShape | undefined
  const g = s.guide as GuideShape | undefined
  if (g) {
    if (g.kind === 'circle') guide = { kind: 'circle' }
    else if (g.kind === 'rounded' && num(g.radiusIn, 0, 12)) guide = { kind: 'rounded', radiusIn: g.radiusIn }
    else if (g.kind === 'doorhanger' && num(g.holeDiameterIn, 0.2, 6) && num(g.holeCenterFromTopIn, 0.2, 12) && num(g.cornerIn, 0, 6)) {
      guide = { kind: 'doorhanger', holeDiameterIn: g.holeDiameterIn, holeCenterFromTopIn: g.holeCenterFromTopIn, cornerIn: g.cornerIn }
    } else if (g.kind === 'image' && typeof g.url === 'string' && /^https:\/\//.test(g.url)) {
      guide = { kind: 'image', url: g.url, name: g.name ? String(g.name).slice(0, 80) : undefined }
    }
  }
  let folds: PrintSpec['folds']
  if (s.folds && Array.isArray(s.folds.at) && s.folds.at.every((f) => num(f, 0.01, 0.99))) {
    folds = { direction: s.folds.direction === 'horizontal' ? 'horizontal' : 'vertical', at: [...s.folds.at].sort((a, b) => a - b).slice(0, 6) }
  }
  return {
    id: String(s.id ?? 'custom').slice(0, 80),
    name: String(s.name ?? 'Custom size').slice(0, 80) || 'Custom size',
    kind: s.kind ? String(s.kind).slice(0, 80) : undefined,
    widthIn: s.widthIn!,
    heightIn: s.heightIn!,
    bleedIn: s.bleedIn!,
    safeIn: s.safeIn!,
    pages,
    folds,
    guide,
    unit: s.unit === 'mm' ? 'mm' : 'in',
  }
}
