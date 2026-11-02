import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { claudePresence, noteForClaude } from '@/lib/kan/city/claude'

export const runtime = 'nodejs'

/** GET — whether Claude Code is open on your computer right now, and what waits for it. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  return Response.json(await claudePresence(session.user.id))
}

/** POST { text } — leave Claude Code a note, as a card in Work → Do these. */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const { text } = (await req.json().catch(() => ({}))) as { text?: string }
  const r = await noteForClaude({ id: session.user.id, name: session.user.name, image: session.user.image }, text ?? '')
  return 'error' in r ? Response.json(r, { status: 400 }) : Response.json(r)
}
