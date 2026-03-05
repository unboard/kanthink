'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'

interface DesignTokens {
  accentColor: string
  headerBg: string
  bodyBg: string
  containerBg: string
  footerBg: string
  ctaColor: string
  textColor: string
  mutedColor: string
  borderColor: string
  contentPadding: string
  fontStack: string
}

const DEFAULTS: DesignTokens = {
  accentColor: '#7c3aed',
  headerBg: '#18181b',
  bodyBg: '#f4f4f5',
  containerBg: '#ffffff',
  footerBg: '#fafafa',
  ctaColor: '#7c3aed',
  textColor: '#3f3f46',
  mutedColor: '#71717a',
  borderColor: '#e4e4e7',
  contentPadding: '32px',
  fontStack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}

const COLOR_TOKENS: { key: keyof DesignTokens; label: string }[] = [
  { key: 'accentColor', label: 'Accent' },
  { key: 'headerBg', label: 'Header' },
  { key: 'bodyBg', label: 'Body bg' },
  { key: 'containerBg', label: 'Container bg' },
  { key: 'footerBg', label: 'Footer bg' },
  { key: 'ctaColor', label: 'CTA button' },
  { key: 'textColor', label: 'Text' },
  { key: 'mutedColor', label: 'Muted text' },
  { key: 'borderColor', label: 'Border' },
]

export default function BaseTemplateDesignPage() {
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop')
  const [tokens, setTokens] = useState<DesignTokens>({ ...DEFAULTS })
  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const fetchPreview = useCallback(async (t: DesignTokens) => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/emails/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: 'base-layout', designTokens: t }),
      })
      if (res.ok) {
        const html = await res.text()
        setPreviewHtml(html)
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchPreview(tokens)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounced preview update on token change
  const updateToken = useCallback((key: keyof DesignTokens, value: string) => {
    setTokens(prev => {
      const next = { ...prev, [key]: value }
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => fetchPreview(next), 300)
      return next
    })
  }, [fetchPreview])

  // Write HTML to iframe via srcdoc
  useEffect(() => {
    if (iframeRef.current && previewHtml) {
      iframeRef.current.srcdoc = previewHtml
    }
  }, [previewHtml])

  const isModified = JSON.stringify(tokens) !== JSON.stringify(DEFAULTS)

  const reset = () => {
    setTokens({ ...DEFAULTS })
    fetchPreview(DEFAULTS)
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
        <span className="text-sm font-medium text-neutral-900 dark:text-white">Base Template Design</span>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Token editor */}
        <div className="w-full lg:w-96 shrink-0 border-b lg:border-b-0 lg:border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Design Tokens</h3>
              <p className="text-xs text-neutral-500 mt-0.5">Tweak values and see the preview update live.</p>
            </div>
            {isModified && (
              <button
                onClick={reset}
                className="text-xs px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
              >
                Reset
              </button>
            )}
          </div>

          {/* Colors */}
          <div className="mb-5">
            <p className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-2">Colors</p>
            <div className="space-y-2">
              {COLOR_TOKENS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3">
                  <label
                    htmlFor={key}
                    className="relative shrink-0 cursor-pointer"
                  >
                    <input
                      id={key}
                      type="color"
                      value={tokens[key]}
                      onChange={(e) => updateToken(key, e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <span
                      className="block h-7 w-7 rounded-md border border-neutral-200 dark:border-neutral-700 shadow-sm"
                      style={{ backgroundColor: tokens[key] }}
                    />
                  </label>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
                  </div>
                  <input
                    type="text"
                    value={tokens[key]}
                    onChange={(e) => updateToken(key, e.target.value)}
                    className="w-20 text-[11px] font-mono px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Typography */}
          <div className="mb-5">
            <p className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-2">Typography</p>
            <label className="block">
              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Font stack</span>
              <input
                type="text"
                value={tokens.fontStack}
                onChange={(e) => updateToken('fontStack', e.target.value)}
                className="mt-1 w-full text-[11px] font-mono px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
              />
            </label>
          </div>

          {/* Spacing */}
          <div>
            <p className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-2">Spacing</p>
            <label className="block">
              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Content padding</span>
              <input
                type="text"
                value={tokens.contentPadding}
                onChange={(e) => updateToken('contentPadding', e.target.value)}
                className="mt-1 w-28 text-[11px] font-mono px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
              />
            </label>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="flex-1 flex flex-col bg-neutral-50 dark:bg-neutral-900 min-h-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
            {loading && (
              <span className="text-[11px] text-neutral-400 animate-pulse">Rendering...</span>
            )}
            {!loading && <span />}
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

          <div className="flex-1 flex items-start justify-center p-6 overflow-auto">
            <iframe
              ref={iframeRef}
              className="bg-white rounded-lg shadow-md border border-neutral-200 dark:border-neutral-700 transition-all duration-200"
              style={{
                width: viewport === 'desktop' ? 480 : 320,
                height: '100%',
                minHeight: 600,
              }}
              title="Base template preview"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
