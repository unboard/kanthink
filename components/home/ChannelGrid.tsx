'use client'

import { useMemo, useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { useServerSync } from '@/components/providers/ServerSyncProvider'
import { ChannelListItem } from './ChannelListItem'
import type { Task, ID, Channel, SharedByInfo, Card, TaskStatus } from '@/lib/types'
import type { PresenceUser } from '@/lib/sync/pusherClient'
import { getPresenceMembers, subscribeToPresence, setPresenceCallback } from '@/lib/sync/pusherClient'
import { isServerMode } from '@/lib/api/sync'
import { TaskCheckbox } from '@/components/board/TaskCheckbox'

const COLLAPSED_FOLDERS_KEY = 'kanthink-collapsed-folders'

function getCollapsedFolders(): Set<string> {
  try {
    const stored = localStorage.getItem(COLLAPSED_FOLDERS_KEY)
    return stored ? new Set(JSON.parse(stored)) : new Set()
  } catch {
    return new Set()
  }
}

function saveCollapsedFolders(set: Set<string>) {
  localStorage.setItem(COLLAPSED_FOLDERS_KEY, JSON.stringify([...set]))
}

/** Compute effective last-modified for a channel (considers cards + tasks) */
function getEffectiveModified(
  channel: Channel,
  cards: Record<ID, Card>,
  tasks: Record<ID, Task>,
): number {
  let latest = new Date(channel.updatedAt).getTime()

  // Check cards in this channel
  for (const card of Object.values(cards)) {
    if (card.channelId === channel.id) {
      const cardTime = new Date(card.updatedAt).getTime()
      if (cardTime > latest) latest = cardTime
    }
  }

  // Check tasks in this channel
  for (const task of Object.values(tasks)) {
    if (task.channelId === channel.id) {
      const taskTime = new Date(task.updatedAt).getTime()
      if (taskTime > latest) latest = taskTime
    }
  }

  return latest
}

/** Compute active streak (consecutive days with any channel/card/task modification) */
function computeActiveStreak(channels: Record<ID, Channel>, cards: Record<ID, Card>, tasks: Record<ID, Task>): number {
  // Collect all unique active dates
  const activeDays = new Set<string>()
  const toDateStr = (ts: string) => {
    try {
      const d = new Date(ts)
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    } catch { return '' }
  }

  for (const ch of Object.values(channels)) {
    const ds = toDateStr(ch.updatedAt)
    if (ds) activeDays.add(ds)
    const cs = toDateStr(ch.createdAt)
    if (cs) activeDays.add(cs)
  }
  for (const card of Object.values(cards)) {
    const ds = toDateStr(card.updatedAt)
    if (ds) activeDays.add(ds)
  }
  for (const task of Object.values(tasks)) {
    const ds = toDateStr(task.updatedAt)
    if (ds) activeDays.add(ds)
  }

  // Count consecutive days back from today
  const today = new Date()
  let streak = 0
  for (let i = 0; i < 365; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (activeDays.has(key)) {
      streak++
    } else {
      break
    }
  }
  return streak
}

interface ChannelGridProps {
  onCreateChannel: () => void
}

type DashboardView = 'channels' | 'tasks'

export function ChannelGrid({ onCreateChannel }: ChannelGridProps) {
  const { data: session, status: sessionStatus } = useSession()
  const router = useRouter()
  const { isLoading: isServerLoading } = useServerSync()
  const channels = useStore((s) => s.channels)
  const channelOrder = useStore((s) => s.channelOrder)
  const folderOrder = useStore((s) => s.folderOrder)
  const folders = useStore((s) => s.folders)
  const tasks = useStore((s) => s.tasks)
  const cards = useStore((s) => s.cards)
  const hasHydrated = useStore((s) => s._hasHydrated)
  const toggleTaskStatus = useStore((s) => s.toggleTaskStatus)

  const [activeUsersMap, setActiveUsersMap] = useState<Record<string, PresenceUser[]>>({})
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const [dashboardView, setDashboardView] = useState<DashboardView>('channels')

  // Load collapsed state from localStorage
  useEffect(() => {
    setCollapsedFolders(getCollapsedFolders())
  }, [])

  const toggleFolder = useCallback((folderId: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      saveCollapsedFolders(next)
      return next
    })
  }, [])

  const orderedChannelIds = useMemo(() => {
    const result: string[] = []
    for (const folderId of folderOrder) {
      const folder = folders[folderId]
      if (folder?.channelIds) result.push(...folder.channelIds)
    }
    result.push(...channelOrder)
    return result
  }, [folderOrder, folders, channelOrder])

  const tasksByChannel = useMemo(() => {
    const map: Record<ID, Task[]> = {}
    for (const task of Object.values(tasks)) {
      if (!map[task.channelId]) map[task.channelId] = []
      map[task.channelId].push(task)
    }
    return map
  }, [tasks])

  // Subscribe to presence
  useEffect(() => {
    if (!isServerMode()) return
    setPresenceCallback(() => {})
    for (const channelId of orderedChannelIds) {
      subscribeToPresence(channelId)
      const members = getPresenceMembers(channelId)
      if (members.length > 0) {
        setActiveUsersMap(prev => ({ ...prev, [channelId]: members }))
      }
    }
  }, [orderedChannelIds])

  // Effective modified time per channel (for sorting)
  const channelModifiedTime = useMemo(() => {
    const map: Record<string, number> = {}
    for (const ch of Object.values(channels)) {
      map[ch.id] = getEffectiveModified(ch, cards, tasks)
    }
    return map
  }, [channels, cards, tasks])

  const hasData = Object.keys(channels).length > 0
  const isFullyLoaded = hasHydrated && (
    hasData ||
    sessionStatus === 'unauthenticated' ||
    (sessionStatus === 'authenticated' && !isServerLoading)
  )

  // Summary stats
  const stats = useMemo(() => {
    const allTasks = Object.values(tasks)
    const totalChannels = Object.values(channels).filter(c => !c.sharedBy).length
    const totalTasks = allTasks.length
    const completedTasks = allTasks.filter(t => t.status === 'done').length
    const streak = computeActiveStreak(channels, cards, tasks)
    return { totalChannels, totalTasks, completedTasks, streak }
  }, [channels, cards, tasks])

  if (!isFullyLoaded) {
    return (
      <div className="relative flex h-full items-center justify-center">
        <div className="animate-pulse text-white/50">Loading...</div>
      </div>
    )
  }

  const channelList = orderedChannelIds.map((id) => channels[id]).filter(Boolean)
  const myChannels = channelList.filter((c) => !c.sharedBy)
  const sharedChannels = channelList.filter((c) => c.sharedBy)

  const sortByModified = (a: Channel, b: Channel) => {
    return (channelModifiedTime[b.id] || 0) - (channelModifiedTime[a.id] || 0)
  }

  // Build channel → folder map
  const channelIdToFolder = new Map<string, string>()
  for (const folderId of folderOrder) {
    const folder = folders[folderId]
    if (folder && !folder.isVirtual) {
      for (const chId of folder.channelIds) {
        channelIdToFolder.set(chId, folderId)
      }
    }
  }

  const rootMyChannels = myChannels
    .filter((c) => !channelIdToFolder.has(c.id))
    .sort(sortByModified)

  // Folder sections — sorted by latest channel modified time
  const folderSections = folderOrder
    .map((folderId) => {
      const folder = folders[folderId]
      if (!folder || folder.isVirtual) return null
      const folderChannels = (folder.channelIds ?? [])
        .map((id) => channels[id])
        .filter((c): c is Channel => !!c && !c.sharedBy)
        .sort(sortByModified)
      if (folderChannels.length === 0) return null
      // Folder inherits latest modified from its channels
      const folderModified = Math.max(...folderChannels.map(c => channelModifiedTime[c.id] || 0))
      return { folder, channels: folderChannels, folderModified }
    })
    .filter(Boolean) as { folder: typeof folders[string]; channels: Channel[]; folderModified: number }[]

  // Sort everything into a single list: root channels + folders, by modified time
  type Section = { type: 'root'; channel: Channel } | { type: 'folder'; folder: typeof folders[string]; channels: Channel[]; folderModified: number }
  const sections: Section[] = [
    ...rootMyChannels.map(c => ({ type: 'root' as const, channel: c })),
    ...folderSections.map(f => ({ type: 'folder' as const, ...f })),
  ].sort((a, b) => {
    const aTime = a.type === 'root' ? (channelModifiedTime[a.channel.id] || 0) : a.folderModified
    const bTime = b.type === 'root' ? (channelModifiedTime[b.channel.id] || 0) : b.folderModified
    return bTime - aTime
  })

  // Group shared channels by sharer
  const sharedByPerson = sharedChannels.reduce((acc, ch) => {
    const sharerId = ch.sharedBy?.id || 'unknown'
    if (!acc[sharerId]) acc[sharerId] = { sharer: ch.sharedBy!, channels: [] }
    acc[sharerId].channels.push(ch)
    return acc
  }, {} as Record<string, { sharer: SharedByInfo; channels: Channel[] }>)
  for (const group of Object.values(sharedByPerson)) {
    group.channels.sort(sortByModified)
  }

  // All tasks for the master task list, grouped by channel
  const allTasksByChannel = useMemo(() => {
    const result: { channelId: string; channelName: string; tasks: Task[] }[] = []
    for (const ch of [...myChannels, ...sharedChannels].sort(sortByModified)) {
      const chTasks = tasksByChannel[ch.id]
      if (chTasks && chTasks.length > 0) {
        result.push({
          channelId: ch.id,
          channelName: ch.name,
          tasks: [...chTasks].sort((a, b) => {
            // Sort: not_started/in_progress first, then done
            const statusOrder: Record<TaskStatus, number> = { in_progress: 0, not_started: 1, on_hold: 2, done: 3 }
            return (statusOrder[a.status] ?? 2) - (statusOrder[b.status] ?? 2)
          }),
        })
      }
    }
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, channels, tasksByChannel])

  const ownerProps = session?.user ? {
    id: session.user.id!,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
  } : undefined

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
        {/* Header with toggle */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            {/* Channels / Tasks toggle */}
            <div className="flex items-center bg-white/5 rounded-lg p-0.5">
              <button
                onClick={() => setDashboardView('channels')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
                  dashboardView === 'channels'
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Channels
              </button>
              <button
                onClick={() => setDashboardView('tasks')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
                  dashboardView === 'tasks'
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                Tasks
              </button>
            </div>
          </div>
          <button
            onClick={onCreateChannel}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">New Channel</span>
          </button>
        </div>

        {/* Summary stats */}
        <div className="mb-6 flex items-center gap-6 text-xs text-white/50">
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span className="text-white/70 font-medium">{stats.totalChannels}</span> channels
          </div>
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <span className="text-white/70 font-medium">{stats.completedTasks}/{stats.totalTasks}</span> tasks done
          </div>
          {stats.streak > 0 && (
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-orange-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
              </svg>
              <span className="text-orange-400/80 font-medium">{stats.streak}d</span> streak
            </div>
          )}
        </div>

        {dashboardView === 'channels' ? (
          <>
            {/* Mixed sections: root channels + folders, sorted by modified */}
            <div className="space-y-1.5">
              {sections.map((section) => {
                if (section.type === 'root') {
                  return (
                    <ChannelListItem
                      key={section.channel.id}
                      channel={section.channel}
                      tasks={tasksByChannel[section.channel.id] || []}
                      owner={ownerProps}
                      activeUsers={activeUsersMap[section.channel.id] || []}
                    />
                  )
                }

                const isCollapsed = collapsedFolders.has(section.folder.id)
                return (
                  <div key={section.folder.id}>
                    <button
                      onClick={() => toggleFolder(section.folder.id)}
                      className="w-full flex items-center gap-2 py-2 px-1 group/folder"
                    >
                      <svg
                        className={`h-3 w-3 text-white/30 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
                      </svg>
                      <svg className="h-3.5 w-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      <span className="text-xs font-semibold text-white/70 group-hover/folder:text-white/90 transition-colors">
                        {section.folder.name}
                      </span>
                      <span className="text-xs text-white/30">{section.channels.length}</span>
                      <div className="h-px flex-1 bg-white/[0.04]" />
                    </button>
                    {!isCollapsed && (
                      <div className="space-y-1.5 pl-5">
                        {section.channels.map((channel) => (
                          <ChannelListItem
                            key={channel.id}
                            channel={channel}
                            tasks={tasksByChannel[channel.id] || []}
                            owner={ownerProps}
                            activeUsers={activeUsersMap[channel.id] || []}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Shared with me Section */}
            {sharedChannels.length > 0 && (
              <div className="mt-10">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <h2 className="text-sm font-semibold text-white">Shared with me</h2>
                  </div>
                  <div className="h-px flex-1 bg-white/[0.06]" />
                </div>
                <div className="space-y-6">
                  {Object.values(sharedByPerson).map(({ sharer, channels: sharerChannels }) => (
                    <div key={sharer.id}>
                      <div className="mb-2 flex items-center gap-2 pl-1">
                        {sharer.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={sharer.image} alt={sharer.name || 'Sharer'} className="h-5 w-5 rounded-full" />
                        ) : (
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-500/20">
                            <span className="text-[9px] font-medium text-violet-300">
                              {(sharer.name || sharer.email)?.[0]?.toUpperCase() || '?'}
                            </span>
                          </div>
                        )}
                        <span className="text-xs font-medium text-white/50">
                          {sharer.name || sharer.email}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {sharerChannels.map((channel) => (
                          <ChannelListItem
                            key={channel.id}
                            channel={channel}
                            tasks={tasksByChannel[channel.id] || []}
                            owner={sharer}
                            activeUsers={activeUsersMap[channel.id] || []}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* Master Task List */
          <div>
            {/* Task progress summary */}
            {stats.totalTasks > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-white/50 mb-1.5">
                  <span>{stats.completedTasks}/{stats.totalTasks} tasks completed</span>
                  <span>{stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all"
                    style={{ width: `${stats.totalTasks > 0 ? (stats.completedTasks / stats.totalTasks) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {allTasksByChannel.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-white/40">No tasks yet. Create tasks in your channels to see them here.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {allTasksByChannel.map(({ channelId, channelName, tasks: chTasks }) => (
                  <div key={channelId}>
                    <button
                      onClick={() => router.push(`/channel/${channelId}`)}
                      className="flex items-center gap-2 mb-2 group/ch hover:text-white transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      <span className="text-xs font-semibold text-white/60 group-hover/ch:text-white/90">{channelName}</span>
                      <span className="text-xs text-white/30">
                        {chTasks.filter(t => t.status === 'done').length}/{chTasks.length}
                      </span>
                    </button>
                    <div className="space-y-0.5">
                      {chTasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group/task"
                        >
                          <TaskCheckbox
                            status={task.status}
                            onToggle={() => toggleTaskStatus(task.id)}
                            size="sm"
                          />
                          <span className={`flex-1 text-sm truncate ${
                            task.status === 'done' ? 'text-white/30 line-through' : 'text-white/80'
                          }`}>
                            {task.title}
                          </span>
                          {task.status === 'in_progress' && (
                            <span className="text-[10px] font-medium text-blue-400/70 bg-blue-400/10 px-1.5 py-0.5 rounded">
                              In progress
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
