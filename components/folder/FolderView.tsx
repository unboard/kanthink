'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { ChannelRow } from '@/components/home/ChannelRow'
import { FolderShareDrawer } from '@/components/sharing/FolderShareDrawer'
import { useNav } from '@/components/providers/NavProvider'
import type { Folder, Task, ID, Channel, Card } from '@/lib/types'

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

function toLocalDayNum(ms: number): number {
  const d = new Date(ms)
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.floor(local.getTime() / 86400000)
}

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
  addTs(channel.updatedAt)
  addTs(channel.createdAt)
  for (const card of Object.values(cards)) {
    if (card.channelId === channel.id) addTs(card.updatedAt)
  }
  for (const task of Object.values(tasks)) {
    if (task.channelId === channel.id) addTs(task.updatedAt)
  }
  let hot = 0
  for (let i = 0; i < 365; i++) {
    if (activeDayNums.has(todayDayNum - i)) hot++
    else break
  }
  let cold = 0
  if (hot === 0 && activeDayNums.size > 0) {
    const maxDayNum = Math.max(...activeDayNums)
    cold = todayDayNum - maxDayNum
  }
  return { hot, cold }
}

interface FolderViewProps {
  folder: Folder
}

export function FolderView({ folder }: FolderViewProps) {
  const router = useRouter()
  const channels = useStore((s) => s.channels)
  const tasks = useStore((s) => s.tasks)
  const cards = useStore((s) => s.cards)
  const { openNewChannel } = useNav()
  const [showShareDrawer, setShowShareDrawer] = useState(false)

  const handleCreateChannel = () => {
    openNewChannel(folder.id)
  }

  const folderChannels = useMemo(() => {
    return folder.channelIds
      .map((id) => channels[id])
      .filter((c) => c && c.status !== 'archived')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }, [folder.channelIds, channels])

  const channelStreaks = useMemo(() => {
    const streaks: Record<string, { hot: number; cold: number }> = {}
    for (const ch of folderChannels) {
      streaks[ch.id] = computeChannelStreak(ch, cards, tasks)
    }
    return streaks
  }, [folderChannels, cards, tasks])

  // Folder stats
  const folderStats = useMemo(() => {
    const folderChannelIds = new Set(folderChannels.map(c => c.id))
    const folderTasks = Object.values(tasks).filter(t => folderChannelIds.has(t.channelId))
    const totalTasks = folderTasks.length
    const completedTasks = folderTasks.filter(t => t.status === 'done').length
    const hotStreakCount = Object.values(channelStreaks).filter(s => s.hot > 0).length
    return { totalTasks, completedTasks, hotStreakCount }
  }, [folderChannels, tasks, channelStreaks])

  const isOwner = !folder.isReadOnly && !folder.isVirtual

  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-neutral-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
              {folder.name}
            </h1>
            <span className="text-sm text-neutral-500">
              {folderChannels.length} channel{folderChannels.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {folder.isReadOnly && folder.sharedBy && (
              <div className="flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400">
                {folder.sharedBy.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={folder.sharedBy.image}
                    alt={folder.sharedBy.name || 'Sharer'}
                    className="w-5 h-5 rounded-full"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center">
                    <span className="text-violet-600 dark:text-violet-300 font-medium text-xs">
                      {(folder.sharedBy.name || folder.sharedBy.email)?.[0]?.toUpperCase() || '?'}
                    </span>
                  </div>
                )}
                <span>Shared by {folder.sharedBy.name || folder.sharedBy.email}</span>
              </div>
            )}

            {!folder.isReadOnly && (
              <button
                onClick={handleCreateChannel}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-white/10 dark:bg-white/10 text-neutral-700 dark:text-white hover:bg-white/20 dark:hover:bg-white/20 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Channel
              </button>
            )}

            {isOwner && (
              <button
                onClick={() => setShowShareDrawer(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary stat cards */}
      {folderChannels.length > 0 && (
        <div className="px-6 pt-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white/[0.04] dark:bg-white/[0.04] border border-white/[0.06] dark:border-white/[0.06] bg-neutral-50 dark:bg-transparent px-4 py-3">
            <div className="text-2xl font-bold text-neutral-900 dark:text-white tabular-nums">{folderChannels.length}</div>
            <div className="text-xs text-neutral-500 dark:text-white/40 mt-0.5">Channels</div>
          </div>
          <div className="rounded-xl bg-white/[0.04] dark:bg-white/[0.04] border border-white/[0.06] dark:border-white/[0.06] bg-neutral-50 dark:bg-transparent px-4 py-3">
            <div className="text-2xl font-bold text-neutral-900 dark:text-white tabular-nums">{folderStats.completedTasks}<span className="text-neutral-400 dark:text-white/30 text-lg">/{folderStats.totalTasks}</span></div>
            <div className="text-xs text-neutral-500 dark:text-white/40 mt-0.5">Tasks done</div>
          </div>
          <div className={`rounded-xl px-4 py-3 border ${folderStats.hotStreakCount > 0 ? 'bg-orange-500/[0.06] border-orange-500/[0.12]' : 'bg-white/[0.04] dark:bg-white/[0.04] border-white/[0.06] dark:border-white/[0.06] bg-neutral-50 dark:bg-transparent'}`}>
            <div className="flex items-center gap-1.5">
              {folderStats.hotStreakCount > 0 && (
                <svg className="w-5 h-5 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                </svg>
              )}
              <span className={`text-2xl font-bold tabular-nums ${folderStats.hotStreakCount > 0 ? 'text-orange-400' : 'text-neutral-400 dark:text-white/30'}`}>{folderStats.hotStreakCount}</span>
            </div>
            <div className={`text-xs mt-0.5 ${folderStats.hotStreakCount > 0 ? 'text-orange-400/60' : 'text-neutral-500 dark:text-white/40'}`}>Active</div>
          </div>
        </div>
      )}

      {/* Channel list */}
      <div className="flex-1 p-6">
        {folderChannels.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto text-neutral-300 dark:text-neutral-600 mb-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              <p className="text-neutral-500 dark:text-neutral-400">
                {folder.isReadOnly ? 'This folder is empty.' : 'No channels in this folder yet.'}
              </p>
              {!folder.isReadOnly && (
                <p className="text-sm text-neutral-400 dark:text-neutral-500 mt-1">
                  Drag channels into this folder from the sidebar.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {folderChannels.map((channel) => (
              <ChannelRow
                key={channel.id}
                channel={channel}
                streak={channelStreaks[channel.id]}
              />
            ))}
          </div>
        )}
      </div>

      {/* Share drawer */}
      {isOwner && (
        <FolderShareDrawer
          folderId={folder.id}
          folderName={folder.name}
          isOpen={showShareDrawer}
          onClose={() => setShowShareDrawer(false)}
        />
      )}
    </div>
  )
}
