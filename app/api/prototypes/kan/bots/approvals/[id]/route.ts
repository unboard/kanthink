import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { afterResponse } from '@/lib/afterResponse'
import { decideApproval, runApprovedBuild } from '@/lib/kan/bots/approvals'

export const runtime = 'nodejs'
// An approved build runs after the response, and a big one takes minutes.
export const maxDuration = 800

/** POST { approve: boolean, reason?: string, modelId?: string } — your call on what a bot asked for. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { approve?: boolean; reason?: string; modelId?: string }
  if (typeof body.approve !== 'boolean') return Response.json({ error: 'approve must be true or false' }, { status: 400 })

  const result = await decideApproval(id, session.user.id, { approve: body.approve, reason: body.reason, modelId: body.modelId })
  if ('error' in result) return Response.json({ error: result.error }, { status: result.status })
  if (result.row.status === 'approved') afterResponse(() => runApprovedBuild(result.row.id))
  return Response.json({ approval: result.row })
}
