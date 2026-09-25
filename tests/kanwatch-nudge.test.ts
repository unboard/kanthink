/**
 * When Kanwatch nudges you back to today's priority.
 *
 * A nudge that fires on real work gets ignored, then switched off. These pin the
 * rules that keep it rare: only sustained, current, unrelated, non-private drift,
 * and never over something you've already answered yourself.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { pickNudge, DRIFT_MINUTES } from '@/lib/kanwatch/nudge'

const NOW = Date.UTC(2026, 8, 25, 18, 0, 0)
let n = 0

function ep(minutesAgoStart: number, minutesAgoEnd: number, over: Record<string, unknown> = {}) {
  n += 1
  const active = (minutesAgoStart - minutesAgoEnd) * 60
  return {
    id: `ep${n}`, userId: 'u', status: 'open', tzOffsetMinutes: 300,
    startedAt: new Date(NOW - minutesAgoStart * 60000), endedAt: new Date(NOW - minutesAgoEnd * 60000),
    activeSeconds: active, privateSeconds: 0, focusScore: 0, guessKind: 'not_work', verdict: null,
    domains: '["x.com","youtube.com"]',
    ...over,
  } as never
}

describe('pickNudge', () => {
  it('nudges after sustained unrelated browsing, naming the sites and the priority', () => {
    const nudge = pickNudge([ep(12, 0)], 'ship the designer fixes', NOW)
    expect(nudge).not.toBeNull()
    expect(nudge!.message).toContain('ship the designer fixes')
    expect(nudge!.message).toContain('x.com and youtube.com')
    expect(nudge!.minutes).toBe(12)
  })

  it('stays quiet with no priority set', () => {
    expect(pickNudge([ep(20, 0)], '', NOW)).toBeNull()
    expect(pickNudge([ep(20, 0)], null, NOW)).toBeNull()
  })

  it(`needs at least ${DRIFT_MINUTES} minutes of drift`, () => {
    expect(pickNudge([ep(6, 0)], 'p', NOW)).toBeNull()
  })

  it('adds up consecutive unrelated stretches, keeping the first one as the key', () => {
    const first = ep(14, 8)
    const nudge = pickNudge([ep(7, 0), first], 'p', NOW)
    expect(nudge!.minutes).toBe(13)
    expect(nudge!.key).toBe((first as { id: string }).id)
  })

  it('never counts loosely related work as drift', () => {
    expect(pickNudge([ep(15, 0, { focusScore: 50 })], 'p', NOW)).toBeNull()
    // A related stretch in between breaks the run.
    expect(pickNudge([ep(6, 0), ep(12, 6, { focusScore: 100 }), ep(30, 12)], 'p', NOW)).toBeNull()
  })

  it('ignores drift that is over', () => {
    expect(pickNudge([ep(20, 6)], 'p', NOW)).toBeNull()
  })

  it('never nudges about private time', () => {
    expect(pickNudge([ep(15, 0, { privateSeconds: 15 * 60 })], 'p', NOW)).toBeNull()
    expect(pickNudge([ep(15, 0, { guessKind: 'private' })], 'p', NOW)).toBeNull()
  })

  it('leaves a stretch you answered yourself alone', () => {
    expect(pickNudge([ep(15, 0, { verdict: 'confirmed' })], 'p', NOW)).toBeNull()
  })

  it('looks past the stretch still waiting to be read', () => {
    const nudge = pickNudge([ep(1, 0, { focusScore: null }), ep(13, 1)], 'p', NOW)
    expect(nudge).not.toBeNull()
  })
})
