'use client'

import { useMemo, useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { useServerSync } from '@/components/providers/ServerSyncProvider'
import { ChannelListItem } from './ChannelListItem'
import type { Task, ID, Channel, Card, TaskStatus } from '@/lib/types'
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

/** Parse a timestamp string to ms, handling ISO strings and epoch integers */
function parseTimestamp(ts: string | undefined | null): number {
  if (!ts) return NaN
  const d = new Date(ts)
  let ms = d.getTime()
  if (!isNaN(ms)) return ms
  // Try as epoch integer (seconds)
  const num = Number(ts)
  if (!isNaN(num)) {
    // If it looks like seconds (< year 2100 in seconds), multiply by 1000
    ms = num < 4102444800 ? num * 1000 : num
    return ms
  }
  return NaN
}

/** Convert ms timestamp to a local day number for comparison */
function toLocalDayNum(ms: number): number {
  const d = new Date(ms)
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.floor(local.getTime() / 86400000)
}

/** Compute per-channel hot/cold streak */
function computeChannelStreak(
  channel: Channel,
  cards: Record<ID, Card>,
  tasks: Record<ID, Task>,
): { hot: number; cold: number } {
  const todayDayNum = toLocalDayNum(Date.now())
  const activeDayNums = new Set<number>()

  const addTs = (ts: string | undefined | null) => {
    const ms = parseTimestamp(ts)
    if (!isNaN(ms)) activeDayNums.add(toLocalDayNum(ms))
  }

  // Channel's own timestamps
  addTs(channel.updatedAt)
  addTs(channel.createdAt)

  // Cards in this channel
  for (const card of Object.values(cards)) {
    if (card.channelId === channel.id) addTs(card.updatedAt)
  }
  // Tasks in this channel
  for (const task of Object.values(tasks)) {
    if (task.channelId === channel.id) addTs(task.updatedAt)
  }

  // Hot: consecutive days including today
  let hot = 0
  for (let i = 0; i < 365; i++) {
    if (activeDayNums.has(todayDayNum - i)) hot++
    else break
  }

  // Cold: days since last activity (only if not active today)
  let cold = 0
  if (hot === 0 && activeDayNums.size > 0) {
    const maxDayNum = Math.max(...activeDayNums)
    cold = todayDayNum - maxDayNum
  }

  return { hot, cold }
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

  // Per-channel hot/cold streaks
  const channelStreaks = useMemo(() => {
    const map: Record<string, { hot: number; cold: number }> = {}
    for (const ch of Object.values(channels)) {
      map[ch.id] = computeChannelStreak(ch, cards, tasks)
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

  // Root channels = unfiled own channels + all shared channels
  const rootMyChannels = [
    ...myChannels.filter((c) => !channelIdToFolder.has(c.id)),
    ...sharedChannels,
  ].sort(sortByModified)

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

  // Group root channels as a virtual section, sort all sections by modified time
  type Section = { type: 'root'; channels: Channel[]; groupModified: number } | { type: 'folder'; folder: typeof folders[string]; channels: Channel[]; folderModified: number }
  const allSections: Section[] = [
    ...(rootMyChannels.length > 0
      ? [{ type: 'root' as const, channels: rootMyChannels, groupModified: Math.max(...rootMyChannels.map(c => channelModifiedTime[c.id] || 0)) }]
      : []),
    ...folderSections.map(f => ({ type: 'folder' as const, ...f })),
  ].sort((a, b) => {
    const aTime = a.type === 'root' ? a.groupModified : a.folderModified
    const bTime = b.type === 'root' ? b.groupModified : b.folderModified
    return bTime - aTime
  })

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
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>
            {/* Channels / Tasks toggle */}
            <div className="flex items-center bg-white/[0.06] rounded-lg p-0.5 sm:p-1">
              <button
                onClick={() => setDashboardView('channels')}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 text-xs sm:text-sm rounded-md transition-all ${
                  dashboardView === 'channels'
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <span className="hidden xs:inline">Channels</span>
              </button>
              <button
                onClick={() => setDashboardView('tasks')}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 text-xs sm:text-sm rounded-md transition-all ${
                  dashboardView === 'tasks'
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                <span className="hidden xs:inline">Tasks</span>
              </button>
            </div>
          </div>
          <button
            onClick={onCreateChannel}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-violet-500 active:scale-[0.97]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Channel</span>
          </button>
        </div>

        {/* Summary stats */}
        <div className="mb-8 flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.04]">
            <span className="text-white/80 font-semibold tabular-nums">{stats.totalChannels}</span>
            <span className="text-white/40">channels</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.04]">
            <span className="text-white/80 font-semibold tabular-nums">{stats.completedTasks}/{stats.totalTasks}</span>
            <span className="text-white/40">tasks done</span>
          </div>
          {stats.streak > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-orange-500/[0.08]">
              <span className="text-orange-400 font-semibold tabular-nums">{stats.streak}d</span>
              <span className="text-orange-400/60">streak</span>
            </div>
          )}
        </div>

        {dashboardView === 'channels' ? (
          <>
            {/* Sections: grouped root channels + folders, sorted by modified */}
            <div className="space-y-5">
              {allSections.map((section) => {
                if (section.type === 'root') {
                  const isCollapsed = collapsedFolders.has('__root__')
                  return (
                    <div key="__root__">
                      <button
                        onClick={() => toggleFolder('__root__')}
                        className="w-full flex items-center gap-2 py-1 px-1 mb-2 group/folder"
                      >
                        <svg
                          className={`h-3 w-3 text-white/25 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
                        </svg>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-white/40 group-hover/folder:text-white/60 transition-colors">
                          Channels
                        </span>
                        <span className="text-[11px] text-white/20 font-medium">{section.channels.length}</span>
                        <div className="h-px flex-1 bg-gradient-to-r from-white/[0.06] to-transparent" />
                      </button>
                      {!isCollapsed && (
                        <div className="space-y-1">
                          {section.channels.map((channel) => (
                            <ChannelListItem
                              key={channel.id}
                              channel={channel}
                              tasks={tasksByChannel[channel.id] || []}
                              owner={ownerProps}
                              activeUsers={activeUsersMap[channel.id] || []}
                              streak={channelStreaks[channel.id]}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                }

                const isCollapsed = collapsedFolders.has(section.folder.id)
                return (
                  <div key={section.folder.id}>
                    <button
                      onClick={() => toggleFolder(section.folder.id)}
                      className="w-full flex items-center gap-2 py-1 px-1 mb-2 group/folder"
                    >
                      <svg
                        className={`h-3 w-3 text-white/25 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
                      </svg>
                      <svg className="h-3.5 w-3.5 text-amber-400/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-white/40 group-hover/folder:text-white/60 transition-colors">
                        {section.folder.name}
                      </span>
                      <span className="text-[11px] text-white/20 font-medium">{section.channels.length}</span>
                      <div className="h-px flex-1 bg-gradient-to-r from-white/[0.06] to-transparent" />
                    </button>
                    {!isCollapsed && (
                      <div className="space-y-1">
                        {section.channels.map((channel) => (
                          <ChannelListItem
                            key={channel.id}
                            channel={channel}
                            tasks={tasksByChannel[channel.id] || []}
                            owner={ownerProps}
                            activeUsers={activeUsersMap[channel.id] || []}
                            streak={channelStreaks[channel.id]}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

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
