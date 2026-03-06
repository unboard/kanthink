import { db } from '@/lib/db'
import { channelActivityLog, channelDigestSubscriptions, digestSendLog, channels, users, notificationPreferences } from '@/lib/db/schema'
import { eq, and, gt, lte } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { sendChannelDigestEmail } from '@/lib/emails/send'

const BASE_URL = process.env.NEXTAUTH_URL || process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'https://kanthink.com'

interface DigestResult {
  userId: string
  channelId: string
  sent: boolean
  activityCount: number
  error?: string
}

/**
 * Generate and send a digest for a single subscription.
 */
async function processSubscription(sub: {
  id: string
  userId: string
  channelId: string
  frequency: string
  lastSentAt: Date | null
}): Promise<DigestResult> {
  const now = new Date()
  const periodStart = sub.lastSentAt || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) // default: 7 days ago

  // Fetch activity since lastSentAt
  const activities = await db
    .select()
    .from(channelActivityLog)
    .where(
      and(
        eq(channelActivityLog.channelId, sub.channelId),
        gt(channelActivityLog.createdAt, periodStart),
        lte(channelActivityLog.createdAt, now)
      )
    )

  // Skip if zero activity
  if (activities.length === 0) {
    return { userId: sub.userId, channelId: sub.channelId, sent: false, activityCount: 0 }
  }

  // Fetch user and channel info
  const [user, channel] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, sub.userId) }),
    db.query.channels.findFirst({ where: eq(channels.id, sub.channelId) }),
  ])

  if (!user?.email || !channel) {
    return { userId: sub.userId, channelId: sub.channelId, sent: false, activityCount: 0, error: 'Missing user or channel' }
  }

  // Check if email notifications are enabled globally
  const prefs = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.userId, sub.userId),
  })
  if (prefs && !prefs.emailNotificationsEnabled) {
    return { userId: sub.userId, channelId: sub.channelId, sent: false, activityCount: activities.length, error: 'Email notifications disabled' }
  }

  // Try AI summary
  let aiSummary: string | null = null
  try {
    aiSummary = await generateAISummary(channel, activities)
  } catch {
    // Proceed without AI summary
  }

  const periodLabel = sub.frequency === 'daily' ? 'daily' : sub.frequency === 'weekly' ? 'weekly' : 'monthly'
  const channelUrl = `${BASE_URL}/channel/${sub.channelId}`

  const sent = await sendChannelDigestEmail(user.email, {
    channelName: channel.name,
    userName: user.name || 'there',
    periodLabel,
    aiSummary,
    activities: activities.map(a => ({
      action: a.action,
      entityType: a.entityType,
      metadata: a.metadata as Record<string, unknown> | undefined,
      createdAt: a.createdAt?.toISOString() || '',
    })),
    channelUrl,
  })

  if (sent) {
    // Update lastSentAt
    await db.update(channelDigestSubscriptions)
      .set({ lastSentAt: now, updatedAt: now })
      .where(eq(channelDigestSubscriptions.id, sub.id))

    // Log to digest_send_log
    await db.insert(digestSendLog).values({
      userId: sub.userId,
      channelId: sub.channelId,
      frequency: sub.frequency as 'daily' | 'weekly' | 'monthly',
      periodStart,
      periodEnd: now,
      activityCount: activities.length,
    })
  }

  return { userId: sub.userId, channelId: sub.channelId, sent, activityCount: activities.length }
}

/**
 * Generate an AI summary of channel activity using the channel owner's BYOK config.
 */
async function generateAISummary(
  channel: { id: string; name: string; ownerId: string },
  activities: { action: string; entityType: string; metadata: unknown }[]
): Promise<string | null> {
  // Look up the channel owner's BYOK config
  const owner = await db.query.users.findFirst({
    where: eq(users.id, channel.ownerId),
    columns: { byokProvider: true, byokApiKey: true, byokModel: true },
  })

  if (!owner?.byokApiKey || !owner?.byokProvider) {
    return null
  }

  const activitySummary = activities.map(a => {
    const meta = a.metadata as Record<string, unknown> | null
    return `${a.action}${meta?.title ? `: ${meta.title}` : ''}`
  }).join('\n')

  const prompt = `You are Kan, the AI assistant for Kanthink. Summarize this channel activity in 2-4 sentences for an email digest. Be concise and helpful. Channel: "${channel.name}"\n\nActivity:\n${activitySummary}`

  try {
    if (owner.byokProvider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${owner.byokApiKey}`,
        },
        body: JSON.stringify({
          model: owner.byokModel || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
        }),
      })
      const data = await response.json()
      return data.choices?.[0]?.message?.content || null
    } else if (owner.byokProvider === 'google') {
      const model = owner.byokModel || 'gemini-2.0-flash'
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${owner.byokApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 200 },
          }),
        }
      )
      const data = await response.json()
      return data.candidates?.[0]?.content?.parts?.[0]?.text || null
    }
  } catch {
    // AI failure is non-critical
  }

  return null
}

/**
 * Process all digests for a given frequency. Called by the cron endpoint.
 */
export async function processDigests(frequency: 'daily' | 'weekly' | 'monthly'): Promise<DigestResult[]> {
  await ensureSchema()

  const subs = await db
    .select()
    .from(channelDigestSubscriptions)
    .where(
      and(
        eq(channelDigestSubscriptions.frequency, frequency),
        eq(channelDigestSubscriptions.muted, false)
      )
    )

  const results: DigestResult[] = []
  for (const sub of subs) {
    try {
      const result = await processSubscription({
        id: sub.id,
        userId: sub.userId,
        channelId: sub.channelId,
        frequency: sub.frequency,
        lastSentAt: sub.lastSentAt,
      })
      results.push(result)
    } catch (error) {
      results.push({
        userId: sub.userId,
        channelId: sub.channelId,
        sent: false,
        activityCount: 0,
        error: String(error),
      })
    }
  }

  return results
}
