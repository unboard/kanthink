import { db } from '@/lib/db'
import { cards, channels, columns, playgroundApps, users } from '@/lib/db/schema'
import { and, asc, desc, eq, like } from 'drizzle-orm'

/**
 * You shared something: Kan does something with it, and tells you in its thread.
 *
 * Sharing is the clearest thing the owner does. The share sheet asks why (SharePrefs);
 * when they say, that decides. When they don't, Kan reads it and picks:
 *
 *   - make     it's a tool, app, demo or visual idea → their own working version as
 *              a Playground app, at the effort they chose, or a brief first.
 *   - episode  a bot's existing tool fits it → that bot makes an episode now.
 *   - tell     it's an idea, article or post → the one thing worth taking from it
 *              (to remember), or a real explanation (to understand), optionally
 *              emailed, optionally with an explainer app to learn it with.
 *   - keep     a plain bookmark → nothing to say; it stays where it is.
 *
 * Day-job material is context, never content: Kan doesn't build or comment on it.
 * Never throws.
 */

const MOVES = ['make', 'episode', 'tell', 'keep'] as const
type Move = (typeof MOVES)[number]

/** Why they shared it, from the share sheet. Every part is optional. */
export interface SharePrefs {
  intent?: 'brain' | 'make' | 'recreate' | 'understand'
  /** For make / recreate: how much to spend on the build. */
  effort?: 'quick' | 'solid' | 'max'
  /** For make / recreate: send a brief to say yes to before building. */
  briefFirst?: boolean
  /** Email Kan's take as well as saying it in the thread. */
  emailThoughts?: boolean
  /** For brain / understand: make an explainer app to learn it with. */
  explainer?: boolean
}

export const INTENTS = ['brain', 'make', 'recreate', 'understand'] as const
export const EFFORTS = ['quick', 'solid', 'max'] as const

/** Effort → the build models to try, first that the account can call wins. */
const EFFORT_MODELS: Record<NonNullable<SharePrefs['effort']>, string[]> = {
  quick: ['gemini-3.8-flash', 'gpt-5.6-terra', 'claude-sonnet-5'],
  solid: ['gemini-3.1-pro-preview', 'gpt-5.6-sol', 'claude-sonnet-5'],
  max: ['claude-opus-5-5', 'gpt-6-astra', 'gemini-3.1-pro-preview'],
}
const EFFORT_LABEL = { quick: 'a quick build', solid: 'a solid build', max: 'an all-out build' }

