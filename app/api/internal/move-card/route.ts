import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cards, columns, channels } from '@/lib/db/schema'
import { eq, and, gt, gte, sql } from 'drizzle-orm'
import { publishToChannel } from '@/lib/sync/pusherServer'
import { generateEventId } from '@/lib/sync/broadcastSync'

/**
 * POST /api/internal/move-card
 * Internal endpoint for scripts to move cards between columns.
 * Authenticated via INTERNAL_API_SECRET header, not user session.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret')
  const expectedSecret = process.env.INTERNAL_API_SECRET

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { cardId, toColumnId } = body

  if (!cardId || !toColumnId) {
    return NextResponse.json(
      { error: 'cardId and toColumnId are required' },
      { status: 400 }
    )
  }

  // Get the card
  const card = await db.query.cards.findFirst({
    where: eq(cards.id, cardId),
  })

  if (!card) {
    return NextResponse.json({ error: 'Card not found' }, { status: 404 })
  }

  // Verify target column exists and get its channel
  const targetColumn = await db.query.columns.findFirst({
    where: eq(columns.id, toColumnId),
  })

  if (!targetColumn) {
    return NextResponse.json({ error: 'Target column not found' }, { status: 404 })
  }

  const fromColumnId = card.columnId
  const fromPosition = card.position

  // Get the next position in the target column
  const maxPosResult = await db
    .select({ maxPos: sql<number>`COALESCE(MAX(${cards.position}), -1)` })
    .from(cards)
    .where(and(eq(cards.columnId, toColumnId), eq(cards.isArchived, false)))

  const toPosition = (maxPosResult[0]?.maxPos ?? -1) + 1

  // Remove from old column (shift positions up)
  await db
    .update(cards)
    .set({ position: sql`${cards.position} - 1` })
    .where(
      and(
        eq(cards.columnId, fromColumnId),
        eq(cards.isArchived, card.isArchived ?? false),
        gt(cards.position, fromPosition)
      )
    )

  // Update the card
  await db
    .update(cards)
    .set({
      columnId: toColumnId,
      position: toPosition,
      updatedAt: new Date(),
    })
    .where(eq(cards.id, cardId))

  // Broadcast via Pusher so clients update in real-time
  const channelId = card.channelId
  const eventId = generateEventId()
  await publishToChannel(
    channelId,
    {
      type: 'card:move',
      cardId,
      channelId,
      fromColumnId,
      toColumnId,
      toIndex: toPosition,
    },
    'internal-script',
    eventId
  )

  return NextResponse.json({
    success: true,
    card: { id: cardId, fromColumnId, toColumnId, toPosition },
  })
}
