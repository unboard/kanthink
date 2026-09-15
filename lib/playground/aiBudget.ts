import { db } from '@/lib/db'
import { appAiUsage, playgroundApps, users } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import {
  MILLICENTS_PER_CENT,
  actualCostMillicents,
  maximumCostMillicents,
} from './aiPricing'

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
 * that fails if the estimate would not fit — admission and record in the same write.
 *
 * One statement is not enough on its own. Tested across ten independent connections,
 * three were admitted where one fit: the subquery inside the INSERT can read a
 * snapshot taken before another connection committed, so several callers each see
 * room that is already gone. It looked safe only because an earlier test shared a
 * single client, which serialised the writers for us.
 *
 * The insert therefore runs inside a write transaction, which takes the write lock
 * BEFORE the read rather than upgrading to it afterwards. Contenders then queue or
 * fail busy, and a busy one retries.
 *
 * Money is held in millicents — thousandths of a cent, as the name says. An earlier
 * version used the same name for tenths of a cent, which is the sort of mismatch
 * that survives right up until somebody does arithmetic with it.
 *
 * Cost comes from lib/playground/aiPricing, per model. A generic estimate is not a
 * reservation: it is a number in roughly the right area, and it stops being even
 * that the moment an app is switched to a dearer model.
 */

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

/** Re-exported so every caller reserves and settles through one module. */
export {
  MILLICENTS_PER_CENT,
  maximumCostMillicents,
  actualCostMillicents,
  isPriced,
  pricedModelIds,
  formatMillicents,
} from './aiPricing'

export interface BudgetSubject {
  appId: string
  ownerId: string
  kind: 'text' | 'image'
  isDraft?: boolean
  /** The identified customer, when there is one. */
  appUserId?: string | null
  /** A stable per-visitor key for anyone who has not identified themselves. */
  visitorKey?: string | null

  // What the maximum cost is computed from. All of it: a reservation made without
  // the model is a guess, and one made without the enforced output ceiling is a
  // guess about the expensive half.
  /** The model that will actually be called. Unpriced models are refused. */
  modelId: string
  /** Prompt plus system instruction, for sizing the input. */
  promptChars: number
  /** Images being sent in. */
  attachedImages?: number
  /** The ceiling the route will enforce on the response. */
  maxOutputTokens: number
  /** Images the call may produce. */
  imagesOut?: number
}

export type Denial =
  | { scope: 'app'; limitCents: number; spentCents: number }
  | { scope: 'owner'; limitCents: number; spentCents: number }
  | { scope: 'customer'; limitCents: number; spentCents: number }
  /** No price for that model, so no honest reservation can be made for it. */
  | { scope: 'unpriced'; modelId: string }

export type Reservation =
  | { ok: true; id: string; reservedMillicents: number }
  | { ok: false; denial: Denial; resetsAt: Date }

interface Limits {
  appMillicents: number
  ownerMillicents: number
  customerMillicents: number
}

export async function resolveLimits(appId: string, ownerId: string): Promise<Limits> {
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
/**
 * Admissions are serialised within this process before they reach the database.
 *
 * Two reasons. The connection is shared, and overlapping BEGIN/COMMIT pairs on one
 * connection interleave into each other — one transaction commits another's work,
 * or a lock is left standing. And admission is a single fast statement, so queueing
 * costs almost nothing while removing that whole class of failure.
 *
 * This does not replace the write transaction below. It orders the writers inside
 * one server; BEGIN IMMEDIATE is what orders them across separate instances.
 */
let admissions: Promise<unknown> = Promise.resolve()
function inTurn<T>(work: () => Promise<T>): Promise<T> {
  const next = admissions.then(work, work)
  admissions = next.then(() => undefined, () => undefined)
  return next
}
export async function reserve(subject: BudgetSubject): Promise<Reservation> {
  const period = currentPeriodKey()

  // Priced first. A model nobody has costed cannot be reserved for, and admitting
  // it on a generic figure would put an unknown amount on the owner's bill.
  const cost = maximumCostMillicents({
    modelId: subject.modelId,
    kind: subject.kind,
    promptChars: subject.promptChars,
    attachedImages: subject.attachedImages,
    maxOutputTokens: subject.maxOutputTokens,
    imagesOut: subject.imagesOut,
  })
  if (cost === null) {
    return {
      ok: false,
      denial: { scope: 'unpriced', modelId: subject.modelId },
      resetsAt: periodResetsAt(),
    }
  }

  const limits = await resolveLimits(subject.appId, subject.ownerId)
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)

  const who = whoClause(subject)
  const statement = admissionStatement(subject, cost, limits, period, id, now)

  // The write lock is taken before the totals are read, so a contender cannot base
  // its decision on a snapshot that another admission has already invalidated.
  // Busy means somebody else holds the lock right now, which is a reason to wait
  // rather than to refuse — refusing there would deny a request that fits.
  let admitted = false
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const result = await inTurn(() => db.transaction(async (tx) => tx.run(statement)))
      admitted = Number(result.rowsAffected ?? 0) > 0
      break
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/SQLITE_BUSY|database is locked|write conflict/i.test(message)) throw error
      // Jittered, so a burst does not retry in lockstep forever.
      await new Promise((r) => setTimeout(r, 10 * (attempt + 1) + Math.random() * 15))
    }
  }

  if (admitted) {
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
/**
 * The admission itself: one conditional insert whose WHERE clause re-reads every
 * ceiling. Exported so the guard can be exercised on connections other than the
 * app's own — a shared client serialises writers by itself, which makes a
 * single-client test pass for the wrong reason.
 */
/** Which customer this call belongs to, for the per-customer ceiling. */
function whoClause(subject: BudgetSubject) {
  return subject.appUserId
    ? sql`app_user_id = ${subject.appUserId}`
    : subject.visitorKey
      ? sql`visitor_key = ${subject.visitorKey}`
      : null
}

export function admissionStatement(
  subject: BudgetSubject,
  cost: number,
  limits: { appMillicents: number; ownerMillicents: number; customerMillicents: number },
  period: string,
  id: string,
  now: number,
) {
  // Per-customer first: it is the cheapest to check and the most specific refusal.
  const who = whoClause(subject)

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

  return sql`
    INSERT INTO app_ai_usage
      (id, app_id, owner_id, app_user_id, visitor_key, kind, model, is_draft,
       reserved_millicents, status, period_key, created_at)
    SELECT ${id}, ${subject.appId}, ${subject.ownerId}, ${subject.appUserId ?? null},
           ${subject.visitorKey ?? null}, ${subject.kind}, ${subject.modelId},
           ${subject.isDraft ? 1 : 0}, ${cost}, 'reserved', ${period}, ${now}
    WHERE ${guard}
  `
}
export async function settle(
  reservationId: string,
  kind: 'text' | 'image',
  modelId: string,
  usage?: { inputTokens?: number; outputTokens?: number } | null,
): Promise<void> {
  await db.update(appAiUsage).set({
    actualMillicents: actualCostMillicents(modelId, kind, usage),
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
  if (denial.scope === 'unpriced') {
    return `This app asked for a model we cannot price (${denial.modelId}), so the request was not sent. Ask for one of the supported models.`
  }
  const when = resetsAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
  if (denial.scope === 'customer') {
    return `You have used this app's AI allowance for now. It resets on ${when}. Everything you have already done is saved.`
  }
  return `This app has reached its AI budget for the month. It resets on ${when}. Nothing you have already done is lost.`
}
