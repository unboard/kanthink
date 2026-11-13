import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { loadStyles, saveResult } from '@/lib/styles/server'

export const runtime = 'nodejs'

interface RouteParams { params: Promise<{ channelId: string }> }

/** GET — the channel's prompt cards as styles (the style playground's catalog). */
export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { channelId } = await params
  try {
    await ensureSchema()
    const permission = await requirePermission(channelId, session.user.id, 'view', session.user.email)
    const lib = await loadStyles(channelId)
    return lib ? Response.json({ ...lib, canEdit: permission.canEdit }) : Response.json({ error: 'Channel not found' }, { status: 404 })
  } catch (err) {
    if (err instanceof PermissionError) return Response.json({ error: err.message }, { status: err.statusCode })
    throw err
  }
}

/** POST { cardId, imageUrl, prompt, label } — keep a result on the style's card. */
export async function POST(req: Request, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { channelId } = await params
  try {
    await requirePermission(channelId, session.user.id, 'edit', session.user.email)
    const b = (await req.json().catch(() => ({}))) as { cardId?: string; imageUrl?: string; prompt?: string; label?: string }
    if (!b.cardId || !b.imageUrl || !/^https?:\/\//.test(b.imageUrl)) return Response.json({ error: 'cardId and imageUrl are required' }, { status: 400 })
    const saved = await saveResult(channelId, b.cardId, { id: session.user.id, name: session.user.name }, {
      imageUrl: b.imageUrl, prompt: (b.prompt ?? '').slice(0, 6000), label: (b.label ?? 'A result').slice(0, 200),
    })
    return saved ? Response.json({ ok: true }) : Response.json({ error: 'Card not found' }, { status: 404 })
  } catch (err) {
    if (err instanceof PermissionError) return Response.json({ error: err.message }, { status: err.statusCode })
    throw err
  }
}
