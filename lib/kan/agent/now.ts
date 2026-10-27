import { db } from '@/lib/db'
import { appMessages, botApprovals, cards, channels, notifications, playgroundApps } from '@/lib/db/schema'
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { getStudio, columnFor } from '@/lib/studio/setup'

/**
 * What needs you, right now — the only thing the Kan agent puts on screen before
 * you say anything.
 *
 * The rule is the one the reimagine research landed on: home is what comes back.
 * People who wrote, work that finished, ideas waiting on a yes, what your saves add
 * up to. Never a count of things to clear, never everything at once. At most four,
 * each one a single tap that hands Kan the question you'd ask anyway.
 *
 * Straight from the database, no model: it has to be there the instant the page is.
 */

export interface NowItem {
  id: string
  /** Who or what it is about, in a few words. */
  title: string
  /** Why it is here. One line. */
  why: string
  /** What tapping it asks Kan. */
  prompt: string
}

const WORK_CHANNEL_ID = '64eQst0Zx_iYYN4QJLWw3'
const WORK_COMPLETED_COLUMN_ID = 'FaiL-RTAfoEUuyYwhLNAA'
const DAY = 24 * 3600 * 1000

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export async function gatherNow(userId: string, readable: string[], now = new Date()): Promise<NowItem[]> {
  const items: NowItem[] = []
  const inReach = readable.length ? readable : ['__none__']
  const workReadable = readable.includes(WORK_CHANNEL_ID)

  const [unreadPeople, workCards, studio, nudges, saves, asks] = await Promise.all([
    // People who wrote in your apps and haven't heard back.
    db.select({ appId: appMessages.appId, title: playgroundApps.title, n: sql<number>`count(*)` })
      .from(appMessages)
      .innerJoin(playgroundApps, eq(playgroundApps.id, appMessages.appId))
      .innerJoin(channels, eq(channels.id, playgroundApps.channelId))
      .where(and(eq(channels.ownerId, userId), eq(appMessages.sender, 'user'), eq(appMessages.isRead, false)))
      .groupBy(appMessages.appId, playgroundApps.title)
      .orderBy(desc(sql`count(*)`))
      .limit(3),
    workReadable
      ? db.query.cards.findMany({
          where: and(eq(cards.channelId, WORK_CHANNEL_ID), eq(cards.isArchived, false), gte(cards.updatedAt, new Date(now.getTime() - 3 * DAY))),
          columns: { id: true, title: true, tags: true, columnId: true, updatedAt: true },
          orderBy: [desc(cards.updatedAt)],
          limit: 60,
        })
      : Promise.resolve([]),
    getStudio(userId),
    db.query.notifications.findMany({
      where: and(eq(notifications.userId, userId), eq(notifications.type, 'studio_nudge'), eq(notifications.isRead, false)),
      orderBy: [desc(notifications.createdAt)],
      limit: 3,
      columns: { id: true, title: true, body: true },
    }),
    db.select({ n: sql<number>`count(*)` })
      .from(cards)
      .innerJoin(channels, eq(channels.id, cards.channelId))
      .where(and(eq(channels.ownerId, userId), eq(channels.isQuickSave, true), inArray(channels.id, inReach), gte(cards.createdAt, new Date(now.getTime() - 7 * DAY)))),
    // Builds your bots asked you to approve.
    db.select({ id: botApprovals.id, title: botApprovals.title, likely: botApprovals.likelyMillicents, bot: channels.name })
      .from(botApprovals)
      .innerJoin(channels, eq(channels.id, botApprovals.channelId))
      .where(and(eq(botApprovals.ownerId, userId), eq(botApprovals.status, 'pending')))
      .orderBy(desc(botApprovals.createdAt))
      .limit(5),
  ])

  // 1. People first. Someone waiting on you outranks anything Kan made.
  for (const p of unreadPeople.slice(0, 1)) {
    const n = Number(p.n)
    items.push({
      id: `people-${p.appId}`,
      title: p.title,
      why: `${plural(n, 'message')} from people using it`,
      prompt: `What are people saying in ${p.title}? Read me the unread messages and suggest replies.`,
    })
  }

  // 2. A bot waiting on your yes to spend money on a build.
  if (asks.length) {
    const a = asks[0]
    items.push({
      id: 'bot-approvals',
      title: asks.length === 1 ? `${a.bot} wants to build “${a.title}”` : `${asks.length} builds are waiting on you`,
      why: asks.length === 1 ? `About $${((a.likely ?? 0) / 100_000).toFixed(2)}. Nothing is built until you say so` : 'Your bots asked before spending on them',
      prompt: asks.length === 1 ? `${a.bot} wants to build "${a.title}". What is it for, and is it worth it?` : 'What do my bots want to build? Walk me through each one.',
    })
  }

  // 3. Claude Code: a question waiting on you, then what it finished.
  const asking = workCards.filter((c) => (c.tags ?? []).some((t) => t.toLowerCase() === 'question'))
  if (asking.length) {
    items.push({
      id: 'claude-question',
      title: asking.length === 1 ? asking[0].title : 'Claude Code has questions',
      why: asking.length === 1 ? 'Claude Code is waiting on your answer' : `${asking.length} cards are waiting on your answer`,
      prompt: `Claude Code has a question for me on ${asking.length === 1 ? `"${asking[0].title}"` : 'some Work cards'}. Show me what it asked.`,
    })
  }
  const finished = workCards.filter((c) => c.columnId === WORK_COMPLETED_COLUMN_ID && c.updatedAt && now.getTime() - c.updatedAt.getTime() < 2 * DAY)
  if (finished.length) {
    items.push({
      id: 'claude-finished',
      title: finished.length === 1 ? finished[0].title : `Claude Code finished ${finished.length} things`,
      why: 'Done in the last two days',
      prompt: 'What did Claude Code finish in the last two days? Anything I should check or deploy?',
    })
  }

  // 4. Ideas waiting on a yes, or moving and nudged.
  if (studio) {
    const sparks = await db.query.cards.findMany({
      where: and(eq(cards.channelId, studio.channelId), eq(cards.columnId, columnFor(studio, 'sparks')), eq(cards.isArchived, false)),
      columns: { id: true, title: true },
      orderBy: [desc(cards.createdAt)],
      limit: 5,
    })
    if (nudges.length) {
      const n = nudges[0]
      items.push({ id: `nudge-${n.id}`, title: n.title, why: n.body.slice(0, 90), prompt: `${n.title} — what's the move today? Help me do it.` })
    } else if (sparks.length) {
      items.push({
        id: 'sparks',
        title: sparks.length === 1 ? sparks[0].title : `${sparks.length} sparks waiting`,
        why: 'Money ideas from what you read and save',
        prompt: sparks.length === 1
          ? `Pitch me the "${sparks[0].title}" spark in two lines. Should I test it?`
          : 'Pitch me today\'s sparks in two lines each. Which one would you test first, and why?',
      })
    }
  }

  // 5. What your saves add up to. The curious one.
  const saved = Number(saves[0]?.n ?? 0)
  if (saved >= 3) {
    items.push({
      id: 'saves',
      title: `You saved ${saved} things this week`,
      why: 'Kan can tell you what they add up to',
      prompt: 'Look at what I saved this week. What do they add up to — is there a pattern, or something I should make?',
    })
  }

  return items.slice(0, 4)
}
