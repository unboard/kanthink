'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { EmailConfig } from '@/lib/emails/dynamicRenderer'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export default function EmailBuilderPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailConfig, setEmailConfig] = useState<EmailConfig | null>(null)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop')
  const [copied, setCopied] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const greetingSent = useRef(false)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading, scrollToBottom])

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

    const conversationHistory = messages.map(m => ({
      role: m.role,
      content: m.content,
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

      setMessages(prev => [...prev, { role: 'assistant', content: data.response }])

      if (data.emailConfig) {
        setEmailConfig(data.emailConfig)
      }
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Failed to get a response. Please try again.' },
      ])
    } finally {
      setLoading(false)
    }
  }, [loading, messages])

  // Initial greeting on mount
  useEffect(() => {
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

  async function handleCopyConfig() {
    if (!emailConfig) return
    await navigator.clipboard.writeText(JSON.stringify(emailConfig, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 py-3 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-sm">
        <Link
          href="/admin/emails"
          className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Catalog
        </Link>
        <span className="text-sm font-medium text-neutral-900 dark:text-white">Create with AI</span>
      </div>

      {/* Split pane */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Chat */}
        <div className="w-full lg:w-[420px] shrink-0 border-b lg:border-b-0 lg:border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 flex flex-col min-h-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
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
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
            <div className="flex items-center gap-3">
              {emailConfig && (
                <>
                  <span className="text-xs font-medium text-neutral-500">Subject:</span>
                  <span className="text-xs text-neutral-700 dark:text-neutral-300 font-mono bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded">
                    {emailConfig.subject}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {emailConfig && (
                <button
                  onClick={handleCopyConfig}
                  className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors"
                >
                  {copied ? (
                    <>
                      <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied
                    </>
                  ) : (
                    <>
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy Config
                    </>
                  )}
                </button>
              )}
              <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-md p-0.5">
                <button
                  onClick={() => setViewport('desktop')}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    viewport === 'desktop'
                      ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                  }`}
                >
                  Desktop
                </button>
                <button
                  onClick={() => setViewport('mobile')}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    viewport === 'mobile'
                      ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                  }`}
                >
                  Mobile
                </button>
              </div>
            </div>
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
