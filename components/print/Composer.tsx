'use client'

import { useEffect, useRef, useState } from 'react'
import { DEFAULT_PRINT_MODEL, findPrintModel, formatCents } from '@/lib/print/models'
import { planFrame } from '@/lib/print/spec'
import type { DesignImage, DesignImageRole, PrintBrand, PrintBrief, PrintSpec, RenderQuality } from '@/lib/print/types'
import { shortId, thumb, uploadImage } from './api'

const ROLE_LABEL: Record<DesignImageRole, string> = {
  recreate: 'Recreate this',
  photo: 'Use as a photo',
  inspiration: 'Inspiration',
}

const ROLE_HINT: Record<DesignImageRole, string> = {
  recreate: 'Rebuild this design on this product, fitted to its size, bleed and shape',
  photo: 'Place it on the design as it is',
  inspiration: 'Borrow its style, not its content',
}

export interface ModelInfo {
  id: string
  label: string
  blurb: string
  provider: 'google' | 'openai'
  available: boolean
}

export type ComposerMode = 'create' | 'edit' | 'area' | 'markup'

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
  notify?: (message: string) => void
  /** `markup`: how many marks will be sent. */
  markCount?: number
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
  const { spec, brief, brand, models, mode, pageLabel, isFirstPage, busy, onBrief, onOpenBrand, onSubmit, onNewTake, notify, markCount = 0 } = props
  const [text, setText] = useState(mode === 'create' && isFirstPage ? brief.prompt ?? '' : '')
  const [takes, setTakes] = useState(1)
  const [modelOpen, setModelOpen] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const kit = brand?.data
  const images = brief.images ?? []
  const recreating = images.some((i) => i.role === 'recreate')
  const [uploading, setUploading] = useState(false)
  const fileRole = useRef<DesignImageRole>('photo')
  const fileInput = useRef<HTMLInputElement>(null)

  // Images attached here belong to this design only; the brand kit is untouched.
  const pick = (role: DesignImageRole) => {
    fileRole.current = role
    fileInput.current?.click()
  }

  const attach = async (files: File[]) => {
    const role = fileRole.current
    setUploading(true)
    try {
      const added: DesignImage[] = []
      for (const file of role === 'recreate' ? files.slice(0, 1) : files) {
        try {
          const up = await uploadImage(file, role === 'photo' ? 'asset' : 'inspiration')
          added.push({ id: shortId(), url: up.url, width: up.width, height: up.height, role })
        } catch (err) {
          notify?.(err instanceof Error ? err.message : 'That image didn’t upload.')
        }
      }
      if (!added.length) return
      // One design to recreate at a time: a new one demotes the last to inspiration.
      const kept = role === 'recreate' ? images.map((i) => (i.role === 'recreate' ? { ...i, role: 'inspiration' as const } : i)) : images
      onBrief({ images: [...kept, ...added] })
    } finally {
      setUploading(false)
    }
  }

  const setRole = (id: string, role: DesignImageRole) =>
    onBrief({
      images: images.map((i) =>
        i.id === id ? { ...i, role } : role === 'recreate' && i.role === 'recreate' ? { ...i, role: 'inspiration' as const } : i,
      ),
    })

  const removeImage = (id: string) => onBrief({ images: images.filter((i) => i.id !== id) })

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
  const modelId = available.find((m) => m.id === brief.modelId)?.id ?? available.find((m) => m.id === DEFAULT_PRINT_MODEL)?.id ?? available[0]?.id
  const model = findPrintModel(modelId)
  const quality: RenderQuality = brief.quality ?? 'print'
  const frame = model ? planFrame(spec, model.provider, quality) : null
  const each = model && frame ? model.cents(frame, quality) : 0
  const count = mode === 'create' ? takes : 1

  const canSubmit = !busy && !uploading && (mode === 'create' ? (isFirstPage && !recreating ? text.trim().length > 0 : true) : mode === 'markup' ? true : text.trim().length > 0)

  const placeholder =
    mode === 'markup'
      ? 'Anything else, besides the marks? Optional'
      : mode === 'area'
      ? 'What should change in the painted area?'
      : mode === 'edit'
        ? `Ask for a change to the ${pageLabel.toLowerCase()} — “make the headline bigger”, “warmer colors”`
        : recreating
          ? `Anything to change as it moves onto the ${spec.name.toLowerCase()}? Optional`
          : isFirstPage
          ? `Describe your ${spec.name.toLowerCase()}: who it’s for, the offer, the feel`
          : `What goes on the ${pageLabel.toLowerCase()}? Leave it blank to carry on from the design so far`

  const action =
    mode === 'markup'
      ? `Apply ${markCount} mark${markCount === 1 ? '' : 's'}`
      : mode === 'area'
      ? 'Change area'
      : mode === 'edit'
        ? 'Apply change'
        : recreating
          ? count > 1 ? `Recreate ${count} takes` : `Recreate on the ${pageLabel.toLowerCase()}`
          : count > 1 ? `Design ${count} takes` : `Design the ${pageLabel.toLowerCase()}`

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
          {!!kit?.assets.length && (
            <Chip on={assetsOn > 0} muted={assetsOn === 0} onClick={() => onOpenBrand('assets')} title="Photos saved in your brand kit">
              {assetsOn > 0 ? `${assetsOn} brand photo${assetsOn === 1 ? '' : 's'}` : 'Brand photos'}
            </Chip>
          )}
          {!!kit?.inspiration.length && (
            <Chip on={inspoOn > 0} muted={inspoOn === 0} onClick={() => onOpenBrand('inspiration')} title="Inspiration saved in your brand kit">
              {inspoOn > 0 ? `${inspoOn} brand inspiration` : 'Brand inspiration'}
            </Chip>
          )}
          <Chip muted onClick={() => pick('photo')} title="A photo or graphic for this design only. It isn’t saved to your brand.">
            {uploading ? 'Uploading…' : '+ Image'}
          </Chip>
          <Chip muted={!recreating} on={recreating} onClick={() => pick('recreate')} title="Upload a finished design and rebuild it on this product">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.4}>
              <path d="M13 6.5A5 5 0 0 0 3.6 4.4M3 9.5a5 5 0 0 0 9.4 2.1" />
              <path d="M3.2 1.8v2.8H6M12.8 14.2v-2.8H10" />
            </svg>
            Recreate a design
          </Chip>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              e.target.value = ''
              if (files.length) void attach(files)
            }}
          />
        </div>

        {/* Images attached to this design */}
        {images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto print-scroll pb-2 -mx-1 px-1">
            {images.map((img) => (
              <div
                key={img.id}
                className="shrink-0 flex items-center gap-2 rounded-xl border p-1 pr-1.5"
                style={{ borderColor: img.role === 'recreate' ? 'var(--magenta)' : 'var(--line)', background: 'var(--chrome-2)' }}
                title={ROLE_HINT[img.role]}
              >
                <span className="checker w-10 h-10 rounded-lg overflow-hidden inline-flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumb(img.url, 120)} alt="" className="max-w-full max-h-full object-contain" />
                </span>
                <select
                  value={img.role}
                  onChange={(e) => setRole(img.id, e.target.value as DesignImageRole)}
                  className="bg-transparent text-[12.5px] outline-none"
                  style={{ color: 'var(--ink-2)' }}
                  aria-label="How to use this image"
                >
                  {(Object.keys(ROLE_LABEL) as DesignImageRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => removeImage(img.id)} className="w-6 h-6 rounded text-[14px]" style={{ color: 'var(--muted)' }} aria-label="Remove image">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* The ask */}
        <div
          className="rounded-2xl border flex items-end gap-2 p-2 pl-3.5 transition-colors"
          style={{ borderColor: mode === 'area' || mode === 'markup' ? 'var(--magenta)' : 'var(--line)', background: 'var(--chrome-2)' }}
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
