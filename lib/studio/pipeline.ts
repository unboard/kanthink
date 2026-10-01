import { nanoid } from 'nanoid'
import { db } from '@/lib/db'
import { cards, playgroundApps, users } from '@/lib/db/schema'
import { and, asc, desc, eq } from 'drizzle-orm'
import { createPlaygroundAppRecord } from '@/lib/playground/appRecord'
import { publishDraft } from '@/lib/playground/appRelease'
import { syncAppPrice, validatePriceInput } from '@/lib/playground/appPricing'
import { columnFor, getStudio, type StudioRow, type StudioStage } from './setup'

/**
 * The moves a spark makes on its way to being sold: test page, drop, ship.
 *
 * Each one is a real change — a card moves column, an app row changes — and each
 * leaves a line on the card's thread saying what happened, so the board stays the
 * record of the work even when all of it was done by talking to Kan.
 */

export const baseUrl = () => process.env.NEXTAUTH_URL || 'https://kanthink.com'
export const playUrl = (token: string) => `${baseUrl()}/play/${token}`

type CardRow = typeof cards.$inferSelect

async function studioCard(userId: string, cardId: string): Promise<{ studio: StudioRow; card: CardRow }> {
  const studio = await getStudio(userId)
  if (!studio) throw new Error('You don’t have a Studio yet.')
  const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) })
  if (!card || card.channelId !== studio.channelId) throw new Error('That card isn’t in your Studio.')
  return { studio, card }
}

/** Move a card to a stage and add a line to its thread. */
export async function moveToStage(studio: StudioRow, card: CardRow, stage: StudioStage, note?: string) {
  const columnId = columnFor(studio, stage)
  // Top of the column, the way a card you just moved shows on the board.
  const first = await db.query.cards.findFirst({
    where: and(eq(cards.columnId, columnId), eq(cards.isArchived, false)),
    orderBy: [asc(cards.position)],
    columns: { position: true },
  })
  const messages = [...((card.messages || []) as unknown[])]
  if (note) messages.push({ id: nanoid(), type: 'ai_response', content: note, createdAt: new Date().toISOString() })
  await db.update(cards).set({
    columnId,
    position: (first?.position ?? 1) - 1,
    messages: messages as CardRow['messages'],
    updatedAt: new Date(),
  }).where(eq(cards.id, card.id))
}

/** The app hanging off a Studio card, newest first. */
export async function cardApp(cardId: string) {
  return (await db.query.playgroundApps.findFirst({
    where: and(eq(playgroundApps.cardId, cardId), eq(playgroundApps.isArchived, false)),
    orderBy: [desc(playgroundApps.updatedAt)],
  })) ?? null
}

export interface TestPageInput {
  userId: string
  cardId: string
  headline?: string
  pitch?: string
  priceLabel?: string
  bullets?: string[]
}

/**
 * Put up a test page for a spark: the card's app, in reserve mode, with a public
 * link. If the card already has one, its words are updated rather than a second
 * page being made — the link someone already shared keeps working.
 */
export async function startTestPage(input: TestPageInput) {
  const { studio, card } = await studioCard(input.userId, input.cardId)
  const page = {
    headline: (input.headline || card.title).trim().slice(0, 140),
    pitch: (input.pitch || card.summary || '').trim().slice(0, 600),
    priceLabel: (input.priceLabel || '').trim().slice(0, 40),
    bullets: (input.bullets || []).map((b) => b.trim()).filter(Boolean).slice(0, 4),
  }

  let app = await cardApp(card.id)
  if (app && app.publishedVersionId) throw new Error(`${app.title} is already live, so it doesn’t need a test page.`)
  if (!app) app = (await createPlaygroundAppRecord({ cardId: card.id, userId: input.userId, title: card.title })) ?? null
  if (!app) throw new Error('Couldn’t make the test page.')

  const token = app.shareToken || nanoid(16)
  await db.update(playgroundApps).set({
    title: card.title,
    tagline: page.headline,
    reserveMode: true,
    reservePage: page,
    isPublic: true,
    shareToken: token,
    // A test page is not a product yet, so it stays out of your public app list.
    listedInDirectory: false,
    updatedAt: new Date(),
  }).where(eq(playgroundApps.id, app.id))

  const url = playUrl(token)
  await moveToStage(studio, card, 'testing', `Test page is up: ${url}\n\n${page.priceLabel ? `Price shown: ${page.priceLabel}. ` : ''}Nobody is charged; reserving saves their email.`)
  return { appId: app.id, url, page }
}

/** Pass on a spark. The reason goes on the card, where the scout will see it next time. */
export async function dropSpark(userId: string, cardId: string, reason?: string) {
  const { studio, card } = await studioCard(userId, cardId)
  await moveToStage(studio, card, 'dropped', reason ? `Dropped: ${reason}` : 'Dropped.')
  return { title: card.title }
}

/** Parse "$9", "9", "$4.50 a month" into minor units and an interval. */
export function parsePrice(label?: string | null): { amount: number; interval: 'one_time' | 'month' | 'year' } | null {
  if (!label) return null
  const m = label.replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/)
  if (!m) return null
  const amount = Math.round(parseFloat(m[1]) * 100)
  const interval = /\b(month|monthly|mo)\b/i.test(label) ? 'month' : /\b(year|yearly|annual)\b/i.test(label) ? 'year' : 'one_time'
  return amount >= 50 ? { amount, interval } : null
}

/**
 * Ship it: publish the built app, take the test page down, switch on checkout at
 * the price, and move the card to Live. The follow-up crew picks up everyone who
 * reserved on its next pass — which the caller runs straight away.
 */
export async function shipApp(userId: string, cardId: string, priceLabel?: string) {
  const { studio, card } = await studioCard(userId, cardId)
  const app = await cardApp(card.id)
  if (!app) throw new Error(`${card.title} has no app yet. Build it first.`)
  if (!app.code?.trim()) throw new Error(`${card.title} hasn’t been built yet. Say “build it” first.`)

  const published = await publishDraft(app, userId)
  if (!published.ok) throw new Error(published.error)

  const label = priceLabel || app.reservePage?.priceLabel || null
  const price = parsePrice(label)
  let priced = false
  if (price) {
    try {
      const valid = validatePriceInput({ amount: price.amount, currency: 'usd', interval: price.interval })
      const fresh = (await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, app.id) }))!
      const { productId, priceId } = await syncAppPrice(fresh, valid)
      await db.update(playgroundApps).set({
        paywallEnabled: true,
        paywallMode: 'app',
        priceAmount: valid.amount,
        priceCurrency: valid.currency,
        priceInterval: valid.interval,
        stripeProductId: productId,
        stripePriceId: priceId,
      }).where(eq(playgroundApps.id, app.id))
      priced = true
    } catch (error) {
      console.error('[studio] price on ship failed:', error)
    }
  }

  const token = app.shareToken || nanoid(16)
  await db.update(playgroundApps).set({
    reserveMode: false,
    isPublic: true,
    shareToken: token,
    listedInDirectory: true,
    updatedAt: new Date(),
  }).where(eq(playgroundApps.id, app.id))

  const url = playUrl(token)
  await moveToStage(studio, card, 'live', `Shipped: ${url}${priced ? `\n\nCheckout is on at ${label}.` : label ? `\n\nCouldn’t set the price (${label}) — set it from the app’s Price tab.` : ''}`)
  return { appId: app.id, url, priced, priceLabel: label }
}

export async function publisherName(userId: string) {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { name: true, email: true } })
  return { name: u?.name || '', email: u?.email || '' }
}
