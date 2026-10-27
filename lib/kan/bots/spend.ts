import { db } from '@/lib/db'
import { botRuns, botSpendLimits } from '@/lib/db/schema'
import { and, eq, gt } from 'drizzle-orm'
import { priceOf } from '@/lib/playground/aiPricing'
import type { Usage } from '@/lib/kan/agent/run'

/**
 * What bots may spend, and what they have.
 *
 * Three ceilings stand over every run, and whichever is lowest wins: the bot's own
 * daily budget, the owner's ceiling over all their bots (per day and per month), and
 * a cap on any single run's thinking. A build a bot starts is charged to that bot,
 * so its budget means everything it caused, not just its own tokens.
 *
 * All amounts are millicents (1 cent = 1000), like the rest of the pricing code.
 */

export const MILLICENTS_PER_CENT = 1000
const DAY_MS = 86400_000

/**
 * Prompt-cache pricing, relative to the model's input price. Both providers bill a
 * cache read at a tenth of the input rate; Anthropic bills a cache write at 1.25x.
 * Each round of a run resends everything before it, so most of a long run's input
 * is a cache read, and pricing it at the full rate overstated runs by about half.
 */
export const CACHE_READ_RATE = 0.1
export const CACHE_WRITE_RATE = 1.25

/**
 * Set aside before a bot may start a build. A first build on the flagship model
 * lands around 30–70¢; refusing a build that can't fit beats one that overruns.
 */
export const BUILD_RESERVE_MILLICENTS = 75 * MILLICENTS_PER_CENT

export interface SpendLimits {
  dailyCapCents: number
  monthlyCapCents: number
  perRunCapCents: number
}

export const DEFAULT_LIMITS: SpendLimits = { dailyCapCents: 500, monthlyCapCents: 5000, perRunCapCents: 75 }

/** A run's own thinking, priced from the provider's token counts, cache included. */
export function thinkingCost(model: string, usage: Usage): number {
  const price = priceOf(model)
  if (!price) return 0
  const cached = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens)
  const written = Math.min(usage.cacheWriteTokens ?? 0, usage.inputTokens - cached)
  const fresh = usage.inputTokens - cached - written
  const total = fresh * price.input + cached * price.input * CACHE_READ_RATE + written * price.input * CACHE_WRITE_RATE + usage.outputTokens * price.output
  return Math.ceil(total)
}

export type Ceiling = 'bot' | 'day' | 'month'

export interface Room {
  /** What may still be spent before the lowest ceiling, in millicents. */
  left: number
  limitedBy: Ceiling
  /** The same, said to a person. */
  message: string
}

const dollars = (millicents: number) => `$${(millicents / 100_000).toFixed(2)}`

/** The lowest of the three ceilings, and which one it is. */
export function roomLeft(a: {
  botBudget: number; botSpent: number
  dayCap: number; daySpent: number
  monthCap: number; monthSpent: number
}): Room {
  const options: { left: number; limitedBy: Ceiling; message: string }[] = [
    { left: a.botBudget - a.botSpent, limitedBy: 'bot', message: `this bot’s daily budget (${dollars(a.botBudget)}) is spent` },
    { left: a.dayCap - a.daySpent, limitedBy: 'day', message: `your daily ceiling for all bots (${dollars(a.dayCap)}) is reached` },
    { left: a.monthCap - a.monthSpent, limitedBy: 'month', message: `your monthly ceiling for all bots (${dollars(a.monthCap)}) is reached` },
  ]
  const lowest = options.reduce((m, o) => (o.left < m.left ? o : m))
  return { ...lowest, left: Math.max(0, lowest.left) }
}

/**
 * Asked between rounds: stop if the next round, priced like the last one, would
 * cross the run cap or the room left. Checking only what's already spent let a run
 * go one whole round over.
 */
export function shouldStopRun(a: { spent: number; lastRound: number; runCap: number; room: number }): boolean {
  const next = a.spent + a.lastRound
  return next >= a.runCap || next >= a.room
}

export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export async function limitsFor(userId: string): Promise<SpendLimits & { capNotifiedAt: Date | null }> {
  const row = await db.query.botSpendLimits.findFirst({ where: eq(botSpendLimits.userId, userId) })
  return {
    dailyCapCents: row?.dailyCapCents ?? DEFAULT_LIMITS.dailyCapCents,
    monthlyCapCents: row?.monthlyCapCents ?? DEFAULT_LIMITS.monthlyCapCents,
    perRunCapCents: row?.perRunCapCents ?? DEFAULT_LIMITS.perRunCapCents,
    capNotifiedAt: row?.capNotifiedAt ?? null,
  }
}

export async function saveLimits(userId: string, set: Partial<SpendLimits & { capNotifiedAt: Date }>) {
  await db.insert(botSpendLimits).values({ userId, ...set, updatedAt: new Date() })
    .onConflictDoUpdate({ target: botSpendLimits.userId, set: { ...set, updatedAt: new Date() } })
}

async function sumSince(where: ReturnType<typeof and>): Promise<number> {
  const rows = await db.query.botRuns.findMany({ where, columns: { costMillicents: true } })
  return rows.reduce((n, r) => n + (r.costMillicents ?? 0), 0)
}

/** One bot, the last 24 hours. */
export function spentByBot(channelId: string, now = new Date()) {
  return sumSince(and(eq(botRuns.channelId, channelId), gt(botRuns.startedAt, new Date(now.getTime() - DAY_MS))))
}

/** All of an owner's bots, since a moment. */
export function spentByOwner(ownerId: string, since: Date) {
  return sumSince(and(eq(botRuns.ownerId, ownerId), gt(botRuns.startedAt, since)))
}

/** Room left for a bot right now, under all three ceilings. */
export async function roomFor(bot: { channelId: string; ownerId: string; dailyBudgetCents: number | null }, now = new Date()) {
  const limits = await limitsFor(bot.ownerId)
  const [botSpent, daySpent, monthSpent] = await Promise.all([
    spentByBot(bot.channelId, now),
    spentByOwner(bot.ownerId, new Date(now.getTime() - DAY_MS)),
    spentByOwner(bot.ownerId, monthStart(now)),
  ])
  const room = roomLeft({
    botBudget: (bot.dailyBudgetCents ?? 200) * MILLICENTS_PER_CENT, botSpent,
    dayCap: limits.dailyCapCents * MILLICENTS_PER_CENT, daySpent,
    monthCap: limits.monthlyCapCents * MILLICENTS_PER_CENT, monthSpent,
  })
  return { room, limits, botSpent }
}
