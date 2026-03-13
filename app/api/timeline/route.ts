import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { channelActivityLog, cards, tasks, channels } from '@/lib/db/schema'
import { eq, and, gte, lte, desc, inArray } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'

export const dynamic = 'force-dynamic'

/**
 * GET /api/timeline?date=2026-03-13&channelId=optional
 * Returns daily activity, tasks, and a bar chart of recent activity.
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  await ensureSchema()

  const userId = session.user.id
  const { searchParams } = new URL(request.url)
  const dateStr = searchParams.get('date') || new Date().toISOString().split('T')[0]
  const channelFilter = searchParams.get('channelId')

  // Parse date to get start/end of day (UTC)
  const dayStart = new Date(dateStr + 'T00:00:00.000Z')
  const dayEnd = new Date(dateStr + 'T23:59:59.999Z')

  // Get user's channels first
  const userChannels = await db
    .select({ id: channels.id, name: channels.name })
    .from(channels)
    .where(eq(channels.ownerId, userId))

  const userChannelIds = new Set(userChannels.map(c => c.id))
  const channelNameMap = new Map(userChannels.map(c => [c.id, c.name]))

  // 1. Activity for the selected day
  const dayActivities = await db
    .select()
    .from(channelActivityLog)
    .where(
      and(
        eq(channelActivityLog.userId, userId),
        gte(channelActivityLog.createdAt, dayStart),
        lte(channelActivityLog.createdAt, dayEnd),
        ...(channelFilter ? [eq(channelActivityLog.channelId, channelFilter)] : [])
      )
    )
    .orderBy(desc(channelActivityLog.createdAt))

  // Filter to only user's channels
  const filteredActivities = dayActivities.filter(a => userChannelIds.has(a.channelId))

  // 2. Activity counts for the past 14 days (for bar chart)
  const fourteenDaysAgo = new Date(dayStart)
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13)
  fourteenDaysAgo.setUTCHours(0, 0, 0, 0)

  const chartEnd = new Date(dateStr + 'T23:59:59.999Z')

  const recentActivities = await db
    .select()
    .from(channelActivityLog)
    .where(
      and(
        eq(channelActivityLog.userId, userId),
        gte(channelActivityLog.createdAt, fourteenDaysAgo),
        lte(channelActivityLog.createdAt, chartEnd),
        ...(channelFilter ? [eq(channelActivityLog.channelId, channelFilter)] : [])
      )
    )

  // Group by day
  const activityByDay: Record<string, number> = {}
  for (let i = 0; i < 14; i++) {
    const d = new Date(fourteenDaysAgo)
    d.setDate(d.getDate() + i)
    activityByDay[d.toISOString().split('T')[0]] = 0
  }
  for (const a of recentActivities) {
    if (!userChannelIds.has(a.channelId)) continue
    const day = a.createdAt ? new Date(a.createdAt).toISOString().split('T')[0] : null
    if (day && day in activityByDay) {
      activityByDay[day]++
    }
  }

  // 3. Tasks from user's channels
  const channelIdArray = Array.from(userChannelIds)
  const allTasks = channelIdArray.length > 0
    ? await db
        .select()
        .from(tasks)
        .where(inArray(tasks.channelId, channelIdArray))
    : []

  const dueTasks = allTasks.filter(t => {
    if (!t.dueDate) return false
    if (channelFilter && t.channelId !== channelFilter) return false
    if (!userChannelIds.has(t.channelId)) return false
    const dueMs = t.dueDate instanceof Date ? t.dueDate.getTime() : Number(t.dueDate) * 1000
    const dueDay = new Date(dueMs).toISOString().split('T')[0]
    return dueDay === dateStr && t.status !== 'done'
  })

  // 4. Tasks completed on the selected day
  const completedTasks = allTasks.filter(t => {
    if (!t.completedAt) return false
    if (channelFilter && t.channelId !== channelFilter) return false
    if (!userChannelIds.has(t.channelId)) return false
    const compMs = t.completedAt instanceof Date ? t.completedAt.getTime() : Number(t.completedAt) * 1000
    const compDay = new Date(compMs).toISOString().split('T')[0]
    return compDay === dateStr
  })

  // 5. Cards modified on the selected day
  const modifiedCards = await db
    .select()
    .from(cards)
    .where(
      and(
        gte(cards.updatedAt, dayStart),
        lte(cards.updatedAt, dayEnd),
        ...(channelFilter ? [eq(cards.channelId, channelFilter)] : [])
      )
    )

  const filteredCards = modifiedCards.filter(c => userChannelIds.has(c.channelId))

  // Build response
  const activities = filteredActivities.map(a => ({
    id: a.id,
    action: a.action,
    entityType: a.entityType,
    entityId: a.entityId,
    channelId: a.channelId,
    channelName: channelNameMap.get(a.channelId) || 'Unknown',
    metadata: a.metadata,
    createdAt: a.createdAt?.toISOString(),
  }))

  const isToday = dateStr === new Date().toISOString().split('T')[0]

  return NextResponse.json({
    date: dateStr,
    isToday,
    activities,
    activityChart: Object.entries(activityByDay).map(([date, count]) => ({
      date,
      count,
      isSelected: date === dateStr,
    })),
    dueTasks: dueTasks.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      channelId: t.channelId,
      channelName: channelNameMap.get(t.channelId) || 'Unknown',
      dueDate: t.dueDate instanceof Date ? t.dueDate.toISOString() : t.dueDate,
    })),
    completedTasks: completedTasks.map(t => ({
      id: t.id,
      title: t.title,
      channelId: t.channelId,
      channelName: channelNameMap.get(t.channelId) || 'Unknown',
      completedAt: t.completedAt instanceof Date ? t.completedAt.toISOString() : t.completedAt,
    })),
    modifiedCards: filteredCards.map(c => ({
      id: c.id,
      title: c.title,
      channelId: c.channelId,
      channelName: channelNameMap.get(c.channelId) || 'Unknown',
      updatedAt: c.updatedAt?.toISOString(),
      createdAt: c.createdAt?.toISOString(),
      isNew: c.createdAt && c.createdAt >= dayStart && c.createdAt <= dayEnd,
    })),
    channels: userChannels.map(c => ({ id: c.id, name: c.name })),
  })
}
