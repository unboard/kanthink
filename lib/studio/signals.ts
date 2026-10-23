import { db } from '@/lib/db'
import { cardRejections, cards, channels, columns, kanwatchReads, kanwatchSites, kanwatchVisits, tasks } from '@/lib/db/schema'
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import type { StudioRow } from './setup'

/**
 * What the spark engine knows about you: what you read, what you save, where your
 * hours go, what you're working on, and what you already said no to.
 *
 * Sparks used to come from searching the web for strangers' complaints, which made
 * every idea a generic small-business tool with no reason to be yours. They come from
 * here now — your own curiosity and expertise — so each one can say which of your
 * reads or saves set it off, and why you of all people should be the one to do it.
 *
 * Kanwatch reads are public pages only; privacy.js decided that before they were
 * stored. Nothing here widens it.
 */

export interface Signal {
  /** 'read' (Kanwatch), 'bookmark' (Kan Bookmarks), 'time' (where hours go), 'channel' (your boards). */
  kind: 'read' | 'bookmark' | 'time' | 'channel'
  label: string
  url?: string
  note?: string
  /** Minutes, for reads and time. */
  minutes?: number
}

export interface SparkSignals {
  signals: Signal[]
  /** Every Studio card so far, so nothing comes back twice. */
  history: { title: string; stage: string }[]
  /** What you said when you passed on one, newest first. */
  passes: string[]
  /** Lasting preferences from the brief's "Learned from conversations". */
  learned: string[]
}

const DAY = 24 * 3600 * 1000

/** Sites that say nothing about your interests: your own dev servers and plumbing. */
export function isNoiseDomain(domain: string): boolean {
  return /localhost|:\d+$|^\d+\.\d+\.\d+\.\d+|\.local(\.|$)|^accounts\.google|^mail\.google|^messages\.google/i.test(domain)
}

