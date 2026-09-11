import { db } from './db'
import { usageRecords, users } from './db/schema'
import { eq, and, gte, like } from 'drizzle-orm'
import { sendUsageLimitWarningEmail, sendUsageLimitReachedEmail } from './emails/send'

const FREE_MONTHLY_LIMIT = parseInt(process.env.FREE_MONTHLY_LIMIT || '10')
const PREMIUM_MONTHLY_LIMIT = parseInt(process.env.PREMIUM_MONTHLY_LIMIT || '200')
const ANONYMOUS_MONTHLY_LIMIT = parseInt(process.env.ANONYMOUS_MONTHLY_LIMIT || '10')

export interface UsageStatus {
  used: number
  limit: number
  remaining: number
  allowed: boolean
  tier: 'free' | 'premium'
  hasByok: boolean
  resetAt: Date
}

function getMonthStart(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

/**
 * Agent seats (`users.kind === 'agent'`) own no commercial relationship — tier,
 * BYOK key and quota all belong to the human who runs them. Every read of
 * entitlement and every write of usage resolves through here first, which keeps
 * the agent's own row purely an identity: name, avatar, session, channel shares.
 *
 * Note this resolves the *reader*, never the writer: setUserByokConfig and
 * updateUserByokModel deliberately still target the row they were given, so an
 * agent can't overwrite its parent's key. The key lives on exactly one row, so
 * rotating or revoking it stays a single edit.
 *
 * One hop only — agents don't parent other agents, so no cycle is possible. A
 * dangling parentUserId falls back to the agent's own row, which has tier 'free'
 * and no key: it degrades to a locked-down seat, never to someone else's billing.
 */
export async function resolveBillingUserId(userId: string): Promise<string> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { kind: true, parentUserId: true },
  })

  if (user?.kind !== 'agent' || !user.parentUserId) return userId
  return user.parentUserId
}

function getNextMonthStart(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 1)
}

export async function getUsageStatus(userId: string): Promise<UsageStatus> {
  const monthStart = getMonthStart()

  // Agent seats report their parent's entitlement, not their own empty row.
  const billingUserId = await resolveBillingUserId(userId)

  // Get user's tier and BYOK status
  const user = await db.query.users.findFirst({
    where: eq(users.id, billingUserId),
  })

  const tier = user?.tier || 'free'
  const hasByok = !!user?.byokApiKey

  // If user has BYOK, they have unlimited usage
  if (hasByok) {
    return {
      used: 0,
      limit: Infinity,
      remaining: Infinity,
      allowed: true,
      tier,
      hasByok: true,
      resetAt: getNextMonthStart(),
    }
  }

  // Count usage this month
  const records = await db.query.usageRecords.findMany({
    where: and(
      eq(usageRecords.userId, billingUserId),
      gte(usageRecords.createdAt, monthStart)
    ),
  })

  const used = records.length
  const limit = tier === 'premium' ? PREMIUM_MONTHLY_LIMIT : FREE_MONTHLY_LIMIT
  const remaining = Math.max(0, limit - used)

  return {
    used,
    limit,
    remaining,
    allowed: remaining > 0,
    tier,
    hasByok: false,
    resetAt: getNextMonthStart(),
  }
}

export async function checkUsageLimit(userId: string): Promise<{
  allowed: boolean
  remaining: number
  message?: string
}> {
  const status = await getUsageStatus(userId)

  if (!status.allowed && !status.hasByok) {
    return {
      allowed: false,
      remaining: 0,
      message: status.tier === 'free'
        ? 'You\'ve used all 10 free AI requests this month. Upgrade to Premium for 200 requests, or add your own API key for unlimited usage.'
        : 'You\'ve reached your monthly limit. Add your own API key for unlimited usage, or wait until next month.',
    }
  }

  return {
    allowed: true,
    remaining: status.remaining,
  }
}

export async function recordUsage(userId: string, requestType: string): Promise<void> {
  // An agent's requests are its parent's requests: they draw down the parent's
  // quota and land in the parent's usage history, not a second counter that
  // could drift from the limit checkUsageLimit enforces.
  const billingUserId = await resolveBillingUserId(userId)

  // Check if user has BYOK - don't record usage if they do
  const user = await db.query.users.findFirst({
    where: eq(users.id, billingUserId),
  })

  if (user?.byokApiKey) {
    // User is using their own key, don't count against their quota
    return
  }

  await db.insert(usageRecords).values({
    userId: billingUserId,
    requestType,
  })

  // Check usage thresholds for email alerts (fire-and-forget). Addressed to the
  // billing user — an agent seat has no real inbox to warn.
  checkUsageThresholdsForEmail(billingUserId, user).catch(() => {})
}

