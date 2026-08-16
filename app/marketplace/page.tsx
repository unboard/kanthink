'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { channels, CHANNEL_CATEGORIES } from '@/lib/marketplace-data'
import { KanthinkIcon } from '@/components/icons/KanthinkIcon'
import { MushroomIcon } from '@/components/icons/MushroomIcon'

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function MarketplaceNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0e0e0e]/90 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-6 flex items-center justify-between h-14">
        <Link href="/marketplace" className="flex items-center gap-2.5 group">
          <KanthinkIcon size={24} />
          <span className="text-sm font-semibold text-neutral-200 tracking-tight">
            Marketplace
          </span>
        </Link>
        <Link
          href="/"
          className="text-xs font-medium text-neutral-400 hover:text-white transition-colors px-4 py-1.5 rounded-full border border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.04]"
        >
          Open Kanthink
        </Link>
      </div>
    </nav>
  )
}

function ChannelCard({ channel }: { channel: typeof channels[0] }) {
  return (
    <Link
      href={`/marketplace/channels/${channel.slug}`}
      className="group relative flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-emerald-500/20 transition-all duration-200"
    >
      {/* Icon area */}
      <div className="flex items-center justify-center h-32 rounded-t-xl bg-gradient-to-br from-emerald-500/[0.08] to-transparent relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 1px)',
          backgroundSize: '16px 16px',
        }} />
        <span className="text-4xl relative z-10 group-hover:scale-110 transition-transform duration-200">{channel.icon}</span>
      </div>

      <div className="flex flex-col flex-1 p-4 pt-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-sm font-semibold text-neutral-100 group-hover:text-white transition-colors leading-snug">
            {channel.name}
          </h3>
          <svg className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
          </svg>
        </div>
        <p className="text-xs text-neutral-400 leading-relaxed mb-3 line-clamp-2">{channel.tagline}</p>

        <div className="mt-auto flex items-center justify-between">
          <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">{channel.category}</span>
          <span className="text-[10px] text-neutral-500">{formatCount(channel.usageCount)} uses</span>
        </div>
      </div>
    </Link>
  )
}

export default function MarketplacePage() {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const categories = CHANNEL_CATEGORIES

  const filteredChannels = useMemo(() => {
    let items = channels
    if (selectedCategory) items = items.filter(c => c.category === selectedCategory)
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.tagline.toLowerCase().includes(q) ||
        c.tags.some(t => t.includes(q))
      )
    }
    return items.sort((a, b) => b.usageCount - a.usageCount)
  }, [selectedCategory, search])

  return (
    <>
      <MarketplaceNav />

      {/* Hero */}
      <div className="relative overflow-hidden">
        {/* Gradient mesh background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/[0.07] rounded-full blur-[120px]" />
          <div className="absolute top-20 right-1/4 w-80 h-80 bg-emerald-600/[0.05] rounded-full blur-[100px]" />
          <div className="absolute -top-10 right-10 w-60 h-60 bg-violet-500/[0.04] rounded-full blur-[80px]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 pt-16 pb-12 sm:pt-24 sm:pb-16">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-[11px] font-medium text-violet-300">
              <MushroomIcon size={12} className="text-violet-400" />
              Made by Kan
            </span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold text-white tracking-tight leading-[1.1] mb-4">
            Channels
          </h1>
          <p className="text-base sm:text-lg text-neutral-400 max-w-xl leading-relaxed">
            Ready-made boards for your Kanthink workspace. Drop one in and start working.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="sticky top-14 z-40 border-b border-white/[0.06] bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-6">
          {/* Search. The shrooms/channels tab pair went with the shroom catalogue —
              one kind of thing left means nothing to switch between. */}
          <div className="flex items-center gap-4 py-3">
            <div className="flex-1 max-w-xs">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search channels..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg pl-9 pr-3 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Category filters */}
          <div className="flex items-center gap-1.5 pb-3 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1 text-[11px] font-medium rounded-full whitespace-nowrap transition-all ${
                !selectedCategory
                  ? 'bg-white/[0.1] text-white'
                  : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.04]'
              }`}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                className={`px-3 py-1 text-[11px] font-medium rounded-full whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-white/[0.1] text-white'
                    : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.04]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {filteredChannels.map(channel => (
            <ChannelCard key={channel.slug} channel={channel} />
          ))}
        </div>

        {filteredChannels.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-xl bg-white/[0.04] flex items-center justify-center mb-3">
              <svg className="h-5 w-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-sm text-neutral-500">No results found</p>
            <p className="text-xs text-neutral-600 mt-1">Try a different search term or category</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-auto border-t border-white/[0.06] py-8">
        <div className="mx-auto max-w-6xl px-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-neutral-600">
            <KanthinkIcon size={16} />
            <span>Kanthink</span>
          </div>
          <p className="text-[11px] text-neutral-600">All channels are free to use</p>
        </div>
      </footer>
    </>
  )
}
