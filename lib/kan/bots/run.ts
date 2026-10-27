import { db } from '@/lib/db'
import { botRuns, channelBots, channels, users, type BotStepJson } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { resolveProviderKeys } from '@/lib/ai/keys'
import { recordUsage } from '@/lib/usage'
import { loadAccess } from '@/lib/voice/resolveReference'
import { AGENT_MODEL, OPENAI_AGENT_MODEL, runAgent } from '@/lib/kan/agent/run'
import { WORK_CHANNEL_ID } from '@/lib/kan/agent/tools'
import type { AgentEvent } from '@/lib/kan/agent/events'
import { botTools, guardTools, type BotContext } from './tools'
import { buildBotPrompt } from './prompt'
import { MILLICENTS_PER_CENT, roomFor, saveLimits, shouldStopRun, spentByBot, thinkingCost, type Room } from './spend'

/**
 * One run of a channel bot, start to finish, with no one at the keyboard.
 *
 * It acts as the channel's owner with every tool scoped to the channel, logs each
 * step to bot_runs as it happens (so the log page can watch a run live), stops at
 * the lowest spending ceiling (see ./spend), and tells the owner what it did when it
 * changed anything.
 * Never throws: a failed run is a logged run.
 */

export type BotRow = typeof channelBots.$inferSelect


/** A bot row for a channel, made with defaults (off) the first time it's asked for. */
export async function ensureBot(channelId: string, ownerId: string): Promise<BotRow> {
  const found = await db.query.channelBots.findFirst({ where: eq(channelBots.channelId, channelId) })
  if (found) return found
  await db.insert(channelBots).values({ channelId, ownerId }).onConflictDoNothing()
  return (await db.query.channelBots.findFirst({ where: eq(channelBots.channelId, channelId) }))!
}

/** What this bot has spent, builds included, in the last 24 hours. */
export const spentToday = spentByBot

export function nextRunAfter(bot: Pick<BotRow, 'everyHours'>, from: Date): Date {
  return new Date(from.getTime() + Math.max(1, bot.everyHours ?? 24) * 3600_000)
}

