import { db } from '@/lib/db'
import {
  attentionPasses, botRuns, cards, channelBots, channels, folders, instructionCards, instructionRuns,
  kanwatchEpisodes, kanwatchReads, playgroundApps, playgroundAppVersions, userChannelOrg,
} from '@/lib/db/schema'
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import { residentOf } from './residents'
import { listTopics, ROLE_LABEL } from '@/lib/kan/attention/topics'
import { claudePresence, type ClaudePresence } from './claude'

/**
 * Everyone who works for the owner, in one place: each channel's resident bot (its
 * job, its hours, what it did this week, what it keeps in its notes) and the staff
 * who don't live in a building — Kan, Jev, the app builder, Claude Code and the
 * shrooms. Read-only; acting on any of them happens where they live.
 */

const WEEK_MS = 7 * 86400_000
const WORK_CHANNEL_ID = '64eQst0Zx_iYYN4QJLWw3'
const WORK_DONE_COLUMN_ID = 'FaiL-RTAfoEUuyYwhLNAA'

const clip = (s: string | null | undefined, n: number) => {
  const t = (s ?? '').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}
const ms = (d: Date | null | undefined) => (d ? +d : null)

export interface CensusResident {
  channelId: string
  name: string
  personality: string
  channel: { name: string; purpose: string; job: string }
  neighborhood: string
  duty: { on: boolean; everyHours: number; budgetCents: number; lastRunAt: number | null; nextRunAt: number | null }
  attention: { level: 'active' | 'quiet' | 'muted' | null; why: string | null }
  startedByKan: boolean
  week: { runs: number; chats: number; changes: number; errors: number; spentCents: number }
  lastReport: { at: number; text: string; trigger: string } | null
  asks: string[]
  notes: string
  cards: number
  apps: { id: string; title: string }[]
  shrooms: { id: string; title: string; action: string; on: boolean; runsThisWeek: number }[]
}

export interface CensusStaff {
  key: 'kan' | 'jev' | 'builder' | 'claude' | 'shrooms'
  name: string
  role: string
  doing: string
  week: { label: string; value: number }[]
  details: string[]
  /** Claude Code only: whether a session is open on the owner's computer. */
  presence?: ClaudePresence
}

