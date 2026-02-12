'use client'

import { useParams } from 'next/navigation'
import { useStore } from '@/lib/store'
import { useServerSync } from '@/components/providers/ServerSyncProvider'
import { FolderView } from '@/components/folder/FolderView'

export default function FolderPage() {
  const params = useParams()
  const folderId = params.folderId as string
  const folder = useStore((s) => s.folders[folderId])
  const hasHydrated = useStore((s) => s._hasHydrated)
  const { isLoading: isServerLoading, error, refetch } = useServerSync()

  if (!hasHydrated) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-500"></div>
      </div>
    )
  }

  if (folder) {
    return <FolderView folder={folder} />
  }

  if (isServerLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-500"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-neutral-500 mb-3">Failed to load folder</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-neutral-500">Folder not found</p>
    </div>
  )
}
