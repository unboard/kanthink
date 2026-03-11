'use client'

import { useMemo, useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { useChannelMembers } from '@/lib/hooks/useChannelMembers'
import type { Channel, Task } from '@/lib/types'

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

interface PresenceUser {
  id: string
  info: {
    name: string
    image: string | null
    color: string
  }
}

interface ChannelListItemProps {
  channel: Channel
  tasks: Task[]
  owner?: {
    id: string
    name: string | null
    image: string | null
  }
  activeUsers?: PresenceUser[]
  streak?: { hot: number; cold: number }
  onShare?: (channelId: string) => void
}

export function ChannelListItem({ channel, tasks, owner, activeUsers = [], streak, onShare }: ChannelListItemProps) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { members } = useChannelMembers(channel.id)

  const favoriteChannelIds = useStore((s) => s.favoriteChannelIds)
  const toggleFavorite = useStore((s) => s.toggleFavorite)
  const deleteChannel = useStore((s) => s.deleteChannel)
  const duplicateChannel = useStore((s) => s.duplicateChannel)

  const isFavorite = favoriteChannelIds.includes(channel.id)

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

  const taskStats = useMemo(() => {
    const total = tasks.length
    const completed = tasks.filter((t) => t.status === 'done').length
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
    return { total, completed, percentage }
  }, [tasks])

  const people = useMemo(() => {
    const result: Array<{
      id: string
      name: string
      image: string | null
      isActive: boolean
    }> = []

    if (members.length > 0) {
      for (const member of members) {
        const isActive = activeUsers.some((u) => u.id.startsWith(member.id))
        result.push({
          id: member.id,
          name: member.name || 'User',
          image: member.image,
          isActive,
        })
      }
    } else if (owner) {
      const isActive = activeUsers.some((u) => u.id.startsWith(owner.id))
      result.push({
        id: owner.id,
        name: owner.name || 'Owner',
        image: owner.image,
        isActive,
      })
    }

    return result
  }, [members, owner, activeUsers])

  const modifiedAt = useMemo(() => {
    try {
      return formatRelativeTime(new Date(channel.updatedAt))
    } catch {
      return ''
    }
  }, [channel.updatedAt])

  const handleClick = () => router.push(`/channel/${channel.id}`)
  const handleStarClick = (e: React.MouseEvent) => { e.stopPropagation(); toggleFavorite(channel.id) }
  const handleMenuClick = (e: React.MouseEvent) => { e.stopPropagation(); setMenuOpen(!menuOpen); setShowDeleteConfirm(false) }

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newChannel = duplicateChannel(channel.id)
    setMenuOpen(false)
    if (newChannel) router.push(`/channel/${newChannel.id}`)
  }

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuOpen(false)
    if (onShare) onShare(channel.id)
    else router.push(`/channel/${channel.id}?share=true`)
  }

  const handleDeleteClick = (e: React.MouseEvent) => { e.stopPropagation(); setShowDeleteConfirm(true) }
  const handleConfirmDelete = (e: React.MouseEvent) => { e.stopPropagation(); deleteChannel(channel.id); setMenuOpen(false); setShowDeleteConfirm(false) }
  const handleCancelDelete = (e: React.MouseEvent) => { e.stopPropagation(); setShowDeleteConfirm(false) }

  return (
    <div
      onClick={handleClick}
      className="group flex items-center gap-3 px-4 py-3.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08] transition-all duration-150 cursor-pointer"
    >
      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white/90 group-hover:text-white truncate transition-colors">
            {channel.name}
          </h3>
          {channel.status === 'paused' && (
            <span className="flex-shrink-0 rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-medium text-amber-400/80">
              Paused
            </span>
          )}
        </div>
        {channel.description && (
          <p className="text-xs text-white/30 group-hover:text-white/40 truncate mt-0.5 transition-colors">
            {channel.description}
          </p>
        )}
      </div>

      {/* Hot/cold streak */}
      {streak && (streak.hot > 0 || streak.cold > 0) && (
        <div className="flex items-center gap-1 flex-shrink-0" title={
          streak.hot > 0
            ? `${streak.hot} day${streak.hot !== 1 ? 's' : ''} active streak`
            : `${streak.cold} day${streak.cold !== 1 ? 's' : ''} inactive`
        }>
          {streak.hot > 0 ? (
            <>
              <svg className="w-3.5 h-3.5 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
              </svg>
              <span className="text-[11px] font-semibold text-orange-400 tabular-nums">{streak.hot}d</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5 text-blue-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
              <span className="text-[11px] font-medium text-blue-400/50 tabular-nums">{streak.cold}d</span>
            </>
          )}
        </div>
      )}

      {/* Task progress — compact */}
      <div className="hidden sm:flex items-center gap-2 flex-shrink-0 w-36 justify-end">
        {taskStats.total > 0 ? (
          <>
            <div className="h-1 w-16 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${taskStats.percentage}%` }}
              />
            </div>
            <span className="text-xs text-white/50 tabular-nums whitespace-nowrap w-10 text-right">
              {taskStats.completed}/{taskStats.total}
            </span>
          </>
        ) : (
          <span className="text-xs text-white/25 w-full text-right">No tasks</span>
        )}
      </div>

      {/* Member avatars — compact */}
      <div className="hidden md:flex items-center -space-x-1.5 flex-shrink-0">
        {people.slice(0, 3).map((person) => (
          <div
            key={person.id}
            className="relative rounded-full ring-1 ring-zinc-900/80"
            title={person.name}
          >
            {person.image ? (
              <Image
                src={person.image}
                alt={person.name}
                width={22}
                height={22}
                className="rounded-full"
              />
            ) : (
              <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-[9px] font-bold text-white">
                {person.name.charAt(0).toUpperCase()}
              </div>
            )}
            {person.isActive && (
              <div className="absolute -bottom-px -right-px h-2 w-2 rounded-full border border-zinc-900/80 bg-emerald-400" />
            )}
          </div>
        ))}
        {people.length > 3 && (
          <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white/10 text-[9px] font-medium text-white/60 ring-1 ring-zinc-900/80">
            +{people.length - 3}
          </div>
        )}
      </div>

      {/* Last modified */}
      {modifiedAt && (
        <span className="hidden sm:block text-xs text-white/30 flex-shrink-0 w-14 text-right tabular-nums">
          {modifiedAt}
        </span>
      )}

      {/* Actions */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          onClick={handleStarClick}
          className={`p-1 rounded-md transition-colors ${
            isFavorite
              ? 'text-amber-400 hover:bg-amber-400/20'
              : 'text-white/20 hover:text-white/50 hover:bg-white/10 opacity-0 group-hover:opacity-100'
          }`}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <svg className="w-3.5 h-3.5" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </button>

        <div ref={menuRef} className="relative">
          <button
            onClick={handleMenuClick}
            className="p-1 rounded-md text-white/20 hover:text-white/50 hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
            title="More options"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute top-full right-0 mt-1 w-40 rounded-lg bg-zinc-800 border border-white/10 shadow-xl py-1 z-20">
              {showDeleteConfirm ? (
                <div className="px-3 py-2">
                  <p className="text-xs text-white/70 mb-2">Delete this channel?</p>
                  <div className="flex gap-2">
                    <button onClick={handleConfirmDelete} className="flex-1 px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors">Delete</button>
                    <button onClick={handleCancelDelete} className="flex-1 px-2 py-1 text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <button onClick={handleDuplicate} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    Duplicate
                  </button>
                  <button onClick={handleShare} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                    Share
                  </button>
                  {channel.role === 'owner' && (
                    <>
                      <div className="h-px bg-white/10 my-1" />
                      <button onClick={handleDeleteClick} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        Delete
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
