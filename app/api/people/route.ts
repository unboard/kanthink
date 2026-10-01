import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { listPeople } from '@/lib/studio/people'

export const runtime = 'nodejs'

/** Everyone who reserved, used or bought one of your apps. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!session.user.isAdmin) return NextResponse.json({ error: 'Not available' }, { status: 404 })
  await ensureSchema()
  return NextResponse.json({ people: await listPeople(session.user.id) })
}
