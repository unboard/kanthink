import { db } from '@/lib/db'
import { attentionPasses, cards, channelBots, channels, columns, userChannelOrg, users, type AttentionDecisionJson } from '@/lib/db/schema'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { callAction, type ToolContext } from '@/lib/kan/agent/tools'
import { ensureBot } from '@/lib/kan/bots/run'
import { gatherAreas, gatherInputs } from './inputs'

/**
 * Carry out a pass's decisions. The rules that keep this safe live here, in code,
 * not only in the prompt:
 *
 * - Fixed areas (Work, which Claude Code reads by column id; the Studio pipeline;
 *   the share inbox) are never filed into, reshaped, or have their bot switched.
 * - A reshape only adds the columns that are missing. It never renames or removes
 *   one, so no card moves and nothing is lost; the purpose becomes the description.
 * - A share is moved out of the inbox to where it belongs, not copied.
 * - Muting switches the bot off. Waking doesn't switch one on unless the decision says so.
 *
 * Returns a line per thing done, for the owner to read.
 */

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export async function applyAttentionPass(passId: string, ownerId: string): Promise<{ log: string[] } | { error: string }> {
  const pass = await db.query.attentionPasses.findFirst({ where: eq(attentionPasses.id, passId) })
  if (!pass || pass.ownerId !== ownerId) return { error: 'Not found' }
  if (pass.appliedAt) return { error: 'Already done' }
  const d = pass.decisions as AttentionDecisionJson | null
  if (!d) return { error: 'Nothing to apply' }
  // Claim it first, so two taps can't apply it twice.
  const [claimed] = await db.update(attentionPasses).set({ appliedAt: new Date() })
    .where(and(eq(attentionPasses.id, passId), sql`${attentionPasses.appliedAt} IS NULL`)).returning()
  if (!claimed) return { error: 'Already done' }

  const owner = await db.query.users.findFirst({ where: eq(users.id, ownerId), columns: { id: true, name: true, email: true } })
  const since = new Date((pass.startedAt?.getTime() ?? Date.now()) - 30 * 86400_000)
  const [areas, inputs] = await Promise.all([gatherAreas(ownerId, since), gatherInputs(ownerId, since)])
  const areaOf = new Map(areas.map((a) => [a.channelId, a]))
  const inputOf = new Map(inputs.map((i) => [i.id, i]))
  const log: string[] = []
  const started = new Map<string, string>() // name → new channelId

  const { isAdmin } = await import('@/lib/auth')
  const ctxFor = (channelId: string): ToolContext => ({
    userId: ownerId, isAdmin: isAdmin(owner?.email), name: owner?.name,
    readable: [channelId], scope: [channelId], sessionCardIds: [], recentTurns: [],
  })

  // 1. Areas: start, reshape, and attention.
  for (const a of d.areas) {
    try {
      let channelId = a.channelId
      if (a.change === 'start' || !channelId) {
        channelId = await startArea(ownerId, a.name, a.purpose ?? '', a.columns?.length ? a.columns : ['Inbox', 'Doing', 'Done'])
        started.set(a.name.toLowerCase(), channelId)
        log.push(`Started “${a.name}”: ${a.why}`)
      } else {
        const area = areaOf.get(channelId)
        if (!area) { log.push(`Skipped “${a.name}”: it’s gone.`); continue }
        if (a.change === 'reshape' && !area.fixed) {
          const added = await addMissingColumns(channelId, a.columns ?? [])
          if (a.purpose) await db.update(channels).set({ description: a.purpose, updatedAt: new Date() }).where(eq(channels.id, channelId))
          log.push(`Reshaped “${a.name}”${added.length ? ` (added ${added.join(', ')})` : ''}: ${a.why}`)
        }
      }

      const bot = await ensureBot(channelId, ownerId)
      const fixed = areaOf.get(channelId)?.fixed
      const set: Partial<typeof channelBots.$inferInsert> = {
        attention: a.attention, attentionWhy: a.why, attentionAt: new Date(), updatedAt: new Date(),
        ...(a.change === 'start' ? { startedByKan: true } : {}),
      }
      if (!fixed) {
        if (a.attention === 'muted') set.enabled = false
        else if (a.bot) {
          set.enabled = a.bot.on
          if (a.bot.on && !bot.enabled) set.nextRunAt = new Date()
          if (a.bot.everyHours) set.everyHours = Math.min(168, Math.max(1, Math.round(a.bot.everyHours)))
        }
      }
      await db.update(channelBots).set(set).where(eq(channelBots.channelId, channelId))
      if (a.change === 'mute' || a.change === 'quiet' || a.change === 'wake') log.push(`${a.change === 'wake' ? 'Woke' : a.change === 'mute' ? 'Muted' : 'Quieted'} “${a.name}”: ${a.why}`)
      if (!fixed && set.enabled !== undefined && set.enabled !== Boolean(bot.enabled)) log.push(`${set.enabled ? 'Started' : 'Stopped'} the bot for “${a.name}”.`)
    } catch (err) {
      log.push(`Couldn’t update “${a.name}”: ${err instanceof Error ? err.message : 'error'}`)
    }
  }

  // 2. Filings.
  for (const f of d.filings) {
    try {
      const channelId = areaOf.has(f.area) ? f.area : started.get(f.area.toLowerCase())
      if (!channelId) { log.push(`Skipped filing “${f.title}”: no such area.`); continue }
      if (areaOf.get(channelId)?.fixed) { log.push(`Left “${f.title}” where it was: ${areaOf.get(channelId)!.name} isn’t filed into.`); continue }
      log.push(await fileOne(f, channelId, areaOf.get(channelId)?.name ?? f.area, inputOf, ctxFor(channelId)))
    } catch (err) {
      log.push(`Couldn’t file “${f.title}”: ${err instanceof Error ? err.message : 'error'}`)
    }
  }

  await db.update(attentionPasses).set({ appliedLog: log }).where(eq(attentionPasses.id, passId))
  return { log }
}

