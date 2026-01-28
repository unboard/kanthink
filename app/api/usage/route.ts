import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getUsageStatus } from '@/lib/usage'

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    )
  }

  const status = await getUsageStatus(session.user.id)

  return NextResponse.json({
    used: status.used,
    limit: status.limit === Infinity ? null : status.limit,
    remaining: status.remaining === Infinity ? null : status.remaining,
    tier: status.tier,
    hasByok: status.hasByok,
    resetAt: status.resetAt.toISOString(),
  })
}
