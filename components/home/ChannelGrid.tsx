'use client'

import { useMemo, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useStore } from '@/lib/store'
import { useServerSync } from '@/components/providers/ServerSyncProvider'
import { ChannelCard } from './ChannelCard'
// SporeBackground removed - provided by root layout's AmbientBackground
import type { Task, ID } from '@/lib/types'
import type { PresenceUser } from '@/lib/sync/pusherClient'
import { getPresenceMembers, subscribeToPresence, setPresenceCallback } from '@/lib/sync/pusherClient'
import { isServerMode } from '@/lib/api/sync'

interface ChannelGridProps {
  onCreateChannel: () => void
}

export function ChannelGrid({ onCreateChannel }: ChannelGridProps) {
  const { data: session, status: sessionStatus } = useSession()
  const { isLoading: isServerLoading } = useServerSync()
  const channels = useStore((s) => s.channels)
  const channelOrder = useStore((s) => s.channelOrder)
  const folderOrder = useStore((s) => s.folderOrder)
  const folders = useStore((s) => s.folders)
  const tasks = useStore((s) => s.tasks)
  const hasHydrated = useStore((s) => s._hasHydrated)

  // Track active users per channel
  const [activeUsersMap, setActiveUsersMap] = useState<Record<string, PresenceUser[]>>({})

  // Get all channel IDs in order (folders first, then root channels)
  const orderedChannelIds = useMemo(() => {
    const result: string[] = []

    // Add channels from folders in order
    for (const folderId of folderOrder) {
      const folder = folders[folderId]
      if (folder?.channelIds) {
        result.push(...folder.channelIds)
      }
    }

    // Add root channels
    result.push(...channelOrder)

    return result
  }, [folderOrder, folders, channelOrder])

  // Get tasks by channel
  const tasksByChannel = useMemo(() => {
    const map: Record<ID, Task[]> = {}
    for (const task of Object.values(tasks)) {
      if (!map[task.channelId]) {
        map[task.channelId] = []
      }
      map[task.channelId].push(task)
    }
    return map
  }, [tasks])

  // Subscribe to presence for all channels
  useEffect(() => {
    if (!isServerMode()) return

    // Set up presence callback
    setPresenceCallback((members) => {
      // This callback is for the current presence channel
      // We'll update based on individual subscriptions
    })

    // Subscribe to each channel's presence
    for (const channelId of orderedChannelIds) {
      subscribeToPresence(channelId)

      // Get initial presence members
      const members = getPresenceMembers(channelId)
      if (members.length > 0) {
        setActiveUsersMap(prev => ({
          ...prev,
          [channelId]: members
        }))
      }
    }
  }, [orderedChannelIds])

  // Show loading state until both local hydration and server sync complete
  // For authenticated users, we need to wait for server data to prevent race conditions
  const isFullyLoaded = hasHydrated && (sessionStatus !== 'authenticated' || !isServerLoading)

  if (!isFullyLoaded) {
    return (
      <div className="relative flex h-full items-center justify-center">
        <div className="animate-pulse text-white/50">Loading...</div>
      </div>
    )
  }

  const channelList = orderedChannelIds
    .map((id) => channels[id])
    .filter(Boolean)

  if (channelList.length === 0) {
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

  return (
    <div className="relative min-h-full">
      <div className="relative z-10 p-6 md:p-8 lg:p-10">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Your Channels</h1>
            <p className="mt-1 text-white/50">
              {channelList.length} channel{channelList.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onCreateChannel}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 font-medium text-white transition-colors hover:bg-violet-700"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Channel
          </button>
        </div>

        {/* Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {channelList.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              tasks={tasksByChannel[channel.id] || []}
              owner={session?.user ? {
                id: session.user.id!,
                name: session.user.name ?? null,
                image: session.user.image ?? null,
              } : undefined}
              activeUsers={activeUsersMap[channel.id] || []}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
