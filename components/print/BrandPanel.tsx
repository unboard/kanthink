'use client'

import { useEffect, useRef, useState } from 'react'
import { normalizeHex } from '@/lib/print/palette'
import type { BrandImage, BrandKit, PrintBrand, PrintBrief } from '@/lib/print/types'
import { api, importImage, shortId, thumb, uploadImage, type UploadKind } from './api'
import type { BrandSection } from './Composer'

interface CrawlResult {
  url: string
  name?: string
  description?: string
  logos: string[]
  colors: string[]
  phone?: string
  email?: string
  address?: string
  images: string[]
}

interface BrandPanelProps {
  brands: PrintBrand[]
  brand: PrintBrand | null
  brief: PrintBrief
  section: BrandSection
  onSelect: (id: string | null) => void
  onCreate: (name: string, data?: Partial<BrandKit>) => Promise<PrintBrand | null>
  onChange: (brand: PrintBrand) => void
  onBrief: (patch: Partial<PrintBrief>) => void
  onClose: () => void
  notify: (message: string) => void
}

function Heading({ id, title, hint }: { id: string; title: string; hint?: string }) {
  return (
    <div id={id} className="mb-2.5 scroll-mt-4">
      <h3 className="text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>
        {title}
      </h3>
      {hint && (
        <p className="text-[12.5px] leading-snug mt-0.5" style={{ color: 'var(--muted)' }}>
          {hint}
        </p>
      )}
    </div>
  )
}

function Drop({ kind, multiple, onFiles, label, busy }: { kind: UploadKind; multiple?: boolean; onFiles: (files: File[]) => void; label: string; busy?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))
        if (files.length) onFiles(multiple ? files : files.slice(0, 1))
      }}
      className="w-full rounded-xl border border-dashed py-4 text-[13px] transition-colors"
      style={{ borderColor: over ? 'var(--cyan)' : 'var(--line)', color: 'var(--ink-2)', background: over ? 'rgba(34,184,232,.06)' : 'transparent' }}
      disabled={busy}
    >
      {busy ? 'Uploading…' : label}
      <input
        ref={input}
        type="file"
        accept={kind === 'logo' ? 'image/png,image/svg+xml,image/jpeg,image/webp' : 'image/*'}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          if (files.length) onFiles(files)
        }}
      />
    </button>
  )
}

