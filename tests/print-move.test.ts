import { describe, expect, it } from 'vitest'
import { matteAlpha, refineMatte, resolveMove, unmix } from '@/lib/print/move'
import type { Mark } from '@/lib/print/markup'
import type { PreflightElement } from '@/lib/print/types'

const mark = (n: number, kind: Mark['kind'], pts: [number, number][]): Mark => ({ id: `m${n}`, n, kind, pts: [pts], note: '', status: 'open', at: 0 })
const title: PreflightElement = { kind: 'text', text: 'BOARD HEADQUARTERS', box: [0.04, 0.39, 0.97, 0.6] }
const sub: PreflightElement = { kind: 'text', text: 'SECOND LINE', box: [0.3, 0.6, 0.7, 0.68] }

describe('exact moves', () => {
  it('centers a group vertically in a box and keeps it where it is across', () => {
    const box = mark(2, 'rect', [[0.03, 0.37], [0.97, 0.81]])
    const r = resolveMove({ marks: [2], elements: [0], place: 'center_y_in_mark' }, [title], [box])!
    expect((r.to.y0 + r.to.y1) / 2).toBeCloseTo(0.59, 5)
    expect(r.to.x0).toBeCloseTo(0.04, 5)
    expect(r.to.y1 - r.to.y0).toBeCloseTo(0.21, 5)
  })

  it('moves every line of a group together', () => {
    const box = mark(1, 'rect', [[0, 0.5], [1, 1]])
    const r = resolveMove({ marks: [1], elements: [0, 1], place: 'center_in_mark' }, [title, sub], [box])!
    expect(r.from.y0).toBeCloseTo(0.39, 5)
    expect(r.from.y1).toBeCloseTo(0.68, 5)
    expect((r.to.y0 + r.to.y1) / 2).toBeCloseTo(0.75, 5)
    expect((r.to.x0 + r.to.x1) / 2).toBeCloseTo(0.5, 5)
  })

  it('takes an arrow’s head as the destination', () => {
    const arrow = mark(2, 'arrow', [[0.5, 0.5], [0.5, 0.8]])
    const r = resolveMove({ marks: [2], elements: [1], place: 'to_arrow_head' }, [title, sub], [arrow])!
    expect((r.to.y0 + r.to.y1) / 2).toBeCloseTo(0.8, 5)
  })

  it('never puts a group off the sheet', () => {
    const r = resolveMove({ marks: [1], elements: [0], place: 'point', x: 0.5, y: 0.99 }, [title], [mark(1, 'arrow', [[0.5, 0.5], [0.5, 1]])])!
    expect(r.to.y1).toBeLessThanOrEqual(1)
  })

  it('drops a move that goes nowhere, and one with no elements', () => {
    expect(resolveMove({ marks: [1], elements: [0], place: 'point', x: 0.505, y: 0.495 }, [title], [])).toBeNull()
    expect(resolveMove({ marks: [1], elements: [9], place: 'center_in_mark' }, [title], [])).toBeNull()
  })

  it('scales about the destination center when asked', () => {
    const box = mark(1, 'rect', [[0, 0], [1, 1]])
    const r = resolveMove({ marks: [1], elements: [1], place: 'center_in_mark', scale: 1.5 }, [title, sub], [box])!
    expect(r.to.x1 - r.to.x0).toBeCloseTo(0.6, 5)
  })
})

describe('the matte', () => {
  it('ignores small differences and keeps big ones', () => {
    expect(matteAlpha(10)).toBe(0)
    expect(matteAlpha(200)).toBe(1)
    const mid = matteAlpha(47)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })

  it('takes the old background back out of an edge pixel', () => {
    // Half-covered white text on black reads as 128; the text itself is white.
    expect(unmix(128, 0, 0.5)).toBe(255)
    expect(unmix(128, 0, 1)).toBe(128)
  })

  it('fills pinholes, keeps counters, and fades stray texture outside the element', () => {
    const w = 40
    const h = 20
    const a = new Float32Array(w * h)
    // A solid block (the element) from x 5–34, y 5–14 ...
    for (let y = 5; y < 15; y++) for (let x = 5; x < 35; x++) a[y * w + x] = 1
    // ... with a one-pixel pinhole and a large counter.
    a[7 * w + 8] = 0
    for (let y = 7; y < 13; y++) for (let x = 15; x < 25; x++) a[y * w + x] = 0
    // Stray texture far outside the measured box.
    a[1 * w + 1] = 1
    refineMatte(a, w, h, { x0: 5, y0: 5, x1: 34, y1: 14 }, 3, 4)
    expect(a[7 * w + 8]).toBe(1)
    expect(a[9 * w + 20]).toBe(0)
    expect(a[1 * w + 1]).toBe(0)
  })
})
