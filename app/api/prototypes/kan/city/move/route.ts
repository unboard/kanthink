import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { movePlot, movePlotNextTo } from '@/lib/kan/city/move'

export const runtime = 'nodejs'

/**
 * POST — move a plot in the city.
 *   { channelId, to: { cx, cz } }   to that lot (an occupied one swaps)
 *   { channelId, nextTo }           right next to another plot
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const body = await req.json().catch(() => ({})) as { channelId?: string; to?: { cx?: unknown; cz?: unknown }; nextTo?: string }
  if (!body.channelId) return Response.json({ error: 'Which plot?' }, { status: 400 })
  const out = body.nextTo
    ? await movePlotNextTo(session.user.id, body.channelId, body.nextTo)
    : body.to ? await movePlot(session.user.id, body.channelId, { cx: Number(body.to.cx), cz: Number(body.to.cz) })
    : { error: 'Where to?' }
  if ('error' in out) return Response.json(out, { status: 400 })
  return Response.json(out)
}
