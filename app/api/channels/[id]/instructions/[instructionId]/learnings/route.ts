import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { cardRejections } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { ensureSchema } from '@/lib/db/ensure-schema'

interface RouteParams {
  params: Promise<{ id: string; instructionId: string }>
}

/**
 * GET /api/channels/:id/instructions/:instructionId/learnings
 *
 * What this shroom has learned from being told no.
 *
 * Deliberately the same rows that buildRejectionContext feeds into the shroom's prompts
 * — so what you read here is what it reads. Without this the feedback loop is invisible
 * and there's no way to tell whether rejecting things is actually teaching it anything.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId, instructionId } = await params

  try {
    await ensureSchema()
    await requirePermission(channelId, session.user.id, 'view')

    const rows = await db.query.cardRejections.findMany({
      where: and(
        eq(cardRejections.channelId, channelId),
        eq(cardRejections.instructionCardId, instructionId)
      ),
      orderBy: [desc(cardRejections.createdAt)],
      limit: 50,
    })

    // Group by reason so the shape of the feedback is legible at a glance
    const byReason: Record<string, number> = {}
    for (const row of rows) {
      const key = row.reason ?? 'unspecified'
      byReason[key] = (byReason[key] ?? 0) + 1
    }

    return NextResponse.json({
      total: rows.length,
      byReason,
      rejections: rows.map((r) => ({
        id: r.id,
        cardTitle: r.cardTitle,
        reason: r.reason,
        feedback: r.feedback,
        createdAt: r.createdAt?.toISOString(),
      })),
    })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error loading shroom learnings:', error)
    return NextResponse.json({ error: 'Failed to load learnings' }, { status: 500 })
  }
}
