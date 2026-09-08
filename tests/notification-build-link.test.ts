/**
 * Where a finished-build notification takes you
 *
 * The notification exists to save a trip. Landing on the card and leaving someone
 * to hunt through the Apps tab would spend the one click it was meant to save.
 */
import { describe, it, expect } from 'vitest'
import { getNavigationUrl } from '../components/notifications/NotificationItem'
import type { NotificationData } from '../lib/notifications/types'

const build = (data: Record<string, unknown>, type = 'ai_generation_completed') =>
  ({ id: 'n1', type, title: 't', body: 'b', data, isRead: false, createdAt: '2026-09-08T00:00:00Z' }) as unknown as NotificationData

describe('getNavigationUrl for a finished build', () => {
  it('opens the app it announced, not just the card', () => {
    const url = getNavigationUrl(build({ channelId: 'c1', cardId: 'card1', appId: 'app1' }), {})
    expect(url).toBe('/channel/c1/card/card1?app=app1')
  })

  it('falls back to the channel when the app id is missing', () => {
    // Older notifications predate appId; they should still go somewhere useful.
    const url = getNavigationUrl(build({ channelId: 'c1', cardId: 'card1' }), {})
    expect(url).toBe('/channel/c1')
  })

  it('returns null without a channel to navigate into', () => {
    expect(getNavigationUrl(build({ cardId: 'card1', appId: 'app1' }), {})).toBeNull()
  })

  it('leaves other notification types alone', () => {
    const url = getNavigationUrl(
      build({ channelId: 'c1', cardId: 'card1', appId: 'app1' }, 'card_assigned'),
      {}
    )
    expect(url).toBe('/channel/c1/card/card1')
  })
})
