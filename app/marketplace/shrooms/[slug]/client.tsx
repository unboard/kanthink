'use client'

import Link from 'next/link'
import type { MarketplaceShroom } from '@/lib/marketplace-data'
import { KanthinkIcon } from '@/components/icons/KanthinkIcon'
import { MushroomIcon } from '@/components/icons/MushroomIcon'

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function ShroomProductClient({ shroom }: { shroom: MarketplaceShroom }) {
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
            <span className="text-xs text-neutral-500">Shrooms</span>
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
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-violet-500/15 to-violet-500/[0.02] border border-violet-500/10 flex items-center justify-center shrink-0 relative overflow-hidden">
            <div className="absolute inset-0 opacity-[0.04]" style={{
              backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 1px)',
              backgroundSize: '12px 12px',
            }} />
            <span className="text-5xl sm:text-6xl relative z-10">{shroom.icon}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-[10px] font-medium text-violet-300">
                <MushroomIcon size={10} className="text-violet-400" />
                Shroom
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.05] text-[10px] font-medium text-neutral-400">
                Made by Kan
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">{shroom.name}</h1>
            <p className="text-sm sm:text-base text-neutral-400 leading-relaxed">{shroom.tagline}</p>

            <div className="flex items-center gap-4 mt-4">
              <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors shadow-lg shadow-violet-600/20">
                <MushroomIcon size={14} />
                Add to Kanthink
              </button>
              <div className="flex items-center gap-1 text-xs text-neutral-500">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
                {formatCount(shroom.usageCount)} uses
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
              <p className="text-sm text-neutral-400 leading-relaxed">{shroom.description}</p>
            </section>

            {/* How it works */}
            <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 sm:p-6">
              <h2 className="text-sm font-semibold text-neutral-200 mb-3">How it works</h2>
              <div className="bg-black/30 rounded-lg p-4 border border-white/[0.04]">
                <p className="text-xs text-neutral-300 font-mono leading-relaxed whitespace-pre-wrap">{shroom.instructions}</p>
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
                  <dt className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider mb-0.5">Action Type</dt>
                  <dd className="text-xs text-neutral-300 capitalize">{shroom.action}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider mb-0.5">Category</dt>
                  <dd className="text-xs text-neutral-300">{shroom.category}</dd>
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
                {shroom.tags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 rounded-full bg-white/[0.04] text-[10px] text-neutral-400 border border-white/[0.06]">
                    {tag}
                  </span>
                ))}
              </div>
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
