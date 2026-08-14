import { db } from '@/lib/db'
import { cards } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { publishToChannel } from '@/lib/sync/pusherServer'
import { generateEventId } from '@/lib/sync/broadcastSync'

/**
 * Put a card into (or out of) the "Kan is working on this" state from the server.
 *
 * The in-browser automation engine used to set this on the store directly, so a shroom
 * firing on a card showed the working shimmer on that card. Event triggers moved
 * server-side (lib/shrooms/runEventTriggers.ts) so they'd fire with no tab open, and the
 * indicator was left behind: a shroom that rewrote a card and then moved it looked, for
 * the several seconds it took, like the drag had simply done nothing.
 *
 * Written to the row *and* pushed, on purpose. The push is what makes it appear instantly
 * on an open board; the row is what keeps it there across a refetch mid-run, and what
 * shows it to a board opened while the run is still going.
 *
 * Never throws — a run must not fail because its progress indicator couldn't be drawn.
 */
export async function setCardProcessingServerSide(options: {
  cardId: string
  channelId: string
  /** The status to show, or null to clear the state. */
  status: string | null
}): Promise<void> {
  const { cardId, channelId, status } = options
  const isProcessing = status !== null

  try {
    await db
      .update(cards)
      .set({
        isProcessing,
        processingStatus: isProcessing ? status : null,
      })
      .where(eq(cards.id, cardId))

    await publishToChannel(
      channelId,
      {
        type: 'card:update',
        id: cardId,
        // Empty string rather than undefined: JSON drops undefined keys in transit, so
        // the client would keep the stale status text on its card.
        updates: { isProcessing, processingStatus: isProcessing ? status : '' },
      },
      'shroom-server',
      generateEventId()
    )
  } catch (error) {
    console.warn('[shrooms] could not update card processing state:', error)
  }
}
