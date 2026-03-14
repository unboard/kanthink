'use client'

import { useRef, useCallback } from 'react'
import { Tldraw, serializeTldrawJson, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'

interface WhiteboardEditorProps {
  isOpen: boolean
  initialSnapshot?: string  // JSON string of TLEditorSnapshot
  onSave: (snapshotJson: string) => void
  onClose: () => void
}

export function WhiteboardEditor({ isOpen, initialSnapshot, onSave, onClose }: WhiteboardEditorProps) {
  const editorRef = useRef<Editor | null>(null)

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor
  }, [])

  const handleSave = useCallback(async () => {
    const editor = editorRef.current
    if (!editor) return

    const json = await serializeTldrawJson(editor)
    onSave(json)
  }, [onSave])

  if (!isOpen) return null

  // Parse initial snapshot if provided
  let snapshot: Record<string, unknown> | undefined
  if (initialSnapshot) {
    try {
      snapshot = JSON.parse(initialSnapshot)
    } catch {
      // Invalid snapshot, start fresh
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-neutral-900 border-b border-neutral-800">
        <button
          onClick={onClose}
          className="text-sm text-neutral-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <span className="text-sm font-medium text-neutral-300">Whiteboard</span>
        <button
          onClick={handleSave}
          className="text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors"
        >
          Save
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <Tldraw
          onMount={handleMount}
          {...(snapshot ? { snapshot: snapshot as any } : {})}
        />
      </div>
    </div>
  )
}
