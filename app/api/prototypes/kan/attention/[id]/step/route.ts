import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { decidePlanStep } from '@/lib/kan/attention/apply'

export const runtime = 'nodejs'
export const maxDuration = 300

/** POST { kind, key, ok } — answer one card of this plan: do it, or set it aside. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { kind?: string; key?: string; ok?: boolean }
  if ((body.kind !== 'area' && body.kind !== 'filing') || !body.key) return Response.json({ error: 'Which card?' }, { status: 400 })
  const r = await decidePlanStep(id, session.user.id, { kind: body.kind, key: String(body.key) }, body.ok === true)
  if ('error' in r) return Response.json({ error: r.error }, { status: r.error === 'Not found' ? 404 : 409 })
  return Response.json(r)
}
