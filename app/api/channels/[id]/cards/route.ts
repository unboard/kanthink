import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { cards, columns } from '@/lib/db/schema'
import { eq, and, asc, desc, gt, gte, sql } from 'drizzle-orm'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { nanoid } from 'nanoid'
import { createNotificationForChannelMembers } from '@/lib/notifications/createNotification'
import { logChannelActivity } from '@/lib/db/activity'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { inColumnBucket } from '@/lib/db/cardBuckets'
import { runEventTriggers } from '@/lib/shrooms/runEventTriggers'
import { afterResponse } from '@/lib/afterResponse'

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
    await ensureSchema()
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
      isPendingReview = false,
      reviewRunId,
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

    // Pending-review cards have their own position numbering, so scope all the
    // position math to the bucket this card is being created in.
    const bucket = isPendingReview ? 'review' : 'active'

    // Get max position in this column's bucket
    const existingCards = await db.query.cards.findMany({
      where: inColumnBucket(columnId, bucket),
      orderBy: [desc(cards.position)],
      limit: 1,
    })

    const maxPosition = existingCards.length > 0 ? existingCards[0].position : -1
    const position = requestedPosition !== undefined ? requestedPosition : maxPosition + 1

    // If inserting at a specific position, shift other cards in the same bucket
    if (requestedPosition !== undefined) {
      await db
        .update(cards)
        .set({ position: sql`${cards.position} + 1` })
        .where(
          and(
            inColumnBucket(columnId, bucket),
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
      isPendingReview: !!isPendingReview,
      reviewRunId,
      createdAt: now,
      updatedAt: now,
    })

    const createdCard = await db.query.cards.findFirst({
      where: eq(cards.id, cardId),
    })

    // Pending-review cards aren't on the board yet, so they don't count as activity
    // and shouldn't notify anyone until they're approved.
    if (!isPendingReview) {
      // Log activity for digests
      logChannelActivity(channelId, userId, 'card_created', 'card', cardId, { title }).catch(() => {})

      // Notify channel members about new card
      if (createdCard) {
        createNotificationForChannelMembers(channelId, userId, {
          type: 'card_added_by_other',
          title: 'New card added',
          body: `"${title}" was added`,
          data: { channelId, cardId },
        }).catch(() => {})
      }

      // Wake any shroom watching this column. Runs after the response via `after()`
      // because it makes an LLM call — adding seconds to card creation would make
      // adding a card feel broken. A plain floating promise would risk the serverless
      // function being frozen the moment the response is sent, dropping the run.
      afterResponse(() =>
        runEventTriggers({
          channelId,
          columnId,
          eventType: 'card_created_in',
          cardId,
          createdByInstructionId,
        })
      )
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
