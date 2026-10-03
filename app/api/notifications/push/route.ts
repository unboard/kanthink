import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { notificationPreferences, pushSubscriptions } from '@/lib/db/schema'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { sendPushToUser } from '@/lib/notifications/push'

export const runtime = 'nodejs'

/**
 * This browser's Web Push subscription.
 *
 * POST { subscription, test? } stores it (one row per browser, moved to whoever is
 *                              signed in) and turns browser notifications on.
 *                              With test, sends one right away so you can see it work.
 * DELETE { endpoint }          forgets it.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  let body: { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; test?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const sub = body.subscription
  if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  try {
    await ensureSchema()
    const existing = await db.query.pushSubscriptions.findFirst({ where: eq(pushSubscriptions.endpoint, sub.endpoint) })
    if (existing) {
      await db.update(pushSubscriptions)
        .set({ userId: session.user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
        .where(eq(pushSubscriptions.id, existing.id))
    } else {
      await db.insert(pushSubscriptions).values({
        userId: session.user.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
      })
    }

    // Subscribing is saying yes to browser notifications.
    const prefs = await db.query.notificationPreferences.findFirst({ where: eq(notificationPreferences.userId, session.user.id) })
    if (prefs) {
      if (!prefs.browserNotificationsEnabled) {
        await db.update(notificationPreferences).set({ browserNotificationsEnabled: true, updatedAt: new Date() }).where(eq(notificationPreferences.id, prefs.id))
      }
    } else {
      await db.insert(notificationPreferences).values({ userId: session.user.id, disabledTypes: [], browserNotificationsEnabled: true, emailNotificationsEnabled: true })
    }

    const sent = body.test
      ? await sendPushToUser(session.user.id, { title: 'Notifications are on', body: 'Orders and sales will reach this device, even with Kanthink closed.', url: '/' })
      : 0
    return NextResponse.json({ ok: true, sent })
  } catch (error) {
    console.error('[notifications/push] POST failed:', error)
    return NextResponse.json({ error: 'Could not save the subscription' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string }
  if (endpoint) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))
  return NextResponse.json({ ok: true })
}
