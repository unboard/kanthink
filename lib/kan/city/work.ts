import { db } from '@/lib/db'
import { cards, kanMessages, type BotStepJson } from '@/lib/db/schema'
import { and, desc, eq, gt, or } from 'drizzle-orm'
import type { ClaudePresence } from './claude'

/**
 * Work in flight, as the city shows it: what Kan handed to Claude Code and what the
 * bots are doing right now, each with where it's happening and the latest step, so
 * the map can draw a trail from Kan to the building doing the work and a bubble over
 * it that keeps you posted.
 *
 * Claude Code's side is read from its cards in Work: waiting in Do these, tagged
 * Processing while it works, tagged question when it needs you, moved to Completed
 * when it's done. Its notes on the card are the steps.
 */

const WORK_CHANNEL_ID = '64eQst0Zx_iYYN4QJLWw3'
const DO_THESE_COLUMN_ID = 'nRPnpAXt9pK2w_e4Iqicm'
const COMPLETED_COLUMN_ID = 'FaiL-RTAfoEUuyYwhLNAA'
const HOUR = 3600_000
/** A card waiting longer than this is backlog, not something just handed over. */
const FRESH_MS = 3 * 24 * HOUR
/** How long a finished job stays on the map. */
const DONE_MS = 6 * HOUR

export interface CityJob {
  id: string
  worker: 'claude' | 'bot'
  /** Who's doing it, as the city names them. */
  who: string
  title: string
  state: 'waiting' | 'working' | 'asking' | 'done' | 'failed'
  /** The latest step, in a line. */
  step: string | null
  /** The building it's happening in; null when that channel isn't on the map. */
  channelId: string | null
  /** Kan handed it over from its thread. */
  fromKan: boolean
  href: string | null
  at: number
}

const clip = (s: string | null | undefined, n: number) => {
  const t = (s ?? '').replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}
