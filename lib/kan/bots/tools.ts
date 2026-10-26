import { db } from '@/lib/db'
import { appEmails, appMessages, appUsers, channelBots, playgroundApps } from '@/lib/db/schema'
import { and, desc, eq, gt, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { claudeCodeTool, studioTools, voiceTools, type AgentTool, type ToolContext } from '@/lib/kan/agent/tools'

/**
 * Everything a channel bot can do, grouped the way its prompt describes them.
 *
 * The board actions are voice mode's, scoped to the bot's channel. On top of those
 * sit the things a channel needs to run as a business on its own: the people using
 * its apps (read, reply, email), what they pay, the price, and publishing.
 *
 * The owner chose full autonomy, so nothing here waits for approval. The limits that
 * remain are the ones a careful person would keep without being told: never email
 * someone who asked not to be, don't email anyone twice in three days unless they
 * wrote in, keep prices in a sane range, and one build or ship per run.
 */

export type BotArea = 'board' | 'research' | 'build' | 'money' | 'people' | 'self'

export interface BotTool extends AgentTool {
  area: BotArea
}

export interface BotContext extends ToolContext {
  channelId: string
  /** Rehearsal: write tools report what they would do and change nothing. */
  rehearsal?: boolean
  /** Questions only the owner can answer, gathered over the run. */
  asks: string[]
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

/** Voice actions a bot gets, and which area of its job each belongs to. */
const BOARD: Record<string, BotArea> = {
  search_cards: 'board', show_card: 'board', create_card: 'board', add_note: 'board',
  create_task: 'board', complete_task: 'board', update_task_status: 'board', update_task: 'board',
  move_card: 'board', archive_card: 'board', unarchive_card: 'board', update_channel: 'self',
  show_app: 'build', app_audience: 'people', build_app: 'build',
  query_mixpanel: 'research', kanwatch_lookup: 'research',
}

/** Per run, so one bad decision can't repeat itself twenty times before anyone looks. */
export const PER_RUN_LIMITS: Record<string, number> = {
  build_app: 1, ship_app: 1, publish_app: 1, set_price: 2, start_test_page: 2,
  email_person: 5, reply_to_person: 10, hand_to_claude_code: 1, drop_spark: 3,
}

const EMAIL_GAP_MS = 3 * 86400_000

async function channelApps(channelId: string) {
  return db.query.playgroundApps.findMany({ where: eq(playgroundApps.channelId, channelId) })
}

async function memberInChannel(ownerId: string, channelId: string, appUserId: string) {
  const member = await db.query.appUsers.findFirst({ where: and(eq(appUsers.id, appUserId), eq(appUsers.ownerId, ownerId)) })
  if (!member) return null
  const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, member.appId) })
  return app && app.channelId === channelId ? { member, app } : null
}

async function appInChannel(channelId: string, appId: string) {
  const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
  return app && app.channelId === channelId ? app : null
}

function money(minor: number, currency = 'usd') {
  const n = minor / 100
  return `${currency.toLowerCase() === 'usd' ? '$' : `${currency.toUpperCase()} `}${Number.isInteger(n) ? n : n.toFixed(2)}`
}

