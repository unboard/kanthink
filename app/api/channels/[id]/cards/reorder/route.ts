import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { cards, columns } from '@/lib/db/schema'
import { eq, and, gte, lte, gt, lt, sql } from 'drizzle-orm'
import { requirePermission, PermissionError } from '@/lib/api/permissions'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/channels/:id/cards/reorder
 * Move a card to a new position (within same column or to different column)
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId } = await params
  const userId = session.user.id

  try {
    await requirePermission(channelId, userId, 'edit')

    const body = await req.json()
    const { cardId, toColumnId, toPosition, isArchived = false } = body

    if (!cardId || !toColumnId || toPosition === undefined) {
      return NextResponse.json(
        { error: 'cardId, toColumnId, and toPosition are required' },
        { status: 400 }
      )
    }

    // Get the card
    const card = await db.query.cards.findFirst({
      where: and(eq(cards.id, cardId), eq(cards.channelId, channelId)),
    })

    if (!card) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    // Verify target column belongs to this channel
    const targetColumn = await db.query.columns.findFirst({
      where: and(eq(columns.id, toColumnId), eq(columns.channelId, channelId)),
    })

    if (!targetColumn) {
      return NextResponse.json({ error: 'Target column not found' }, { status: 404 })
    }

    const fromColumnId = card.columnId
    const fromPosition = card.position
    const wasArchived = card.isArchived ?? false

    // Handle different move scenarios
    if (fromColumnId === toColumnId && wasArchived === isArchived) {
      // Moving within the same column (same archive state)
      if (fromPosition === toPosition) {
        // No change needed
        return NextResponse.json({ success: true })
      }

      if (fromPosition < toPosition) {
        // Moving down: shift cards between old and new position up
        await db
          .update(cards)
          .set({ position: sql`${cards.position} - 1` })
          .where(
            and(
              eq(cards.columnId, fromColumnId),
              eq(cards.isArchived, isArchived),
              gt(cards.position, fromPosition),
              lte(cards.position, toPosition)
            )
          )
      } else {
        // Moving up: shift cards between new and old position down
        await db
          .update(cards)
          .set({ position: sql`${cards.position} + 1` })
          .where(
            and(
              eq(cards.columnId, fromColumnId),
              eq(cards.isArchived, isArchived),
              gte(cards.position, toPosition),
              lt(cards.position, fromPosition)
            )
          )
      }

      // Update the card's position
      await db.update(cards).set({ position: toPosition, updatedAt: new Date() }).where(eq(cards.id, cardId))
    } else {
      // Moving to a different column or changing archive state

      // Remove from old column (shift positions up)
      await db
        .update(cards)
        .set({ position: sql`${cards.position} - 1` })
        .where(
          and(
            eq(cards.columnId, fromColumnId),
            eq(cards.isArchived, wasArchived),
            gt(cards.position, fromPosition)
          )
        )

      // Make room in new column (shift positions down)
      await db
        .update(cards)
        .set({ position: sql`${cards.position} + 1` })
        .where(
          and(
            eq(cards.columnId, toColumnId),
            eq(cards.isArchived, isArchived),
            gte(cards.position, toPosition)
          )
        )

      // Update the card
      await db
        .update(cards)
        .set({
          columnId: toColumnId,
          position: toPosition,
          isArchived,
          updatedAt: new Date(),
        })
        .where(eq(cards.id, cardId))
    }

    const updatedCard = await db.query.cards.findFirst({
      where: eq(cards.id, cardId),
    })

    return NextResponse.json({
      card: {
        ...updatedCard,
        summaryUpdatedAt: updatedCard?.summaryUpdatedAt?.toISOString(),
        createdAt: updatedCard?.createdAt?.toISOString(),
        updatedAt: updatedCard?.updatedAt?.toISOString(),
      },
    })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error reordering card:', error)
    return NextResponse.json({ error: 'Failed to reorder card' }, { status: 500 })
  }
}
