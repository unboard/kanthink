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
    <div className="flex h-full gap-0">
      {/* Sidebar */}
      <div className="w-64 shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-y-auto">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Templates</h2>
          <p className="text-xs text-neutral-500 mt-1">{templates.length} emails</p>
        </div>
        <div className="p-2">
          {templates.map((t) => (
            <button
              key={t.slug}
              onClick={() => setSelected(t.slug)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                selected === t.slug
                  ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-medium'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Preview area */}
      <div className="flex-1 flex flex-col bg-neutral-50 dark:bg-neutral-900">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {templates.find((t) => t.slug === selected)?.label}
          </span>
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

        {/* Iframe */}
        <div className="flex-1 flex items-start justify-center p-6 overflow-auto">
          <iframe
            key={selected}
            src={`/api/admin/emails/preview?template=${selected}`}
            className="bg-white rounded-lg shadow-md border border-neutral-200 dark:border-neutral-700 transition-all duration-200"
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
