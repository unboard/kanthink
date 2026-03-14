'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'

// Lazy load the editor since it's heavy
const WhiteboardEditor = dynamic(
  () => import('./WhiteboardEditor').then(mod => ({ default: mod.WhiteboardEditor })),
  { ssr: false }
)

interface WhiteboardPreviewProps {
  snapshotJson: string
  whiteboardId: string
  onUpdate?: (whiteboardId: string, newSnapshot: string) => void
}

export function WhiteboardPreview({ snapshotJson, whiteboardId, onUpdate }: WhiteboardPreviewProps) {
  const [isEditorOpen, setIsEditorOpen] = useState(false)

  // Count shapes in the snapshot for a label
  const shapeCount = useMemo(() => {
    try {
      const data = JSON.parse(snapshotJson)
      // tldraw JSON has a document.store with shape records
      const store = data?.document?.store
      if (!store) return 0
      return Object.keys(store).filter(k => k.startsWith('shape:')).length
    } catch {
      return 0
    }
  }, [snapshotJson])

  return (
    <>
      <button
        onClick={() => setIsEditorOpen(true)}
        className="group flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-neutral-100 dark:bg-neutral-800/80 hover:bg-neutral-200 dark:hover:bg-neutral-700/80 transition-colors w-full text-left"
      >
        {/* Canvas icon */}
        <div className="flex-shrink-0 w-8 h-8 rounded-md bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Whiteboard</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-500">
            {shapeCount > 0 ? `${shapeCount} shape${shapeCount !== 1 ? 's' : ''}` : 'Empty canvas'}
            {' \u00B7 Tap to open'}
          </p>
        </div>
        <svg className="w-4 h-4 text-neutral-400 dark:text-neutral-600 group-hover:text-neutral-500 dark:group-hover:text-neutral-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {isEditorOpen && (
        <WhiteboardEditor
          isOpen={true}
          initialSnapshot={snapshotJson}
          onSave={(newSnapshot) => {
            setIsEditorOpen(false)
            if (onUpdate) onUpdate(whiteboardId, newSnapshot)
          }}
          onClose={() => setIsEditorOpen(false)}
        />
      )}
    </>
  )
}