async function checkUsageThresholdsForEmail(
  userId: string,
  user: { email: string; name: string | null; tier: string | null } | null | undefined
): Promise<void> {
  if (!user?.email) return

  const status = await getUsageStatus(userId)
  if (status.hasByok || status.limit === Infinity) return

  const pct = status.used / status.limit
  const prevPct = (status.used - 1) / status.limit

  const baseUrl = process.env.NEXTAUTH_URL || 'https://kanthink.com'
  const tier = user.tier || 'free'

  // Send exactly once at 80% threshold
  if (pct >= 0.8 && prevPct < 0.8) {
    sendUsageLimitWarningEmail(user.email, {
      userName: user.name || '',
      used: status.used,
      limit: status.limit,
      tier,
      upgradeUrl: `${baseUrl}/settings`,
    }).catch(() => {})
  }

  // Send exactly once at 100% threshold
  if (pct >= 1 && prevPct < 1) {
    sendUsageLimitReachedEmail(user.email, {
      userName: user.name || '',
      limit: status.limit,
      tier,
      upgradeUrl: `${baseUrl}/settings`,
      resetDate: status.resetAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    }).catch(() => {})
  }
}

/**
 * The single-key BYOK helpers used to live here: one provider, one key, one model,
 * read from users.byok_*.
 *
 * They were removed when keys became per-provider. Everything that used them now
 * goes through lib/ai/keys, which reads the new columns and folds a legacy key into
 * whichever provider it belonged to — so accounts configured before the change keep
 * working without a data migration. Nothing writes the old columns any more.
 *
 * If you are looking for a key here, you want:
 *   resolveProviderKeys()  — every key an account can call with, and its source
 *   userOwnedProviders()   — which providers the user saved a key for
 *   setProviderKey()       — save one, leaving the other alone
 *
 * and lib/ai/modelPreferences for which model each area should run on.
 */

// ============================================
// Anonymous User Usage Tracking
// ============================================

export interface AnonymousUsageStatus {
  used: number
  limit: number
  remaining: number
  allowed: boolean
  isAnonymous: true
  resetAt: Date
}

/**
 * Get usage status for an anonymous user (identified by cookie-based ID)
 * Anonymous users get a limited number of free requests per month
 */
export async function getAnonymousUsageStatus(anonId: string): Promise<AnonymousUsageStatus> {
  const monthStart = getMonthStart()

  // Count usage this month for this anonymous ID
  // Anonymous IDs are stored in userId field with 'anon_' prefix
  const records = await db.query.usageRecords.findMany({
    where: and(
      eq(usageRecords.userId, anonId),
      gte(usageRecords.createdAt, monthStart)
    ),
  })

  const used = records.length
  const limit = ANONYMOUS_MONTHLY_LIMIT
  const remaining = Math.max(0, limit - used)

  return {
    used,
    limit,
    remaining,
    allowed: remaining > 0,
    isAnonymous: true,
    resetAt: getNextMonthStart(),
  }
}

/**
 * Check if an anonymous user has remaining usage
 */
export async function checkAnonymousUsageLimit(anonId: string): Promise<{
  allowed: boolean
  remaining: number
  message?: string
}> {
  const status = await getAnonymousUsageStatus(anonId)

  if (!status.allowed) {
    return {
      allowed: false,
      remaining: 0,
      message: 'You\'ve used all your free AI requests. Sign up to unlock 10 more requests per month!',
    }
  }

  return {
    allowed: true,
    remaining: status.remaining,
  }
}

/**
 * Record usage for an anonymous user
 * Note: This may fail due to FK constraint on user_id - we catch and log errors
 * but don't block the request. Anonymous usage is best-effort tracking.
 */
export async function recordAnonymousUsage(anonId: string, requestType: string): Promise<void> {
  try {
    await db.insert(usageRecords).values({
      userId: anonId,
      requestType,
    })
  } catch (error) {
    // FK constraint prevents anonymous IDs - log but don't fail
    // TODO: Create separate anonymous_usage table for proper tracking
    console.warn('Failed to record anonymous usage (FK constraint):', anonId, requestType)
  }
}
