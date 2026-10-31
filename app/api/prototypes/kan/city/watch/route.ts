import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { watchVideo } from '@/lib/kan/city/watch'

export const runtime = 'nodejs'
export const maxDuration = 300

/** POST { channelId, cardId, videoId } — the resident watches a video on the TV and keeps notes. */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { channelId?: string; cardId?: string; videoId?: string }
  if (!body.channelId || !body.cardId || !body.videoId) return Response.json({ error: 'Which video?' }, { status: 400 })
  try {
    await ensureSchema()
    await requirePermission(body.channelId, session.user.id, 'edit', session.user.email)
    const out = await watchVideo(session.user.id, body.channelId, body.cardId, body.videoId)
    return Response.json(out, { status: 'error' in out ? 400 : 200 })
  } catch (err) {
    if (err instanceof PermissionError) return Response.json({ error: err.message }, { status: err.statusCode })
    throw err
  }
}
