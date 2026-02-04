'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { KanthinkIcon } from '@/components/icons/KanthinkIcon'
import {
  CHANNEL_TEMPLATES,
  TEMPLATE_CATEGORIES,
  QUICK_START_TEMPLATE,
  type ChannelTemplate,
  type TemplateCategory,
} from '@/lib/channelTemplates'

interface NewChannelOverlayProps {
  isOpen: boolean
  onClose: () => void
  onKanHelp: () => void // Opens the conversational channel creation
}

type ViewMode = 'main' | 'templates' | 'import'

export function NewChannelOverlay({ isOpen, onClose, onKanHelp }: NewChannelOverlayProps) {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<ViewMode>('main')
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [importJson, setImportJson] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const createChannelWithStructure = useStore((s) => s.createChannelWithStructure)
  const createCard = useStore((s) => s.createCard)
  const addMessage = useStore((s) => s.addMessage)
  const createTask = useStore((s) => s.createTask)
  const updateTask = useStore((s) => s.updateTask)

  const handleClose = useCallback(() => {
    setViewMode('main')
    setSelectedCategory('all')
    setSearchQuery('')
    setImportJson('')
    setImportError(null)
    onClose()
  }, [onClose])

  // Create channel from template
  const handleCreateFromTemplate = useCallback(
    (template: ChannelTemplate) => {
      const channel = createChannelWithStructure({
        name: template.name,
        description: template.description,
        aiInstructions: template.aiInstructions || '',
        columns: template.columns.map((col) => ({
          name: col.name,
          description: col.instructions || '',
          isAiTarget: col.isAiTarget,
        })),
        instructionCards:
          template.instructionCards?.map((card) => ({
            title: card.title,
            instructions: card.instructions,
            action: card.action,
            targetColumnName: card.targetColumnName,
            cardCount: card.cardCount,
          })) || [],
      })

      handleClose()
      router.push(`/channel/${channel.id}`)
    },
    [createChannelWithStructure, handleClose, router]
  )

  // Create Quick Start channel
  const handleQuickStart = useCallback(() => {
    handleCreateFromTemplate(QUICK_START_TEMPLATE)
  }, [handleCreateFromTemplate])

  // Import from JSON
  const handleImport = useCallback(() => {
    try {
      const data = JSON.parse(importJson)
      if (!data.name || !Array.isArray(data.columns)) {
        setImportError('Invalid format: missing name or columns')
        return
      }

      const newChannel = createChannelWithStructure({
        name: data.name,
        description: data.description || '',
        aiInstructions: data.aiInstructions || '',
        columns: data.columns.map(
          (col: { name: string; instructions?: string; isAiTarget?: boolean }) => ({
            name: col.name,
            description: col.instructions || '',
            isAiTarget: col.isAiTarget,
          })
        ),
        instructionCards:
          data.instructionCards?.map(
            (card: {
              title: string
              instructions: string
              action: string
              targetColumnName: string
              cardCount?: number
            }) => ({
              title: card.title,
              instructions: card.instructions,
              action: card.action,
              targetColumnName: card.targetColumnName,
              cardCount: card.cardCount,
            })
          ) || [],
      })

      // Import cards if present
      if (data.cards && Array.isArray(data.cards)) {
        const columnNameToId = new Map(
          newChannel.columns.map((col: { id: string; name: string }) => [col.name, col.id])
        )
        const firstColumnId = newChannel.columns[0]?.id

        for (const importedCard of data.cards) {
          const targetColumnId = columnNameToId.get(importedCard.columnName) || firstColumnId
          if (!targetColumnId) continue

          const firstNote = importedCard.messages?.find(
            (m: { type: string }) => m.type === 'note' || m.type === 'ai_response'
          )

          const newCard = createCard(
            newChannel.id,
            targetColumnId,
            { title: importedCard.title, initialMessage: firstNote?.content },
            'manual'
          )

          // Add remaining messages
          const startIndex = firstNote ? 1 : 0
          for (let i = startIndex; i < (importedCard.messages?.length || 0); i++) {
            const msg = importedCard.messages[i]
            addMessage(newCard.id, msg.type, msg.content)
          }

          // Import tasks
          if (importedCard.tasks) {
            for (const task of importedCard.tasks) {
              const newTask = createTask(newChannel.id, newCard.id, {
                title: task.title,
                description: task.description,
              })
              if (task.status === 'done') {
                updateTask(newTask.id, {
                  status: 'done',
                  completedAt: new Date().toISOString(),
                })
              } else if (task.status === 'in_progress') {
                updateTask(newTask.id, { status: 'in_progress' })
              }
            }
          }
        }
      }

      handleClose()
      router.push(`/channel/${newChannel.id}`)
    } catch (e) {
      setImportError('Invalid JSON format')
    }
  }, [
    importJson,
    createChannelWithStructure,
    createCard,
    addMessage,
    createTask,
    updateTask,
    handleClose,
    router,
  ])

  // Handle file upload
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      setImportJson(content)
      setImportError(null)
    }
    reader.onerror = () => {
      setImportError('Failed to read file')
    }
    reader.readAsText(file)
  }, [])

  // Filter templates
  const filteredTemplates =
    selectedCategory === 'all'
      ? CHANNEL_TEMPLATES
      : CHANNEL_TEMPLATES.filter((t) => t.category === selectedCategory)

  const searchedTemplates = searchQuery
    ? filteredTemplates.filter(
        (t) =>
          t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.tags?.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : filteredTemplates

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-3xl mx-4 my-8 sm:my-16 rounded-2xl bg-zinc-900 border border-white/10 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            {viewMode !== 'main' && (
              <button
                onClick={() => setViewMode('main')}
                className="p-1.5 -ml-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            )}
            <h2 className="text-lg font-semibold text-white">
              {viewMode === 'main' && 'Create a Channel'}
              {viewMode === 'templates' && 'Template Library'}
              {viewMode === 'import' && 'Import Channel'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {viewMode === 'main' && (
            <MainView
              onQuickStart={handleQuickStart}
              onKanHelp={() => {
                handleClose()
                onKanHelp()
              }}
              onBrowseTemplates={() => setViewMode('templates')}
              onImport={() => setViewMode('import')}
            />
          )}

          {viewMode === 'templates' && (
            <TemplatesView
              templates={searchedTemplates}
              selectedCategory={selectedCategory}
              searchQuery={searchQuery}
              onCategoryChange={setSelectedCategory}
              onSearchChange={setSearchQuery}
              onSelectTemplate={handleCreateFromTemplate}
            />
          )}

          {viewMode === 'import' && (
            <ImportView
              importJson={importJson}
              importError={importError}
              fileInputRef={fileInputRef}
              onJsonChange={(v) => {
                setImportJson(v)
                setImportError(null)
              }}
              onFileSelect={handleFileSelect}
              onImport={handleImport}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ============ Main View ============
interface MainViewProps {
  onQuickStart: () => void
  onKanHelp: () => void
  onBrowseTemplates: () => void
  onImport: () => void
}

function MainView({ onQuickStart, onKanHelp, onBrowseTemplates, onImport }: MainViewProps) {
  return (
    <div className="space-y-6">
      {/* Quick Start */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-white/70 uppercase tracking-wide">Quick Start</h3>
        <button
          onClick={onQuickStart}
          className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all group text-left"
        >
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 flex items-center justify-center text-2xl">
            ⚡
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-white group-hover:text-cyan-100 transition-colors">
              Blank Board
            </div>
            <div className="text-sm text-white/50">
              Start with a simple Inbox → Working On → Done setup
            </div>
          </div>
          <svg
            className="w-5 h-5 text-white/30 group-hover:text-white/60 transition-colors"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* AI-Assisted */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-white/70 uppercase tracking-wide">
          AI-Assisted Setup
        </h3>
        <button
          onClick={onKanHelp}
          className="w-full flex items-center gap-4 p-4 rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-cyan-500/10 hover:from-violet-500/20 hover:to-cyan-500/20 transition-all group text-left"
        >
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/30 to-cyan-500/30 flex items-center justify-center">
            <KanthinkIcon size={28} className="text-violet-300" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-white group-hover:text-violet-100 transition-colors flex items-center gap-2">
              Have Kan help you
              <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/30 text-violet-300">
                Recommended
              </span>
            </div>
            <div className="text-sm text-white/50">
              Tell Kan what you want to accomplish and get a custom board
            </div>
          </div>
          <svg
            className="w-5 h-5 text-white/30 group-hover:text-white/60 transition-colors"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Templates */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-white/70 uppercase tracking-wide">
          Start from Template
        </h3>
        <button
          onClick={onBrowseTemplates}
          className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all group text-left"
        >
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center text-2xl">
            📚
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-white group-hover:text-amber-100 transition-colors">
              Browse Templates
            </div>
            <div className="text-sm text-white/50">
              Choose from {CHANNEL_TEMPLATES.length}+ pre-built boards for various workflows
            </div>
          </div>
          <svg
            className="w-5 h-5 text-white/30 group-hover:text-white/60 transition-colors"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Import & Community */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onImport}
          className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all text-white/70 hover:text-white"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
          Import JSON
        </button>
        <button
          disabled
          className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border border-white/10 bg-white/5 text-white/40 cursor-not-allowed"
          title="Coming soon"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          Community
          <span className="text-[10px] px-1 py-0.5 rounded bg-white/10">Soon</span>
        </button>
      </div>
    </div>
  )
}

// ============ Templates View ============
interface TemplatesViewProps {
  templates: ChannelTemplate[]
  selectedCategory: TemplateCategory | 'all'
  searchQuery: string
  onCategoryChange: (category: TemplateCategory | 'all') => void
  onSearchChange: (query: string) => void
  onSelectTemplate: (template: ChannelTemplate) => void
}

function TemplatesView({
  templates,
  selectedCategory,
  searchQuery,
  onCategoryChange,
  onSearchChange,
  onSelectTemplate,
}: TemplatesViewProps) {
  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search templates..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20"
        />
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onCategoryChange('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            selectedCategory === 'all'
              ? 'bg-white/20 text-white'
              : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
          }`}
        >
          All
        </button>
        {(Object.entries(TEMPLATE_CATEGORIES) as [TemplateCategory, { label: string; icon: string }][]).map(
          ([key, { label, icon }]) => (
            <button
              key={key}
              onClick={() => onCategoryChange(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                selectedCategory === key
                  ? 'bg-white/20 text-white'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span>{icon}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          )
        )}
      </div>

      {/* Template grid */}
      <div className="grid gap-3 sm:grid-cols-2 max-h-[400px] overflow-y-auto pr-2 -mr-2">
        {templates.map((template) => (
          <button
            key={template.id}
            onClick={() => onSelectTemplate(template)}
            className="flex items-start gap-3 p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all text-left group"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-xl">
              {template.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-white group-hover:text-cyan-100 transition-colors">
                {template.name}
              </div>
              <div className="text-xs text-white/50 line-clamp-2 mt-0.5">
                {template.description}
              </div>
              <div className="flex items-center gap-2 mt-2 text-[10px] text-white/40">
                <span>{template.columns.length} columns</span>
                {template.instructionCards && template.instructionCards.length > 0 && (
                  <>
                    <span>•</span>
                    <span>{template.instructionCards.length} shrooms</span>
                  </>
                )}
              </div>
            </div>
          </button>
        ))}

        {templates.length === 0 && (
          <div className="col-span-2 text-center py-8 text-white/50">
            No templates found matching your search
          </div>
        )}
      </div>

      {/* Community section placeholder */}
      <div className="pt-4 border-t border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <h3 className="text-sm font-medium text-white/70 uppercase tracking-wide">
            Community Templates
          </h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">
            Coming Soon
          </span>
        </div>
        <p className="text-sm text-white/40">
          Discover boards shared by the community. Share your own templates and get inspired by others.
        </p>
      </div>
    </div>
  )
}

// ============ Import View ============
interface ImportViewProps {
  importJson: string
  importError: string | null
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onJsonChange: (value: string) => void
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onImport: () => void
}

function ImportView({
  importJson,
  importError,
  fileInputRef,
  onJsonChange,
  onFileSelect,
  onImport,
}: ImportViewProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/60">
        Import a channel from a JSON export file. You can export channels from the channel settings
        menu.
      </p>

      {/* File upload */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={onFileSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10 transition-all text-white/60 hover:text-white"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <span>Choose JSON file or drag and drop</span>
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-xs text-white/40">or paste JSON</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      {/* JSON textarea */}
      <textarea
        value={importJson}
        onChange={(e) => onJsonChange(e.target.value)}
        placeholder='{"name": "My Channel", "columns": [...], ...}'
        className="w-full h-48 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-mono placeholder-white/30 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 resize-none"
      />

      {/* Error message */}
      {importError && (
        <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-sm">
          {importError}
        </div>
      )}

      {/* Import button */}
      <button
        onClick={onImport}
        disabled={!importJson.trim()}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
      >
        Import Channel
      </button>
    </div>
  )
}
