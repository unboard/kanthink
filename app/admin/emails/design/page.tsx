'use client'

import { useState } from 'react'
import Link from 'next/link'

const designTokens = [
  { token: 'Accent bar', value: '#7c3aed', description: 'Violet, 4px tall', preview: '#7c3aed' },
  { token: 'Header background', value: '#18181b', description: 'Near-black', preview: '#18181b' },
  { token: 'Logo', value: 'Cloudinary PNG', description: '32×32, Kan mushroom', preview: null },
  { token: 'Container', value: '#ffffff', description: 'Max-width 480px, border-radius 8px', preview: '#ffffff' },
  { token: 'Body background', value: '#f4f4f5', description: 'Light gray page bg', preview: '#f4f4f5' },
  { token: 'Footer background', value: '#fafafa', description: 'Top border #e4e4e7', preview: '#fafafa' },
  { token: 'CTA button', value: '#7c3aed', description: 'Violet, border-radius 6px', preview: '#7c3aed' },
  { token: 'Font stack', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', description: 'System font stack', preview: null },
  { token: 'Content padding', value: '32px', description: 'Inner content area', preview: null },
  { token: 'Header padding', value: '24px 32px', description: 'Logo section', preview: null },
  { token: 'Footer padding', value: '24px 32px', description: 'CTA + tagline section', preview: null },
]

export default function BaseTemplateDesignPage() {
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop')

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
        {/* Left: Design tokens */}
        <div className="w-full lg:w-96 shrink-0 border-b lg:border-b-0 lg:border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-y-auto p-5">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-1">Design Tokens</h3>
          <p className="text-xs text-neutral-500 mb-4">Every email inherits these values from BaseLayout.</p>

          <div className="space-y-0 divide-y divide-neutral-100 dark:divide-neutral-800">
            {designTokens.map((t) => (
              <div key={t.token} className="py-3 first:pt-0">
                <div className="flex items-center gap-2">
                  {t.preview && (
                    <span
                      className="inline-block h-4 w-4 rounded border border-neutral-200 dark:border-neutral-700 shrink-0"
                      style={{ backgroundColor: t.preview }}
                    />
                  )}
                  <span className="text-xs font-medium text-neutral-900 dark:text-white">{t.token}</span>
                </div>
                <p className="text-[11px] font-mono text-neutral-500 mt-0.5 break-all">{t.value}</p>
                <p className="text-[11px] text-neutral-400 mt-0.5">{t.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Preview */}
        <div className="flex-1 flex flex-col bg-neutral-50 dark:bg-neutral-900 min-h-0">
          <div className="flex items-center justify-end px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
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
              src="/api/admin/emails/preview?template=base-layout"
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
