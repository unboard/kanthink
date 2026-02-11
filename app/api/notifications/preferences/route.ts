import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { notificationPreferences } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'

const DEFAULT_PREFERENCES = {
  disabledTypes: [],
  browserNotificationsEnabled: false,
}

/**
 * GET /api/notifications/preferences
 * Get notification preferences for authenticated user
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    await ensureSchema()

    const prefs = await db.query.notificationPreferences.findFirst({
      where: eq(notificationPreferences.userId, session.user.id),
    })

    return NextResponse.json({
      preferences: prefs ? {
        disabledTypes: prefs.disabledTypes ?? [],
        browserNotificationsEnabled: prefs.browserNotificationsEnabled ?? false,
      } : DEFAULT_PREFERENCES,
    })
  } catch {
    // notifications table may not exist in production — return defaults
    return NextResponse.json({ preferences: DEFAULT_PREFERENCES })
  }
}

/**
 * PUT /api/notifications/preferences
 * Update notification preferences
 */
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await req.json()
  const { disabledTypes, browserNotificationsEnabled } = body

  try {
    await ensureSchema()

    const existing = await db.query.notificationPreferences.findFirst({
      where: eq(notificationPreferences.userId, session.user.id),
    })

    if (existing) {
      const updates: Record<string, unknown> = { updatedAt: new Date() }
      if (disabledTypes !== undefined) updates.disabledTypes = disabledTypes
      if (browserNotificationsEnabled !== undefined) updates.browserNotificationsEnabled = browserNotificationsEnabled

      await db.update(notificationPreferences)
        .set(updates)
        .where(eq(notificationPreferences.id, existing.id))
    } else {
      await db.insert(notificationPreferences).values({
        userId: session.user.id,
        disabledTypes: disabledTypes ?? [],
        browserNotificationsEnabled: browserNotificationsEnabled ?? false,
      })
    }
  } catch {
    // notifications table may not exist in production — fail gracefully
  }

  return NextResponse.json({ success: true })
}
