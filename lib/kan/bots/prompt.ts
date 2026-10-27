import { db } from '@/lib/db'
import { botRuns, cards, channels, columns, instructionCards, playgroundApps } from '@/lib/db/schema'
import { and, asc, desc, eq } from 'drizzle-orm'
import type { BotArea, BotTool } from './tools'
import { approvalsContext } from './approvals'

/**
 * Who a channel bot is, what it can do, and what's in front of it this run.
 *
 * Three things the bot has to know without being told twice:
 *
 * - **Its job.** The channel's name, description and standing instructions are the
 *   charter. A channel with apps in it is a small business; the job is to make it work.
 * - **Everything it can do.** Listed by area from the tools it actually has, so the
 *   list can't promise a capability the run doesn't carry.
 * - **Where it left off.** Its own notes and its last few reports. A bot that runs
 *   once a day with no memory would start over every morning.
 */

const AREAS: [BotArea, string][] = [
  ['people', 'Talk to people — the people using this channel’s apps'],
  ['money', 'Money — prices, checkout, revenue'],
  ['build', 'Build and deploy'],
  ['research', 'Research'],
  ['board', 'The channel’s cards and tasks'],
  ['self', 'Yourself'],
]

const firstSentence = (s: string) => (s.match(/^[^.!?]*[.!?]/)?.[0] ?? s).slice(0, 220)

export function capabilityList(tools: BotTool[]): string {
  return AREAS.map(([area, title]) => {
    const mine = tools.filter((t) => t.area === area)
    if (!mine.length && area !== 'research') return ''
    const lines = mine.map((t) => `- **${t.name}**: ${firstSentence(t.description)}`)
    if (area === 'research') lines.unshift('- **web search**: search the web and read pages, as much as a decision needs.')
    return `### ${title}\n${lines.join('\n')}`
  }).filter(Boolean).join('\n\n')
}

