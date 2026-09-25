/**
 * When Kanwatch nudges you back to today's priority.
 *
 * A nudge that fires on real work gets ignored, then switched off. These pin the
 * rules that keep it honest: counted page by page, only sustained and current drift,
 * never private time, and a page on the priority resets it.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { pickNudge, pickCelebrations, pickMoments, correctedFocus, DRIFT_MINUTES } from '@/lib/kanwatch/nudge'

const NOW = Date.UTC(2026, 8, 25, 18, 0, 0)
let n = 0

/** A visit from `from` to `to` minutes ago. */
function visit(from: number, to: number, domain: string, focus: string | null, over: Record<string, unknown> = {}) {
  n += 1
  return {
    id: `v${n}`, startedAt: new Date(NOW - from * 60000), endedAt: new Date(NOW - to * 60000),
    activeSeconds: (from - to) * 60, isPrivate: false, isBackground: false, domain, focus,
    ...over,
  } as never
}

describe('pickNudge', () => {
  it('nudges after sustained time off the priority, naming the sites by time', () => {
    const nudge = pickNudge([visit(12, 4, 'x.com', 'not_work'), visit(4, 0, 'facebook.com', 'not_work')], 'ship the designer fixes', NOW)
    expect(nudge).not.toBeNull()
    expect(nudge!.message).toContain('ship the designer fixes')
    expect(nudge!.message).toContain('x.com and facebook.com')
    expect(nudge!.minutes).toBe(12)
  })

  it('catches a feed inside what was otherwise a work stretch', () => {
    // The old stretch-level read called this whole run "work".
    const nudge = pickNudge([
      visit(40, 30, 'secure.helpscout.net', 'priority'),
      visit(30, 18, 'x.com', 'not_work'),
      visit(18, 0, 'x.com', 'not_work'),
    ], 'support', NOW)
    expect(nudge!.minutes).toBe(30)
  })

  it('counts other work as off the priority too', () => {
    expect(pickNudge([visit(15, 0, 'secure.helpscout.net', 'work')], 'template manufacturing', NOW)).not.toBeNull()
  })

  it('stays quiet with no priority set', () => {
    expect(pickNudge([visit(20, 0, 'x.com', 'not_work')], '', NOW)).toBeNull()
  })

  it(`needs at least ${DRIFT_MINUTES} minutes`, () => {
    expect(pickNudge([visit(6, 0, 'x.com', 'not_work')], 'p', NOW)).toBeNull()
  })

  it('resets when you get back to the priority', () => {
    expect(pickNudge([visit(30, 3, 'x.com', 'not_work'), visit(3, 0, 'editor.mycreativeshop.com', 'priority')], 'p', NOW)).toBeNull()
  })

  it('never counts private, unread or unclear time', () => {
    expect(pickNudge([visit(15, 0, 'bank', 'not_work', { isPrivate: true })], 'p', NOW)).toBeNull()
    expect(pickNudge([visit(15, 0, 'x.com', null)], 'p', NOW)).toBeNull()
    expect(pickNudge([visit(15, 0, 'x.com', 'unclear')], 'p', NOW)).toBeNull()
  })

  it('ignores drift that is over, and a break ends the run', () => {
    expect(pickNudge([visit(30, 10, 'x.com', 'not_work')], 'p', NOW)).toBeNull()
    // Eight minutes, a twenty-minute gap, then three more: not eleven in a row.
    expect(pickNudge([visit(31, 23, 'x.com', 'not_work'), visit(3, 0, 'x.com', 'not_work')], 'p', NOW)).toBeNull()
  })

  it('keeps the same key as the drift grows', () => {
    const start = visit(20, 10, 'x.com', 'not_work')
    const a = pickNudge([start, visit(10, 0, 'x.com', 'not_work')], 'p', NOW)
    expect(a!.key).toBe(`drift:${(start as { id: string }).id}`)
  })

  it('never counts background media', () => {
    expect(pickNudge([visit(20, 0, 'youtube.com', 'not_work', { isBackground: true })], 'p', NOW)).toBeNull()
  })
})

