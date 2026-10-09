'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { CATALOG, formatLength, formatSize, fromUnit, guideLabel, specWithPageCount, specWithShape, toUnit, type CatalogProduct } from '@/lib/print/spec'
import type { GuideShape, PrintBrand, PrintPreset, PrintSpec, Unit } from '@/lib/print/types'
import { api, uploadImage } from './api'
import { TemplateImport } from './TemplateImport'
import { ProductGlyph } from './ui'

type Choice = { kind: 'product'; product: CatalogProduct } | { kind: 'preset'; preset: PrintPreset } | { kind: 'custom' } | { kind: 'template' }

interface CustomState {
  name: string
  unit: Unit
  width: string
  height: string
  bleed: string
  safe: string
  pages: number
  folds: 'none' | 'bifold' | 'trifold'
  shape: 'rect' | 'rounded' | 'circle' | 'guide'
  radius: string
  guide: { url: string; name: string } | null
  save: boolean
}

const CUSTOM_DEFAULT: CustomState = {
  name: '',
  unit: 'in',
  width: '5',
  height: '7',
  bleed: '0.125',
  safe: '0.125',
  pages: 1,
  folds: 'none',
  shape: 'rect',
  radius: '0.25',
  guide: null,
  save: true,
}

function customSpec(c: CustomState): PrintSpec | null {
  const n = (v: string) => Number(v)
  const w = fromUnit(n(c.width), c.unit)
  const h = fromUnit(n(c.height), c.unit)
  const bleed = fromUnit(n(c.bleed), c.unit)
  const safe = fromUnit(n(c.safe), c.unit)
  if (![w, h, bleed, safe].every((v) => Number.isFinite(v) && v >= 0) || w < 0.5 || h < 0.5) return null
  let guide: GuideShape | undefined
  if (c.shape === 'rounded') guide = { kind: 'rounded', radiusIn: fromUnit(n(c.radius) || 0, c.unit) }
  if (c.shape === 'circle') guide = { kind: 'circle' }
  if (c.shape === 'guide') {
    if (!c.guide) return null
    guide = { kind: 'image', url: c.guide.url, name: c.guide.name }
  }
  const folds =
    c.folds === 'bifold' ? { direction: 'vertical' as const, at: [0.5] } : c.folds === 'trifold' ? { direction: 'vertical' as const, at: [1 / 3, 2 / 3] } : undefined
  const labels = c.pages === 2 ? ['Front', 'Back'] : null
  return {
    id: 'custom',
    name: c.name.trim() || 'Custom size',
    widthIn: w,
    heightIn: h,
    bleedIn: bleed,
    safeIn: safe,
    unit: c.unit,
    folds,
    guide,
    pages: Array.from({ length: c.pages }, (_, i) => ({ label: labels?.[i] ?? (c.pages === 1 ? 'Front' : `Page ${i + 1}`) })),
  }
}

