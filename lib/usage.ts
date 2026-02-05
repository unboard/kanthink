import { db } from './db'
import { usageRecords, users } from './db/schema'
import { eq, and, gte, like } from 'drizzle-orm'
import { encrypt, decryptIfNeeded, isEncrypted } from './crypto'

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

function getNextMonthStart(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 1)
}

export async function getUsageStatus(userId: string): Promise<UsageStatus> {
  const monthStart = getMonthStart()

  // Get user's tier and BYOK status
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
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
      eq(usageRecords.userId, userId),
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
  // Check if user has BYOK - don't record usage if they do
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  })

  if (user?.byokApiKey) {
    // User is using their own key, don't count against their quota
    return
  }

  await db.insert(usageRecords).values({
    userId,
    requestType,
  })
}

export interface ByokConfig {
  provider: 'openai' | 'google' | null
  apiKey: string | null
  model: string | null
}

export interface ByokConfigResult {
  config: ByokConfig | null
  error?: string
}

export async function getUserByokConfig(userId: string): Promise<ByokConfig | null> {
  const result = await getUserByokConfigWithError(userId)
  return result.config
}

export async function getUserByokConfigWithError(userId: string): Promise<ByokConfigResult> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  })

  if (!user?.byokApiKey) {
    return { config: null }
  }

  // Decrypt the API key (handles both encrypted and legacy plaintext keys)
  try {
    const decryptedKey = decryptIfNeeded(user.byokApiKey)

    return {
      config: {
        provider: user.byokProvider,
        apiKey: decryptedKey,
        model: user.byokModel,
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown decryption error'
    console.error('Failed to decrypt BYOK API key for user', userId, ':', errorMessage)
    return {
      config: null,
      error: `Failed to decrypt your API key. Please re-enter it in Settings. (${errorMessage})`
    }
  }
}

/**
 * Check if user has BYOK configured (without decrypting the key)
 */
export async function hasUserByokConfig(userId: string): Promise<boolean> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { byokApiKey: true },
  })

  return !!user?.byokApiKey
}

export async function setUserByokConfig(
  userId: string,
  config: {
    provider: 'openai' | 'google'
    apiKey: string
    model?: string
  } | null
): Promise<void> {
  if (config === null) {
    // Clear BYOK config
    await db.update(users)
      .set({
        byokProvider: null,
        byokApiKey: null,
        byokModel: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
  } else {
    // Encrypt the API key before storing
    const encryptedKey = encrypt(config.apiKey)

    await db.update(users)
      .set({
        byokProvider: config.provider,
        byokApiKey: encryptedKey,
        byokModel: config.model || null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
  }
}

export async function updateUserByokModel(
  userId: string,
  model: string | null
): Promise<void> {
  await db.update(users)
    .set({
      byokModel: model || null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
}

/**
 * Check if a user's BYOK key is encrypted (for migration purposes)
 */
export async function isUserByokKeyEncrypted(userId: string): Promise<boolean | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { byokApiKey: true },
  })

  if (!user?.byokApiKey) {
    return null
  }

  return isEncrypted(user.byokApiKey)
}

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
