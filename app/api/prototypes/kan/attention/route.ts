import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { attentionPasses, channels } from '@/lib/db/schema'
import { and, desc, eq, gt, inArray } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { afterResponse } from '@/lib/afterResponse'
import { runAttentionPass } from '@/lib/kan/attention/run'

export const runtime = 'nodejs'
export const maxDuration = 800

/** GET — Kan's recent passes over your input, with the area names they mention. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const passes = await db.query.attentionPasses.findMany({
    where: eq(attentionPasses.ownerId, session.user.id),
    orderBy: [desc(attentionPasses.startedAt)],
    limit: 6,
  })
  const ids = new Set<string>()
  for (const p of passes) {
    for (const a of p.decisions?.areas ?? []) if (a.channelId) ids.add(a.channelId)
    for (const f of p.decisions?.filings ?? []) ids.add(f.area)
  }
  const names = ids.size
    ? await db.query.channels.findMany({ where: inArray(channels.id, [...ids]), columns: { id: true, name: true } })
    : []
  return Response.json({ passes, names: Object.fromEntries(names.map((c) => [c.id, c.name])) })
}

/** POST — think it through again: a rehearsal pass that decides and changes nothing. */
export async function POST() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const userId = session.user.id
  const running = await db.query.attentionPasses.findFirst({
    where: and(eq(attentionPasses.ownerId, userId), eq(attentionPasses.status, 'running'), gt(attentionPasses.startedAt, new Date(Date.now() - 15 * 60_000))),
  })
  if (running) return Response.json({ id: running.id, already: true })
  afterResponse(() => runAttentionPass(userId, { mode: 'rehearsal' }).then(() => undefined))
  return Response.json({ started: true })
}
