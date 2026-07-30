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
 * Deliberately does not fire for cards a shroom itself created. A generate shroom
 * writing into a column that another shroom watches is the obvious way to build an
 * accidental loop, and `createdByInstructionId` is the cheapest place to cut it.
 */
export async function runEventTriggers(options: {
  channelId: string
  columnId: string
  eventType: EventTriggerType
  cardId: string
  /** Set when the card was written by a shroom — those don't re-trigger. */
  createdByInstructionId?: string | null
}): Promise<void> {
  const { channelId, columnId, eventType, cardId, createdByInstructionId } = options

  if (createdByInstructionId) return

  const candidates = await db.query.instructionCards.findMany({
    where: eq(instructionCards.channelId, channelId),
  })

  for (const row of candidates) {
    if (!row.isEnabled) continue

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
