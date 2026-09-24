/**
 * The shroom taste check: which drafts reach the review column.
 *
 * The run over-generates, Jev scores each draft for "would this user reject it?",
 * and these rules turn those scores into the cards that get made. What they must
 * guarantee: a likely reject never gets through just to fill the count, the count
 * is never exceeded, and the shroom's own ordering survives.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { chooseDrafts, draftCountFor, HOLD_BACK_AT } from '@/lib/shrooms/tasteGate'

const drafts = (...titles: string[]) => titles.map((title) => ({ title }))

describe('chooseDrafts', () => {
  it('keeps the least likely rejects, up to the count', () => {
    const { cards, heldBack } = chooseDrafts(drafts('a', 'b', 'c', 'd'), [0.1, 0.5, 0.05, 0.3], 2)
    expect(cards.map((c) => c.title)).toEqual(['a', 'c'])
    expect(heldBack).toEqual([])
  })

  it('returns kept cards in the order the shroom wrote them', () => {
    const { cards } = chooseDrafts(drafts('a', 'b', 'c'), [0.4, 0.1, 0.2], 3)
    expect(cards.map((c) => c.title)).toEqual(['a', 'b', 'c'])
  })

  it('holds back likely rejects even when that leaves the run short', () => {
    const { cards, heldBack } = chooseDrafts(drafts('a', 'b', 'c'), [0.9, 0.2, HOLD_BACK_AT], 3)
    expect(cards.map((c) => c.title)).toEqual(['b'])
    expect(heldBack.map((h) => h.title)).toEqual(['a', 'c'])
  })

  it('can hold back everything', () => {
    const { cards, heldBack } = chooseDrafts(drafts('a', 'b'), [0.95, 0.8], 2)
    expect(cards).toEqual([])
    expect(heldBack).toHaveLength(2)
  })

  it('treats a missing score as no objection', () => {
    const { cards } = chooseDrafts(drafts('a', 'b'), [0.2], 2)
    expect(cards.map((c) => c.title)).toEqual(['a', 'b'])
  })
})

describe('draftCountFor', () => {
  it('asks for a few extra drafts, between two and three more', () => {
    expect(draftCountFor(1)).toBe(3)
    expect(draftCountFor(3)).toBe(5)
    expect(draftCountFor(5)).toBe(8)
    expect(draftCountFor(10)).toBe(13)
  })
})