export function NewDesign({ brands, presets, onPresetsChange, onClose }: { brands: PrintBrand[]; presets: PrintPreset[]; onPresetsChange: (p: PrintPreset[]) => void; onClose: () => void }) {
  const router = useRouter()
  const [choice, setChoice] = useState<Choice>({ kind: 'product', product: CATALOG[0] })
  const [pages, setPages] = useState<number>(CATALOG[0].spec.pages.length)
  const [brandId, setBrandId] = useState<string>(brands[0]?.id ?? '')
  const [idea, setIdea] = useState('')
  const [custom, setCustom] = useState<CustomState>(CUSTOM_DEFAULT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadingGuide, setUploadingGuide] = useState(false)
  const [shape, setShape] = useState<string | null>(null)
  const [templateSpec, setTemplateSpec] = useState<PrintSpec | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const spec: PrintSpec | null = useMemo(() => {
    if (choice.kind === 'product') {
      const opts = choice.product.pageOptions
      const base = opts ? specWithPageCount(choice.product.spec, pages) : choice.product.spec
      return specWithShape(base, choice.product, shape)
    }
    if (choice.kind === 'preset') return choice.preset.spec
    if (choice.kind === 'template') return templateSpec
    return customSpec(custom)
  }, [choice, pages, custom, shape, templateSpec])

  const groups = useMemo(() => {
    const map = new Map<string, CatalogProduct[]>()
    for (const p of CATALOG) map.set(p.group, [...(map.get(p.group) ?? []), p])
    return [...map.entries()]
  }, [])

  const pick = (c: Choice) => {
    setChoice(c)
    setError(null)
    if (c.kind === 'product') {
      setPages(c.product.spec.pages.length)
      setShape(c.product.shapes?.[0]?.key ?? null)
    }
  }

  const create = async () => {
    if (!spec) return
    setBusy(true)
    setError(null)
    try {
      // A product read from a template is always kept: adding it is the point.
      if ((choice.kind === 'custom' && custom.save) || choice.kind === 'template') {
        const { preset } = await api<{ preset: PrintPreset }>('/api/print/presets', { method: 'POST', json: { name: spec.name, spec } })
        onPresetsChange([preset, ...presets])
      }
      const { design } = await api<{ design: { id: string } }>('/api/print/designs', {
        method: 'POST',
        json: { spec, brandId: brandId || null },
      })
      if (idea.trim()) {
        await api(`/api/print/designs/${design.id}`, { method: 'PATCH', json: { brief: { prompt: idea.trim(), useLogo: true, useColors: true, useDetails: true, assetIds: [], inspirationIds: [], quality: 'print' } } })
      }
      router.push(`/print/${design.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t start the design.')
      setBusy(false)
    }
  }

  const tile = (key: string, active: boolean, glyph: React.ReactNode, title: string, sub: string, onClick: () => void, onDelete?: () => void) => (
    <div key={key} className="relative group">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className="w-full rounded-xl border p-3 flex flex-col items-center gap-2 text-center transition-colors"
        style={{ borderColor: active ? 'var(--ink-2)' : 'var(--line)', background: active ? 'var(--raise)' : 'transparent' }}
      >
        <span className="h-14 flex items-center justify-center">{glyph}</span>
        <span>
          <span className="block text-[13.5px] font-medium leading-tight" style={{ color: 'var(--ink)' }}>
            {title}
          </span>
          <span className="block text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>
            {sub}
          </span>
        </span>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full hidden group-hover:inline-flex items-center justify-center text-[13px]"
          style={{ background: 'var(--chrome)', color: 'var(--muted)', border: '1px solid var(--line)' }}
          aria-label={`Delete ${title}`}
        >
          ×
        </button>
      )}
    </div>
  )

  const num = (key: 'width' | 'height' | 'bleed' | 'safe' | 'radius', label: string) => (
    <label className="block">
      <span className="block text-[12px] mb-1" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <div className="relative">
        <input
          className="print-input pr-9"
          inputMode="decimal"
          value={custom[key]}
          onChange={(e) => setCustom({ ...custom, [key]: e.target.value })}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px]" style={{ color: 'var(--muted)' }}>
          {custom.unit}
        </span>
      </div>
    </label>
  )

  const switchUnit = (unit: Unit) => {
    if (unit === custom.unit) return
    const conv = (v: string) => {
      const inches = fromUnit(Number(v), custom.unit)
      const out = toUnit(inches, unit)
      return Number.isFinite(out) ? String(Number(out.toFixed(unit === 'mm' ? 1 : 3))) : v
    }
    setCustom({ ...custom, unit, width: conv(custom.width), height: conv(custom.height), bleed: conv(custom.bleed), safe: conv(custom.safe), radius: conv(custom.radius) })
  }

  const ideas = choice.kind === 'product' ? choice.product.sampleIdeas : []

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-0 sm:p-6" role="dialog" aria-label="New design">
      <div className="absolute inset-0" style={{ background: 'rgba(5,8,7,.6)' }} onClick={onClose} />
      <div className="relative w-full h-full sm:h-auto sm:max-h-[min(860px,100%)] max-w-[1040px] sm:rounded-2xl border shadow-2xl flex flex-col md:flex-row overflow-hidden" style={{ background: 'var(--chrome)', borderColor: 'var(--line)' }}>
        {/* What to make */}
        <div className="flex-1 min-h-0 overflow-y-auto print-scroll p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[18px] font-semibold">What are you making?</h2>
            <button type="button" onClick={onClose} className="md:hidden text-[14px]" style={{ color: 'var(--muted)' }}>
              Cancel
            </button>
          </div>
          {groups.map(([group, products]) => (
            <div key={group} className="mb-5">
              <h3 className="text-[12.5px] mb-2" style={{ color: 'var(--muted)' }}>
                {group}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {products.map((p) =>
                  tile(p.key, choice.kind === 'product' && choice.product.key === p.key, <ProductGlyph spec={p.spec} active={choice.kind === 'product' && choice.product.key === p.key} />, p.name, p.blurb, () => pick({ kind: 'product', product: p })),
                )}
              </div>
            </div>
          ))}
          <div className="mb-2">
            <h3 className="text-[12.5px] mb-2" style={{ color: 'var(--muted)' }}>
              Your sizes
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {presets.map((p) =>
                tile(
                  p.id,
                  choice.kind === 'preset' && choice.preset.id === p.id,
                  <ProductGlyph spec={p.spec} active={choice.kind === 'preset' && choice.preset.id === p.id} />,
                  p.name,
                  formatSize(p.spec),
                  () => pick({ kind: 'preset', preset: p }),
                  async () => {
                    onPresetsChange(presets.filter((x) => x.id !== p.id))
                    if (choice.kind === 'preset' && choice.preset.id === p.id) pick({ kind: 'custom' })
                    await api(`/api/print/presets/${p.id}`, { method: 'DELETE' }).catch(() => {})
                  },
                ),
              )}
              {tile(
                'custom',
                choice.kind === 'custom',
                <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
                  <rect x="12" y="8" width="32" height="40" fill="none" stroke="var(--ink-2)" strokeDasharray="3 3" />
                  <path d="M28 21v14M21 28h14" stroke="var(--ink-2)" strokeWidth="1.5" />
                </svg>,
                'Custom size',
                'Any size or shape',
                () => pick({ kind: 'custom' }),
              )}
              {tile(
                'template',
                choice.kind === 'template',
                <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
                  <rect x="6" y="14" width="44" height="30" fill="none" stroke="var(--ink-2)" />
                  <path d="M20.7 14v30M35.3 14v30" stroke="var(--ink-2)" strokeDasharray="2 2" />
                  <path d="M28 6v10M24 12l4 4 4-4" fill="none" stroke="var(--ink-2)" strokeWidth="1.5" />
                </svg>,
                'From a template',
                'Upload a printer’s guide',
                () => pick({ kind: 'template' }),
              )}
            </div>
          </div>
        </div>

        {/* The choice, and how to start */}
        <div className="md:w-[380px] shrink-0 border-t md:border-t-0 md:border-l flex flex-col max-h-[60%] md:max-h-none" style={{ borderColor: 'var(--line)', background: 'var(--chrome-2)' }}>
          <div className="flex-1 overflow-y-auto print-scroll p-5 sm:p-6">
            {choice.kind === 'template' ? (
              <TemplateImport onSpec={setTemplateSpec} />
            ) : choice.kind === 'custom' ? (
              <div className="space-y-3">
                <label className="block">
                  <span className="block text-[12px] mb-1" style={{ color: 'var(--muted)' }}>
                    Name
                  </span>
                  <input className="print-input" placeholder="Event ticket, menu, table tent…" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
                </label>
                <div className="flex items-center justify-between">
                  <span className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
                    Size
                  </span>
                  <div className="inline-flex rounded-full border p-0.5 text-[12.5px]" style={{ borderColor: 'var(--line)' }}>
                    {(['in', 'mm'] as Unit[]).map((u) => (
                      <button key={u} type="button" onClick={() => switchUnit(u)} className="px-2.5 h-6 rounded-full" style={{ background: custom.unit === u ? 'var(--raise)' : 'transparent', color: custom.unit === u ? 'var(--ink)' : 'var(--muted)' }}>
                        {u === 'in' ? 'inches' : 'mm'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {num('width', 'Width')}
                  {num('height', 'Height')}
                  {num('bleed', 'Bleed')}
                  {num('safe', 'Safe margin')}
                </div>
                <label className="block">
                  <span className="block text-[12px] mb-1" style={{ color: 'var(--muted)' }}>
                    Pages
                  </span>
                  <select className="print-input" value={custom.pages} onChange={(e) => setCustom({ ...custom, pages: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 6, 8].map((n) => (
                      <option key={n} value={n}>
                        {n === 1 ? '1 (one side)' : n === 2 ? '2 (front and back)' : n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[12px] mb-1" style={{ color: 'var(--muted)' }}>
                    Folds
                  </span>
                  <select className="print-input" value={custom.folds} onChange={(e) => setCustom({ ...custom, folds: e.target.value as CustomState['folds'] })}>
                    <option value="none">None</option>
                    <option value="bifold">Folds in half</option>
                    <option value="trifold">Folds in thirds</option>
                  </select>
                </label>
                <div>
                  <span className="block text-[12px] mb-1" style={{ color: 'var(--muted)' }}>
                    Shape
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      ['rect', 'Rectangle'],
                      ['rounded', 'Rounded corners'],
                      ['circle', 'Circle or oval'],
                      ['guide', 'Upload a die line'],
                    ] as const).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setCustom({ ...custom, shape: k })}
                        className="h-9 rounded-lg text-[13px] border"
                        style={{ borderColor: custom.shape === k ? 'var(--ink-2)' : 'var(--line)', background: custom.shape === k ? 'var(--raise)' : 'transparent', color: 'var(--ink)' }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {custom.shape === 'rounded' && num('radius', 'Corner radius')}
                {custom.shape === 'guide' && (
                  <div className="rounded-lg border p-3 text-[12.5px] leading-snug" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
                    <p>
                      An image the size of the whole piece including bleed: <b style={{ color: 'var(--ink)' }}>white</b> is the finished shape, <b style={{ color: 'var(--ink)' }}>black</b> is cut away.
                    </p>
                    <label className="mt-2.5 inline-flex h-8 px-3 rounded-lg items-center cursor-pointer" style={{ background: 'var(--raise)', color: 'var(--ink)' }}>
                      {uploadingGuide ? 'Uploading…' : custom.guide ? `Replace (${custom.guide.name})` : 'Choose guide image'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          e.target.value = ''
                          if (!file) return
                          setUploadingGuide(true)
                          try {
                            const up = await uploadImage(file, 'guide')
                            setCustom((c) => ({ ...c, guide: { url: up.url, name: file.name } }))
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Upload failed.')
                          } finally {
                            setUploadingGuide(false)
                          }
                        }}
                      />
                    </label>
                  </div>
                )}
                <label className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: 'var(--ink-2)' }}>
                  <input type="checkbox" checked={custom.save} onChange={(e) => setCustom({ ...custom, save: e.target.checked })} className="w-4 h-4 accent-[color:var(--magenta)]" />
                  Save this size for next time
                </label>
              </div>
            ) : (
              spec && (
                <div>
                  <div className="mat rounded-xl h-[150px] flex items-center justify-center mb-4">
                    <ProductGlyph spec={spec} box={120} active />
                  </div>
                  <h3 className="text-[17px] font-semibold">{spec.name}</h3>
                  <p className="text-[13px] mt-1 leading-snug" style={{ color: 'var(--ink-2)' }}>
                    {formatSize(spec)} · {formatLength(spec.bleedIn, spec.unit)} bleed · {formatLength(spec.safeIn, spec.unit)} safe margin
                    {spec.guide ? ` · ${guideLabel(spec.guide)}` : ''}
                    {spec.folds ? ` · folds into ${spec.folds.at.length + 1} panels` : ''}
                  </p>
                  {choice.kind === 'product' && choice.product.pageOptions && (
                    <div className="mt-4">
                      <span className="block text-[12px] mb-1.5" style={{ color: 'var(--muted)' }}>
                        Sides
                      </span>
                      <div className="inline-flex rounded-full border p-0.5 text-[13px]" style={{ borderColor: 'var(--line)' }}>
                        {choice.product.pageOptions.map((n) => (
                          <button key={n} type="button" onClick={() => setPages(n)} className="px-3 h-7 rounded-full" style={{ background: pages === n ? 'var(--raise)' : 'transparent', color: pages === n ? 'var(--ink)' : 'var(--muted)' }}>
                            {n === 1 ? 'Front only' : n === 2 ? 'Front and back' : `${n} pages`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {choice.kind === 'product' && choice.product.shapes && (
                    <div className="mt-4">
                      <span className="block text-[12px] mb-1.5" style={{ color: 'var(--muted)' }}>
                        Shape
                      </span>
                      <div className="inline-flex rounded-full border p-0.5 text-[13px]" style={{ borderColor: 'var(--line)' }}>
                        {choice.product.shapes.map((s, i) => {
                          const on = (shape ?? choice.product.shapes![0].key) === s.key || (!choice.product.shapes!.some((x) => x.key === shape) && i === 0)
                          return (
                            <button key={s.key} type="button" onClick={() => setShape(s.key)} className="px-3 h-7 rounded-full" style={{ background: on ? 'var(--raise)' : 'transparent', color: on ? 'var(--ink)' : 'var(--muted)' }}>
                              {s.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {choice.kind === 'product' && !choice.product.pageOptions && spec.pages.length > 1 && (
                    <p className="text-[13px] mt-3" style={{ color: 'var(--ink-2)' }}>
                      {spec.pages.map((p) => p.label).join(' and ')}
                    </p>
                  )}
                </div>
              )
            )}

            <div className="mt-5 space-y-3">
              {brands.length > 0 && (
                <label className="block">
                  <span className="block text-[12px] mb-1" style={{ color: 'var(--muted)' }}>
                    Brand
                  </span>
                  <select className="print-input" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                    <option value="">None yet</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block">
                <span className="block text-[12px] mb-1" style={{ color: 'var(--muted)' }}>
                  What’s it for? <span className="opacity-70">You can say this later too</span>
                </span>
                <textarea rows={3} className="print-input resize-none" placeholder="Grand opening this Saturday — free cookie with any coffee" value={idea} onChange={(e) => setIdea(e.target.value)} />
              </label>
              {ideas.length > 0 && !idea && (
                <div className="flex flex-col gap-1.5">
                  {ideas.slice(0, 3).map((s) => (
                    <button key={s} type="button" onClick={() => setIdea(s)} className="text-left text-[12.5px] leading-snug rounded-lg px-2.5 py-1.5 border" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="p-4 border-t flex items-center gap-2" style={{ borderColor: 'var(--line)' }}>
            {error && (
              <span className="text-[12.5px] flex-1" style={{ color: 'var(--err)' }}>
                {error}
              </span>
            )}
            <button type="button" onClick={onClose} className="hidden md:inline h-10 px-3 text-[14px] ml-auto" style={{ color: 'var(--muted)' }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={create}
              disabled={!spec || busy}
              className="h-10 px-4 rounded-xl text-[14px] font-semibold text-white disabled:opacity-40 ml-auto md:ml-0"
              style={{ background: 'var(--magenta)' }}
            >
              {busy ? 'Starting…' : choice.kind === 'template' ? 'Save and start designing' : 'Start designing'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
