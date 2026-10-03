import { describe, it, expect } from 'vitest'
import { buildSite, makeBoard } from '../app/mow/lawns'
import { Field, computePayout, analysePattern, DECK_WIDTH, RES } from '../app/mow/field'
import type { TemplateId } from '../app/mow/types'

const TEMPLATES: TemplateId[] = ['starter', 'corner', 'backyard', 'estate', 'field', 'office', 'wedge']

/** Drive the deck over a rectangle in boustrophedon stripes along X. */
function mowStripes(f: Field, x0: number, z0: number, x1: number, z1: number, width: number, opts: { alternate: boolean; axis: 'x' | 'z' }) {
  const out = { fresh: 0, overlap: 0, groupsDone: [] as number[] }
  let t = 0
  let lane = 0
  const across0 = opts.axis === 'x' ? z0 : x0
  const across1 = opts.axis === 'x' ? z1 : x1
  const along0 = opts.axis === 'x' ? x0 : z0
  const along1 = opts.axis === 'x' ? x1 : z1
  for (let c = across0 + width / 2; c < across1 + width / 2; c += width) {
    const forward = !opts.alternate || lane % 2 === 0
    const heading = opts.axis === 'x' ? (forward ? 0 : Math.PI) : (forward ? Math.PI / 2 : -Math.PI / 2)
    for (let s = 0; s <= 1; s += 0.004) {
      const a = forward ? along0 + (along1 - along0) * s : along1 - (along1 - along0) * s
      const x = opts.axis === 'x' ? a : c
      const z = opts.axis === 'x' ? c : a
      f.deck(x, z, heading, 0.3, DECK_WIDTH / 2, 4, t, out)
      t += 0.02
    }
    t += 2
    lane++
  }
  return out
}

describe('Clean Cut lawns', () => {
  it('every template builds a field with real grass to cut', () => {
    for (const tpl of TEMPLATES) {
      const site = buildSite(tpl, 1234)
      const f = new Field(site)
      expect(f.stats.grass, tpl).toBeGreaterThan(100 * RES * RES)
      expect(f.stats.edgeTotal, tpl).toBeGreaterThan(0)
      expect(f.groups.length, tpl).toBeGreaterThan(0)
    }
  })

  it('a daily board is deterministic and priced by size', () => {
    const a = makeBoard(20261003)
    const b = makeBoard(20261003)
    expect(a.jobs.map((j) => j.pay)).toEqual(b.jobs.map((j) => j.pay))
    expect(a.jobs).toHaveLength(7)
    const starter = a.jobs.find((j) => j.template === 'starter')!
    const big = a.jobs.find((j) => j.template === 'estate' || j.template === 'field')!
    expect(big.pay).toBeGreaterThan(starter.pay * 2.5)
  })
})

describe('Clean Cut scoring', () => {
  it('clean alternating stripes score as stripes with high efficiency', () => {
    const site = buildSite('field', 7)
    const f = new Field(site)
    const b = site.bounds
    mowStripes(f, b.x0, b.z0, b.x1, b.z1, DECK_WIDTH * 0.92, { alternate: true, axis: 'x' })
    expect(f.coverage).toBeGreaterThan(0.97)
    expect(f.efficiency).toBeGreaterThan(0.85)
    const p = analysePattern(f)
    expect(p.kind).toBe('stripes')
    expect(p.regularity).toBeGreaterThan(0.7)
    const pay = computePayout(f, 300, 'stripes', 3, 0)
    expect(pay.success).toBeGreaterThan(0.85)
  })

  it('driving the same direction every lane gives no visible stripes', () => {
    const site = buildSite('field', 7)
    const f = new Field(site)
    const b = site.bounds
    mowStripes(f, b.x0, b.z0, b.x1, b.z1, DECK_WIDTH * 0.92, { alternate: false, axis: 'x' })
    const p = analysePattern(f)
    expect(p.regularity).toBeLessThan(0.3)
  })

  it('mowing it all twice costs efficiency, unless a checkerboard was asked for', () => {
    const site = buildSite('field', 7)
    const f = new Field(site)
    const b = site.bounds
    mowStripes(f, b.x0, b.z0, b.x1, b.z1, DECK_WIDTH * 0.92, { alternate: true, axis: 'x' })
    mowStripes(f, b.x0, b.z0, b.x1, b.z1, DECK_WIDTH * 0.92, { alternate: true, axis: 'z' })
    expect(f.efficiency).toBeLessThan(0.6)
    const p = analysePattern(f)
    expect(p.kind).toBe('checker')
    const checker = computePayout(f, 300, 'checker', 3, 0)
    const stripes = computePayout(f, 300, 'stripes', 3, 0)
    expect(checker.efficiency).toBeGreaterThan(0.85)
    expect(checker.earned).toBeGreaterThan(stripes.earned)
  })

  it('half a lawn pays well under half', () => {
    const site = buildSite('field', 7)
    const f = new Field(site)
    const b = site.bounds
    mowStripes(f, b.x0, b.z0, b.x1, (b.z0 + b.z1) / 2, DECK_WIDTH * 0.92, { alternate: true, axis: 'x' })
    const pay = computePayout(f, 300, 'any', 3, 0)
    expect(f.coverage).toBeLessThan(0.6)
    expect(pay.earned).toBeLessThan(120)
  })
})
