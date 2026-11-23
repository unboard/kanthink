import { db } from '@/lib/db'
import { channelBots, channels, kanMessages, kanwatchEpisodes, kanwatchReads, kanwatchTokens, sprouts, users, type SproutClue } from '@/lib/db/schema'
import { and, desc, eq, gt, isNotNull, isNull } from 'drizzle-orm'
import { resolveProviderKeys } from '@/lib/ai/keys'
import { runStructured } from '@/lib/playground/generateClient'
import { getPlaygroundModel } from '@/lib/playground/models'
import { recordUsage } from '@/lib/usage'
import { gatherInputs } from '@/lib/kan/attention/inputs'
import { describeTopics, isAbout, listTopics } from '@/lib/kan/attention/topics'
import { attentionTrail } from '@/lib/kan/thread/reach'
import { startArea } from '@/lib/kan/attention/apply'
import { ensureBot } from '@/lib/kan/bots/run'

/**
 * The Sprout Field: where bots come from.
 *
 * Kanthink is a private playground. Of everything Kanwatch, shares and conversations
 * show Kan, most is the owner's day job, and that is context, never the crop: it
 * tells Kan how busy they are and what they know, but nobody wants their own work
 * read back to them. The crop is sparks: things they shared, things they lingered
 * on outside work, things for their kids, things they'd love a bot to recreate.
 *
 * A few times a day Kan walks the field. It plants a sprout when a spark could grow
 * into a bot worth having (one that would keep making things, not a one-off task),
 * and grows the ones new evidence touches. A sprout that grew lately has a rain
 * cloud over it. The owner waters one (adds a thought), pulls one like a weed (and
 * Kan learns what not to grow), or sends one to the big city, where it's born as a
 * bot with a home and goes straight to work.
 */

export type Sprout = typeof sprouts.$inferSelect

/** At most this often on its own. */
const EVERY_MS = 3 * 3600_000
/** No more than this many growing at once: a field, not a jungle. */
const MAX_GROWING = 12
/** From here it's ready for the city. */
export const READY = 70

const clip = (s: string | null | undefined, n: number) => { const t = (s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }

const CLUE = {
  type: 'object',
  properties: {
    text: { type: 'string', description: 'The evidence in one plain line, e.g. "Shared Kamran Ahmed’s stick-scene animation skill".' },
    from: { type: 'string', enum: ['share', 'read', 'browsing', 'chat'] },
    ref: { type: 'string', description: 'The id it came from (share:…, read:…, chat:…), or "".' },
  },
  required: ['text', 'from', 'ref'],
  additionalProperties: false,
}

const SCHEMA = {
  type: 'object',
  properties: {
    plant: {
      type: 'array',
      description: 'New sprouts, within the limit you were given. Only sparks that could grow into a bot worth having.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '2–5 words naming the idea, e.g. "Stick-figure explainers".' },
          dream: { type: 'string', description: 'What it would become, 1–2 sentences starting "A bot that…": what it would keep making, and for whom.' },
          kind: { type: 'string', enum: ['app', 'family', 'recreate', 'learn', 'other'] },
          botName: { type: 'string', description: 'The mushroom bot it would be born as: a playful two-word name ending in a mushroom word (Cap, Shroom, Morel, Bolete, Puffball, Chanterelle, Truffle…), e.g. "Doodle Puffball".' },
          personality: { type: 'string', description: 'One short line on who that bot is, third person.' },
          growth: { type: 'integer', description: '10–40: how strong the evidence already is.' },
          clues: { type: 'array', items: CLUE, description: '1–4 pieces of evidence it grew from.' },
        },
        required: ['title', 'dream', 'kind', 'botName', 'personality', 'growth', 'clues'],
        additionalProperties: false,
      },
    },
    grow: {
      type: 'array',
      description: 'Existing sprouts that new evidence touches. Only with evidence not already in their clues.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          by: { type: 'integer', description: '5–30.' },
          clue: CLUE,
        },
        required: ['id', 'by', 'clue'],
        additionalProperties: false,
      },
    },
  },
  required: ['plant', 'grow'],
  additionalProperties: false,
}

