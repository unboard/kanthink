import { db } from '@/lib/db'
import { kanMessages, kanwatchReads, users } from '@/lib/db/schema'
import { and, desc, eq, gt, isNotNull } from 'drizzle-orm'
import { resolveProviderKeys } from '@/lib/ai/keys'
import { runStructured } from '@/lib/playground/generateClient'
import { getPlaygroundModel } from '@/lib/playground/models'
import { recordUsage } from '@/lib/usage'
import { gatherAreas, gatherInputs } from '@/lib/kan/attention/inputs'
import { describeTopics, isAbout, listTopics } from '@/lib/kan/attention/topics'
import { kanSays, listThread } from './store'

/**
 * Kan speaking first. What the owner read (as Kanwatch judged it worth a look) and
 * what they shared is the richest thing Kan has about them, so a few times a day Kan
 * goes through what's new and, when something is genuinely worth it, says so in the
 * thread: the specific idea from the page, why it matters to something they're
 * working on, and what Kan could do about it, as replies they can tap.
 *
 * Never housekeeping ("I filed…"): that's the plan's job. When nothing is worth
 * saying, Kan says nothing.
 */

/** At most this often, unless they ask. */
export const REACH_EVERY_MS = 3 * 3600_000
/** The first time, look back this far. */
const FIRST_WINDOW_MS = 2 * 86400_000
const PAGE_CHARS = 2500

const SCHEMA = {
  type: 'object',
  properties: {
    say: { type: 'boolean', description: 'False when nothing here is worth interrupting them for. Most of the time something is; never pad.' },
    text: { type: 'string', description: 'The message, in markdown, 40–130 words. No greeting, no headings.' },
    refs: { type: 'array', items: { type: 'string' }, description: 'The ids (read:…, share:…) of what this message is about.' },
    suggestions: {
      type: 'array',
      description: '1–3 replies they could tap. Each is a thing Kan would then do with its tools.',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: '2–5 words, what they would say, e.g. "Make it a card in MyPrintSite"' },
          prompt: { type: 'string', description: 'The full instruction to Kan, in their voice, specific enough to act on without asking: which channel, what the card or app should contain, from which page.' },
        },
        required: ['label', 'prompt'],
        additionalProperties: false,
      },
    },
  },
  required: ['say', 'text', 'refs', 'suggestions'],
  additionalProperties: false,
}

