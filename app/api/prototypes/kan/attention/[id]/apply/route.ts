import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { applyAttentionPass } from '@/lib/kan/attention/apply'

export const runtime = 'nodejs'
export const maxDuration = 300

/** POST — do what this pass decided. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const { id } = await params
  const r = await applyAttentionPass(id, session.user.id)
  if ('error' in r) return Response.json({ error: r.error }, { status: r.error === 'Not found' ? 404 : 409 })
  return Response.json(r)
}
