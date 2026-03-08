import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { cards, columns, tasks, channels, users } from '@/lib/db/schema'
import { eq, and, gt, sql } from 'drizzle-orm'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { createNotification, createNotificationForChannelMembers } from '@/lib/notifications/createNotification'
import { logChannelActivity } from '@/lib/db/activity'
import { ensureSchema } from '@/lib/db/ensure-schema'

interface RouteParams {
  params: Promise<{ id: string; cardId: string }>
}

/**
 * GET /api/channels/:id/cards/:cardId
 * Get a specific card
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId, cardId } = await params
  const userId = session.user.id

  try {
    await ensureSchema()
    await requirePermission(channelId, userId, 'view')

    const card = await db.query.cards.findFirst({
      where: and(eq(cards.id, cardId), eq(cards.channelId, channelId)),
    })

    if (!card) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    // Also fetch tasks for this card
    const cardTasks = await db.query.tasks.findMany({
      where: eq(tasks.cardId, cardId),
    })

    return NextResponse.json({
      card: {
        ...card,
        summaryUpdatedAt: card.summaryUpdatedAt?.toISOString(),
        createdAt: card.createdAt?.toISOString(),
        updatedAt: card.updatedAt?.toISOString(),
      },
      tasks: cardTasks.map(task => ({
        ...task,
        dueDate: task.dueDate?.toISOString(),
        completedAt: task.completedAt?.toISOString(),
        createdAt: task.createdAt?.toISOString(),
        updatedAt: task.updatedAt?.toISOString(),
      })),
    })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error fetching card:', error)
    return NextResponse.json({ error: 'Failed to fetch card' }, { status: 500 })
  }
}

/**
 * PATCH /api/channels/:id/cards/:cardId
 * Update a card
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId, cardId } = await params
  const userId = session.user.id

  try {
    await ensureSchema()
    await requirePermission(channelId, userId, 'edit')

    // Verify card belongs to this channel
    const existingCard = await db.query.cards.findFirst({
      where: and(eq(cards.id, cardId), eq(cards.channelId, channelId)),
    })

    if (!existingCard) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    const body = await req.json()
    const {
      title,
      messages,
      coverImageUrl,
      summary,
      properties,
      tags,
      assignedTo,
      hideCompletedTasks,
      processedByInstructions,
      spawnedChannelIds,
      position,
      isPublic,
      shareToken,
    } = body

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (title !== undefined) updates.title = title
    if (position !== undefined) updates.position = position
    if (messages !== undefined) updates.messages = messages
    if (coverImageUrl !== undefined) updates.coverImageUrl = coverImageUrl
    if (summary !== undefined) {
      updates.summary = summary
      updates.summaryUpdatedAt = new Date()
    }
    if (properties !== undefined) updates.properties = properties
    if (tags !== undefined) updates.tags = tags
    if (assignedTo !== undefined) updates.assignedTo = assignedTo
    if (hideCompletedTasks !== undefined) updates.hideCompletedTasks = hideCompletedTasks
    if (processedByInstructions !== undefined) updates.processedByInstructions = processedByInstructions
    if (spawnedChannelIds !== undefined) updates.spawnedChannelIds = spawnedChannelIds
    if (isPublic !== undefined) updates.isPublic = isPublic
    if (shareToken !== undefined) updates.shareToken = shareToken

    await db.update(cards).set(updates).where(eq(cards.id, cardId))

    const updatedCard = await db.query.cards.findFirst({
      where: eq(cards.id, cardId),
    })

    // Log activity for digests
    if (body.columnId !== undefined && body.columnId !== existingCard.columnId) {
      logChannelActivity(channelId, userId, 'card_moved', 'card', cardId, { title: updatedCard?.title }).catch(() => {})
    } else {
      logChannelActivity(channelId, userId, 'card_updated', 'card', cardId, { title: updatedCard?.title }).catch(() => {})
    }

    // Notify on card assignment changes
    if (assignedTo !== undefined && updatedCard) {
      const oldAssigned = (existingCard.assignedTo as string[] | null) ?? []
      const newAssigned = (assignedTo as string[]) ?? []
      const newlyAssigned = newAssigned.filter(id => !oldAssigned.includes(id) && id !== userId)
      if (newlyAssigned.length > 0) {
        const [assigner, channel] = await Promise.all([
          db.query.users.findFirst({ where: eq(users.id, userId), columns: { name: true } }),
          db.query.channels.findFirst({ where: eq(channels.id, channelId), columns: { name: true } }),
        ])
        for (const assigneeId of newlyAssigned) {
          createNotification({
            userId: assigneeId,
            type: 'card_assigned',
            title: 'Card assigned to you',
            body: updatedCard.title,
            data: {
              channelId,
              cardId,
              assignerName: assigner?.name || 'Someone',
              channelName: channel?.name || 'a channel',
            },
          }).catch(() => {})
        }
      }
    }

    // Notify on card move (columnId change) in shared channels
    if (body.columnId !== undefined && body.columnId !== existingCard.columnId && updatedCard) {
      createNotificationForChannelMembers(channelId, userId, {
        type: 'card_moved_by_other',
        title: 'Card moved',
        body: `"${updatedCard.title}" was moved`,
        data: { channelId, cardId },
      }).catch(() => {})
    }

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
    console.error('Error updating card:', error)
    return NextResponse.json({ error: 'Failed to update card' }, { status: 500 })
  }
}

/**
 * DELETE /api/channels/:id/cards/:cardId
 * Delete a card
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId, cardId } = await params
  const userId = session.user.id

  try {
    await ensureSchema()
    await requirePermission(channelId, userId, 'edit')

    // Verify card belongs to this channel
    const existingCard = await db.query.cards.findFirst({
      where: and(eq(cards.id, cardId), eq(cards.channelId, channelId)),
    })

    if (!existingCard) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    const { columnId, position, isArchived } = existingCard

    // Log activity for digests
    logChannelActivity(channelId, userId, 'card_deleted', 'card', cardId, { title: existingCard.title }).catch(() => {})

    // Delete tasks associated with this card (cascade should handle this, but explicit)
    await db.delete(tasks).where(eq(tasks.cardId, cardId))

    // Delete the card
    await db.delete(cards).where(eq(cards.id, cardId))

    // Shift positions of remaining cards in the column
    await db
      .update(cards)
      .set({ position: sql`${cards.position} - 1` })
      .where(
        and(
          eq(cards.columnId, columnId),
          eq(cards.isArchived, isArchived ?? false),
          gt(cards.position, position)
        )
      )

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error deleting card:', error)
    return NextResponse.json({ error: 'Failed to delete card' }, { status: 500 })
  }
}
