import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { attentionPasses, type AttentionDecisionJson } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

export const runtime = 'nodejs'

/** POST — pass on this plan. Nothing in it happens, and it stops waiting at Town Hall. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const pass = await db.query.attentionPasses.findFirst({ where: and(eq(attentionPasses.id, id), eq(attentionPasses.ownerId, session.user.id)) })
  if (!pass?.decisions) return Response.json({ error: 'Not found' }, { status: 404 })
  if (pass.appliedAt) return Response.json({ error: 'Already done' }, { status: 409 })
  const decisions: AttentionDecisionJson = { ...pass.decisions, dismissed: true }
  await db.update(attentionPasses).set({ decisions }).where(eq(attentionPasses.id, id))
  return Response.json({ ok: true })
}
