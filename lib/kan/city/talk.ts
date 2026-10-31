import { db } from '@/lib/db'
import { botRuns, cards, channelBots, channels, columns, playgroundApps, users } from '@/lib/db/schema'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { inBucket, inColumnBucket } from '@/lib/db/cardBuckets'
import type { BotContext, BotTool } from '@/lib/kan/bots/tools'
import { residentOf, type Resident } from './residents'

/**
 * Talking with the bots who live in the city.
 *
 * Each conversation is a card in the bot's own channel, and the chat is that card's
 * thread, so it sits with the channel's work and can be picked up from the board like
 * any other card. The bot opens with a question grounded in its channel, because the
 * point of an impromptu chat is that each side comes away knowing more: the owner
 * thinks something through, the bot learns what the owner wants (and writes it down),
 * and the channel or its apps move forward when the owner asks for something.
 *
 * Bots can visit each other inside their neighborhood. A visit is its own card, in
 * the channel of the bot being visited.
 */

/** Chat turns use a quick model: this is conversation, often spoken, not a long run. */
const CHAT_MODEL = 'claude-sonnet-5-5'
/** A conversation older than this starts fresh, with a new question, the next time you stop by. */
const STALE_MS = 8 * 3600_000
const HISTORY = 24

/** What a message made, shown under it in the chat as things you can open. */
interface Made {
  apps?: { id: string; title: string; cardId: string }[]
  cards?: { id: string; title: string }[]
}
type Msg = NonNullable<typeof cards.$inferSelect['messages']>[number] & { authorName?: string } & Made

export interface ChatView {
  resident: Resident
  channelName: string
  cardId: string
  title: string
  messages: ({ id: string; who: 'you' | 'bot' | 'other'; name: string; text: string; at: string } & Made)[]
}

/** What the bots call the owner. The owner asked to be called Hodg. */
export function callName(user: { name?: string | null } | null | undefined) {
  const name = user?.name?.trim() ?? ''
  if (/hodg/i.test(name)) return 'Hodg'
  return name.split(/\s+/)[0] || 'boss'
}

async function owned(ownerId: string, channelId: string) {
  const channel = await db.query.channels.findFirst({
    where: and(eq(channels.id, channelId), eq(channels.ownerId, ownerId)),
    columns: { id: true, name: true, description: true, aiInstructions: true },
  })
  if (!channel) return null
  const { ensureBot } = await import('@/lib/kan/bots/run')
  const bot = await ensureBot(channelId, ownerId)
  return { channel, bot, resident: residentOf(channel, bot) }
}

/** The channel as its bot knows it: charter, board, apps, latest report. Kept short. */
export async function channelBrief(channelId: string): Promise<string> {
  const [channel, cols, apps, lastRun] = await Promise.all([
    db.query.channels.findFirst({ where: eq(channels.id, channelId), columns: { name: true, description: true, aiInstructions: true } }),
    db.query.columns.findMany({ where: eq(columns.channelId, channelId), orderBy: [asc(columns.position)], columns: { id: true, name: true } }),
    db.query.playgroundApps.findMany({ where: eq(playgroundApps.channelId, channelId), columns: { title: true }, limit: 8 }),
    db.query.botRuns.findFirst({ where: and(eq(botRuns.channelId, channelId), eq(botRuns.status, 'done')), orderBy: [desc(botRuns.startedAt)], columns: { summary: true, trigger: true } }),
  ])
  if (!channel) return ''
  const board = await Promise.all(cols.map(async (c) => {
    const rows = await db.query.cards.findMany({ where: inColumnBucket(c.id, 'active'), orderBy: [desc(cards.updatedAt)], limit: 6, columns: { title: true } })
    return `- ${c.name}: ${rows.length ? rows.map((r) => r.title).join(' · ') : '(empty)'}`
  }))
  return [
    `Channel: ${channel.name}`,
    channel.description ? `What it's for: ${channel.description.slice(0, 400)}` : '',
    channel.aiInstructions ? `Standing instructions: ${channel.aiInstructions.slice(0, 900)}` : '',
    `Board (newest first):\n${board.join('\n')}`,
    apps.length ? `Apps: ${apps.map((a) => a.title).join(', ')}` : 'No apps yet.',
    lastRun?.summary && lastRun.trigger !== 'chat' ? `Your last report: ${lastRun.summary.slice(0, 500)}` : '',
  ].filter(Boolean).join('\n')
}