const E = 'editor.mycreativeshop.com'
const T = 'templatedesigner.mycreativeshop.com'
const kinds = (ms: { key: string }[]) => ms.map((m) => m.key.split(':')[0])

describe('pickCelebrations', () => {
  it('says you’re on it a few minutes into the first session of the day', () => {
    const [m] = pickCelebrations([visit(5, 0, E, 'priority')], 'template manufacturing', NOW)
    expect(m.title).toBe('You’re on it')
    expect(m.message).toContain('template manufacturing')
    expect(m.message).toContain(E)
  })

  it('stays quiet for a glance at the priority', () => {
    expect(pickCelebrations([visit(1, 0, E, 'priority')], 'p', NOW)).toEqual([])
  })

  it('says back on it after a real stretch away, and not after a short detour', () => {
    const back = pickCelebrations([visit(90, 60, E, 'priority'), visit(60, 30, 'secure.helpscout.net', 'work'), visit(5, 0, E, 'priority')], 'p', NOW)
    expect(back[0].title).toBe('Back on it')
    // Detours and gaps under twenty minutes keep the same session: its start is the old one.
    const first = visit(40, 30, E, 'priority')
    const same = pickCelebrations([first, visit(30, 25, 'x.com', 'not_work'), visit(25, 0, T, 'priority')], 'p', NOW)
    const start = same.find((m) => m.kind === 'start')!
    expect(start.key).toBe(`start:${(first as { id: string }).id}`)
    expect(start.title).toBe('You’re on it')
  })

  it('counts session milestones across detours instead of resetting', () => {
    const ms = pickCelebrations([
      visit(60, 40, E, 'priority'),
      visit(40, 35, 'secure.helpscout.net', 'work'),
      visit(35, 25, T, 'priority'),
      visit(25, 20, 'dashboard.mycreativeshop.com', 'work'),
      visit(20, 0, E, 'priority'),
    ], 'p', NOW)
    expect(ms.find((m) => m.key.startsWith('deep:'))!.key.endsWith(':50')).toBe(true)
  })

  it('marks 45 minutes without a distraction, where other work is not one', () => {
    const clean = pickCelebrations([visit(50, 30, E, 'priority'), visit(30, 25, 'secure.helpscout.net', 'work'), visit(25, 0, E, 'priority')], 'p', NOW)
    expect(kinds(clean)).toContain('clean')
    const distracted = pickCelebrations([visit(50, 30, E, 'priority'), visit(30, 25, 'x.com', 'not_work'), visit(25, 0, E, 'priority')], 'p', NOW)
    expect(kinds(distracted)).not.toContain('clean')
  })

  it('counts the day’s total across sessions', () => {
    const ms = pickCelebrations([visit(300, 260, E, 'priority'), visit(30, 0, T, 'priority')], 'p', NOW, '2026-09-25')
    expect(ms.find((m) => m.key.startsWith('today:'))!.key).toBe('today:2026-09-25:60')
  })

  it('suggests a break at 90 minutes', () => {
    const ms = pickCelebrations([visit(95, 0, E, 'priority')], 'p', NOW)
    expect(ms.find((m) => m.key.startsWith('deep:'))!.message).toContain('break')
  })

  it('says nothing once you’ve left the session', () => {
    expect(pickCelebrations([visit(60, 30, E, 'priority')], 'p', NOW)).toEqual([])
  })

  it('carries the visits it was judged from, so an answer corrects exactly those', () => {
    const v = visit(10, 0, E, 'priority')
    expect(pickCelebrations([v], 'p', NOW)[0].visitIds).toEqual([(v as { id: string }).id])
  })
})

describe('pickMoments', () => {
  it('puts a drift nudge first', () => {
    expect(pickMoments([visit(40, 15, E, 'priority'), visit(15, 0, 'x.com', 'not_work')], 'p', NOW)[0]?.kind).toBe('drift')
  })
})

describe('correctedFocus', () => {
  it('turns a wrong drift into priority time, and a wrong celebration into neither', () => {
    expect(correctedFocus('drift')).toBe('priority')
    expect(correctedFocus('start')).toBe('unclear')
    expect(correctedFocus('milestone')).toBe('unclear')
  })
})