type Filing = AttentionDecisionJson['filings'][number]
type Input = Awaited<ReturnType<typeof gatherInputs>>[number]

/** Put one input where Kan decided it belongs. Returns the line for the log. */
async function fileOne(f: Filing, channelId: string, name: string, inputOf: Map<string, Input>, ctx: ToolContext): Promise<string> {
  const input = inputOf.get(f.input)
  if (!input) return `Skipped “${f.title}”: that input is gone.`
  if (input.kind === 'share') {
    // The share itself moves out of the inbox, thread and all.
    const first = await firstColumn(channelId)
    if (!first) return `Skipped “${f.title}”: ${name} has no columns.`
    await db.update(cards).set({ channelId, columnId: first, position: 0, updatedAt: new Date() }).where(eq(cards.id, input.id.slice('share:'.length)))
    return `Moved the share “${clip(f.title, 60)}” to ${name}.`
  }
  if (f.as === 'note' && f.cardId) {
    await callAction('add_note', { cardId: f.cardId, content: `From Kan: ${input.text}` }, ctx)
    return `Added a note to “${clip(f.title, 60)}” in ${name}.`
  }
  const data = await callAction('create_card', { channelId, title: f.title, content: input.text, distinct: 'true' }, ctx)
  return data.error ? `Couldn’t file “${f.title}”: ${data.result}` : `Filed “${clip(f.title, 60)}” in ${name}.`
}

/**
 * Build just one of the areas a pass proposed to start: the channel, its bot
 * settings, and whatever Kan meant to file into it. It comes out of the pass, so
 * the rest of the plan still waits for the owner. This is what the city's
 * construction sites do when you say "build it".
 */
