'use client'

import { useEffect, useRef, useState } from 'react'
import { findPrintModel, formatCents } from '@/lib/print/models'
import { planFrame } from '@/lib/print/spec'
import type { PrintBrand, PrintBrief, PrintSpec, RenderQuality } from '@/lib/print/types'
import { thumb } from './api'

export interface ModelInfo {
  id: string
  label: string
  blurb: string
  provider: 'google' | 'openai'
  available: boolean
}

export type ComposerMode = 'create' | 'edit' | 'area'

export type BrandSection = 'site' | 'logo' | 'colors' | 'details' | 'assets' | 'inspiration'

interface ComposerProps {
  spec: PrintSpec
  brief: PrintBrief
  brand: PrintBrand | null
  models: ModelInfo[]
  mode: ComposerMode
  pageLabel: string
  isFirstPage: boolean
  busy: boolean
  onBrief: (patch: Partial<PrintBrief>) => void
  onOpenBrand: (section: BrandSection) => void
  onSubmit: (prompt: string, takes: number) => void
  onNewTake?: () => void
}

function Chip({
  on,
  onClick,
  children,
  title,
  muted,
}: {
  on?: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
  muted?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-pressed={on}
      className="h-8 shrink-0 inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-3 text-[13px] border transition-colors"
      style={{
        borderColor: on ? 'rgba(232,238,234,.28)' : 'var(--line)',
        background: on ? 'var(--raise)' : 'transparent',
        color: muted ? 'var(--muted)' : on ? 'var(--ink)' : 'var(--ink-2)',
      }}
    >
      {children}
    </button>
  )
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      className="w-3.5 h-3.5 rounded-[4px] inline-flex items-center justify-center border"
      style={{ borderColor: on ? 'var(--ok)' : 'var(--muted)', background: on ? 'var(--ok)' : 'transparent' }}
    >
      {on && (
        <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="#0d1411" strokeWidth={2}>
          <path d="M2.5 6.2l2.3 2.3 4.7-5" />
        </svg>
      )}
    </span>
  )
}

