import { db } from '@/lib/db'
import {
  cards, channelActivityLog, channelBots, channelChatThreads, channels, columns, instructionCards,
  kanwatchDays, kanwatchReads, operatorChatThreads, playgroundApps,
} from '@/lib/db/schema'
import { and, desc, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm'

/**
 * Everything new the owner gave Kan since a moment, and the areas it could go to.
 *
 * Input is what the owner did, never what Kan did: their side of every chat (typed
 * and voice), what they shared, notes they wrote on cards, what their browsing was
 * about (Kanwatch's day stories and the reads it judged worth a look), and where
 * on the board they were busy. Each item carries an id so a decision can point at it.
 *
 * Not readable yet: the /prototypes/kan agent's chat, which lives in the browser.
 */

export interface InputItem {
  id: string
  kind: 'chat' | 'voice' | 'share' | 'note' | 'browsing' | 'read'
  at: Date
  text: string
  /** Where it already lives, when it does. */
  channelId?: string
}

export interface Area {
  channelId: string
  name: string
  description: string
  columns: string[]
  cards: number
  /** Cards the owner made or moved here since the window began. */
  recentActivity: number
  lastActivityAt: Date | null
  apps: number
  shrooms: number
  attention: 'active' | 'quiet' | 'muted' | null
  botOn: boolean
  startedByKan: boolean
  /** Its structure is load-bearing elsewhere (Claude Code, the Studio pipeline, the share inbox). */
  fixed?: string
  isShareInbox: boolean
}

const WORK_CHANNEL_ID = '64eQst0Zx_iYYN4QJLWw3'
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const flat = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

export async function gatherInputs(ownerId: string, since: Date): Promise<InputItem[]> {
  const items: InputItem[] = []
  const sinceIso = since.toISOString()
  const owned = await db.query.channels.findMany({ where: eq(channels.ownerId, ownerId), columns: { id: true, isQuickSave: true } })
  const ownedIds = owned.map((c) => c.id)
  const inbox = owned.find((c) => c.isQuickSave)?.id

  const [operator, channelChat, touchedCards, shares, days, reads] = await Promise.all([
    db.query.operatorChatThreads.findMany({ where: and(eq(operatorChatThreads.userId, ownerId), gt(operatorChatThreads.updatedAt, since)), orderBy: [desc(operatorChatThreads.updatedAt)], limit: 40 }),
    db.query.channelChatThreads.findMany({ where: and(eq(channelChatThreads.userId, ownerId), gt(channelChatThreads.updatedAt, since)), orderBy: [desc(channelChatThreads.updatedAt)], limit: 40 }),
    ownedIds.length
      ? db.query.cards.findMany({
          where: and(inArray(cards.channelId, ownedIds), gt(cards.updatedAt, since)),
          orderBy: [desc(cards.updatedAt)],
          limit: 300,
          columns: { id: true, channelId: true, title: true, messages: true },
        })
      : Promise.resolve([]),
    inbox
      ? db.query.cards.findMany({
          where: and(eq(cards.channelId, inbox), gt(cards.createdAt, since)),
          orderBy: [desc(cards.createdAt)],
          limit: 60,
          columns: { id: true, title: true, messages: true, createdAt: true },
        })
      : Promise.resolve([]),
    db.query.kanwatchDays.findMany({ where: and(eq(kanwatchDays.userId, ownerId), gt(kanwatchDays.updatedAt, since)), orderBy: [desc(kanwatchDays.date)], limit: 14 }),
    db.query.kanwatchReads.findMany({
      where: and(eq(kanwatchReads.userId, ownerId), gt(kanwatchReads.lastSeenAt, since), isNotNull(kanwatchReads.tldr)),
      orderBy: [desc(kanwatchReads.lastSeenAt)],
      limit: 40,
      columns: { id: true, title: true, domain: true, tldr: true, worth: true, manual: true, verdict: true, seconds: true, lastSeenAt: true },
    }),
  ])

  // Their side of every conversation.
  for (const t of operator) {
    const voice = t.kind === 'voice' || (t.title ?? '').startsWith('🎙')
    for (const m of t.messages ?? []) {
      if (m.type !== 'question' || !m.createdAt || m.createdAt < sinceIso) continue
      items.push({ id: `chat:${t.id}:${m.id}`, kind: voice ? 'voice' : 'chat', at: new Date(m.createdAt), text: clip(flat(m.content), 400) })
    }
  }
  for (const t of channelChat) {
    for (const m of t.messages ?? []) {
      if (m.type !== 'question' || !m.createdAt || m.createdAt < sinceIso) continue
      items.push({ id: `chat:${t.id}:${m.id}`, kind: 'chat', at: new Date(m.createdAt), text: clip(flat(m.content), 400), channelId: t.channelId })
    }
  }

  // Notes they wrote on cards (not the share inbox: those are shares).
  for (const c of touchedCards) {
    if (c.channelId === inbox) continue
    for (const m of c.messages ?? []) {
      if (m.authorId !== ownerId || !m.createdAt || m.createdAt < sinceIso || m.type === 'ai_response') continue
      items.push({ id: `note:${c.id}:${m.id}`, kind: 'note', at: new Date(m.createdAt), text: clip(`On "${c.title}": ${flat(m.content)}`, 400), channelId: c.channelId })
    }
  }

  // What they shared to Kan: the page, and what they said about it.
  for (const s of shares) {
    const msgs = s.messages ?? []
    const page = flat(msgs[0]?.content)
    const said = msgs.filter((m) => m.authorId === ownerId).map((m) => flat(m.content)).join(' ')
    items.push({ id: `share:${s.id}`, kind: 'share', at: s.createdAt ?? new Date(), text: clip(`${s.title}${said ? ` — they said: "${said}"` : ''} · ${page}`, 400), channelId: inbox })
  }

  // Where their browsing went, as Kanwatch already summarized it.
  for (const d of days) {
    let story: { headline?: string; threads?: { title: string; detail: string }[] } | null = null
    try { story = d.story ? JSON.parse(d.story) : null } catch { story = null }
    const threads = (story?.threads ?? []).map((t) => `${t.title}: ${t.detail}`).join('; ')
    const text = [d.intention && `Said their priority was: ${d.intention}`, story?.headline, threads].filter(Boolean).join(' · ')
    if (text) items.push({ id: `day:${d.date}`, kind: 'browsing', at: d.updatedAt ?? new Date(), text: clip(`${d.date}: ${text}`, 700) })
  }
  for (const r of reads) {
    if (r.verdict === 'dismissed') continue
    items.push({
      id: `read:${r.id}`, kind: 'read', at: r.lastSeenAt ?? new Date(),
      text: clip(`${r.manual ? 'Asked Kan to read' : 'Read'} "${r.title}" (${r.domain}, ${Math.round((r.seconds ?? 0) / 60)} min${r.verdict === 'saved' ? ', saved it' : ''}): ${flat(r.tldr)}`, 400),
    })
  }

  return items.sort((a, b) => b.at.getTime() - a.at.getTime())
}

export async function gatherAreas(ownerId: string, since: Date): Promise<Area[]> {
  const chans = await db.query.channels.findMany({
    where: and(eq(channels.ownerId, ownerId), eq(channels.status, 'active'), eq(channels.isGlobalHelp, false)),
    columns: { id: true, name: true, description: true, isQuickSave: true, updatedAt: true },
  })
  const ids = chans.map((c) => c.id)
  if (!ids.length) return []
  const [cols, counts, activity, apps, shrooms, bots, studio] = await Promise.all([
    db.query.columns.findMany({ where: inArray(columns.channelId, ids), orderBy: [columns.position], columns: { channelId: true, name: true } }),
    db.select({ channelId: cards.channelId, n: sql<number>`count(*)`, last: sql<number>`max(${cards.updatedAt})` })
      .from(cards).where(and(inArray(cards.channelId, ids), eq(cards.isArchived, false))).groupBy(cards.channelId),
    db.select({ channelId: channelActivityLog.channelId, n: sql<number>`count(*)` })
      .from(channelActivityLog)
      // What they did by hand; card_updated is mostly automations rewriting cards.
      .where(and(
        inArray(channelActivityLog.channelId, ids), eq(channelActivityLog.userId, ownerId), gt(channelActivityLog.createdAt, since),
        inArray(channelActivityLog.action, ['card_created', 'card_moved', 'task_created', 'task_completed']),
      ))
      .groupBy(channelActivityLog.channelId),
    db.select({ channelId: playgroundApps.channelId, n: sql<number>`count(*)` }).from(playgroundApps).where(inArray(playgroundApps.channelId, ids)).groupBy(playgroundApps.channelId),
    db.select({ channelId: instructionCards.channelId, n: sql<number>`count(*)` }).from(instructionCards).where(inArray(instructionCards.channelId, ids)).groupBy(instructionCards.channelId),
    db.query.channelBots.findMany({ where: inArray(channelBots.channelId, ids) }),
    import('@/lib/studio/setup').then((m) => m.getStudio(ownerId)).catch(() => null),
  ])
  const colsOf = new Map<string, string[]>()
  for (const c of cols) colsOf.set(c.channelId, [...(colsOf.get(c.channelId) ?? []), c.name])
  const num = (rows: { channelId: string | null; n: number }[]) => new Map(rows.map((r) => [r.channelId, Number(r.n)]))
  const countOf = new Map(counts.map((c) => [c.channelId, c]))
  const actOf = num(activity)
  const appsOf = num(apps)
  const shroomsOf = num(shrooms)
  const botOf = new Map(bots.map((b) => [b.channelId, b]))
  const studioId = (studio as { channelId?: string } | null)?.channelId

  return chans.map((c) => {
    const bot = botOf.get(c.id)
    const last = countOf.get(c.id)?.last
    return {
      channelId: c.id,
      name: c.name,
      description: clip(flat(c.description), 240),
      columns: colsOf.get(c.id) ?? [],
      cards: Number(countOf.get(c.id)?.n ?? 0),
      recentActivity: actOf.get(c.id) ?? 0,
      lastActivityAt: last ? new Date(Number(last) * (Number(last) < 1e12 ? 1000 : 1)) : null,
      apps: appsOf.get(c.id) ?? 0,
      shrooms: shroomsOf.get(c.id) ?? 0,
      attention: bot?.attention ?? null,
      botOn: Boolean(bot?.enabled),
      startedByKan: Boolean(bot?.startedByKan),
      fixed: c.id === WORK_CHANNEL_ID ? 'Claude Code reads its columns by id'
        : c.id === studioId ? 'the Studio pipeline moves cards through its columns'
        : c.isQuickSave ? 'it is the inbox shares land in'
        : undefined,
      isShareInbox: Boolean(c.isQuickSave),
    }
  }).sort((a, b) => (b.lastActivityAt?.getTime() ?? 0) - (a.lastActivityAt?.getTime() ?? 0))
}
