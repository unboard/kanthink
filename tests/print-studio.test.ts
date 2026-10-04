import { describe, expect, it } from 'vitest'
import { buildPrintPdf, jpegComponents } from '../lib/print/pdf'
import { extractPalette, normalizeHex } from '../lib/print/palette'
import { checkPlacement, checkSpelling, detectFrame, detectWhiteBorders, distanceField, rasterSampler, samplerFor } from '../lib/print/preflight'
import { buildCreatePrompt, printRules, wordBudget } from '../lib/print/prompts'
import {
  CATALOG,
  catalogProduct,
  centerCrop,
  foldPositions,
  nearestGeminiRatio,
  pieceDistance,
  planFrame,
  safeMarginsInFrame,
  safeRect,
  sheetRatio,
  validateSpec,
} from '../lib/print/spec'
import { DEFAULT_BRIEF, type PrintSpec } from '../lib/print/types'

const flyer = catalogProduct('flyer-letter')!.spec
const brochure = catalogProduct('brochure-trifold')!.spec
const doorHanger = catalogProduct('door-hanger')!.spec

describe('print geometry', () => {
  it('measures the sheet with bleed on every side', () => {
    expect(sheetRatio(flyer)).toBeCloseTo(8.75 / 11.25, 6)
    const safe = safeRect(flyer)
    expect(safe.x).toBeCloseTo(0.25 / 8.75, 6)
    expect(safe.w).toBeCloseTo(8.25 / 8.75, 6)
  })

  it('places folds on the trim, not the bleed sheet', () => {
    const [a, b] = foldPositions(brochure)
    expect(a).toBeCloseTo((0.125 + 11 / 3) / 11.25, 6)
    expect(b).toBeCloseTo((0.125 + 22 / 3) / 11.25, 6)
  })

  it('picks the nearest Gemini ratio symmetrically', () => {
    expect(nearestGeminiRatio(8.75 / 11.25)).toBe('4:5')
    expect(nearestGeminiRatio(11.25 / 8.75)).toBe('5:4')
    expect(nearestGeminiRatio(1)).toBe('1:1')
  })

  it('crops the centre of a frame to the target ratio', () => {
    const crop = centerCrop(0.8, 0.7778)
    expect(crop.h).toBe(1)
    expect(crop.w).toBeCloseTo(0.7778 / 0.8, 4)
    expect(crop.x).toBeCloseTo((1 - crop.w) / 2, 6)
  })

  it('plans print frames that reach 300 dpi where the model can', () => {
    const g = planFrame(flyer, 'google', 'print')
    expect(g.tier).toBe('4K')
    expect(g.dpi).toBeGreaterThanOrEqual(300)
    const card = planFrame(catalogProduct('business-card')!.spec, 'google', 'print')
    expect(card.tier).toBe('2K')
    const o = planFrame(flyer, 'openai', 'print')
    expect(o.width % 16).toBe(0)
    expect(o.height % 16).toBe(0)
    expect(Math.max(o.width, o.height)).toBeLessThanOrEqual(3840)
    expect(o.width / o.height).toBeCloseTo(sheetRatio(flyer), 2)
  })

  it('never states a safe margin looser than the real one', () => {
    for (const product of CATALOG) {
      for (const provider of ['google', 'openai'] as const) {
        const frame = planFrame(product.spec, provider, 'print')
        const m = safeMarginsInFrame(product.spec, frame)
        const safe = safeRect(product.spec)
        const realLeft = frame.sheet.x + safe.x * frame.sheet.w
        const realTop = frame.sheet.y + safe.y * frame.sheet.h
        expect(m.left / 100).toBeGreaterThanOrEqual(realLeft)
        expect(m.top / 100).toBeGreaterThanOrEqual(realTop)
      }
    }
  })

  it('measures distance to a die line, with the door hanger hole cut out', () => {
    // Middle of the hanger body: well inside.
    expect(pieceDistance(doorHanger, 0.125 + 2.125, 0.125 + 6)).toBeGreaterThan(1.5)
    // Centre of the hole: outside the piece.
    expect(pieceDistance(doorHanger, 0.125 + 2.125, 0.125 + 1.4)).toBeLessThan(0)
    // In the bleed: outside.
    expect(pieceDistance(flyer, 0.05, 5)).toBeLessThan(0)
    const circle = catalogProduct('sticker-circle')!.spec
    expect(pieceDistance(circle, 0.125 + 1.5, 0.125 + 1.5)).toBeCloseTo(1.5, 5)
    // A corner of the square trim is outside a circle.
    expect(pieceDistance(circle, 0.2, 0.2)).toBeLessThan(0)
  })

  it('validates specs from clients', () => {
    expect(validateSpec({ ...flyer, widthIn: -1 })).toBeNull()
    expect(validateSpec({ ...flyer, pages: [] })).toBeNull()
    const ok = validateSpec({ ...flyer, guide: { kind: 'image', url: 'javascript:alert(1)' } })
    expect(ok?.guide).toBeUndefined()
    expect(validateSpec(doorHanger)?.guide).toEqual(doorHanger.guide)
  })
})

