/**
 * When Kanwatch nudges you back to today's priority.
 *
 * A nudge that fires on real work gets ignored, then switched off. These pin the
 * rules that keep it honest: counted page by page, only sustained and current drift,
 * never private time, and a page on the priority resets it.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { pickNudge, DRIFT_MINUTES } from '@/lib/kanwatch/nudge'

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
    expect(a!.key).toBe((start as { id: string }).id)
  })

  it('never counts background media', () => {
    expect(pickNudge([visit(20, 0, 'youtube.com', 'not_work', { isBackground: true })], 'p', NOW)).toBeNull()
  })
})