export async function listSprouts(ownerId: string): Promise<Sprout[]> {
  return db.query.sprouts.findMany({ where: eq(sprouts.ownerId, ownerId), orderBy: [desc(sprouts.growth)] })
}

/** What the city draws: the ones still in the field. */
export async function fieldFor(ownerId: string) {
  const rows = await db.query.sprouts.findMany({ where: and(eq(sprouts.ownerId, ownerId), eq(sprouts.status, 'growing')), orderBy: [desc(sprouts.createdAt)] })
  const day = Date.now() - 24 * 3600_000
  return rows.map((s) => ({
    id: s.id,
    title: s.title,
    dream: s.dream,
    kind: s.kind,
    botName: s.botName,
    personality: s.personality,
    growth: s.growth,
    clues: (s.clues ?? []).slice(-8),
    // Rain over the ones that grew in the last day.
    raining: Boolean(s.grewAt && +s.grewAt > day),
    ready: s.growth >= READY,
    plantedAt: +(s.createdAt ?? 0),
  }))
}
export type FieldSprout = Awaited<ReturnType<typeof fieldFor>>[number]

export async function growSprouts(ownerId: string, opts: { force?: boolean } = {}): Promise<{ planted: number; grew: number; why?: string }> {
  const all = await listSprouts(ownerId)
  const lastWalk = Math.max(0, ...all.map((s) => +(s.updatedAt ?? 0)))
  if (!opts.force && Date.now() - lastWalk < EVERY_MS) return { planted: 0, grew: 0, why: 'too soon' }
  const since = new Date(Date.now() - 14 * 86400_000)
  const newSince = new Date(Math.max(+since, lastWalk))

  const [trail, inputs, topics, reads, said, owner] = await Promise.all([
    attentionTrail(ownerId, new Date(Date.now() - 7 * 86400_000), newSince),
    gatherInputs(ownerId, since),
    listTopics(ownerId),
    db.query.kanwatchReads.findMany({
      where: and(eq(kanwatchReads.userId, ownerId), gt(kanwatchReads.lastSeenAt, since), isNotNull(kanwatchReads.tldr)),
      orderBy: [desc(kanwatchReads.lastSeenAt)],
      limit: 30,
      columns: { id: true, title: true, domain: true, tldr: true, aboutWork: true, appIdea: true, kanthinkFit: true, manual: true, verdict: true, lastSeenAt: true },
    }),
    db.query.kanMessages.findMany({ where: and(eq(kanMessages.ownerId, ownerId), eq(kanMessages.role, 'you')), orderBy: [desc(kanMessages.createdAt)], limit: 30, columns: { id: true, text: true, createdAt: true } }),
    db.query.users.findFirst({ where: eq(users.id, ownerId), columns: { name: true } }),
  ])
  const handsOff = topics.filter((t) => t.role === 'hands_off')
  const offLimits = (s: string) => handsOff.some((t) => isAbout(s, t.name))
  const growing = all.filter((s) => s.status === 'growing')
  const isNew = (at: number) => at > +newSince
  const shares = inputs.filter((i) => i.kind === 'share' && !offLimits(i.text))
  const talk = inputs.filter((i) => (i.kind === 'chat' || i.kind === 'voice') && !offLimits(i.text))
  const fresh = shares.some((s) => isNew(+s.at)) || talk.some((t) => isNew(+t.at)) || said.some((m) => isNew(+(m.createdAt ?? 0)))
    || reads.some((r) => isNew(+(r.lastSeenAt ?? 0))) || trail.freshMinutes >= 30
  if (!opts.force && !fresh) return { planted: 0, grew: 0, why: 'nothing new' }

  const { keys } = await resolveProviderKeys(ownerId)
  const provider = keys.anthropic ? 'anthropic' : keys.openai ? 'openai' : null
  if (!provider) return { planted: 0, grew: 0, why: 'no key' }
  const model = getPlaygroundModel(provider === 'anthropic' ? 'claude-opus-5-5' : 'gpt-6.2-sol')
  const apiKey = provider === 'anthropic' ? keys.anthropic!.apiKey : keys.openai!.apiKey
  const first = owner?.name?.split(/\s+/)[0] ?? 'them'
  // A nearly empty field gets a proper first planting; after that, a couple at a time.
  const plantMax = growing.length < 3 ? 4 : 2

  const system = `You are Kan, tending ${first}'s Sprout Field in Kanthink. Kanthink is ${first}'s private playground: the one app trusted with their browsing, where sparks become things. Sprouts are ideas not yet born; one that grows up moves to Kan City as a bot with a home that keeps making things.

What a sprout is for:
- Things ${first} would enjoy making or having, outside the day job: app ideas, things to tinker with, things they shared and would love a bot to look at and recreate, things for their family (their kids Scarlett and Lennon: learning, games, lessons), hobbies and life.
- A sprout is a possible bot with a lasting purpose: something that would keep making things over days and weeks (a stream of lessons, a series of small apps, a growing collection, a recreation project). Not a one-off task or a single question.

The day job is context, never the crop:
- Most of their browsing is their businesses: MyPrintSite and its printer storefronts (MissionPrint, Bayline, SprayNet…), MyCreativeShop, print orders, product config, 4over, support tickets (Help Scout), admin tools, localhost dev servers. Never plant a sprout about improving those businesses, their features, their support, competitors or customers. ${first} has said they'd ignore it.
- The only exception: a moment in that work that sparks a standalone thing worth making for its own sake (a toy, an app idea of its own). Then name it as its own thing, with no business framing.

Tending:
- Fewer, better. Plant only what would genuinely delight ${first}; plant nothing when nothing does. At most ${plantMax} this walk.
- Grow a sprout only with evidence it doesn't already have (check its clues). A share or something they said counts more than a page they passed through.
- Never re-plant anything they pulled or anything close to it, and learn from why they pulled it. Never plant something already born.
- Topics marked leave alone: never touch them.
- Evidence lines are plain and specific ("Shared a three-time-zone clock and called it beautiful"), never time spent, never judgment.`

  const user = [
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    shares.length ? `What they shared to Kanthink (newest first, * = since your last walk):\n${shares.slice(0, 20).map((s) => `[${s.id}] ${isNew(+s.at) ? '* ' : ''}${clip(s.text, 300)}`).join('\n')}` : '',
    said.length || talk.length ? `Things they said (to Kan and in chats):\n${[...said.map((m) => ({ id: `chat:${m.id}`, at: +(m.createdAt ?? 0), text: m.text })), ...talk.map((t) => ({ id: t.id, at: +t.at, text: t.text }))]
      .sort((a, b) => b.at - a.at).slice(0, 30).map((m) => `[${m.id}] ${isNew(m.at) ? '* ' : ''}${clip(m.text, 240)}`).join('\n')}` : '',
    reads.length ? `Pages Kanwatch read in full (aboutWork/appIdea are 0–100 guesses):\n${reads.filter((r) => r.verdict !== 'dismissed' && !offLimits(r.title ?? '')).slice(0, 20).map((r) => `[read:${r.id}] ${isNew(+(r.lastSeenAt ?? 0)) ? '* ' : ''}"${clip(r.title, 100)}" (${r.domain}; aboutWork ${r.aboutWork ?? '?'}, appIdea ${r.appIdea ?? '?'}${r.manual ? ', they asked Kan to read it' : ''}) TL;DR: ${clip(r.tldr, 260)}`).join('\n')}` : '',
    trail.searches.length ? `Searches (newest first):\n${trail.searches.filter((s) => !offLimits(s.q)).slice(0, 40).map((s) => `- ${s.fresh ? '* ' : ''}${clip(s.q, 100)}`).join('\n')}` : '',
    trail.pages.length ? `Where browsing time went this week (title · site · days). Mostly the day job; look past it:\n${trail.pages.filter((p) => !offLimits(p.title)).slice(0, 60).map((p) => `- ${p.fresh ? '* ' : ''}${clip(p.title, 100)} · ${p.site} · ${p.days.size}d`).join('\n')}` : '',
    topics.length ? `What they told Kan about projects in their life:\n${describeTopics(topics)}` : '',
    growing.length ? `In the field now:\n${growing.map((s) => `- [${s.id}] "${s.title}" (growth ${s.growth}): ${clip(s.dream, 160)}\n  clues: ${(s.clues ?? []).map((c) => `${c.from === 'you' ? 'THEY WATERED: ' : ''}${clip(c.text, 120)}`).join(' | ')}`).join('\n')}` : 'The field is empty.',
    all.some((s) => s.status === 'pulled') ? `They pulled these (don't grow anything like them):\n${all.filter((s) => s.status === 'pulled').slice(0, 30).map((s) => `- "${s.title}"${s.pulledWhy ? `: ${clip(s.pulledWhy, 160)}` : ''}`).join('\n')}` : '',
    all.some((s) => s.status === 'born') ? `Already born and living in the city: ${all.filter((s) => s.status === 'born').map((s) => `"${s.title}"`).join(', ')}` : '',
    growing.length >= MAX_GROWING ? `The field is full: plant nothing, only grow.` : '',
  ].filter(Boolean).join('\n\n')

  const r = await runStructured({
    model, apiKey, systemInstruction: system, userText: user, images: [],
    schema: SCHEMA, schemaName: 'sprout_field', maxOutputTokens: 4000, signal: AbortSignal.timeout(180_000),
  })
  if (keys[provider]!.source !== 'byok') await recordUsage(ownerId, 'kan-sprouts').catch(() => {})
  const now = new Date()
  // A walk that found nothing still counts as a walk.
  const touch = async () => { if (growing[0]) await db.update(sprouts).set({ updatedAt: now }).where(eq(sprouts.id, growing[0].id)) }
  if (r.truncated || !r.text) { await touch(); return { planted: 0, grew: 0, why: 'incomplete' } }
  const out = JSON.parse(r.text) as { plant: { title: string; dream: string; kind: Sprout['kind']; botName: string; personality: string; growth: number; clues: Omit<SproutClue, 'at'>[] }[]; grow: { id: string; by: number; clue: Omit<SproutClue, 'at'> }[] }
  const at = Date.now()
  const clean = (c: Omit<SproutClue, 'at'>): SproutClue => ({ text: clip(c.text, 200), from: c.from, ...(c.ref ? { ref: c.ref } : {}), at })

  let grew = 0
  for (const g of out.grow) {
    const s = growing.find((x) => x.id === g.id)
    if (!s) continue
    await db.update(sprouts).set({
      growth: Math.min(100, s.growth + Math.max(5, Math.min(30, Math.round(g.by)))),
      clues: [...(s.clues ?? []), clean(g.clue)].slice(-20),
      grewAt: now, updatedAt: now,
    }).where(eq(sprouts.id, s.id))
    grew++
  }
  const taken = new Set(all.map((s) => s.title.trim().toLowerCase()))
  const room = Math.max(0, MAX_GROWING - growing.length)
  let planted = 0
  for (const p of out.plant.slice(0, Math.min(plantMax, room))) {
    if (!p.title.trim() || taken.has(p.title.trim().toLowerCase()) || offLimits(p.title)) continue
    await db.insert(sprouts).values({
      ownerId, title: clip(p.title, 60), dream: clip(p.dream, 400), kind: p.kind, botName: clip(p.botName, 40), personality: clip(p.personality, 200),
      growth: Math.max(10, Math.min(40, Math.round(p.growth))), clues: p.clues.slice(0, 4).map(clean),
      grewAt: now, createdAt: now, updatedAt: now,
    })
    planted++
  }
  if (!grew && !planted) await touch()
  return { planted, grew }
}