const clip = (s: string | null | undefined, n: number) => { const t = (s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }

export async function reachOut(ownerId: string, opts: { force?: boolean } = {}): Promise<{ said: boolean; why?: string }> {
  const thread = await listThread(ownerId, 40)
  const lastReach = [...thread].reverse().find((m) => m.kind === 'reach')
  if (!opts.force && lastReach && Date.now() - +(lastReach.createdAt ?? 0) < REACH_EVERY_MS) return { said: false, why: 'too soon' }
  const told = new Set(thread.flatMap((m) => m.data?.refs ?? []))
  const since = new Date(Math.max(Date.now() - FIRST_WINDOW_MS, +(lastReach?.createdAt ?? 0) - 3600_000))

  const [inputs, areas, topics, reads, owner] = await Promise.all([
    gatherInputs(ownerId, since),
    gatherAreas(ownerId, new Date(Date.now() - 30 * 86400_000)),
    listTopics(ownerId),
    db.query.kanwatchReads.findMany({
      where: and(eq(kanwatchReads.userId, ownerId), gt(kanwatchReads.lastSeenAt, since), isNotNull(kanwatchReads.tldr)),
      orderBy: [desc(kanwatchReads.lastSeenAt)],
      limit: 30,
      columns: { id: true, url: true, title: true, domain: true, text: true, tldr: true, why: true, nudge: true, worth: true, aboutWork: true, kanthinkFit: true, appIdea: true, seconds: true, manual: true, verdict: true },
    }),
    db.query.users.findFirst({ where: eq(users.id, ownerId), columns: { name: true } }),
  ])
  const handsOff = topics.filter((t) => t.role === 'hands_off')
  const fresh = reads
    .filter((r) => r.verdict !== 'dismissed' && !told.has(`read:${r.id}`) && !handsOff.some((t) => isAbout(`${r.title}`, t.name)))
    .sort((a, b) => (Math.max(b.worth ?? 0, b.appIdea ?? 0, b.kanthinkFit ?? 0) + (b.manual ? 30 : 0)) - (Math.max(a.worth ?? 0, a.appIdea ?? 0, a.kanthinkFit ?? 0) + (a.manual ? 30 : 0)))
  const shares = inputs.filter((i) => i.kind === 'share' && !told.has(i.id))
  if (!fresh.length && !shares.length) return { said: false, why: 'nothing new' }

  const { keys } = await resolveProviderKeys(ownerId)
  const provider = keys.anthropic ? 'anthropic' : keys.openai ? 'openai' : null
  if (!provider) return { said: false, why: 'no key' }
  const model = getPlaygroundModel(provider === 'anthropic' ? 'claude-opus-5-5' : 'gpt-5.6-sol')
  const apiKey = provider === 'anthropic' ? keys.anthropic!.apiKey : keys.openai!.apiKey

  const first = owner?.name?.split(/\s+/)[0] ?? 'them'
  const system = `You are Kan, ${first}'s assistant inside Kanthink, writing first in your ongoing chat with them. You can see what they read (Kanwatch picked out pages worth a look) and what they shared to you.

Your job is to make that reading pay off. Pick the one thing (two at most, if they connect) most worth their attention, and say something they'd be glad to hear:
- The specific idea, technique, number, quote or example from the page itself, not a summary of its title. If the page text is there, use it.
- Why it matters to something they're actually working on, named (their channels and topics below). Connections across pages are the best thing you can offer.
- Then what you could do about it, concretely, as the suggestions: a card with the actual steps in a named channel, a small app to try the idea, a comparison with what they already have, a bot to keep watching it, a short draft. Things you can really do.

Rules:
- Talk like a sharp friend who read it too. Plain words, first person, no hype, no "Great find!".
- Never talk about filing, organizing, sorting or folders.
- Don't repeat what you already told them in the thread below.
- Topics they said Kan only knows about: ideas welcome, never offer to build or run it for them. Topics marked leave alone: never mention.
- If nothing is genuinely worth it, set say to false.`

  const user = [
    `What they're working on (their channels):\n${areas.filter((a) => !a.fixed || a.recentActivity).slice(0, 40).map((a) => `- ${a.name}${a.description ? `: ${clip(a.description, 140)}` : ''}${a.recentActivity ? ` (busy: ${a.recentActivity} recent changes)` : ''}`).join('\n')}`,
    topics.length ? `What they told you about projects in their life:\n${describeTopics(topics)}` : '',
    inputs.filter((i) => i.kind === 'browsing').slice(0, 2).map((i) => `Their browsing lately: ${i.text}`).join('\n'),
    fresh.length ? `Pages they read, best first:\n${fresh.slice(0, 8).map((r, i) => [
      `[read:${r.id}] "${r.title}" (${r.domain}, ${Math.round((r.seconds ?? 0) / 60)} min${r.manual ? ', they asked you to read it' : ''}${r.verdict === 'saved' ? ', they saved it' : ''})`,
      `  TL;DR: ${clip(r.tldr, 400)}`,
      r.why ? `  Why it seemed worth it: ${clip(r.why, 200)}` : '',
      i < 3 && r.text ? `  From the page: ${clip(r.text, PAGE_CHARS)}` : '',
    ].filter(Boolean).join('\n')).join('\n\n')}` : '',
    shares.length ? `What they shared to you:\n${shares.slice(0, 6).map((s) => `[${s.id}] ${s.text}`).join('\n')}` : '',
    `The thread so far (latest last):\n${thread.slice(-12).map((m) => `${m.role === 'you' ? first : 'Kan'}: ${clip(m.text, 300)}`).join('\n') || '(nothing yet)'}`,
  ].filter(Boolean).join('\n\n')

  const r = await runStructured({
    model, apiKey, systemInstruction: system, userText: user, images: [],
    schema: SCHEMA, schemaName: 'kan_reach_out', maxOutputTokens: 4000, signal: AbortSignal.timeout(180_000),
  })
  if (keys[provider]!.source !== 'byok') await recordUsage(ownerId, 'kan-reach-out').catch(() => {})
  if (r.truncated || !r.text) return { said: false, why: 'incomplete' }
  const out = JSON.parse(r.text) as { say: boolean; text: string; refs: string[]; suggestions: { label: string; prompt: string }[] }
  if (!out.say || !out.text.trim()) return { said: false, why: 'nothing worth it' }

  const byId = new Map(fresh.map((x) => [`read:${x.id}`, x]))
  const refs = out.refs.filter((id) => byId.has(id) || shares.some((s) => s.id === id))
  await kanSays(ownerId, 'reach', out.text.trim(), {
    refs,
    links: refs.map((id) => byId.get(id)).filter((x) => x !== undefined).map((x) => ({ title: x.title ?? x.url, url: x.url })),
    suggestions: out.suggestions.slice(0, 3),
  })
  return { said: true }
}

/** A plan just landed: say so in the thread, with its cards to answer right there. */
export async function announcePlan(ownerId: string, passId: string, note: string) {
  const exists = await db.query.kanMessages.findFirst({ where: and(eq(kanMessages.ownerId, ownerId), eq(kanMessages.kind, 'plan')), orderBy: [desc(kanMessages.createdAt)], columns: { data: true } })
  if (exists?.data?.passId === passId) return
  await kanSays(ownerId, 'plan', note, { passId })
}