function view(resident: Resident, channelName: string, card: { id: string; title: string; messages: Msg[] | null }, ownerId: string): ChatView {
  return {
    resident,
    channelName,
    cardId: card.id,
    title: card.title,
    messages: (card.messages ?? []).map((m) => ({
      id: m.id,
      who: m.type === 'ai_response' ? (m.authorName && m.authorName !== resident.name ? 'other' : 'bot') : m.authorId === ownerId ? 'you' : 'other',
      name: m.type === 'ai_response' ? m.authorName || resident.name : m.authorName || 'You',
      text: m.content,
      at: m.createdAt,
      ...(m.apps?.length ? { apps: m.apps } : {}),
      ...(m.cards?.length ? { cards: m.cards } : {}),
    })),
  }
}

async function addCard(channelId: string, title: string, messages: Msg[]) {
  const col = await db.query.columns.findFirst({ where: eq(columns.channelId, channelId), orderBy: [asc(columns.position)], columns: { id: true } })
  if (!col) return null
  const top = await db.query.cards.findFirst({ where: inColumnBucket(col.id, 'active'), orderBy: [desc(cards.position)], columns: { position: true } })
  const id = nanoid()
  const now = new Date()
  await db.insert(cards).values({
    id, channelId, columnId: col.id, title: title.slice(0, 120),
    messages: messages as typeof cards.$inferInsert.messages,
    source: 'ai', position: (top?.position ?? -1) + 1, createdAt: now, updatedAt: now,
  })
  return id
}

function botMsg(name: string, text: string): Msg {
  return { id: nanoid(), type: 'ai_response', content: text, authorName: name, createdAt: new Date().toISOString() }
}

/** Notes a bot keeps between runs and chats, appended to rather than replaced. */
async function noteFor(channelId: string, line: string) {
  const row = await db.query.channelBots.findFirst({ where: eq(channelBots.channelId, channelId), columns: { memory: true } })
  const day = new Date().toISOString().slice(0, 10)
  const memory = `${row?.memory ?? ''}\n- ${day}: ${line.trim()}`.trim().slice(-4000)
  await db.update(channelBots).set({ memory, updatedAt: new Date() }).where(eq(channelBots.channelId, channelId))
}

/**
 * The conversation you're having with this bot, or a new one opened with a question
 * when there isn't one (or it went quiet hours ago, or you asked for a fresh start).
 */
const opening = new Map<string, Promise<ChatView | { error: string }>>()

export function openChat(ownerId: string, channelId: string, opts: { fresh?: boolean } = {}): Promise<ChatView | { error: string }> {
  // Two opens at once (a double tap, a remount) share one answer rather than starting two chats.
  const key = `${channelId}:${opts.fresh ? 'new' : 'open'}`
  const inFlight = opening.get(key)
  if (inFlight) return inFlight
  const p = openChatNow(ownerId, channelId, opts).finally(() => opening.delete(key))
  opening.set(key, p)
  return p
}

