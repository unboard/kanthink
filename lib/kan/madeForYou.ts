import { db } from '@/lib/db'
import { cards, channels, columns, kanMessages, kanwatchReads, madeForYou, madeSettings, playgroundApps, sprouts, users } from '@/lib/db/schema'
import { and, asc, desc, eq, gt, inArray, isNotNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { resolveProviderKeys } from '@/lib/ai/keys'
import { choiceOf, decide, scoreOf, yes, type DecisionQuestion } from '@/lib/ai/decide'
import { runStructured } from '@/lib/playground/generateClient'
import { getPlaygroundModel } from '@/lib/playground/models'
import { gatherInputs } from '@/lib/kan/attention/inputs'
import { describeTopics, isAbout, listTopics } from '@/lib/kan/attention/topics'
import { attentionTrail } from '@/lib/kan/thread/reach'
import { startArea } from '@/lib/kan/attention/apply'

/**
 * Made for you: Kan builds things on its own, then shows them.
 *
 * The owner shouldn't have to turn what Kan notices into work. Once a day, when there's
 * budget left this week, Kan reads the sparks (shares, what they said, what Kanwatch
 * read, their searches, the Sprout Field), has a cheap model suggest a handful of
 * things it could make that would help them learn, earn or have fun, and asks Gemini
 * Decision to rank and route them: how glad would they be to find it, is it really the
 * day job in disguise, is it too close to something already made, and who should build
 * it (an app Kan makes now, or a Claude Code job). The best one, if it clears the bar,
 * is built with Gemini 4 Neon on a card in the "Made for you" channel and announced
 * once. Keeping or tossing it there teaches the next pick.
 */

/** The model that builds them. The owner chose Neon for Kan's own builds. */
export const MADE_BUILD_MODEL = 'gemini-4-neon'
/** The model that suggests ideas: cheap, since Gemini Decision does the judging. */
const IDEA_MODEL = 'gemini-3.8-flash'
/** At most once a day on its own. */
const EVERY_MS = 22 * 3600_000
/** Below this on the 0–4 "glad to find it" scale (2 is "glad"), make nothing: an empty day beats a dud. */
const BAR = 2.1
export const CHANNEL_NAME = 'Made for you'

const clip = (s: string | null | undefined, n: number) => { const t = (s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }

const IDEAS = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      description: '4 to 8 different things Kan could make for them today.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Its name, 1–4 words.' },
          kind: { type: 'string', enum: ['learn', 'money', 'fun'] },
          forWhom: { type: 'string', description: '"you", "the kids", "the family", or a name they used.' },
          why: { type: 'string', description: 'The evidence, specific and plain: "You shared X and said Y."' },
          brief: { type: 'string', description: 'A build brief for one browser page with no accounts: what it does, the core interaction, what makes it delightful, what to leave out. 4–8 sentences. Where it needs AI, the app uses window.kanthinkAI.' },
        },
        required: ['title', 'kind', 'forWhom', 'why', 'brief'],
        additionalProperties: false,
      },
    },
  },
  required: ['ideas'],
  additionalProperties: false,
}
type Idea = { title: string; kind: 'learn' | 'money' | 'fun'; forWhom: string; why: string; brief: string }

export async function settingsFor(ownerId: string) {
  const row = await db.query.madeSettings.findFirst({ where: eq(madeSettings.ownerId, ownerId) })
  return row ?? { ownerId, weeklyCents: 300, lastRunAt: null as Date | null }
}

export async function setWeeklyBudget(ownerId: string, cents: number) {
  const weeklyCents = Math.max(0, Math.min(5000, Math.round(cents)))
  await db.insert(madeSettings).values({ ownerId, weeklyCents, updatedAt: new Date() })
    .onConflictDoUpdate({ target: madeSettings.ownerId, set: { weeklyCents, updatedAt: new Date() } })
  return weeklyCents
}

/** Spent in the last seven days, in cents. */
export async function spentThisWeek(ownerId: string): Promise<number> {
  const rows = await db.query.madeForYou.findMany({
    where: and(eq(madeForYou.ownerId, ownerId), gt(madeForYou.createdAt, new Date(Date.now() - 7 * 86400_000))),
    columns: { costCents: true },
  })
  return rows.reduce((s, r) => s + r.costCents, 0)
}

