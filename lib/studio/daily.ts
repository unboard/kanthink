import { render } from '@react-email/render'
import React from 'react'
import { db } from '@/lib/db'
import { appEmails, cards, instructionCards, studioSettings, users } from '@/lib/db/schema'
import { isValidTimeZone, zoneDay, zoneParts } from '@/lib/time/zone'
import { and, eq, gte } from 'drizzle-orm'
import { sendTransactionalEmail } from '@/lib/resend'
import { SparkEmail } from '@/lib/emails/SparkEmail'
import { getStudio, type StudioRow } from './setup'
import { pickSpark, plainForEmail, sparkBody, sparkMessage } from './spark'
import { runFollowUps } from './people'
import { baseUrl } from './pipeline'

/**
 * The morning: which spark is waiting, and the once-a-day pass that drafts
 * follow-ups and sends the spark email.
 */

async function sparkCards(studio: StudioRow) {
  return db.query.cards.findMany({
    where: and(eq(cards.channelId, studio.channelId), eq(cards.columnId, studio.sparksColumnId), eq(cards.isArchived, false)),
    columns: { id: true, title: true, summary: true, messages: true, createdAt: true, isArchived: true, isPendingReview: true },
  })
}

export async function todaysSpark(userId: string) {
  const studio = await getStudio(userId)
  if (!studio) return null
  const card = pickSpark(await sparkCards(studio), studio.handledSparkIds ?? [], new Date())
  if (!card) return null
  return {
    cardId: card.id,
    channelId: studio.channelId,
    title: card.title,
    message: sparkMessage(card),
  }
}

/** Mark a spark raised, so it never opens Home again. */
export async function markSparkHandled(userId: string, cardId: string) {
  const studio = await getStudio(userId)
  if (!studio) return
  const handled = [...new Set([...(studio.handledSparkIds ?? []), cardId])].slice(-200)
  await db.update(studioSettings).set({ handledSparkIds: handled, updatedAt: new Date() }).where(eq(studioSettings.userId, userId))
}

function sameUtcDay(a: Date, b: Date) {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
}

/** Hour of the owner's day the morning happens: after a 6 AM scout has had time to finish. */
const MORNING_HOUR = 7

async function ownerZone(userId: string): Promise<string | null> {
  const owner = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { timezone: true } })
  return owner?.timezone && isValidTimeZone(owner.timezone) ? owner.timezone : null
}

/**
 * Is it this Studio's morning, and hasn't it happened yet today?
 *
 * In the owner's timezone when we know it. Without one, the morning follows the
 * scout's own schedule: an hour after its slot, once a day.
 */
export async function morningDue(studio: StudioRow, now = new Date()): Promise<boolean> {
  const tz = await ownerZone(studio.userId)
  if (tz) {
    if (zoneParts(now, tz).hour < MORNING_HOUR) return false
    return !studio.lastMorningAt || zoneDay(studio.lastMorningAt, tz) !== zoneDay(now, tz)
  }
  if (studio.lastMorningAt && now.getTime() - studio.lastMorningAt.getTime() < 20 * 3600e3) return false
  const scout = studio.scoutShroomId
    ? await db.query.instructionCards.findFirst({ where: eq(instructionCards.id, studio.scoutShroomId), columns: { nextScheduledRun: true } })
    : null
  // The scout's slot today is its next run less a day, once that run has moved on.
  const next = scout?.nextScheduledRun ? new Date(scout.nextScheduledRun).getTime() : null
  if (!next) return true
  const slotToday = next > now.getTime() ? next - 24 * 3600e3 : next
  return now.getTime() >= slotToday + 3600e3
}

/** The once-a-day pass for one person. Returns what happened, for the cron's log. */
export async function runStudioMorning(studio: StudioRow, now = new Date()) {
  const result = { userId: studio.userId, scout: '', nudges: 0, drafted: 0, sent: 0, sparkEmailed: false }

  // Marked first, so an hourly cron can't start a second morning while this one
  // is still waiting on the scout.
  await db.update(studioSettings).set({ lastMorningAt: now, updatedAt: now }).where(eq(studioSettings.userId, studio.userId))

  // This morning's sparks, from what you've been reading, saving and working on.
  const { runSparkEngine } = await import('./sparkEngine')
  result.scout = await runSparkEngine(studio, now)
    .then((r) => `${r.created} spark(s): ${r.detail}`)
    .catch((e) => `failed: ${e instanceof Error ? e.message : e}`)

  // And the ideas already moving: the one thing that would move each of them again.
  const { runMomentum } = await import('./momentum')
  const nudges = await runMomentum(studio, now).catch((e) => {
    console.error('[studio] momentum failed:', e)
    return [] as { cardId: string; text: string }[]
  })
  result.nudges = nudges.length

  const followUps = await runFollowUps(studio.userId, { mode: studio.followUpMode === 'auto' ? 'auto' : 'ask', now })
  result.drafted = followUps.drafted
  result.sent = followUps.sent

  if (studio.sparkEmail && !(studio.lastSparkEmailAt && sameUtcDay(studio.lastSparkEmailAt, now))) {
    const card = pickSpark(await sparkCards(studio), studio.handledSparkIds ?? [], now)
    const owner = await db.query.users.findFirst({ where: eq(users.id, studio.userId), columns: { email: true } })
    if ((card || nudges.length) && owner?.email) {
      const waiting = await db.query.appEmails.findMany({
        where: and(eq(appEmails.ownerId, studio.userId), eq(appEmails.status, 'draft'), gte(appEmails.createdAt, new Date(now.getTime() - 36 * 3600 * 1000))),
        columns: { id: true },
      })
      const overnight = [
        followUps.sent ? `${followUps.sent} follow-up ${followUps.sent === 1 ? 'email' : 'emails'} went out` : '',
        waiting.length ? `${waiting.length} ${waiting.length === 1 ? 'email draft is' : 'email drafts are'} waiting in People` : '',
      ].filter(Boolean).join(', and ')
      const html = await render(React.createElement(SparkEmail, {
        title: card?.title,
        body: card ? plainForEmail(sparkBody(card)) : '',
        nudges: nudges.map((n) => n.text),
        overnight: overnight ? `${overnight}.` : undefined,
        homeUrl: `${baseUrl()}/`,
        settingsUrl: `${baseUrl()}/people?settings=1`,
      }))
      const subject = card ? `A spark: ${card.title}` : `Moving: ${nudges.length === 1 ? 'one idea needs you' : `${nudges.length} ideas need you`}`
      const ok = await sendTransactionalEmail({ to: owner.email, subject, html })
      if (ok) {
        await db.update(studioSettings).set({ lastSparkEmailAt: now, updatedAt: now }).where(eq(studioSettings.userId, studio.userId))
        // Emailed once; tomorrow's email is about a different spark.
        if (card) await markSparkHandled(studio.userId, card.id)
        result.sparkEmailed = true
      }
    }
  }
  return result
}
