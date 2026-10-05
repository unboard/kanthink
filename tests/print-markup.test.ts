import { describe, expect, it } from 'vitest'
import { badgeAt, bounds, cleanMarks, fitMark, joinsLast, markPath, markupSvg, moveMark, nextNumber, placeWords, simplify, type Mark } from '../lib/print/markup'
import { buildMarkupPrompt } from '../lib/print/prompts'
import { catalogProduct, planFrame } from '../lib/print/spec'

const mark = (over: Partial<Mark>): Mark => ({ id: 'm', n: 1, kind: 'rect', pts: [[[0.2, 0.2], [0.4, 0.5]]], note: '', status: 'open', at: 0, ...over })

describe('markup geometry', () => {
  it('moves and resizes a mark by its bounding box', () => {
    const m = mark({})
    expect(bounds(moveMark(m, 0.1, 0.1))).toEqual({ x0: 0.30000000000000004, y0: 0.30000000000000004, x1: 0.5, y1: 0.6 })
    const b = bounds(fitMark(m, { x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.7 }))
    expect(b.x0).toBeCloseTo(0.1)
    expect(b.x1).toBeCloseTo(0.5)
    expect(b.y1).toBeCloseTo(0.7)
  })

  it('joins quick nearby strokes into one freehand mark, and nothing else', () => {
    const shaft = mark({ kind: 'draw', pts: [[[0.2, 0.5], [0.6, 0.5]]] })
    const head = simplify([[0.58, 0.47], [0.6, 0.5], [0.58, 0.53]])
    expect(joinsLast(shaft, 1000, head, 1500)).toBe(true)
    // Too late, too far, or not a drawing: a new mark.
    expect(joinsLast(shaft, 1000, head, 3000)).toBe(false)
    expect(joinsLast(shaft, 1000, [[0.95, 0.95]], 1200)).toBe(false)
    expect(joinsLast(mark({}), 1000, head, 1200)).toBe(false)
  })

  it('numbers marks without reusing a number still in use', () => {
    expect(nextNumber([])).toBe(1)
    expect(nextNumber([{ n: 1 }, { n: 4 }])).toBe(5)
  })

  it('puts an arrow’s number at its tail and says where it points', () => {
    const arrow = mark({ kind: 'arrow', pts: [[[0.1, 0.8], [0.8, 0.2]]] })
    expect(badgeAt(arrow)).toEqual([0.1, 0.8])
    expect(placeWords(arrow)).toBe('from the lower left toward the upper right')
    expect(markPath(arrow, 1000, 500)).toMatch(/^M100\.0 400\.0L800\.0 100\.0M/)
  })

  it('draws every mark with its number for the model', () => {
    const svg = markupSvg([mark({ n: 3 }), mark({ id: 'b', n: 7, kind: 'ellipse' })], 1200, 600)
    expect(svg).toContain('>3</text>')
    expect(svg).toContain('>7</text>')
    expect(svg).toContain('width="1200"')
  })

  it('keeps only well-formed marks from a client', () => {
    const clean = cleanMarks([
      mark({ note: 'move the phone here' }),
      { id: 'x', kind: 'laser', pts: [[[0, 0], [1, 1]]] },
      { id: 'y', kind: 'arrow', pts: [[[0, 0]]] },
      { id: 'z', kind: 'draw', pts: [[[0.1, 'a'], [9, -9]]], n: 2 },
    ])
    expect(clean.map((m) => m.id)).toEqual(['m', 'z'])
    expect(clean[0].note).toBe('move the phone here')
    // Off-page points are pulled back to just past the edge.
    expect(clean[1].pts[0][0]).toEqual([1.05, -0.05])
  })
})

describe('markup prompt', () => {
  it('lists each mark by number with its note, guarded, and asks for no markup in the result', () => {
    const spec = catalogProduct('flyer-letter')!.spec
    const prompt = buildMarkupPrompt(
      spec,
      planFrame(spec, 'openai', 'print'),
      [mark({ n: 2, kind: 'arrow', pts: [[[0.2, 0.8], [0.7, 0.2]]], note: 'move the phone number up here' }), mark({ n: 1, note: '' })],
      'warmer colors',
      [{ role: 'current', url: '' }, { role: 'marked', url: '' }],
      ['614-300-0458'],
    )
    expect(prompt.indexOf('Mark 1')).toBeLessThan(prompt.indexOf('Mark 2'))
    expect(prompt).toContain('Mark 2 (arrow from the lower left toward the upper right): move the phone number up here')
    expect(prompt).toContain('Mark 1 (box in the middle left): no note')
    expect(prompt).toContain('Also: warmer colors')
    expect(prompt).toContain('“614-300-0458”')
    expect(prompt).toContain('no pink marks, numbers')
    expect(prompt.indexOf('Preserve all details')).toBeLessThan(prompt.indexOf('Mark 1'))
  })
})
