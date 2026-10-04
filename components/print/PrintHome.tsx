'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { formatCents } from '@/lib/print/models'
import { bleedSize, formatSize } from '@/lib/print/spec'
import type { PrintBrand, PrintDesign, PrintPreset } from '@/lib/print/types'
import { api, ApiError, thumb } from './api'
import { NewDesign } from './NewDesign'
import { ProductGlyph, SignInGate } from './ui'

function ago(epoch: number): string {
  const s = Math.max(0, Date.now() / 1000 - epoch)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  const d = Math.round(s / 86400)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

function Cover({ design }: { design: PrintDesign }) {
  const sheet = bleedSize(design.spec)
  const v = design.pages.map((p) => p.versions[p.current]).find(Boolean)
  return (
    <div className="mat aspect-[4/3] flex items-center justify-center p-6">
      {v ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb(v.url, 480)} alt="" className="max-w-full max-h-full paper-shadow" style={{ aspectRatio: `${sheet.w}/${sheet.h}` }} />
      ) : (
        <ProductGlyph spec={design.spec} box={110} />
      )}
    </div>
  )
}

export function PrintHome() {
  const [designs, setDesigns] = useState<PrintDesign[] | null>(null)
  const [brands, setBrands] = useState<PrintBrand[]>([])
  const [presets, setPresets] = useState<PrintPreset[]>([])
  const [status, setStatus] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    Promise.all([
      api<{ designs: PrintDesign[] }>('/api/print/designs'),
      api<{ brands: PrintBrand[] }>('/api/print/brands'),
      api<{ presets: PrintPreset[] }>('/api/print/presets'),
    ])
      .then(([d, b, p]) => {
        setDesigns(d.designs)
        setBrands(b.brands)
        setPresets(p.presets)
        if (d.designs.length === 0) setCreating(true)
      })
      .catch((err) => setStatus(err instanceof ApiError ? err.status : 500))
  }, [])

  if (status === 401) return <SignInGate callbackUrl="/print" />

  const remove = async (id: string) => {
    if (!designs) return
    setDesigns(designs.filter((d) => d.id !== id))
    await api(`/api/print/designs/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  const total = designs?.reduce((n, d) => n + d.spendCents, 0) ?? 0

  return (
    <div className="h-full overflow-y-auto print-scroll">
      <header className="sticky top-0 z-10 h-14 flex items-center gap-3 px-4 sm:px-6 border-b" style={{ borderColor: 'var(--line)', background: 'var(--chrome)' }}>
        <Link href="/" className="w-9 h-9 -ml-2 rounded-lg inline-flex items-center justify-center" style={{ color: 'var(--ink-2)' }} aria-label="Back to Kanthink">
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <path d="M10 3L5 8l5 5" />
          </svg>
        </Link>
        <h1 className="text-[16px] font-semibold flex-1">Print studio</h1>
        {total > 0 && (
          <span className="hidden sm:inline text-[12.5px] mr-2" style={{ color: 'var(--muted)' }}>
            {formatCents(total)} spent across designs
          </span>
        )}
        <Link href="/print/easy" className="hidden sm:inline-flex h-9 px-3.5 rounded-lg text-[14px] items-center border" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }} title="Big buttons, one question at a time">
          Easy maker
        </Link>
        <Link href="/print/chat" className="hidden sm:inline-flex h-9 px-3.5 rounded-lg text-[14px] items-center border" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }} title="Tell Kan what you need">
          Chat with Kan
        </Link>
        <button type="button" onClick={() => setCreating(true)} className="h-9 px-4 rounded-lg text-[14px] font-semibold text-white" style={{ background: 'var(--magenta)' }}>
          New design
        </button>
      </header>

      <div className="sm:hidden flex gap-2 px-4 pt-4">
        <Link href="/print/easy" className="flex-1 h-10 rounded-lg text-[14px] inline-flex items-center justify-center border" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
          Easy maker
        </Link>
        <Link href="/print/chat" className="flex-1 h-10 rounded-lg text-[14px] inline-flex items-center justify-center border" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
          Chat with Kan
        </Link>
      </div>

      <main className="px-4 sm:px-6 py-6 max-w-[1240px] mx-auto">
        {status && status !== 401 && (
          <p className="text-[14px]" style={{ color: 'var(--err)' }}>
            Couldn’t load your designs. Refresh to try again.
          </p>
        )}
        {designs && designs.length > 0 && (
          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {designs.map((d) => (
              <div key={d.id} className="group relative rounded-xl overflow-hidden border" style={{ borderColor: 'var(--line)', background: 'var(--chrome-2)' }}>
                <Link href={`/print/${d.id}`} className="block">
                  <Cover design={d} />
                  <div className="px-3.5 py-3">
                    <div className="text-[14px] font-medium truncate">{d.name}</div>
                    <div className="text-[12.5px] mt-0.5 truncate" style={{ color: 'var(--muted)' }}>
                      {d.spec.name} · {formatSize(d.spec)} · {ago(d.updatedAt)}
                    </div>
                  </div>
                </Link>
                <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <a href={"/print/easy?d=" + d.id} className="h-7 px-2.5 rounded-lg text-[12px] inline-flex items-center" style={{ background: 'rgba(19,24,22,.85)', color: 'var(--ink-2)' }}>
                    Easy
                  </a>
                  <a href={"/print/chat?d=" + d.id} className="h-7 px-2.5 rounded-lg text-[12px] inline-flex items-center" style={{ background: 'rgba(19,24,22,.85)', color: 'var(--ink-2)' }}>
                    Chat
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete “${d.name}”? This can’t be undone.`)) remove(d.id)
                  }}
                  className="absolute top-2 right-2 h-7 px-2.5 rounded-lg text-[12px] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  style={{ background: 'rgba(19,24,22,.85)', color: 'var(--ink-2)' }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
        {designs && designs.length === 0 && !creating && (
          <div className="mat rounded-2xl py-20 px-6 text-center">
            <p className="text-[16px]">Nothing on the mat yet.</p>
            <button type="button" onClick={() => setCreating(true)} className="mt-4 h-10 px-5 rounded-xl text-[14px] font-semibold text-white" style={{ background: 'var(--magenta)' }}>
              Start a design
            </button>
          </div>
        )}
      </main>

      {creating && designs && <NewDesign brands={brands} presets={presets} onPresetsChange={setPresets} onClose={() => setCreating(false)} />}
    </div>
  )
}