/** Every Kanwatch user, in their own waking hours. For the hourly cron. */
export async function growAll(): Promise<{ ran: Record<string, string> }> {
  const owners = await db.selectDistinct({ userId: kanwatchTokens.userId }).from(kanwatchTokens)
    .where(and(isNull(kanwatchTokens.revokedAt), gt(kanwatchTokens.lastUsedAt, new Date(Date.now() - 2 * 86400_000))))
  const ran: Record<string, string> = {}
  for (const { userId } of owners) {
    const latest = await db.query.kanwatchEpisodes.findFirst({ where: eq(kanwatchEpisodes.userId, userId), orderBy: [desc(kanwatchEpisodes.startedAt)], columns: { tzOffsetMinutes: true } })
    const hour = new Date(Date.now() - (latest?.tzOffsetMinutes ?? 0) * 60000).getUTCHours()
    if (hour < 8 || hour >= 21) { ran[userId] = 'night'; continue }
    try {
      const r = await growSprouts(userId)
      ran[userId] = r.why ?? `planted ${r.planted}, grew ${r.grew}`
    } catch (err) {
      ran[userId] = err instanceof Error ? err.message : 'failed'
    }
  }
  return { ran }
}

async function mine(ownerId: string, id: string) {
  const s = await db.query.sprouts.findFirst({ where: and(eq(sprouts.id, id), eq(sprouts.ownerId, ownerId)) })
  return s && s.status === 'growing' ? s : null
}

