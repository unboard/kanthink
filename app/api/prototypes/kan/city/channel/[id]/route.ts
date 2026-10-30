import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { addNote, cardDetail, channelBoard } from '@/lib/kan/city/channel'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET — a channel's board for the sheet in Kan City; `?card=` for one card's detail.
 * Moving and adding cards go through the board's own routes; only notes land here.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    await ensureSchema()
    const permission = await requirePermission(id, session.user.id, 'view', session.user.email)
    const cardId = new URL(request.url).searchParams.get('card')
    if (cardId) {
      const card = await cardDetail(id, cardId)
      return card ? Response.json(card) : Response.json({ error: 'Card not found' }, { status: 404 })
    }
    const board = await channelBoard(id, permission.canEdit)
    return board ? Response.json(board) : Response.json({ error: 'Channel not found' }, { status: 404 })
  } catch (err) {
    if (err instanceof PermissionError) return Response.json({ error: err.message }, { status: err.statusCode })
    throw err
  }
}

/** POST { cardId, note } — add a note to a card's thread. */
export async function POST(request: Request, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    await requirePermission(id, session.user.id, 'edit', session.user.email)
    const body = (await request.json().catch(() => ({}))) as { cardId?: string; note?: string }
    const note = body.note?.trim()
    if (!body.cardId || !note) return Response.json({ error: 'cardId and note are required' }, { status: 400 })
    const message = await addNote(id, body.cardId, { id: session.user.id, name: session.user.name }, note.slice(0, 8000))
    return message ? Response.json({ message }) : Response.json({ error: 'Card not found' }, { status: 404 })
  } catch (err) {
    if (err instanceof PermissionError) return Response.json({ error: err.message }, { status: err.statusCode })
    throw err
  }
}
