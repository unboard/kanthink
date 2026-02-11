import { NextRequest, NextResponse } from 'next/server'
import { auth, isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  channels,
  columns,
  cards,
  tasks,
  instructionCards,
  userChannelOrg,
  channelShares,
  users,
} from '@/lib/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import {
  requirePermission,
  PermissionError,
  getChannelPermission,
  SharedByInfo,
} from '@/lib/api/permissions'
import { ensureSchema } from '@/lib/db/ensure-schema'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/channels/:id
 * Get a channel with all its data (columns, cards, tasks, instructions)
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId } = await params
  const userId = session.user.id

  try {
    await ensureSchema()

    const userEmail = session.user.email
    const permission = await requirePermission(channelId, userId, 'view', userEmail)

    // Fetch channel
    const channel = await db.query.channels.findFirst({
      where: eq(channels.id, channelId),
    })

    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    }

    // Fetch columns ordered by position
    const channelColumns = await db.query.columns.findMany({
      where: eq(columns.channelId, channelId),
      orderBy: [asc(columns.position)],
    })

    // Fetch cards ordered by position
    const channelCards = await db.query.cards.findMany({
      where: eq(cards.channelId, channelId),
      orderBy: [asc(cards.position)],
    })

    // Fetch tasks
    const channelTasks = await db.query.tasks.findMany({
      where: eq(tasks.channelId, channelId),
      orderBy: [asc(tasks.position)],
    })

    // Fetch instruction cards ordered by position
    const channelInstructions = await db.query.instructionCards.findMany({
      where: eq(instructionCards.channelId, channelId),
      orderBy: [asc(instructionCards.position)],
    })

    // Get sharedBy info if user is not the owner
    let sharedBy: SharedByInfo | undefined
    if (!permission.isOwner && channel.ownerId) {
      const owner = await db.query.users.findFirst({
        where: eq(users.id, channel.ownerId),
        columns: { id: true, name: true, email: true, image: true },
      })
      if (owner) {
        sharedBy = {
          id: owner.id,
          name: owner.name,
          email: owner.email ?? '',
          image: owner.image,
        }
      }
    }

    return NextResponse.json({
      channel: {
        ...channel,
        role: permission.role,
        sharedBy,
        createdAt: channel.createdAt?.toISOString(),
        updatedAt: channel.updatedAt?.toISOString(),
      },
      columns: channelColumns.map(col => ({
        ...col,
        createdAt: col.createdAt?.toISOString(),
        updatedAt: col.updatedAt?.toISOString(),
      })),
      cards: channelCards.map(card => ({
        ...card,
        summaryUpdatedAt: card.summaryUpdatedAt?.toISOString(),
        createdAt: card.createdAt?.toISOString(),
        updatedAt: card.updatedAt?.toISOString(),
      })),
      tasks: channelTasks.map(task => ({
        ...task,
        dueDate: task.dueDate?.toISOString(),
        completedAt: task.completedAt?.toISOString(),
        createdAt: task.createdAt?.toISOString(),
        updatedAt: task.updatedAt?.toISOString(),
      })),
      instructionCards: channelInstructions.map(ic => ({
        ...ic,
        lastExecutedAt: ic.lastExecutedAt?.toISOString(),
        nextScheduledRun: ic.nextScheduledRun?.toISOString(),
        dailyCountResetAt: ic.dailyCountResetAt?.toISOString(),
        createdAt: ic.createdAt?.toISOString(),
        updatedAt: ic.updatedAt?.toISOString(),
      })),
    })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error fetching channel:', error)
    return NextResponse.json({ error: 'Failed to fetch channel' }, { status: 500 })
  }
}

/**
 * PATCH /api/channels/:id
 * Update a channel
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId } = await params
  const userId = session.user.id

  try {
    const userEmail = session.user.email
    const permission = await requirePermission(channelId, userId, 'edit', userEmail)

    const body = await req.json()
    const {
      name,
      description,
      status,
      aiInstructions,
      includeBacksideInAI,
      suggestionMode,
      propertyDefinitions,
      tagDefinitions,
      questions,
      instructionHistory,
      unlinkedTaskOrder,
      isGlobalHelp,
    } = body

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (status !== undefined) updates.status = status
    if (aiInstructions !== undefined) updates.aiInstructions = aiInstructions
    if (includeBacksideInAI !== undefined) updates.includeBacksideInAI = includeBacksideInAI
    if (suggestionMode !== undefined) updates.suggestionMode = suggestionMode
    if (propertyDefinitions !== undefined) updates.propertyDefinitions = propertyDefinitions
    if (tagDefinitions !== undefined) updates.tagDefinitions = tagDefinitions
    if (questions !== undefined) updates.questions = questions
    if (instructionHistory !== undefined) updates.instructionHistory = instructionHistory
    if (unlinkedTaskOrder !== undefined) updates.unlinkedTaskOrder = unlinkedTaskOrder

    // Handle isGlobalHelp toggle (admin only, owner only)
    if (isGlobalHelp !== undefined) {
      if (!isAdmin(session.user.email)) {
        return NextResponse.json({ error: 'Only admin can set global help status' }, { status: 403 })
      }
      if (!permission.isOwner) {
        return NextResponse.json({ error: 'Can only mark owned channels as global' }, { status: 403 })
      }
      updates.isGlobalHelp = isGlobalHelp
    }

    await db.update(channels).set(updates).where(eq(channels.id, channelId))

    const updatedChannel = await db.query.channels.findFirst({
      where: eq(channels.id, channelId),
    })

    return NextResponse.json({
      channel: {
        ...updatedChannel,
        createdAt: updatedChannel?.createdAt?.toISOString(),
        updatedAt: updatedChannel?.updatedAt?.toISOString(),
      },
    })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error updating channel:', error)
    return NextResponse.json({ error: 'Failed to update channel' }, { status: 500 })
  }
}

/**
 * DELETE /api/channels/:id
 * Delete a channel (owner only)
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId } = await params
  const userId = session.user.id

  try {
    const userEmail = session.user.email
    await requirePermission(channelId, userId, 'delete', userEmail)

    // Delete in order to handle foreign key constraints
    // (Most of these cascade, but explicit is clearer)

    // Delete instruction cards
    await db.delete(instructionCards).where(eq(instructionCards.channelId, channelId))

    // Delete tasks
    await db.delete(tasks).where(eq(tasks.channelId, channelId))

    // Delete cards
    await db.delete(cards).where(eq(cards.channelId, channelId))

    // Delete columns
    await db.delete(columns).where(eq(columns.channelId, channelId))

    // Delete shares
    await db.delete(channelShares).where(eq(channelShares.channelId, channelId))

    // Delete organization entries
    await db.delete(userChannelOrg).where(eq(userChannelOrg.channelId, channelId))

    // Delete the channel
    await db.delete(channels).where(eq(channels.id, channelId))

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error deleting channel:', error)
    return NextResponse.json({ error: 'Failed to delete channel' }, { status: 500 })
  }
}