export async function buildProposedArea(passId: string, ownerId: string, name: string): Promise<{ channelId: string; log: string[] } | { error: string }> {
  const pass = await db.query.attentionPasses.findFirst({ where: eq(attentionPasses.id, passId) })
  if (!pass || pass.ownerId !== ownerId) return { error: 'Not found' }
  if (pass.appliedAt) return { error: 'That plan is already done' }
  const d = pass.decisions as AttentionDecisionJson | null
  const key = name.trim().toLowerCase()
  const a = d?.areas.find((x) => x.change === 'start' && x.name.trim().toLowerCase() === key)
  if (!d || !a) return { error: 'Kan isn’t proposing that one any more' }
  // Take it out of the plan first, so two taps can't build it twice.
  const rest: AttentionDecisionJson = { ...d, areas: d.areas.filter((x) => x !== a), filings: d.filings.filter((f) => f.area.trim().toLowerCase() !== key) }
  const [claimed] = await db.update(attentionPasses).set({ decisions: rest })
    .where(and(eq(attentionPasses.id, passId), sql`${attentionPasses.appliedAt} IS NULL`)).returning({ id: attentionPasses.id })
  if (!claimed) return { error: 'That plan is already done' }

  const owner = await db.query.users.findFirst({ where: eq(users.id, ownerId), columns: { id: true, name: true, email: true } })
  const channelId = await startArea(ownerId, a.name, a.purpose ?? '', a.columns?.length ? a.columns : ['Inbox', 'Doing', 'Done'])
  await ensureBot(channelId, ownerId)
  await db.update(channelBots).set({
    attention: a.attention, attentionWhy: a.why, attentionAt: new Date(), startedByKan: true, updatedAt: new Date(),
    ...(a.bot?.on ? { enabled: true, nextRunAt: new Date(), everyHours: Math.min(168, Math.max(1, Math.round(a.bot.everyHours ?? 24))) } : {}),
  }).where(eq(channelBots.channelId, channelId))
  const log = [`Started “${a.name}”: ${a.why}`]
  const mine = d.filings.filter((f) => f.area.trim().toLowerCase() === key)
  if (mine.length) {
    const since = new Date((pass.startedAt?.getTime() ?? Date.now()) - 30 * 86400_000)
    const inputOf = new Map((await gatherInputs(ownerId, since)).map((i) => [i.id, i]))
    const { isAdmin } = await import('@/lib/auth')
    const ctx: ToolContext = { userId: ownerId, isAdmin: isAdmin(owner?.email), name: owner?.name, readable: [channelId], scope: [channelId], sessionCardIds: [], recentTurns: [] }
    for (const f of mine) {
      try { log.push(await fileOne(f, channelId, a.name, inputOf, ctx)) } catch (err) { log.push(`Couldn’t file “${f.title}”: ${err instanceof Error ? err.message : 'error'}`) }
    }
  }
  return { channelId, log }
}

async function startArea(ownerId: string, name: string, purpose: string, columnNames: string[]): Promise<string> {
  const id = nanoid()
  const now = new Date()
  await db.insert(channels).values({ id, ownerId, name: clip(name, 60), description: purpose, status: 'active', createdAt: now, updatedAt: now })
  await db.insert(columns).values(columnNames.slice(0, 8).map((c, i) => ({ id: nanoid(), channelId: id, name: clip(c, 40), position: i, createdAt: now, updatedAt: now })))
  const last = await db.query.userChannelOrg.findFirst({ where: eq(userChannelOrg.userId, ownerId), orderBy: [desc(userChannelOrg.position)] })
  await db.insert(userChannelOrg).values({ userId: ownerId, channelId: id, position: (last?.position ?? -1) + 1 })
  return id
}

async function addMissingColumns(channelId: string, wanted: string[]): Promise<string[]> {
  const have = await db.query.columns.findMany({ where: eq(columns.channelId, channelId), orderBy: [asc(columns.position)] })
  const names = new Set(have.map((c) => c.name.trim().toLowerCase()))
  const missing = wanted.filter((w) => w.trim() && !names.has(w.trim().toLowerCase())).slice(0, 4)
  if (!missing.length) return []
  const now = new Date()
  const start = (have.at(-1)?.position ?? -1) + 1
  await db.insert(columns).values(missing.map((m, i) => ({ id: nanoid(), channelId, name: clip(m, 40), position: start + i, createdAt: now, updatedAt: now })))
  return missing
}

async function firstColumn(channelId: string): Promise<string | null> {
  const c = await db.query.columns.findFirst({ where: eq(columns.channelId, channelId), orderBy: [asc(columns.position)], columns: { id: true } })
  return c?.id ?? null
}