/** What the "Made for you" spot shows: newest first, with each app's link. */
export async function madeFor(ownerId: string) {
  const [rows, settings, spent] = await Promise.all([
    db.query.madeForYou.findMany({ where: eq(madeForYou.ownerId, ownerId), orderBy: [desc(madeForYou.createdAt)], limit: 40 }),
    settingsFor(ownerId),
    spentThisWeek(ownerId),
  ])
  const appIds = rows.map((r) => r.appId).filter(Boolean) as string[]
  const apps = appIds.length ? await db.query.playgroundApps.findMany({ where: inArray(playgroundApps.id, appIds), columns: { id: true, shareToken: true, isPublic: true, title: true, code: true } }) : []
  const { appLink } = await import('@/lib/kan/bots/approvals')
  const href = (id: string | null) => { const a = apps.find((x) => x.id === id); return a?.code ? appLink(a) : null }
  return {
    weeklyCents: settings.weeklyCents,
    spentCents: spent,
    items: rows.filter((r) => r.status !== 'tossed').map((r) => ({
      id: r.id, title: r.title, kind: r.kind, forWhom: r.forWhom, why: r.why, status: r.status, route: r.route,
      appId: r.appId, href: href(r.appId), cardId: r.cardId, at: +(r.createdAt ?? 0),
    })),
  }
}

export async function keepMade(ownerId: string, id: string) {
  await db.update(madeForYou).set({ status: 'kept', updatedAt: new Date() }).where(and(eq(madeForYou.id, id), eq(madeForYou.ownerId, ownerId)))
}

export async function tossMade(ownerId: string, id: string, why?: string) {
  const row = await db.query.madeForYou.findFirst({ where: and(eq(madeForYou.id, id), eq(madeForYou.ownerId, ownerId)) })
  if (!row) return
  await db.update(madeForYou).set({ status: 'tossed', tossedWhy: why ? clip(why, 300) : null, updatedAt: new Date() }).where(eq(madeForYou.id, id))
  if (row.cardId) await db.update(cards).set({ isArchived: true, updatedAt: new Date() }).where(eq(cards.id, row.cardId))
}

/** The Made for you channel, made the first time it's needed. */
async function homeColumn(ownerId: string): Promise<{ channelId: string; columnId: string }> {
  let ch = await db.query.channels.findFirst({ where: and(eq(channels.ownerId, ownerId), eq(channels.name, CHANNEL_NAME), eq(channels.status, 'active')), columns: { id: true } })
  if (!ch) {
    const id = await startArea(ownerId, CHANNEL_NAME, 'Things Kan made for you on its own, from what you shared, said and read: to learn something, make money or have fun. Keep what you like; toss the rest and Kan learns.', ['New', 'Kept'])
    ch = { id }
  }
  const col = await db.query.columns.findFirst({ where: eq(columns.channelId, ch.id), orderBy: [asc(columns.position)], columns: { id: true } })
  return { channelId: ch.id, columnId: col!.id }
}

/**
 * One pass: suggest, rank, build the best. Returns what happened, for logs and the
 * "make something now" button. dry ranks and returns without building or spending on a build.
 */