const peopleTools: BotTool[] = [
  {
    name: 'list_people',
    area: 'people',
    description: 'Everyone using the apps in this channel: their stage (prospect, using, customer, lapsed), unread messages from them, the last email they got and whether they opened it, and what they paid. Start here before writing to anyone.',
    input_schema: { type: 'object', properties: {} },
    kind: 'read',
    running: () => 'Checking who uses this channel’s apps',
    async run(_i, ctx) {
      const { listPeople } = await import('@/lib/studio/people')
      const appIds = new Set((await channelApps((ctx as BotContext).channelId)).map((a) => a.id))
      const people = (await listPeople(ctx.userId)).filter((p) => appIds.has(p.appId))
      if (!people.length) return { content: 'Nobody uses the apps in this channel yet.', label: 'Nobody here yet' }
      const lines = people.slice(0, 60).map((p) => {
        const last = p.lastEmail ? `last email "${p.lastEmail.subject}" ${p.lastEmail.status}${p.lastEmail.openedAt ? ', opened' : ''}${p.lastEmail.sentAt ? ` ${p.lastEmail.sentAt.slice(0, 10)}` : ''}` : 'never emailed'
        return `- [${p.id}] ${p.name || p.email} — ${p.appTitle} · ${p.stage}${p.unread ? ` · ${p.unread} unread` : ''}${p.unsubscribed ? ' · unsubscribed' : ''} · ${last}${p.orders ? ` · ${p.orders.count} orders` : ''}`
      })
      return { content: lines.join('\n'), label: `${people.length} ${people.length === 1 ? 'person' : 'people'} using these apps` }
    },
  },
  {
    name: 'read_person',
    area: 'people',
    description: 'The whole history with one person: everything they wrote in the app, every reply and email, orders, and private notes. Read before replying or emailing.',
    input_schema: { type: 'object', properties: { personId: { type: 'string' } }, required: ['personId'] },
    kind: 'read',
    running: () => 'Reading their history',
    async run(i, ctx) {
      const bot = ctx as BotContext
      if (!(await memberInChannel(ctx.userId, bot.channelId, str(i.personId)))) return { content: 'That person doesn’t use an app in this channel.', isError: true }
      const { personDetail } = await import('@/lib/studio/people')
      const d = await personDetail(ctx.userId, str(i.personId))
      if (!d) return { content: 'Person not found.', isError: true }
      const thread = d.thread.slice(-30).map((t) => `${t.at.slice(0, 16)} ${t.kind === 'theirs' ? 'THEM' : t.kind === 'reply' ? 'YOU' : t.kind === 'email' ? `EMAIL "${t.email.subject}"` : 'EVENT'}: ${'text' in t ? t.text : t.email.body}`.slice(0, 600))
      const p = d.person
      return {
        content: `${p.name || p.email} (${p.email}) · ${p.appTitle} · ${p.stage}${p.unsubscribed ? ' · UNSUBSCRIBED: never email' : ''}${p.priceLabel ? ` · price ${p.priceLabel}` : ''}\n\n${thread.join('\n') || '(nothing yet)'}`,
        label: `Read ${p.name || p.email}’s history`,
      }
    },
  },
  {
    name: 'reply_to_person',
    area: 'people',
    description: 'Reply inside the app’s conversation to someone who wrote in. They get an email with a button back to the conversation. Use for answering questions, feedback and support. Write as the owner, warmly and briefly; never mention that you are a bot or AI.',
    input_schema: { type: 'object', properties: { personId: { type: 'string' }, message: { type: 'string' } }, required: ['personId', 'message'] },
    kind: 'write',
    running: () => 'Replying in the app',
    async run(i, ctx) {
      const bot = ctx as BotContext
      const found = await memberInChannel(ctx.userId, bot.channelId, str(i.personId))
      if (!found) return { content: 'That person doesn’t use an app in this channel.', isError: true }
      const { postFromPublisher } = await import('@/lib/playground/appThread')
      await postFromPublisher({ app: found.app, member: found.member, publisherUserId: ctx.userId, body: str(i.message) })
      await db.update(appMessages).set({ isRead: true }).where(and(eq(appMessages.appUserId, found.member.id), eq(appMessages.sender, 'user')))
      return { content: `Replied to ${found.member.name || found.member.email}.`, label: `Replied to ${found.member.name || found.member.email}` }
    },
  },
  {
    name: 'email_person',
    area: 'people',
    description: 'Email one person who uses an app here: a follow-up, a launch note, a check-in, an offer. Plain text, short, written as the owner. The send is refused if they unsubscribed, or if they were emailed in the last 3 days and haven’t written since.',
    input_schema: { type: 'object', properties: { personId: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' }, why: { type: 'string', description: 'One line for the log: why this email, now' } }, required: ['personId', 'subject', 'body', 'why'] },
    kind: 'write',
    running: (i) => `Emailing ${str(i.subject) ? `“${str(i.subject).slice(0, 40)}”` : 'them'}`,
    async run(i, ctx) {
      const bot = ctx as BotContext
      const found = await memberInChannel(ctx.userId, bot.channelId, str(i.personId))
      if (!found) return { content: 'That person doesn’t use an app in this channel.', isError: true }
      const { member } = found
      const who = member.name || member.email
      if (member.unsubscribedAt) return { content: `${who} unsubscribed. Never email them.`, isError: true }
      const lastSent = await db.query.appEmails.findFirst({
        where: and(eq(appEmails.appUserId, member.id), eq(appEmails.status, 'sent'), gt(appEmails.sentAt, new Date(Date.now() - EMAIL_GAP_MS))),
        orderBy: [desc(appEmails.sentAt)],
      })
      if (lastSent) {
        const wroteSince = await db.query.appMessages.findFirst({ where: and(eq(appMessages.appUserId, member.id), eq(appMessages.sender, 'user'), gt(appMessages.createdAt, lastSent.sentAt!)) })
        if (!wroteSince) return { content: `${who} was emailed on ${lastSent.sentAt!.toISOString().slice(0, 10)} ("${lastSent.subject}") and hasn't written since. Wait.`, isError: true }
      }
      const { createDraft, sendEmail } = await import('@/lib/studio/people')
      const draft = await createDraft({ ownerId: ctx.userId, member, subject: str(i.subject), body: str(i.body), source: 'kan', kind: 'bot', reason: str(i.why) })
      await sendEmail(ctx.userId, draft.id)
      return { content: `Emailed ${who}: "${str(i.subject)}".`, label: `Emailed ${who}` }
    },
  },
]

const moneyTools: BotTool[] = [
  {
    name: 'app_numbers',
    area: 'money',
    description: 'For each app in this channel: live or not, its link, price, views, people by stage, unread messages, orders and revenue. The scoreboard — check it every run.',
    input_schema: { type: 'object', properties: {} },
    kind: 'read',
    running: () => 'Checking the numbers',
    async run(_i, ctx) {
      const apps = await channelApps((ctx as BotContext).channelId)
      if (!apps.length) return { content: 'No apps in this channel yet.', label: 'No apps yet' }
      const { orderTotalsForApp } = await import('@/lib/playground/orders')
      const { purchasesForApp } = await import('@/lib/playground/appPurchases')
      const { appStatus } = await import('@/lib/playground/appRelease')
      const { personStage } = await import('@/lib/studio/stage')
      const { playUrl } = await import('@/lib/studio/pipeline')
      const ids = apps.map((a) => a.id)
      const [members, unread] = await Promise.all([
        db.query.appUsers.findMany({ where: inArray(appUsers.appId, ids) }),
        db.query.appMessages.findMany({ where: and(inArray(appMessages.appId, ids), eq(appMessages.sender, 'user'), eq(appMessages.isRead, false)), columns: { appId: true } }),
      ])
      const lines: string[] = []
      for (const app of apps) {
        const [orders, purchases] = await Promise.all([orderTotalsForApp(app.id), purchasesForApp(app.id)])
        const mine = members.filter((m) => m.appId === app.id)
        const stages: Record<string, number> = {}
        for (const m of mine) stages[personStage(m)] = (stages[personStage(m)] ?? 0) + 1
        const paid = purchases.filter((p) => p.status === 'active').reduce((n, p) => n + (p.amount ?? 0), 0)
        const status = app.reserveMode ? 'test page' : appStatus(app)
        lines.push([
          `- [appId:${app.id}] ${app.title} (card ${app.cardId}) — ${status}${app.shareToken && app.isPublic ? ` at ${playUrl(app.shareToken)}` : ''}`,
          `  price: ${app.paywallEnabled && app.priceAmount ? `${money(app.priceAmount, app.priceCurrency || 'usd')}${app.priceInterval && app.priceInterval !== 'one_time' ? `/${app.priceInterval}` : ''}` : 'free'} · views ${app.viewCount ?? 0} · people ${mine.length} ${JSON.stringify(stages)} · unread ${unread.filter((u) => u.appId === app.id).length}`,
          `  revenue: purchases ${money(paid)}${orders.revenue ? ` + orders ${money(orders.revenue, orders.currency || 'usd')}` : ''}${app.code ? '' : ' · not built yet'}`,
        ].join('\n'))
      }
      return { content: lines.join('\n'), label: `Checked ${apps.length} app${apps.length === 1 ? '' : 's'}` }
    },
  },
  {
    name: 'set_price',
    area: 'money',
    description: 'Set or change what an app in this channel costs, and turn checkout on. amount is in dollars (1–500). interval: one_time, month or year. Change prices on evidence (views without buyers, people asking), not on a whim, and note why.',
    input_schema: { type: 'object', properties: { appId: { type: 'string' }, amount: { type: 'number' }, interval: { type: 'string', enum: ['one_time', 'month', 'year'] }, why: { type: 'string' } }, required: ['appId', 'amount', 'interval', 'why'] },
    kind: 'write',
    running: (i) => `Setting the price to $${str(i.amount)}${str(i.interval) && str(i.interval) !== 'one_time' ? `/${str(i.interval)}` : ''}`,
    async run(i, ctx) {
      const app = await appInChannel((ctx as BotContext).channelId, str(i.appId))
      if (!app) return { content: 'That app isn’t in this channel.', isError: true }
      const dollars = Number(i.amount)
      if (!(dollars >= 1 && dollars <= 500)) return { content: 'Keep prices between $1 and $500.', isError: true }
      const { validatePriceInput, syncAppPrice, stripeFailureMessage } = await import('@/lib/playground/appPricing')
      try {
        const valid = validatePriceInput({ amount: Math.round(dollars * 100), currency: 'usd', interval: str(i.interval) as 'one_time' | 'month' | 'year' })
        const { productId, priceId } = await syncAppPrice(app, valid)
        await db.update(playgroundApps).set({
          paywallEnabled: true, paywallMode: app.paywallMode || 'app',
          priceAmount: valid.amount, priceCurrency: valid.currency, priceInterval: valid.interval,
          stripeProductId: productId, stripePriceId: priceId, updatedAt: new Date(),
        }).where(eq(playgroundApps.id, app.id))
        return { content: `${app.title} now costs ${money(valid.amount)}${valid.interval !== 'one_time' ? `/${valid.interval}` : ''}, checkout on.`, label: `Priced ${app.title} at ${money(valid.amount)}` }
      } catch (err) {
        return { content: `Couldn't set the price: ${stripeFailureMessage(err) || (err instanceof Error ? err.message : 'unknown')}`, isError: true }
      }
    },
  },
  {
    name: 'publish_app',
    area: 'build',
    description: 'Publish the latest build of an app in this channel so customers get it, and open its public link. Use after a build finished and you checked it with show_app. (In the Studio, ship_app does this plus checkout and launch emails.)',
    input_schema: { type: 'object', properties: { appId: { type: 'string' } }, required: ['appId'] },
    kind: 'write',
    running: () => 'Publishing the app',
    async run(i, ctx) {
      const app = await appInChannel((ctx as BotContext).channelId, str(i.appId))
      if (!app) return { content: 'That app isn’t in this channel.', isError: true }
      const { publishDraft } = await import('@/lib/playground/appRelease')
      const r = await publishDraft(app, ctx.userId)
      if (!r.ok) return { content: r.error, isError: true }
      const token = app.shareToken || nanoid(16)
      await db.update(playgroundApps).set({ isPublic: true, shareToken: token, updatedAt: new Date() }).where(eq(playgroundApps.id, app.id))
      const { playUrl } = await import('@/lib/studio/pipeline')
      const url = playUrl(token)
      return { content: `${app.title} v${r.version.version} is live at ${url}${r.reused ? ' (already the published version)' : ''}.`, label: `Published ${app.title}`, href: url }
    },
  },
]

const selfTools: BotTool[] = [
  {
    name: 'remember',
    area: 'self',
    description: 'Replace your notes to yourself for the next run: what you’re working on, what you’re waiting to see (with dates), what you learned works or doesn’t, and the next move. Your next run starts from these notes and nothing else of this run, so make them complete. Call it once, at the end of every run.',
    input_schema: { type: 'object', properties: { notes: { type: 'string', description: 'Markdown, under 300 words' } }, required: ['notes'] },
    kind: 'write',
    running: () => 'Writing notes for next time',
    async run(i, ctx) {
      await db.update(channelBots).set({ memory: str(i.notes).slice(0, 4000), updatedAt: new Date() }).where(eq(channelBots.channelId, (ctx as BotContext).channelId))
      return { content: 'Saved.', label: 'Wrote notes for next run' }
    },
  },
  {
    name: 'ask_owner',
    area: 'self',
    description: 'Only for what you truly cannot do yourself: an account to connect, a key, money to spend outside Kanthink, a legal or personal call. Not for permission — you have it. The question goes to the top of the owner’s screen.',
    input_schema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] },
    kind: 'read',
    running: () => 'Flagging something for you',
    async run(i, ctx) {
      ;(ctx as BotContext).asks.push(str(i.question).slice(0, 400))
      return { content: 'Asked. Carry on with everything else.', label: 'Flagged something for you' }
    },
  },
]

