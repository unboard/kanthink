import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { isValidTimeZone } from '@/lib/time/zone'

export const runtime = 'nodejs'

/**
 * The browser's timezone, so schedules run on this person's clock. A shroom set
 * for "06:00" means 6 AM where they are, not 6 AM UTC on the server.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { timeZone } = (await req.json().catch(() => ({}))) as { timeZone?: string }
  if (!isValidTimeZone(timeZone)) return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 })
  await db.update(users).set({ timezone: timeZone }).where(eq(users.id, session.user.id))
  return NextResponse.json({ ok: true })
}