async function openChatNow(ownerId: string, channelId: string, opts: { fresh?: boolean }): Promise<ChatView | { error: string }> {
  const found = await owned(ownerId, channelId)
  if (!found) return { error: 'No such bot.' }
  const { channel, bot, resident } = found
  if (!opts.fresh && bot.chatCardId) {
    const card = await db.query.cards.findFirst({
      where: and(eq(cards.id, bot.chatCardId), eq(cards.channelId, channelId), inBucket('active')),
      columns: { id: true, title: true, messages: true, updatedAt: true },
    })
    if (card && Date.now() - +(card.updatedAt ?? 0) < STALE_MS) return view(resident, channel.name, card as never, ownerId)
  }

  const owner = await db.query.users.findFirst({ where: eq(users.id, ownerId), columns: { name: true } })
  const boss = callName(owner)
  const brief = await channelBrief(channelId)
  let topic = 'catching up'
  let opener = `Hey ${boss}! Got a minute? I've been wondering where you want ${channel.name} to go next.`
  const { getLLMClientForUser } = await import('@/lib/ai/llm')
  const { client } = await getLLMClientForUser(ownerId)
  if (client) {
    try {
      const res = await client.complete([{
        role: 'user',
        content: [
          `You are ${resident.name}, a little mushroom bot in Kan City who runs this channel for ${boss}. ${resident.personality}`,
          `${boss} is the boss and just stopped by your plot. Start an impromptu chat: greet ${boss} by name in a few words, then ask ONE question.`,
          'Make it a question whose answer would genuinely help you grow this channel or its apps, grounded in something specific on the board below. Curious and warm, never a status report. Under 45 words, spoken style.',
          bot.memory ? `\nYour notes from before (don't ask what you already know):\n${bot.memory.slice(-1500)}` : '',
          `\n${brief}`,
          '\nAnswer with JSON only: {"topic": "3 to 6 words naming what the chat is about", "line": "what you say"}',
        ].join('\n'),
      }], { maxTokens: 2500 })
      const j = JSON.parse(res.content.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
      if (typeof j.line === 'string' && j.line.trim()) opener = j.line.trim()
      if (typeof j.topic === 'string' && j.topic.trim()) topic = j.topic.trim()
    } catch (err) {
      console.error('[city] opener', err)
    }
  }
  const msgs = [botMsg(resident.name, opener)]
  const cardId = await addCard(channelId, `Chat with ${resident.name}: ${topic}`, msgs)
  if (!cardId) return { error: `${channel.name} has no columns to put a chat in.` }
  await db.update(channelBots).set({ chatCardId: cardId, updatedAt: new Date() }).where(eq(channelBots.channelId, channelId))
  return view(resident, channel.name, { id: cardId, title: `Chat with ${resident.name}: ${topic}`, messages: msgs }, ownerId)
}

export interface Said {
  chat: ChatView
  reply: string
  did: string[]
  /** Bots that walked over to another plot during the turn, for the city to show. */
  visits: { from: string; to: string }[]
}

/** You say something to a bot; it answers, and does what you asked if it can. */
export async function say(ownerId: string, channelId: string, text: string): Promise<Said | { error: string }> {
  const opened = await openChat(ownerId, channelId)
  if ('error' in opened) return opened
  const found = (await owned(ownerId, channelId))!
  const { channel, bot, resident } = found
  const owner = await db.query.users.findFirst({ where: eq(users.id, ownerId), columns: { id: true, name: true, email: true } })
  if (!owner) return { error: 'No owner.' }
  const boss = callName(owner)

  const card = await db.query.cards.findFirst({ where: eq(cards.id, opened.cardId), columns: { messages: true } })
  const mine: Msg = { id: nanoid(), type: 'note', content: text.slice(0, 4000), authorId: ownerId, authorName: boss, createdAt: new Date().toISOString() }
  const before = [...((card?.messages ?? []) as Msg[])]
  await db.update(cards).set({ messages: [...before, mine] as never, updatedAt: new Date() }).where(eq(cards.id, opened.cardId))

  const { resolveProviderKeys } = await import('@/lib/ai/keys')
  const { keys } = await resolveProviderKeys(ownerId)
  const provider = keys.anthropic ? ('anthropic' as const) : keys.openai ? ('openai' as const) : null
  const key = provider ? keys[provider] : undefined
  if (!provider || !key) return { error: 'Add an Anthropic or OpenAI key in Settings → AI so your bots can talk.' }

  const { isAdmin } = await import('@/lib/auth')
  const { neighborhoodOf } = await import('./neighborhoods')
  const hood = await neighborhoodOf(ownerId, channelId)
  const admin = isAdmin(owner.email)
  const neighbors = hood.channelIds.filter((id) => id !== channelId)
  const neighborRows = neighbors.length
    ? await Promise.all([
      db.query.channels.findMany({ where: inArray(channels.id, neighbors), columns: { id: true, name: true } }),
      db.query.channelBots.findMany({ where: inArray(channelBots.channelId, neighbors), columns: { channelId: true, name: true, voice: true, personality: true } }),
    ])
    : [[], []] as const
  const neighborBots = neighborRows[0].map((c) => residentOf(c, neighborRows[1].find((b) => b.channelId === c.id)))

  const visits: Said['visits'] = []
  const made: Required<Made> = { apps: [], cards: [] }
  const ctx: BotContext = {
    userId: ownerId, isAdmin: admin, name: owner.name, readable: [channelId], scope: [channelId],
    sessionCardIds: [], recentTurns: [], channelId, asks: [],
  }
  const { botTools, guardTools } = await import('@/lib/kan/bots/tools')
  const keep = new Set(['board'])
  const base = botTools({ isAdmin: admin, isStudio: false, canHandOff: false, providers: (['google', 'openai', 'anthropic'] as const).filter((p) => keys[p]) })
    .filter((t) => keep.has(t.area) || t.name === 'app_numbers')
  const tools: BotTool[] = [
    ...guardTools(base, ctx), noteTool(channelId), visitTool({ ownerId, from: resident, boss, neighbors: neighborBots, hoodName: hood.name, visits }),
    buildTool({ ownerId, channelId, resident, chatCardId: opened.cardId, made }),
  ]

  const system = [
    `You are ${resident.name}, a little mushroom bot who lives in Kan City and runs the "${channel.name}" channel. ${resident.personality}`,
    `You're talking with ${boss}, the owner. ${boss} is the boss: they set the direction, you do the work. Call them ${boss}.`,
    '',
    'How you talk:',
    '- This is a real conversation, often spoken aloud. Short turns: one to three sentences. No lists, no headings, no markdown.',
    '- Warm, curious, a little playful, with your own personality. Ask one question at a time, and only when the answer would help you do the job better.',
    `- The aim is that all three of you grow: ${boss} thinks something through, you learn what ${boss} wants, and the channel and its apps move forward.`,
    `- When ${boss} tells you something worth keeping (a preference, a goal, a decision), save it with note_to_self.`,
    `- When ${boss} asks for something you can do with your tools, do it, then say what you did in a few words. Never claim you did something you didn't.`,
    `- If ${boss} asks you to go talk to another bot, use visit_bot, then tell ${boss} what came of it.`,
    `- When ${boss} says yes to trying an app idea ("let's try it", "build it", "go for it", "make it"), build it right away with build_app and a full brief. Don't just write the idea on a card: ${boss} wants something to open. Say it's building and that you'll tell them when it's ready.`,
    neighborBots.length
      ? `- You live in the ${hood.name} neighborhood. Your neighbors: ${neighborBots.map((b) => `${b.name} (runs ${neighborRows[0].find((c) => c.id === b.channelId)?.name})`).join(', ')}. Bots never leave their neighborhood.`
      : '- You live Downtown, with no neighbors to visit. Bots never leave their neighborhood; Kan can carry messages between neighborhoods.',
    bot.memory ? `\n## Your notes\n${bot.memory.slice(-2500)}` : '',
    `\n## Your channel\n${await channelBrief(channelId)}`,
  ].filter(Boolean).join('\n')

  const history = [...before, mine].slice(-HISTORY).map((m) => ({
    role: (m.type === 'ai_response' ? 'assistant' : 'user') as 'assistant' | 'user',
    content: m.content,
  }))
  // The thread opens with the bot's line; the model wants a user turn first.
  if (history[0]?.role === 'assistant') history.unshift({ role: 'user', content: `(${boss} stopped by your plot.)` })

  const { runAgent } = await import('@/lib/kan/agent/run')
  const { thinkingCost } = await import('@/lib/kan/bots/spend')
  const runId = crypto.randomUUID()
  const startedAt = new Date()
  let reply = ''
  let did: string[] = []
  try {
    const result = await runAgent({
      provider, apiKey: key.apiKey, system, history, tools, ctx, send: () => {},
      ...(provider === 'anthropic' ? { model: CHAT_MODEL } : {}),
      maxRounds: 6,
    })
    reply = result.text.trim() || 'Hmm, I lost my thread there. Say that again?'
    did = result.did
    // Cards it made are things to click too, unless they're the card an app is building on.
    const fresh = result.madeCards.filter((id) => !made.apps.some((a) => a.cardId === id) && !made.cards.some((c) => c.id === id))
    if (fresh.length) {
      const rows = await db.query.cards.findMany({ where: inArray(cards.id, fresh), columns: { id: true, title: true } })
      made.cards.push(...rows)
    }
    await db.insert(botRuns).values({
      id: runId, channelId, ownerId, trigger: 'chat', status: 'done', startedAt, endedAt: new Date(),
      summary: reply.slice(0, 500), costMillicents: thinkingCost(result.model, result.usage), model: result.model,
      inputTokens: result.usage.inputTokens, cachedTokens: result.usage.cachedInputTokens ?? 0, outputTokens: result.usage.outputTokens,
    }).catch(() => {})
  } catch (err) {
    console.error('[city] chat', err)
    reply = 'Sorry, my cap went fuzzy for a second. Try me again?'
  }
  const answer: Msg = { ...botMsg(resident.name, reply), ...(made.apps.length ? { apps: made.apps } : {}), ...(made.cards.length ? { cards: made.cards } : {}) }
  const now = await db.query.cards.findFirst({ where: eq(cards.id, opened.cardId), columns: { id: true, title: true, messages: true } })
  const messages = [...((now?.messages ?? [...before, mine]) as Msg[]), answer]
  await db.update(cards).set({ messages: messages as never, updatedAt: new Date() }).where(eq(cards.id, opened.cardId))
  return { chat: view(resident, channel.name, { id: opened.cardId, title: now?.title ?? opened.title, messages }, ownerId), reply, did, visits }
}

/**
 * Build an app from the chat. The app's row is made now, so the chat can show it at
 * once; the build itself runs after the reply, and when it lands the bot says so in
 * the thread. Building from the idea's card when there is one, so the app lives on it.
 */
function buildTool(o: { ownerId: string; channelId: string; resident: Resident; chatCardId: string; made: Required<Made> }): BotTool {
  return {
    name: 'build_app',
    area: 'build',
    description: 'Build a working single-screen app now, from an idea card in your channel (or a new one). Use when the boss says yes to trying an app. Write the brief so a builder can start without asking: who it is for, what it does, the screens and interactions, the feel. Takes a minute or two; the chat shows it building and lets the boss open it when it lands.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The app’s name, short and fun' },
        brief: { type: 'string', description: 'Everything the builder needs' },
        card: { type: 'string', description: 'The id or title of the idea card to build on, if there is one' },
      },
      required: ['title', 'brief'],
    },
    kind: 'write',
    running: (i) => `Starting to build ${String(i.title ?? 'the app')}`,
    async run(i) {
      if (o.made.apps.length) return { content: 'You already started a build this turn.', isError: true }
      const title = String(i.title ?? '').trim().slice(0, 80) || 'New app'
      const brief = String(i.brief ?? '').trim().slice(0, 6000)
      if (!brief) return { content: 'Write a brief first.', isError: true }
      // The idea's card: by id, else by title, else a new one holding the brief.
      const ref = String(i.card ?? '').trim()
      let card = ref ? await db.query.cards.findFirst({ where: and(eq(cards.id, ref), eq(cards.channelId, o.channelId)), columns: { id: true, title: true } }) : undefined
      if (!card && (ref || title)) {
        const rows = await db.query.cards.findMany({ where: and(eq(cards.channelId, o.channelId), inBucket('active')), orderBy: [desc(cards.updatedAt)], limit: 200, columns: { id: true, title: true } })
        const q = (ref || title).toLowerCase()
        card = rows.find((c) => c.title.toLowerCase() === q) ?? rows.find((c) => c.id !== o.chatCardId && (c.title.toLowerCase().includes(q) || q.includes(c.title.toLowerCase())))
      }
      if (!card) {
        const id = await addCard(o.channelId, title, [botMsg(o.resident.name, brief)])
        if (!id) return { content: 'Your channel has no columns to put the app’s card in.', isError: true }
        card = { id, title }
      } else {
        // The builder reads the card's thread, so the brief goes there too.
        const row = await db.query.cards.findFirst({ where: eq(cards.id, card.id), columns: { messages: true } })
        await db.update(cards).set({ messages: [...((row?.messages ?? []) as Msg[]), botMsg(o.resident.name, `**Brief for ${title}**\n\n${brief}`)] as never, updatedAt: new Date() }).where(eq(cards.id, card.id))
      }
      const { resolveAppForAutomatedBuild } = await import('@/lib/playground/appRecord')
      const app = await resolveAppForAutomatedBuild({ cardId: card.id, userId: o.ownerId, title })
      if (!app) return { content: 'Couldn’t start an app on that card.', isError: true }
      o.made.apps.push({ id: app.id, title: app.title || title, cardId: card.id })
      const { afterResponse } = await import('@/lib/afterResponse')
      afterResponse(() => runChatBuild({ ...o, appId: app.id, cardId: card!.id, title, brief }))
      return { content: `The build of "${title}" has started on the card "${card.title}". It takes a minute or two; you'll announce it in the chat when it's ready.`, label: `Building ${title}`, cardId: card.id }
    },
  }
}

