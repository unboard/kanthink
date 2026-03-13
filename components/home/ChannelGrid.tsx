'use client'

import { useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { useServerSync } from '@/components/providers/ServerSyncProvider'
import { TaskCheckbox } from '@/components/board/TaskCheckbox'
import type { Task } from '@/lib/types'

/** Parse a timestamp string to ms, handling ISO strings and epoch integers */
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

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatDueDate(dueDateStr: string): string {
  const ms = parseTimestamp(dueDateStr)
  if (isNaN(ms)) return ''
  const due = new Date(ms)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86400000)

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays > 1 && diffDays <= 6) {
    return due.toLocaleDateString(undefined, { weekday: 'short' })
  }
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface ChannelGridProps {
  onCreateChannel: () => void
}

export function ChannelGrid({ onCreateChannel }: ChannelGridProps) {
  const { status: sessionStatus } = useSession()
  const router = useRouter()
  const { isLoading: isServerLoading } = useServerSync()
  const channels = useStore((s) => s.channels)
  const tasks = useStore((s) => s.tasks)
  const hasHydrated = useStore((s) => s._hasHydrated)
  const toggleTaskStatus = useStore((s) => s.toggleTaskStatus)

  const hasData = Object.keys(channels).length > 0
  const isFullyLoaded = hasHydrated && (
    hasData ||
    sessionStatus === 'unauthenticated' ||
    (sessionStatus === 'authenticated' && !isServerLoading)
  )

  const inProgressTasks = useMemo(() => {
    return Object.values(tasks)
      .filter((t) => t.status === 'in_progress' && channels[t.channelId])
      .sort((a, b) => {
        const aMs = parseTimestamp(a.updatedAt)
        const bMs = parseTimestamp(b.updatedAt)
        return (isNaN(bMs) ? 0 : bMs) - (isNaN(aMs) ? 0 : aMs)
      })
  }, [tasks, channels])

  const dueSoonTasks = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const sevenDaysMs = today.getTime() + 7 * 86400000
    const inProgressIds = new Set(inProgressTasks.map((t) => t.id))

    return Object.values(tasks)
      .filter((t) => {
        if (t.status === 'done' || inProgressIds.has(t.id)) return false
        if (!channels[t.channelId]) return false
        if (!t.dueDate) return false
        const ms = parseTimestamp(t.dueDate)
        return !isNaN(ms) && ms <= sevenDaysMs
      })
      .sort((a, b) => {
        const aMs = parseTimestamp(a.dueDate!)
        const bMs = parseTimestamp(b.dueDate!)
        return (isNaN(aMs) ? 0 : aMs) - (isNaN(bMs) ? 0 : bMs)
      })
  }, [tasks, channels, inProgressTasks])

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

  const showBothSections = inProgressTasks.length > 0 && dueSoonTasks.length > 0
  const isEmpty = inProgressTasks.length === 0 && dueSoonTasks.length === 0

  return (
    <div className="relative min-h-full flex justify-center">
      <div className="w-full max-w-lg px-5 py-16 sm:py-24">
        {/* Greeting */}
        <p className="text-white/20 text-[15px] mb-12">{getGreeting()}</p>

        {isEmpty ? (
          <div className="text-center py-16">
            <p className="text-white/25 text-[14px]">Nothing in progress</p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* In Progress */}
            {inProgressTasks.length > 0 && (
              <section>
                {showBothSections && (
                  <h2 className="text-[11px] text-white/20 uppercase tracking-wider mb-3">In Progress</h2>
                )}
                <div>
                  {inProgressTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      channelName={channels[task.channelId]?.name}
                      onToggle={() => toggleTaskStatus(task.id)}
                      onClick={() => router.push(`/channel/${task.channelId}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Due Soon */}
            {dueSoonTasks.length > 0 && (
              <section>
                {showBothSections && (
                  <h2 className="text-[11px] text-white/20 uppercase tracking-wider mb-3">Due Soon</h2>
                )}
                <div>
                  {dueSoonTasks.map((task) => (
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
          </div>
        )}

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

function TaskRow({
  task,
  channelName,
  dueLabel,
  onToggle,
  onClick,
}: {
  task: Task
  channelName?: string
  dueLabel?: string
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
        <span className="text-[11px] text-white/30 flex-shrink-0">{dueLabel}</span>
      )}
      {channelName && (
        <span className="text-[11px] text-white/25 flex-shrink-0 max-w-[120px] truncate">
          {channelName}
        </span>
      )}
    </div>
  )
}
