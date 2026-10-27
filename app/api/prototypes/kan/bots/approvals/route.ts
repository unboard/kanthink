import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { botApprovals, channels } from '@/lib/db/schema'
import { desc, eq, inArray } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { resolveProviderKeys } from '@/lib/ai/keys'
import { estimatesFor } from '@/lib/kan/bots/approvals'

/**
 * GET — what your bots are waiting on you for, newest first, plus the last few
 * decided. Each pending one carries its cost on every model you could swap it to.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const userId = session.user.id
  const [rows, { keys }] = await Promise.all([
    db.query.botApprovals.findMany({ where: eq(botApprovals.ownerId, userId), orderBy: [desc(botApprovals.createdAt)], limit: 40 }),
    resolveProviderKeys(userId),
  ])
  const ids = [...new Set(rows.map((r) => r.channelId))]
  const names = ids.length ? await db.query.channels.findMany({ where: inArray(channels.id, ids), columns: { id: true, name: true } }) : []
  const nameOf = new Map(names.map((c) => [c.id, c.name]))
  const providers = (['google', 'openai', 'anthropic'] as const).filter((p) => keys[p])
  const open = rows.filter((r) => r.status === 'pending' || r.status === 'approved')
  const decided = rows.filter((r) => r.status !== 'pending' && r.status !== 'approved').slice(0, 10)
  return Response.json({
    approvals: await Promise.all([...open, ...decided].map(async (r) => ({
      ...r,
      channelName: nameOf.get(r.channelId) ?? 'A bot',
      models: r.status === 'pending' ? await estimatesFor(r, providers) : [],
    }))),
  })
}
