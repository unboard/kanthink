import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { cards, cardRejections, tasks } from '@/lib/db/schema'
import { eq, and, gt, sql, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { inColumnBucket } from '@/lib/db/cardBuckets'
import { logChannelActivity } from '@/lib/db/activity'

interface RouteParams {
  params: Promise<{ id: string; cardId: string }>
}

/**
 * POST /api/channels/:id/cards/:cardId/review
 *
 * Resolve one pending-review card. Each card is decided independently — there's no
 * batch commit, so a run can be worked through a card at a time.
 *
 *   { decision: 'approve' }                      → card joins the column's active bucket
 *   { decision: 'reject', reason?, feedback? }   → card is deleted, reason is kept and
 *                                                  fed back into that shroom's prompts
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId, cardId } = await params
  const userId = session.user.id

  try {
    await ensureSchema()
    await requirePermission(channelId, userId, 'edit')

    const body = await req.json()
    const { decision, reason, feedback } = body

    if (decision !== 'approve' && decision !== 'reject') {
      return NextResponse.json(
        { error: "decision must be 'approve' or 'reject'" },
        { status: 400 }
      )
    }

    const card = await db.query.cards.findFirst({
      where: and(eq(cards.id, cardId), eq(cards.channelId, channelId)),
    })

    if (!card) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    if (!card.isPendingReview) {
      return NextResponse.json(
        { error: 'Card is not pending review' },
        { status: 409 }
      )
    }

    // Close the gap this card leaves in the review bucket, either way
    const closeReviewGap = () =>
      db
        .update(cards)
        .set({ position: sql`${cards.position} - 1` })
        .where(
          and(inColumnBucket(card.columnId, 'review'), gt(cards.position, card.position))
        )

    if (decision === 'approve') {
      // Append to the end of the active bucket so it can't collide with existing cards
      const lastActive = await db.query.cards.findMany({
        where: inColumnBucket(card.columnId, 'active'),
        orderBy: [desc(cards.position)],
        limit: 1,
      })
      const nextPosition = (lastActive.length > 0 ? lastActive[0].position : -1) + 1

      await db
        .update(cards)
        .set({ isPendingReview: false, position: nextPosition, updatedAt: new Date() })
        .where(eq(cards.id, cardId))

      await closeReviewGap()

      logChannelActivity(channelId, userId, 'card_created', 'card', cardId, {
        title: card.title,
      }).catch(() => {})

      return NextResponse.json({ success: true, decision, position: nextPosition })
    }

    // Reject: keep the reason, drop the card. The reason is the whole point — it's what
    // the shroom reads next time so it stops producing this kind of card.
    await db.insert(cardRejections).values({
      id: nanoid(),
      channelId,
      instructionCardId: card.createdByInstructionId ?? null,
      cardId,
      cardTitle: card.title,
      reason: reason ?? null,
      feedback: feedback ?? null,
      createdBy: userId,
      createdAt: new Date(),
    })

    await db.delete(tasks).where(eq(tasks.cardId, cardId))
    await db.delete(cards).where(eq(cards.id, cardId))
    await closeReviewGap()

    return NextResponse.json({ success: true, decision })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error resolving card review:', error)
    return NextResponse.json({ error: 'Failed to resolve review' }, { status: 500 })
  }
}