const SCHEMA = {
  type: 'object',
  properties: {
    what: { type: 'string', description: 'What this actually is, in one plain sentence, as if explaining it to them.' },
    move: { type: 'string', enum: [...MOVES] },
    title: { type: 'string', description: 'For make: the name of their version, 1–4 words.' },
    brief: { type: 'string', description: 'For make: the build brief. What their own version does, the core interaction that made the original interesting, and what to leave out. Concrete, 4–10 sentences. It must run in one browser page with no accounts; where the original uses AI, the app uses window.kanthinkAI (text, vision, image generation).' },
    say: { type: 'string', description: 'What Kan says in its thread, markdown, first person, no greeting. For make: 30–90 words on what you are making and why it is the interesting part. For tell: the idea worth taking from it (to remember: 40–110 words), or a clear explanation (to understand: 120–260 words, building from what they likely know, with one concrete example). For episode: one line.' },
    explainer: { type: 'string', description: 'A build brief for an interactive single-screen explainer that teaches this topic: what it shows step by step, what the person can poke at, and one check-yourself question. Empty unless the topic is something to learn.' },
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
  required: ['what', 'move', 'title', 'brief', 'say', 'explainer', 'suggestions'],
  additionalProperties: false,
}

const INTENT_LINE: Record<NonNullable<SharePrefs['intent']>, string> = {
  brain: 'They told you why: "I want this in my brain." Choose tell. Say the idea worth remembering, in a form that sticks, and how it connects to what they care about.',
  make: 'They told you why: "I want to make something like this." Choose make. Their own take on the idea, not a copy: keep what makes it work and shape it for them.',
  recreate: 'They told you why: "I want to recreate this." Choose make. A faithful working remake of the original\'s core experience and interaction, as close as one page can get.',
  understand: 'They told you why: "I don\'t understand this and want to know more." Choose tell. Explain it properly, from the ground up, and fill in explainer.',
}

export function buildSharePrompt(opts: { first: string; share: string; tools: string[]; handsOff: string[]; told?: string[]; intent?: SharePrefs['intent'] }) {
  const system = `You are Kan, ${opts.first}'s assistant in Kanthink, their private playground. They just shared something with you. A share means "this caught my eye". Your job is to give something back for it, right now.

Think from first principles about what it actually is and why someone like them would share it, then pick one move:
- make: it's a tool, app, demo, generator, game or visual technique. The best answer is their own working version to play with. Pick out the core interaction that makes it interesting and make that. Don't make a page about it.
- episode: one of the bots' tools listed below plainly fits it (an explainer tool and a topic to explain, for example). Only when the fit is obvious.
- tell: an idea, article, post or thread. Give them the one idea worth taking from it, in your own words, and connect it to something in their life outside work when there's a real connection.
- keep: a plain bookmark with nothing to add.
${opts.intent ? `\n${INTENT_LINE[opts.intent]}\n` : ''}
Rules:
- Take it at face value. Don't force it into a theme, a project or a channel they already have.
- What they said about it, on the card or to you before, outranks the page's own tagline. If they described what caught their eye, that is the thing to make.
- Their day job (print shops, MyPrintSite, MyCreativeShop, MissionPrint and the like) is off limits as a subject unless they plainly asked about it here: never build for it uninvited.
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

async function addNote(cardId: string, content: string) {
  const { nanoid } = await import('nanoid')
  const fresh = await db.query.cards.findFirst({ where: eq(cards.id, cardId), columns: { messages: true } })
  await db.update(cards).set({
    messages: [...(fresh?.messages ?? []), { id: nanoid(), type: 'note', content, authorName: 'Kan', createdAt: new Date().toISOString() }] as typeof cards.$inferInsert.messages,
    updatedAt: new Date(),
  }).where(eq(cards.id, cardId))
}

/** Email the owner something Kan has to say about a share. */
async function emailOwner(ownerId: string, subject: string, title: string, body: string, cta: { label: string; url: string }) {
  const owner = await db.query.users.findFirst({ where: eq(users.id, ownerId), columns: { email: true } })
  if (!owner?.email) return false
  const [{ render }, React, { KanNoteEmail }, { sendTransactionalEmail }] = await Promise.all([
    import('@react-email/render'), import('react'), import('@/lib/emails/KanNoteEmail'), import('@/lib/resend'),
  ])
  const html = await render(React.createElement(KanNoteEmail, { title, body, ctaLabel: cta.label, ctaUrl: cta.url }))
  return sendTransactionalEmail({ to: owner.email, subject, html })
}

const base = () => process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://www.kanthink.com'
const plain = (md: string) => md.replace(/\*\*(.+?)\*\*/g, '$1').replace(/_(.+?)_/g, '$1').replace(/`/g, '')

type Keys = Awaited<ReturnType<typeof import('@/lib/ai/keys').resolveProviderKeys>>['keys']

/** The build model for an effort level, among the ones these keys can call. */
async function modelFor(effort: NonNullable<SharePrefs['effort']>, keys: Keys) {
  const { PLAYGROUND_MODELS } = await import('@/lib/playground/models')
  for (const id of EFFORT_MODELS[effort]) {
    const m = PLAYGROUND_MODELS.find((x) => x.id === id)
    if (m && keys[m.provider as keyof Keys]) return m.id
  }
  return null
}

/** Build an app on a card and say so in the thread, with the link when it lands. */
async function buildOnCard(ownerId: string, cardId: string, title: string, prompt: string, modelId: string, refs: string[]) {
  const [{ createPlaygroundAppRecord }, { generatePlaygroundApp }, { kanSays }, { appLink }] = await Promise.all([
    import('@/lib/playground/appRecord'), import('@/lib/playground/generateApp'), import('@/lib/kan/thread/store'), import('@/lib/kan/bots/approvals'),
  ])
  // Always a new app: an explainer next to a remake is a second app on the card, not a rebuild.
  const app = await createPlaygroundAppRecord({ cardId, userId: ownerId, title: title.slice(0, 60) })
  if (!app) return null
  await generatePlaygroundApp({ appId: app.id, prompt, modelId, notifyWhenDone: false, from: 'Kan' }, { user: { id: ownerId } }, { skipPreflight: true })
  const built = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, app.id), columns: { id: true, code: true, shareToken: true, isPublic: true, title: true } })
  if (!built?.code) {
    await kanSays(ownerId, 'reach', `The build of **${title}** didn't come out. Say "try again" and I will.`, { refs })
    return null
  }
  const name = built.title || title
  await kanSays(ownerId, 'reach', `**${name}** is ready. Play with it, then tell me here what to change. A screenshot helps.`, {
    refs, links: [{ title: name, url: appLink(built) }],
  })
  const { sendPushToUser } = await import('@/lib/notifications/push')
  await sendPushToUser(ownerId, { title: 'Kan made you something', body: `${name}, from what you shared`, url: '/prototypes/kan/city' }).catch(() => 0)
  return built
}

