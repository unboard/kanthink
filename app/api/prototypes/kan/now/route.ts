import { auth } from '@/lib/auth'
import { loadAccess } from '@/lib/voice/resolveReference'
import { gatherNow } from '@/lib/kan/agent/now'

export const runtime = 'nodejs'

/** What needs you, for the top of the Kan agent prototype. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await loadAccess(session.user.id)
  const items = await gatherNow(session.user.id, access.readable)
  return Response.json({ items, name: session.user.name?.split(' ')[0] ?? null })
}
