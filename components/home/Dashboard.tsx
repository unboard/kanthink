'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useStore } from '@/lib/store'
import { useServerSync } from '@/components/providers/ServerSyncProvider'
import { TaskCheckbox } from '@/components/board/TaskCheckbox'
import type { Task, Channel } from '@/lib/types'

function parseTimestamp(ts: string | undefined | null): number {
  if (!ts) return NaN
  const d = new Date(ts)
  let ms = d.getTime()
  if (!isNaN(ms)) return ms
  const num = Number(ts)
  if (!isNaN(num)) {
    ms = num < 4102444800 ? num * 1000 : num
    return ms
  }
  return NaN
}

function relativeTime(ts: string | undefined | null): string {
  const ms = parseTimestamp(ts)
  if (isNaN(ms)) return ''
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatDueDate(dueDateStr: string): string {
  const ms = parseTimestamp(dueDateStr)
  if (isNaN(ms)) return ''
  const due = new Date(ms)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86400000)

  if (diffDays < 0) return 'Overdue'
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays <= 6) return due.toLocaleDateString(undefined, { weekday: 'short' })
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

interface DashboardProps {
  onCreateChannel: () => void
}

export function Dashboard({ onCreateChannel }: DashboardProps) {
  const { status: sessionStatus } = useSession()
  const router = useRouter()
  const { isLoading: isServerLoading } = useServerSync()
  const channels = useStore((s) => s.channels)
  const cards = useStore((s) => s.cards)
  const tasks = useStore((s) => s.tasks)
  const hasHydrated = useStore((s) => s._hasHydrated)
  const toggleTaskStatus = useStore((s) => s.toggleTaskStatus)

  const hasData = Object.keys(channels).length > 0
  const isFullyLoaded = hasHydrated && (
    hasData ||
    sessionStatus === 'unauthenticated' ||
    (sessionStatus === 'authenticated' && !isServerLoading)
  )

  // Active tasks: in-progress or overdue
  const focusTasks = useMemo(() => {
    const now = Date.now()
    return Object.values(tasks)
      .filter((t) => {
        if (t.status === 'done') return false
        if (!channels[t.channelId]) return false
        // Include in-progress tasks and overdue tasks
        if (t.status === 'in_progress') return true
        if (t.dueDate) {
          const ms = parseTimestamp(t.dueDate)
          if (!isNaN(ms) && ms <= now) return true
        }
        return false
      })
      .sort((a, b) => {
        // Overdue first, then by updatedAt
        const aOverdue = a.dueDate ? parseTimestamp(a.dueDate) <= now : false
        const bOverdue = b.dueDate ? parseTimestamp(b.dueDate) <= now : false
        if (aOverdue && !bOverdue) return -1
        if (!aOverdue && bOverdue) return 1
        const aMs = parseTimestamp(a.updatedAt)
        const bMs = parseTimestamp(b.updatedAt)
        return (isNaN(bMs) ? 0 : bMs) - (isNaN(aMs) ? 0 : aMs)
      })
  }, [tasks, channels])

  // Upcoming: tasks due in the next 7 days (not already in focus)
  const upcomingTasks = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const sevenDaysMs = today.getTime() + 7 * 86400000
    const focusIds = new Set(focusTasks.map((t) => t.id))

    return Object.values(tasks)
      .filter((t) => {
        if (t.status === 'done' || focusIds.has(t.id)) return false
        if (!channels[t.channelId]) return false
        if (!t.dueDate) return false
        const ms = parseTimestamp(t.dueDate)
        return !isNaN(ms) && ms > Date.now() && ms <= sevenDaysMs
      })
      .sort((a, b) => {
        const aMs = parseTimestamp(a.dueDate!)
        const bMs = parseTimestamp(b.dueDate!)
        return (isNaN(aMs) ? 0 : aMs) - (isNaN(bMs) ? 0 : bMs)
      })
  }, [tasks, channels, focusTasks])

  // Channel summaries: card count + most recent update
  const channelSummaries = useMemo(() => {
    const channelList = Object.values(channels)
      .filter(c => !c.isGlobalHelp && !c.isQuickSave)

    return channelList.map((ch) => {
      const chCards = Object.values(cards).filter(c => c.channelId === ch.id)
      const chTasks = Object.values(tasks).filter(t => t.channelId === ch.id)
      const activeTasks = chTasks.filter(t => t.status !== 'done').length
      const totalCards = chCards.length

      // Most recent update across cards and tasks
      let latestMs = 0
      for (const c of chCards) {
        const ms = parseTimestamp(c.updatedAt)
        if (!isNaN(ms) && ms > latestMs) latestMs = ms
      }
      for (const t of chTasks) {
        const ms = parseTimestamp(t.updatedAt)
        if (!isNaN(ms) && ms > latestMs) latestMs = ms
      }

      return {
        id: ch.id,
        name: ch.name,
        description: ch.description,
        totalCards,
        activeTasks,
        lastActivity: latestMs > 0 ? new Date(latestMs).toISOString() : null,
        status: ch.status,
      }
    }).sort((a, b) => {
      // Most recently active first
      const aMs = a.lastActivity ? new Date(a.lastActivity).getTime() : 0
      const bMs = b.lastActivity ? new Date(b.lastActivity).getTime() : 0
      return bMs - aMs
    })
  }, [channels, cards, tasks])

  if (!isFullyLoaded) {
    return (
      <div className="relative flex h-full items-center justify-center">
        <div className="animate-pulse text-white/50">Loading...</div>
      </div>
    )
  }

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

  const hasFocus = focusTasks.length > 0
  const hasUpcoming = upcomingTasks.length > 0
  const hasAnyTasks = hasFocus || hasUpcoming

  return (
    <div className="relative min-h-full flex justify-center">
      <div className="w-full max-w-lg px-5 py-16 sm:py-24">
        {/* Greeting */}
        <p className="text-white/20 text-[15px] mb-12">{getGreeting()}</p>

        {/* Focus tasks */}
        {hasFocus && (
          <section className="mb-10">
            {hasUpcoming && (
              <h2 className="text-[11px] text-white/20 uppercase tracking-wider mb-3">Focus</h2>
            )}
            <div>
              {focusTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  channelName={channels[task.channelId]?.name}
                  dueLabel={task.dueDate ? formatDueDate(task.dueDate) : undefined}
                  isOverdue={task.dueDate ? parseTimestamp(task.dueDate) <= Date.now() : false}
                  onToggle={() => toggleTaskStatus(task.id)}
                  onClick={() => router.push(`/channel/${task.channelId}`)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Upcoming */}
        {hasUpcoming && (
          <section className="mb-10">
            {hasFocus && (
              <h2 className="text-[11px] text-white/20 uppercase tracking-wider mb-3">Coming up</h2>
            )}
            <div>
              {upcomingTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  channelName={channels[task.channelId]?.name}
                  dueLabel={task.dueDate ? formatDueDate(task.dueDate) : undefined}
                  onToggle={() => toggleTaskStatus(task.id)}
                  onClick={() => router.push(`/channel/${task.channelId}`)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty task state */}
        {!hasAnyTasks && (
          <div className="text-center py-12 mb-10">
            <p className="text-white/20 text-[14px]">Nothing in progress</p>
          </div>
        )}

        {/* Channels */}
        {channelSummaries.length > 0 && (
          <section>
            <h2 className="text-[11px] text-white/20 uppercase tracking-wider mb-3">Channels</h2>
            <div className="space-y-1">
              {channelSummaries.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => router.push(`/channel/${ch.id}`)}
                  className="w-full flex items-center gap-3 py-3 -mx-2 px-2 rounded-lg hover:bg-white/[0.03] transition-colors text-left group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] text-white/70 truncate">{ch.name}</span>
                      {ch.status === 'paused' && (
                        <span className="text-[10px] text-white/20">paused</span>
                      )}
                    </div>
                    {ch.description && (
                      <p className="text-[12px] text-white/25 truncate mt-0.5">{ch.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {ch.activeTasks > 0 && (
                      <span className="text-[11px] text-white/25">{ch.activeTasks} task{ch.activeTasks > 1 ? 's' : ''}</span>
                    )}
                    <span className="text-[11px] text-white/15">{ch.totalCards} card{ch.totalCards !== 1 ? 's' : ''}</span>
                    {ch.lastActivity && (
                      <span className="text-[10px] text-white/10 w-12 text-right">{relativeTime(ch.lastActivity)}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* New channel ghost button */}
        <div className="mt-12 text-center">
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

function TaskRow({
  task,
  channelName,
  dueLabel,
  isOverdue,
  onToggle,
  onClick,
}: {
  task: Task
  channelName?: string
  dueLabel?: string
  isOverdue?: boolean
  onToggle: () => void
  onClick: () => void
}) {
  return (
    <div
      className="group flex items-center gap-3 py-3 cursor-pointer hover:bg-white/[0.02] -mx-2 px-2 rounded-md transition-colors"
      onClick={onClick}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <TaskCheckbox status={task.status} onToggle={onToggle} size="sm" />
      </div>
      <span className="flex-1 text-[14px] text-white/80 min-w-0 truncate">
        {task.title}
      </span>
      {dueLabel && (
        <span className={`text-[11px] flex-shrink-0 ${isOverdue ? 'text-red-400/60' : 'text-white/30'}`}>
          {dueLabel}
        </span>
      )}
      {channelName && (
        <span className="text-[11px] text-white/20 flex-shrink-0 max-w-[100px] truncate">
          {channelName}
        </span>
      )}
    </div>
  )
}
