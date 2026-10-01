import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { markSparkHandled, todaysSpark } from '@/lib/studio/daily'

export const runtime = 'nodejs'

/**
 * The spark waiting on Home.
 *
 * GET  — today's spark, or null.
 * POST — { cardId } once it's been raised: answered or waved away, it doesn't come back.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id || !session.user.isAdmin) return NextResponse.json({ spark: null })
  await ensureSchema()
  return NextResponse.json({ spark: await todaysSpark(session.user.id).catch(() => null) })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !session.user.isAdmin) return NextResponse.json({ error: 'Not available' }, { status: 404 })
  const { cardId } = (await req.json().catch(() => ({}))) as { cardId?: string }
  if (!cardId) return NextResponse.json({ error: 'cardId is required' }, { status: 400 })
  await ensureSchema()
  await markSparkHandled(session.user.id, cardId)
  return NextResponse.json({ ok: true })
}