export function BrandPanel(props: BrandPanelProps) {
  const { brands, brand, brief, section, onSelect, onCreate, onChange, onBrief, onClose, notify } = props
  const kit = brand?.data
  const scroller = useRef<HTMLDivElement>(null)
  const [site, setSite] = useState(kit?.website ?? kit?.details.website ?? '')
  const [crawl, setCrawl] = useState<CrawlResult | null>(null)
  const [reading, setReading] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)
  const [suggested, setSuggested] = useState<string[]>([])
  const [addedUrls, setAddedUrls] = useState<Set<string>>(() => new Set())
  const creating = useRef<Promise<PrintBrand | null> | null>(null)

  useEffect(() => {
    const el = document.getElementById(`brand-${section}`)
    if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' })
  }, [section, brand?.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /** Make sure there is a kit to write into, creating one on first use. */
  const ensure = async (seed?: Partial<BrandKit>, name?: string): Promise<PrintBrand | null> => {
    if (brand) return brand
    // One kit, however many edits arrive while it is being made.
    creating.current ??= onCreate(name ?? seed?.details?.business ?? 'My brand', seed).finally(() => {
      setTimeout(() => (creating.current = null), 0)
    })
    return creating.current
  }

  const update = async (fn: (k: BrandKit) => BrandKit, name?: string) => {
    const b = await ensure()
    if (!b) return
    onChange({ ...b, name: name ?? b.name, data: fn(b.data) })
  }

  const readSite = async () => {
    if (!site.trim()) return
    setReading(true)
    setCrawl(null)
    try {
      const { site: found } = await api<{ site: CrawlResult }>('/api/print/crawl', { method: 'POST', json: { url: site } })
      setCrawl(found)
      const b = await ensure({ website: found.url }, found.name)
      if (b) {
        // Fill what's empty; never overwrite what someone typed.
        const d = b.data.details
        onChange({
          ...b,
          name: b.name === 'My brand' && found.name ? found.name : b.name,
          data: {
            ...b.data,
            website: found.url,
            colors: b.data.colors.length ? b.data.colors : found.colors.slice(0, 4).map((hex) => ({ hex })),
            details: {
              ...d,
              business: d.business || found.name,
              phone: d.phone || found.phone,
              email: d.email || found.email,
              address: d.address || found.address,
              website: d.website || new URL(found.url).hostname.replace(/^www\./, ''),
            },
          },
        })
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Couldn’t read that site.')
    } finally {
      setReading(false)
    }
  }

  const setLogoFrom = async (load: () => Promise<{ url: string; width: number; height: number; palette?: string[] }>, key: string) => {
    setImporting(key)
    try {
      const up = await load()
      const b = await ensure()
      if (!b) return
      const logo: BrandImage = { id: shortId(), url: up.url, width: up.width, height: up.height }
      const colors = b.data.colors.length ? b.data.colors : (up.palette ?? []).slice(0, 4).map((hex) => ({ hex }))
      onChange({ ...b, data: { ...b.data, logo, colors } })
      setSuggested((up.palette ?? []).filter((hex) => !colors.some((c) => c.hex === hex)))
      onBrief({ useLogo: true })
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Couldn’t use that logo.')
    } finally {
      setImporting(null)
    }
  }

  const addImages = async (pool: 'assets' | 'inspiration', loads: (() => Promise<{ url: string; width: number; height: number }>)[], key: string) => {
    setImporting(key)
    try {
      const results = await Promise.allSettled(loads.map((l) => l()))
      const added: BrandImage[] = []
      for (const r of results) {
        if (r.status === 'fulfilled') added.push({ id: shortId(), url: r.value.url, width: r.value.width, height: r.value.height })
        else notify(r.reason instanceof Error ? r.reason.message : 'One image didn’t upload.')
      }
      if (!added.length) return
      const b = await ensure()
      if (!b) return
      onChange({ ...b, data: { ...b.data, [pool]: [...b.data[pool], ...added] } })
      // New photos are in this design by default; that is nearly always why they were added.
      const idsKey = pool === 'assets' ? 'assetIds' : 'inspirationIds'
      onBrief({ [idsKey]: [...brief[idsKey], ...added.map((a) => a.id)] } as Partial<PrintBrief>)
    } finally {
      setImporting(null)
    }
  }

  const toggleUse = (pool: 'assets' | 'inspiration', id: string) => {
    const key = pool === 'assets' ? 'assetIds' : 'inspirationIds'
    const ids = brief[key]
    onBrief({ [key]: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] } as Partial<PrintBrief>)
  }

  const imageGrid = (pool: 'assets' | 'inspiration') => {
    const items = kit?.[pool] ?? []
    const ids = pool === 'assets' ? brief.assetIds : brief.inspirationIds
    if (!items.length) return null
    return (
      <div className="grid grid-cols-2 gap-2.5 mb-2.5">
        {items.map((img) => {
          const on = ids.includes(img.id)
          return (
            <div key={img.id} className="rounded-lg border overflow-hidden" style={{ borderColor: on ? 'var(--ink-2)' : 'var(--line)', background: 'var(--chrome-2)' }}>
              <button type="button" onClick={() => toggleUse(pool, img.id)} className="relative block w-full aspect-[4/3] checker" title={on ? 'In this design' : 'Not in this design'}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumb(img.url, 360)} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <span
                  className="absolute top-1.5 left-1.5 text-[11.5px] px-1.5 py-0.5 rounded-md"
                  style={{ background: on ? 'var(--ok)' : 'rgba(19,24,22,.8)', color: on ? '#0d1411' : 'var(--ink-2)' }}
                >
                  {on ? 'In this design' : 'Not used'}
                </span>
              </button>
              <div className="flex items-center gap-1 p-1.5">
                <input
                  className="flex-1 min-w-0 bg-transparent text-[12.5px] px-1 py-0.5 outline-none"
                  style={{ color: 'var(--ink-2)' }}
                  placeholder={pool === 'assets' ? 'What is it? Where to use it?' : 'What do you like about it?'}
                  value={img.note ?? ''}
                  onChange={(e) => update((k) => ({ ...k, [pool]: k[pool].map((x) => (x.id === img.id ? { ...x, note: e.target.value } : x)) }))}
                />
                <button
                  type="button"
                  onClick={() => update((k) => ({ ...k, [pool]: k[pool].filter((x) => x.id !== img.id) }))}
                  className="w-6 h-6 rounded text-[14px]"
                  style={{ color: 'var(--muted)' }}
                  aria-label="Remove"
                >
                  ×
                </button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const detail = (key: keyof BrandKit['details'], label: string, placeholder: string, multiline = false) => (
    <label className="block">
      <span className="block text-[12px] mb-1" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      {multiline ? (
        <textarea
          rows={2}
          className="print-input resize-none"
          placeholder={placeholder}
          value={kit?.details[key] ?? ''}
          onChange={(e) => update((k) => ({ ...k, details: { ...k.details, [key]: e.target.value } }))}
        />
      ) : (
        <input
          className="print-input"
          placeholder={placeholder}
          value={kit?.details[key] ?? ''}
          onChange={(e) => update((k) => ({ ...k, details: { ...k.details, [key]: e.target.value } }))}
        />
      )}
    </label>
  )

  return (
    <div className="fixed inset-0 z-[70] flex justify-end" role="dialog" aria-label="Brand kit">
      <div className="absolute inset-0" style={{ background: 'rgba(5,8,7,.5)' }} onClick={onClose} />
      <div className="relative w-full sm:w-[440px] h-full flex flex-col border-l shadow-2xl" style={{ background: 'var(--chrome)', borderColor: 'var(--line)' }}>
        <div className="flex items-center gap-2 px-4 h-14 border-b shrink-0" style={{ borderColor: 'var(--line)' }}>
          {brand ? (
            <input
              className="flex-1 min-w-0 bg-transparent text-[15px] font-semibold outline-none"
              value={brand.name}
              onChange={(e) => onChange({ ...brand, name: e.target.value })}
              aria-label="Brand name"
            />
          ) : (
            <span className="flex-1 text-[15px] font-semibold">Your brand</span>
          )}
          {brands.length > 0 && (
            <select
              className="h-8 rounded-lg px-2 text-[13px] max-w-[150px]"
              style={{ background: 'var(--chrome-2)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}
              value={brand?.id ?? ''}
              onChange={async (e) => {
                if (e.target.value === '__new') {
                  const created = await onCreate('New brand')
                  if (created) onSelect(created.id)
                } else onSelect(e.target.value || null)
              }}
              aria-label="Switch brand"
            >
              <option value="">No brand</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
              <option value="__new">New brand…</option>
            </select>
          )}
          <button type="button" onClick={onClose} className="h-8 px-3 rounded-lg text-[13px] font-medium" style={{ background: 'var(--raise)', color: 'var(--ink)' }}>
            Done
          </button>
        </div>

        <div ref={scroller} className="flex-1 overflow-y-auto print-scroll px-4 py-5 space-y-7 relative">
          <section>
            <Heading id="brand-site" title="Start from your website" hint="We’ll pick up your logo, colors, phone, email and address. Keep what’s right." />
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                readSite()
              }}
            >
              <input className="print-input" placeholder="yourbusiness.com" value={site} onChange={(e) => setSite(e.target.value)} inputMode="url" />
              <button type="submit" disabled={reading || !site.trim()} className="h-[38px] px-3.5 rounded-lg text-[13.5px] font-medium shrink-0 disabled:opacity-40" style={{ background: 'var(--raise)', color: 'var(--ink)' }}>
                {reading ? 'Reading…' : 'Read site'}
              </button>
            </form>
            {crawl && (
              <div className="mt-3 rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--line)', background: 'var(--chrome-2)' }}>
                {crawl.logos.length > 0 && (
                  <div>
                    <div className="text-[12px] mb-1.5" style={{ color: 'var(--muted)' }}>
                      Logos found — pick yours
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {crawl.logos.map((url) => (
                        <button
                          key={url}
                          type="button"
                          onClick={() => setLogoFrom(() => importImage(url, 'logo'), url)}
                          className="checker h-14 min-w-14 max-w-[140px] px-2 rounded-lg border flex items-center justify-center disabled:opacity-50"
                          style={{ borderColor: 'var(--line)' }}
                          disabled={!!importing}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" className="max-h-11 max-w-full object-contain" />
                          {importing === url && <span className="absolute text-[11px]">…</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {crawl.images.length > 0 && (
                  <div>
                    <div className="text-[12px] mb-1.5" style={{ color: 'var(--muted)' }}>
                      Photos from the site — tap to add
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {crawl.images.slice(0, 8).map((url) => {
                        const added = addedUrls.has(url)
                        return (
                          <button
                            key={url}
                            type="button"
                            disabled={!!importing || added}
                            onClick={() => addImages('assets', [() => importImage(url, 'asset')], url).then(() => setAddedUrls((prev) => new Set(prev).add(url)))}
                            className="relative aspect-square rounded-md overflow-hidden border disabled:opacity-50"
                            style={{ borderColor: 'var(--line)' }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="w-full h-full object-cover" />
                            {importing === url && <span className="absolute inset-0 flex items-center justify-center text-[11px]" style={{ background: 'rgba(0,0,0,.5)' }}>Adding…</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {!crawl.logos.length && !crawl.images.length && (
                  <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
                    Read the site’s details. No logo or photos were found — upload them below.
                  </p>
                )}
              </div>
            )}
          </section>

          <section>
            <Heading id="brand-logo" title="Logo" hint="Placed exactly as you give it. A PNG with a transparent background or an SVG works best." />
            {kit?.logo ? (
              <div className="flex items-center gap-3 mb-2.5">
                <div className="checker w-36 h-20 rounded-lg border flex items-center justify-center p-2" style={{ borderColor: 'var(--line)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumb(kit.logo.url, 300)} alt="Logo" className="max-w-full max-h-full object-contain" />
                </div>
                <button type="button" onClick={() => update((k) => ({ ...k, logo: null }))} className="text-[13px]" style={{ color: 'var(--muted)' }}>
                  Remove
                </button>
              </div>
            ) : null}
            <Drop
              kind="logo"
              busy={importing === 'logo-upload'}
              label={kit?.logo ? 'Replace logo' : 'Drop your logo here, or choose a file'}
              onFiles={(files) => setLogoFrom(() => uploadImage(files[0], 'logo'), 'logo-upload')}
            />
          </section>

          <section>
            <Heading id="brand-colors" title="Colors" hint="Designs are built from these. The first is used most." />
            <div className="flex flex-wrap items-center gap-2">
              {(kit?.colors ?? []).map((c, i) => (
                <div key={`${c.hex}-${i}`} className="flex items-center gap-1.5 rounded-full border pl-1 pr-2 h-9" style={{ borderColor: 'var(--line)' }}>
                  <label className="relative w-7 h-7 rounded-full overflow-hidden cursor-pointer border" style={{ background: c.hex, borderColor: 'rgba(255,255,255,.15)' }}>
                    <input
                      type="color"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      value={c.hex.toLowerCase()}
                      onChange={(e) => update((k) => ({ ...k, colors: k.colors.map((x, j) => (j === i ? { ...x, hex: e.target.value.toUpperCase() } : x)) }))}
                      aria-label={`Color ${i + 1}`}
                    />
                  </label>
                  <input
                    className="w-[70px] bg-transparent text-[12.5px] outline-none uppercase"
                    style={{ color: 'var(--ink-2)' }}
                    defaultValue={c.hex}
                    key={c.hex}
                    onBlur={(e) => {
                      const hex = normalizeHex(e.target.value)
                      if (hex) update((k) => ({ ...k, colors: k.colors.map((x, j) => (j === i ? { ...x, hex } : x)) }))
                      else e.target.value = c.hex
                    }}
                  />
                  <button type="button" onClick={() => update((k) => ({ ...k, colors: k.colors.filter((_, j) => j !== i) }))} className="text-[13px]" style={{ color: 'var(--muted)' }} aria-label="Remove color">
                    ×
                  </button>
                </div>
              ))}
              {(kit?.colors.length ?? 0) < 8 && (
                <button
                  type="button"
                  onClick={() => update((k) => ({ ...k, colors: [...k.colors, { hex: '#1F6F5C' }] }))}
                  className="h-9 px-3 rounded-full border border-dashed text-[13px]"
                  style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}
                >
                  + Add color
                </button>
              )}
            </div>
            {suggested.length > 0 && (
              <div className="flex items-center gap-2 mt-2.5 text-[12.5px]" style={{ color: 'var(--muted)' }}>
                From your logo:
                {suggested.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    title={`Add ${hex}`}
                    onClick={() => {
                      update((k) => ({ ...k, colors: [...k.colors, { hex }].slice(0, 8) }))
                      setSuggested((s) => s.filter((x) => x !== hex))
                    }}
                    className="w-6 h-6 rounded-full border"
                    style={{ background: hex, borderColor: 'rgba(255,255,255,.2)' }}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <Heading id="brand-details" title="Contact details" hint="Printed exactly as written — we never make these up." />
            <div className="space-y-2.5">
              {detail('business', 'Business name', 'Hearth Bakehouse')}
              {detail('tagline', 'Tagline', 'Baked fresh every morning')}
              <div className="grid grid-cols-2 gap-2.5">
                {detail('phone', 'Phone', '(555) 012-3456')}
                {detail('email', 'Email', 'hello@yourbusiness.com')}
              </div>
              {detail('website', 'Website', 'yourbusiness.com')}
              {detail('address', 'Address', '412 Maple Ave, Columbus, OH', true)}
              {detail('other', 'Anything else', 'Hours, license number, social handles…', true)}
              <label className="block">
                <span className="block text-[12px] mb-1" style={{ color: 'var(--muted)' }}>
                  Tone and audience
                </span>
                <textarea
                  rows={2}
                  className="print-input resize-none"
                  placeholder="Friendly and local; families in the neighborhood"
                  value={kit?.voice ?? ''}
                  onChange={(e) => update((k) => ({ ...k, voice: e.target.value }))}
                />
              </label>
            </div>
          </section>

          <section>
            <Heading id="brand-assets" title="Photos and graphics" hint="Your own photos, product shots, headshots or a QR code. Tap one to put it in or take it out of this design." />
            {imageGrid('assets')}
            <Drop kind="asset" multiple busy={importing === 'assets-upload'} label="Add photos" onFiles={(files) => addImages('assets', files.map((f) => () => uploadImage(f, 'asset')), 'assets-upload')} />
          </section>

          <section className="pb-6">
            <Heading id="brand-inspiration" title="Inspiration" hint="Designs you like. Used for style only — never copied." />
            {imageGrid('inspiration')}
            <Drop kind="inspiration" multiple busy={importing === 'inspo-upload'} label="Add inspiration" onFiles={(files) => addImages('inspiration', files.map((f) => () => uploadImage(f, 'inspiration')), 'inspo-upload')} />
          </section>
        </div>
      </div>
    </div>
  )
}
