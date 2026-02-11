import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { notifications } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'

/**
 * GET /api/notifications
 * Paginated list for authenticated user
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  await ensureSchema()

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
  const offset = parseInt(searchParams.get('offset') || '0')

  const items = await db.query.notifications.findMany({
    where: eq(notifications.userId, session.user.id),
    orderBy: [desc(notifications.createdAt)],
    limit,
    offset,
  })

  return NextResponse.json({
    notifications: items.map(n => ({
      ...n,
      createdAt: n.createdAt?.toISOString(),
      readAt: n.readAt?.toISOString() ?? null,
    })),
  })
}
