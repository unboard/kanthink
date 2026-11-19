import { db } from '@/lib/db'
import { cards, channels, columns, playgroundApps, users } from '@/lib/db/schema'
import { and, asc, desc, eq, like } from 'drizzle-orm'

/**
 * You shared something: Kan does something with it, and tells you in its thread.
 *
 * Sharing is the clearest thing the owner does. It means "this caught my eye", so
 * the answer to every share is something back, never a filing plan:
 *
 *   - make     it's a tool, app, demo or visual idea → Kan makes them their own
 *              working version as a Playground app (a small build, cheap model)
 *              and hands it over when it lands.
 *   - episode  a bot's existing tool fits it → that bot makes an episode now.
 *   - tell     it's an idea, article or post → the one thing worth taking from it,
 *              said plainly, with something Kan could do next.
 *   - keep     a plain bookmark → nothing to say; it stays where it is.
 *
 * Day-job material is context, never content: Kan doesn't build or comment on it.
 * Never throws.
 */

const MOVES = ['make', 'episode', 'tell', 'keep'] as const
type Move = (typeof MOVES)[number]

/** A first build should stay small: this is the most a share's app may cost. */
const MAX_BUILD_USD = 0.25

const SCHEMA = {
  type: 'object',
  properties: {
    what: { type: 'string', description: 'What this actually is, in one plain sentence, as if explaining it to them.' },
    move: { type: 'string', enum: [...MOVES] },
    title: { type: 'string', description: 'For make: the name of their version, 1–4 words.' },
    brief: { type: 'string', description: 'For make: the build brief. What their own version does, the core interaction that made the original interesting, and what to leave out. Concrete, 4–10 sentences. It must run in one browser page with no accounts; where the original uses AI, the app may call window.kanthink AI helpers if available, else fake it convincingly.' },
    say: { type: 'string', description: 'What Kan says in its thread, markdown, 30–110 words, first person, no greeting. For make: what you are making and why it is the interesting part. For tell: the one idea worth taking from it and how it connects to something they care about outside work. For episode: one line on what the bot will make.' },
    suggestions: {
      type: 'array',
      description: 'For tell: 1–2 replies they could tap, each a thing Kan would then do. Empty otherwise.',
      items: {
        type: 'object',
        properties: { label: { type: 'string' }, prompt: { type: 'string' } },
        required: ['label', 'prompt'],
        additionalProperties: false,
      },
    },
  },
  required: ['what', 'move', 'title', 'brief', 'say', 'suggestions'],
  additionalProperties: false,
}

export function buildSharePrompt(opts: { first: string; share: string; tools: string[]; handsOff: string[]; told?: string[] }) {
  const system = `You are Kan, ${opts.first}'s assistant in Kanthink, their private playground. They just shared something with you. A share means "this caught my eye". Your job is to give something back for it, right now.

Think from first principles about what it actually is and why someone like them would share it, then pick one move:
- make: it's a tool, app, demo, generator, game or visual technique. The best answer is their own working version to play with. Pick out the core interaction that makes it interesting and make that. Don't make a page about it.
- episode: one of the bots' tools listed below plainly fits it (an explainer tool and a topic to explain, for example). Only when the fit is obvious.
- tell: an idea, article, post or thread. Give them the one idea worth taking from it, in your own words, and connect it to something in their life outside work when there's a real connection.
- keep: a plain bookmark with nothing to add.

Rules:
- Take it at face value. Don't force it into a theme, a project or a channel they already have.
- What they said about it, on the card or to you before, outranks the page's own tagline. If they described what caught their eye, that is the thing to make.
- Their day job (print shops, MyPrintSite, MyCreativeShop, MissionPrint and the like) is off limits as a subject: never build for it or advise on it. If the share is purely about that, choose keep.
- Never talk about filing, organizing, sorting, channels or plans.
- Plain words, no hype, no "Great find!". American spelling.${opts.handsOff.length ? `\n- Leave alone entirely: ${opts.handsOff.join(', ')}.` : ''}`
  const told = opts.told?.length ? `\nWhat they've told you about things in their life (use what's about this share):\n${opts.told.join('\n')}\n` : ''
  const user = `They shared:\n${opts.share.slice(0, 4000)}\n${told}\nBots' tools that could make an episode:\n${opts.tools.join('\n') || '(none)'}`
  return { system, user }
}

