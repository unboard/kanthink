import { db } from '@/lib/db'
import { channels, columns, cards, tasks } from '@/lib/db/schema'
import { asc, eq } from 'drizzle-orm'
import type { Channel, Card, Task } from '@/lib/types'

/**
 * Materialize a channel from the database into the shapes the run-instruction planner
 * expects.
 *
 * This is the server-side mirror of the split in ServerSyncProvider.tsx: cards fan out
 * into a column's active / review / archived buckets, and only the active ones become
 * `cardIds`. Needed because cron has no browser and therefore no Zustand store to read
 * the channel out of.
 */
export interface LoadedChannel {
  channel: Channel
  cards: Record<string, Card>
  tasks: Record<string, Task>
  ownerId: string
}

const iso = (d: Date | null | undefined) => (d ?? new Date()).toISOString()

export async function loadChannelForShroom(channelId: string): Promise<LoadedChannel | null> {
  const channelRow = await db.query.channels.findFirst({
    where: eq(channels.id, channelId),
  })
  if (!channelRow) return null

  const [columnRows, cardRows, taskRows] = await Promise.all([
    db.query.columns.findMany({
      where: eq(columns.channelId, channelId),
      orderBy: [asc(columns.position)],
    }),
    db.query.cards.findMany({
      where: eq(cards.channelId, channelId),
      orderBy: [asc(cards.position)],
    }),
    db.query.tasks.findMany({
      where: eq(tasks.channelId, channelId),
      orderBy: [asc(tasks.position)],
    }),
  ])

  const cardMap: Record<string, Card> = {}
  for (const row of cardRows) {
    cardMap[row.id] = {
      id: row.id,
      channelId: row.channelId,
      title: row.title,
      messages: (row.messages ?? []) as Card['messages'],
      summary: row.summary ?? undefined,
      source: (row.source ?? 'manual') as Card['source'],
      tags: row.tags ?? undefined,
      assignedTo: row.assignedTo ?? undefined,
      createdByInstructionId: row.createdByInstructionId ?? undefined,
      processedByInstructions: row.processedByInstructions ?? undefined,
      reviewRunId: row.reviewRunId ?? undefined,
      cardType: row.cardType ?? undefined,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    }
  }

  const taskMap: Record<string, Task> = {}
  for (const row of taskRows) {
    taskMap[row.id] = {
      id: row.id,
      channelId: row.channelId,
      cardId: row.cardId ?? undefined,
      title: row.title,
      description: row.description ?? '',
      status: (row.status ?? 'not_started') as Task['status'],
      assignedTo: row.assignedTo ?? undefined,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    } as Task
  }

  // Attach card-owned tasks, mirroring ServerSyncProvider
  for (const row of taskRows) {
    if (row.cardId && cardMap[row.cardId]) {
      const card = cardMap[row.cardId]
      card.taskIds = [...(card.taskIds ?? []), row.id]
    }
  }

  const channel: Channel = {
    id: channelRow.id,
    name: channelRow.name,
    description: channelRow.description ?? '',
    aiInstructions: channelRow.aiInstructions ?? '',
    status: (channelRow.status ?? 'active') as Channel['status'],
    columns: columnRows.map((col) => {
      const colCards = cardRows.filter((c) => c.columnId === col.id)
      return {
        id: col.id,
        name: col.name,
        instructions: col.instructions ?? undefined,
        isAiTarget: col.isAiTarget ?? undefined,
        // Only active cards. Pending-review output isn't on the board yet, and archived
        // cards are the backside — neither should feed a shroom's view of the channel.
        cardIds: colCards
          .filter((c) => !c.isArchived && !c.isPendingReview)
          .map((c) => c.id),
        backsideCardIds: colCards.filter((c) => c.isArchived).map((c) => c.id),
        reviewCardIds: colCards.filter((c) => !c.isArchived && c.isPendingReview).map((c) => c.id),
      }
    }),
    createdAt: iso(channelRow.createdAt),
    updatedAt: iso(channelRow.updatedAt),
  } as Channel

  return { channel, cards: cardMap, tasks: taskMap, ownerId: channelRow.ownerId }
}
