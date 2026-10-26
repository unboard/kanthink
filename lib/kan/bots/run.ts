import { db } from '@/lib/db'
import { botRuns, channelBots, channels, users, type BotStepJson } from '@/lib/db/schema'
import { and, eq, gt } from 'drizzle-orm'
import { resolveProviderKeys } from '@/lib/ai/keys'
import { recordUsage } from '@/lib/usage'
import { actualCostMillicents } from '@/lib/playground/aiPricing'
import { loadAccess } from '@/lib/voice/resolveReference'
import { AGENT_MODEL, OPENAI_AGENT_MODEL, runAgent } from '@/lib/kan/agent/run'
import { WORK_CHANNEL_ID } from '@/lib/kan/agent/tools'
import type { AgentEvent } from '@/lib/kan/agent/events'
import { botTools, guardTools, type BotContext } from './tools'
import { buildBotPrompt } from './prompt'

/**
 * One run of a channel bot, start to finish, with no one at the keyboard.
 *
 * It acts as the channel's owner with every tool scoped to the channel, logs each
 * step to bot_runs as it happens (so the log page can watch a run live), stops at
 * the day's budget, and tells the owner what it did when it changed anything.
 * Never throws: a failed run is a logged run.
 */

export type BotRow = typeof channelBots.$inferSelect

const MILLICENTS_PER_CENT = 1000
const DAY_MS = 86400_000

/** A bot row for a channel, made with defaults (off) the first time it's asked for. */
export async function ensureBot(channelId: string, ownerId: string): Promise<BotRow> {
  const found = await db.query.channelBots.findFirst({ where: eq(channelBots.channelId, channelId) })
  if (found) return found
  await db.insert(channelBots).values({ channelId, ownerId }).onConflictDoNothing()
  return (await db.query.channelBots.findFirst({ where: eq(channelBots.channelId, channelId) }))!
}

/** What this bot has spent on its own thinking in the last 24 hours. */
export async function spentToday(channelId: string, now = new Date()): Promise<number> {
  const rows = await db.query.botRuns.findMany({
    where: and(eq(botRuns.channelId, channelId), gt(botRuns.startedAt, new Date(now.getTime() - DAY_MS))),
    columns: { costMillicents: true },
  })
  return rows.reduce((n, r) => n + (r.costMillicents ?? 0), 0)
}

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

  const budget = (bot.dailyBudgetCents ?? 200) * MILLICENTS_PER_CENT
  const spent = await spentToday(channelId, now)
  if (spent >= budget) {
    return finish('over_budget', { summary: `Skipped: today’s budget ($${((bot.dailyBudgetCents ?? 200) / 100).toFixed(2)}) is spent.` })
  }

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
  }
  const all = botTools({ isAdmin: admin, isStudio, canHandOff: access.readable.includes(WORK_CHANNEL_ID) })
  const tools = guardTools(all, ctx)
  const system = await buildBotPrompt({
    channelId, ownerId: owner.id, ownerName: owner.name, tools: all, memory: bot.memory, everyHours: bot.everyHours ?? 24,
    budgetLeftCents: Math.floor((budget - spent) / MILLICENTS_PER_CENT), isStudio, rehearsal, timeZone: owner.timezone, now,
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
  const costOf = (m: string, usage: { inputTokens: number; outputTokens: number }) => actualCostMillicents(m, 'text', usage)
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
      shouldStop: (usage) => spent + costOf(plannedModel, usage) >= budget,
    })
    flush(true)
    await flushing
    const cost = costOf(result.model, result.usage)
    if (key.source !== 'byok') await recordUsage(owner.id, 'channel-bot').catch(() => {})
    const summary = (result.text.trim() || 'Finished without a report.') + (result.stopped ? '\n\nStopped early: today’s budget ran out.' : '')
    const out = await finish('done', { steps, summary, asks: ctx.asks, costMillicents: cost, model: result.model })

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
    return finish('error', { steps, error: message.slice(0, 500), asks: ctx.asks })
  }
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