export async function censusFor(userId: string): Promise<{ residents: CensusResident[]; staff: CensusStaff[]; at: number }> {
  const since = new Date(Date.now() - WEEK_MS)
  const chans = await db.query.channels.findMany({
    where: and(eq(channels.ownerId, userId), eq(channels.status, 'active'), eq(channels.isGlobalHelp, false)),
    columns: { id: true, name: true, description: true, aiInstructions: true, isQuickSave: true },
  })
  const ids = chans.map((c) => c.id)
  const none = ids.length === 0

  const [bots, org, folderRows, runs, cardCounts, apps, shrooms, shroomRuns, versions, passes, judged, reads, workDone, topics] = await Promise.all([
    none ? [] : db.query.channelBots.findMany({ where: inArray(channelBots.channelId, ids) }),
    db.query.userChannelOrg.findMany({ where: eq(userChannelOrg.userId, userId), columns: { channelId: true, folderId: true } }),
    db.query.folders.findMany({ where: eq(folders.userId, userId), columns: { id: true, name: true } }),
    none ? [] : db.query.botRuns.findMany({
      where: and(inArray(botRuns.channelId, ids), gt(botRuns.startedAt, since)),
      orderBy: [desc(botRuns.startedAt)],
      columns: { channelId: true, trigger: true, status: true, summary: true, asks: true, steps: true, costMillicents: true, handoffs: true, startedAt: true, endedAt: true },
    }),
    none ? [] : db.select({ channelId: cards.channelId, n: sql<number>`count(*)` }).from(cards)
      .where(and(inArray(cards.channelId, ids), eq(cards.isArchived, false))).groupBy(cards.channelId),
    none ? [] : db.query.playgroundApps.findMany({ where: inArray(playgroundApps.channelId, ids), columns: { id: true, channelId: true, title: true } }),
    none ? [] : db.query.instructionCards.findMany({ where: inArray(instructionCards.channelId, ids), columns: { id: true, channelId: true, title: true, action: true, isEnabled: true } }),
    none ? [] : db.query.instructionRuns.findMany({ where: and(inArray(instructionRuns.channelId, ids), gt(instructionRuns.timestamp, since)), columns: { instructionId: true, undone: true } }),
    none ? [] : db.select({ n: sql<number>`count(*)` }).from(playgroundAppVersions)
      .innerJoin(playgroundApps, eq(playgroundApps.id, playgroundAppVersions.appId))
      .where(and(inArray(playgroundApps.channelId, ids), gt(playgroundAppVersions.publishedAt, since))),
    db.query.attentionPasses.findMany({ where: and(eq(attentionPasses.ownerId, userId), gt(attentionPasses.startedAt, since)), orderBy: [desc(attentionPasses.startedAt)], columns: { status: true, appliedAt: true, startedAt: true } }),
    db.select({ n: sql<number>`count(*)` }).from(kanwatchEpisodes).where(and(eq(kanwatchEpisodes.userId, userId), gt(kanwatchEpisodes.judgedAt, since))),
    db.select({ n: sql<number>`count(*)` }).from(kanwatchReads).where(and(eq(kanwatchReads.userId, userId), eq(kanwatchReads.status, 'judged'), gt(kanwatchReads.lastSeenAt, since))),
    // Cards that reached Completed this week; Claude Code moves them there by script, which logs no activity.
    ids.includes(WORK_CHANNEL_ID)
      ? db.select({ n: sql<number>`count(*)` }).from(cards).where(and(eq(cards.channelId, WORK_CHANNEL_ID), eq(cards.columnId, WORK_DONE_COLUMN_ID), gt(cards.updatedAt, since)))
      : Promise.resolve([{ n: 0 }]),
    listTopics(userId),
  ])
  const presence = await claudePresence(userId)

  const botOf = new Map(bots.map((b) => [b.channelId, b]))
  const folderName = new Map(folderRows.map((f) => [f.id, f.name]))
  const hoodOf = new Map(org.map((o) => [o.channelId, o.folderId ? folderName.get(o.folderId) ?? 'Downtown' : 'Downtown']))
  const cardsOf = new Map(cardCounts.map((c) => [c.channelId, Number(c.n)]))
  const shroomRunsOf = new Map<string, number>()
  for (const r of shroomRuns) if (!r.undone) shroomRunsOf.set(r.instructionId, (shroomRunsOf.get(r.instructionId) ?? 0) + 1)

  const residents: CensusResident[] = chans.filter((c) => c.name.trim() && !c.isQuickSave).map((c) => {
    const bot = botOf.get(c.id)
    const r = residentOf(c, bot)
    const mine = runs.filter((x) => x.channelId === c.id)
    const reports = mine.filter((x) => x.status !== 'running' && x.summary)
    const last = reports[0]
    return {
      channelId: c.id,
      name: r.name,
      personality: r.personality,
      channel: { name: c.name, purpose: clip(c.description, 400), job: clip(c.aiInstructions, 2000) },
      neighborhood: hoodOf.get(c.id) ?? 'Downtown',
      duty: {
        on: Boolean(bot?.enabled), everyHours: bot?.everyHours ?? 24, budgetCents: bot?.dailyBudgetCents ?? 200,
        lastRunAt: ms(bot?.lastRunAt), nextRunAt: bot?.enabled ? ms(bot?.nextRunAt) : null,
      },
      attention: { level: bot?.attention ?? null, why: bot?.attentionWhy ?? null },
      startedByKan: Boolean(bot?.startedByKan),
      week: {
        runs: mine.filter((x) => x.trigger !== 'chat' && x.trigger !== 'rehearsal').length,
        chats: mine.filter((x) => x.trigger === 'chat').length,
        changes: mine.reduce((n, x) => n + (x.steps ?? []).filter((s) => s.write && s.status === 'done').length, 0),
        errors: mine.filter((x) => x.status === 'error').length,
        spentCents: Math.round(mine.reduce((n, x) => n + (x.costMillicents ?? 0), 0) / 1000),
      },
      lastReport: last ? { at: +(last.endedAt ?? last.startedAt ?? 0), text: clip(last.summary, 600), trigger: last.trigger } : null,
      asks: [...new Set(mine.slice(0, 3).flatMap((x) => x.asks ?? []))].slice(0, 4),
      notes: clip(bot?.memory ? bot.memory.slice(-1500) : '', 1500),
      cards: cardsOf.get(c.id) ?? 0,
      apps: apps.filter((a) => a.channelId === c.id).map((a) => ({ id: a.id, title: a.title })),
      shrooms: shrooms.filter((s) => s.channelId === c.id).map((s) => ({ id: s.id, title: s.title, action: s.action, on: Boolean(s.isEnabled), runsThisWeek: shroomRunsOf.get(s.id) ?? 0 })),
    }
  })

  const done = passes.filter((p) => p.status === 'done')
  const builds = runs.filter((r) => r.trigger === 'build').length
  const handoffs = runs.reduce((n, r) => n + (r.handoffs ?? 0), 0)
  const shroomsOn = shrooms.filter((s) => s.isEnabled).length
  const shroomRunCount = shroomRuns.filter((r) => !r.undone).length

  const staff: CensusStaff[] = [
    {
      key: 'kan', name: 'Kan', role: 'Mayor',
      doing: 'Talks with you in the chat, reads everything you give it (chats, shares, notes, browsing), and keeps the city organized: what to start, quiet, wake or file. Nothing changes until you say so.',
      week: [{ label: 'looks over the city', value: done.length }, { label: 'plans carried out', value: done.filter((p) => p.appliedAt).length }],
      details: topics.length ? topics.map((t) => `${t.name}: ${ROLE_LABEL[t.role]}${t.note ? ` (“${clip(t.note, 120)}”)` : ''}`) : ['Hasn’t been told about any of your projects yet.'],
    },
    {
      key: 'jev', name: 'Jev', role: 'Judge',
      doing: 'Reads your Kanwatch browsing: what each stretch of time was for, which channel or card it belonged to, and which pages are worth a TL;DR. Kan builds on what Jev decides.',
      week: [{ label: 'stretches judged', value: Number(judged[0]?.n ?? 0) }, { label: 'pages read', value: Number(reads[0]?.n ?? 0) }],
      details: [],
    },
    {
      key: 'builder', name: 'The Builder', role: 'App maker',
      doing: 'Builds and updates the apps that hang off cards, whenever you, a bot or a shroom asks for one.',
      week: [{ label: 'versions published', value: Number(versions[0]?.n ?? 0) }, { label: 'builds for bots', value: builds }, { label: 'apps in all', value: apps.length }],
      details: [],
    },
    {
      key: 'claude', name: 'Claude Code', role: 'Engineer, works remotely',
      doing: 'Doesn’t live in the city: it runs in a terminal on your computer, when a session is open. It works the Work channel (code changes to Kanthink, deploys when you say so). Notes you leave it go to Work → Do these; an open session hears about them on its next turn, a closed one finds them when you ask it to look. Runs on your Claude plan, so it isn’t priced here.',
      week: [{ label: 'cards finished', value: Number(workDone[0]?.n ?? 0) }, { label: 'waiting in Do these', value: presence.waiting }, { label: 'handed over by bots', value: handoffs }],
      details: [],
      presence,
    },
    {
      key: 'shrooms', name: 'Shrooms', role: 'Automations',
      doing: 'Small automations that live in a channel: when something happens (or on a schedule) they generate, change, move or report on cards, or build an app.',
      week: [{ label: 'runs', value: shroomRunCount }, { label: 'switched on', value: shroomsOn }, { label: 'in all', value: shrooms.length }],
      details: [],
    },
  ]

  return { residents, staff, at: Date.now() }
}
