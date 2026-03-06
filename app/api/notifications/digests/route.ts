import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { channelDigestSubscriptions, channels } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'

/**
 * GET /api/notifications/digests
 * All digest subscriptions for the current user (account overview)
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    await ensureSchema()

    const subs = await db
      .select({
        id: channelDigestSubscriptions.id,
        channelId: channelDigestSubscriptions.channelId,
        channelName: channels.name,
        frequency: channelDigestSubscriptions.frequency,
        muted: channelDigestSubscriptions.muted,
      })
      .from(channelDigestSubscriptions)
      .innerJoin(channels, eq(channelDigestSubscriptions.channelId, channels.id))
      .where(eq(channelDigestSubscriptions.userId, session.user.id))

    return NextResponse.json({ digests: subs })
  } catch {
    return NextResponse.json({ digests: [] })
  }
}
