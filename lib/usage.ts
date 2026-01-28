import { db } from './db'
import { usageRecords, users } from './db/schema'
import { eq, and, gte } from 'drizzle-orm'

const FREE_MONTHLY_LIMIT = parseInt(process.env.FREE_MONTHLY_LIMIT || '10')
const PREMIUM_MONTHLY_LIMIT = parseInt(process.env.PREMIUM_MONTHLY_LIMIT || '200')

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

export async function getUserByokConfig(userId: string): Promise<{
  provider: 'anthropic' | 'openai' | null
  apiKey: string | null
  model: string | null
} | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  })

  if (!user?.byokApiKey) {
    return null
  }

  return {
    provider: user.byokProvider,
    apiKey: user.byokApiKey,
    model: user.byokModel,
  }
}

export async function setUserByokConfig(
  userId: string,
  config: {
    provider: 'anthropic' | 'openai'
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
    await db.update(users)
      .set({
        byokProvider: config.provider,
        byokApiKey: config.apiKey,
        byokModel: config.model || null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
  }
}