export async function runBot(channelId: string, opts: { trigger: 'scheduled' | 'manual' | 'rehearsal'; runId?: string; now?: Date }): Promise<{ runId: string; status: string }> {
  const now = opts.now ?? new Date()
  const runId = opts.runId ?? crypto.randomUUID()
  const rehearsal = opts.trigger === 'rehearsal'

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId), columns: { id: true, name: true, ownerId: true } })
  if (!channel) return { runId, status: 'error' }
  const bot = await ensureBot(channelId, channel.ownerId)
  const owner = await db.query.users.findFirst({ where: eq(users.id, bot.ownerId), columns: { id: true, name: true, email: true, timezone: true } })

  // Out of room on a schedule: no run row (an hourly "skipped" line would bury the
  // log), just try again in an hour, and tell the owner once if their own ceiling did it.
  const { room, limits } = await roomFor(bot, now)
  if (room.left <= 0 && opts.trigger === 'scheduled') {
    await db.update(channelBots).set({ nextRunAt: new Date(now.getTime() + 3600_000), updatedAt: new Date() }).where(eq(channelBots.channelId, channelId))
    if (room.limitedBy !== 'bot') await tellCeiling(bot.ownerId, room, limits.capNotifiedAt, now)
    return { runId, status: 'over_budget' }
  }

  const finish = async (status: 'done' | 'error' | 'over_budget', fields: Partial<typeof botRuns.$inferInsert>) => {
    await db.update(botRuns).set({ status, endedAt: new Date(), ...fields }).where(eq(botRuns.id, runId))
    if (!rehearsal) {
      await db.update(channelBots).set({ lastRunAt: now, nextRunAt: nextRunAfter(bot, now), updatedAt: new Date() }).where(eq(channelBots.channelId, channelId))
    }
    return { runId, status }
  }

  // The run row exists before anything can fail, so every attempt is in the log.
  await db.insert(botRuns).values({ id: runId, channelId, ownerId: bot.ownerId, trigger: opts.trigger, status: 'running', startedAt: now })
    .onConflictDoNothing()

  if (!owner) return finish('error', { error: 'The channel’s owner is gone.' })

  if (room.left <= 0) return finish('over_budget', { summary: `Skipped: ${room.message}.` })
  const runCap = limits.perRunCapCents * MILLICENTS_PER_CENT

  const { keys, error: keyError, quotaMessage } = await resolveProviderKeys(owner.id)
  const provider = keys.anthropic ? ('anthropic' as const) : keys.openai ? ('openai' as const) : null
  const key = provider ? keys[provider] : undefined
  if (!provider || !key) {
    const ask = 'Add an Anthropic or OpenAI key in Settings → AI so I can run.'
    return finish('error', { error: quotaMessage || keyError || 'No AI key', asks: [ask] })
  }

  const access = await loadAccess(owner.id)
  if (!access.writable.has(channelId)) return finish('error', { error: 'The owner can no longer edit this channel.' })

  const { getStudioByChannel } = await import('@/lib/studio/setup')
  const isStudio = Boolean(await getStudioByChannel(channelId))
  // Loaded here, not at the top: next-auth pulls in next/server, which scripts and tests can't load.
  const { isAdmin } = await import('@/lib/auth')
  const admin = isAdmin(owner.email)
  const ctx: BotContext = {
    userId: owner.id,
    isAdmin: admin,
    name: owner.name,
    readable: [channelId],
    scope: [channelId],
    sessionCardIds: [],
    recentTurns: [],
    channelId,
    rehearsal,
    asks: [],
    runId,
  }
  let thinking = 0
  let lastRound = 0
  const spend = { builds: 0, handoffs: 0, left: () => room.left - thinking - spend.builds }
  ctx.spend = spend
  const providers = (['google', 'openai', 'anthropic'] as const).filter((p) => keys[p])
  const all = botTools({ isAdmin: admin, isStudio, canHandOff: access.readable.includes(WORK_CHANNEL_ID), providers })
  const tools = guardTools(all, ctx)
  const system = await buildBotPrompt({
    channelId, ownerId: owner.id, ownerName: owner.name, tools: all, memory: bot.memory, everyHours: bot.everyHours ?? 24,
    budgetLeftCents: Math.floor(room.left / MILLICENTS_PER_CENT), isStudio, rehearsal, timeZone: owner.timezone, now,
  })

  // The trace, written through to the row so the log page can follow along.
  const steps: BotStepJson[] = []
  let lastFlush = 0
  let flushing: Promise<unknown> = Promise.resolve()
  const flush = (force = false) => {
    if (!force && Date.now() - lastFlush < 1500) return
    lastFlush = Date.now()
    const snapshot = steps.map((s) => ({ ...s }))
    flushing = flushing.then(() => db.update(botRuns).set({ steps: snapshot }).where(eq(botRuns.id, runId))).catch(() => {})
  }
  const send = (e: AgentEvent) => {
    if (e.t !== 'step') return
    const i = steps.findIndex((s) => s.id === e.id)
    const next: BotStepJson = { id: e.id, label: e.label ?? steps[i]?.label ?? '', status: e.status, write: e.write || steps[i]?.write, href: e.href ?? steps[i]?.href, detail: e.detail }
    if (e.kind === 'thinking' && e.status === 'running') return // only the "Thought for Ns" line is worth keeping
    if (i >= 0) steps[i] = next
    else steps.push(next)
    flush(e.status !== 'running' && Boolean(e.write))
  }

  const plannedModel = provider === 'openai' ? OPENAI_AGENT_MODEL : AGENT_MODEL
  try {
    const result = await runAgent({
      provider,
      apiKey: key.apiKey,
      system,
      history: [{ role: 'user', content: rehearsal ? 'Rehearsal run. Go.' : `Scheduled run (${opts.trigger}). Go.` }],
      tools,
      ctx,
      send,
      maxRounds: 24,
      onUsage: (usage) => {
        const total = thinkingCost(plannedModel, usage)
        lastRound = total - thinking
        thinking = total
      },
      // Thinking is held to the run cap; builds are held by count and by the room left.
      shouldStop: () => shouldStopRun({ spent: thinking, lastRound, runCap, room: room.left - spend.builds }),
    })
    flush(true)
    await flushing
    const cost = thinkingCost(result.model, result.usage) + spend.builds
    if (key.source !== 'byok') await recordUsage(owner.id, 'channel-bot').catch(() => {})
    const why = thinking + lastRound >= runCap ? `this run reached its cap ($${(runCap / 100_000).toFixed(2)})` : room.message
    const summary = (result.text.trim() || 'Finished without a report.') + (result.stopped ? `\n\nStopped early: ${why}.` : '')
    const out = await finish('done', {
      steps, summary, asks: ctx.asks, costMillicents: cost, buildMillicents: spend.builds, model: result.model,
      inputTokens: result.usage.inputTokens, cachedTokens: result.usage.cachedInputTokens ?? 0, outputTokens: result.usage.outputTokens,
      handoffs: spend.handoffs,
    })

    const changed = steps.filter((s) => s.write && s.status === 'done' && !s.label.startsWith('Wrote notes'))
    if (!rehearsal && (changed.length || ctx.asks.length)) {
      const { createNotification } = await import('@/lib/notifications/createNotification')
      await createNotification({
        userId: owner.id,
        type: 'bot_run',
        title: ctx.asks.length ? `${channel.name} needs you` : `${channel.name}: ${changed.length} thing${changed.length === 1 ? '' : 's'} done`,
        body: (ctx.asks[0] || summary).slice(0, 240),
        data: { channelId, runId },
      }).catch(() => {})
    }
    return out
  } catch (err) {
    flush(true)
    await flushing
    const message = err instanceof Error ? err.message : 'Something went wrong'
    console.error('[bot]', channel.name, message)
    // Whatever it spent before failing still counts.
    return finish('error', { steps, error: message.slice(0, 500), asks: ctx.asks, costMillicents: thinking + spend.builds, buildMillicents: spend.builds, handoffs: spend.handoffs })
  }
}

