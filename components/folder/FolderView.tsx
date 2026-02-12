'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { ChannelCard } from '@/components/home/ChannelCard'
import { FolderShareDrawer } from '@/components/sharing/FolderShareDrawer'
import type { Folder, Task, ID } from '@/lib/types'

interface FolderViewProps {
  folder: Folder
}

export function FolderView({ folder }: FolderViewProps) {
  const channels = useStore((s) => s.channels)
  const tasks = useStore((s) => s.tasks)
  const [showShareDrawer, setShowShareDrawer] = useState(false)

  const folderChannels = useMemo(() => {
    return folder.channelIds
      .map((id) => channels[id])
      .filter((c) => c && c.status !== 'archived')
  }, [folder.channelIds, channels])

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

      {/* Channel grid */}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {folderChannels.map((channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                tasks={tasksByChannel[channel.id] || []}
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
