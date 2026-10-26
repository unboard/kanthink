import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { botRuns, channelBots, channels } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { ensureBot, spentToday } from '@/lib/kan/bots/run'
import { botTools } from '@/lib/kan/bots/tools'

async function ownedChannel(channelId: string) {
  const session = await auth()
  if (!session?.user?.id) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  await ensureSchema()
  const channel = await db.query.channels.findFirst({
    where: eq(channels.id, channelId),
    columns: { id: true, name: true, description: true, ownerId: true },
  })
  if (!channel || channel.ownerId !== session.user.id) {
    return { error: Response.json({ error: 'Only the channel’s owner can run its bot.' }, { status: 403 }) }
  }
  return { channel, session }
}

/** GET — the bot, what it can do, and its log. */
export async function GET(_req: Request, { params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params
  const found = await ownedChannel(channelId)
  if ('error' in found) return found.error
  const { channel, session } = found
  const bot = await ensureBot(channelId, channel.ownerId)
  const [runs, spent] = await Promise.all([
    db.query.botRuns.findMany({ where: eq(botRuns.channelId, channelId), orderBy: [desc(botRuns.startedAt)], limit: 25 }),
    spentToday(channelId),
  ])
  const { getStudioByChannel } = await import('@/lib/studio/setup')
  const tools = botTools({ isAdmin: Boolean(session.user.isAdmin), isStudio: Boolean(await getStudioByChannel(channelId)), canHandOff: true })
  const can: Record<string, string[]> = {}
  for (const t of tools) (can[t.area] ??= []).push(t.name)
  return Response.json({
    channel: { id: channel.id, name: channel.name, description: channel.description },
    bot: {
      enabled: Boolean(bot.enabled),
      everyHours: bot.everyHours ?? 24,
      dailyBudgetCents: bot.dailyBudgetCents ?? 200,
      memory: bot.memory,
      lastRunAt: bot.lastRunAt,
      nextRunAt: bot.nextRunAt,
      spentTodayCents: Math.round(spent / 1000),
    },
    can,
    runs,
  })
}

/** PATCH — turn it on or off, how often it runs, what it may spend a day. */
export async function PATCH(req: Request, { params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params
  const found = await ownedChannel(channelId)
  if ('error' in found) return found.error
  const bot = await ensureBot(channelId, found.channel.ownerId)
  const body = (await req.json().catch(() => ({}))) as { enabled?: boolean; everyHours?: number; dailyBudgetCents?: number }
  const set: Partial<typeof channelBots.$inferInsert> = { updatedAt: new Date() }
  if (typeof body.enabled === 'boolean') {
    set.enabled = body.enabled
    // Switched on: the next hourly pass picks it up.
    if (body.enabled && !bot.enabled) set.nextRunAt = new Date()
  }
  if (typeof body.everyHours === 'number') set.everyHours = Math.min(168, Math.max(1, Math.round(body.everyHours)))
  if (typeof body.dailyBudgetCents === 'number') set.dailyBudgetCents = Math.min(5000, Math.max(10, Math.round(body.dailyBudgetCents)))
  await db.update(channelBots).set(set).where(eq(channelBots.channelId, channelId))
  return Response.json({ ok: true })
}
