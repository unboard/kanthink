import { db } from '@/lib/db'
import { kanMessages, kanwatchDays, kanwatchEpisodes, kanwatchReads, kanwatchTokens, kanwatchVisits, users } from '@/lib/db/schema'
import { and, desc, eq, gt, isNotNull, isNull } from 'drizzle-orm'
import { resolveProviderKeys } from '@/lib/ai/keys'
import { runStructured } from '@/lib/playground/generateClient'
import { getPlaygroundModel } from '@/lib/playground/models'
import { recordUsage } from '@/lib/usage'
import { gatherAreas, gatherInputs } from '@/lib/kan/attention/inputs'
import { describeTopics, isAbout, listTopics } from '@/lib/kan/attention/topics'
import { kanSays, listThread } from './store'

/**
 * Kan speaking first, from the trail of their attention.
 *
 * Kanwatch is the richest thing Kan has about its owner: what they spent time on (page
 * titles), what they searched for, Kan's own read of each day, and the public pages it
 * read in full. A few times a day Kan goes over what's new there and opens a
 * conversation about the thread most worth it: an interest that keeps coming back, a
 * run of searches that shows what they're trying to figure out, something they keep
 * returning to. Channels are only where things can go, and only the ones they've
 * actually touched lately: most old channels say nothing about them now.
 *
 * Only what Kanwatch already stored goes in, and never a private visit (privacy.js
 * decided those at capture). Never housekeeping, never a recap of their day.
 */

/** At most this often, unless they ask. */
export const REACH_EVERY_MS = 3 * 3600_000
/** How far back Kan looks for patterns. */
const TRAIL_MS = 7 * 86400_000
/** Something new since Kan last spoke has to be at least this big to be worth a look. */
const NEW_MINUTES = 20
const PAGE_CHARS = 2500

const SCHEMA = {
  type: 'object',
  properties: {
    say: { type: 'boolean', description: 'False only when everything here has already been raised in the thread or is truly nothing.' },
    topic: { type: 'string', description: '2–6 words naming what this is about, so it is not raised again, e.g. "competitor print shops in Fargo".' },
    text: { type: 'string', description: 'The message, in markdown, 40–130 words. No greeting, no headings.' },
    refs: { type: 'array', items: { type: 'string' }, description: 'The ids (read:…, share:…) this is about, if any.' },
    suggestions: {
      type: 'array',
      description: '1–3 replies they could tap. Each is a thing Kan would then do with its tools.',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: '2–5 words, what they would say, e.g. "Compare those shops"' },
          prompt: { type: 'string', description: 'The full instruction to Kan, in their voice, specific enough to act on without asking: what to look into or make, from what, and where it should go.' },
        },
        required: ['label', 'prompt'],
        additionalProperties: false,
      },
    },
  },
  required: ['say', 'topic', 'text', 'refs', 'suggestions'],
  additionalProperties: false,
}

