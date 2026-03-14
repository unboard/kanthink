'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { MarketplaceChannel } from '@/lib/marketplace-data'
import { useStore } from '@/lib/store'
import { KanthinkIcon } from '@/components/icons/KanthinkIcon'

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function ChannelProductClient({ channel }: { channel: MarketplaceChannel }) {
  const router = useRouter()
  const createChannelWithStructure = useStore((s) => s.createChannelWithStructure)
  const [isAdding, setIsAdding] = useState(false)

  const handleAddChannel = () => {
    if (isAdding) return
    setIsAdding(true)
    try {
      const newChannel = createChannelWithStructure({
        name: channel.name,
        description: channel.description,
        aiInstructions: channel.aiInstructions,
        columns: channel.columns.map((name, i) => ({ name, isAiTarget: i === 0 })),
        instructionCards: [],
      })
      router.push(`/channel/${newChannel.id}`)
    } catch (err) {
      console.error('Failed to add channel:', err)
      setIsAdding(false)
    }
  }

  return (
    <>
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="mx-auto max-w-4xl px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Link href="/marketplace" className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors">
              <KanthinkIcon size={20} />
              <span className="text-xs font-medium">Marketplace</span>
            </Link>
            <svg className="h-3 w-3 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-xs text-neutral-500">Channels</span>
          </div>
          <Link
            href="/"
            className="text-xs font-medium text-neutral-400 hover:text-white transition-colors px-4 py-1.5 rounded-full border border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.04]"
          >
            Open Kanthink
          </Link>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-6 py-10 sm:py-16">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start gap-6 mb-10">
          {/* Icon */}
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-emerald-500/[0.02] border border-emerald-500/10 flex items-center justify-center shrink-0 relative overflow-hidden">
            <div className="absolute inset-0 opacity-[0.04]" style={{
              backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 1px)',
              backgroundSize: '12px 12px',
            }} />
            <span className="text-5xl sm:text-6xl relative z-10">{channel.icon}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-medium text-emerald-300">
                <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                </svg>
                Channel
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.05] text-[10px] font-medium text-neutral-400">
                Made by Kan
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">{channel.name}</h1>
            <p className="text-sm sm:text-base text-neutral-400 leading-relaxed">{channel.tagline}</p>

            <div className="flex items-center gap-4 mt-4">
              <button
                onClick={handleAddChannel}
                disabled={isAdding}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors shadow-lg shadow-emerald-600/20"
              >
                {isAdding ? (
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                )}
                {isAdding ? 'Adding...' : 'Add Channel'}
              </button>
              <div className="flex items-center gap-1 text-xs text-neutral-500">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
                {formatCount(channel.usageCount)} uses
              </div>
            </div>
          </div>
        </div>

        {/* Content grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="sm:col-span-2 space-y-6">
            {/* Description */}
            <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 sm:p-6">
              <h2 className="text-sm font-semibold text-neutral-200 mb-3">About</h2>
              <p className="text-sm text-neutral-400 leading-relaxed">{channel.description}</p>
            </section>

            {/* Column preview */}
            <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 sm:p-6">
              <h2 className="text-sm font-semibold text-neutral-200 mb-4">Board Layout</h2>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                {channel.columns.map((col, i) => (
                  <div
                    key={col}
                    className="shrink-0 w-32 rounded-lg border border-white/[0.06] bg-black/30 p-3"
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-1.5 h-1.5 rounded-full" style={{
                        backgroundColor: [
                          '#8b5cf6', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#ec4899',
                        ][i % 6],
                      }} />
                      <span className="text-[11px] font-medium text-neutral-300 truncate">{col}</span>
                    </div>
                    {/* Placeholder cards */}
                    <div className="space-y-1.5">
                      {[...Array(Math.max(1, 3 - i % 3))].map((_, j) => (
                        <div key={j} className="h-4 rounded bg-white/[0.03] border border-white/[0.04]" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* AI Instructions */}
            <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 sm:p-6">
              <h2 className="text-sm font-semibold text-neutral-200 mb-3">AI Instructions</h2>
              <div className="bg-black/30 rounded-lg p-4 border border-white/[0.04]">
                <p className="text-xs text-neutral-300 font-mono leading-relaxed whitespace-pre-wrap">{channel.aiInstructions}</p>
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Details */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <h3 className="text-xs font-semibold text-neutral-300 mb-3">Details</h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider mb-0.5">Columns</dt>
                  <dd className="text-xs text-neutral-300">{channel.columns.length} columns</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider mb-0.5">Category</dt>
                  <dd className="text-xs text-neutral-300">{channel.category}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider mb-0.5">Creator</dt>
                  <dd className="flex items-center gap-1.5 text-xs text-neutral-300">
                    <KanthinkIcon size={14} />
                    Kanthink
                  </dd>
                </div>
              </dl>
            </div>

            {/* Tags */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <h3 className="text-xs font-semibold text-neutral-300 mb-3">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {channel.tags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 rounded-full bg-white/[0.04] text-[10px] text-neutral-400 border border-white/[0.06]">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Columns list */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <h3 className="text-xs font-semibold text-neutral-300 mb-3">Columns</h3>
              <ol className="space-y-1.5">
                {channel.columns.map((col, i) => (
                  <li key={col} className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className="w-4 h-4 rounded bg-white/[0.04] flex items-center justify-center text-[10px] text-neutral-500 shrink-0">{i + 1}</span>
                    {col}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-auto border-t border-white/[0.06] py-6">
        <div className="mx-auto max-w-4xl px-6 flex items-center justify-between">
          <Link href="/marketplace" className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
            &larr; Back to Marketplace
          </Link>
          <div className="flex items-center gap-2 text-[11px] text-neutral-600">
            <KanthinkIcon size={14} />
            Kanthink
          </div>
        </div>
      </footer>
    </>
  )
}
