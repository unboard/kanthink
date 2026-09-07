import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { cards, cardRejections, tasks } from '@/lib/db/schema'
import { eq, and, asc, desc, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { inColumnBucket } from '@/lib/db/cardBuckets'
import { logChannelActivity } from '@/lib/db/activity'

interface RouteParams {
  params: Promise<{ id: string; columnId: string }>
}

/**
 * POST /api/channels/:id/columns/:columnId/review
 *
 * Decide every pending-review card in a column at once.
 *
 *   { decision: 'approve' }                     → all join the column's active bucket
 *   { decision: 'reject', reason?, feedback? }  → all deleted, one rejection row each
 *
 * A batch rather than a loop over the per-card route on purpose: a shroom run that
 * produced ten cards would otherwise be ten round trips, each recomputing positions
 * against a bucket the previous one just changed. Here the review bucket empties
 * completely, so there are no gaps left to close.
 *
 * The reason is optional by design. Often the shroom was simply built wrong and the
 * honest answer is "no feedback, I'm going to go fix the shroom" — being forced to
 * invent a reason would put noise into the very prompts the reason exists to improve.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId, columnId } = await params
  const userId = session.user.id

  try {
    await ensureSchema()
    await requirePermission(channelId, userId, 'edit')

    const body = await req.json().catch(() => ({}))
    const { decision, reason, feedback } = body as {
      decision?: string
      reason?: string
      feedback?: string
    }

    if (decision !== 'approve' && decision !== 'reject') {
      return NextResponse.json(
        { error: "decision must be 'approve' or 'reject'" },
        { status: 400 }
      )
    }

    const pending = await db.query.cards.findMany({
      where: and(inColumnBucket(columnId, 'review'), eq(cards.channelId, channelId)),
      orderBy: [asc(cards.position)],
    })

    if (pending.length === 0) {
      return NextResponse.json({ success: true, decision, count: 0 })
    }
    const pendingIds = pending.map((c) => c.id)

    if (decision === 'approve') {
      // Append after whatever is already active, preserving the order they were
      // reviewed in, so approving ten cards doesn't shuffle them.
      const lastActive = await db.query.cards.findMany({
        where: inColumnBucket(columnId, 'active'),
        orderBy: [desc(cards.position)],
        limit: 1,
      })
      let nextPosition = (lastActive.length > 0 ? lastActive[0].position : -1) + 1

      for (const card of pending) {
        await db
          .update(cards)
          .set({ isPendingReview: false, position: nextPosition, updatedAt: new Date() })
          .where(eq(cards.id, card.id))
        nextPosition++

        logChannelActivity(channelId, userId, 'card_created', 'card', card.id, {
          title: card.title,
        }).catch(() => {})
      }

      return NextResponse.json({ success: true, decision, count: pending.length })
    }

    // Reject: one rejection row per card so each shroom learns from its own output,
    // then drop the cards. Written before the delete — a rejection we failed to
    // record is a lesson lost, whereas a card we failed to delete is visible and
    // can be rejected again.
    await db.insert(cardRejections).values(
      pending.map((card) => ({
        id: nanoid(),
        channelId,
        instructionCardId: card.createdByInstructionId ?? null,
        cardId: card.id,
        cardTitle: card.title,
        reason: reason ?? null,
        feedback: feedback ?? null,
        createdBy: userId,
        createdAt: new Date(),
      }))
    )

    await db.delete(tasks).where(inArray(tasks.cardId, pendingIds))
    await db.delete(cards).where(inArray(cards.id, pendingIds))

    return NextResponse.json({ success: true, decision, count: pending.length })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error resolving column review:', error)
    return NextResponse.json({ error: 'Failed to resolve reviews' }, { status: 500 })
  }
}
