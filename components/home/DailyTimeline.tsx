'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'

interface ActivityItem {
  id: string
  action: string
  entityType: string
  entityId: string
  channelId: string
  channelName: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

interface ChartBar {
  date: string
  count: number
  isSelected: boolean
}

interface TimelineTask {
  id: string
  title: string
  status?: string
  channelId: string
  channelName: string
  dueDate?: string
  completedAt?: string
}

interface TimelineCard {
  id: string
  title: string
  channelId: string
  channelName: string
  updatedAt: string
  createdAt: string
  isNew: boolean
}

interface ChannelOption {
  id: string
  name: string
}

interface TimelineData {
  date: string
  isToday: boolean
  activities: ActivityItem[]
  activityChart: ChartBar[]
  dueTasks: TimelineTask[]
  completedTasks: TimelineTask[]
  modifiedCards: TimelineCard[]
  channels: ChannelOption[]
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  const todayStr = localDateStr(today)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = localDateStr(yesterday)

  if (dateStr === todayStr) return 'Today'
  if (dateStr === yesterdayStr) return 'Yesterday'

  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function actionLabel(action: string): string {
  switch (action) {
    case 'card_created': return 'Created'
    case 'card_moved': return 'Moved'
    case 'card_deleted': return 'Deleted'
    case 'card_updated': return 'Updated'
    case 'task_created': return 'New task'
    case 'task_completed': return 'Completed'
    default: return action
  }
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

interface DailyTimelineProps {
  onCreateChannel: () => void
}

export function DailyTimeline({ onCreateChannel }: DailyTimelineProps) {
  const router = useRouter()
  const channels = useStore((s) => s.channels)
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })
  const [channelFilter, setChannelFilter] = useState<string | null>(null)
  const [data, setData] = useState<TimelineData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchTimeline = useCallback(async (date: string, chId: string | null) => {
    setLoading(true)
    try {
      const tzOffset = new Date().getTimezoneOffset()
      const params = new URLSearchParams({ date, tzOffset: String(tzOffset) })
      if (chId) params.set('channelId', chId)
      const res = await fetch(`/api/timeline?${params}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (e) {
      console.error('Failed to fetch timeline:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTimeline(selectedDate, channelFilter)
  }, [selectedDate, channelFilter, fetchTimeline])

  // Generate summary from deduplicated data
  const generatedSummary = useMemo(() => {
    if (!data) return null
    const parts: string[] = []

    // Count unique entities per action (already deduped by server)
    const created = data.activities.filter(a => a.action === 'card_created').length
    const moved = data.activities.filter(a => a.action === 'card_moved').length
    const completed = data.completedTasks.length
    const taskCreated = data.activities.filter(a => a.action === 'task_created').length
    // Count cards that were modified but not created today
    const modifiedOnly = data.modifiedCards.filter(c => !c.isNew).length

    if (created > 0) parts.push(`${created} card${created > 1 ? 's' : ''} created`)
    if (modifiedOnly > 0) parts.push(`${modifiedOnly} card${modifiedOnly > 1 ? 's' : ''} updated`)
    if (moved > 0) parts.push(`${moved} moved`)
    if (taskCreated > 0) parts.push(`${taskCreated} task${taskCreated > 1 ? 's' : ''} added`)
    if (completed > 0) parts.push(`${completed} task${completed > 1 ? 's' : ''} completed`)

    if (parts.length === 0 && data.dueTasks.length === 0) return null
    return parts.length > 0 ? parts.join(', ') + '.' : null
  }, [data])

  if (Object.keys(channels).length === 0) {
    return (
      <div className="relative flex h-full items-center justify-center">
        <div className="relative z-10 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/20 to-violet-500/20 backdrop-blur-sm">
            <svg className="h-8 w-8 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white">No channels yet</h2>
          <p className="mt-2 text-white/50">Create your first channel to get started</p>
          <button
            onClick={onCreateChannel}
            className="mt-6 rounded-lg bg-violet-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-violet-700"
          >
            Create channel
          </button>
        </div>
      </div>
    )
  }

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const isToday = selectedDate === todayStr
  const maxBarCount = data ? Math.max(...data.activityChart.map(b => b.count), 1) : 1

  return (
    <div className="relative min-h-full flex justify-center">
      <div className="w-full max-w-lg px-5 py-12 sm:py-20">
        {/* Date stepper */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => setSelectedDate(d => shiftDate(d, -1))}
            className="p-2 -ml-2 text-white/30 hover:text-white/60 transition-colors"
            aria-label="Previous day"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <button
            onClick={() => !isToday && setSelectedDate(todayStr)}
            className={`text-[15px] font-medium transition-colors ${isToday ? 'text-white/40' : 'text-white/60 hover:text-white/80'}`}
          >
            {formatDate(selectedDate)}
          </button>

          <button
            onClick={() => setSelectedDate(d => shiftDate(d, 1))}
            className={`p-2 -mr-2 transition-colors ${isToday ? 'text-white/10 cursor-default' : 'text-white/30 hover:text-white/60'}`}
            disabled={isToday}
            aria-label="Next day"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Activity bar chart */}
        {data && (
          <div className="mb-10">
            <div className="flex items-end gap-[3px] h-10">
              {data.activityChart.map((bar) => (
                <button
                  key={bar.date}
                  onClick={() => setSelectedDate(bar.date)}
                  className="flex-1 flex flex-col justify-end group relative"
                  title={`${bar.date}: ${bar.count} item${bar.count !== 1 ? 's' : ''} changed`}
                >
                  <div
                    className={`w-full rounded-sm transition-all ${
                      bar.isSelected
                        ? 'bg-white/40'
                        : bar.count > 0
                          ? 'bg-white/12 group-hover:bg-white/20'
                          : 'bg-white/[0.04] group-hover:bg-white/[0.08]'
                    }`}
                    style={{
                      height: bar.count > 0
                        ? `${Math.max(4, (bar.count / maxBarCount) * 40)}px`
                        : '2px',
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Channel filter */}
        {data && data.channels.length > 1 && (
          <div className="flex gap-2 mb-8 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            <button
              onClick={() => setChannelFilter(null)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-[12px] transition-colors ${
                !channelFilter
                  ? 'bg-white/15 text-white/70'
                  : 'bg-white/[0.04] text-white/30 hover:text-white/50'
              }`}
            >
              All
            </button>
            {data.channels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setChannelFilter(channelFilter === ch.id ? null : ch.id)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-[12px] transition-colors truncate max-w-[140px] ${
                  channelFilter === ch.id
                    ? 'bg-white/15 text-white/70'
                    : 'bg-white/[0.04] text-white/30 hover:text-white/50'
                }`}
              >
                {ch.name}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white/20" />
          </div>
        ) : data ? (
          <div className="space-y-10">
            {/* Summary line */}
            {generatedSummary && (
              <p className="text-[13px] text-white/30 leading-relaxed">
                {generatedSummary}
              </p>
            )}

            {/* Due tasks (today only) */}
            {data.isToday && data.dueTasks.length > 0 && (
              <section>
                <h2 className="text-[11px] text-white/20 uppercase tracking-wider mb-3">Due today</h2>
                <div>
                  {data.dueTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-white/[0.02] -mx-2 px-2 rounded-md transition-colors"
                      onClick={() => router.push(`/channel/${task.channelId}`)}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400/60 flex-shrink-0" />
                      <span className="flex-1 text-[14px] text-white/70 min-w-0 truncate">{task.title}</span>
                      <span className="text-[11px] text-white/20 flex-shrink-0 truncate max-w-[100px]">{task.channelName}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Work done */}
            {(data.completedTasks.length > 0 || data.modifiedCards.length > 0) && (
              <section>
                <h2 className="text-[11px] text-white/20 uppercase tracking-wider mb-3">
                  {data.isToday ? 'Done today' : 'Work done'}
                </h2>
                <div>
                  {/* Completed tasks */}
                  {data.completedTasks.map((task) => (
                    <div
                      key={`task-${task.id}`}
                      className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-white/[0.02] -mx-2 px-2 rounded-md transition-colors"
                      onClick={() => router.push(`/channel/${task.channelId}`)}
                    >
                      <svg className="w-3.5 h-3.5 text-emerald-400/50 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="flex-1 text-[14px] text-white/50 min-w-0 truncate line-through decoration-white/10">{task.title}</span>
                      <span className="text-[11px] text-white/15 flex-shrink-0 truncate max-w-[100px]">{task.channelName}</span>
                    </div>
                  ))}

                  {/* Modified/created cards */}
                  {data.modifiedCards.map((card) => (
                    <div
                      key={`card-${card.id}`}
                      className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-white/[0.02] -mx-2 px-2 rounded-md transition-colors"
                      onClick={() => router.push(`/channel/${card.channelId}`)}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${card.isNew ? 'bg-cyan-400/50' : 'bg-white/15'}`} />
                      <span className="flex-1 text-[14px] text-white/60 min-w-0 truncate">{card.title}</span>
                      {card.isNew && <span className="text-[10px] text-cyan-400/40 flex-shrink-0">new</span>}
                      <span className="text-[11px] text-white/15 flex-shrink-0 truncate max-w-[100px]">{card.channelName}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Activity feed */}
            {data.activities.length > 0 && (
              <section>
                <h2 className="text-[11px] text-white/20 uppercase tracking-wider mb-3">Activity</h2>
                <div>
                  {data.activities.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-3 py-2 -mx-2 px-2"
                    >
                      <span className="text-[11px] text-white/15 flex-shrink-0 w-14 text-right">{formatTime(a.createdAt)}</span>
                      <span className="text-[12px] text-white/25 flex-shrink-0 w-16">{actionLabel(a.action)}</span>
                      <span className="flex-1 text-[13px] text-white/40 min-w-0 truncate">
                        {(a.metadata as Record<string, unknown>)?.title as string || a.entityType}
                      </span>
                      <span className="text-[11px] text-white/15 flex-shrink-0 truncate max-w-[80px]">{a.channelName}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Empty state */}
            {data.activities.length === 0 && data.completedTasks.length === 0 && data.modifiedCards.length === 0 && data.dueTasks.length === 0 && (
              <div className="text-center py-16">
                <p className="text-white/20 text-[14px]">
                  {data.isToday ? 'Nothing yet today' : 'No activity this day'}
                </p>
              </div>
            )}
          </div>
        ) : null}

        {/* New channel ghost button */}
        <div className="mt-16 text-center">
          <button
            onClick={onCreateChannel}
            className="text-white/15 hover:text-white/30 text-[13px] transition-colors"
          >
            + New channel
          </button>
        </div>
      </div>
    </div>
  )
}
