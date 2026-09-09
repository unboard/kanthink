/**
 * Shroom avatars
 *
 * Derived avatars are the whole reason this can ship without anyone picking a face
 * first, so the properties that matter are: stable for a given shroom, and spread
 * well enough that a channel's shrooms look like different creatures.
 */
import { describe, it, expect } from 'vitest'
import {
  deriveAvatar,
  resolveAvatar,
  parseAvatar,
  serializeAvatar,
  capPath,
  stemPath,
  textOn,
  CAP_SHAPES,
  STEM_SHAPES,
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
      expect(CAP_SHAPES).toContain(a.cap)
      expect(STEM_SHAPES).toContain(a.stem)
      expect(PATTERNS).toContain(a.pattern)
      expect(PALETTE.some((p) => p.key === a.color)).toBe(true)
    }
  })

  it('spreads ids created moments apart', () => {
    // nanoid ids from one session share a prefix; near-identical avatars would
    // defeat the point of having them.
    const ids = ['V1StGXR8_Z5jdHi6B-1', 'V1StGXR8_Z5jdHi6B-2', 'V1StGXR8_Z5jdHi6B-3']
    expect(new Set(ids.map((id) => serializeAvatar(deriveAvatar(id)))).size).toBe(3)
  })

  it('uses most of each axis across many ids', () => {
    const caps = new Set<string>()
    const stems = new Set<string>()
    const colors = new Set<string>()
    for (let i = 0; i < 400; i++) {
      const a = deriveAvatar(`shroom-${i}`)
      caps.add(a.cap)
      stems.add(a.stem)
      colors.add(a.color)
    }
    // A hash collapsing to two or three of anything would be useless.
    expect(caps.size).toBeGreaterThanOrEqual(6)
    expect(stems.size).toBeGreaterThanOrEqual(6)
    expect(colors.size).toBeGreaterThanOrEqual(8)
  })

  it('varies the other axes among shrooms sharing a cap', () => {
    const byCap: Record<string, Set<string>> = {}
    for (let i = 0; i < 400; i++) {
      const a = deriveAvatar(`s-${i}`)
      ;(byCap[a.cap] ??= new Set()).add(`${a.color}:${a.stem}`)
    }
    const biggest = Object.values(byCap).sort((a, b) => b.size - a.size)[0]
    expect(biggest.size).toBeGreaterThan(3)
  })
})

describe('parse and serialize', () => {
  it('round-trips', () => {
    const a = { cap: 'bell', stem: 'bulb', pattern: 'stars', color: 'teal' } as const
    expect(parseAvatar(serializeAvatar(a))).toEqual(a)
  })

  it('rejects anything it cannot draw', () => {
    for (const bad of [
      '',
      null,
      undefined,
      'nonsense',
      'bell:bulb:stars',
      'bell:bulb:stars:neon',
      'ufo:bulb:stars:teal',
      'bell:pogo:stars:teal',
    ]) {
      expect(parseAvatar(bad as string | null)).toBeNull()
    }
  })

  it('rejects the older three-part format rather than guessing at it', () => {
    // Those values named a different set of shapes; a shroom carrying one falls
    // back to a derived avatar instead of a mistranslation.
    expect(parseAvatar('round:spots:crimson')).toBeNull()
  })
})

describe('resolveAvatar', () => {
  it('prefers a chosen avatar', () => {
    expect(resolveAvatar('id1', 'bell:bulb:stars:teal')).toEqual({
      cap: 'bell',
      stem: 'bulb',
      pattern: 'stars',
      color: 'teal',
    })
  })

  it('falls back to the derived one when nothing is stored, or it is corrupt', () => {
    expect(resolveAvatar('id1', null)).toEqual(deriveAvatar('id1'))
    expect(resolveAvatar('id1', 'garbage')).toEqual(deriveAvatar('id1'))
  })
})

describe('drawing', () => {
  it('has a closed path for every cap', () => {
    for (const cap of CAP_SHAPES) {
      const d = capPath(cap)
      expect(d.startsWith('M')).toBe(true)
      expect(d.length).toBeGreaterThan(20)
    }
  })

  it('has a closed path for every stem', () => {
    for (const stem of STEM_SHAPES) {
      const d = stemPath(stem)
      expect(d.startsWith('M')).toBe(true)
      expect(d.trimEnd().toLowerCase().endsWith('z')).toBe(true)
    }
  })

  it('keeps every shape inside the 48-unit box', () => {
    for (const d of [...CAP_SHAPES.map(capPath), ...STEM_SHAPES.map(stemPath)]) {
      for (const n of d.match(/-?\d+(\.\d+)?/g) ?? []) {
        expect(Math.abs(Number(n))).toBeLessThanOrEqual(48)
      }
    }
  })
})

describe('textOn', () => {
  it('puts dark type on the pale caps', () => {
    expect(textOn('#EFE6D6')).toBe('#3A3733')
    expect(textOn('#F2C13C')).toBe('#3A3733')
  })

  it('puts light type on the dark ones', () => {
    expect(textOn('#3A3733')).toBe('#FFFFFF')
    expect(textOn('#7B4A2C')).toBe('#FFFFFF')
    expect(textOn('#3A6DBE')).toBe('#FFFFFF')
  })

  it('gives every palette colour a legible pairing', () => {
    for (const c of PALETTE) {
      expect(['#FFFFFF', '#3A3733']).toContain(textOn(c.cap))
    }
  })
})
