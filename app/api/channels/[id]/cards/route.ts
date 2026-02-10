import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { cards, columns } from '@/lib/db/schema'
import { eq, and, asc, desc, gt, gte, sql } from 'drizzle-orm'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { nanoid } from 'nanoid'
import { createNotificationForChannelMembers } from '@/lib/notifications/createNotification'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/channels/:id/cards
 * Create a new card
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
    const {
      id: clientId,
      columnId,
      title,
      initialMessage,
      source = 'manual',
      createdByInstructionId,
      position: requestedPosition,
    } = body

    if (!columnId || !title) {
      return NextResponse.json(
        { error: 'columnId and title are required' },
        { status: 400 }
      )
    }

    // Verify column belongs to this channel
    const column = await db.query.columns.findFirst({
      where: and(eq(columns.id, columnId), eq(columns.channelId, channelId)),
    })

    if (!column) {
      return NextResponse.json({ error: 'Column not found' }, { status: 404 })
    }

    // Get max position in column
    const existingCards = await db.query.cards.findMany({
      where: and(
        eq(cards.columnId, columnId),
        eq(cards.isArchived, false)
      ),
      orderBy: [desc(cards.position)],
      limit: 1,
    })

    const maxPosition = existingCards.length > 0 ? existingCards[0].position : -1
    const position = requestedPosition !== undefined ? requestedPosition : maxPosition + 1

    // If inserting at a specific position, shift other cards
    if (requestedPosition !== undefined) {
      await db
        .update(cards)
        .set({ position: sql`${cards.position} + 1` })
        .where(
          and(
            eq(cards.columnId, columnId),
            eq(cards.isArchived, false),
            gte(cards.position, requestedPosition)
          )
        )
    }

    // Use client-provided ID if given (for optimistic sync), otherwise generate
    const cardId = clientId || nanoid()
    const now = new Date()
    const nowIso = now.toISOString()

    // Build messages array
    const messages = initialMessage
      ? [
          {
            id: nanoid(),
            type: 'note' as const,
            content: initialMessage,
            createdAt: nowIso,
          },
        ]
      : []

    await db.insert(cards).values({
      id: cardId,
      channelId,
      columnId,
      title,
      messages,
      source,
      position,
      createdByInstructionId,
      createdAt: now,
      updatedAt: now,
    })

    const createdCard = await db.query.cards.findFirst({
      where: eq(cards.id, cardId),
    })

    // Notify channel members about new card
    if (createdCard) {
      createNotificationForChannelMembers(channelId, userId, {
        type: 'card_added_by_other',
        title: 'New card added',
        body: `"${title}" was added`,
        data: { channelId, cardId },
      }).catch(() => {})
    }

    return NextResponse.json(
      {
        card: {
          ...createdCard,
          summaryUpdatedAt: createdCard?.summaryUpdatedAt?.toISOString(),
          createdAt: createdCard?.createdAt?.toISOString(),
          updatedAt: createdCard?.updatedAt?.toISOString(),
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error creating card:', error)
    return NextResponse.json({ error: 'Failed to create card' }, { status: 500 })
  }
}
