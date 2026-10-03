import webpush from 'web-push'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pushSubscriptions } from '@/lib/db/schema'
import type { NotificationType } from './types'

/**
 * Web Push: notifications that arrive with no Kanthink tab open, on a phone or a
 * desktop. Pusher covers an open tab. This covers everything else.
 *
 * Only for the moments worth an interruption: money coming in, a customer saying
 * something, a build finishing.
 */
export const PUSH_TYPES = new Set<NotificationType>([
  'app_order',
  'app_purchase',
  'app_feedback',
  'ai_generation_completed',
])

let configured: boolean | null = null
function configure(): boolean {
  if (configured !== null) return configured
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return (configured = false)
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@kanthink.com', pub, priv)
  return (configured = true)
}

/** Where tapping the notification goes. Mirrors NotificationItem's routing for the push types. */
export function notificationUrl(input: { type: string; data?: Record<string, unknown> | null }): string {
  const d = input.data ?? {}
  const channelId = d.channelId as string | undefined
  if (channelId && d.cardId && d.appId) {
    return `/channel/${channelId}/card/${d.cardId}?app=${d.appId}${input.type === 'app_order' ? '&pane=people' : ''}`
  }
  return channelId ? `/channel/${channelId}` : '/'
}

export async function sendPushToUser(userId: string, payload: { title: string; body: string; notificationId?: string; url?: string }): Promise<number> {
  if (!configure()) return 0
  const subs = await db.query.pushSubscriptions.findMany({ where: eq(pushSubscriptions.userId, userId) })
  let sent = 0
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 24, urgency: 'high' },
      )
      sent++
      await db.update(pushSubscriptions).set({ lastUsedAt: new Date() }).where(eq(pushSubscriptions.id, sub.id))
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode
      // Gone: the browser unsubscribed or the user cleared site data.
      if (status === 404 || status === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id))
      } else {
        console.warn('[push] send failed:', status, error instanceof Error ? error.message : error)
      }
    }
  }))
  return sent
}