/** Every tool a bot in this channel gets. */
export function botTools(opts: { isAdmin: boolean; isStudio: boolean; canHandOff: boolean }): BotTool[] {
  const board = voiceTools()
    .filter((t) => BOARD[t.name] && (opts.isAdmin || (t.name !== 'query_mixpanel' && t.name !== 'kanwatch_lookup')))
    .map((t) => ({ ...t, area: BOARD[t.name] }))
  // Written for chat, where these wait for the owner's word. A bot already has it.
  const ownWord = (d: string) => d.replace(/\s*Only when[^.]*\./g, '')
  const studio = opts.isStudio ? studioTools().map((t) => ({ ...t, description: ownWord(t.description), area: 'money' as BotArea })) : []
  const handOff = opts.canHandOff ? [{ ...claudeCodeTool, description: ownWord(claudeCodeTool.description), area: 'build' as BotArea }] : []
  return [...board, ...peopleTools, ...moneyTools, ...studio, ...handOff, ...selfTools]
}

/**
 * Wrap tools with the run's limits and, in a rehearsal, stop every write at the door.
 * Limits count attempts, so a failing call can't be retried forever either.
 */
export function guardTools(tools: BotTool[], ctx: BotContext): BotTool[] {
  const used = new Map<string, number>()
  return tools.map((t) => ({
    ...t,
    async run(input, c) {
      const limit = PER_RUN_LIMITS[t.name]
      const n = used.get(t.name) ?? 0
      if (limit != null && n >= limit) return { content: `You've used ${t.name} ${limit} time${limit === 1 ? '' : 's'} this run, which is the limit. Note it for next run.`, isError: true }
      used.set(t.name, n + 1)
      if (ctx.rehearsal && t.kind === 'write') {
        return { content: `Rehearsal: this would have run ${t.name} with ${JSON.stringify(input).slice(0, 300)}. Nothing changed. Carry on as if it worked.`, label: `Would: ${t.running(input)}` }
      }
      return t.run(input, c)
    },
  }))
}
