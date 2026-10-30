import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { buildProposedArea } from '@/lib/kan/attention/apply'

export const runtime = 'nodejs'
export const maxDuration = 120

/** POST { passId, name } — build one of the buildings Kan proposed, and only that one. */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const { passId, name } = (await req.json().catch(() => ({}))) as { passId?: string; name?: string }
  if (!passId || !name) return Response.json({ error: 'Which one?' }, { status: 400 })
  const r = await buildProposedArea(passId, session.user.id, name)
  return 'error' in r ? Response.json(r, { status: 400 }) : Response.json(r)
}