/** The build itself, after the reply: charged to the bot, and announced in the chat when done. */
async function runChatBuild(o: { ownerId: string; channelId: string; resident: Resident; chatCardId: string; appId: string; cardId: string; title: string; brief: string }) {
  const owner = await db.query.users.findFirst({ where: eq(users.id, o.ownerId), columns: { id: true, name: true, email: true } })
  if (!owner) return
  const { isAdmin } = await import('@/lib/auth')
  const { callAction } = await import('@/lib/kan/agent/tools')
  const runId = crypto.randomUUID()
  await db.insert(botRuns).values({ id: runId, channelId: o.channelId, ownerId: o.ownerId, trigger: 'build', status: 'running', steps: [{ id: 'build', label: `Building “${o.title}”`, status: 'running', write: true }], startedAt: new Date() })
  let line: string
  let ok = false
  let cost = 0
  try {
    const data = await callAction('build_app', { cardId: o.cardId, prompt: o.brief }, {
      userId: owner.id, isAdmin: isAdmin(owner.email), name: owner.name,
      readable: [o.channelId], scope: [o.channelId], sessionCardIds: [], recentTurns: [],
    })
    ok = !data.error && !/^(Failed|Couldn)/.test(data.result ?? '')
    cost = typeof data.costUsd === 'number' ? Math.ceil(data.costUsd * 100_000) : 0
    line = ok ? `${o.title} is ready! Tap it below to give it a try. 🎉` : `Hmm, the build of ${o.title} hit a snag: ${(data.result || data.error || 'no reason given').slice(0, 200)}. Want me to try again?`
  } catch (err) {
    line = `Hmm, the build of ${o.title} hit a snag. Want me to try again?`
    console.error('[city] chat build', err)
  }
  await db.update(botRuns).set({
    status: ok ? 'done' : 'error', endedAt: new Date(), costMillicents: cost, buildMillicents: cost,
    steps: [{ id: 'build', label: ok ? `Built “${o.title}”` : `Build of “${o.title}” failed`, status: ok ? 'done' : 'error', write: true }],
    summary: ok ? `Built **${o.title}** from a chat with you.` : `The build of **${o.title}** failed.`,
  }).where(eq(botRuns.id, runId)).catch(() => {})
  const row = await db.query.cards.findFirst({ where: eq(cards.id, o.chatCardId), columns: { messages: true } })
  const msg: Msg = { ...botMsg(o.resident.name, line), apps: [{ id: o.appId, title: o.title, cardId: o.cardId }] }
  await db.update(cards).set({ messages: [...((row?.messages ?? []) as Msg[]), msg] as never, updatedAt: new Date() }).where(eq(cards.id, o.chatCardId))
}