describe('preflight', () => {
  it('flags text outside the safe area and past the trim', () => {
    const issues = checkPlacement(flyer, [
      { kind: 'text', text: 'Fine', box: [0.3, 0.3, 0.7, 0.35] },
      { kind: 'text', text: 'Too close', box: [0.012, 0.5, 0.6, 0.53] },
    ], samplerFor(flyer))
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('Too close')
  })

  it('flags text that crosses a fold', () => {
    const [f] = foldPositions(brochure)
    const issues = checkPlacement(brochure, [{ kind: 'text', text: 'Across', box: [f - 0.1, 0.4, f + 0.1, 0.45] }], samplerFor(brochure))
    expect(issues.some((i) => i.kind === 'fold' && i.severity === 'error')).toBe(true)
  })

  it('flags a logo over the door hanger hole', () => {
    const sheetW = 4.5
    const sheetH = 11.25
    const cx = (0.125 + 2.125) / sheetW
    const cy = (0.125 + 1.4) / sheetH
    const issues = checkPlacement(doorHanger, [{ kind: 'logo', box: [cx - 0.1, cy - 0.02, cx + 0.1, cy + 0.02] }], samplerFor(doorHanger))
    expect(issues.some((i) => i.kind === 'cut')).toBe(true)
  })

  it('reads raster guides through a distance field', () => {
    // A 100×100 sheet whose piece is the inner 60×60 square.
    const w = 100
    const inside = new Uint8Array(w * w)
    for (let y = 20; y < 80; y++) for (let x = 20; x < 80; x++) inside[y * w + x] = 1
    const field = distanceField(inside, w, w)
    expect(field[50 * w + 50]).toBeGreaterThan(25)
    expect(field[5 * w + 5]).toBeLessThan(0)
    const spec: PrintSpec = { ...flyer, widthIn: 9.75, heightIn: 9.75, guide: { kind: 'image', url: 'https://x/y.png' } }
    const sample = rasterSampler(spec, field, w, w)
    expect(sample(5, 5)).toBeGreaterThan(2)
  })

  it('catches a white frame but not a white design', () => {
    const w = 100
    const h = 128
    const make = (fill: (x: number, y: number) => number) => {
      const px = new Uint8Array(w * h * 3)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.fill(fill(x, y), (y * w + x) * 3, (y * w + x) * 3 + 3)
      return px
    }
    const framed = make((x, y) => (x < 4 || y < 4 || x >= w - 4 || y >= h - 4 ? 255 : 40))
    expect(detectWhiteBorders(flyer, framed, w, h, 3)).toHaveLength(1)
    const allWhite = make(() => 255)
    expect(detectWhiteBorders(flyer, allWhite, w, h, 3)).toHaveLength(0)
    const fullBleed = make(() => 40)
    expect(detectWhiteBorders(flyer, fullBleed, w, h, 3)).toHaveLength(0)
  })

  it('catches a coloured frame and reports its colour for trimming', () => {
    const w = 100
    const h = 128
    const px = new Uint8Array(w * h * 3)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const edge = x < 3 || y < 3 || x >= w - 3 || y >= h - 3
        px.set(edge ? [246, 232, 170] : [120, 50, 20], (y * w + x) * 3)
      }
    }
    const { issues, color } = detectFrame(flyer, px, w, h, 3)
    expect(issues[0].message).toContain('plain border')
    expect(color).toEqual([246, 232, 170])
  })

  it('spots near-miss spellings and wrong phone numbers only', () => {
    const planned = ['Hearth Bakehouse Grand Opening', '(614) 555-0148']
    const issues = checkSpelling(['Hearth Bakehose Grand Opening', 'Call (614) 555-0184', 'Fresh bread'], planned)
    expect(issues.map((i) => i.id).sort()).toEqual(['digits-6145550184', 'spell-bakehose'])
  })
})

