import { describe, expect, it } from 'vitest'
import { asymmetry, cropToBleed, snapColor, snapFolds, traceDieLine } from '../lib/print/dieline'

/** A white sheet to draw template lines on. */
function sheet(width: number, height: number) {
  const data = new Uint8Array(width * height * 4).fill(255)
  const dot = (x: number, y: number, [r, g, b]: number[]) => {
    const p = (y * width + x) * 4
    data[p] = r
    data[p + 1] = g
    data[p + 2] = b
  }
  /** A closed polygon outline, axis-aligned edges only. */
  const outline = (pts: [number, number][], color: number[]) => {
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i]
      const [bx, by] = pts[(i + 1) % pts.length]
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) dot(x, y, color)
    }
  }
  const box = (x0: number, y0: number, x1: number, y1: number, color: number[]) => outline([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], color)
  return { data, width, height, outline, box }
}

const BLACK = [0, 0, 0]
const RED = [230, 30, 40]
const BLUE = [20, 120, 255]

function template() {
  const s = sheet(220, 160)
  s.box(5, 5, 214, 154, RED) // bleed line: closed, but not the cut color
  // The piece: a rectangle with a tab sticking out on the right.
  s.outline([[20, 20], [180, 20], [180, 60], [200, 60], [200, 100], [180, 100], [180, 140], [20, 140]], BLACK)
  s.box(30, 30, 170, 130, BLUE) // safe line
  s.box(90, 70, 110, 90, BLACK) // a slot cut out of the piece
  s.box(40, 40, 43, 43, BLACK) // a letter's counter in the cut color
  // A letter "O" out in the slug, also in the cut color.
  s.box(8, 145, 11, 148, BLACK)
  return s
}

describe('die line tracing', () => {
  it('finds the piece, its tab and its slot, and ignores other lines and lettering', () => {
    const s = template()
    const t = traceDieLine({ data: s.data, width: s.width, height: s.height, color: '#000000' })!
    expect(t).not.toBeNull()
    const at = (x: number, y: number) => t.inside[y * s.width + x]
    expect(at(60, 80)).toBe(1) // the body
    expect(at(25, 25)).toBe(1) // between the cut line and the safe line
    expect(at(190, 80)).toBe(1) // the tab
    expect(at(100, 80)).toBe(0) // the slot
    expect(at(41, 41)).toBe(1) // a letter's counter is not a hole
    expect(at(12, 12)).toBe(0) // between bleed line and cut line
    expect(at(190, 30)).toBe(0) // beside the tab
    expect(t.holes).toBe(1)
    expect(t.box).toEqual({ x: 20, y: 20, w: 181, h: 121 })
  })

  it('sees a one-sided tab as asymmetric', () => {
    const s = template()
    const t = traceDieLine({ data: s.data, width: s.width, height: s.height, color: '#000000' })!
    expect(asymmetry(t)).toBeGreaterThan(0.01)
  })

  it('traces a colored cut line among black ones', () => {
    const s = sheet(200, 200)
    s.box(10, 10, 189, 189, BLACK)
    s.outline([[40, 40], [160, 40], [160, 160], [40, 160]], [236, 0, 140])
    const t = traceDieLine({ data: s.data, width: s.width, height: s.height, color: '#ec008c' })!
    expect(t.box).toEqual({ x: 40, y: 40, w: 121, h: 121 })
  })

  it('snaps a roughly named color to the one actually drawn', () => {
    const s = sheet(200, 200)
    s.box(10, 10, 189, 189, RED)
    s.outline([[40, 40], [160, 40], [160, 160], [40, 160]], [236, 0, 140])
    const color = snapColor(s.data, s.width, s.height, '#ff00ff')
    expect(color).toBe('#ec008c')
    expect(traceDieLine({ data: s.data, width: s.width, height: s.height, color })!.box.w).toBe(121)
    // Nothing drawn near the hint: the hint stands.
    expect(snapColor(s.data, s.width, s.height, '#00ff00')).toBe('#00ff00')
  })

  it('moves a roughly placed fold onto the dashed line drawn nearby', () => {
    const s = sheet(400, 200)
    s.box(0, 0, 399, 199, BLACK)
    for (let y = 0; y < 200; y += 10) s.outline([[200, y], [200, Math.min(199, y + 5)]], [22, 163, 74]) // dashed fold
    s.box(150, 90, 170, 100, BLACK) // lettering nearby
    const box = { x: 0, y: 0, w: 400, h: 200 }
    const [snapped, lonely] = snapFolds(s.data, s.width, s.height, box, 'vertical', [180, 330])
    expect(snapped).toBeCloseTo(200, 0)
    expect(lonely).toBe(330) // nothing drawn near it: the hint stands
  })

  it('snaps to the nearest line, not a stronger safe line running alongside', () => {
    const s = sheet(400, 200)
    for (let y = 0; y < 200; y += 10) s.outline([[200, y], [200, Math.min(199, y + 5)]], [22, 163, 74]) // fold
    s.outline([[214, 0], [214, 199]], BLUE) // a solid safe line, more ink than the dashes
    const box = { x: 0, y: 0, w: 400, h: 200 }
    expect(snapFolds(s.data, s.width, s.height, box, 'vertical', [204])[0]).toBeCloseTo(200, 0)
    expect(snapFolds(s.data, s.width, s.height, box, 'vertical', [211])[0]).toBeCloseTo(214, 0)
  })

  it('gives up when the line never closes', () => {
    const s = sheet(120, 120)
    s.outline([[20, 20], [100, 20]], BLACK)
    expect(traceDieLine({ data: s.data, width: s.width, height: s.height, color: '#000000' })).toBeNull()
  })

  it('crops to the bleed sheet, black past the template edge', () => {
    const s = template()
    const t = traceDieLine({ data: s.data, width: s.width, height: s.height, color: '#000000' })!
    const c = cropToBleed(t, 25)
    expect([c.width, c.height]).toEqual([231, 171])
    expect(c.mask[0]).toBe(0)
    expect(c.mask[(25 + 60) * c.width + 25 + 40]).toBe(255)
  })
})
