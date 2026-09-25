/**
 * Reading a day back as sessions, and naming what each was for.
 *
 * A morning of print-order admin is five or six stretches; shown one by one it reads
 * like browser history. These are the rules that fold it into what you'd say you did,
 * and that name it the way your sidebar does — "MyCreativeShop / Work", not "Work".
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/api/permissions', () => ({ getUserChannels: vi.fn() }))

import { attachBackground, groupSessions, readingOf, SESSION_GAP_MS, type Names } from '@/lib/kanwatch/sessions'

const MIN = 60000
const T0 = Date.UTC(2026, 8, 24, 14, 0)

const names: Names = {
  channel: new Map([
    ['mcs-work', { name: 'Work', folder: 'MyCreativeShop' }],
    ['kt-work', { name: 'Work', folder: 'Kanthink' }],
    ['birds', { name: 'Backyard birds', folder: null }],
  ]),
  card: new Map([['card-1', 'Print order backlog']]),
}

let n = 0
function episode(over: Record<string, unknown>) {
  n += 1
  return {
    id: `ep${n}`, userId: 'u', startedAt: new Date(T0), endedAt: new Date(T0 + 5 * MIN),
    activeSeconds: 300, privateSeconds: 0, tzOffsetMinutes: 300, status: 'judged',
    guessKind: 'channel', guessChannelId: 'mcs-work', guessCardId: null, guessLabel: null, guessProbability: 90,
    activityMode: 'admin', focusScore: null, worthCardProbability: null, jevModel: null, judgedAt: null,
    verdict: null, verdictChannelId: null, verdictCardId: null, verdictMode: null, label: null,
    boardSig: null, domains: null, basis: null, createdAt: null, updatedAt: null,
    ...over,
  } as never
}
function visit(episodeId: string, over: Record<string, unknown> = {}) {
  n += 1
  return {
    id: `v${n}`, userId: 'u', episodeId, startedAt: new Date(T0), endedAt: new Date(T0 + MIN), activeSeconds: 60,
    isPrivate: false, domain: 'admin.mycreativeshop.com', path: '/orders', title: 'Print Orders | MCS Admin',
    heading: '', description: '', searchQuery: '', keystrokes: 0, clicks: 3, scrollDepth: 50, mediaSeconds: 0, createdAt: null,
    ...over,
  } as never
}

describe('readingOf', () => {
  it('names a channel with its folder', () => {
    const r = readingOf(episode({}), 1, names)
    expect(r.label).toBe('MyCreativeShop / Work')
    expect(r.folder).toBe('MyCreativeShop')
    expect(r.channelName).toBe('Work')
  })

  it('keeps same-named channels in different folders apart', () => {
    expect(readingOf(episode({ guessChannelId: 'kt-work' }), 1, names).key)
      .not.toBe(readingOf(episode({}), 1, names).key)
  })

  it('adds the card after the folder and channel', () => {
    expect(readingOf(episode({ guessKind: 'card', guessCardId: 'card-1' }), 1, names).label)
      .toBe('MyCreativeShop / Work › Print order backlog')
  })

  it('lets your own words lead once you have answered', () => {
    const r = readingOf(episode({ verdict: 'corrected', label: 'Template manufacturing', verdictChannelId: 'mcs-work' }), 1, names)
    expect(r.label).toBe('Template manufacturing')
    expect(r.decided).toBe(true)
  })
})

describe('groupSessions', () => {
  it('folds consecutive stretches for the same thing into one session', () => {
    const a = episode({ startedAt: new Date(T0), endedAt: new Date(T0 + 10 * MIN) })
    const b = episode({ startedAt: new Date(T0 + 15 * MIN), endedAt: new Date(T0 + 25 * MIN) })
    const sessions = groupSessions([a, b], [visit('ep' + (n - 1)), visit('ep' + n)], names)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].activeSeconds).toBe(600)
    expect(sessions[0].reading.label).toBe('MyCreativeShop / Work')
  })

  it('does not let a private minute break a session', () => {
    const a = episode({})
    const p = episode({ startedAt: new Date(T0 + 6 * MIN), endedAt: new Date(T0 + 7 * MIN), guessKind: 'private', activeSeconds: 60, privateSeconds: 60 })
    const b = episode({ startedAt: new Date(T0 + 8 * MIN), endedAt: new Date(T0 + 12 * MIN) })
    const sessions = groupSessions([a, p, b], [visit((a as { id: string }).id), visit((b as { id: string }).id)], names)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].privateSeconds).toBe(60)
  })

  it('starts a new session when the work changes', () => {
    const a = episode({})
    const b = episode({ startedAt: new Date(T0 + 6 * MIN), endedAt: new Date(T0 + 9 * MIN), guessChannelId: 'birds' })
    expect(groupSessions([a, b], [], names)).toHaveLength(2)
  })

  it('starts a new session after a long break, even for the same work', () => {
    const a = episode({})
    const b = episode({ startedAt: new Date(T0 + 5 * MIN + SESSION_GAP_MS + MIN), endedAt: new Date(T0 + 5 * MIN + SESSION_GAP_MS + 4 * MIN) })
    expect(groupSessions([a, b], [], names)).toHaveLength(2)
  })

  it('reports the least certain guess, and whether you answered all of it', () => {
    const a = episode({ guessProbability: 90, verdict: 'confirmed', verdictChannelId: 'mcs-work' })
    const b = episode({ startedAt: new Date(T0 + 6 * MIN), endedAt: new Date(T0 + 9 * MIN), guessProbability: 55 })
    const [s] = groupSessions([a, b], [], names)
    expect(s.answered).toBe(false)
  })
})


describe('attachBackground', () => {
  it('attaches what played during a session, by overlap, without adding active time', () => {
    const a = episode({ startedAt: new Date(T0), endedAt: new Date(T0 + 20 * MIN), activeSeconds: 1200 })
    const [s] = groupSessions([a], [], names)
    const bg = visit('', {
      episodeId: null, isBackground: true, domain: 'youtube.com', title: 'Lofi beats',
      startedAt: new Date(T0 - 5 * MIN), endedAt: new Date(T0 + 10 * MIN), activeSeconds: 900,
    })
    const [withBg] = attachBackground([s], [bg])
    expect(withBg.alongside).toEqual([{ site: 'youtube.com', title: 'Lofi beats', seconds: 600 }])
    expect(withBg.activeSeconds).toBe(1200)
  })

  it('ignores media that barely overlapped', () => {
    const a = episode({ startedAt: new Date(T0), endedAt: new Date(T0 + 10 * MIN) })
    const [s] = groupSessions([a], [], names)
    const bg = visit('', { isBackground: true, domain: 'youtube.com', startedAt: new Date(T0 + 10 * MIN - 10000), endedAt: new Date(T0 + 30 * MIN) })
    expect(attachBackground([s], [bg])[0].alongside).toEqual([])
  })
})
