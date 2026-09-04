/**
 * Voice duplicate-card detection
 *
 * Cases drawn from a real voice session where one idea became three cards in two
 * minutes. The titles here are verbatim from that transcript.
 */
import { describe, it, expect } from 'vitest'
import {
  isLikelyDuplicateTitle,
  findDuplicateCard,
  titleTokens,
  DUPLICATE_WINDOW_MS,
} from '../lib/voice/duplicateCard'

describe('titleTokens', () => {
  it('drops possessives, punctuation and filler', () => {
    expect(titleTokens("Lennon's Cozy Cat Math App Idea")).toEqual([
      'lennon', 'cozy', 'cat', 'math',
    ])
  })

  it('leaves a title made only of filler with nothing to match on', () => {
    expect(titleTokens('A new app idea')).toEqual([])
  })
})

describe('isLikelyDuplicateTitle', () => {
  it('catches the three cards one maths idea actually produced', () => {
    const a = "Lennon's Math Practice App"
    const b = "Lennon's Cozy Cat Math App Idea"
    const c = "Lennon's Cat Math Adventure app"
    expect(isLikelyDuplicateTitle(a, c)).toBe(true)
    expect(isLikelyDuplicateTitle(b, c)).toBe(true)
  })

  it('treats a title getting more specific as the same idea', () => {
    expect(isLikelyDuplicateTitle('Lennon Math', 'Lennon Cat Math Adventure Story')).toBe(true)
  })

  it('leaves genuinely different ideas that share a word alone', () => {
    expect(isLikelyDuplicateTitle('Bird Color Palette', 'Bird Feeder Log')).toBe(false)
    expect(isLikelyDuplicateTitle('Q3 Pricing Review', 'Q3 Hiring Plan')).toBe(false)
  })

  it('never matches on filler alone', () => {
    expect(isLikelyDuplicateTitle('A new app idea', 'Another app idea')).toBe(false)
  })

  it('is symmetric', () => {
    const a = "Lennon's Math Practice App"
    const c = "Lennon's Cat Math Adventure app"
    expect(isLikelyDuplicateTitle(a, c)).toBe(isLikelyDuplicateTitle(c, a))
  })
})

describe('findDuplicateCard', () => {
  const now = Date.now()
  const recent = [
    {
      id: 'card-1',
      title: "Lennon's Math Practice App",
      channelId: 'playground',
      createdAt: new Date(now - 60_000),
    },
  ]

  it('finds the earlier card for the same idea', () => {
    const hit = findDuplicateCard("Lennon's Cat Math Adventure app", recent, now)
    expect(hit?.id).toBe('card-1')
  })

  it('matches across channels — the real duplicates landed somewhere else', () => {
    const hit = findDuplicateCard("Lennon's Cat Math Adventure app", recent, now)
    expect(hit?.channelId).toBe('playground')
  })

  it('ignores anything outside the window, so tomorrow is a fresh start', () => {
    const stale = [{ ...recent[0], createdAt: new Date(now - DUPLICATE_WINDOW_MS - 1000) }]
    expect(findDuplicateCard("Lennon's Cat Math Adventure app", stale, now)).toBeNull()
  })

  it('returns null when nothing is close', () => {
    expect(findDuplicateCard('Quarterly budget review', recent, now)).toBeNull()
  })

  it('tolerates a card with no timestamp rather than throwing', () => {
    const undated = [{ ...recent[0], createdAt: null }]
    expect(findDuplicateCard("Lennon's Cat Math Adventure app", undated, now)).toBeNull()
  })
})
