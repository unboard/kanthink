'use client'

import { useState } from 'react'

interface Template {
  slug: string
  label: string
}

export function EmailPreviewer({ templates }: { templates: Template[] }) {
  const [selected, setSelected] = useState(templates[0]?.slug ?? '')
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop')

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0">
      {/* Sidebar */}
      <div className="w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-y-auto">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Templates</h2>
          <p className="text-xs text-zinc-500 mt-1">{templates.length} emails</p>
        </div>
        <div className="p-2">
          {templates.map((t) => (
            <button
              key={t.slug}
              onClick={() => setSelected(t.slug)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                selected === t.slug
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Preview area */}
      <div className="flex-1 flex flex-col bg-zinc-50 dark:bg-zinc-900">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {templates.find((t) => t.slug === selected)?.label}
          </span>
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-md p-0.5">
            <button
              onClick={() => setViewport('desktop')}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                viewport === 'desktop'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              Desktop
            </button>
            <button
              onClick={() => setViewport('mobile')}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                viewport === 'mobile'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              Mobile
            </button>
          </div>
        </div>

        {/* Iframe */}
        <div className="flex-1 flex items-start justify-center p-6 overflow-auto">
          <iframe
            key={selected}
            src={`/api/admin/emails/preview?template=${selected}`}
            className="bg-white rounded-lg shadow-md border border-zinc-200 dark:border-zinc-700 transition-all duration-200"
            style={{
              width: viewport === 'desktop' ? 480 : 320,
              height: '100%',
              minHeight: 600,
            }}
            title="Email preview"
          />
        </div>
      </div>
    </div>
  )
}
