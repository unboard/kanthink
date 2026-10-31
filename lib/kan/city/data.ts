import { db } from '@/lib/db'
import {
  appOrders, appPurchases, appUsers, attentionPasses, botApprovals, botRuns, cards, channelActivityLog, channelBots, channels, columns, folders,
  instructionCards, instructionRuns, kanwatchEpisodes, playgroundApps, playgroundAppVersions, userChannelOrg, type AttentionDecisionJson,
} from '@/lib/db/schema'
import { and, desc, eq, gt, inArray, isNotNull, ne, sql } from 'drizzle-orm'
import { gatherAreas, gatherInputs, type InputItem } from '@/lib/kan/attention/inputs'
import { layoutCity, ARCHETYPE_LABEL } from '@/lib/kan/city/layout'
import { limitsFor, spentByOwner } from '@/lib/kan/bots/spend'
import { residentOf } from './residents'
import { parseStyle } from './style'

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
  kind: 'bot' | 'shroom' | 'app' | 'you' | 'kan' | 'ask' | 'in'
  channelId: string | null
  text: string
}

// What came in since Kan last looked. It reads chats, notes, shares and browsing,
// so it's cached for a minute rather than run on every poll.
const arrivalsCache = new Map<string, { at: number; since: number; items: InputItem[] }>()
async function arrivalsFor(userId: string, since: Date): Promise<InputItem[]> {
  const hit = arrivalsCache.get(userId)
  if (hit && hit.since === +since && Date.now() - hit.at < 60_000) return hit.items
  const items = await gatherInputs(userId, since).catch(() => [] as InputItem[])
  arrivalsCache.set(userId, { at: Date.now(), since: +since, items })
  return items
}

const ARRIVAL_WORD: Record<InputItem['kind'], string> = {
  share: 'You shared', chat: 'You asked Kan', voice: 'You told Kan', note: 'You noted', browsing: 'You spent time on', read: 'You read',
}