export async function actOnShare(ownerId: string, cardId: string, prefs: SharePrefs = {}): Promise<{ move: Move | null; why?: string }> {
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

    // Bots on duty with a tool, for the episode route (only when they didn't say why).
    const bots = prefs.intent ? [] : await db.query.channelBots.findMany({ where: (b, { and: a, eq: e }) => a(e(b.ownerId, ownerId), e(b.enabled, true)), columns: { channelId: true, name: true } })
    const apps = bots.length
      ? await db.query.playgroundApps.findMany({ where: (p, { and: a, inArray, eq: e, gt }) => a(inArray(p.channelId, bots.map((b) => b.channelId)), e(p.isArchived, false), gt(p.generationCount, 0)), columns: { channelId: true, title: true, summary: true } })
      : []
    const tools = apps.map((a) => `- ${bots.find((b) => b.channelId === a.channelId)?.name}: ${a.title}${a.summary ? ` — ${a.summary.slice(0, 140)}` : ''}`)
    const topics = await listTopics(ownerId)
    const handsOff = topics.filter((t) => t.role === 'hands_off').map((t) => t.name)
    const told = topics.filter((t) => t.role !== 'hands_off' && t.note).map((t) => `- ${t.name}: ${t.note}`)

    const first = owner?.name?.split(/\s+/)[0] ?? 'them'
    const { system, user } = buildSharePrompt({ first, share, tools, handsOff, told, intent: prefs.intent })
    const r = await runStructured({
      model: getPlaygroundModel(choice.id), apiKey: choice.key.apiKey, systemInstruction: system, userText: user, images: [],
      schema: SCHEMA, schemaName: 'share_move', maxOutputTokens: 4000, signal: AbortSignal.timeout(120_000),
    })
    if (!r.text) return { move: null, why: 'no answer' }
    const out = JSON.parse(r.text) as { what: string; move: Move; title: string; brief: string; say: string; explainer: string; suggestions: { label: string; prompt: string }[] }
    // What they said wins over what Kan would have picked.
    if (prefs.intent === 'make' || prefs.intent === 'recreate') out.move = 'make'
    else if (prefs.intent === 'brain' || prefs.intent === 'understand') out.move = 'tell'
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
      await kanSays(ownerId, 'reach', `${out.what}`, { refs })
      return { move: 'tell', why: 'no bot took it' }
    }

    if (out.move === 'tell') {
      await kanSays(ownerId, 'reach', out.say, { refs, suggestions: out.suggestions.slice(0, 2) })
      if (prefs.emailThoughts) {
        await emailOwner(ownerId, `Kan on “${card.title.slice(0, 60)}”`, card.title, plain(out.say), { label: 'Talk it over with Kan', url: `${base()}/prototypes/kan/city` }).catch(() => false)
      }
      if (prefs.explainer && out.explainer.trim()) {
        const modelId = await modelFor('solid', keys)
        if (modelId) {
          await addNote(card.id, `**Making an explainer to learn this with**\n\n${out.explainer}`)
          await kanSays(ownerId, 'reach', `I'm also making you an explainer to learn it with. _I'll put it here when it's ready._`, { refs })
          await buildOnCard(ownerId, card.id, `Explainer: ${card.title.slice(0, 40)}`, `Build an interactive explainer that teaches this topic.\n\n${out.explainer}`, modelId, refs)
        }
      }
      return { move: 'tell' }
    }

    // make: their own version, built on the share card itself, in the Playground.
    const target = await appsChannel(ownerId)
    if (target && target !== card.channelId) {
      const col = await firstColumn(target)
      if (col) await db.update(cards).set({ channelId: target, columnId: col, position: 0, updatedAt: new Date() }).where(eq(cards.id, card.id))
    }
    const effort = prefs.effort ?? 'quick'
    const modelId = await modelFor(effort, keys)
    if (!modelId) {
      await kanSays(ownerId, 'reach', `${out.say}\n\n(I couldn't build it: none of your keys can run ${EFFORT_LABEL[effort]}.)`, { refs })
      return { move: 'make', why: 'no model' }
    }
    const verb = prefs.intent === 'recreate' ? 'Recreating' : 'Making your own version'
    await addNote(card.id, `**${verb}: ${out.title}**\n\n${out.brief}`)
    const buildPrompt = `${prefs.intent === 'recreate' ? 'Recreate what they shared as faithfully as one page allows.' : 'Build their own working version of what they shared.'}\n\n${out.brief}`

    if (prefs.briefFirst) {
      const { estimateBuildCost } = await import('@/lib/playground/estimate')
      const est = estimateBuildCost({ modelId, briefChars: share.length + out.brief.length })
      const cost = `about $${est.likelyUsd.toFixed(2)}, at most $${est.maxUsd.toFixed(2)}`
      await kanSays(ownerId, 'reach', `${out.say}\n\n**The brief: ${out.title}**\n\n${out.brief}\n\n_${EFFORT_LABEL[effort]} on ${est.modelLabel}, ${cost}. Nothing is built until you say so._`, {
        refs,
        suggestions: [
          { label: 'Build it', prompt: `Build “${out.title}” now from the brief on its card (cardId:${card.id}), with modelId ${modelId}.` },
          { label: 'Change the brief', prompt: `Before you build “${out.title}” (cardId:${card.id}), change the brief: ` },
        ],
      })
      await emailOwner(ownerId, `Brief: ${out.title}`, out.title, `${plain(out.say)}\n\n${out.brief}\n\n${EFFORT_LABEL[effort]} on ${est.modelLabel}, ${cost}. Nothing is built until you say so.`, { label: 'Build it or change it', url: `${base()}/prototypes/kan/city` }).catch(() => false)
      return { move: 'make', why: 'brief sent' }
    }

    await kanSays(ownerId, 'reach', `${out.say}\n\n_${verb === 'Recreating' ? 'Recreating it' : 'Building it'} now (${EFFORT_LABEL[effort]}). I'll put it right here when it's ready._`, { refs })
    await buildOnCard(ownerId, card.id, out.title, buildPrompt, modelId, refs)
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
