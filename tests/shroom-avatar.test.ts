/**
 * Shroom avatars
 *
 * Derived avatars are the whole reason this can ship without anyone picking twelve
 * pictures first, so the properties that matter are: stable for a given shroom, and
 * spread well enough that a channel's shrooms look like different things.
 */
import { describe, it, expect } from 'vitest'
import {
  deriveAvatar,
  resolveAvatar,
  parseAvatar,
  serializeAvatar,
  capPath,
  hasStem,
  stemPath,
  CAP_SHAPES,
  PATTERNS,
  PALETTE,
} from '../lib/shrooms/avatar'

describe('deriveAvatar', () => {
  it('is stable for the same id', () => {
    expect(deriveAvatar('abc123')).toEqual(deriveAvatar('abc123'))
  })

  it('always produces a drawable avatar', () => {
    for (const id of ['a', 'zzz', 'V1StGXR8_Z5jdHi6B-myT', '', '💥']) {
      const a = deriveAvatar(id)
      expect(CAP_SHAPES).toContain(a.shape)
      expect(PATTERNS).toContain(a.pattern)
      expect(PALETTE.some((p) => p.key === a.color)).toBe(true)
    }
  })

  it('spreads ids created moments apart', () => {
    // nanoid ids from one session share a prefix; near-identical avatars would defeat
    // the point of having them.
    const ids = ['V1StGXR8_Z5jdHi6B-1', 'V1StGXR8_Z5jdHi6B-2', 'V1StGXR8_Z5jdHi6B-3']
    const faces = ids.map((id) => serializeAvatar(deriveAvatar(id)))
    expect(new Set(faces).size).toBe(3)
  })

  it('uses most of the shape range across many ids', () => {
    const shapes = new Set(
      Array.from({ length: 300 }, (_, i) => deriveAvatar(`shroom-${i}`).shape)
    )
    // Not all twelve guaranteed, but a hash collapsing to two or three would be useless.
    expect(shapes.size).toBeGreaterThanOrEqual(8)
  })

  it('varies colour independently of shape', () => {
    // Ids that land on the same cap should still differ in colour, or a repeated
    // silhouette becomes a fully repeated avatar.
    const bySameShape: Record<string, Set<string>> = {}
    for (let i = 0; i < 300; i++) {
      const a = deriveAvatar(`s-${i}`)
      ;(bySameShape[a.shape] ??= new Set()).add(a.color)
    }
    const biggest = Object.values(bySameShape).sort((a, b) => b.size - a.size)[0]
    expect(biggest.size).toBeGreaterThan(1)
  })
})

describe('parse and serialize', () => {
  it('round-trips', () => {
    const a = { shape: 'bell' as const, pattern: 'gills' as const, color: 'teal' }
    expect(parseAvatar(serializeAvatar(a))).toEqual(a)
  })

  it('rejects anything it cannot draw', () => {
    for (const bad of ['', null, undefined, 'nonsense', 'bell:gills', 'bell:gills:neon', 'ufo:spots:teal']) {
      expect(parseAvatar(bad as string | null)).toBeNull()
    }
  })
})

describe('resolveAvatar', () => {
  it('prefers a chosen avatar', () => {
    expect(resolveAvatar('id1', 'bell:gills:teal')).toEqual({
      shape: 'bell',
      pattern: 'gills',
      color: 'teal',
    })
  })

  it('falls back to the derived one when nothing is stored', () => {
    expect(resolveAvatar('id1', null)).toEqual(deriveAvatar('id1'))
  })

  it('falls back rather than breaking on a corrupt value', () => {
    expect(resolveAvatar('id1', 'garbage')).toEqual(deriveAvatar('id1'))
  })
})

describe('drawing', () => {
  it('has a path for every shape', () => {
    for (const shape of CAP_SHAPES) {
      const d = capPath(shape)
      expect(typeof d).toBe('string')
      expect(d.length).toBeGreaterThan(10)
      expect(d.startsWith('M')).toBe(true)
    }
  })

  it('widens the stem to suit the cap', () => {
    // A fixed stem under every cap was the bug that made a wide parasol read as a
    // pole holding something up. Wider caps must get wider stems.
    const width = (shape: 'wide' | 'tall' | 'round') => {
      const m = stemPath(shape).match(/^M([\d.]+) 19h([\d.]+)/)
      return Number(m![2])
    }
    expect(width('wide')).toBeGreaterThan(width('round'))
    expect(width('round')).toBeGreaterThan(width('tall'))
  })

  it('centres its stem on the cap', () => {
    for (const shape of CAP_SHAPES) {
      if (!hasStem(shape)) continue
      const m = stemPath(shape).match(/^M([\d.]+) 19h([\d.]+)/)
      expect(m).not.toBeNull()
      const left = Number(m![1])
      const span = Number(m![2])
      expect(left + span / 2).toBeCloseTo(16, 1)
    }
  })

  it('omits the stem only for the two shapes that have none', () => {
    expect(hasStem('puffball')).toBe(false)
    expect(hasStem('coral')).toBe(false)
    expect(hasStem('round')).toBe(true)
  })
})
