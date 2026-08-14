import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { BroadcastEvent } from '@/lib/sync/broadcastSync'

/**
 * Event triggers run on the server now, so nothing in the browser knows a shroom woke up.
 * Without these two signals a card you dropped into a watched column sits there looking
 * untouched — no working indicator while the run happens, and no visible result after it,
 * until the board's 60s safety poll comes round.
 */

const timeline: string[] = []

vi.mock('@/lib/db', () => ({
  db: {
    update: () => ({
      set: () => ({
        where: async () => {},
      }),
    }),
  },
}))

vi.mock('@/lib/shrooms/loadChannelForShroom', () => ({
  loadChannelForShroom: async () => ({
    channel: { id: 'chan1', columns: [] },
    cards: {},
    tasks: {},
    ownerId: 'user1',
  }),
}))

vi.mock('@/lib/sync/pusherServer', () => ({
  publishToChannel: async (_channelId: string, event: BroadcastEvent) => {
    if (event.type === 'card:update') {
      const updates = (event as Extract<BroadcastEvent, { type: 'card:update' }>).updates
      timeline.push(updates.isProcessing ? 'processing:on' : 'processing:off')
    } else if (event.type === 'sync:refetch') {
      timeline.push('refetch')
    }
    return true
  },
}))

import { runShroomServerSide } from '@/lib/shrooms/runServerSide'
import type { InstructionCard } from '@/lib/types'

const instruction = {
  id: 'shroom1',
  channelId: 'chan1',
  title: 'Tidy the inbox',
  instructions: 'Rewrite the card, then move it.',
  action: 'modify',
  isEnabled: true,
  target: { type: 'column', columnId: 'col1' },
} as unknown as InstructionCard

function stubRun(body: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      timeline.push('run')
      return { ok: true, json: async () => body } as Response
    })
  )
}

describe('unattended shroom run keeps the board in the loop', () => {
  beforeEach(() => {
    timeline.length = 0
    process.env.INTERNAL_API_SECRET = 'test-secret'
  })

  it('shows the card as working for the length of the run, then clears it', async () => {
    stubRun({ modifiedCards: [{ id: 'card1' }] })

    await runShroomServerSide({
      instruction,
      triggerType: 'event',
      triggeringCardId: 'card1',
    })

    expect(timeline.indexOf('processing:on')).toBeLessThan(timeline.indexOf('run'))
    expect(timeline.indexOf('run')).toBeLessThan(timeline.indexOf('processing:off'))
  })

  it('clears the working state even when the run blows up', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        timeline.push('run')
        throw new Error('model unavailable')
      })
    )

    await runShroomServerSide({
      instruction,
      triggerType: 'event',
      triggeringCardId: 'card1',
    })

    expect(timeline).toContain('processing:off')
  })

  it('tells open boards to refetch once cards actually changed', async () => {
    stubRun({ modifiedCards: [{ id: 'card1' }] })

    await runShroomServerSide({
      instruction,
      triggerType: 'event',
      triggeringCardId: 'card1',
    })

    // After the clear, so the fetch reads a card that is no longer marked as working.
    expect(timeline.indexOf('refetch')).toBeGreaterThan(timeline.indexOf('processing:off'))
  })

  it('stays quiet when the run changed nothing', async () => {
    stubRun({ modifiedCards: [] })

    await runShroomServerSide({
      instruction,
      triggerType: 'event',
      triggeringCardId: 'card1',
    })

    expect(timeline).not.toContain('refetch')
  })

  it('leaves cards alone when no single card set the run off', async () => {
    stubRun({ modifiedCards: [{ id: 'card1' }] })

    await runShroomServerSide({ instruction, triggerType: 'scheduled' })

    expect(timeline).not.toContain('processing:on')
    expect(timeline).not.toContain('processing:off')
  })
})
