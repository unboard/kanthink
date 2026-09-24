/**
 * Turning Jev's distribution over a shortlist into act / ask / nothing matched.
 *
 * The failure this replaces: the voice route took the first `LIKE '%text%'` hit,
 * so two cards that both matched went to whichever the database returned first,
 * and a phrase that matched nothing real still grabbed something. The rules below
 * are the whole of what decides whether Kan acts on a spoken reference.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/api/permissions', () => ({ getUserChannels: vi.fn() }))

import { decide, clarifyingInstruction } from '@/lib/voice/resolveReference'

const card = (id: string, title = id) => ({ id, title, where: 'Work › Doing' })
const ranked = (...pairs: Array<[string, number]>) =>
  pairs.map(([id, p]) => ({ c: card(id), p })).sort((a, b) => b.p - a.p)

describe('decide', () => {
  it('acts on a clear winner', () => {
    expect(decide(ranked(['a', 0.82], ['b', 0.1]), 0.08)).toEqual({ status: 'resolved', id: 'a', title: 'a' })
  })

  it('asks when two candidates are close', () => {
    const result = decide(ranked(['a', 0.45], ['b', 0.4], ['c', 0.05]), 0.1)
    expect(result.status).toBe('ambiguous')
    if (result.status === 'ambiguous') expect(result.options.map(o => o.id)).toEqual(['a', 'b'])
  })

  it('asks rather than acts when the leader is strong but not far enough ahead', () => {
    expect(decide(ranked(['a', 0.6], ['b', 0.45]), 0).status).toBe('ambiguous')
  })

  it('says nothing matched when "none of these" wins, instead of grabbing the top card', () => {
    expect(decide(ranked(['a', 0.3], ['b', 0.1]), 0.6)).toEqual({ status: 'none' })
  })

  it('never acts on a card that is less likely than "none"', () => {
    expect(decide(ranked(['a', 0.56], ['b', 0.0]), 0.44).status).toBe('resolved')
    expect(decide(ranked(['a', 0.35], ['b', 0.05]), 0.6).status).toBe('none')
  })

  it('says nothing matched when every candidate is a long shot', () => {
    expect(decide(ranked(['a', 0.12], ['b', 0.11], ['c', 0.1]), 0.4)).toEqual({ status: 'none' })
  })

  it('offers at most three options', () => {
    const result = decide(ranked(['a', 0.24], ['b', 0.23], ['c', 0.22], ['d', 0.21]), 0.1)
    expect(result.status).toBe('ambiguous')
    if (result.status === 'ambiguous') expect(result.options).toHaveLength(3)
  })

  it('resolves when only one candidate clears the bar', () => {
    expect(decide(ranked(['a', 0.5], ['b', 0.1]), 0.4)).toEqual({ status: 'resolved', id: 'a', title: 'a' })
  })
})

describe('clarifyingInstruction', () => {
  it('names each option with its location and id, and asks for one short question', () => {
    const text = clarifyingInstruction('card', 'launch', [card('c1', 'Launch checklist'), card('c2', 'Launch email')])
    expect(text).toContain('"Launch checklist" (Work › Doing, id c1)')
    expect(text).toContain('"Launch email" (Work › Doing, id c2)')
    expect(text).toMatch(/single short question/)
  })
})
