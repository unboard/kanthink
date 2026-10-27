import { db } from '@/lib/db'
import { botApprovals, botRuns, cards, channels, playgroundApps, users, type BotStepJson } from '@/lib/db/schema'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { estimateBuildCost, describeModelMenu, buildModelMenu } from '@/lib/playground/estimate'
import type { PlaygroundProvider } from '@/lib/playground/models'
import { callAction, type ToolContext } from '@/lib/kan/agent/tools'
import type { BotContext, BotTool } from './tools'

/**
 * Builds wait for the owner.
 *
 * A bot never builds on its own: it proposes the app, why, which model, and what
 * that will cost (likely and at most), and the owner approves or rejects with a
 * reason. Approving runs the build at once and charges it to the bot; the bot reads
 * every decision, and every reason, on its next run.
 */

export type ApprovalRow = typeof botApprovals.$inferSelect

const MILLICENTS_PER_DOLLAR = 100_000
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))
const usd = (m: number | null | undefined) => `$${((m ?? 0) / MILLICENTS_PER_DOLLAR).toFixed(2)}`

/** How big the builder's brief will be for a card, and the code it starts from. */
async function buildSize(cardId: string) {
  const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId), columns: { id: true, channelId: true, title: true, messages: true, summary: true } })
  if (!card) return null
  const app = await db.query.playgroundApps.findFirst({
    where: and(eq(playgroundApps.cardId, cardId), eq(playgroundApps.isArchived, false)),
    orderBy: [desc(playgroundApps.updatedAt)],
    columns: { id: true, code: true, title: true },
  })
  const thread = JSON.stringify(card.messages ?? []).length + (card.summary?.length ?? 0)
  return { card, app, briefChars: thread, codeChars: app?.code?.length ?? 0 }
}

export function proposeBuildTool(providers: PlaygroundProvider[]): BotTool {
  const menu = buildModelMenu(providers)
  return {
    name: 'propose_build',
    area: 'build',
    description: `Ask the owner to approve an app build (a new app on a card, or a rebuild of its app). You never build directly: the owner sees what it is, why, the model and the estimated cost, and approves or rejects with a reason. An approved build runs at once; you'll see the result, or the reason it was rejected, next run. Make the case in purpose: who it's for and why it's worth the money. Pick the cheapest model that will do the job well:\n${describeModelMenu(providers)}`,
    input_schema: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'The card to build from; its thread is the brief' },
        title: { type: 'string', description: 'What the app is, in a few words' },
        purpose: { type: 'string', description: 'Why build it: who it serves and what it should achieve. One to three sentences.' },
        modelId: { type: 'string', enum: menu.map((m) => m.id), description: 'Model to build with' },
        brief: { type: 'string', description: 'Direction for the builder beyond the card thread' },
      },
      required: ['cardId', 'title', 'purpose', 'modelId'],
    },
    kind: 'write',
    running: (i) => `Asking you to approve building “${str(i.title)}”`,
    async run(input, ctx) {
      const bot = ctx as BotContext
      const size = await buildSize(str(input.cardId))
      if (!size || size.card.channelId !== bot.channelId) return { content: 'That card isn’t in this channel.', isError: true }
      const modelId = menu.some((m) => m.id === input.modelId) ? str(input.modelId) : menu[0]?.id
      if (!modelId) return { content: 'No build model is available: the owner has no AI key.', isError: true }

      const waiting = await db.query.botApprovals.findFirst({
        where: and(eq(botApprovals.cardId, size.card.id), eq(botApprovals.status, 'pending')),
      })
      if (waiting) return { content: `A build of this card is already waiting for the owner ("${waiting.title}"). Don't ask again.`, label: `Already waiting on you: “${waiting.title}”` }

      const est = estimateBuildCost({ modelId, briefChars: size.briefChars + str(input.brief).length, existingCodeChars: size.codeChars })
      const [row] = await db.insert(botApprovals).values({
        channelId: bot.channelId,
        ownerId: ctx.userId,
        runId: bot.runId ?? null,
        kind: 'build_app',
        cardId: size.card.id,
        title: str(input.title).slice(0, 120) || size.card.title,
        purpose: str(input.purpose).slice(0, 1000),
        brief: str(input.brief).slice(0, 4000) || null,
        modelId,
        likelyMillicents: Math.round(est.likelyUsd * MILLICENTS_PER_DOLLAR),
        maxMillicents: Math.round(est.maxUsd * MILLICENTS_PER_DOLLAR),
      }).returning()

      const channel = await db.query.channels.findFirst({ where: eq(channels.id, bot.channelId), columns: { name: true } })
      const { createNotification } = await import('@/lib/notifications/createNotification')
      await createNotification({
        userId: ctx.userId,
        type: 'bot_run',
        title: `${channel?.name ?? 'A bot'} wants to build “${row.title}”`,
        body: `${row.purpose} · ${est.modelLabel}, about $${est.likelyUsd.toFixed(2)} (at most $${est.maxUsd.toFixed(2)})`.slice(0, 240),
        data: { channelId: bot.channelId, approvalId: row.id },
      }).catch(() => {})

      return {
        content: `Asked the owner to approve building "${row.title}" with ${est.modelLabel}: about $${est.likelyUsd.toFixed(2)}, at most $${est.maxUsd.toFixed(2)}. ${size.app ? 'It rebuilds the card’s existing app.' : 'It makes a new app on the card.'} Nothing is built until they approve. Carry on with other work.`,
        label: `Asked you to approve building “${row.title}” (~$${est.likelyUsd.toFixed(2)})`,
      }
    },
  }
}