/** A card's first link, for bookmarks saved as "Including link: …". */
export function firstUrl(text: string): string | undefined {
  return text.match(/https?:\/\/[^\s"')\]>\\]+/)?.[0]
}

/** The "Learned from conversations:" lines at the end of the brief. */
export function learnedLines(brief: string | null | undefined): string[] {
  const text = brief || ''
  const at = text.search(/learned from conversations\s*:/i)
  if (at < 0) return []
  return text.slice(at).split('\n').slice(1).map((l) => l.replace(/^[\s*\-•]+/, '').trim()).filter(Boolean).slice(-20)
}

export async function gatherSignals(studio: StudioRow, now = new Date()): Promise<SparkSignals> {
  const userId = studio.userId
  const since = (days: number) => new Date(now.getTime() - days * DAY)

  const [reads, sites, purposes, saved, boards, studioCards, studioCols, rejections, brief] = await Promise.all([
    // What you actually spent time reading, best first. Dismissed reads are out.
    db.query.kanwatchReads.findMany({
      where: and(eq(kanwatchReads.userId, userId), gte(kanwatchReads.createdAt, since(30))),
      orderBy: [desc(kanwatchReads.createdAt)],
      limit: 200,
      // Never the page text: it's large, and the TL;DR is what the prompt uses.
      columns: { title: true, url: true, tldr: true, seconds: true, manual: true, verdict: true, worth: true, appIdea: true },
    }),
    // Where the hours go, as a picture of your expertise.
    db.select({
      domain: kanwatchVisits.domain,
      seconds: sql<number>`sum(${kanwatchVisits.activeSeconds})`,
    })
      .from(kanwatchVisits)
      .where(and(
        eq(kanwatchVisits.userId, userId),
        gte(kanwatchVisits.startedAt, since(30)),
        eq(kanwatchVisits.isPrivate, false),
      ))
      .groupBy(kanwatchVisits.domain)
      .orderBy(desc(sql`sum(${kanwatchVisits.activeSeconds})`))
      .limit(40),
    db.query.kanwatchSites.findMany({ where: eq(kanwatchSites.userId, userId) }),
    // Everything you saved, newest first.
    db.select({ title: cards.title, summary: cards.summary, messages: cards.messages, createdAt: cards.createdAt })
      .from(cards)
      .innerJoin(channels, eq(channels.id, cards.channelId))
      .where(and(eq(channels.ownerId, userId), eq(channels.isQuickSave, true), eq(cards.isArchived, false)))
      .orderBy(desc(cards.createdAt))
      .limit(60),
    db.query.channels.findMany({
      where: and(eq(channels.ownerId, userId), eq(channels.status, 'active')),
      columns: { id: true, name: true, description: true, isQuickSave: true },
    }),
    db.query.cards.findMany({ where: eq(cards.channelId, studio.channelId), columns: { title: true, columnId: true } }),
    db.query.columns.findMany({ where: eq(columns.channelId, studio.channelId), columns: { id: true, name: true } }),
    db.query.cardRejections.findMany({
      where: eq(cardRejections.channelId, studio.channelId),
      orderBy: [desc(cardRejections.createdAt)],
      limit: 40,
    }),
    db.query.channels.findFirst({ where: eq(channels.id, studio.channelId), columns: { aiInstructions: true } }),
  ])

  const signals: Signal[] = []

  const rankedReads = reads
    .filter((r) => r.verdict !== 'dismissed')
    .map((r) => ({ r, score: (r.manual ? 60 : 0) + (r.verdict === 'saved' ? 40 : 0) + (r.worth ?? 0) + (r.appIdea ?? 0) + Math.min(30, r.seconds / 20) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
  for (const { r } of rankedReads) {
    signals.push({ kind: 'read', label: r.title || r.url, url: r.url, note: r.tldr || undefined, minutes: Math.round(r.seconds / 60) })
  }

  for (const b of saved) {
    const text = ((b.messages || []) as { content?: string }[]).map((m) => m.content || '').join('\n')
    const url = firstUrl(text)
    const label = (b.title || '').replace(/^Including link:\s*/i, '').trim()
    if (!label && !url) continue
    signals.push({ kind: 'bookmark', label: label || url!, url, note: b.summary || undefined })
  }

  const purposeOf = new Map(purposes.map((p) => [p.domain, p]))
  for (const s of sites) {
    if (!s.domain || isNoiseDomain(s.domain)) continue
    const minutes = Math.round(Number(s.seconds) / 60)
    if (minutes < 20) continue
    const p = purposeOf.get(s.domain)
    signals.push({ kind: 'time', label: s.domain, minutes, note: p?.purpose || undefined })
  }

  for (const c of boards) {
    if (c.isQuickSave || c.id === studio.channelId) continue
    signals.push({ kind: 'channel', label: c.name, note: c.description || undefined })
  }

  const colName = new Map(studioCols.map((c) => [c.id, c.name]))
  return {
    signals,
    history: studioCards.map((c) => ({ title: c.title, stage: colName.get(c.columnId) ?? '?' })),
    passes: rejections.map((r) => [r.cardTitle, r.feedback || r.reason].filter(Boolean).join(': ')).filter(Boolean),
    learned: learnedLines(brief?.aiInstructions),
  }
}

/** The signals as the prompt sees them, each with an id the model cites back. */
export function formatSignals(s: SparkSignals): { text: string; byId: Map<string, Signal> } {
  const byId = new Map<string, Signal>()
  const section = (kind: Signal['kind'], heading: string, prefix: string) => {
    const lines = s.signals.filter((x) => x.kind === kind).map((x, i) => {
      const id = `${prefix}${i + 1}`
      byId.set(id, x)
      const bits = [x.label.slice(0, 200), x.minutes ? `${x.minutes} min` : '', x.note ? `— ${x.note.slice(0, 240)}` : ''].filter(Boolean)
      return `[${id}] ${bits.join(' ')}`
    })
    return lines.length ? `${heading}\n${lines.join('\n')}` : ''
  }
  const text = [
    section('read', 'WHAT THEY READ (Kanwatch, last 30 days):', 'R'),
    section('bookmark', 'WHAT THEY SAVED (Kan Bookmarks):', 'B'),
    section('time', 'WHERE THEIR HOURS GO (last 30 days):', 'T'),
    section('channel', 'WHAT THEY ARE WORKING ON (their boards):', 'C'),
  ].filter(Boolean).join('\n\n')
  return { text, byId }
}

/** Tasks a spark card carries, so its next steps live on the card and not in a paragraph. */
export async function addSparkTasks(channelId: string, cardId: string, steps: string[]) {
  const now = new Date()
  const rows = steps.map((title, i) => ({
    id: crypto.randomUUID(),
    channelId,
    cardId,
    title: title.slice(0, 200),
    status: 'not_started' as const,
    position: i,
    createdAt: now,
    updatedAt: now,
  }))
  if (rows.length) await db.insert(tasks).values(rows)
  return rows.map((r) => r.id)
}

/** Open tasks on these cards, for the momentum pass. */
export async function openTasks(cardIds: string[]) {
  if (!cardIds.length) return []
  return db.query.tasks.findMany({
    where: and(inArray(tasks.cardId, cardIds), eq(tasks.isArchived, false)),
    columns: { id: true, cardId: true, title: true, status: true, position: true },
  })
}
