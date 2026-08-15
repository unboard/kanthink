import { db } from '@/lib/db'
import { instructionCards } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { runShroomServerSide, rowToInstructionCard } from '@/lib/shrooms/runServerSide'
import type { AutomaticTrigger, EventTrigger, EventTriggerType } from '@/lib/types'

/**
 * Run any shroom watching for this event, with no browser open.
 *
 * Event triggers used to fire only from AutomationProvider's in-tab event bus, which
 * meant "run when a card lands in Inbox" quietly stopped working the moment you closed
 * the board — the one time you'd most want it working.
 *
 * A shroom never re-triggers on its own output, and that is the whole of the loop
 * prevention here. It used to skip cards created by *any* shroom, which quietly meant an
 * AI-generated card could never trigger anything again for the rest of its life — drag one
 * into a watched column by hand and nothing happened, forever. Nothing else was defending
 * against: a shroom's own writes go straight to the database (lib/shrooms/apply.ts) and
 * never re-enter this function, so every event that reaches here is a person or an inbound
 * API call. Per-shroom daily caps remain the backstop.
 */
export async function runEventTriggers(options: {
  channelId: string
  columnId: string
  eventType: EventTriggerType
  cardId: string
  /** Set when the card was written by a shroom — that shroom won't act on it again. */
  createdByInstructionId?: string | null
}): Promise<void> {
  const { channelId, columnId, eventType, cardId, createdByInstructionId } = options

  const candidates = await db.query.instructionCards.findMany({
    where: eq(instructionCards.channelId, channelId),
  })

  for (const row of candidates) {
    if (!row.isEnabled) continue
    if (createdByInstructionId && createdByInstructionId === row.id) continue

    const instruction = rowToInstructionCard(row)
    const matches = (instruction.triggers ?? []).some((t: AutomaticTrigger) => {
      if (t.type !== 'event') return false
      const event = t as EventTrigger
      return event.eventType === eventType && event.columnId === columnId
    })
    if (!matches) continue

    const result = await runShroomServerSide({
      instruction,
      triggerType: 'event',
      triggeringCardId: cardId,
    })

    if (result.status !== 'ran') {
      console.info(`[shrooms/event] "${instruction.title}" ${result.status}: ${result.detail}`)
    }
  }
}
