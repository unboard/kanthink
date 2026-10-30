import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { createNeighborhood, listNeighborhoods, moveToNeighborhood, renameNeighborhood } from '@/lib/kan/city/neighborhoods'

/** GET — your neighborhoods. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  return Response.json({ neighborhoods: await listNeighborhoods(session.user.id) })
}

/**
 * POST — rearrange the city.
 *   { action: 'move', channelId, folderId | null }     move a plot (null = Downtown)
 *   { action: 'create', name, channelIds? }            start a neighborhood
 *   { action: 'rename', folderId, name }
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const userId = session.user.id
  const body = (await req.json().catch(() => ({}))) as { action?: string; channelId?: string; folderId?: string | null; name?: string; channelIds?: string[] }
  const r = body.action === 'move' && body.channelId ? await moveToNeighborhood(userId, body.channelId, body.folderId ?? null)
    : body.action === 'create' && body.name ? await createNeighborhood(userId, body.name, (body.channelIds ?? []).slice(0, 50))
    : body.action === 'rename' && body.folderId && body.name ? await renameNeighborhood(userId, body.folderId, body.name)
    : { error: 'Say what to change.' }
  return 'error' in r ? Response.json(r, { status: 400 }) : Response.json(r)
}