/** One notification a day when the owner's own ceiling stops their bots. */
async function tellCeiling(ownerId: string, room: Room, notifiedAt: Date | null, now: Date) {
  if (notifiedAt && now.getTime() - notifiedAt.getTime() < 86400_000) return
  await saveLimits(ownerId, { capNotifiedAt: now })
  const { createNotification } = await import('@/lib/notifications/createNotification')
  await createNotification({
    userId: ownerId,
    type: 'bot_run',
    title: 'Your bots paused',
    body: `They’ll start again when there’s room: ${room.message}. You can raise it on the Spend page.`,
    data: { spend: true },
  }).catch(() => {})
}

/** Every enabled bot that's due, one after another. For the cron. */
export async function runDueBots(now = new Date(), deadlineMs = 700_000): Promise<{ ran: { channelId: string; status: string }[] }> {
  const started = Date.now()
  const bots = await db.query.channelBots.findMany({ where: eq(channelBots.enabled, true) })
  const due = bots.filter((b) => !b.nextRunAt || b.nextRunAt <= now)
  const ran: { channelId: string; status: string }[] = []
  for (const bot of due) {
    // Leave room to finish cleanly; anything left over runs next hour.
    if (Date.now() - started > deadlineMs) break
    const r = await runBot(bot.channelId, { trigger: 'scheduled', now: new Date() })
    ran.push({ channelId: bot.channelId, status: r.status })
  }
  return { ran }
}
