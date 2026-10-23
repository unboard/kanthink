import { db } from '@/lib/db'
import { appUsers, cards } from '@/lib/db/schema'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { cardApp, playUrl } from './pipeline'
import { columnFor, type StudioRow } from './setup'
import { openTasks } from './signals'

/**
 * Keeping ideas alive.
 *
 * An approved spark used to get its test page and then nothing: no one shared the
 * link, no one looked at the numbers, and a week later it was a card nobody opened.
 * Each morning this looks at every idea that's moving and says the one thing that
 * would move it again — share the page (with the post already written), build it
 * because people reserved, ship it because it's built, or drop it to make room.
 *
 * Each nudge is said once. It lands in the card's thread, as a notification, and in
 * the morning email; the key on the thread message is what stops a repeat.
 */

const DAY = 24 * 3600 * 1000
/** Never more than this many a morning. A wall of nudges is a dashboard again. */
export const MAX_NUDGES = 3

export interface MomentumFacts {
  title: string
  stage: 'testing' | 'building' | 'ready'
  /** Days since the card last moved stage. */
  days: number
  views: number
  reserves: number
  /** The first move, if it's still open. */
  openFirstMove?: string
  shareWhere?: string
  nudged: Set<string>
}

export interface Nudge {
  key: string
  /** What needs saying, in Kan's voice. A share post is added separately. */
  text: string
  /** Wants a ready-to-post blurb attached. */
  withPost?: boolean
  /** Higher goes first when there are more than MAX_NUDGES. */
  weight: number
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The one thing worth saying about an idea this morning, if anything. */
export function decideNudge(f: MomentumFacts): Nudge | null {
  const once = (n: Nudge | null) => (n && !f.nudged.has(n.key) ? n : null)
  if (f.stage === 'ready') {
    return once(f.days >= 2 ? {
      key: 'ship',
      text: `**${f.title}** is built and waiting.${f.reserves ? ` ${plural(f.reserves, 'person', 'people')} reserved it and will get a launch email the moment you ship.` : ''} Say "ship it" and it goes live with checkout on.`,
      weight: 90,
    } : null)
  }
  if (f.stage !== 'testing') return null

  if (f.reserves >= 3) {
    return once({
      key: 'build',
      text: `${plural(f.reserves, 'person', 'people')} reserved **${f.title}**. That's a real signal. Say "build it" and Kan builds into the same app, so they become your first customers.`,
      weight: 100,
    })
  }
  if (f.reserves >= 1) {
    const first = once({
      key: 'first-reserve',
      text: `Someone reserved **${f.title}**${f.reserves > 1 ? ` (${f.reserves} so far)` : ''}. Interest is real; push it once more${f.shareWhere ? ` in ${f.shareWhere}` : ''} and see if it turns into three.`,
      withPost: true,
      weight: 80,
    })
    if (first) return first
  }
  if (f.reserves === 0 && f.days >= 21) {
    return once({
      key: 'decide',
      text: `Three weeks and nobody reserved **${f.title}** (${plural(f.views, 'view')}). Drop it to make room for the next one, or tell Kan what to change and give it one more week.`,
      weight: 60,
    })
  }
  if (f.reserves === 0 && f.days >= 7 && f.views >= 20) {
    return once({
      key: 'reword',
      text: `${f.views} people opened **${f.title}** and nobody reserved. They're curious but the promise or the price isn't landing. Tell Kan what to try: a sharper headline, a lower price, or the first one free.`,
      weight: 70,
    })
  }
  if (f.reserves === 0 && f.days >= 7 && f.views < 20) {
    return once({
      key: 'share-again',
      text: `**${f.title}** has had ${plural(f.views, 'view')} in a week. Ideas don't fail on a page nobody saw; share it somewhere new.`,
      withPost: true,
      weight: 65,
    })
  }
  if (f.days >= 1 && f.views < 5) {
    return once({
      key: 'share',
      text: `**${f.title}**'s test page is up but hasn't been seen yet.${f.openFirstMove ? ` Your first move is still open: ${f.openFirstMove}` : ''}`,
      withPost: true,
      weight: 75,
    })
  }
  return null
}

/** Nudge keys already said on a card. */
export function nudgedKeys(messages: unknown): Set<string> {
  const out = new Set<string>()
  for (const m of (Array.isArray(messages) ? messages : []) as { nudgeKey?: string }[]) if (m?.nudgeKey) out.add(m.nudgeKey)
  return out
}

/** When the card last moved stage: its newest message from Kan that isn't a nudge. */
export function stageSince(messages: unknown, fallback: Date): Date {
  let at = fallback.getTime()
  for (const m of (Array.isArray(messages) ? messages : []) as { type?: string; nudgeKey?: string; createdAt?: string }[]) {
    if (m?.type !== 'ai_response' || m.nudgeKey || !m.createdAt) continue
    const t = Date.parse(m.createdAt)
    if (!Number.isNaN(t) && t > at) at = t
  }
  return new Date(at)
}

/** The "Share the test page in:" line the spark engine wrote. */
export function shareWhereOf(messages: unknown): string | undefined {
  for (const m of (Array.isArray(messages) ? messages : []) as { content?: string }[]) {
    const hit = (m?.content || '').match(/\*\*Share the test page in:\*\*\s*(.+)/)
    if (hit) return hit[1].trim()
  }
  return undefined
}

async function writePost(userId: string, title: string, pitch: string, where: string | undefined, url: string): Promise<string> {
  const fallback = `${title}: ${pitch}\n\nI'm testing whether people want this before I build it. If you would, reserve a spot: ${url}`
  try {
    const { getLLMClientForUser } = await import('@/lib/ai/llm')
    const { client } = await getLLMClientForUser(userId, undefined, 'automations')
    if (!client) return fallback
    const res = await client.complete([{
      role: 'user',
      content: `Write a short post (under 80 words) the owner can paste${where ? ` into ${where}` : ''} to get people to look at a test page for something they haven't built yet. First person, honest that it's being tested, written for that place's audience, no hashtags, no hype, no exclamation marks. End with the link on its own line: ${url}\n\nWhat it is: ${title}. ${pitch}\n\nReply with the post only.`,
    }], { maxTokens: 2048 })
    const post = res.content.trim()
    return post.includes(url) ? post : `${post}\n\n${url}`
  } catch {
    return fallback
  }
}

/**
 * The morning's nudges: written to each card's thread and the owner's notifications.
 * Returns their text for the morning email.
 */
export async function runMomentum(studio: StudioRow, now = new Date()): Promise<{ cardId: string; text: string }[]> {
  const stageOf = new Map<string, MomentumFacts['stage']>([
    [columnFor(studio, 'testing'), 'testing'],
    [columnFor(studio, 'building'), 'building'],
    [columnFor(studio, 'ready'), 'ready'],
  ])
  const moving = await db.query.cards.findMany({
    where: and(eq(cards.channelId, studio.channelId), inArray(cards.columnId, [...stageOf.keys()]), eq(cards.isArchived, false)),
  })
  const allTasks = await openTasks(moving.map((c) => c.id))

  const candidates: { card: (typeof moving)[number]; nudge: Nudge; url?: string; pitch: string; shareWhere?: string }[] = []
  for (const card of moving) {
    const app = await cardApp(card.id)
    const reserves = app
      ? (await db.select({ id: appUsers.id }).from(appUsers).where(and(eq(appUsers.appId, app.id), isNotNull(appUsers.reservedAt)))).length
      : 0
    const first = allTasks.filter((t) => t.cardId === card.id).sort((a, b) => a.position - b.position)[0]
    const shareWhere = shareWhereOf(card.messages)
    const nudge = decideNudge({
      title: card.title,
      stage: stageOf.get(card.columnId)!,
      days: Math.floor((now.getTime() - stageSince(card.messages, card.createdAt ?? now).getTime()) / DAY),
      views: app?.viewCount ?? 0,
      reserves,
      openFirstMove: first && first.status !== 'done' ? first.title : undefined,
      shareWhere,
      nudged: nudgedKeys(card.messages),
    })
    if (!nudge) continue
    const page = app?.reservePage
    candidates.push({
      card,
      nudge,
      url: app?.shareToken ? playUrl(app.shareToken) : undefined,
      pitch: page?.pitch || card.summary || '',
      shareWhere,
    })
  }

  const chosen = candidates.sort((a, b) => b.nudge.weight - a.nudge.weight).slice(0, MAX_NUDGES)
  const { createNotification } = await import('@/lib/notifications/createNotification')
  const out: { cardId: string; text: string }[] = []
  for (const { card, nudge, url, pitch, shareWhere } of chosen) {
    let text = nudge.text
    if (nudge.withPost && url) {
      const post = await writePost(studio.userId, card.title, pitch, shareWhere, url)
      text += `\n\nHere's a post${shareWhere ? ` for ${shareWhere}` : ''}, ready to paste:\n\n> ${post.replace(/\n/g, '\n> ')}`
    }
    const messages = [...((card.messages || []) as unknown[]), {
      id: nanoid(), type: 'ai_response', content: text, nudgeKey: nudge.key, createdAt: now.toISOString(),
    }]
    await db.update(cards).set({ messages: messages as typeof card.messages, updatedAt: now }).where(eq(cards.id, card.id))
    await createNotification({
      userId: studio.userId,
      type: 'studio_nudge',
      title: card.title,
      body: nudge.text.replace(/\*\*/g, '').slice(0, 200),
      data: { channelId: studio.channelId, cardId: card.id },
    }).catch(() => {})
    out.push({ cardId: card.id, text: nudge.text.replace(/\*\*/g, '') })
  }
  return out
}
