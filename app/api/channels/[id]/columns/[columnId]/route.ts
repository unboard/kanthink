import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { columns, cards } from '@/lib/db/schema'
import { eq, and, gt, sql, asc } from 'drizzle-orm'
import { requirePermission, PermissionError } from '@/lib/api/permissions'

interface RouteParams {
  params: Promise<{ id: string; columnId: string }>
}

/**
 * GET /api/channels/:id/columns/:columnId
 * Get a specific column with its cards
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId, columnId } = await params
  const userId = session.user.id

  try {
    await requirePermission(channelId, userId, 'view')

    const column = await db.query.columns.findFirst({
      where: and(eq(columns.id, columnId), eq(columns.channelId, channelId)),
    })

    if (!column) {
      return NextResponse.json({ error: 'Column not found' }, { status: 404 })
    }

    // Get cards in this column
    const columnCards = await db.query.cards.findMany({
      where: eq(cards.columnId, columnId),
      orderBy: [asc(cards.position)],
    })

    return NextResponse.json({
      column: {
        ...column,
        createdAt: column.createdAt?.toISOString(),
        updatedAt: column.updatedAt?.toISOString(),
      },
      cards: columnCards.map(card => ({
        ...card,
        summaryUpdatedAt: card.summaryUpdatedAt?.toISOString(),
        createdAt: card.createdAt?.toISOString(),
        updatedAt: card.updatedAt?.toISOString(),
      })),
    })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error fetching column:', error)
    return NextResponse.json({ error: 'Failed to fetch column' }, { status: 500 })
  }
}

/**
 * PATCH /api/channels/:id/columns/:columnId
 * Update a column
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId, columnId } = await params
  const userId = session.user.id

  try {
    await requirePermission(channelId, userId, 'edit')

    // Verify column belongs to this channel
    const existingColumn = await db.query.columns.findFirst({
      where: and(eq(columns.id, columnId), eq(columns.channelId, channelId)),
    })

    if (!existingColumn) {
      return NextResponse.json({ error: 'Column not found' }, { status: 404 })
    }

    const body = await req.json()
    const { name, instructions, processingPrompt, autoProcess, isAiTarget } = body

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (name !== undefined) updates.name = name
    if (instructions !== undefined) updates.instructions = instructions
    if (processingPrompt !== undefined) updates.processingPrompt = processingPrompt
    if (autoProcess !== undefined) updates.autoProcess = autoProcess
    if (isAiTarget !== undefined) updates.isAiTarget = isAiTarget

    await db.update(columns).set(updates).where(eq(columns.id, columnId))

    const updatedColumn = await db.query.columns.findFirst({
      where: eq(columns.id, columnId),
    })

    return NextResponse.json({
      column: {
        ...updatedColumn,
        createdAt: updatedColumn?.createdAt?.toISOString(),
        updatedAt: updatedColumn?.updatedAt?.toISOString(),
      },
    })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error updating column:', error)
    return NextResponse.json({ error: 'Failed to update column' }, { status: 500 })
  }
}

/**
 * DELETE /api/channels/:id/columns/:columnId
 * Delete a column (moves cards to first column)
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId, columnId } = await params
  const userId = session.user.id

  try {
    await requirePermission(channelId, userId, 'edit')

    // Get all columns for this channel
    const channelColumns = await db.query.columns.findMany({
      where: eq(columns.channelId, channelId),
      orderBy: [asc(columns.position)],
    })

    // Don't allow deleting the last column
    if (channelColumns.length <= 1) {
      return NextResponse.json(
        { error: 'Cannot delete the last column' },
        { status: 400 }
      )
    }

    // Find the column to delete
    const columnToDelete = channelColumns.find(c => c.id === columnId)
    if (!columnToDelete) {
      return NextResponse.json({ error: 'Column not found' }, { status: 404 })
    }

    // Find the first column (or second if deleting first)
    const targetColumn =
      channelColumns[0].id === columnId ? channelColumns[1] : channelColumns[0]

    // Move all cards to the target column
    // First, get the max position in target column
    const targetCards = await db.query.cards.findMany({
      where: and(eq(cards.columnId, targetColumn.id), eq(cards.isArchived, false)),
      orderBy: [asc(cards.position)],
    })
    const maxPosition = targetCards.length > 0 ? targetCards[targetCards.length - 1].position : -1

    // Get cards from column being deleted
    const cardsToMove = await db.query.cards.findMany({
      where: eq(cards.columnId, columnId),
      orderBy: [asc(cards.position)],
    })

    // Move each card to target column with new positions
    for (let i = 0; i < cardsToMove.length; i++) {
      await db
        .update(cards)
        .set({
          columnId: targetColumn.id,
          position: maxPosition + 1 + i,
          updatedAt: new Date(),
        })
        .where(eq(cards.id, cardsToMove[i].id))
    }

    // If deleting AI target column, transfer that to target column
    if (columnToDelete.isAiTarget) {
      await db
        .update(columns)
        .set({ isAiTarget: true, updatedAt: new Date() })
        .where(eq(columns.id, targetColumn.id))
    }

    // Delete the column
    await db.delete(columns).where(eq(columns.id, columnId))

    // Shift positions of remaining columns
    await db
      .update(columns)
      .set({ position: sql`${columns.position} - 1` })
      .where(
        and(eq(columns.channelId, channelId), gt(columns.position, columnToDelete.position))
      )

    return NextResponse.json({
      success: true,
      movedCardsTo: targetColumn.id,
      movedCardsCount: cardsToMove.length,
    })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error deleting column:', error)
    return NextResponse.json({ error: 'Failed to delete column' }, { status: 500 })
  }
}