export async function buildBotPrompt(opts: {
  channelId: string
  ownerName?: string | null
  tools: BotTool[]
  memory?: string | null
  everyHours: number
  budgetLeftCents: number
  isStudio: boolean
  ownerId: string
  rehearsal?: boolean
  timeZone?: string | null
  now?: Date
}): Promise<string> {
  const now = opts.now ?? new Date()
  const [channel, cols, cardRows, shrooms, apps, runs, proposals] = await Promise.all([
    db.query.channels.findFirst({ where: eq(channels.id, opts.channelId), columns: { name: true, description: true, aiInstructions: true } }),
    db.query.columns.findMany({ where: eq(columns.channelId, opts.channelId), orderBy: [asc(columns.position)], columns: { id: true, name: true } }),
    db.query.cards.findMany({
      where: and(eq(cards.channelId, opts.channelId), eq(cards.isArchived, false)),
      orderBy: [desc(cards.updatedAt)],
      limit: 60,
      columns: { id: true, title: true, columnId: true, tags: true, summary: true, isPendingReview: true, updatedAt: true },
    }),
    db.query.instructionCards.findMany({ where: eq(instructionCards.channelId, opts.channelId), columns: { title: true, action: true, runMode: true, isEnabled: true, lastExecutedAt: true } }),
    db.query.playgroundApps.findMany({ where: eq(playgroundApps.channelId, opts.channelId), columns: { id: true, title: true, cardId: true } }),
    db.query.botRuns.findMany({ where: eq(botRuns.channelId, opts.channelId), orderBy: [desc(botRuns.startedAt)], limit: 4, columns: { startedAt: true, summary: true, status: true, trigger: true } }),
    approvalsContext(opts.channelId).catch(() => ''),
  ])
  const colName = new Map(cols.map((c) => [c.id, c.name]))
  const appOf = new Map(apps.map((a) => [a.cardId, a]))
  const tz = opts.timeZone || 'America/Chicago'
  const when = (d: Date) => d.toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  const cardLines = cardRows.map((c) => {
    const app = appOf.get(c.id)
    return `- [${c.id}] ${c.title} — ${colName.get(c.columnId) ?? '?'}${c.isPendingReview ? ' (awaiting review)' : ''}${c.tags?.length ? ` · tags: ${c.tags.join(', ')}` : ''}${app ? ` · app ${app.id}` : ''}${c.summary ? `\n  ${c.summary.slice(0, 160)}` : ''}`
  })
  const shroomLines = shrooms.map((s) => `- ${s.title} (${s.action}, ${s.runMode === 'automatic' && s.isEnabled ? 'runs on its own' : 'manual'}${s.lastExecutedAt ? `, last ran ${when(s.lastExecutedAt)}` : ''})`)
  const pastRuns = runs.filter((r) => r.trigger !== 'rehearsal' && r.summary).slice(0, 3).map((r) => `- ${when(r.startedAt!)}: ${r.summary!.slice(0, 500)}`)

  let studio = ''
  if (opts.isStudio) {
    const { buildStudioContext } = await import('@/lib/studio/context')
    studio = await buildStudioContext(opts.ownerId).catch(() => '')
    // That context was written for chat with the owner, so it waits for their word.
    if (studio) studio += `

(The Studio notes above say "only when they say…" because they were written for chatting with the owner. As this channel's bot you test, build, ship, drop and price on your own judgment.)`
  }

  return `You are the bot that runs the channel "${channel?.name ?? 'this channel'}" for ${opts.ownerName || 'its owner'}. It is ${when(now)}. You run on your own every ${opts.everyHours === 1 ? 'hour' : `${opts.everyHours} hours`}; nobody is watching while you work. ${opts.ownerName || 'The owner'} reads your report afterwards and can see every step you took.
${opts.rehearsal ? '\n**This is a rehearsal.** Write tools will report what they would do and change nothing. Run exactly as you would for real, so the owner can see your judgment. Write your report in the conditional ("I would put up…"), since nothing actually happened.\n' : ''}
## Your job
${channel?.description ? `${channel.description}\n\n` : ''}Standing instructions for this channel:
"""
${(channel?.aiInstructions || '(none written — infer the goal from the channel name, its cards and its apps)').slice(0, 3000)}
"""

If this channel has apps, it is a small business and your job is to make it work: people find the apps, use them, come back and pay. Otherwise your job is to move the channel's goal forward.

## Everything you can do
You have full permission for all of it but one: app builds. Propose those with propose_build and the owner decides, because a build costs real money. Everything else, don't ask and don't wait; do the work and report it.

${capabilityList(opts.tools)}

## How to run
1. Start from your notes. Then look: the scoreboard (app_numbers) and the people (list_people) when there are apps, and the cards.
2. Anyone who wrote in gets an answer first, every run. Read their history before replying.
3. Pick the one to three moves most likely to move the goal today, and do each one completely. Research before proposing a build or setting a price; check a build with show_app before publishing it.
4. Act on evidence and say what the evidence was. Never invent results, numbers or quotes.
5. Be a good neighbor to customers: short, warm, written as ${opts.ownerName || 'the owner'}, never mention a bot or AI, never email someone twice in three days unless they wrote in, never email anyone who unsubscribed.
6. A run where nothing would help is fine. Don't make busywork.
7. Use ask_owner only for what you truly can't do yourself (an account to connect, a key, a legal or personal call).
8. Spend carefully: you have about $${(opts.budgetLeftCents / 100).toFixed(2)} of thinking left today. An approved build is charged to you too, so propose one only when it's clearly worth it, on the cheapest model that will do it well. Don't reread what you already know; a run that does one thing well beats one that reads everything.
9. Finish with **remember** (complete notes for your next run), then write your report: 2–5 plain sentences on what you did and what you're watching. No headers, no lists unless you did many things.

## Your notes from last run
${opts.memory?.trim() || '(none — this is your first run. Get to know the channel, then decide.)'}

## Your recent reports
${pastRuns.join('\n') || '(none yet)'}
${proposals ? `\n## Builds you proposed, and what the owner decided\n${proposals}\n` : ''}

## What's in the channel now
Columns: ${cols.map((c) => c.name).join(' → ') || 'none'}

Cards (most recently touched first):
${cardLines.join('\n') || '(none)'}

${shroomLines.length ? `Shrooms (automations) here:\n${shroomLines.join('\n')}\n` : ''}${studio}

American spelling.`
}
