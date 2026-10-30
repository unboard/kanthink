import { db } from '@/lib/db'
import {
  attentionPasses, botApprovals, botRuns, cards, channelActivityLog, channelBots, columns, folders,
  instructionCards, instructionRuns, playgroundApps, playgroundAppVersions, userChannelOrg, type AttentionDecisionJson,
} from '@/lib/db/schema'
import { and, desc, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm'
import { gatherAreas } from '@/lib/kan/attention/inputs'
import { layoutCity, ARCHETYPE_LABEL } from '@/lib/kan/city/layout'
import { limitsFor, spentByOwner } from '@/lib/kan/bots/spend'

/**
 * Your channels as a city, and what's happening in it right now: which bots
 * are at work, which shrooms just ran, which apps are being built, what waits for
 * you at Town Hall, and the city feed. The page polls this; the scene only animates
 * what it's told.
 */

const HOUR = 3600_000
const clip = (s: string | null | undefined, n: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}
// The first sentence of a bot's report, for the feed.
const firstLine = (s: string | null | undefined) => clip((s ?? '').replace(/[#*_`>]/g, '').split(/(?<=[.!?])\s|\n/)[0], 140)
const ms = (d: Date | null | undefined) => (d ? +d : null)

export interface FeedItem {
  at: number
  kind: 'bot' | 'shroom' | 'app' | 'you' | 'kan' | 'ask'
  channelId: string | null
  text: string
}

export async function cityFor(userId: string) {
  const now = Date.now()
  const dayAgo = new Date(now - 24 * HOUR)
  const twoDaysAgo = new Date(now - 48 * HOUR)

  const areas = (await gatherAreas(userId, new Date(now - 14 * 24 * HOUR))).filter((a) => a.name.trim())
  const ids = areas.map((a) => a.channelId)
  if (!ids.length) return { empty: true as const }

  const [org, folderRows, bots, cols, colCounts, recentCards, runs, approvals, shroomRows, shroomRuns, apps, versions, activity, passes, limits, spent] = await Promise.all([
    db.query.userChannelOrg.findMany({ where: eq(userChannelOrg.userId, userId), columns: { channelId: true, folderId: true } }),
    db.query.folders.findMany({ where: eq(folders.userId, userId), columns: { id: true, name: true } }),
    db.query.channelBots.findMany({ where: inArray(channelBots.channelId, ids) }),
    db.query.columns.findMany({ where: inArray(columns.channelId, ids), orderBy: [columns.position], columns: { id: true, channelId: true, name: true } }),
    db.select({ columnId: cards.columnId, n: sql<number>`count(*)` }).from(cards)
      .where(and(inArray(cards.channelId, ids), eq(cards.isArchived, false))).groupBy(cards.columnId),
    db.query.cards.findMany({
      where: and(inArray(cards.channelId, ids), eq(cards.isArchived, false)),
      orderBy: [desc(cards.updatedAt)],
      limit: 500,
      columns: { id: true, channelId: true, columnId: true, title: true, updatedAt: true, source: true },
    }),
    db.query.botRuns.findMany({
      where: and(eq(botRuns.ownerId, userId), gt(botRuns.startedAt, new Date(now - 7 * 24 * HOUR))),
      orderBy: [desc(botRuns.startedAt)],
      limit: 120,
      columns: { id: true, channelId: true, trigger: true, status: true, steps: true, summary: true, asks: true, costMillicents: true, startedAt: true, endedAt: true },
    }),
    db.query.botApprovals.findMany({
      where: eq(botApprovals.ownerId, userId),
      orderBy: [desc(botApprovals.createdAt)],
      limit: 40,
    }),
    db.query.instructionCards.findMany({
      where: inArray(instructionCards.channelId, ids),
      columns: { id: true, channelId: true, title: true, action: true, runMode: true, isEnabled: true, avatar: true },
    }),
    db.query.instructionRuns.findMany({
      where: and(inArray(instructionRuns.channelId, ids), gt(instructionRuns.timestamp, new Date(now - 7 * 24 * HOUR))),
      orderBy: [desc(instructionRuns.timestamp)],
      limit: 80,
      columns: { id: true, channelId: true, instructionId: true, instructionTitle: true, changes: true, timestamp: true, undone: true },
    }),
    db.query.playgroundApps.findMany({
      where: inArray(playgroundApps.channelId, ids),
      columns: { id: true, channelId: true, title: true, buildProgress: true, updatedAt: true, shareToken: true },
    }),
    db.query.playgroundAppVersions.findMany({
      where: gt(playgroundAppVersions.publishedAt, twoDaysAgo),
      orderBy: [desc(playgroundAppVersions.publishedAt)],
      limit: 30,
      columns: { appId: true, version: true, title: true, publishedAt: true },
    }),
    db.query.channelActivityLog.findMany({
      where: and(inArray(channelActivityLog.channelId, ids), eq(channelActivityLog.userId, userId), gt(channelActivityLog.createdAt, new Date(now - 7 * 24 * HOUR)),
        inArray(channelActivityLog.action, ['card_created', 'card_moved', 'task_completed'])),
      orderBy: [desc(channelActivityLog.createdAt)],
      limit: 60,
    }),
    db.query.attentionPasses.findMany({
      where: and(eq(attentionPasses.ownerId, userId), isNotNull(attentionPasses.startedAt)),
      orderBy: [desc(attentionPasses.startedAt)],
      limit: 3,
    }),
    limitsFor(userId),
    spentByOwner(userId, dayAgo),
  ])

  const folderName = new Map(folderRows.map((f) => [f.id, f.name]))
  const folderOf = new Map(org.map((o) => [o.channelId, o.folderId ? folderName.get(o.folderId) ?? null : null]))
  const botOf = new Map(bots.map((b) => [b.channelId, b]))
  const countOfCol = new Map(colCounts.map((c) => [c.columnId, Number(c.n)]))
  const colName = new Map(cols.map((c) => [c.id, c.name]))
  const areaName = new Map(areas.map((a) => [a.channelId, a.name]))

  const layout = layoutCity(areas.map((a) => ({
    channelId: a.channelId,
    name: a.name,
    description: a.description,
    district: folderOf.get(a.channelId) ?? null,
    cards: a.cards,
    lastActivityAt: ms(a.lastActivityAt),
    attention: a.attention,
    isShareInbox: a.isShareInbox,
    isStudio: Boolean(a.fixed?.includes('Studio')),
  })))

  // Who's at work right now. A run older than the function ceiling was cut off.
  const live = (r: { status: string; startedAt: Date | null }) => r.status === 'running' && now - +(r.startedAt ?? 0) < 15 * 60_000
  const runningIn = new Map<string, (typeof runs)[number]>()
  const lastRunIn = new Map<string, (typeof runs)[number]>()
  for (const r of runs) {
    if (live(r) && !runningIn.has(r.channelId)) runningIn.set(r.channelId, r)
    if (r.trigger !== 'build' && r.status !== 'running' && !lastRunIn.has(r.channelId)) lastRunIn.set(r.channelId, r)
  }
  const pending = approvals.filter((a) => a.status === 'pending')
  const building = new Set(approvals.filter((a) => a.status === 'approved').map((a) => a.channelId))
  const appBuilding = new Map<string, string>()
  for (const a of apps) if (a.buildProgress && now - a.buildProgress.startedAt < 15 * 60_000) appBuilding.set(a.channelId, a.title)

  const shroomsIn = new Map<string, { id: string; title: string; action: string; automatic: boolean; lastRanAt: number | null }[]>()
  const shroomLast = new Map<string, number>()
  for (const r of shroomRuns) if (!shroomLast.has(r.instructionId)) shroomLast.set(r.instructionId, +(r.timestamp ?? 0))
  for (const s of shroomRows) {
    shroomsIn.set(s.channelId, [...(shroomsIn.get(s.channelId) ?? []), {
      id: s.id, title: s.title, action: s.action,
      automatic: s.runMode === 'automatic' && Boolean(s.isEnabled),
      lastRanAt: shroomLast.get(s.id) ?? null,
    }])
  }

  const cardsIn = new Map<string, typeof recentCards>()
  for (const c of recentCards) {
    const list = cardsIn.get(c.channelId) ?? []
    if (list.length < 5) cardsIn.set(c.channelId, [...list, c])
  }

  const plots = layout.plots.map((p) => {
    const a = areas.find((x) => x.channelId === p.channelId)!
    const bot = botOf.get(p.channelId)
    const run = runningIn.get(p.channelId)
    const last = lastRunIn.get(p.channelId)
    const asks = last && now - +(last.startedAt ?? 0) < 3 * 24 * HOUR ? (last.asks ?? []) : []
    const waiting = pending.filter((x) => x.channelId === p.channelId)
    return {
      ...p,
      kind: ARCHETYPE_LABEL[p.archetype],
      description: a.description,
      cards: a.cards,
      recentActivity: a.recentActivity,
      lastActivityAt: ms(a.lastActivityAt),
      apps: a.apps,
      attention: a.attention,
      attentionWhy: bot?.attentionWhy ?? null,
      startedByKan: a.startedByKan,
      fixed: a.fixed ?? null,
      columns: cols.filter((c) => c.channelId === p.channelId).map((c) => ({ name: c.name, cards: countOfCol.get(c.id) ?? 0 })),
      recentCards: (cardsIn.get(p.channelId) ?? []).map((c) => ({ id: c.id, title: clip(c.title, 90), column: colName.get(c.columnId) ?? '', at: ms(c.updatedAt), byKan: c.source === 'ai' })),
      shrooms: shroomsIn.get(p.channelId) ?? [],
      bot: {
        on: Boolean(bot?.enabled),
        everyHours: bot?.everyHours ?? 24,
        nextRunAt: ms(bot?.nextRunAt),
        lastRunAt: ms(bot?.lastRunAt),
        status: run ? 'working' as const
          : waiting.length || asks.length ? 'needs' as const
          : last?.status === 'over_budget' ? 'paused' as const
          : bot?.enabled ? 'idle' as const : 'off' as const,
        doing: run ? (run.steps?.filter((s) => s.status === 'running').at(-1)?.label ?? run.steps?.at(-1)?.label ?? 'Getting started') : null,
        lastSummary: last ? firstLine(last.summary) : null,
        asks,
      },
      building: appBuilding.get(p.channelId) ?? (building.has(p.channelId) ? 'an app you approved' : null),
      waiting: waiting.map((w) => ({ id: w.id, title: w.title })),
    }
  })

  // Town Hall: everything waiting on you.
  const pass = passes.find((p) => p.status === 'done' && !p.appliedAt) ?? null
  const passRunning = passes.some((p) => p.status === 'running' && now - +(p.startedAt ?? 0) < 15 * 60_000)
  const decisions = pass?.decisions as AttentionDecisionJson | null
  const proposals = (decisions?.areas ?? []).filter((a) => a.change === 'start').map((a, i) => ({
    name: a.name, why: a.why, columns: a.columns ?? [], lot: layout.free[i] ?? null,
  }))

  // The feed, newest first.
  const feed: FeedItem[] = []
  for (const r of runs) {
    if (r.trigger === 'build') {
      feed.push({ at: +(r.endedAt ?? r.startedAt ?? 0), kind: 'app', channelId: r.channelId, text: r.status === 'running' ? 'started building an app you approved' : r.status === 'done' ? 'finished building an app you approved' : 'couldn’t finish a build' })
      continue
    }
    if (r.status === 'running') feed.push({ at: +(r.startedAt ?? 0), kind: 'bot', channelId: r.channelId, text: 'went to work' })
    else if (r.status === 'over_budget') feed.push({ at: +(r.startedAt ?? 0), kind: 'bot', channelId: r.channelId, text: 'stayed home: out of budget' })
    else {
      const writes = (r.steps ?? []).filter((s) => s.write && s.status === 'done').length
      feed.push({ at: +(r.endedAt ?? r.startedAt ?? 0), kind: 'bot', channelId: r.channelId, text: firstLine(r.summary) || (writes ? `did ${writes} thing${writes === 1 ? '' : 's'}` : 'checked in') })
    }
    for (const ask of r.asks ?? []) feed.push({ at: +(r.endedAt ?? r.startedAt ?? 0) + 1, kind: 'ask', channelId: r.channelId, text: clip(ask, 140) })
  }
  for (const a of approvals) {
    feed.push({ at: +(a.createdAt ?? 0), kind: 'ask', channelId: a.channelId, text: `wants to build “${clip(a.title, 60)}”` })
    if (a.decidedAt) feed.push({ at: +a.decidedAt, kind: 'you', channelId: a.channelId, text: a.status === 'rejected' ? `You passed on “${clip(a.title, 60)}”` : `You approved “${clip(a.title, 60)}”` })
  }
  const shroomTitle = new Map(shroomRows.map((s) => [s.id, s.title]))
  for (const r of shroomRuns) {
    if (r.undone) continue
    const n = Array.isArray(r.changes) ? r.changes.length : 0
    feed.push({ at: +(r.timestamp ?? 0), kind: 'shroom', channelId: r.channelId, text: `${shroomTitle.get(r.instructionId) ?? r.instructionTitle} ran${n ? `: ${n} change${n === 1 ? '' : 's'}` : ''}` })
  }
  const appOf = new Map(apps.map((a) => [a.id, a]))
  for (const v of versions) {
    const app = appOf.get(v.appId)
    if (!app) continue
    feed.push({ at: +(v.publishedAt ?? 0), kind: 'app', channelId: app.channelId, text: `published ${clip(v.title || app.title, 60)} v${v.version}` })
  }
  for (const e of activity) {
    const title = clip(String((e.metadata as { title?: string } | null)?.title ?? 'a card'), 60)
    const to = colName.get(String((e.metadata as { toColumnId?: string } | null)?.toColumnId ?? ''))
    const text = e.action === 'card_created' ? `You added “${title}”`
      : e.action === 'task_completed' ? `You finished “${title}”`
      : to ? `You moved “${title}” to ${to}` : `You moved “${title}”`
    feed.push({ at: +(e.createdAt ?? 0), kind: 'you', channelId: e.channelId, text })
  }
  for (const p of passes) {
    if (p.status !== 'done') continue
    feed.push({ at: +(p.endedAt ?? p.startedAt ?? 0), kind: 'kan', channelId: null, text: 'Kan looked over everything you gave it' })
    if (p.appliedAt) feed.push({ at: +p.appliedAt, kind: 'kan', channelId: null, text: `Kan rearranged the city: ${(p.appliedLog ?? []).length} changes` })
  }
  feed.sort((a, b) => b.at - a.at)

  // What got done in the last day, by bots and shrooms and you.
  const dayMs = +dayAgo
  const done = {
    bots: runs.filter((r) => +(r.startedAt ?? 0) > dayMs).reduce((n, r) => n + (r.steps ?? []).filter((s) => s.write && s.status === 'done').length, 0),
    shrooms: shroomRuns.filter((r) => +(r.timestamp ?? 0) > dayMs && !r.undone).reduce((n, r) => n + (Array.isArray(r.changes) ? r.changes.length : 0), 0),
    you: activity.filter((e) => +(e.createdAt ?? 0) > dayMs).length,
  }

  return {
    layout: { cols: layout.cols, rows: layout.rows, districts: layout.districts, townHall: layout.townHall, park: layout.park, free: layout.free },
    plots,
    townHall: {
      approvals: pending.map((a) => ({ id: a.id, channelId: a.channelId, channelName: areaName.get(a.channelId) ?? '', title: a.title })),
      asks: plots.flatMap((p) => p.bot.asks.map((text) => ({ channelId: p.channelId, channelName: p.name, text }))),
      pass: pass ? { id: pass.id, note: decisions?.note ?? '', changes: (decisions?.areas ?? []).filter((a) => a.change !== 'keep').length, filings: decisions?.filings.length ?? 0, at: ms(pass.endedAt ?? pass.startedAt) } : null,
      passRunning,
    },
    proposals,
    feed: feed.slice(0, 80),
    done,
    spend: { todayCents: Math.round(spent / 1000), dayCapCents: limits.dailyCapCents },
    names: Object.fromEntries(areaName),
  }
}
