'use client'

import { useMemo, useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
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
  onShare?: (channelId: string) => void
}

export function ChannelCard({ channel, tasks, shares = [], owner, activeUsers = [], onShare }: ChannelCardProps) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const favoriteChannelIds = useStore((s) => s.favoriteChannelIds)
  const toggleFavorite = useStore((s) => s.toggleFavorite)
  const deleteChannel = useStore((s) => s.deleteChannel)
  const duplicateChannel = useStore((s) => s.duplicateChannel)

  const isFavorite = favoriteChannelIds.includes(channel.id)

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
        setShowDeleteConfirm(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

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

  const handleCardClick = () => {
    router.push(`/channel/${channel.id}`)
  }

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleFavorite(channel.id)
  }

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuOpen(!menuOpen)
    setShowDeleteConfirm(false)
  }

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newChannel = duplicateChannel(channel.id)
    setMenuOpen(false)
    if (newChannel) {
      router.push(`/channel/${newChannel.id}`)
    }
  }

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuOpen(false)
    if (onShare) {
      onShare(channel.id)
    } else {
      // Navigate to channel with share drawer open
      router.push(`/channel/${channel.id}?share=true`)
    }
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    deleteChannel(channel.id)
    setMenuOpen(false)
    setShowDeleteConfirm(false)
  }

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowDeleteConfirm(false)
  }

  return (
    <div
      onClick={handleCardClick}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 text-left backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/10 hover:shadow-lg hover:shadow-cyan-500/5 cursor-pointer"
    >
      {/* Top right actions */}
      <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
        {/* Star button */}
        <button
          onClick={handleStarClick}
          className={`p-1.5 rounded-lg transition-colors ${
            isFavorite
              ? 'text-amber-400 hover:bg-amber-400/20'
              : 'text-white/40 hover:text-white/70 hover:bg-white/10'
          }`}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <svg
            className="w-4 h-4"
            fill={isFavorite ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
            />
          </svg>
        </button>

        {/* Menu button */}
        <div ref={menuRef} className="relative">
          <button
            onClick={handleMenuClick}
            className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
            title="More options"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
            </svg>
          </button>

          {/* Dropdown menu */}
          {menuOpen && (
            <div className="absolute top-full right-0 mt-1 w-40 rounded-lg bg-zinc-800 border border-white/10 shadow-xl py-1 z-20">
              {showDeleteConfirm ? (
                <div className="px-3 py-2">
                  <p className="text-xs text-white/70 mb-2">Delete this channel?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleConfirmDelete}
                      className="flex-1 px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
                    >
                      Delete
                    </button>
                    <button
                      onClick={handleCancelDelete}
                      className="flex-1 px-2 py-1 text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    onClick={handleDuplicate}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Duplicate
                  </button>
                  <button
                    onClick={handleShare}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    Share
                  </button>
                  <div className="h-px bg-white/10 my-1" />
                  <button
                    onClick={handleDeleteClick}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="mb-3 flex items-start justify-between pr-8">
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
              className="h-full rounded-full bg-green-500 transition-all duration-300"
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
    </div>
  )
}
