/**
 * A new card must survive a refetch that started before it was created.
 *
 * On mobile: tap +, the card appears, a background refetch that began a moment
 * earlier lands without it, and the card vanishes from the screen while existing on
 * the server — to turn up later as a blank "Untitled" card nobody could see or delete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api/client', () => ({ createCard: vi.fn(async () => ({})) }))
vi.mock('@/lib/toastStore', () => ({ useToastStore: { getState: () => ({ addToast: vi.fn() }) } }))

import { enableServerMode, getPendingCardIds, syncCardCreate } from '@/lib/api/sync'

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('new cards and stale refetches', () => {
  beforeEach(() => enableServerMode())

  it('protects a card while its create is in flight', () => {
    syncCardCreate('ch', 'card-in-flight', { columnId: 'col', title: 'Untitled' })
    expect(getPendingCardIds().has('card-in-flight')).toBe(true)
  })

  it('keeps protecting it for a while after the server confirms it', async () => {
    syncCardCreate('ch', 'card-confirmed', { columnId: 'col', title: 'Untitled' })
    await flush()
    // The create has finished; a refetch that started before it can still land.
    expect(getPendingCardIds().has('card-confirmed')).toBe(true)
  })

  it('lets it go once the grace period is over', async () => {
    const realNow = Date.now
    syncCardCreate('ch', 'card-old', { columnId: 'col', title: 'Untitled' })
    await flush()
    Date.now = () => realNow() + 61_000
    try {
      expect(getPendingCardIds().has('card-old')).toBe(false)
    } finally {
      Date.now = realNow
    }
  })
})