export function Composer(props: ComposerProps) {
  const { spec, brief, brand, models, mode, pageLabel, isFirstPage, busy, onBrief, onOpenBrand, onSubmit, onNewTake } = props
  const [text, setText] = useState(mode === 'create' && isFirstPage ? brief.prompt ?? '' : '')
  const [takes, setTakes] = useState(1)
  const [modelOpen, setModelOpen] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const kit = brand?.data

  // Switching what the composer acts on clears what was typed for the last thing.
  useEffect(() => {
    setText(mode === 'create' && isFirstPage ? brief.prompt ?? '' : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pageLabel])

  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(160, el.scrollHeight)}px`
  }, [text])

  const available = models.filter((m) => m.available)
  const modelId = available.find((m) => m.id === brief.modelId)?.id ?? available[0]?.id
  const model = findPrintModel(modelId)
  const quality: RenderQuality = brief.quality ?? 'print'
  const frame = model ? planFrame(spec, model.provider, quality) : null
  const each = model && frame ? model.cents(frame, quality) : 0
  const count = mode === 'create' ? takes : 1

  const canSubmit = !busy && (mode === 'create' ? isFirstPage ? text.trim().length > 0 : true : text.trim().length > 0)

  const placeholder =
    mode === 'area'
      ? 'What should change in the painted area?'
      : mode === 'edit'
        ? `Ask for a change to the ${pageLabel.toLowerCase()} — “make the headline bigger”, “warmer colors”`
        : isFirstPage
          ? `Describe your ${spec.name.toLowerCase()}: who it’s for, the offer, the feel`
          : `What goes on the ${pageLabel.toLowerCase()}? Leave it blank to carry on from the design so far`

  const action =
    mode === 'area' ? 'Change area' : mode === 'edit' ? 'Apply change' : count > 1 ? `Design ${count} takes` : `Design the ${pageLabel.toLowerCase()}`

  const submit = () => {
    if (!canSubmit) return
    onSubmit(text.trim(), count)
    if (mode !== 'create') setText('')
  }

  const assetsOn = kit ? kit.assets.filter((a) => brief.assetIds.includes(a.id)).length : 0
  const inspoOn = kit ? kit.inspiration.filter((a) => brief.inspirationIds.includes(a.id)).length : 0

  return (
    <div className="border-t px-3 sm:px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]" style={{ borderColor: 'var(--line)', background: 'var(--chrome)' }}>
      <div className="max-w-[920px] mx-auto">
        {/* What goes into the design */}
        <div className="flex items-center gap-2 overflow-x-auto print-scroll pb-2 -mx-1 px-1">
          <Chip on={!!brand} onClick={() => onOpenBrand(brand ? 'details' : 'site')} title="Brand kit">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.4}>
              <path d="M2.5 4.5l5.5-2 5.5 2v3.2c0 3-2.4 5.3-5.5 6.3-3.1-1-5.5-3.3-5.5-6.3z" />
            </svg>
            {brand ? brand.name : 'Add your brand'}
          </Chip>
          {kit?.logo ? (
            <Chip on={brief.useLogo} onClick={() => onBrief({ useLogo: !brief.useLogo })} title="Put the logo on the design">
              <Check on={brief.useLogo} />
              <span className="checker w-5 h-5 rounded-[3px] overflow-hidden inline-flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumb(kit.logo.url, 64)} alt="" className="max-w-full max-h-full object-contain" />
              </span>
              Logo
            </Chip>
          ) : (
            <Chip muted onClick={() => onOpenBrand('logo')}>+ Logo</Chip>
          )}
          {kit?.colors.length ? (
            <Chip on={brief.useColors} onClick={() => onBrief({ useColors: !brief.useColors })} title="Design with the brand colors">
              <Check on={brief.useColors} />
              <span className="flex -space-x-1">
                {kit.colors.slice(0, 5).map((c) => (
                  <span key={c.hex} className="w-3.5 h-3.5 rounded-full border" style={{ background: c.hex, borderColor: 'var(--chrome)' }} />
                ))}
              </span>
              Colors
            </Chip>
          ) : (
            <Chip muted onClick={() => onOpenBrand('colors')}>+ Colors</Chip>
          )}
          {kit && Object.values(kit.details).some(Boolean) ? (
            <Chip on={brief.useDetails} onClick={() => onBrief({ useDetails: !brief.useDetails })} title="Use the business name, phone, address and website">
              <Check on={brief.useDetails} />
              Contact details
            </Chip>
          ) : (
            <Chip muted onClick={() => onOpenBrand('details')}>+ Contact details</Chip>
          )}
          <Chip on={assetsOn > 0} muted={assetsOn === 0} onClick={() => onOpenBrand('assets')} title="Photos and graphics to place on the design">
            {assetsOn > 0 ? `${assetsOn} photo${assetsOn === 1 ? '' : 's'}` : '+ Photos'}
          </Chip>
          <Chip on={inspoOn > 0} muted={inspoOn === 0} onClick={() => onOpenBrand('inspiration')} title="Designs you like, for style">
            {inspoOn > 0 ? `${inspoOn} inspiration` : '+ Inspiration'}
          </Chip>
        </div>

        {/* The ask */}
        <div
          className="rounded-2xl border flex items-end gap-2 p-2 pl-3.5 transition-colors"
          style={{ borderColor: mode === 'area' ? 'var(--magenta)' : 'var(--line)', background: 'var(--chrome-2)' }}
        >
          <textarea
            ref={area}
            value={text}
            rows={1}
            onChange={(e) => {
              setText(e.target.value)
              if (mode === 'create' && isFirstPage) onBrief({ prompt: e.target.value })
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={placeholder}
            className="flex-1 resize-none bg-transparent outline-none text-[15px] leading-6 py-1.5 placeholder:text-[color:var(--muted)]"
            style={{ color: 'var(--ink)' }}
          />
          {onNewTake && mode === 'edit' && (
            <button
              type="button"
              onClick={onNewTake}
              disabled={busy}
              className="h-10 px-3.5 rounded-xl text-[14px] border disabled:opacity-40"
              style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}
              title="Redesign this page from the brief"
            >
              New take
            </button>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="h-10 px-4 rounded-xl text-[14px] font-semibold text-white disabled:opacity-35 transition-opacity whitespace-nowrap"
            style={{ background: 'var(--magenta)' }}
          >
            {action}
          </button>
        </div>

        {/* How it is drawn, and what it costs */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2 text-[12.5px]" style={{ color: 'var(--muted)' }}>
          <div className="relative">
            <button type="button" onClick={() => setModelOpen((v) => !v)} className="inline-flex items-center gap-1 hover:text-[color:var(--ink)]">
              {model?.label ?? 'No image model'}
              <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M3 4.5l3 3 3-3" />
              </svg>
            </button>
            {modelOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setModelOpen(false)} />
                <div className="absolute bottom-7 left-0 z-20 w-[300px] rounded-xl border p-1.5 shadow-2xl" style={{ background: 'var(--chrome-2)', borderColor: 'var(--line)' }}>
                  {models.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!m.available}
                      onClick={() => {
                        onBrief({ modelId: m.id })
                        setModelOpen(false)
                      }}
                      className="w-full text-left rounded-lg px-2.5 py-2 disabled:opacity-40 hover:bg-[color:var(--raise)]"
                      style={{ background: m.id === modelId ? 'var(--raise)' : undefined }}
                    >
                      <div className="text-[13.5px]" style={{ color: 'var(--ink)' }}>
                        {m.label}
                      </div>
                      <div className="text-[12px] leading-snug" style={{ color: 'var(--muted)' }}>
                        {m.available ? m.blurb : `Needs a ${m.provider === 'google' ? 'Google' : 'OpenAI'} key`}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="inline-flex rounded-full border p-0.5" style={{ borderColor: 'var(--line)' }} role="radiogroup" aria-label="Quality">
            {(['print', 'draft'] as RenderQuality[]).map((q) => (
              <button
                key={q}
                type="button"
                role="radio"
                aria-checked={quality === q}
                onClick={() => onBrief({ quality: q })}
                className="px-2.5 h-6 rounded-full"
                style={{ background: quality === q ? 'var(--raise)' : 'transparent', color: quality === q ? 'var(--ink)' : 'var(--muted)' }}
                title={q === 'print' ? 'Full print resolution' : 'Quicker and cheaper while you explore'}
              >
                {q === 'print' ? 'Print quality' : 'Draft'}
              </button>
            ))}
          </div>
          {mode === 'create' && (
            <div className="inline-flex items-center gap-1.5">
              Takes
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTakes(n)}
                  aria-pressed={takes === n}
                  className="w-6 h-6 rounded-full"
                  style={{ background: takes === n ? 'var(--raise)' : 'transparent', color: takes === n ? 'var(--ink)' : 'var(--muted)' }}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          {frame && (
            <span className="ml-auto">
              ≈ {formatCents(each * count)}
              {frame.dpi ? ` · ${frame.dpi} dpi` : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