/** The channel their apps live in: Playground, if they have one. */
async function appsChannel(ownerId: string): Promise<string | null> {
  const ch = await db.query.channels.findFirst({
    where: and(eq(channels.ownerId, ownerId), eq(channels.status, 'active'), like(channels.name, '%layground%')),
    columns: { id: true },
  })
  return ch?.id ?? null
}

async function firstColumn(channelId: string) {
  const cols = await db.query.columns.findMany({ where: eq(columns.channelId, channelId), orderBy: [asc(columns.position)], columns: { id: true, isAiTarget: true } })
  return (cols.find((c) => c.isAiTarget) ?? cols[0])?.id ?? null
}

export async function actOnShare(ownerId: string, cardId: string): Promise<{ move: Move | null; why?: string }> {
  try {
    const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId), columns: { id: true, title: true, messages: true, channelId: true } })
    if (!card) return { move: null, why: 'card gone' }
    const owner = await db.query.users.findFirst({ where: eq(users.id, ownerId), columns: { name: true } })
    const share = [card.title, ...(card.messages ?? []).map((m) => `${m.authorId === ownerId ? 'They said: ' : ''}${m.content}`)].join('\n\n')

    const [{ resolveProviderKeys }, { runStructured }, { getPlaygroundModel }, { listTopics }] = await Promise.all([
      import('@/lib/ai/keys'), import('@/lib/playground/generateClient'), import('@/lib/playground/models'), import('@/lib/kan/attention/topics'),
    ])
    const { keys } = await resolveProviderKeys(ownerId)
    const choice = keys.anthropic ? { id: 'claude-sonnet-5', key: keys.anthropic } : keys.openai ? { id: 'gpt-5.6-terra', key: keys.openai } : keys.google ? { id: 'gemini-3.1-pro-preview', key: keys.google } : null
    if (!choice) return { move: null, why: 'no key' }

    // Bots on duty with a tool, for the episode route.
    const bots = await db.query.channelBots.findMany({ where: (b, { and: a, eq: e }) => a(e(b.ownerId, ownerId), e(b.enabled, true)), columns: { channelId: true, name: true } })
    const apps = bots.length
      ? await db.query.playgroundApps.findMany({ where: (p, { and: a, inArray, eq: e, gt }) => a(inArray(p.channelId, bots.map((b) => b.channelId)), e(p.isArchived, false), gt(p.generationCount, 0)), columns: { channelId: true, title: true, summary: true } })
      : []
    const tools = apps.map((a) => `- ${bots.find((b) => b.channelId === a.channelId)?.name}: ${a.title}${a.summary ? ` — ${a.summary.slice(0, 140)}` : ''}`)
    const topics = await listTopics(ownerId)
    const handsOff = topics.filter((t) => t.role === 'hands_off').map((t) => t.name)
    const told = topics.filter((t) => t.role !== 'hands_off' && t.note).map((t) => `- ${t.name}: ${t.note}`)

    const first = owner?.name?.split(/\s+/)[0] ?? 'them'
    const { system, user } = buildSharePrompt({ first, share, tools, handsOff, told })
    const r = await runStructured({
      model: getPlaygroundModel(choice.id), apiKey: choice.key.apiKey, systemInstruction: system, userText: user, images: [],
      schema: SCHEMA, schemaName: 'share_move', maxOutputTokens: 2500, signal: AbortSignal.timeout(90_000),
    })
    if (!r.text) return { move: null, why: 'no answer' }
    const out = JSON.parse(r.text) as { what: string; move: Move; title: string; brief: string; say: string; suggestions: { label: string; prompt: string }[] }
    const { kanSays } = await import('@/lib/kan/thread/store')
    const refs = [`share:${card.id}`]

    if (out.move === 'keep') return { move: 'keep', why: out.what }

    if (out.move === 'episode') {
      const { wakeForShare } = await import('@/lib/kan/bots/wake')
      const woke = await wakeForShare(ownerId, share)
      if (woke.woke) {
        await kanSays(ownerId, 'reach', out.say, { refs })
        return { move: 'episode', why: woke.why }
      }
      // No bot took it: say what's worth saying instead.
      await kanSays(ownerId, 'reach', `${out.what}`, { refs })
      return { move: 'tell', why: 'no bot took it' }
    }

    if (out.move === 'tell') {
      await kanSays(ownerId, 'reach', out.say, { refs, suggestions: out.suggestions.slice(0, 2) })
      return { move: 'tell' }
    }

    // make: their own version, built on the share card itself, in the Playground.
    const target = await appsChannel(ownerId)
    if (target && target !== card.channelId) {
      const col = await firstColumn(target)
      if (col) await db.update(cards).set({ channelId: target, columnId: col, position: 0, updatedAt: new Date() }).where(eq(cards.id, card.id))
    }
    const { nanoid } = await import('nanoid')
    const fresh = await db.query.cards.findFirst({ where: eq(cards.id, card.id), columns: { messages: true } })
    await db.update(cards).set({
      messages: [...(fresh?.messages ?? []), { id: nanoid(), type: 'note', content: `**Kan is making your own version: ${out.title}**\n\n${out.brief}`, createdAt: new Date().toISOString() }] as typeof cards.$inferInsert.messages,
      updatedAt: new Date(),
    }).where(eq(cards.id, card.id))

    const [{ resolveAppForAutomatedBuild }, { generatePlaygroundApp }, { buildModelMenu, estimateBuildCost }] = await Promise.all([
      import('@/lib/playground/appRecord'), import('@/lib/playground/generateApp'), import('@/lib/playground/estimate'),
    ])
    const providers = (['google', 'openai', 'anthropic'] as const).filter((p) => keys[p])
    const briefChars = share.length + out.brief.length
    const model = buildModelMenu([...providers]).find((m) => estimateBuildCost({ modelId: m.id, briefChars }).maxUsd <= MAX_BUILD_USD)
    if (!model) {
      await kanSays(ownerId, 'reach', `${out.say}\n\n(I couldn't build it: no model fits a small build on your keys.)`, { refs })
      return { move: 'make', why: 'no model' }
    }
    const app = await resolveAppForAutomatedBuild({ cardId: card.id, userId: ownerId, title: out.title.slice(0, 60) })
    if (!app) return { move: 'make', why: 'no app record' }
    await kanSays(ownerId, 'reach', `${out.say}\n\n_Building it now. I'll put it right here when it's ready._`, { refs })
    await generatePlaygroundApp(
      { appId: app.id, prompt: `Build their own working version of what they shared.\n\n${out.brief}`, modelId: model.id, notifyWhenDone: false },
      { user: { id: ownerId } },
      { skipPreflight: true },
    )
    const built = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, app.id), columns: { id: true, code: true, shareToken: true, isPublic: true, title: true } })
    if (!built?.code) {
      await kanSays(ownerId, 'reach', `The build of **${out.title}** didn't come out. Say "try again" and I will.`, { refs })
      return { move: 'make', why: 'build failed' }
    }
    const { appLink } = await import('@/lib/kan/bots/approvals')
    await kanSays(ownerId, 'reach', `**${built.title || out.title}** is ready. Play with it and tell me what to change.`, {
      refs, links: [{ title: built.title || out.title, url: appLink(built) }],
    })
    const { sendPushToUser } = await import('@/lib/notifications/push')
    await sendPushToUser(ownerId, { title: 'Kan made you something', body: `${built.title || out.title}, from what you shared`, url: '/prototypes/kan/city' }).catch(() => 0)
    return { move: 'make' }
  } catch (err) {
    console.error('[kan] share', err)
    return { move: null, why: err instanceof Error ? err.message : 'error' }
  }
}

/** Shares Kan hasn't answered yet, newest first, for catching up on ones that came in before this existed. */
export async function unansweredShares(ownerId: string, sinceDays = 3) {
  const { getOrCreateQuickSaveChannel } = await import('@/lib/inbox/quickSaveChannel')
  const inbox = (await getOrCreateQuickSaveChannel(ownerId)).channel.id
  const since = new Date(Date.now() - sinceDays * 86400_000)
  const rows = await db.query.cards.findMany({ where: (c, { and: a, eq: e, gt }) => a(e(c.channelId, inbox), gt(c.createdAt, since)), orderBy: [desc(cards.createdAt)], columns: { id: true, title: true } })
  return rows
}