export async function makeSomething(ownerId: string, opts: { force?: boolean; dry?: boolean } = {}): Promise<{ made?: string; route?: string; why: string; ranked?: Array<{ title: string; glad: number; work: number; dupe: number; route: string }> }> {
  const settings = await settingsFor(ownerId)
  if (settings.weeklyCents <= 0) return { why: 'turned off' }
  if (!opts.force && settings.lastRunAt && Date.now() - +settings.lastRunAt < EVERY_MS) return { why: 'too soon' }
  const spent = await spentThisWeek(ownerId)
  const { estimateBuildCost } = await import('@/lib/playground/estimate')
  const buildCents = Math.ceil(estimateBuildCost({ modelId: MADE_BUILD_MODEL, briefChars: 3000 }).likelyUsd * 100)
  if (!opts.dry && spent + buildCents > settings.weeklyCents) return { why: `budget: ${spent}¢ of ${settings.weeklyCents}¢ spent this week` }

  const { keys } = await resolveProviderKeys(ownerId)
  if (!keys.google) return { why: 'needs a Google key (Gemini Decision and Neon)' }
  const google = keys.google.apiKey
  if (!opts.dry) {
    await db.insert(madeSettings).values({ ownerId, weeklyCents: settings.weeklyCents, lastRunAt: new Date() })
      .onConflictDoUpdate({ target: madeSettings.ownerId, set: { lastRunAt: new Date(), updatedAt: new Date() } })
  }

  // ── What Kan has seen ──
  const since = new Date(Date.now() - 14 * 86400_000)
  const [trail, inputs, topics, reads, said, owner, field, history] = await Promise.all([
    attentionTrail(ownerId, new Date(Date.now() - 7 * 86400_000), new Date(Date.now() - 86400_000)),
    gatherInputs(ownerId, since),
    listTopics(ownerId),
    db.query.kanwatchReads.findMany({
      where: and(eq(kanwatchReads.userId, ownerId), gt(kanwatchReads.lastSeenAt, since), isNotNull(kanwatchReads.tldr)),
      orderBy: [desc(kanwatchReads.lastSeenAt)], limit: 25,
      columns: { title: true, domain: true, tldr: true, aboutWork: true, verdict: true },
    }),
    db.query.kanMessages.findMany({ where: and(eq(kanMessages.ownerId, ownerId), eq(kanMessages.role, 'you')), orderBy: [desc(kanMessages.createdAt)], limit: 25, columns: { text: true } }),
    db.query.users.findFirst({ where: eq(users.id, ownerId), columns: { name: true } }),
    db.query.sprouts.findMany({ where: and(eq(sprouts.ownerId, ownerId), eq(sprouts.status, 'growing')), orderBy: [desc(sprouts.growth)], limit: 10, columns: { title: true, dream: true } }),
    db.query.madeForYou.findMany({ where: eq(madeForYou.ownerId, ownerId), orderBy: [desc(madeForYou.createdAt)], limit: 40, columns: { title: true, status: true, tossedWhy: true } }),
  ])
  const handsOff = topics.filter((t) => t.role === 'hands_off')
  const offLimits = (s: string) => handsOff.some((t) => isAbout(s, t.name))
  const first = owner?.name?.split(/\s+/)[0] ?? 'them'
  const sparks = [
    inputs.some((i) => i.kind === 'share') ? `Shared to Kanthink (newest first):\n${inputs.filter((i) => i.kind === 'share' && !offLimits(i.text)).slice(0, 15).map((s) => `- ${clip(s.text, 260)}`).join('\n')}` : '',
    said.length ? `Things they said to Kan:\n${said.filter((m) => !offLimits(m.text)).map((m) => `- ${clip(m.text, 200)}`).join('\n')}` : '',
    reads.length ? `Pages Kanwatch read (aboutWork is a 0–100 guess):\n${reads.filter((r) => r.verdict !== 'dismissed' && !offLimits(r.title ?? '')).map((r) => `- "${clip(r.title, 90)}" (${r.domain}, aboutWork ${r.aboutWork ?? '?'}): ${clip(r.tldr, 200)}`).join('\n')}` : '',
    trail.searches.length ? `Searches:\n${trail.searches.filter((s) => !offLimits(s.q)).slice(0, 30).map((s) => `- ${clip(s.q, 90)}`).join('\n')}` : '',
    topics.length ? `What they told Kan about their life:\n${describeTopics(topics)}` : '',
    field.length ? `Ideas growing in their Sprout Field:\n${field.map((s) => `- ${s.title}: ${clip(s.dream, 140)}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
  if (!sparks.trim()) return { why: 'nothing to go on yet' }
  const made = history.filter((h) => h.status !== 'tossed').map((h) => h.title)
  const tossed = history.filter((h) => h.status === 'tossed').map((h) => `${h.title}${h.tossedWhy ? ` (${h.tossedWhy})` : ''}`)

  // ── Suggest ──
  const ideaModel = getPlaygroundModel(IDEA_MODEL)
  const r = await runStructured({
    model: ideaModel, apiKey: google, images: [], schema: IDEAS, schemaName: 'made_for_you', maxOutputTokens: 6000, signal: AbortSignal.timeout(120_000),
    systemInstruction: `You are Kan, ${first}'s assistant in Kanthink, their private playground. Without being asked, you make them things that serve them: help them learn something, help them make money on the side, or help them (and their family: their kids Scarlett and Lennon, their niece Gracie) have fun. Each thing is one working page they can open and use today.

Suggest 4–8 different things, each grounded in something specific below. Mix the kinds when the evidence allows.
- Their day job (print shops, MyPrintSite, MyCreativeShop, MissionPrint, 4over, support tickets and the like) is context, never the subject. Never make anything for it.
- Concrete beats clever: a playable game, a tool they'd reuse, an interactive lesson, a small side-income experiment. Never a page about something.
- Don't repeat what's already made, and learn from what they tossed.
- American spelling.`,
    userText: [
      `Today is ${new Date().toISOString().slice(0, 10)}.`,
      sparks,
      made.length ? `Already made for them: ${made.join(', ')}` : '',
      tossed.length ? `They tossed these (make nothing like them):\n${tossed.map((t) => `- ${t}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n'),
  })
  if (r.truncated || !r.text) return { why: 'no ideas came back' }
  const ideas = ((JSON.parse(r.text) as { ideas: Idea[] }).ideas ?? []).filter((i) => i.title.trim() && !offLimits(i.title)).slice(0, 8)
  if (!ideas.length) return { why: 'no ideas' }
  const ideaCents = Math.ceil(((r.usage?.inputTokens ?? 0) * ideaModel.pricing.input + (r.usage?.outputTokens ?? 0) * ideaModel.pricing.output) / 1e4)

  // ── Rank and route ──
  const input = `Who this is for: ${first}. Kanthink is their private playground; their day job (print shops, MyPrintSite, MyCreativeShop) is never the subject.\n\nWhat Kan has seen lately:\n${clip(sparks, 9000)}\n\nAlready made: ${made.join(', ') || 'nothing yet'}\nTossed: ${tossed.join('; ') || 'nothing'}\n\nIdeas:\n${ideas.map((i, n) => `[${n}] ${i.title} (${i.kind}, for ${i.forWhom}). Why: ${i.why}\n${i.brief}`).join('\n\n')}`
  const questions: Record<string, DecisionQuestion> = {}
  ideas.forEach((i, n) => {
    questions[`glad${n}`] = { type: 'score', instructions: `Idea [${n}] "${i.title}": how glad would ${first} be to find it already made and waiting, judged only by the evidence of what they care about?`, criteria: ['not at all', 'mildly', 'glad', 'delighted', 'would tell someone about it'] }
    questions[`work${n}`] = { type: 'noul', instructions: `Is idea [${n}] "${i.title}" really about their day job, its businesses, customers or tools?` }
    questions[`dupe${n}`] = { type: 'noul', instructions: `Is idea [${n}] "${i.title}" close to something already made or tossed?` }
    questions[`who${n}`] = { type: 'choice', instructions: `Who should build idea [${n}] "${i.title}"?`, criteria: { app: 'Kan, now, as one browser page with no server', claude: 'Claude Code: it needs real multiplayer, a server, a 3D world or changes to Kanthink itself' } }
  })
  const d = await decide({ apiKey: google, input, questions })
  const ranked = ideas.map((i, n) => ({
    idea: i,
    glad: scoreOf(d.answers[`glad${n}`]),
    work: yes(d.answers[`work${n}`], 1),
    dupe: yes(d.answers[`dupe${n}`], 1),
    route: choiceOf<'app' | 'claude'>(d.answers[`who${n}`], 'app'),
  })).sort((a, b) => (b.glad - b.work * 2 - b.dupe) - (a.glad - a.work * 2 - a.dupe))
  const summary = ranked.map((x) => ({ title: x.idea.title, glad: +x.glad.toFixed(2), work: +x.work.toFixed(2), dupe: +x.dupe.toFixed(2), route: x.route }))
  const best = ranked.find((x) => x.work < 0.3 && x.dupe < 0.5 && x.glad >= BAR)
  if (opts.dry) return { why: best ? `would make ${best.idea.title}` : 'nothing cleared the bar', ranked: summary }
  if (!best) return { why: 'nothing cleared the bar', ranked: summary }

  // ── Make it ──
  const { idea } = best
  const { channelId, columnId } = await homeColumn(ownerId)
  const top = await db.query.cards.findFirst({ where: and(eq(cards.columnId, columnId), eq(cards.isArchived, false)), orderBy: [cards.position], columns: { position: true } })
  const cardId = nanoid()
  const now = new Date()
  const note = `**Made for ${idea.forWhom}** · ${idea.kind === 'learn' ? 'to learn' : idea.kind === 'money' ? 'to earn' : 'for fun'}\n\n${idea.why}\n\n${idea.brief}`
  await db.insert(cards).values({
    id: cardId, channelId, columnId, title: clip(idea.title, 80), position: (top?.position ?? 0) - 1, source: 'ai',
    messages: [{ id: nanoid(), type: 'note', content: note, authorName: 'Kan', createdAt: now.toISOString() }] as never,
    createdAt: now, updatedAt: now,
  })
  const [row] = await db.insert(madeForYou).values({
    ownerId, title: clip(idea.title, 80), kind: idea.kind, forWhom: clip(idea.forWhom, 40), why: clip(idea.why, 400), brief: idea.brief,
    score: best.glad, route: best.route, cardId, costCents: ideaCents + d.costCents, status: 'building', createdAt: now, updatedAt: now,
  }).returning({ id: madeForYou.id })

  const { kanSays } = await import('@/lib/kan/thread/store')
  if (best.route === 'claude') {
    // Too big for one page: it goes to Claude Code as a brief, and Kan says so once.
    const { WORK_CHANNEL_ID } = await import('@/lib/kan/agent/tools')
    const doCol = await db.query.columns.findFirst({ where: and(eq(columns.channelId, WORK_CHANNEL_ID), eq(columns.name, 'Do these')), columns: { id: true } })
    if (doCol) {
      await db.insert(cards).values({
        id: nanoid(), channelId: WORK_CHANNEL_ID, columnId: doCol.id, title: clip(idea.title, 80), position: -Date.now() / 1e9, source: 'manual',
        messages: [{ id: nanoid(), type: 'note', content: `${idea.brief}\n\n**Why:** ${idea.why}\n\n_Kan picked this to make for you; it needs Claude Code._`, authorName: 'Kan', createdAt: now.toISOString() }] as never,
        createdAt: now, updatedAt: now,
      })
    }
    await db.update(madeForYou).set({ status: 'handed', updatedAt: new Date() }).where(eq(madeForYou.id, row.id))
    await kanSays(ownerId, 'reach', `I wanted to make you **${idea.title}**, but it needs more than one page, so it's waiting for Claude Code in Work → Do these. ${idea.why}`, {})
    return { made: idea.title, route: 'claude', why: 'handed to Claude Code', ranked: summary }
  }

  const [{ createPlaygroundAppRecord }, { generatePlaygroundApp }] = await Promise.all([import('@/lib/playground/appRecord'), import('@/lib/playground/generateApp')])
  const app = await createPlaygroundAppRecord({ cardId, userId: ownerId, title: clip(idea.title, 60) })
  if (!app) {
    await db.update(madeForYou).set({ status: 'failed', updatedAt: new Date() }).where(eq(madeForYou.id, row.id))
    return { why: 'could not start the app', ranked: summary }
  }
  await db.update(madeForYou).set({ appId: app.id, costCents: ideaCents + d.costCents + buildCents }).where(eq(madeForYou.id, row.id))
  await generatePlaygroundApp({ appId: app.id, prompt: `${idea.brief}\n\nWho it's for: ${idea.forWhom}. Why: ${idea.why}`, modelId: MADE_BUILD_MODEL, notifyWhenDone: false, from: 'Kan' }, { user: { id: ownerId } }, { skipPreflight: true })
  const built = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, app.id), columns: { id: true, code: true, shareToken: true, isPublic: true, title: true } })
  if (!built?.code) {
    await db.update(madeForYou).set({ status: 'failed', updatedAt: new Date() }).where(eq(madeForYou.id, row.id))
    return { why: 'the build did not come out', ranked: summary }
  }
  await db.update(madeForYou).set({ status: 'ready', updatedAt: new Date() }).where(eq(madeForYou.id, row.id))
  const { appLink } = await import('@/lib/kan/bots/approvals')
  const name = built.title || idea.title
  await kanSays(ownerId, 'reach', `I made you **${name}** ${idea.kind === 'learn' ? 'to learn from' : idea.kind === 'money' ? 'to try earning with' : 'for fun'}. ${idea.why} It's in Made for you: keep it or toss it.`, {
    links: [{ title: name, url: appLink(built) }],
  })
  const { sendPushToUser } = await import('@/lib/notifications/push')
  await sendPushToUser(ownerId, { title: 'Kan made you something', body: name, url: '/prototypes/kan/city' }).catch(() => 0)
  return { made: name, route: 'app', why: 'built', ranked: summary }
}

/** Everyone who has it on and a Google key. For the hourly cron; each owner runs at most once a day. */
export async function makeForAll(): Promise<Record<string, string>> {
  const rows = await db.query.madeSettings.findMany({ where: gt(madeSettings.weeklyCents, 0), columns: { ownerId: true, lastRunAt: true } })
  const out: Record<string, string> = {}
  for (const r of rows) {
    if (r.lastRunAt && Date.now() - +r.lastRunAt < EVERY_MS) continue
    out[r.ownerId] = await makeSomething(r.ownerId).then((x) => x.made ? `made ${x.made}` : x.why).catch((e) => `error: ${String(e?.message ?? e).slice(0, 120)}`)
  }
  return out
}
