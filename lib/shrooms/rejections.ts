import { db } from '@/lib/db'
import { cardRejections } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import type { CardRejection } from '@/lib/types'

type RejectionRow = typeof cardRejections.$inferSelect

function toRejection(row: RejectionRow): CardRejection {
  return {
    channelId: row.channelId,
    instructionCardId: row.instructionCardId ?? '',
    rejectedCardTitle: row.cardTitle,
    reason: row.reason as CardRejection['reason'],
    feedback: row.feedback ?? undefined,
    timestamp: (row.createdAt ?? new Date()).toISOString(),
  }
}

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

  return rows.map(toRejection)
}

/**
 * Load what one shroom has been told no about, plus a little channel context.
 *
 * Two queries rather than one, because they answer different questions and a single
 * newest-first channel query cannot answer the first. A shroom that runs monthly sits
 * behind weeks of other shrooms' rejections, so its own lessons fell off the end of the
 * list and it kept making the same card it had already been told no about — while being
 * told, at length, what some other shroom got wrong.
 *
 * The shroom's own rejections come first and are never crowded out. A handful of the
 * channel's other recent ones ride along; `buildRejectionContext` labels them as the
 * weaker signal they are.
 */
export async function loadRejectionsForShroom(
  channelId: string,
  instructionCardId: string,
  ownLimit = 20,
  channelLimit = 10
): Promise<CardRejection[]> {
  const [own, channelWide] = await Promise.all([
    db.query.cardRejections.findMany({
      where: and(
        eq(cardRejections.channelId, channelId),
        eq(cardRejections.instructionCardId, instructionCardId)
      ),
      orderBy: [desc(cardRejections.createdAt)],
      limit: ownLimit,
    }),
    db.query.cardRejections.findMany({
      where: eq(cardRejections.channelId, channelId),
      orderBy: [desc(cardRejections.createdAt)],
      limit: channelLimit,
    }),
  ])

  // The channel query can return rows the shroom query already found; dedupe on id so
  // a rejection is never counted twice in the prompt's own tallies.
  const seen = new Set(own.map((r) => r.id))
  const merged = [...own, ...channelWide.filter((r) => !seen.has(r.id))]

  return merged.map(toRejection)
}
