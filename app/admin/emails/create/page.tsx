'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { EmailConfig } from '@/lib/emails/dynamicRenderer'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  rawContent?: string // Full LLM output including [EMAIL_TEMPLATE] block
  hasTemplate?: boolean
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function EmailBuilderPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const templateId = searchParams.get('id')

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailConfig, setEmailConfig] = useState<EmailConfig | null>(null)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const greetingSent = useRef(false)
  const templateLoaded = useRef(false)

  // Template save state
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(templateId)
  const [templateName, setTemplateName] = useState('')
  const [templateStatus, setTemplateStatus] = useState<'draft' | 'active'>('draft')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [editingName, setEditingName] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading, scrollToBottom])

  // Load existing template on mount
  useEffect(() => {
    if (!templateId || templateLoaded.current) return
    templateLoaded.current = true

    async function loadTemplate() {
      try {
        const res = await fetch(`/api/admin/emails/templates/${templateId}`)
        if (!res.ok) return
        const template = await res.json()

        setTemplateName(template.name)
        setTemplateStatus(template.status || 'draft')
        setCurrentTemplateId(template.id)

        if (template.body) {
          setEmailConfig({
            subject: template.subject,
            previewText: template.previewText || template.subject,
            body: template.body,
          })
        }

        if (template.conversationHistory && Array.isArray(template.conversationHistory)) {
          setMessages(template.conversationHistory)
          greetingSent.current = true
        }
      } catch {
        // Failed to load, start fresh
      }
    }
    loadTemplate()
  }, [templateId])

  // Fetch preview HTML when emailConfig changes
  useEffect(() => {
    if (!emailConfig) return

    let cancelled = false
    async function fetchPreview() {
      try {
        const res = await fetch('/api/admin/emails/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(emailConfig),
        })
        if (!res.ok) return
        const html = await res.text()
        if (!cancelled) setPreviewHtml(html)
      } catch {
        // silently fail
      }
    }
    fetchPreview()
    return () => { cancelled = true }
  }, [emailConfig])

  const sendMessage = useCallback(async (userMessage: string, isInitialGreeting = false) => {
    if (loading) return

    // Build conversation history using rawContent so the LLM sees its previous templates
    const conversationHistory = messages.map(m => ({
      role: m.role,
      content: m.rawContent || m.content,
    }))

    if (!isInitialGreeting) {
      setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    }
    setLoading(true)

    try {
      const res = await fetch('/api/admin/emails/builder-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage,
          isInitialGreeting,
          context: { conversationHistory },
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: data.error || 'Something went wrong.' },
        ])
        return
      }

      const hasTemplate = data.rawResponse ? data.rawResponse.includes('[EMAIL_TEMPLATE]') : false

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        rawContent: data.rawResponse || data.response,
        hasTemplate,
      }])

      if (data.emailConfig) {
        setEmailConfig(data.emailConfig)
        // Default template name to subject if not set
        if (!templateName) {
          setTemplateName(data.emailConfig.subject)
        }
      }
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Failed to get a response. Please try again.' },
      ])
    } finally {
      setLoading(false)
    }
  }, [loading, messages, templateName])

  // Initial greeting on mount (only for new templates)
  useEffect(() => {
    if (templateId) return // Existing template — skip greeting
    if (greetingSent.current) return
    greetingSent.current = true
    sendMessage('', true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    sendMessage(msg)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  async function saveTemplate(status: 'draft' | 'active') {
    if (!emailConfig) return
    setSaveState('saving')

    const name = templateName || emailConfig.subject
    const conversationHistory = messages.map(m => ({
      role: m.role,
      content: m.content,
      rawContent: m.rawContent,
    }))

    const payload = {
      name,
      subject: emailConfig.subject,
      previewText: emailConfig.previewText,
      body: emailConfig.body,
      status,
      conversationHistory,
    }

    try {
      if (currentTemplateId) {
        // Update existing
        const res = await fetch(`/api/admin/emails/templates/${currentTemplateId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Failed to save')
      } else {
        // Create new
        const res = await fetch('/api/admin/emails/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Failed to create')
        const data = await res.json()
        setCurrentTemplateId(data.id)
        // Update URL without full navigation
        router.replace(`/admin/emails/create?id=${data.id}`, { scroll: false })
      }

      setTemplateStatus(status)
      setTemplateName(name)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    } catch {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 py-2.5 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-sm">
        <Link
          href="/admin/emails"
          className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 shrink-0"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Catalog
        </Link>

        <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-700" />

        {/* Template name */}
        {editingName ? (
          <input
            ref={nameInputRef}
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={e => { if (e.key === 'Enter') setEditingName(false) }}
            className="text-sm font-medium text-neutral-900 dark:text-white bg-transparent border-b border-violet-500 outline-none px-0 py-0 min-w-[120px]"
            autoFocus
          />
        ) : (
          <button
            onClick={() => { setEditingName(true); setTimeout(() => nameInputRef.current?.focus(), 0) }}
            className="text-sm font-medium text-neutral-900 dark:text-white hover:text-violet-600 dark:hover:text-violet-400 transition-colors truncate max-w-[200px]"
            title="Click to rename"
          >
            {templateName || 'New Template'}
          </button>
        )}

        {/* Status badge */}
        {currentTemplateId && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
            templateStatus === 'active'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
              : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
          }`}>
            {templateStatus}
          </span>
        )}

        <div className="flex-1" />

        {/* Save buttons */}
        {emailConfig && (
          <div className="flex items-center gap-2 shrink-0">
            {saveState === 'saved' && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved</span>
            )}
            {saveState === 'error' && (
              <span className="text-xs text-red-500">Failed to save</span>
            )}
            <button
              onClick={() => saveTemplate('draft')}
              disabled={saveState === 'saving'}
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors disabled:opacity-50"
            >
              Save Draft
            </button>
            <button
              onClick={() => saveTemplate('active')}
              disabled={saveState === 'saving'}
              className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
            >
              Save
            </button>
          </div>
        )}

        {/* Viewport toggle */}
        <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-md p-0.5 shrink-0">
          <button
            onClick={() => setViewport('desktop')}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              viewport === 'desktop'
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            Desktop
          </button>
          <button
            onClick={() => setViewport('mobile')}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              viewport === 'mobile'
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            Mobile
          </button>
        </div>
      </div>

      {/* Split pane */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Chat */}
        <div className="w-full lg:w-[420px] shrink-0 border-b lg:border-b-0 lg:border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 flex flex-col min-h-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i}>
                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-violet-600 text-white'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200'
                    }`}
                  >
                    <MessageContent content={msg.content} />
                  </div>
                </div>
                {/* Template updated indicator */}
                {msg.hasTemplate && msg.role === 'assistant' && (
                  <div className="flex justify-start mt-1 ml-1">
                    <span className="inline-flex items-center gap-1 text-[10px] text-violet-500 dark:text-violet-400">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Template updated
                    </span>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-neutral-100 dark:bg-neutral-800 rounded-xl px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="border-t border-neutral-200 dark:border-neutral-800 p-3">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your email..."
                rows={1}
                className="flex-1 resize-none rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="shrink-0 rounded-lg bg-violet-600 px-3 py-2 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </form>
        </div>

        {/* Right: Preview */}
        <div className="flex-1 flex flex-col bg-neutral-50 dark:bg-neutral-900 min-h-0">
          {/* Preview toolbar */}
          <div className="flex items-center px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
            {emailConfig && (
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-neutral-500">Subject:</span>
                <span className="text-xs text-neutral-700 dark:text-neutral-300 font-mono bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded">
                  {emailConfig.subject}
                </span>
              </div>
            )}
          </div>

          {/* Preview area */}
          <div className="flex-1 flex items-start justify-center p-6 overflow-auto">
            {previewHtml ? (
              <iframe
                srcDoc={previewHtml}
                className="bg-white rounded-lg shadow-md border border-neutral-200 dark:border-neutral-700 transition-all duration-200"
                style={{
                  width: viewport === 'desktop' ? 480 : 320,
                  height: '100%',
                  minHeight: 600,
                }}
                title="Email preview"
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-12 h-12 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-3">
                  <svg className="h-6 w-6 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-sm text-neutral-500">Preview will appear here</p>
                <p className="text-xs text-neutral-400 mt-1">Describe your email in the chat to get started</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Renders message content with basic markdown-like formatting */
function MessageContent({ content }: { content: string }) {
  // Split by **bold** markers
  const parts = content.split(/(\*\*[^*]+\*\*)/)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>
        }
        // Handle newlines
        const lines = part.split('\n')
        return lines.map((line, j) => (
          <span key={`${i}-${j}`}>
            {j > 0 && <br />}
            {line}
          </span>
        ))
      })}
    </>
  )
}