const firstLine = (s: string | null | undefined, n = 120) => clip((s ?? '').split('\n').find((l) => l.replace(/[#*_`>\s-]/g, '')) ?? '', n)
const hasTag = (tags: string[] | null | undefined, t: string) => (tags ?? []).some((x) => x.toLowerCase() === t.toLowerCase())

/** Cards Kan handed to Claude Code from its thread: the hand-off step links to the card. */
async function handedFromKan(ownerId: string): Promise<{ ids: Set<string>; titles: Set<string> }> {
  const rows = await db.query.kanMessages.findMany({
    where: and(eq(kanMessages.ownerId, ownerId), eq(kanMessages.role, 'kan'), gt(kanMessages.createdAt, new Date(Date.now() - 14 * 24 * HOUR))),
    orderBy: [desc(kanMessages.createdAt)],
    limit: 200,
    columns: { data: true },
  })
  const ids = new Set<string>()
  const titles = new Set<string>()
  for (const r of rows) {
    for (const s of r.data?.steps ?? []) {
      if (!s.label?.includes('to Claude Code')) continue
      const m = s.href?.match(/\/card\/([^/?#]+)/)
      if (m) ids.add(m[1])
      // Older hand-offs carry no link, only the title in quotes.
      const t = s.label.match(/[“"](.+)[”"]/)
      if (t) titles.add(t[1].trim().toLowerCase())
    }
  }
  return { ids, titles }
}

export async function claudeJobs(ownerId: string, presence: ClaudePresence | null, workOnMap: boolean): Promise<CityJob[]> {
  const now = Date.now()
  const [rows, fromKan] = await Promise.all([
    db.query.cards.findMany({
      where: and(
        eq(cards.channelId, WORK_CHANNEL_ID),
        eq(cards.isArchived, false),
        or(
          eq(cards.columnId, DO_THESE_COLUMN_ID),
          and(eq(cards.columnId, COMPLETED_COLUMN_ID), gt(cards.updatedAt, new Date(now - DONE_MS))),
        ),
      ),
      orderBy: [desc(cards.updatedAt)],
      limit: 40,
      columns: { id: true, title: true, columnId: true, tags: true, messages: true, createdAt: true, updatedAt: true },
    }),
    handedFromKan(ownerId),
  ])
  const jobs: CityJob[] = []
  for (const c of rows) {
    const done = c.columnId === COMPLETED_COLUMN_ID
    const working = hasTag(c.tags, 'Processing')
    const asking = hasTag(c.tags, 'question')
    const kan = fromKan.ids.has(c.id) || fromKan.titles.has(c.title.trim().toLowerCase())
    // Old backlog stays off the map unless Claude Code has it in hand.
    if (!done && !working && !asking && !kan && now - +(c.createdAt ?? 0) > FRESH_MS) continue
    const msgs = (c.messages ?? []) as { content?: string }[]
    // The first message is the brief; anything after it is Claude Code reporting back.
    const note = msgs.length > 1 ? msgs[msgs.length - 1] : null
    const state: CityJob['state'] = done ? 'done' : asking ? 'asking' : working ? 'working' : 'waiting'
    const live = presence?.state ?? 'offline'
    const step = note ? firstLine(note.content)
      : state === 'working' ? (live === 'working' ? 'On it right now' : 'Picked up, between turns')
      // Nothing starts a card by itself: a session has to look. Say which it is.
      : state === 'waiting' ? (live === 'offline' ? 'Starts when you run /kan in Claude Code' : 'Claude Code is open and hears about this on its next turn')
      : null
    jobs.push({
      id: `claude:${c.id}`, worker: 'claude', who: 'Claude Code', title: clip(c.title, 80), state, step,
      channelId: workOnMap ? WORK_CHANNEL_ID : null, fromKan: kan,
      href: `/channel/${WORK_CHANNEL_ID}/card/${c.id}`, at: +(c.updatedAt ?? c.createdAt ?? 0),
    })
  }
  // In hand first, then what needs you, then what's waiting, then what's done; newest first within each.
  const order = { working: 0, asking: 1, waiting: 2, done: 3, failed: 4 }
  return jobs.sort((a, b) => order[a.state] - order[b.state] || b.at - a.at).slice(0, 8)
}

/** A bot at work right now, or that just finished: its latest step is the trail. */
export function botJob(run: { id: string; channelId: string; trigger: string | null; status: string | null; steps: BotStepJson[] | null; summary: string | null; startedAt: Date | null; endedAt: Date | null }, who: string): CityJob | null {
  const now = Date.now()
  const running = run.status === 'running' && now - +(run.startedAt ?? 0) < HOUR
  const ended = +(run.endedAt ?? 0)
  // Only builds stay on the map once they're done; a routine check-in isn't news.
  const justBuilt = run.trigger === 'build' && !running && ended && now - ended < DONE_MS
  if (!running && !justBuilt) return null
  const last = [...(run.steps ?? [])].reverse().find((s) => s.label)
  const failed = !running && run.status !== 'done'
  return {
    id: `bot:${run.id}`, worker: 'bot', who,
    title: run.trigger === 'build' ? 'Building the app you approved' : 'Doing its rounds',
    state: running ? 'working' : failed ? 'failed' : 'done',
    step: running ? (last ? clip(last.label, 120) : 'Getting started') : firstLine(run.summary) || null,
    channelId: run.channelId, fromKan: false, href: last?.href ?? null,
    at: running ? +(run.startedAt ?? 0) : ended,
  }
}

/**
 * Kan, as the one keeping track: when something it handed to Claude Code is done or
 * needs an answer, it says so in its thread, once.
 */
export async function reportJobs(ownerId: string, jobs: CityJob[]): Promise<void> {
  const news = jobs.filter((j) => j.worker === 'claude' && j.fromKan && (j.state === 'done' || j.state === 'asking'))
  if (!news.length) return
  const recent = await db.query.kanMessages.findMany({
    where: and(eq(kanMessages.ownerId, ownerId), eq(kanMessages.kind, 'work')),
    orderBy: [desc(kanMessages.createdAt)],
    limit: 60,
    columns: { data: true },
  })
  const told = new Set(recent.flatMap((m) => m.data?.refs ?? []))
  const { kanSays } = await import('@/lib/kan/thread/store')
  for (const j of news) {
    const ref = `${j.id}:${j.state}`
    if (told.has(ref)) continue
    const text = j.state === 'done'
      ? `Claude Code finished **${j.title}**.${j.step ? `\n\n${j.step}` : ''}`
      : `Claude Code has a question on **${j.title}** before it can go on.${j.step ? `\n\n> ${j.step}` : ''}`
    await kanSays(ownerId, 'work', text, {
      refs: [ref],
      steps: j.href ? [{ label: j.state === 'done' ? `Open “${j.title}”` : 'Answer it on the card', write: false, href: j.href }] : undefined,
      suggestions: j.state === 'done'
        ? [{ label: 'What changed?', prompt: `What did Claude Code do on "${j.title}"? Read its notes on the card and tell me what I should try first.` }]
        : [{ label: 'Show me the question', prompt: `Claude Code asked a question on "${j.title}". Show me exactly what it asked so I can answer.` }],
    })
  }
}
