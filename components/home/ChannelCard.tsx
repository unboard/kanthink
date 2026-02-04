'use client'

import { useMemo } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import type { Channel, Task, ID } from '@/lib/types'

// Simple relative time formatter without external dependencies
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`
  if (diffDay < 365) return `${Math.floor(diffDay / 30)}mo ago`
  return `${Math.floor(diffDay / 365)}y ago`
}

interface ChannelShare {
  id: string
  userId: string | null
  user?: {
    id: string
    name: string | null
    image: string | null
  }
}

interface PresenceUser {
  id: string
  info: {
    name: string
    image: string | null
    color: string
  }
}

interface ChannelCardProps {
  channel: Channel
  tasks: Task[]
  shares?: ChannelShare[]
  owner?: {
    id: string
    name: string | null
    image: string | null
  }
  activeUsers?: PresenceUser[]
}

export function ChannelCard({ channel, tasks, shares = [], owner, activeUsers = [] }: ChannelCardProps) {
  const router = useRouter()

  // Calculate task stats
  const taskStats = useMemo(() => {
    const total = tasks.length
    const completed = tasks.filter((t) => t.status === 'done').length
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
    return { total, completed, inProgress, percentage }
  }, [tasks])

  // Get people with access (owner + shares)
  const people = useMemo(() => {
    const result: Array<{
      id: string
      name: string
      image: string | null
      isActive: boolean
    }> = []

    // Add owner first
    if (owner) {
      const isActive = activeUsers.some((u) => u.id.startsWith(owner.id))
      result.push({
        id: owner.id,
        name: owner.name || 'Owner',
        image: owner.image,
        isActive,
      })
    }

    // Add shares
    for (const share of shares) {
      if (share.user) {
        const isActive = activeUsers.some((u) => u.id.startsWith(share.user!.id))
        result.push({
          id: share.user.id,
          name: share.user.name || 'User',
          image: share.user.image,
          isActive,
        })
      }
    }

    return result
  }, [owner, shares, activeUsers])

  const createdAt = useMemo(() => {
    try {
      return formatRelativeTime(new Date(channel.createdAt))
    } catch {
      return ''
    }
  }, [channel.createdAt])

  return (
    <button
      onClick={() => router.push(`/channel/${channel.id}`)}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 text-left backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/10 hover:shadow-lg hover:shadow-cyan-500/5"
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <h3 className="text-lg font-semibold text-white group-hover:text-cyan-100 transition-colors line-clamp-2">
          {channel.name}
        </h3>
        {channel.status === 'paused' && (
          <span className="ml-2 flex-shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300">
            Paused
          </span>
        )}
      </div>

      {/* Description */}
      {channel.description && (
        <p className="mb-4 text-sm text-white/50 line-clamp-2">
          {channel.description}
        </p>
      )}

      {/* Task progress */}
      {taskStats.total > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-white/60 mb-1.5">
            <span>
              {taskStats.completed}/{taskStats.total} tasks
            </span>
            <span>{taskStats.percentage}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 transition-all duration-300"
              style={{ width: `${taskStats.percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between pt-2">
        {/* People avatars */}
        <div className="flex items-center -space-x-2">
          {people.slice(0, 4).map((person) => (
            <div
              key={person.id}
              className="relative rounded-full ring-2 ring-zinc-900/50"
              title={person.name}
            >
              {person.image ? (
                <Image
                  src={person.image}
                  alt={person.name}
                  width={28}
                  height={28}
                  className="rounded-full"
                />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-xs font-bold text-white">
                  {person.name.charAt(0).toUpperCase()}
                </div>
              )}
              {/* Active indicator */}
              {person.isActive && (
                <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-zinc-900/50 bg-emerald-400" />
              )}
            </div>
          ))}
          {people.length > 4 && (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-white/70 ring-2 ring-zinc-900/50">
              +{people.length - 4}
            </div>
          )}
        </div>

        {/* Created date */}
        {createdAt && (
          <span className="text-xs text-white/40">
            {createdAt}
          </span>
        )}
      </div>

      {/* Subtle glow effect on hover */}
      <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-cyan-500/0 via-cyan-500/0 to-violet-500/0 opacity-0 transition-opacity group-hover:opacity-20 pointer-events-none" />
    </button>
  )
}
