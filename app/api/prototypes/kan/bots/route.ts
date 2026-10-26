import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { botRuns, channelBots, channels } from '@/lib/db/schema'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'

/**
 * GET — every channel you own, as a bot: on or off, when it last ran and what it said.
 * Bots act as the channel's owner, so only owned channels can have one.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const userId = session.user.id

  const owned = await db.query.channels.findMany({
    where: and(eq(channels.ownerId, userId), eq(channels.status, 'active')),
    columns: { id: true, name: true, description: true, updatedAt: true },
  })
  const ids = owned.map((c) => c.id)
  const [bots, runs] = ids.length
    ? await Promise.all([
        db.query.channelBots.findMany({ where: inArray(channelBots.channelId, ids) }),
        db.query.botRuns.findMany({
          where: inArray(botRuns.channelId, ids),
          orderBy: [desc(botRuns.startedAt)],
          limit: 200,
          columns: { channelId: true, status: true, summary: true, startedAt: true, trigger: true, asks: true },
        }),
      ])
    : [[], []]
  const botOf = new Map(bots.map((b) => [b.channelId, b]))
  const lastRun = new Map<string, (typeof runs)[number]>()
  for (const r of runs) if (!lastRun.has(r.channelId)) lastRun.set(r.channelId, r)

  const list = owned.map((c) => {
    const bot = botOf.get(c.id)
    const run = lastRun.get(c.id)
    return {
      channelId: c.id,
      name: c.name,
      description: c.description,
      enabled: Boolean(bot?.enabled),
      everyHours: bot?.everyHours ?? 24,
      nextRunAt: bot?.nextRunAt ?? null,
      lastRun: run ? { status: run.status, summary: run.summary, startedAt: run.startedAt, trigger: run.trigger, asks: run.asks ?? [] } : null,
      activity: Math.max(+(c.updatedAt ?? 0), +(run?.startedAt ?? 0)),
    }
  })
  list.sort((a, b) =>
    Number(b.enabled) - Number(a.enabled) ||
    Number(Boolean(b.lastRun)) - Number(Boolean(a.lastRun)) ||
    b.activity - a.activity)
  return Response.json({ bots: list })
}