/** For the bot's prompt: what's waiting on the owner, and what they decided lately. */
export async function approvalsContext(channelId: string): Promise<string> {
  const rows = await db.query.botApprovals.findMany({
    where: eq(botApprovals.channelId, channelId),
    orderBy: [desc(botApprovals.createdAt)],
    limit: 10,
  })
  if (!rows.length) return ''
  const line = (r: ApprovalRow) => {
    const model = r.modelId ? ` with ${r.modelId}` : ''
    switch (r.status) {
      case 'pending': return `- WAITING: build "${r.title}"${model}, ~${usd(r.likelyMillicents)}. Don't ask again.`
      case 'rejected': return `- REJECTED: build "${r.title}"${model}. Their reason: ${r.reason || '(none given)'}. Learn from it.`
      case 'done': return `- BUILT: "${r.title}"${model} for ${usd(r.costMillicents)} (estimated ${usd(r.likelyMillicents)}). ${r.outcome ?? ''}`
      case 'failed': return `- BUILD FAILED: "${r.title}"${model}: ${r.outcome ?? 'unknown error'}`
      default: return `- ${r.status.toUpperCase()}: "${r.title}"`
    }
  }
  return rows.map(line).join('\n')
}

export async function pendingApprovals(ownerId: string, channelIds?: string[]) {
  return db.query.botApprovals.findMany({
    where: and(
      eq(botApprovals.ownerId, ownerId),
      inArray(botApprovals.status, ['pending', 'approved']),
      channelIds ? inArray(botApprovals.channelId, channelIds) : undefined,
    ),
    orderBy: [desc(botApprovals.createdAt)],
  })
}

/**
 * The owner's decision. Approve may swap the model (re-estimated); reject keeps the
 * reason for the bot. Returns the row as decided; an approved build runs via `runApprovedBuild`.
 */
export async function decideApproval(id: string, ownerId: string, d: { approve: boolean; reason?: string; modelId?: string }) {
  const row = await db.query.botApprovals.findFirst({ where: eq(botApprovals.id, id) })
  if (!row || row.ownerId !== ownerId) return { error: 'Not found', status: 404 as const }
  if (row.status !== 'pending') return { error: 'Already decided', status: 409 as const }

  const set: Partial<typeof botApprovals.$inferInsert> = { decidedAt: new Date() }
  if (!d.approve) {
    set.status = 'rejected'
    set.reason = (d.reason ?? '').trim().slice(0, 1000) || null
  } else {
    set.status = 'approved'
    if (d.modelId && d.modelId !== row.modelId && row.cardId) {
      const size = await buildSize(row.cardId)
      const est = estimateBuildCost({ modelId: d.modelId, briefChars: (size?.briefChars ?? 0) + (row.brief?.length ?? 0), existingCodeChars: size?.codeChars })
      set.modelId = est.modelId
      set.likelyMillicents = Math.round(est.likelyUsd * MILLICENTS_PER_DOLLAR)
      set.maxMillicents = Math.round(est.maxUsd * MILLICENTS_PER_DOLLAR)
    }
  }
  // Conditional on still pending, so two taps can't run the build twice.
  const [updated] = await db.update(botApprovals).set(set)
    .where(and(eq(botApprovals.id, id), eq(botApprovals.status, 'pending'))).returning()
  if (!updated) return { error: 'Already decided', status: 409 as const }
  return { row: updated }
}

