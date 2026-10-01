import { render } from '@react-email/render'
import React from 'react'
import { db } from '@/lib/db'
import { appEmails, cards, channels, instructionCards, studioSettings, users } from '@/lib/db/schema'
import { and, eq, gte } from 'drizzle-orm'
import { sendTransactionalEmail } from '@/lib/customerio'
import { SparkEmail } from '@/lib/emails/SparkEmail'
import { getStudio, type StudioRow } from './setup'
import { pickSpark, sparkBody, sparkMessage } from './spark'
import { runFollowUps } from './people'
import { baseUrl } from './pipeline'
import { focusFor, groupForDay, lookInList } from './scoutFocus'

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

/** The once-a-day pass for one person. Returns what happened, for the cron's log. */
export async function runStudioMorning(studio: StudioRow, now = new Date()) {
  const result = { userId: studio.userId, drafted: 0, sent: 0, sparkEmailed: false }

  // Point tomorrow's scout at the next group on the brief's "Look in:" line.
  if (studio.scoutShroomId) {
    const channel = await db.query.channels.findFirst({ where: eq(channels.id, studio.channelId), columns: { aiInstructions: true } })
    const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000)
    const focus = focusFor(groupForDay(lookInList(channel?.aiInstructions), tomorrow))
    await db.update(instructionCards).set({ webAccess: { mode: 'always', focus }, updatedAt: now }).where(eq(instructionCards.id, studio.scoutShroomId))
  }

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
        body: sparkBody(card),
        overnight: overnight ? `${overnight}.` : undefined,
        homeUrl: `${baseUrl()}/`,
        settingsUrl: `${baseUrl()}/people?settings=1`,
      }))
      const ok = await sendTransactionalEmail({ to: owner.email, subject: `A spark: ${card.title}`, html })
      if (ok) {
        await db.update(studioSettings).set({ lastSparkEmailAt: now, updatedAt: now }).where(eq(studioSettings.userId, studio.userId))
        result.sparkEmailed = true
      }
    }
  }
  return result
}
