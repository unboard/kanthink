import { render } from '@react-email/render'
import React from 'react'
import { db } from '@/lib/db'
import { appEmails, cards, channels, instructionCards, studioSettings, users } from '@/lib/db/schema'
import { isValidTimeZone, zoneDay, zoneParts } from '@/lib/time/zone'
import { scheduleNextRun } from '@/lib/automationSafeguards'
import type { ScheduledTrigger } from '@/lib/types'
import { and, eq, gte } from 'drizzle-orm'
import { sendTransactionalEmail } from '@/lib/customerio'
import { SparkEmail } from '@/lib/emails/SparkEmail'
import { getStudio, type StudioRow } from './setup'
import { pickSpark, plainForEmail, sparkBody, sparkMessage } from './spark'
import { runFollowUps } from './people'
import { baseUrl } from './pipeline'
import { lookInList, scoutFocus } from './scoutFocus'

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

/**
 * Make sure the scout has run today, and run it now if it hasn't. The scout's own
 * schedule should have taken care of it; this is the guarantee that a missed or
 * failed scheduled run never means a morning with nothing in it.
 */
async function ensureScoutRan(studio: StudioRow, now: Date): Promise<string> {
  if (!studio.scoutShroomId) return 'no scout'
  const row = await db.query.instructionCards.findFirst({ where: eq(instructionCards.id, studio.scoutShroomId) })
  if (!row || !row.isEnabled) return 'scout off'
  if (row.lastExecutedAt && now.getTime() - row.lastExecutedAt.getTime() < 20 * 3600e3) return 'already ran'
  const { rowToInstructionCard, runShroomServerSide } = await import('@/lib/shrooms/runServerSide')
  const instruction = rowToInstructionCard(row)
  const scheduled = (instruction.triggers ?? []).find((t) => t.type === 'scheduled') as ScheduledTrigger | undefined
  const result = await runShroomServerSide({
    instruction,
    triggerType: 'scheduled',
    nextScheduledRun: scheduled ? scheduleNextRun(scheduled, instruction.nextScheduledRun, await ownerZone(studio.userId), now) : undefined,
  })
  return `ran: ${result.status}${result.detail ? ` (${result.detail})` : ''}`
}

/** The once-a-day pass for one person. Returns what happened, for the cron's log. */
export async function runStudioMorning(studio: StudioRow, now = new Date()) {
  const result = { userId: studio.userId, scout: '', drafted: 0, sent: 0, sparkEmailed: false }

  // Marked first, so an hourly cron can't start a second morning while this one
  // is still waiting on the scout.
  await db.update(studioSettings).set({ lastMorningAt: now, updatedAt: now }).where(eq(studioSettings.userId, studio.userId))

  result.scout = await ensureScoutRan(studio, now).catch((e) => `failed: ${e instanceof Error ? e.message : e}`)

  // Point tomorrow's scout at the next three groups on the brief's "Look in:" line.
  if (studio.scoutShroomId) {
    const channel = await db.query.channels.findFirst({ where: eq(channels.id, studio.channelId), columns: { aiInstructions: true } })
    const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000)
    const focus = scoutFocus(lookInList(channel?.aiInstructions), tomorrow)
    await db.update(instructionCards).set({ webAccess: { mode: 'always', focus }, updatedAt: now }).where(eq(instructionCards.id, studio.scoutShroomId))
  }

  // Anything the scout wrote that hasn't been checked yet is checked before it's emailed.
  const { auditStudioSparks } = await import('./audit')
  await auditStudioSparks(studio, now).catch((e) => console.error('[studio] audit failed:', e))

  const followUps = await runFollowUps(studio.userId, { mode: studio.followUpMode === 'auto' ? 'auto' : 'ask', now })
  result.drafted = followUps.drafted
  result.sent = followUps.sent

  if (studio.sparkEmail && !(studio.lastSparkEmailAt && sameUtcDay(studio.lastSparkEmailAt, now))) {
    const card = pickSpark(await sparkCards(studio), studio.handledSparkIds ?? [], now)
    const owner = await db.query.users.findFirst({ where: eq(users.id, studio.userId), columns: { email: true } })
    if (card && owner?.email) {
      const waiting = await db.query.appEmails.findMany({
        where: and(eq(appEmails.ownerId, studio.userId), eq(appEmails.status, 'draft'), gte(appEmails.createdAt, new Date(now.getTime() - 36 * 3600 * 1000))),
        columns: { id: true },
      })
      const overnight = [
        followUps.sent ? `${followUps.sent} follow-up ${followUps.sent === 1 ? 'email' : 'emails'} went out` : '',
        waiting.length ? `${waiting.length} ${waiting.length === 1 ? 'email draft is' : 'email drafts are'} waiting in People` : '',
      ].filter(Boolean).join(', and ')
      const html = await render(React.createElement(SparkEmail, {
        title: card.title,
        body: plainForEmail(sparkBody(card)),
        overnight: overnight ? `${overnight}.` : undefined,
        homeUrl: `${baseUrl()}/`,
        settingsUrl: `${baseUrl()}/people?settings=1`,
      }))
      const ok = await sendTransactionalEmail({ to: owner.email, subject: `A spark: ${card.title}`, html })
      if (ok) {
        await db.update(studioSettings).set({ lastSparkEmailAt: now, updatedAt: now }).where(eq(studioSettings.userId, studio.userId))
        // Emailed once; tomorrow's email is about a different spark.
        await markSparkHandled(studio.userId, card.id)
        result.sparkEmailed = true
      }
    }
  }
  return result
}
