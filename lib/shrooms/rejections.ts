import { db } from '@/lib/db'
import { cardRejections } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import type { CardRejection } from '@/lib/types'

/**
 * Load a channel's rejection history for feeding back into shroom prompts.
 *
 * This used to be passed up from the client's localStorage, which meant a shroom only
 * learned from rejections made on the device that ran it. Reading it server-side makes
 * the feedback loop work across devices and survive a store reset.
 */
export async function loadChannelRejections(
  channelId: string,
  limit = 20
): Promise<CardRejection[]> {
  const rows = await db.query.cardRejections.findMany({
    where: eq(cardRejections.channelId, channelId),
    orderBy: [desc(cardRejections.createdAt)],
    limit,
  })

  // Map to the shape buildRejectionContext already understands
  return rows.map((row) => ({
    channelId: row.channelId,
    instructionCardId: row.instructionCardId ?? '',
    rejectedCardTitle: row.cardTitle,
    reason: row.reason as CardRejection['reason'],
    feedback: row.feedback ?? undefined,
    timestamp: (row.createdAt ?? new Date()).toISOString(),
  }))
}
