'use client'

import { useMemo, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useStore } from '@/lib/store'
import { useServerSync } from '@/components/providers/ServerSyncProvider'
import { ChannelCard } from './ChannelCard'
// SporeBackground removed - provided by root layout's AmbientBackground
import type { Task, ID, Channel, SharedByInfo } from '@/lib/types'
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

  // Split into owned and shared channels
  const myChannels = channelList.filter((c) => !c.sharedBy)
  const sharedChannels = channelList.filter((c) => c.sharedBy)

  // Sort channels by last modified (most recent first)
  const sortByModified = (a: Channel, b: Channel) => {
    const aTime = new Date(a.updatedAt).getTime()
    const bTime = new Date(b.updatedAt).getTime()
    return bTime - aTime
  }

  // Build set of channel IDs that live in folders (owned only)
  const channelIdToFolder = new Map<string, string>()
  for (const folderId of folderOrder) {
    const folder = folders[folderId]
    if (folder && !folder.isVirtual) {
      for (const chId of folder.channelIds) {
        channelIdToFolder.set(chId, folderId)
      }
    }
  }

  // Root-level owned channels (not in any folder), sorted by last modified
  const rootMyChannels = myChannels
    .filter((c) => !channelIdToFolder.has(c.id))
    .sort(sortByModified)

  // Folder sections with their owned channels, sorted by last modified
  const folderSections = folderOrder
    .map((folderId) => {
      const folder = folders[folderId]
      if (!folder || folder.isVirtual) return null
      const folderChannels = (folder.channelIds ?? [])
        .map((id) => channels[id])
        .filter((c): c is Channel => !!c && !c.sharedBy)
        .sort(sortByModified)
      if (folderChannels.length === 0) return null
      return { folder, channels: folderChannels }
    })
    .filter(Boolean) as { folder: typeof folders[string]; channels: Channel[] }[]

  // Group shared channels by sharer, sorted by last modified
  const sharedByPerson = sharedChannels.reduce((acc, ch) => {
    const sharerId = ch.sharedBy?.id || 'unknown'
    if (!acc[sharerId]) {
      acc[sharerId] = {
        sharer: ch.sharedBy!,
        channels: [],
      }
    }
    acc[sharerId].channels.push(ch)
    return acc
  }, {} as Record<string, { sharer: SharedByInfo; channels: Channel[] }>)

  // Sort each sharer's channels
  for (const group of Object.values(sharedByPerson)) {
    group.channels.sort(sortByModified)
  }

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
              {myChannels.length} channel{myChannels.length !== 1 ? 's' : ''}
              {sharedChannels.length > 0 && ` · ${sharedChannels.length} shared`}
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

        {/* Root channels (not in any folder) */}
        {rootMyChannels.length > 0 && (
          <div className="-mx-6 px-6 md:-mx-8 md:px-8 lg:-mx-10 lg:px-10 overflow-x-auto scrollbar-none">
            <div className="flex gap-4 pb-2" style={{ minWidth: 'min-content' }}>
              {rootMyChannels.map((channel) => (
                <div key={channel.id} className="w-72 flex-shrink-0">
                  <ChannelCard
                    channel={channel}
                    tasks={tasksByChannel[channel.id] || []}
                    owner={session?.user ? {
                      id: session.user.id!,
                      name: session.user.name ?? null,
                      image: session.user.image ?? null,
                    } : undefined}
                    activeUsers={activeUsersMap[channel.id] || []}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Folder sections */}
        {folderSections.map(({ folder, channels: folderChannels }) => (
          <div key={folder.id} className="mt-10">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <h2 className="text-lg font-semibold text-white">{folder.name}</h2>
              </div>
              <span className="text-sm text-white/40">{folderChannels.length}</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>
            <div className="-mx-6 px-6 md:-mx-8 md:px-8 lg:-mx-10 lg:px-10 overflow-x-auto scrollbar-none">
              <div className="flex gap-4 pb-2" style={{ minWidth: 'min-content' }}>
                {folderChannels.map((channel) => (
                  <div key={channel.id} className="w-72 flex-shrink-0">
                    <ChannelCard
                      channel={channel}
                      tasks={tasksByChannel[channel.id] || []}
                      owner={session?.user ? {
                        id: session.user.id!,
                        name: session.user.name ?? null,
                        image: session.user.image ?? null,
                      } : undefined}
                      activeUsers={activeUsersMap[channel.id] || []}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        {/* Shared with me Section */}
        {sharedChannels.length > 0 && (
          <div className="mt-12">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <h2 className="text-lg font-semibold text-white">Shared with me</h2>
              </div>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            {/* Group by sharer */}
            <div className="space-y-8">
              {Object.values(sharedByPerson).map(({ sharer, channels: sharerChannels }) => (
                <div key={sharer.id}>
                  {/* Sharer header */}
                  <div className="mb-3 flex items-center gap-2">
                    {sharer.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={sharer.image}
                        alt={sharer.name || 'Sharer'}
                        className="h-6 w-6 rounded-full"
                      />
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/20">
                        <span className="text-xs font-medium text-violet-300">
                          {(sharer.name || sharer.email)?.[0]?.toUpperCase() || '?'}
                        </span>
                      </div>
                    )}
                    <span className="text-sm font-medium text-white/70">
                      {sharer.name || sharer.email}
                    </span>
                  </div>

                  {/* Sharer's channels */}
                  <div className="-mx-6 px-6 md:-mx-8 md:px-8 lg:-mx-10 lg:px-10 overflow-x-auto scrollbar-none">
                    <div className="flex gap-4 pb-2" style={{ minWidth: 'min-content' }}>
                      {sharerChannels.map((channel) => (
                        <div key={channel.id} className="w-72 flex-shrink-0">
                          <ChannelCard
                            channel={channel}
                            tasks={tasksByChannel[channel.id] || []}
                            owner={sharer}
                            activeUsers={activeUsersMap[channel.id] || []}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