/** How an app from a chat is doing, for its tile in the chat. Only the channel's owner may ask. */
export async function appStatus(ownerId: string, appId: string) {
  const app = await db.query.playgroundApps.findFirst({
    where: eq(playgroundApps.id, appId),
    columns: { id: true, title: true, channelId: true, code: true, buildProgress: true, isPublic: true, shareToken: true, updatedAt: true, createdAt: true },
  })
  if (!app) return null
  const ch = await db.query.channels.findFirst({ where: and(eq(channels.id, app.channelId), eq(channels.ownerId, ownerId)), columns: { id: true } })
  if (!ch) return null
  const building = Boolean(app.buildProgress)
  const since = +(app.updatedAt ?? app.createdAt ?? 0)
  const status = app.code && !building ? 'ready' : building || Date.now() - since < 12 * 60_000 ? 'building' : 'failed'
  const step = app.buildProgress?.steps?.filter((x) => x.status === 'running').at(-1)?.label ?? null
  return {
    id: app.id,
    title: app.title,
    status,
    step,
    href: app.isPublic && app.shareToken ? `/play/${app.shareToken}` : `/play/preview/${app.id}`,
  }
}

function noteTool(channelId: string): BotTool {
  return {
    name: 'note_to_self',
    area: 'self',
    description: 'Write down something worth remembering from this chat: what the boss wants, a decision, a preference, an idea to pursue. Adds to your notes; it never replaces them.',
    input_schema: { type: 'object', properties: { note: { type: 'string', description: 'One or two sentences' } }, required: ['note'] },
    kind: 'write',
    running: () => 'Writing that down',
    async run(i) {
      await noteFor(channelId, String(i.note ?? '').slice(0, 500))
      return { content: 'Noted.', label: 'Wrote it down' }
    },
  }
}