describe('prompts', () => {
  it('states the bleed and safe rules in the model frame', () => {
    const frame = planFrame(flyer, 'google', 'print')
    const rules = printRules(flyer, frame, true).join('\n')
    expect(rules).toMatch(/run all the way to every edge/)
    expect(rules).toMatch(/Never leave a white/)
    expect(rules).toMatch(/\d+% of the image width from the left edge/)
  })

  it('describes folds and die-cuts', () => {
    expect(printRules(brochure, planFrame(brochure, 'google', 'print'), true).join('\n')).toMatch(/folds into 3 panels/)
    expect(printRules(doorHanger, planFrame(doorHanger, 'google', 'print'), true).join('\n')).toMatch(/doorknob/)
  })

  it('tells the model to place the logo exactly as supplied', () => {
    const frame = planFrame(flyer, 'google', 'print')
    const prompt = buildCreatePrompt({
      spec: flyer,
      pageIndex: 0,
      frame,
      refs: [{ role: 'canvas', url: '' }, { role: 'logo', url: 'x' }],
      kit: null,
      brief: DEFAULT_BRIEF,
      userPrompt: 'Bake sale',
      copy: { headline: 'Bake sale Saturday' },
    })
    expect(prompt).toContain('Image 2 is the business’s logo')
    expect(prompt).toContain('Headline: Bake sale Saturday')
  })

  it('gives small pieces small word budgets', () => {
    expect(wordBudget(catalogProduct('business-card')!.spec)).toBeLessThan(wordBudget(flyer))
  })
})

describe('pdf', () => {
  // A minimal baseline JPEG header: SOI, SOF0 (8-bit, 2×2, 3 components), EOI.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x02, 0x03, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9])

  it('reads the colour components of a JPEG', () => {
    expect(jpegComponents(jpeg)).toBe(3)
  })

  it('writes trim and bleed boxes for every page', () => {
    const pdf = new TextDecoder('latin1').decode(buildPrintPdf(flyer, [{ jpeg, width: 2, height: 2 }, { jpeg, width: 2, height: 2 }]))
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf).toContain('/Count 2')
    expect(pdf).toContain('/MediaBox [0 0 630 810]')
    expect(pdf).toContain('/TrimBox [9 9 621 801]')
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true)
    // The xref offset points at the xref table.
    const at = Number(/startxref\n(\d+)/.exec(pdf)![1])
    expect(pdf.slice(at, at + 4)).toBe('xref')
  })

  it('adds a slug for crop marks', () => {
    const pdf = new TextDecoder('latin1').decode(buildPrintPdf(flyer, [{ jpeg, width: 2, height: 2 }], { cropMarks: true }))
    expect(pdf).toContain('/MediaBox [0 0 684 864]')
    expect(pdf).toContain(' l S')
  })
})

describe('palette', () => {
  it('finds the real colours and skips the white ground', () => {
    const px = new Uint8Array(100 * 4)
    for (let i = 0; i < 100; i++) {
      const c = i < 50 ? [255, 255, 255, 255] : i < 80 ? [194, 65, 12, 255] : [124, 45, 18, 255]
      px.set(c, i * 4)
    }
    const palette = extractPalette(px, 4)
    expect(palette[0]).toBe('#C2410C')
    expect(palette).toContain('#7C2D12')
    expect(palette).not.toContain('#FFFFFF')
  })

  it('normalizes hex', () => {
    expect(normalizeHex('#abc')).toBe('#AABBCC')
    expect(normalizeHex('nope')).toBeNull()
  })
})
