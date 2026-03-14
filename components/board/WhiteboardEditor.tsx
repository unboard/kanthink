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
    <div
      className="fixed inset-0 z-[200] flex flex-col"
      style={{ colorScheme: 'light' }}
    >
      {/* Header — stays dark for contrast with app chrome */}
      <div className="flex items-center justify-between px-4 py-3 bg-neutral-900 border-b border-neutral-800 shrink-0">
        <button
          onClick={onClose}
          className="text-sm text-neutral-400 hover:text-white transition-colors"
          style={{ color: '#a3a3a3' }}
        >
          Cancel
        </button>
        <span className="text-sm font-medium" style={{ color: '#d4d4d4' }}>Whiteboard</span>
        <button
          onClick={handleSave}
          className="text-sm font-medium transition-colors"
          style={{ color: '#a78bfa' }}
        >
          Save
        </button>
      </div>

      {/* Canvas — isolated from dark mode so tldraw renders correctly */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          background: '#ffffff',
        }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <Tldraw
            onMount={handleMount}
            {...(snapshot ? { snapshot: snapshot as any } : {})}
          />
        </div>
      </div>
    </div>
  )
}
