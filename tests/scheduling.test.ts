import { describe, expect, it } from 'vitest'
import { nextWallClock, zoneDay, zoneParts, zonedTimeToUtc } from '@/lib/time/zone'
import { scheduleNextRun } from '@/lib/automationSafeguards'

const CHI = 'America/Chicago'

describe('wall-clock time in a timezone', () => {
  it('6 AM in Chicago is 11:00 UTC in summer and 12:00 UTC in winter', () => {
    expect(zonedTimeToUtc(2026, 10, 3, 6, 0, CHI).toISOString()).toBe('2026-10-03T11:00:00.000Z')
    expect(zonedTimeToUtc(2026, 12, 3, 6, 0, CHI).toISOString()).toBe('2026-12-03T12:00:00.000Z')
  })

  it('reads the local clock and date', () => {
    const p = zoneParts(new Date('2026-10-03T04:30:00Z'), CHI)
    expect([p.day, p.hour, p.minute]).toEqual([2, 23, 30])
    expect(zoneDay(new Date('2026-10-03T04:30:00Z'), CHI)).toBe('2026-10-02')
  })

  it('finds the next 06:00 in the person\'s timezone, today or tomorrow', () => {
    expect(nextWallClock('06:00', CHI, new Date('2026-10-03T09:00:00Z')).toISOString()).toBe('2026-10-03T11:00:00.000Z')
    expect(nextWallClock('06:00', CHI, new Date('2026-10-03T11:30:00Z')).toISOString()).toBe('2026-10-04T11:00:00.000Z')
  })

  it('keeps 6 AM across the DST change', () => {
    // US clocks fall back on Nov 1, 2026.
    expect(nextWallClock('06:00', CHI, new Date('2026-10-31T12:00:00Z')).toISOString()).toBe('2026-11-01T12:00:00.000Z')
  })

  it('weekly lands on the right weekday', () => {
    const next = nextWallClock('09:00', CHI, new Date('2026-10-03T12:00:00Z'), 1) // Monday
    expect(next.toISOString()).toBe('2026-10-05T14:00:00.000Z')
  })
})

describe('scheduleNextRun (the server side)', () => {
  const daily = { interval: 'daily' as const, specificTime: '06:00' }

  it('uses the owner\'s timezone when known', () => {
    expect(scheduleNextRun(daily, null, CHI, new Date('2026-10-03T11:05:00Z')).toISOString()).toBe('2026-10-04T11:00:00.000Z')
  })

  it('without a timezone, keeps the time it was set to instead of drifting to UTC', () => {
    // Set in a Chicago browser for 11:00 UTC; the server must not turn that into 06:00 UTC.
    const next = scheduleNextRun(daily, '2026-10-03T11:00:00Z', null, new Date('2026-10-03T11:05:00Z'))
    expect(next.toISOString()).toBe('2026-10-04T11:00:00.000Z')
  })

  it('catches up past missed days without running them all', () => {
    const next = scheduleNextRun(daily, '2026-09-28T11:00:00Z', null, new Date('2026-10-03T12:00:00Z'))
    expect(next.toISOString()).toBe('2026-10-04T11:00:00.000Z')
  })
})
