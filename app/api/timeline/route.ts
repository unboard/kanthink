import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { channelActivityLog, cards, tasks, channels } from '@/lib/db/schema'
import { eq, and, gte, lte, desc, inArray } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'

export const dynamic = 'force-dynamic'

/**
 * GET /api/timeline?date=2026-03-13&tzOffset=-300&channelId=optional
 *
 * tzOffset is minutes behind UTC (e.g. EST = -300, UTC = 0).
 * Server computes local day boundaries in UTC using this offset.
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
  // Client's timezone offset in minutes (e.g. -300 for EST)
  const tzOffsetMin = parseInt(searchParams.get('tzOffset') || '0', 10)

  // Compute day boundaries in UTC, adjusted for client timezone
  // If tzOffset is -300 (EST, UTC-5), local midnight = 05:00 UTC
  const dayStart = new Date(dateStr + 'T00:00:00.000Z')
  dayStart.setMinutes(dayStart.getMinutes() - tzOffsetMin)
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1)

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

  // Filter to user's channels only
  const ownedActivities = dayActivities.filter(a => userChannelIds.has(a.channelId))

  // Deduplicate: keep only the latest event per (entityId, action) pair
  const seen = new Set<string>()
  const dedupedActivities = ownedActivities.filter(a => {
    const key = `${a.entityId}:${a.action}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // 2. Activity counts for the past 14 days (for bar chart)
  // Count unique entities changed per day, not raw events
  const chartStart = new Date(dayStart)
  chartStart.setDate(chartStart.getDate() - 13)

  const recentActivities = await db
    .select()
    .from(channelActivityLog)
    .where(
      and(
        eq(channelActivityLog.userId, userId),
        gte(channelActivityLog.createdAt, chartStart),
        lte(channelActivityLog.createdAt, dayEnd),
        ...(channelFilter ? [eq(channelActivityLog.channelId, channelFilter)] : [])
      )
    )

  // Group by local day, counting unique entities per day
  const activityByDay: Record<string, Set<string>> = {}
  for (let i = 0; i < 14; i++) {
    const d = new Date(chartStart)
    d.setDate(d.getDate() + i)
    // Convert back to local date string for this day
    const localDate = new Date(d.getTime() + tzOffsetMin * 60000)
    activityByDay[localDate.toISOString().split('T')[0]] = new Set()
  }

  for (const a of recentActivities) {
    if (!userChannelIds.has(a.channelId)) continue
    if (!a.createdAt) continue
    // Convert UTC timestamp to local date
    const localDate = new Date(a.createdAt.getTime() + tzOffsetMin * 60000)
    const day = localDate.toISOString().split('T')[0]
    if (day in activityByDay) {
      activityByDay[day].add(a.entityId)
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
    // Compare in local timezone
    const localDue = new Date(dueMs + tzOffsetMin * 60000)
    const dueDay = localDue.toISOString().split('T')[0]
    return dueDay === dateStr && t.status !== 'done'
  })

  // 4. Tasks completed on the selected day
  const completedTasks = allTasks.filter(t => {
    if (!t.completedAt) return false
    if (channelFilter && t.channelId !== channelFilter) return false
    if (!userChannelIds.has(t.channelId)) return false
    const compMs = t.completedAt instanceof Date ? t.completedAt.getTime() : Number(t.completedAt) * 1000
    const localComp = new Date(compMs + tzOffsetMin * 60000)
    const compDay = localComp.toISOString().split('T')[0]
    return compDay === dateStr
  })

  // 5. Cards created or meaningfully changed on the selected day
  // Query cards updated within the day window
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

  // Determine which cards were actually created today (in local time)
  const cardsWithLocalCheck = filteredCards.map(c => {
    const createdMs = c.createdAt ? c.createdAt.getTime() : 0
    const isNew = createdMs >= dayStart.getTime() && createdMs <= dayEnd.getTime()
    return {
      id: c.id,
      title: c.title,
      channelId: c.channelId,
      channelName: channelNameMap.get(c.channelId) || 'Unknown',
      updatedAt: c.updatedAt?.toISOString(),
      createdAt: c.createdAt?.toISOString(),
      isNew,
    }
  })

  // Build deduped activity response
  const activities = dedupedActivities.map(a => ({
    id: a.id,
    action: a.action,
    entityType: a.entityType,
    entityId: a.entityId,
    channelId: a.channelId,
    channelName: channelNameMap.get(a.channelId) || 'Unknown',
    metadata: a.metadata,
    createdAt: a.createdAt?.toISOString(),
  }))

  const isToday = dateStr === new Date(Date.now() + tzOffsetMin * 60000).toISOString().split('T')[0]

  return NextResponse.json({
    date: dateStr,
    isToday,
    activities,
    activityChart: Object.entries(activityByDay).map(([date, entitySet]) => ({
      date,
      count: entitySet.size,
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
    modifiedCards: cardsWithLocalCheck,
    channels: userChannels.map(c => ({ id: c.id, name: c.name })),
  })
}
