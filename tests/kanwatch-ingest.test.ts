/**
 * Kanwatch on the server: what it accepts, and how visits become episodes.
 *
 * cleanVisit is the server's own pass over what the extension sent. It must hold
 * even against a buggy or tampered extension — a private visit arriving with its
 * title filled in still has to be stored as time only.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { cleanVisit } from '@/lib/kanwatch/ingest'
import { assignEpisodes, describeEngagement, localDate, GAP_MS, MAX_SPAN_MS } from '@/lib/kanwatch/episodes'

const NOW = Date.UTC(2026, 8, 24, 18, 0, 0)
const MIN = 60000

const visit = (over: Record<string, unknown> = {}) => ({
  id: 'visit_abcdef12',
  startedAt: NOW - 10 * MIN,
  endedAt: NOW - 5 * MIN,
  activeSeconds: 300,
  domain: 'docs.stripe.com',
  path: '/webhooks',
  title: 'Webhooks | Stripe',
  ...over,
})

describe('cleanVisit — the server re-applies the privacy rules', () => {
  it('keeps an ordinary visit, scrubbed', () => {
    const v = cleanVisit(visit({ title: 'Refund for jane@example.com' }), NOW)
    expect(v?.isPrivate).toBe(false)
    expect(v?.title).toBe('Refund for [email]')
  })

  it('stores a sensitive site as time only, whatever the extension sent', () => {
    const v = cleanVisit(visit({ domain: 'secure.chase.com', path: '/accounts', title: 'Checking ...4821' }), NOW)
    expect(v).toEqual({
      id: 'visit_abcdef12',
      startedAt: new Date(NOW - 10 * MIN),
      endedAt: new Date(NOW - 5 * MIN),
      activeSeconds: 300,
      isPrivate: true,
    })
  })

  it('treats a sign-in page as private on any site', () => {
    expect(cleanVisit(visit({ domain: 'github.com', path: '/login' }), NOW)?.isPrivate).toBe(true)
    expect(cleanVisit(visit({ title: 'Sign in to your account' }), NOW)?.isPrivate).toBe(true)
  })

  it('re-masks ids smuggled into the path', () => {
    expect(cleanVisit(visit({ path: '/customers/88812345/edit' }), NOW)?.path).toBe('/customers/:id/edit')
  })

  it('never claims more active time than the visit lasted', () => {
    expect(cleanVisit(visit({ activeSeconds: 99999 }), NOW)?.activeSeconds).toBe(300)
  })

  it('rejects malformed, future and expired visits', () => {
    expect(cleanVisit(visit({ id: 'x' }), NOW)).toBeNull()
    expect(cleanVisit(visit({ endedAt: NOW + 60 * MIN }), NOW)).toBeNull()
    expect(cleanVisit(visit({ startedAt: NOW - 40 * 86400000 }), NOW)).toBeNull()
    expect(cleanVisit(visit({ activeSeconds: 0 }), NOW)).toBeNull()
  })
})

describe('assignEpisodes', () => {
  let n = 0
  const id = () => `ep${++n}`
  const v = (i: number, start: number, seconds = 60, isPrivate = false) => ({
    id: `v${i}`, startedAt: start, endedAt: start + seconds * 1000, activeSeconds: seconds, isPrivate,
  })

  it('groups visits close together into one episode', () => {
    n = 0
    const r = assignEpisodes([v(1, 0), v(2, 2 * MIN), v(3, 4 * MIN, 60, true)], null, id)
    expect(r.episodes).toHaveLength(1)
    expect(r.episodes[0]).toMatchObject({ activeSeconds: 180, privateSeconds: 60, isNew: true })
  })

  it('starts a new episode after a gap', () => {
    n = 0
    const r = assignEpisodes([v(1, 0), v(2, GAP_MS + 2 * MIN)], null, id)
    expect(r.episodes).toHaveLength(2)
    expect(r.closed).toEqual(['ep1'])
  })

  it('caps how long one episode can run', () => {
    n = 0
    const visits = Array.from({ length: 12 }, (_, i) => v(i, i * 4 * MIN, 200))
    const r = assignEpisodes(visits, null, id)
    expect(r.episodes.length).toBeGreaterThan(1)
    // No visit joins an episode that has already run MAX_SPAN; the last one may run past it by its own length.
    for (const ep of r.episodes) expect(ep.endedAt - ep.startedAt).toBeLessThan(MAX_SPAN_MS + 200 * 1000)
  })

  it('continues the open episode from the last upload', () => {
    n = 0
    const open = { id: 'open1', startedAt: 0, endedAt: MIN, activeSeconds: 60, privateSeconds: 0 }
    const r = assignEpisodes([v(1, 3 * MIN)], open, id)
    expect(r.episodes).toHaveLength(1)
    expect(r.episodes[0]).toMatchObject({ id: 'open1', activeSeconds: 120, isNew: false })
    expect(r.visitEpisode.get('v1')).toBe('open1')
  })
})

describe('describeEngagement', () => {
  it('reads what someone was doing from counts alone', () => {
    expect(describeEngagement({ activeSeconds: 120, keystrokes: 90, clicks: 3, scrollDepth: 10, mediaSeconds: 0 })).toBe('typing')
    expect(describeEngagement({ activeSeconds: 600, keystrokes: 2, clicks: 1, scrollDepth: 5, mediaSeconds: 540 })).toBe('watching or listening')
    expect(describeEngagement({ activeSeconds: 300, keystrokes: 0, clicks: 2, scrollDepth: 80, mediaSeconds: 0 })).toBe('reading')
    expect(describeEngagement({ activeSeconds: 40, keystrokes: 0, clicks: 4, scrollDepth: 10, mediaSeconds: 0 })).toBe('browsing')
  })
})

describe('localDate', () => {
  it('uses the browser offset, so late evening stays on the right day', () => {
    // 02:30 UTC on the 25th is 21:30 on the 24th in Chicago (offset +300).
    expect(localDate(Date.UTC(2026, 8, 25, 2, 30), 300)).toBe('2026-09-24')
  })
})

describe('background media', () => {
  it('is kept as context: site and title only, flagged as background', () => {
    const v = cleanVisit(visit({ background: true, domain: 'youtube.com', path: '/watch', title: 'Lofi beats to work to', keystrokes: 50 }), NOW)
    expect(v).toMatchObject({ isBackground: true, domain: 'youtube.com', title: 'Lofi beats to work to' })
    expect(v).not.toHaveProperty('keystrokes')
  })

  it('is dropped entirely on a private page, not even counted as private time', () => {
    expect(cleanVisit(visit({ background: true, domain: 'mychart.com', path: '/video' }), NOW)).toBeNull()
  })
})