const clip = (s: string | null | undefined, n: number) => { const t = (s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }
const mins = (sec: number) => Math.max(1, Math.round(sec / 60))
/** Titles that are a place, not a thing: they say nothing about what held their attention. */
const PLACE = /^(home|inbox|feed|notifications|messages|dashboard|new tab|google|facebook|youtube|x|mine)(\s*[/|·-]\s*\w+)?$|^google messages/i

/** What they spent time on and searched for, from Kanwatch's own record. */
async function attentionTrail(ownerId: string, since: Date, newSince: Date) {
  const visits = await db.query.kanwatchVisits.findMany({
    where: and(eq(kanwatchVisits.userId, ownerId), gt(kanwatchVisits.startedAt, since), eq(kanwatchVisits.isPrivate, false)),
    columns: { startedAt: true, activeSeconds: true, domain: true, title: true, searchQuery: true, isBackground: true },
    limit: 8000,
  })
  const pages = new Map<string, { site: string; title: string; seconds: number; days: Set<string>; fresh: number }>()
  const searches = new Map<string, { q: string; at: number; fresh: boolean }>()
  let freshSeconds = 0
  for (const v of visits) {
    if (v.isBackground) continue
    const at = +v.startedAt
    const fresh = at > +newSince
    if (fresh) freshSeconds += v.activeSeconds ?? 0
    const q = v.searchQuery?.trim()
    if (q) {
      const k = q.toLowerCase()
      const prev = searches.get(k)
      if (!prev || at > prev.at) searches.set(k, { q, at, fresh: fresh || Boolean(prev?.fresh) })
    }
    const title = v.title?.replace(/^\(\d+\+?\)\s*/, '').trim()
    if (!title || !v.domain || /kanthink/.test(v.domain) || PLACE.test(title)) continue
    const key = `${v.domain}|${title}`
    const p = pages.get(key) ?? { site: v.domain, title, seconds: 0, days: new Set<string>(), fresh: 0 }
    p.seconds += v.activeSeconds ?? 0
    p.days.add(new Date(at).toISOString().slice(0, 10))
    if (fresh) p.fresh += v.activeSeconds ?? 0
    pages.set(key, p)
  }
  return {
    freshMinutes: freshSeconds / 60,
    freshSearches: [...searches.values()].filter((s) => s.fresh).length,
    pages: [...pages.values()].filter((p) => p.seconds >= 90 || p.fresh > 0)
      .sort((a, b) => (b.seconds + b.fresh * 2) - (a.seconds + a.fresh * 2)).slice(0, 70),
    searches: [...searches.values()].sort((a, b) => b.at - a.at).slice(0, 60),
  }
}

export async function reachOut(ownerId: string, opts: { force?: boolean; notify?: boolean } = {}): Promise<{ said: boolean; why?: string }> {
  const thread = await listThread(ownerId, 60)
  const lastReach = [...thread].reverse().find((m) => m.kind === 'reach')
  if (!opts.force && lastReach && Date.now() - +(lastReach.createdAt ?? 0) < REACH_EVERY_MS) return { said: false, why: 'too soon' }
  const told = new Set(thread.flatMap((m) => m.data?.refs ?? []))
  const since = new Date(Date.now() - TRAIL_MS)
  const newSince = new Date(Math.max(+since, +(lastReach?.createdAt ?? 0)))

  const [trail, inputs, areas, topics, reads, days, owner] = await Promise.all([
    attentionTrail(ownerId, since, newSince),
    gatherInputs(ownerId, newSince),
    gatherAreas(ownerId, new Date(Date.now() - 14 * 86400_000)),
    listTopics(ownerId),
    db.query.kanwatchReads.findMany({
      where: and(eq(kanwatchReads.userId, ownerId), gt(kanwatchReads.lastSeenAt, since), isNotNull(kanwatchReads.tldr)),
      orderBy: [desc(kanwatchReads.lastSeenAt)],
      limit: 30,
      columns: { id: true, url: true, title: true, domain: true, text: true, tldr: true, why: true, worth: true, aboutWork: true, kanthinkFit: true, appIdea: true, seconds: true, manual: true, verdict: true, lastSeenAt: true },
    }),
    db.query.kanwatchDays.findMany({ where: and(eq(kanwatchDays.userId, ownerId), isNotNull(kanwatchDays.story)), orderBy: [desc(kanwatchDays.date)], limit: 4, columns: { date: true, story: true } }),
    db.query.users.findFirst({ where: eq(users.id, ownerId), columns: { name: true } }),
  ])
  const handsOff = topics.filter((t) => t.role === 'hands_off')
  const offLimits = (s: string) => handsOff.some((t) => isAbout(s, t.name))
  const fresh = reads
    .filter((r) => r.verdict !== 'dismissed' && !told.has(`read:${r.id}`) && !offLimits(`${r.title}`))
    .sort((a, b) => (Math.max(b.worth ?? 0, b.appIdea ?? 0, b.kanthinkFit ?? 0) + (b.manual ? 30 : 0)) - (Math.max(a.worth ?? 0, a.appIdea ?? 0, a.kanthinkFit ?? 0) + (a.manual ? 30 : 0)))
  const shares = inputs.filter((i) => i.kind === 'share' && !told.has(i.id))
  const newReads = fresh.filter((r) => +(r.lastSeenAt ?? 0) > +newSince)
  if (!opts.force && !newReads.length && !shares.length && trail.freshMinutes < NEW_MINUTES && !trail.freshSearches) return { said: false, why: 'nothing new' }
  if (!fresh.length && !shares.length && !trail.pages.length && !trail.searches.length) return { said: false, why: 'nothing at all' }

  const { keys } = await resolveProviderKeys(ownerId)
  const provider = keys.anthropic ? 'anthropic' : keys.openai ? 'openai' : null
  if (!provider) return { said: false, why: 'no key' }
  const model = getPlaygroundModel(provider === 'anthropic' ? 'claude-opus-5-5' : 'gpt-5.6-sol')
  const apiKey = provider === 'anthropic' ? keys.anthropic!.apiKey : keys.openai!.apiKey

  const first = owner?.name?.split(/\s+/)[0] ?? 'them'
  const raised = thread.filter((m) => m.kind === 'reach').flatMap((m) => (m.data?.refs ?? []).filter((r) => r.startsWith('topic:')).map((r) => r.slice(6)))
  const system = `You are Kan, ${first}'s assistant inside Kanthink, writing first in your ongoing chat with them. Kanwatch shows you the trail of their attention over the past week: what they spent time on (page titles, with minutes and how many days), what they searched for, your own read of recent days, and public pages you read in full. That trail is the best evidence you have of what they care about and what they're trying to figure out. Use it.

Find the one thread most worth opening a conversation about, and bring something to it:
- Look for patterns, not single pages: an interest that keeps coming back across days, a run of searches that shows what they're working out (several competitor shops, a product they're pricing, a place they're going), a page or problem they keep returning to, a connection between what they read and what they build.
- Start from the specific evidence ("you looked up Rokop Signs, SignGraphics and the UPS Store's print page this week"), then add what a sharp friend would: an idea, a pattern they may not have noticed, a useful fact you know, a pointed question. If you read the page, use the actual idea from it.
- Then offer what you could do about it, as the suggestions: research and compare, a card with real steps, a small app to try the idea, a draft, a bot to keep watching. Things you can really do.

Rules:
- Never recap their day or report time spent ("you spent 3 hours on…"). Time is only your evidence for what matters.
- Never judge how they spent their time, focus, or distraction. No productivity talk.
- Personal interests (sports, local places, news they follow) are fair game when there's something genuinely good to say. Keep it light.
- Their channels are only places things could go. Don't build the message around a channel.
- Plain words, first person, no hype, no "Great find!". Never talk about filing, organizing or sorting.
- Don't repeat anything already raised (topics listed below, and the thread).
- Topics they said Kan only knows about: ideas welcome, never offer to build or run it for them. Topics marked leave alone: never mention.
- Only set say to false when everything worth saying has already been said.`

  const storyLines = days.map((d) => {
    try {
      const st = JSON.parse(d.story!) as { headline?: string; threads?: { title: string; detail: string }[] }
      return `- ${d.date}: ${st.headline ?? ''}${(st.threads ?? []).map((t) => `\n  · ${t.title}: ${t.detail}`).join('')}`
    } catch { return '' }
  }).filter(Boolean)
  const user = [
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    storyLines.length ? `Your read on their recent days:\n${storyLines.join('\n')}` : '',
    trail.searches.length ? `What they searched for (newest first, * = since you last spoke):\n${trail.searches.filter((s) => !offLimits(s.q)).map((s) => `- ${s.fresh ? '* ' : ''}${clip(s.q, 100)} (${new Date(s.at).toISOString().slice(0, 10)})`).join('\n')}` : '',
    trail.pages.length ? `Where their time went (page title · site · minutes · days seen, * = since you last spoke):\n${trail.pages.filter((p) => !offLimits(p.title)).map((p) => `- ${p.fresh ? '* ' : ''}${clip(p.title, 110)} · ${p.site} · ${mins(p.seconds)}m · ${p.days.size}d`).join('\n')}` : '',
    fresh.length ? `Pages you read in full, best first:\n${fresh.slice(0, 8).map((r, i) => [
      `[read:${r.id}] "${r.title}" (${r.domain}, ${Math.round((r.seconds ?? 0) / 60)} min${r.manual ? ', they asked you to read it' : ''}${r.verdict === 'saved' ? ', they saved it' : ''})`,
      `  TL;DR: ${clip(r.tldr, 400)}`,
      r.why ? `  Why it seemed worth it: ${clip(r.why, 200)}` : '',
      i < 3 && r.text ? `  From the page: ${clip(r.text, PAGE_CHARS)}` : '',
    ].filter(Boolean).join('\n')).join('\n\n')}` : '',
    shares.length ? `What they shared to you:\n${shares.slice(0, 6).map((s) => `[${s.id}] ${s.text}`).join('\n')}` : '',
    topics.length ? `What they told you about projects in their life:\n${describeTopics(topics)}` : '',
    areas.some((a) => a.recentActivity) ? `Channels they've actually used lately (places things could go):\n${areas.filter((a) => a.recentActivity).slice(0, 12).map((a) => `- ${a.name}${a.description ? `: ${clip(a.description, 100)}` : ''}`).join('\n')}` : '',
    raised.length ? `Already raised, don't repeat: ${raised.join('; ')}` : '',
    `The thread so far (latest last):\n${thread.slice(-12).map((m) => `${m.role === 'you' ? first : 'Kan'}: ${clip(m.text, 300)}`).join('\n') || '(nothing yet)'}`,
  ].filter(Boolean).join('\n\n')

  const r = await runStructured({
    model, apiKey, systemInstruction: system, userText: user, images: [],
    schema: SCHEMA, schemaName: 'kan_reach_out', maxOutputTokens: 4000, signal: AbortSignal.timeout(180_000),
  })
  if (keys[provider]!.source !== 'byok') await recordUsage(ownerId, 'kan-reach-out').catch(() => {})
  if (r.truncated || !r.text) return { said: false, why: 'incomplete' }
  const out = JSON.parse(r.text) as { say: boolean; topic: string; text: string; refs: string[]; suggestions: { label: string; prompt: string }[] }
  if (!out.say || !out.text.trim()) return { said: false, why: 'nothing worth it' }

  const byId = new Map(fresh.map((x) => [`read:${x.id}`, x]))
  const refs = out.refs.filter((id) => byId.has(id) || shares.some((s) => s.id === id))
  if (out.topic?.trim()) refs.push(`topic:${clip(out.topic, 80)}`)
  const text = out.text.trim()
  await kanSays(ownerId, 'reach', text, {
    refs,
    links: refs.map((id) => byId.get(id)).filter((x) => x !== undefined).map((x) => ({ title: x.title ?? x.url, url: x.url })),
    suggestions: out.suggestions.slice(0, 3),
  })
  if (opts.notify) {
    const { sendPushToUser } = await import('@/lib/notifications/push')
    await sendPushToUser(ownerId, { title: 'Kan', body: clip(text.replace(/[#*_`>[\]]/g, ''), 160), url: '/prototypes/kan/city' }).catch(() => 0)
  }
  return { said: true }
}

/** Kan speaking first on its own, a few times a day, in waking hours in their own time zone. */
export async function reachOutAll(): Promise<{ said: string[]; skipped: Record<string, string> }> {
  const owners = await db.selectDistinct({ userId: kanwatchTokens.userId }).from(kanwatchTokens)
    .where(and(isNull(kanwatchTokens.revokedAt), gt(kanwatchTokens.lastUsedAt, new Date(Date.now() - 2 * 86400_000))))
  const said: string[] = []
  const skipped: Record<string, string> = {}
  for (const { userId } of owners) {
    const latest = await db.query.kanwatchEpisodes.findFirst({ where: eq(kanwatchEpisodes.userId, userId), orderBy: [desc(kanwatchEpisodes.startedAt)], columns: { tzOffsetMinutes: true } })
    const hour = new Date(Date.now() - (latest?.tzOffsetMinutes ?? 0) * 60000).getUTCHours()
    if (hour < 8 || hour >= 21) { skipped[userId] = 'night'; continue }
    try {
      const r = await reachOut(userId, { notify: true })
      if (r.said) said.push(userId)
      else skipped[userId] = r.why ?? 'quiet'
    } catch (err) {
      skipped[userId] = err instanceof Error ? err.message : 'failed'
    }
  }
  return { said, skipped }
}

/** A plan just landed: say so in the thread, with its cards to answer right there. */
export async function announcePlan(ownerId: string, passId: string, note: string) {
  const exists = await db.query.kanMessages.findFirst({ where: and(eq(kanMessages.ownerId, ownerId), eq(kanMessages.kind, 'plan')), orderBy: [desc(kanMessages.createdAt)], columns: { data: true } })
  if (exists?.data?.passId === passId) return
  await kanSays(ownerId, 'plan', note, { passId })
}
