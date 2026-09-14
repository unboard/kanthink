import { db } from '@/lib/db'
import { appAiUsage, playgroundApps, users } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'

/**
 * What a published app is allowed to spend on AI, and stopping it when it has.
 *
 * A published app's AI calls run on the owner's key, authenticated by the app's own
 * token rather than a viewer session. There was no ceiling and no per-viewer limit:
 * an AI-flavoured app posted somewhere busy spent the owner's money once per
 * visitor, with nothing in the way.
 *
 * ## Why a ledger rather than a counter
 *
 * A counter has to be read, compared, and written. Ten visitors arriving together
 * all read the same remaining allowance, all decide they fit, and all spend it. The
 * gap between reading and writing is the bug, and no amount of care inside it helps.
 *
 * So there is no counter. A call inserts its own estimate as a row, under a WHERE
 * that fails if the estimate would not fit — one statement, evaluated by the
 * database, admission and record in the same write. Simultaneous callers contend on
 * the insert, and only as many as fit get rows.
 *
 * Money is held in **tenths of a cent**. A cheap text call costs a fraction of a
 * cent, and rounding each one up to a whole cent would overstate a busy app's spend
 * by an order of magnitude.
 */

export const MILLICENTS_PER_CENT = 10

/** Finite, and applied when nobody has chosen anything. Nothing here means unlimited. */
export const DEFAULT_APP_LIMIT_CENTS = 500          // $5 per app per month
export const DEFAULT_OWNER_LIMIT_CENTS = 2_000      // $20 across every app
export const DEFAULT_CUSTOMER_LIMIT_CENTS = 50      // 50c per identified customer

/** Windows are calendar months: a limit you cannot predict the reset of is not usable. */
export function currentPeriodKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

/** When the current window ends, so the UI can say when the allowance comes back. */
export function periodResetsAt(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
}

/**
 * What one call is expected to cost, in tenths of a cent.
 *
 * Deliberately an over-estimate. The reservation is what protects the ceiling, so
 * guessing low is the dangerous direction: a call that reserves less than it spends
 * lets the total drift past the limit. Settlement corrects it downward afterwards.
 */
export function estimateMillicents(kind: 'text' | 'image', maxOutputTokens = 4000): number {
  if (kind === 'image') {
    // Nano Banana is roughly 4c an image at the time of writing. Rounded up.
    return 50
  }
  // Frontier-ish text pricing, output-dominated, with the input assumed generous.
  // $12/1M output => 0.0012c per token => 0.012 millicents per token.
  const output = Math.ceil(maxOutputTokens * 0.012)
  const input = 5
  return Math.max(2, output + input)
}

/** Actual cost once the provider reports tokens. Same units. */
export function actualMillicents(
  kind: 'text' | 'image',
  usage?: { inputTokens?: number; outputTokens?: number } | null,
): number {
  if (kind === 'image') return 50
  if (!usage) return estimateMillicents('text')
  const input = (usage.inputTokens ?? 0) * 0.002
  const output = (usage.outputTokens ?? 0) * 0.012
  return Math.max(1, Math.ceil(input + output))
}

export interface BudgetSubject {
  appId: string
  ownerId: string
  kind: 'text' | 'image'
  model?: string | null
  isDraft?: boolean
  /** The identified customer, when there is one. */
  appUserId?: string | null
  /** A stable per-visitor key for anyone who has not identified themselves. */
  visitorKey?: string | null
  maxOutputTokens?: number
}

export type Denial =
  | { scope: 'app'; limitCents: number; spentCents: number }
  | { scope: 'owner'; limitCents: number; spentCents: number }
  | { scope: 'customer'; limitCents: number; spentCents: number }

export type Reservation =
  | { ok: true; id: string; reservedMillicents: number }
  | { ok: false; denial: Denial; resetsAt: Date }

interface Limits {
  appMillicents: number
  ownerMillicents: number
  customerMillicents: number
}

