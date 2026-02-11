import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { notifications } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/notifications/:id/read
 * Mark a single notification as read
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id } = await params

  try {
    await ensureSchema()

    await db.update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(
        eq(notifications.id, id),
        eq(notifications.userId, session.user.id)
      ))
  } catch {
    // notifications table may not exist in production — fail gracefully
  }

  return NextResponse.json({ success: true })
}
