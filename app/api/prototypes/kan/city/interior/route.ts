import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { askInterior, saveInterior } from '@/lib/kan/city/redecorate'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Rearrange the inside of a building.
 *   PUT  { channelId, style }  set the layout directly (the redecorate panel)
 *   POST { channelId, ask }    say what you want and Kan works it out
 */
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const body = await req.json().catch(() => ({})) as { channelId?: string; style?: unknown }
  if (!body.channelId) return Response.json({ error: 'Which building?' }, { status: 400 })
  const out = await saveInterior(session.user.id, body.channelId, body.style)
  return Response.json(out, { status: 'error' in out ? 400 : 200 })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const body = await req.json().catch(() => ({})) as { channelId?: string; ask?: string }
  const ask = body.ask?.trim()
  if (!body.channelId || !ask) return Response.json({ error: 'Say what you’d like changed.' }, { status: 400 })
  const out = await askInterior(session.user.id, body.channelId, ask)
  return Response.json(out, { status: 'error' in out ? 400 : 200 })
}