async function resolveLimits(appId: string, ownerId: string): Promise<Limits> {
  const [app, owner] = await Promise.all([
    db.query.playgroundApps.findFirst({
      where: eq(playgroundApps.id, appId),
      columns: { aiSpendLimitCents: true, aiCustomerLimitCents: true },
    }),
    db.query.users.findFirst({
      where: eq(users.id, ownerId),
      columns: { appAiSpendLimitCents: true, appAiDefaultLimitCents: true },
    }),
  ])

  const appCents = app?.aiSpendLimitCents
    ?? owner?.appAiDefaultLimitCents
    ?? DEFAULT_APP_LIMIT_CENTS
  const ownerCents = owner?.appAiSpendLimitCents ?? DEFAULT_OWNER_LIMIT_CENTS
  const customerCents = app?.aiCustomerLimitCents ?? DEFAULT_CUSTOMER_LIMIT_CENTS

  return {
    appMillicents: appCents * MILLICENTS_PER_CENT,
    ownerMillicents: ownerCents * MILLICENTS_PER_CENT,
    customerMillicents: customerCents * MILLICENTS_PER_CENT,
  }
}

/** Everything reserved or settled counts; only a released row is given back. */
const COUNTS = sql`status IN ('reserved','settled')`

async function spentMillicents(where: ReturnType<typeof sql>): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(COALESCE(actual_millicents, reserved_millicents)), 0)` })
    .from(appAiUsage)
    .where(where)
  return Number(row?.total ?? 0)
}

/**
 * Set budget aside for a call, or refuse it.
 *
 * The admission test and the record are one statement. Anything that reads a total
 * and then decides has a window in it, and that window is exactly how ten
 * simultaneous visitors each spend the last of an allowance.
 */
export async function reserve(subject: BudgetSubject): Promise<Reservation> {
  const period = currentPeriodKey()
  const limits = await resolveLimits(subject.appId, subject.ownerId)
  const cost = estimateMillicents(subject.kind, subject.maxOutputTokens)
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)

  // Per-customer first: it is the cheapest to check and the most specific refusal.
  const who = subject.appUserId
    ? sql`app_user_id = ${subject.appUserId}`
    : subject.visitorKey
      ? sql`visitor_key = ${subject.visitorKey}`
      : null

  const conditions: ReturnType<typeof sql>[] = [
    sql`(SELECT COALESCE(SUM(COALESCE(actual_millicents, reserved_millicents)), 0)
         FROM app_ai_usage
         WHERE app_id = ${subject.appId} AND period_key = ${period} AND ${COUNTS}
        ) + ${cost} <= ${limits.appMillicents}`,
    sql`(SELECT COALESCE(SUM(COALESCE(actual_millicents, reserved_millicents)), 0)
         FROM app_ai_usage
         WHERE owner_id = ${subject.ownerId} AND period_key = ${period} AND ${COUNTS}
        ) + ${cost} <= ${limits.ownerMillicents}`,
  ]
  if (who) {
    conditions.push(sql`(SELECT COALESCE(SUM(COALESCE(actual_millicents, reserved_millicents)), 0)
         FROM app_ai_usage
         WHERE app_id = ${subject.appId} AND ${who} AND period_key = ${period} AND ${COUNTS}
        ) + ${cost} <= ${limits.customerMillicents}`)
  }

  const guard = conditions.reduce((acc, c, i) => (i === 0 ? c : sql`${acc} AND ${c}`))

  // INSERT ... SELECT ... WHERE: the database evaluates the totals and the insert
  // together, so two callers cannot both pass the same check.
  const result = await db.run(sql`
    INSERT INTO app_ai_usage
      (id, app_id, owner_id, app_user_id, visitor_key, kind, model, is_draft,
       reserved_millicents, status, period_key, created_at)
    SELECT ${id}, ${subject.appId}, ${subject.ownerId}, ${subject.appUserId ?? null},
           ${subject.visitorKey ?? null}, ${subject.kind}, ${subject.model ?? null},
           ${subject.isDraft ? 1 : 0}, ${cost}, 'reserved', ${period}, ${now}
    WHERE ${guard}
  `)

  if (Number(result.rowsAffected ?? 0) > 0) {
    return { ok: true, id, reservedMillicents: cost }
  }

  // Refused. Work out which ceiling it hit, for a message worth reading.
  const [appSpent, ownerSpent, customerSpent] = await Promise.all([
    spentMillicents(sql`app_id = ${subject.appId} AND period_key = ${period} AND ${COUNTS}`),
    spentMillicents(sql`owner_id = ${subject.ownerId} AND period_key = ${period} AND ${COUNTS}`),
    who
      ? spentMillicents(sql`app_id = ${subject.appId} AND ${who} AND period_key = ${period} AND ${COUNTS}`)
      : Promise.resolve(0),
  ])

  const toCents = (m: number) => Math.round(m / MILLICENTS_PER_CENT)
  let denial: Denial
  if (who && customerSpent + cost > limits.customerMillicents) {
    denial = { scope: 'customer', limitCents: toCents(limits.customerMillicents), spentCents: toCents(customerSpent) }
  } else if (ownerSpent + cost > limits.ownerMillicents) {
    denial = { scope: 'owner', limitCents: toCents(limits.ownerMillicents), spentCents: toCents(ownerSpent) }
  } else {
    denial = { scope: 'app', limitCents: toCents(limits.appMillicents), spentCents: toCents(appSpent) }
  }

  return { ok: false, denial, resetsAt: periodResetsAt() }
}

/** The call finished and we know what it cost. */
export async function settle(
  reservationId: string,
  kind: 'text' | 'image',
  usage?: { inputTokens?: number; outputTokens?: number } | null,
): Promise<void> {
  await db.update(appAiUsage).set({
    actualMillicents: actualMillicents(kind, usage),
    status: 'settled',
    settledAt: new Date(),
  }).where(eq(appAiUsage.id, reservationId))
}

/**
 * The provider refused before doing any work, so the money was never spent.
 *
 * Only for outcomes that are certainly free — a validation error, a refusal, our own
 * bad request. Never for a timeout: a request that timed out may have completed and
 * been billed on the provider's side, and treating that as free is how a ceiling
 * quietly stops being one.
 */
export async function release(reservationId: string, reason: string): Promise<void> {
  await db.update(appAiUsage).set({
    status: 'released',
    note: reason,
    settledAt: new Date(),
  }).where(eq(appAiUsage.id, reservationId))
}

/**
 * The outcome is unknown — a timeout, a dropped connection, an error we cannot
 * classify. The reservation stands at its estimate and is marked so anyone reading
 * the ledger knows the figure is an assumption rather than a measurement.
 */
export async function assumeCharged(reservationId: string, reason: string): Promise<void> {
  await db.update(appAiUsage).set({
    status: 'settled',
    note: `assumed charged: ${reason}`,
    settledAt: new Date(),
  }).where(eq(appAiUsage.id, reservationId))
}

export interface SpendSummary {
  periodKey: string
  resetsAt: string
  app: { spentCents: number; limitCents: number; remainingCents: number }
  owner: { spentCents: number; limitCents: number; remainingCents: number }
  customerLimitCents: number
  calls: { text: number; image: number }
}

/** What the creator is shown. Figures are estimates until a call settles. */
export async function summarise(appId: string, ownerId: string): Promise<SpendSummary> {
  const period = currentPeriodKey()
  const limits = await resolveLimits(appId, ownerId)

  const [appSpent, ownerSpent, counts] = await Promise.all([
    spentMillicents(sql`app_id = ${appId} AND period_key = ${period} AND ${COUNTS}`),
    spentMillicents(sql`owner_id = ${ownerId} AND period_key = ${period} AND ${COUNTS}`),
    db.select({
      kind: appAiUsage.kind,
      n: sql<number>`COUNT(*)`,
    }).from(appAiUsage)
      .where(and(eq(appAiUsage.appId, appId), eq(appAiUsage.periodKey, period)))
      .groupBy(appAiUsage.kind),
  ])

  const toCents = (m: number) => Math.round(m / MILLICENTS_PER_CENT)
  const appLimit = toCents(limits.appMillicents)
  const ownerLimit = toCents(limits.ownerMillicents)

  return {
    periodKey: period,
    resetsAt: periodResetsAt().toISOString(),
    app: {
      spentCents: toCents(appSpent),
      limitCents: appLimit,
      remainingCents: Math.max(0, appLimit - toCents(appSpent)),
    },
    owner: {
      spentCents: toCents(ownerSpent),
      limitCents: ownerLimit,
      remainingCents: Math.max(0, ownerLimit - toCents(ownerSpent)),
    },
    customerLimitCents: toCents(limits.customerMillicents),
    calls: {
      text: Number(counts.find((c) => c.kind === 'text')?.n ?? 0),
      image: Number(counts.find((c) => c.kind === 'image')?.n ?? 0),
    },
  }
}

/** A sentence for whoever hit the wall, without leaking the owner's finances. */
export function denialMessage(denial: Denial, resetsAt: Date): string {
  const when = resetsAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
  if (denial.scope === 'customer') {
    return `You have used this app's AI allowance for now. It resets on ${when}. Everything you have already done is saved.`
  }
  return `This app has reached its AI budget for the month. It resets on ${when}. Nothing you have already done is lost.`
}