/**
 * Run an approved build as the bot: logged in the bot's run log with its cost, so
 * the Spend page charges it to that bot. Never throws.
 */
export async function runApprovedBuild(approvalId: string): Promise<void> {
  const row = await db.query.botApprovals.findFirst({ where: eq(botApprovals.id, approvalId) })
  if (!row || row.status !== 'approved' || !row.cardId) return
  const owner = await db.query.users.findFirst({ where: eq(users.id, row.ownerId), columns: { id: true, name: true, email: true } })
  if (!owner) return

  const runId = crypto.randomUUID()
  const step: BotStepJson = { id: 'build', label: `Building “${row.title}” with ${row.modelId}`, status: 'running', write: true }
  await db.insert(botRuns).values({ id: runId, channelId: row.channelId, ownerId: row.ownerId, trigger: 'build', status: 'running', steps: [step], startedAt: new Date() })

  const { isAdmin } = await import('@/lib/auth')
  const ctx: ToolContext = {
    userId: owner.id, isAdmin: isAdmin(owner.email), name: owner.name,
    readable: [row.channelId], scope: [row.channelId], sessionCardIds: [], recentTurns: [],
  }
  const prompt = [row.purpose && `Purpose: ${row.purpose}`, row.brief].filter(Boolean).join('\n\n') || undefined
  try {
    const data = await callAction('build_app', { cardId: row.cardId, prompt, modelId: row.modelId ?? undefined }, ctx)
    const cost = typeof data.costUsd === 'number' ? Math.ceil(data.costUsd * MILLICENTS_PER_DOLLAR) : 0
    const ok = !data.error && !/^Failed/.test(data.result ?? '')
    const outcome = (data.result || data.error || '').slice(0, 500)
    await db.update(botApprovals).set({ status: ok ? 'done' : 'failed', costMillicents: cost, outcome }).where(eq(botApprovals.id, row.id))
    const href = data.channelId && data.cardId ? `/channel/${data.channelId}/card/${data.cardId}` : undefined
    await db.update(botRuns).set({
      status: ok ? 'done' : 'error',
      steps: [{ ...step, label: ok ? `Built “${row.title}”` : `Build of “${row.title}” failed`, status: ok ? 'done' : 'error', href }],
      summary: ok
        ? `Built **${row.title}** with ${row.modelId}, as you approved. It cost ${usd(cost)} (estimated ${usd(row.likelyMillicents)}).`
        : `The build of **${row.title}** failed: ${outcome}`,
      costMillicents: cost, buildMillicents: cost, model: row.modelId, endedAt: new Date(),
      error: ok ? null : outcome,
    }).where(eq(botRuns.id, runId))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong'
    await db.update(botApprovals).set({ status: 'failed', outcome: message.slice(0, 500) }).where(eq(botApprovals.id, row.id))
    await db.update(botRuns).set({ status: 'error', error: message.slice(0, 500), endedAt: new Date(), steps: [{ ...step, status: 'error' }] }).where(eq(botRuns.id, runId))
  }
}

/** What this build would cost on each model the owner can use, for swapping before approving. */
export async function estimatesFor(row: ApprovalRow, providers: PlaygroundProvider[]) {
  const size = row.cardId ? await buildSize(row.cardId) : null
  return buildModelMenu(providers).map((m) => {
    const est = estimateBuildCost({ modelId: m.id, briefChars: (size?.briefChars ?? 0) + (row.brief?.length ?? 0), existingCodeChars: size?.codeChars })
    return { id: m.id, label: m.label, when: m.when, likelyUsd: est.likelyUsd, maxUsd: est.maxUsd }
  })
}
