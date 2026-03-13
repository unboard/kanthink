'use client'

import { useMemo, useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { useServerSync } from '@/components/providers/ServerSyncProvider'
import { ChannelRow } from './ChannelRow'
import type { Task, ID, Channel, Card, TaskStatus } from '@/lib/types'
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
  const { status: sessionStatus } = useSession()
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

  // Task completion percentage
  const taskPct = stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0

  return (
    <div className="relative min-h-full">
      <div className="relative z-10 px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10 max-w-2xl">
        {/* Header */}
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight leading-none">Dashboard</h1>
            {/* Stats inline under title */}
            <div className="mt-3 flex items-center gap-4 text-[13px] text-white/40">
              <span><span className="text-white/70 font-semibold tabular-nums">{stats.totalChannels}</span> channels</span>
              <span className="text-white/10">|</span>
              <span><span className="text-white/70 font-semibold tabular-nums">{stats.completedTasks}</span><span className="text-white/25">/{stats.totalTasks}</span> tasks</span>
              {stats.streak > 0 && (
                <>
                  <span className="text-white/10">|</span>
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                    </svg>
                    <span className="text-orange-400/80 font-semibold tabular-nums">{stats.streak}d</span>
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onCreateChannel}
            className="flex items-center gap-1.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] px-3.5 py-2 text-[13px] font-medium text-white/70 hover:text-white transition-all active:scale-[0.97]"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>New</span>
          </button>
        </div>

        {/* View toggle — pill style */}
        <div className="mb-6 flex items-center gap-1 border-b border-white/[0.06] pb-px">
          <button
            onClick={() => setDashboardView('channels')}
            className={`px-3 py-2 text-[13px] font-medium transition-colors border-b-2 -mb-px ${
              dashboardView === 'channels'
                ? 'text-white border-white'
                : 'text-white/35 border-transparent hover:text-white/60'
            }`}
          >
            Channels
          </button>
          <button
            onClick={() => setDashboardView('tasks')}
            className={`px-3 py-2 text-[13px] font-medium transition-colors border-b-2 -mb-px ${
              dashboardView === 'tasks'
                ? 'text-white border-white'
                : 'text-white/35 border-transparent hover:text-white/60'
            }`}
          >
            Tasks
            {stats.totalTasks > 0 && (
              <span className="ml-1.5 text-[11px] text-white/25 tabular-nums">{taskPct}%</span>
            )}
          </button>
        </div>

        {dashboardView === 'channels' ? (
          <>
            {/* Channel + folder list */}
            <div className="space-y-px">
              {/* Folders */}
              {folderSections.map((section) => {
                const isCollapsed = collapsedFolders.has(section.folder.id)
                return (
                  <div key={section.folder.id}>
                    {/* Folder header */}
                    <div
                      onClick={() => toggleFolder(section.folder.id)}
                      className="group/folder flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer select-none hover:bg-white/[0.04] transition-colors"
                    >
                      <svg
                        className={`h-3 w-3 text-white/25 transition-transform duration-200 flex-shrink-0 ${isCollapsed ? '' : 'rotate-90'}`}
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
                      </svg>
                      <svg className="h-3.5 w-3.5 text-amber-500/50 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                      </svg>
                      <span className="text-[11px] font-medium text-white/50 group-hover/folder:text-white/70 flex-1 min-w-0 truncate transition-colors uppercase tracking-wider">
                        {section.folder.name}
                      </span>
                      <span className="text-[10px] text-white/20 font-medium tabular-nums flex-shrink-0">{section.channels.length}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/folder/${section.folder.id}`) }}
                        className="p-1 rounded-md text-white/0 group-hover/folder:text-white/30 hover:!text-white/60 hover:bg-white/10 transition-all flex-shrink-0"
                        title="Open folder"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                    {/* Folder channels */}
                    {!isCollapsed && (
                      <div className="ml-5 border-l border-white/[0.04] pl-2 space-y-px">
                        {section.channels.map((channel) => (
                          <ChannelRow
                            key={channel.id}
                            channel={channel}
                            streak={channelStreaks[channel.id]}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Root channels (not in folders) */}
              {rootMyChannels.map((channel) => (
                <ChannelRow
                  key={channel.id}
                  channel={channel}
                  streak={channelStreaks[channel.id]}
                />
              ))}
            </div>

          </>
        ) : (
          /* Master Task List */
          <div>
            {/* Task progress summary */}
            {stats.totalTasks > 0 && (
              <div className="mb-6 flex items-center gap-3">
                <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500/60 transition-all"
                    style={{ width: `${taskPct}%` }}
                  />
                </div>
                <span className="text-[11px] text-white/30 tabular-nums font-medium flex-shrink-0">
                  {stats.completedTasks}/{stats.totalTasks}
                </span>
              </div>
            )}

            {allTasksByChannel.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-[13px] text-white/30">No tasks yet</p>
              </div>
            ) : (
              <div className="space-y-8">
                {allTasksByChannel.map(({ channelId, channelName, tasks: chTasks }) => {
                  const chDone = chTasks.filter(t => t.status === 'done').length
                  const chPct = Math.round((chDone / chTasks.length) * 100)
                  return (
                    <div key={channelId}>
                      {/* Channel group header */}
                      <button
                        onClick={() => router.push(`/channel/${channelId}`)}
                        className="group/ch flex items-center gap-3 w-full mb-1 hover:text-white transition-colors"
                      >
                        <span className="text-[11px] font-semibold text-white/40 group-hover/ch:text-white/70 uppercase tracking-wider truncate transition-colors">{channelName}</span>
                        <div className="flex-1 h-px bg-white/[0.04]" />
                        <span className="text-[10px] text-white/20 tabular-nums flex-shrink-0 font-medium">
                          {chPct}%
                        </span>
                      </button>
                      {/* Tasks */}
                      <div className="space-y-px">
                        {chTasks.map((task) => (
                          <div
                            key={task.id}
                            className="group/task flex items-center gap-3 px-2 py-2 rounded-md hover:bg-white/[0.03] transition-colors"
                          >
                            <TaskCheckbox
                              status={task.status}
                              onToggle={() => toggleTaskStatus(task.id)}
                              size="sm"
                            />
                            <span className={`flex-1 text-[13px] truncate transition-colors ${
                              task.status === 'done'
                                ? 'text-white/20 line-through decoration-white/10'
                                : 'text-white/70'
                            }`}>
                              {task.title}
                            </span>
                            {task.status === 'in_progress' && (
                              <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400/70" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