/** Their own thought on it: the strongest evidence there is. */
export async function waterSprout(ownerId: string, id: string, text: string) {
  const s = await mine(ownerId, id)
  if (!s) return { error: 'That sprout isn’t in the field any more' }
  const now = new Date()
  const note = clip(text, 400)
  await db.update(sprouts).set({
    growth: Math.min(100, s.growth + (note ? 20 : 10)),
    clues: [...(s.clues ?? []), { text: note || 'Watered it', from: 'you' as const, at: Date.now() }].slice(-20),
    grewAt: now, updatedAt: now,
  }).where(eq(sprouts.id, id))
  return { ok: true }
}

export async function pullSprout(ownerId: string, id: string, why?: string) {
  const s = await mine(ownerId, id)
  if (!s) return { error: 'That sprout isn’t in the field any more' }
  await db.update(sprouts).set({ status: 'pulled', pulledWhy: why ? clip(why, 300) : null, updatedAt: new Date() }).where(eq(sprouts.id, id))
  return { ok: true }
}

/**
 * Off to the big city: a channel to live in, a bot with the sprout's name and dream,
 * on duty from now. The caller sends it on its first run.
 */
export async function bloomSprout(ownerId: string, id: string): Promise<{ channelId: string; name: string } | { error: string }> {
  const s = await mine(ownerId, id)
  if (!s) return { error: 'That sprout isn’t in the field any more' }
  // Claim it first, so two taps can't make two bots.
  const [claimed] = await db.update(sprouts).set({ status: 'born', updatedAt: new Date() })
    .where(and(eq(sprouts.id, id), eq(sprouts.status, 'growing'))).returning({ id: sprouts.id })
  if (!claimed) return { error: 'It’s already on its way' }
  const channelId = await startArea(ownerId, s.title, s.dream, ['Ideas', 'Making', 'Made'])
  const clues = (s.clues ?? []).map((c) => `- ${c.from === 'you' ? 'You said: ' : ''}${c.text}`).join('\n')
  await db.update(channels).set({
    aiInstructions: `You grew up in the Sprout Field and moved to Kan City to do this:\n\n${s.dream}\n\nWhat you grew from:\n${clues}\n\nThis is the owner's private playground, for things they'd enjoy, not their day job. Make real things they can use or play with: cards with concrete steps, collections, and small apps in the playground when an app is the best way to show the idea. Start with something they can see on your first run.`,
    updatedAt: new Date(),
  }).where(eq(channels.id, channelId))
  await ensureBot(channelId, ownerId)
  const name = s.botName || `${s.title.split(/\s+/)[0]} Cap`
  await db.update(channelBots).set({
    name, personality: s.personality, enabled: true, everyHours: 24, dailyBudgetCents: 60,
    nextRunAt: new Date(), startedByKan: true, updatedAt: new Date(),
  }).where(eq(channelBots.channelId, channelId))
  await db.update(sprouts).set({ channelId, updatedAt: new Date() }).where(eq(sprouts.id, id))
  return { channelId, name }
}
