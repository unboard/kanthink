import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { auth } from '@/lib/auth'
import { getUsageStatus, getAnonymousUsageStatus } from '@/lib/usage'
import { ANON_COOKIE_NAME } from '@/lib/ai/withAuth'

export async function GET() {
  const session = await auth()

  // Authenticated user
  if (session?.user?.id) {
    const status = await getUsageStatus(session.user.id)

    return NextResponse.json({
      used: status.used,
      limit: status.limit === Infinity ? null : status.limit,
      remaining: status.remaining === Infinity ? null : status.remaining,
      tier: status.tier,
      hasByok: status.hasByok,
      isAnonymous: false,
      resetAt: status.resetAt.toISOString(),
    })
  }

  // Anonymous user - check for anonymous ID cookie
  const cookieStore = await cookies()
  const anonId = cookieStore.get(ANON_COOKIE_NAME)?.value

  if (anonId) {
    const status = await getAnonymousUsageStatus(anonId)

    return NextResponse.json({
      used: status.used,
      limit: status.limit,
      remaining: status.remaining,
      tier: 'anonymous',
      hasByok: false,
      isAnonymous: true,
      resetAt: status.resetAt.toISOString(),
    })
  }

  // No session and no anonymous cookie - return default anonymous limits
  return NextResponse.json({
    used: 0,
    limit: 10,
    remaining: 10,
    tier: 'anonymous',
    hasByok: false,
    isAnonymous: true,
    resetAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
  })
}
