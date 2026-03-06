import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { channelDigestSubscriptions } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/channels/:id/digest
 * Get current user's digest subscription for a channel
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId } = await params

  try {
    await ensureSchema()

    const sub = await db.query.channelDigestSubscriptions.findFirst({
      where: and(
        eq(channelDigestSubscriptions.userId, session.user.id),
        eq(channelDigestSubscriptions.channelId, channelId)
      ),
    })

    return NextResponse.json({
      digest: sub ? {
        frequency: sub.frequency,
        muted: sub.muted ?? false,
      } : {
        frequency: 'off',
        muted: false,
      },
    })
  } catch {
    return NextResponse.json({
      digest: { frequency: 'off', muted: false },
    })
  }
}

/**
 * PUT /api/channels/:id/digest
 * Set/update digest subscription (frequency='off' deletes the row)
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId } = await params
  const body = await req.json()
  const { frequency, muted } = body

  try {
    await ensureSchema()

    const existing = await db.query.channelDigestSubscriptions.findFirst({
      where: and(
        eq(channelDigestSubscriptions.userId, session.user.id),
        eq(channelDigestSubscriptions.channelId, channelId)
      ),
    })

    if (frequency === 'off') {
      // Delete the subscription row
      if (existing) {
        await db.delete(channelDigestSubscriptions).where(eq(channelDigestSubscriptions.id, existing.id))
      }
      return NextResponse.json({ success: true })
    }

    if (existing) {
      const updates: Record<string, unknown> = { updatedAt: new Date() }
      if (frequency !== undefined) updates.frequency = frequency
      if (muted !== undefined) updates.muted = muted
      await db.update(channelDigestSubscriptions)
        .set(updates)
        .where(eq(channelDigestSubscriptions.id, existing.id))
    } else {
      await db.insert(channelDigestSubscriptions).values({
        userId: session.user.id,
        channelId,
        frequency: frequency || 'weekly',
        muted: muted ?? false,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating digest subscription:', error)
    return NextResponse.json({ error: 'Failed to update digest' }, { status: 500 })
  }
}