/** A moved plot's lot, honored only on the viewer's own channels. */
export function pinOf(bot: { plotPin?: string | null; ownerId?: string } | undefined, userId: string) {
  if (!bot?.plotPin || bot.ownerId !== userId) return null
  const [cx, cz] = bot.plotPin.split(',').map(Number)
  return Number.isInteger(cx) && Number.isInteger(cz) ? { cx, cz } : null
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
      // Chats aren't work: they'd fill the feed with "checked in". Their cost still counts toward spend.
      where: and(eq(botRuns.ownerId, userId), gt(botRuns.startedAt, new Date(now - 7 * 24 * HOUR)), ne(botRuns.trigger, 'chat')),
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
      columns: {
        id: true, channelId: true, title: true, buildProgress: true, updatedAt: true, shareToken: true, isPublic: true, isArchived: true,
        generationCount: true, tagline: true, summary: true, thumbnailUrl: true, viewCount: true, paywallEnabled: true, paywallMode: true,
        priceAmount: true, priceCurrency: true, priceInterval: true, reserveMode: true, reservePage: true, createdAt: true,
      },
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
  // Where your own attention went in the last day, as Kanwatch read it: only which
  // channel and for how long, never the pages. A guess counts when Jev was fairly
  // sure; what you corrected always wins, and anything you said wasn't work is out.
  const episodes = await db.query.kanwatchEpisodes.findMany({
    where: and(eq(kanwatchEpisodes.userId, userId), gt(kanwatchEpisodes.endedAt, dayAgo)),
    columns: { activeSeconds: true, guessChannelId: true, guessProbability: true, verdict: true, verdictChannelId: true, activityMode: true, verdictMode: true, endedAt: true },
  }).catch(() => [])
  const focus = new Map<string, { seconds: number; modes: Map<string, number>; last: number }>()
  for (const e of episodes) {
    if (e.verdict === 'not_work') continue
    const ch = e.verdictChannelId ?? ((e.guessProbability ?? 0) >= 55 ? e.guessChannelId : null)
    if (!ch || !ids.includes(ch)) continue
    const f = focus.get(ch) ?? { seconds: 0, modes: new Map(), last: 0 }
    f.seconds += e.activeSeconds ?? 0
    const mode = e.verdictMode ?? e.activityMode
    if (mode) f.modes.set(mode, (f.modes.get(mode) ?? 0) + (e.activeSeconds ?? 0))
    f.last = Math.max(f.last, +(e.endedAt ?? 0))
    focus.set(ch, f)
  }
  const focusOf = (id: string) => {
    const f = focus.get(id)
    if (!f || f.seconds < 120) return null
    const mode = [...f.modes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    return { minutes: Math.round(f.seconds / 60), mode, lastAt: f.last }
  }

  // The Strip: every app you've built, and what each one earns.
  const builtApps = apps.filter((a) => !a.isArchived && a.generationCount > 0)
  const appIds = builtApps.map((a) => a.id)
  const [purchases, orders, people] = appIds.length ? await Promise.all([
    db.query.appPurchases.findMany({ where: inArray(appPurchases.appId, appIds), columns: { appId: true, amount: true, status: true } }),
    db.query.appOrders.findMany({ where: inArray(appOrders.appId, appIds), columns: { appId: true, amount: true, status: true, isTest: true } }),
    db.select({ appId: appUsers.appId, n: sql<number>`count(*)` }).from(appUsers).where(inArray(appUsers.appId, appIds)).groupBy(appUsers.appId),
  ]) : [[], [], []]
  const earned = new Map<string, number>()
  for (const p of purchases) if (p.status === 'active' && p.amount) earned.set(p.appId, (earned.get(p.appId) ?? 0) + p.amount)
  for (const o of orders) if (!o.isTest && (o.status === 'paid' || o.status === 'fulfilled')) earned.set(o.appId, (earned.get(o.appId) ?? 0) + o.amount)
  const peopleOf = new Map(people.map((p) => [p.appId, Number(p.n)]))

  const made = await db.query.channels.findMany({ where: inArray(channels.id, ids), columns: { id: true, createdAt: true } })
  const madeAt = new Map(made.map((c) => [c.id, ms(c.createdAt)]))
  // Everything since the last pass Kan finished is new to it.
  const lastLook = passes.find((p) => p.status === 'done')
  const arrivals = await arrivalsFor(userId, lastLook?.startedAt ?? new Date(now - 3 * 24 * HOUR))

  const folderName = new Map(folderRows.map((f) => [f.id, f.name]))
  const folderOf = new Map(org.map((o) => [o.channelId, o.folderId ? folderName.get(o.folderId) ?? null : null]))
  const folderIdOf = new Map(org.map((o) => [o.channelId, o.folderId && folderName.has(o.folderId) ? o.folderId : null]))
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
    createdAt: madeAt.get(a.channelId) ?? null,
    isShareInbox: a.isShareInbox,
    isStudio: Boolean(a.fixed?.includes('Studio')),
    pin: pinOf(botOf.get(a.channelId), userId),
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
      kind: ARCHETYPE_LABEL[parseStyle(bot?.plotStyle).building ?? p.archetype],
      // Went up in the last three days: it wears a "New" badge and always says its name.
      isNew: (madeAt.get(p.channelId) ?? 0) > now - 3 * 24 * HOUR,
      folderId: folderIdOf.get(p.channelId) ?? null,
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
      // The mushroom who lives here: its name, voice and personality, for talking with it.
      resident: residentOf({ id: p.channelId, name: p.name }, bot),
      named: Boolean(bot?.name),
      createdAt: madeAt.get(p.channelId) ?? null,
      // Moved by the owner, so the layout keeps it where they put it.
      pinned: Boolean(pinOf(bot, userId)),
      // A look the owner asked Kan for: a theme, a kind of building, colors.
      style: parseStyle(bot?.plotStyle),
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
      // Your own time here in the last day, from Kanwatch.
      yourTime: focusOf(p.channelId),
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
  for (const [ch] of focus) {
    const f = focusOf(ch)
    if (f) feed.push({ at: f.lastAt, kind: 'you', channelId: ch, text: `You spent ${f.minutes >= 60 ? `${Math.floor(f.minutes / 60)}h ${f.minutes % 60}m` : `${f.minutes}m`}${f.mode ? ` (${f.mode})` : ''}` })
  }
  for (const a of arrivals.slice(0, 12)) feed.push({ at: +a.at, kind: 'in', channelId: a.channelId ?? null, text: `${ARRIVAL_WORD[a.kind]} ${clip(a.text, 110)}` })
  feed.sort((a, b) => b.at - a.at)

  // What got done in the last day, by bots and shrooms and you.
  const dayMs = +dayAgo
  const done = {
    bots: runs.filter((r) => +(r.startedAt ?? 0) > dayMs).reduce((n, r) => n + (r.steps ?? []).filter((s) => s.write && s.status === 'done').length, 0),
    shrooms: shroomRuns.filter((r) => +(r.timestamp ?? 0) > dayMs && !r.undone).reduce((n, r) => n + (Array.isArray(r.changes) ? r.changes.length : 0), 0),
    you: activity.filter((e) => +(e.createdAt ?? 0) > dayMs).length,
  }

  return {
    layout: { cols: layout.cols, rows: layout.rows, districts: layout.districts, townHall: layout.townHall, park: layout.park, free: layout.free, origin: layout.origin },
    plots,
    townHall: {
      approvals: pending.map((a) => ({ id: a.id, channelId: a.channelId, channelName: areaName.get(a.channelId) ?? '', title: a.title })),
      asks: plots.flatMap((p) => p.bot.asks.map((text) => ({ channelId: p.channelId, channelName: p.name, text }))),
      pass: pass ? { id: pass.id, note: decisions?.note ?? '', changes: (decisions?.areas ?? []).filter((a) => a.change !== 'keep').length, filings: decisions?.filings.length ?? 0, at: ms(pass.endedAt ?? pass.startedAt) } : null,
      passRunning,
    },
    proposals,
    // Neighborhoods are folders; bots help each other inside one and never outside it.
    neighborhoods: folderRows.map((f) => ({ id: f.id, name: f.name, plots: plots.filter((p) => p.folderId === f.id).length })),
    // New context waiting for Kan to sort into the city.
    arrivals: {
      count: arrivals.length,
      since: ms(lastLook?.startedAt),
      kinds: arrivals.reduce<Record<string, number>>((m, a) => ({ ...m, [a.kind]: (m[a.kind] ?? 0) + 1 }), {}),
      recent: arrivals.slice(0, 8).map((a) => ({ kind: a.kind, text: clip(a.text, 120), at: +a.at })),
    },
    feed: feed.slice(0, 80),
    // Money first: what earns gets the best lots on the Strip, then what's for sale, then
    // the rest, oldest first, so a lot only changes hands when the money does.
    apps: builtApps.map((a) => {
      const cents = earned.get(a.id) ?? 0
      const price = a.paywallEnabled && a.priceAmount ? `$${(a.priceAmount / 100).toFixed(a.priceAmount % 100 ? 2 : 0)}${a.priceInterval === 'month' ? '/mo' : a.priceInterval === 'year' ? '/yr' : ''}` : a.reserveMode ? a.reservePage?.priceLabel ?? 'Taking reservations' : null
      const tier = cents > 0 ? 'earning' as const : price ? 'selling' as const : 'free' as const
      return {
        id: a.id,
        channelId: a.channelId,
        title: clip(a.title, 40),
        tagline: clip(a.tagline || a.summary, 140) || null,
        thumbnail: a.thumbnailUrl,
        href: a.isPublic && a.shareToken ? `/play/${a.shareToken}` : `/play/preview/${a.id}`,
        isPublic: Boolean(a.isPublic),
        tier,
        price,
        earnedCents: cents,
        people: peopleOf.get(a.id) ?? 0,
        views: a.viewCount ?? 0,
        at: ms(a.createdAt),
      }
    }).sort((a, b) => ({ earning: 0, selling: 1, free: 2 }[a.tier] - { earning: 0, selling: 1, free: 2 }[b.tier]) || b.earnedCents - a.earnedCents || (a.at ?? 0) - (b.at ?? 0) || a.id.localeCompare(b.id)),
    yourDay: { minutes: [...focus.values()].reduce((n, f) => n + Math.round(f.seconds / 60), 0) },
    done,
    spend: { todayCents: Math.round(spent / 1000), dayCapCents: limits.dailyCapCents },
    names: Object.fromEntries(areaName),
  }
}
