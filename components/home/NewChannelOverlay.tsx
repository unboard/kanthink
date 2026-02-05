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
  onKanHelp: () => void
}

export function NewChannelOverlay({ isOpen, onClose, onKanHelp }: NewChannelOverlayProps) {
  const router = useRouter()
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | 'all' | 'kan'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [importJson, setImportJson] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const createChannelWithStructure = useStore((s) => s.createChannelWithStructure)
  const createCard = useStore((s) => s.createCard)
  const addMessage = useStore((s) => s.addMessage)
  const createTask = useStore((s) => s.createTask)
  const updateTask = useStore((s) => s.updateTask)

  const handleClose = useCallback(() => {
    setSelectedCategory('all')
    setSearchQuery('')
    setImportJson('')
    setImportError(null)
    setShowImport(false)
    onClose()
  }, [onClose])

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

  const handleQuickStart = useCallback(() => {
    handleCreateFromTemplate(QUICK_START_TEMPLATE)
  }, [handleCreateFromTemplate])

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

          const startIndex = firstNote ? 1 : 0
          for (let i = startIndex; i < (importedCard.messages?.length || 0); i++) {
            const msg = importedCard.messages[i]
            addMessage(newCard.id, msg.type, msg.content)
          }

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
    } catch {
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
    selectedCategory === 'all' || selectedCategory === 'kan'
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
    <div className="fixed inset-0 z-50 flex items-center justify-center md:p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative z-10 w-full h-full md:max-w-4xl md:h-[600px] md:rounded-2xl bg-zinc-900 md:border md:border-white/10 md:shadow-2xl overflow-hidden flex flex-col md:flex-row">

        {/* ===== Desktop Left Nav (hidden on mobile) ===== */}
        <div className="hidden md:flex w-56 flex-shrink-0 border-r border-white/10 flex-col">
          {/* Header */}
          <div className="p-4 border-b border-white/10">
            <h2 className="text-lg font-semibold text-white">New Channel</h2>
          </div>

          {/* Nav Items */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {/* Kan Help - Featured */}
            <button
              onClick={() => {
                handleClose()
                onKanHelp()
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all bg-gradient-to-r from-violet-500/20 to-cyan-500/20 border border-violet-500/30 hover:from-violet-500/30 hover:to-cyan-500/30"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/40 to-cyan-500/40 flex items-center justify-center flex-shrink-0">
                <KanthinkIcon size={18} className="text-violet-200" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-white">Have Kan help</div>
                <div className="text-[10px] text-white/50 truncate">AI-assisted setup</div>
              </div>
            </button>

            <div className="h-px bg-white/10 my-2" />

            {/* All Templates */}
            <NavItem
              icon="📚"
              label="All Templates"
              count={CHANNEL_TEMPLATES.length}
              active={selectedCategory === 'all'}
              onClick={() => setSelectedCategory('all')}
            />

            {/* Categories */}
            {(Object.entries(TEMPLATE_CATEGORIES) as [TemplateCategory, { label: string; icon: string }][]).map(
              ([key, { label, icon }]) => (
                <NavItem
                  key={key}
                  icon={icon}
                  label={label}
                  count={CHANNEL_TEMPLATES.filter((t) => t.category === key).length}
                  active={selectedCategory === key}
                  onClick={() => setSelectedCategory(key)}
                />
              )
            )}

            {/* Community placeholder */}
            <div className="h-px bg-white/10 my-2" />
            <NavItem
              icon="👥"
              label="Community"
              disabled
              badge="Soon"
              onClick={() => {}}
            />
          </div>

          {/* Bottom Actions */}
          <div className="p-2 border-t border-white/10 space-y-1">
            <button
              onClick={handleQuickStart}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <span className="text-lg">⚡</span>
              <span className="text-sm">Blank Board</span>
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span className="text-sm">Import JSON</span>
            </button>
          </div>
        </div>

        {/* ===== Mobile Header (hidden on desktop) ===== */}
        <div className="md:hidden flex flex-col flex-shrink-0">
          {/* Title + Close */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <h2 className="text-lg font-semibold text-white">New Channel</h2>
            <button
              onClick={handleClose}
              className="p-2 -mr-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Quick Actions Row */}
          <div className="flex gap-2 px-4 pt-3 pb-2">
            <button
              onClick={() => {
                handleClose()
                onKanHelp()
              }}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg transition-all bg-gradient-to-r from-violet-500/20 to-cyan-500/20 border border-violet-500/30"
            >
              <KanthinkIcon size={16} className="text-violet-200" />
              <span className="text-xs font-medium text-white">Kan help</span>
            </button>
            <button
              onClick={handleQuickStart}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
            >
              <span className="text-sm">⚡</span>
              <span className="text-xs text-white/70">Blank</span>
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span className="text-xs text-white/70">Import</span>
            </button>
          </div>

          {/* Category Chips - horizontal scroll */}
          <div className="flex gap-1.5 px-4 pb-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <CategoryChip
              label="All"
              icon="📚"
              active={selectedCategory === 'all'}
              onClick={() => setSelectedCategory('all')}
            />
            {(Object.entries(TEMPLATE_CATEGORIES) as [TemplateCategory, { label: string; icon: string }][]).map(
              ([key, { label, icon }]) => (
                <CategoryChip
                  key={key}
                  label={label}
                  icon={icon}
                  active={selectedCategory === key}
                  onClick={() => setSelectedCategory(key)}
                />
              )
            )}
          </div>

          {/* Search */}
          <div className="px-4 pb-3">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates..."
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder-white/40 focus:outline-none focus:border-white/30"
              />
            </div>
          </div>
        </div>

        {/* ===== Main Content Area ===== */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Desktop header with search (hidden on mobile) */}
          <div className="hidden md:flex items-center justify-between gap-4 px-6 py-4 border-b border-white/10">
            <div className="flex-1 relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates..."
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder-white/40 focus:outline-none focus:border-white/30"
              />
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Template Grid */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            {showImport ? (
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
                onBack={() => setShowImport(false)}
              />
            ) : (
              <div className="grid grid-cols-2 gap-2 md:gap-3 lg:grid-cols-3">
                {searchedTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onClick={() => handleCreateFromTemplate(template)}
                  />
                ))}

                {searchedTemplates.length === 0 && (
                  <div className="col-span-full text-center py-12 text-white/50">
                    <p>No templates found</p>
                    <p className="text-sm mt-1">Try a different search term</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============ Category Chip (mobile) ============
interface CategoryChipProps {
  label: string
  icon: string
  active?: boolean
  onClick: () => void
}

function CategoryChip({ label, icon, active, onClick }: CategoryChipProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors flex-shrink-0 ${
        active
          ? 'bg-white/15 text-white'
          : 'bg-white/5 text-white/50 hover:text-white/70 hover:bg-white/10'
      }`}
    >
      <span className="text-sm">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

// ============ Nav Item (desktop) ============
interface NavItemProps {
  icon: string
  label: string
  count?: number
  active?: boolean
  disabled?: boolean
  badge?: string
  onClick: () => void
}

function NavItem({ icon, label, count, active, disabled, badge, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
        active
          ? 'bg-white/15 text-white'
          : disabled
          ? 'text-white/30 cursor-not-allowed'
          : 'text-white/70 hover:text-white hover:bg-white/10'
      }`}
    >
      <span className="text-base">{icon}</span>
      <span className="flex-1 text-sm truncate">{label}</span>
      {count !== undefined && (
        <span className="text-xs text-white/40">{count}</span>
      )}
      {badge && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">{badge}</span>
      )}
    </button>
  )
}

// ============ Template Card ============
interface TemplateCardProps {
  template: ChannelTemplate
  onClick: () => void
}

function TemplateCard({ template, onClick }: TemplateCardProps) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col p-3 md:p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all text-left group"
    >
      <div className="flex items-start gap-2 md:gap-3 mb-1.5 md:mb-2">
        <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-white/10 flex items-center justify-center text-lg md:text-xl flex-shrink-0">
          {template.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm md:text-base text-white group-hover:text-cyan-100 transition-colors truncate">
            {template.name}
          </div>
          <div className="text-[10px] text-white/40 mt-0.5">
            {TEMPLATE_CATEGORIES[template.category]?.label}
          </div>
        </div>
      </div>
      <p className="text-xs text-white/50 line-clamp-2 mb-2 md:mb-3">
        {template.description}
      </p>
      <div className="flex items-center gap-3 text-[10px] text-white/40 mt-auto">
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
          {template.columns.length} columns
        </span>
        {template.instructionCards && template.instructionCards.length > 0 && (
          <span className="flex items-center gap-1">
            <KanthinkIcon size={10} />
            {template.instructionCards.length} shrooms
          </span>
        )}
      </div>
    </button>
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
  onBack: () => void
}

function ImportView({
  importJson,
  importError,
  fileInputRef,
  onJsonChange,
  onFileSelect,
  onImport,
  onBack,
}: ImportViewProps) {
  return (
    <div className="max-w-lg mx-auto space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to templates
      </button>

      <div>
        <h3 className="text-lg font-semibold text-white mb-2">Import Channel</h3>
        <p className="text-sm text-white/60">
          Import a channel from a JSON export file. You can export channels from the channel settings.
        </p>
      </div>

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
          className="w-full flex items-center justify-center gap-3 p-6 md:p-8 rounded-xl border-2 border-dashed border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10 transition-all text-white/60 hover:text-white"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <span className="text-sm">Choose JSON file</span>
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-xs text-white/40">or paste JSON</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      <textarea
        value={importJson}
        onChange={(e) => onJsonChange(e.target.value)}
        placeholder='{"name": "My Channel", "columns": [...], ...}'
        className="w-full h-40 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-mono placeholder-white/30 focus:outline-none focus:border-white/30 resize-none"
      />

      {importError && (
        <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-sm">
          {importError}
        </div>
      )}

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