/**
 * Walk over to a neighbor and talk something through. The conversation is written as
 * a card in the neighbor's channel; both bots keep the takeaway in their notes.
 */
function visitTool(o: { ownerId: string; from: Resident; boss: string; neighbors: Resident[]; hoodName: string; visits: Said['visits'] }): BotTool {
  return {
    name: 'visit_bot',
    area: 'people',
    description: 'Go talk with another bot in your neighborhood about something, usually because the boss asked you to. You come back with what you two worked out.',
    input_schema: {
      type: 'object',
      properties: {
        bot: { type: 'string', description: 'The bot’s name, or the name of the channel it runs' },
        about: { type: 'string', description: 'What to talk about, and what you want to come away with' },
      },
      required: ['bot', 'about'],
    },
    kind: 'write',
    running: (i) => `Walking over to ${String(i.bot ?? 'a neighbor')}`,
    async run(i) {
      const q = String(i.bot ?? '').toLowerCase().trim()
      const names = await db.query.channels.findMany({ where: inArray(channels.id, o.neighbors.map((n) => n.channelId).concat('__none__')), columns: { id: true, name: true } })
      const target = o.neighbors.find((n) => n.name.toLowerCase() === q)
        ?? o.neighbors.find((n) => n.name.toLowerCase().includes(q) || (names.find((c) => c.id === n.channelId)?.name.toLowerCase().includes(q) ?? false))
      if (!target) {
        return {
          content: o.neighbors.length
            ? `No bot called "${i.bot}" in ${o.hoodName}. Your neighbors are ${o.neighbors.map((n) => n.name).join(', ')}. Bots can't leave their neighborhood; tell the boss Kan can carry it across.`
            : 'You live Downtown with no neighbors, and bots can’t leave their neighborhood. Tell the boss Kan can carry the message instead.',
          isError: true,
        }
      }
      const about = String(i.about ?? '').slice(0, 600)
      const [mine, theirs] = await Promise.all([channelBrief(o.from.channelId), channelBrief(target.channelId)])
      const { getLLMClientForUser } = await import('@/lib/ai/llm')
      const { client } = await getLLMClientForUser(o.ownerId)
      if (!client) return { content: 'No AI key to talk with.', isError: true }
      let lines: { who: string; text: string }[] = []
      let takeaway = ''
      try {
        const res = await client.complete([{
          role: 'user',
          content: [
            `Write a short conversation between two mushroom bots in Kan City who work for ${o.boss}.`,
            `${o.from.name} (${o.from.personality}) walks over to visit ${target.name} (${target.personality}) to talk about: ${about}`,
            'Each speaks from what their own channel knows, below. Four to six turns, each one to three sentences, natural and specific, no filler. They end by agreeing what each will do next, or what to bring back to the boss.',
            `\n## ${o.from.name}'s channel\n${mine}`,
            `\n## ${target.name}'s channel\n${theirs}`,
            `\nAnswer with JSON only: {"lines": [{"who": "${o.from.name}" or "${target.name}", "text": "..."}], "takeaway": "one or two sentences: what they worked out"}`,
          ].join('\n'),
        }], { maxTokens: 4000 })
        const j = JSON.parse(res.content.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
        lines = Array.isArray(j.lines) ? j.lines.filter((l: { who?: unknown; text?: unknown }) => typeof l?.text === 'string').slice(0, 8) : []
        takeaway = typeof j.takeaway === 'string' ? j.takeaway : ''
      } catch (err) {
        console.error('[city] visit', err)
      }
      if (!lines.length) return { content: `${target.name} wasn't home. Try again later.`, isError: true }
      const cardId = await addCard(target.channelId, `${o.from.name} visited ${target.name}: ${about.slice(0, 60)}`,
        [...lines.map((l) => botMsg(l.who === target.name ? target.name : o.from.name, l.text)), ...(takeaway ? [botMsg(target.name, `**What we worked out:** ${takeaway}`)] : [])])
      if (takeaway) {
        await Promise.all([
          noteFor(o.from.channelId, `Talked with ${target.name} about ${about.slice(0, 80)}: ${takeaway}`),
          noteFor(target.channelId, `${o.from.name} visited about ${about.slice(0, 80)}: ${takeaway}`),
        ])
      }
      o.visits.push({ from: o.from.channelId, to: target.channelId })
      return {
        content: `You talked with ${target.name}.\n${lines.map((l) => `${l.who}: ${l.text}`).join('\n')}\n\nTakeaway: ${takeaway}`,
        label: `Talked with ${target.name}`,
        ...(cardId ? { cardId } : {}),
      }
    },
  }
}

