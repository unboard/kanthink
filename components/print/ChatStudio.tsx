'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { KanthinkIcon } from '@/components/icons/KanthinkIcon'
import { KAN_GREETING, KAN_GREETING_SUGGESTIONS, type ChatAction, type ChatReply, type ChatTurn } from '@/lib/print/chat'
import { formatCents } from '@/lib/print/models'
import { normalizeHex } from '@/lib/print/palette'
import { bleedSize, catalogProduct, specWithPageCount, validateSpec } from '@/lib/print/spec'
import type { BrandKit, ChatMessage, PrintBrand, PrintDesign, PrintSpec, PrintVersion } from '@/lib/print/types'
import { api, importImage, shortId, thumb, uploadImage } from './api'
import { ExportDialog } from './ExportDialog'
import { Sheet } from './Sheet'
import { Notice, SignInGate, SurfaceSwitch, useNotice } from './ui'
import { useDesign, type RenderOutcome } from './useDesign'
import { useDictation } from './useDictation'

/** How many rounds Kan may act and look at the result before handing back. */
const MAX_ROUNDS = 3

const now = () => Math.floor(Date.now() / 1000)

function greeting(): ChatMessage {
  return { id: 'hello', role: 'kan', text: KAN_GREETING, suggestions: KAN_GREETING_SUGGESTIONS, at: now() }
}

interface Working {
  label: string
  startedAt: number
}

function useSeconds(since: number | undefined) {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => {
    if (!since) return
    const i = setInterval(() => setT(Date.now()), 500)
    return () => clearInterval(i)
  }, [since])
  return since ? Math.max(0, Math.round((t - since) / 1000)) : 0
}

function KanAvatar() {
  return (
    <span className="w-8 h-8 shrink-0 rounded-full inline-flex items-center justify-center" style={{ background: 'var(--raise)', color: 'var(--ink)' }} aria-hidden>
      <KanthinkIcon size={18} />
    </span>
  )
}

function WorkingBubble({ working }: { working: Working }) {
  const s = useSeconds(working.startedAt)
  return (
    <div className="flex items-start gap-2.5">
      <KanAvatar />
      <div className="relative overflow-hidden rounded-2xl rounded-tl-md px-3.5 py-2.5 text-[14.5px] render-sweep" style={{ background: 'var(--chrome-2)', color: 'var(--ink-2)', border: '1px solid var(--line)' }}>
        {working.label}… <span style={{ color: 'var(--muted)' }}>{s}s</span>
      </div>
    </div>
  )
}

/** Build a spec for a create_design action. */
function specFor(action: ChatAction): PrintSpec | null {
  if (action.product && action.product !== 'custom') {
    const product = catalogProduct(action.product)
    if (!product) return null
    const sides = action.sides ?? product.spec.pages.length
    return product.pageOptions ? specWithPageCount(product.spec, sides) : product.spec
  }
  if (action.widthIn && action.heightIn) {
    const sides = Math.max(1, Math.min(8, action.sides ?? 1))
    return validateSpec({
      id: 'custom',
      name: action.name || 'Custom size',
      widthIn: action.widthIn,
      heightIn: action.heightIn,
      bleedIn: 0.125,
      safeIn: 0.125,
      pages: Array.from({ length: sides }, (_, i) => ({ label: sides === 2 ? ['Front', 'Back'][i] : sides === 1 ? 'Front' : `Page ${i + 1}` })),
    })
  }
  return null
}

function outcomeEvent(verb: string, label: string, pageNumber: number, out: RenderOutcome): string {
  if (!out.versions.length) return `Couldn’t ${verb} page ${pageNumber} (${label}): ${out.errors[0] ?? 'unknown error'}.`
  const v = out.versions[0]
  const words = v.copy ? [v.copy.headline, v.copy.subhead].filter(Boolean).join(' / ') : ''
  const check = v.check
    ? v.check.issues.length
      ? `Print check: ${v.check.issues.map((i) => `${i.severity} — ${i.message}`).join('; ')}`
      : 'Print check: ready to print.'
    : 'Print check: still running.'
  return `${verb[0].toUpperCase()}${verb.slice(1)} page ${pageNumber} (${label})${out.versions.length > 1 ? ` — ${out.versions.length} versions to choose from` : ''}. ${words ? `Words: ${words}.` : ''} ${check} ${v.check ? `${v.check.dpi} dpi.` : ''}`.trim()
}

export function ChatStudio({ initialId }: { initialId: string | null }) {
  const { notice, notify } = useNotice()
  const h = useDesign(initialId, { notify })
  const { design, brand, brands, ready, loadError } = h
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [text, setText] = useState('')
  const [thinking, setThinking] = useState(false)
  const [working, setWorking] = useState<Working | null>(null)
  const [exporting, setExporting] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [zoom, setZoom] = useState<number | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const logoInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const dictationBase = useRef('')
  const dictation = useDictation((heard) => setText(`${dictationBase.current}${dictationBase.current && heard ? ' ' : ''}${heard}`))

  // The live design and brand, for actions that run after awaits.
  const designRef = useRef<PrintDesign | null>(null)
  const brandRef = useRef<PrintBrand | null>(null)
  useEffect(() => {
    designRef.current = design
    brandRef.current = brand
  }, [design, brand])

  // Resume the conversation the design was made in, or start one.
  useEffect(() => {
    if (!ready || loaded) return
    setMessages(design?.chat?.length ? design.chat : [greeting()])
    setLoaded(true)
  }, [ready, loaded, design])

  // The conversation lives on the design once there is one.
  const { patch } = h
  useEffect(() => {
    if (!loaded || !designRef.current) return
    patch((d) => (d.chat === messages ? d : { ...d, chat: messages }))
  }, [messages, loaded, patch, design?.id])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [messages, working, thinking])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(140, el.scrollHeight)}px`
  }, [text])

  const add = useCallback((m: Omit<ChatMessage, 'id' | 'at'>) => {
    const msg = { ...m, id: shortId(), at: now() }
    setMessages((all) => [...all, msg])
    return msg
  }, [])

  // ---- brand helpers -------------------------------------------------------
  const updateKit = useCallback(
    async (name: string, fn: (k: BrandKit) => BrandKit) => {
      const b = brandRef.current ?? (await h.ensureBrand(name))
      if (!b) return null
      const next = { ...b, data: fn(b.data) }
      brandRef.current = next
      h.changeBrand(next)
      return next
    },
    [h],
  )

  // ---- running Kan's actions ----------------------------------------------
  const runActions = useCallback(
    async (actions: ChatAction[]): Promise<{ events: string[]; images: NonNullable<ChatMessage['images']> }> => {
      const events: string[] = []
      const images: NonNullable<ChatMessage['images']> = []
      const pageOf = (n: number | undefined) => Math.max(0, (n ?? 1) - 1)
      const showVersions = (pageIndex: number, versions: PrintVersion[]) => {
        const label = designRef.current?.pages[pageIndex]?.label ?? `Page ${pageIndex + 1}`
        versions.forEach((v, i) => images.push({ url: v.url, label: versions.length > 1 ? `${label} · take ${i + 1}` : label, pageIndex }))
      }
      const needDesign = (what: string) => {
        if (designRef.current) return false
        events.push(`Couldn’t ${what}: no design has been started yet.`)
        return true
      }

      for (const a of actions) {
        try {
          switch (a.type) {
            case 'create_design': {
              if (designRef.current) {
                events.push('A design already exists; kept working on it.')
                break
              }
              const spec = specFor(a)
              if (!spec) {
                events.push(`Couldn’t start a design: unknown product “${a.product ?? ''}”.`)
                break
              }
              const brandId = brandRef.current?.id ?? brands[0]?.id ?? null
              const { design: created } = await api<{ design: PrintDesign }>('/api/print/designs', {
                method: 'POST',
                json: { spec, brandId, name: a.name },
              })
              h.adopt({ ...created, chat: messages })
              designRef.current = created
              window.history.replaceState(null, '', `/print/chat?d=${created.id}`)
              events.push(`Started “${created.name}”: a ${spec.name.toLowerCase()}, ${spec.pages.length} page${spec.pages.length === 1 ? '' : 's'} (${spec.pages.map((p) => p.label).join(', ')}).${brandId ? ' Using the saved brand kit.' : ''}`)
              break
            }
            case 'set_brief': {
              if (a.prompt && designRef.current) h.setBrief({ prompt: a.prompt })
              break
            }
            case 'set_details': {
              const fields = (['business', 'tagline', 'phone', 'email', 'website', 'address'] as const).filter((k) => a[k])
              if (!fields.length) break
              await updateKit(a.business ?? 'My brand', (k) => ({ ...k, details: { ...k.details, ...Object.fromEntries(fields.map((f) => [f, a[f]])) } }))
              break
            }
            case 'set_colors': {
              const colors = (a.colors ?? []).map((c) => normalizeHex(c)).filter((c): c is string => !!c)
              if (colors.length) await updateKit('My brand', (k) => ({ ...k, colors: colors.map((hex) => ({ hex })) }))
              break
            }
            case 'read_website': {
              if (!a.url) break
              setWorking({ label: 'Reading the website', startedAt: Date.now() })
              const { site } = await api<{ site: { url: string; name?: string; logos: string[]; colors: string[]; phone?: string; email?: string; address?: string; images: string[] } }>('/api/print/crawl', { method: 'POST', json: { url: a.url } })
              let logo: BrandKit['logo'] = null
              let palette: string[] = []
              if (site.logos[0]) {
                try {
                  const up = await importImage(site.logos[0], 'logo')
                  logo = { id: shortId(), url: up.url, width: up.width, height: up.height }
                  palette = up.palette ?? []
                } catch {
                  // A site's logo that won't import is not worth failing over.
                }
              }
              const host = new URL(site.url).hostname.replace(/^www\./, '')
              await updateKit(site.name ?? host, (k) => ({
                ...k,
                website: site.url,
                logo: k.logo ?? logo,
                colors: k.colors.length ? k.colors : (palette.length ? palette : site.colors).slice(0, 4).map((hex) => ({ hex })),
                details: {
                  ...k.details,
                  business: k.details.business || site.name,
                  phone: k.details.phone || site.phone,
                  email: k.details.email || site.email,
                  address: k.details.address || site.address,
                  website: k.details.website || host,
                },
              }))
              if (designRef.current) h.setBrief({ useLogo: true, useColors: true, useDetails: true })
              const found = [site.name && `name ${site.name}`, site.phone && `phone ${site.phone}`, site.email && `email ${site.email}`, site.address && `address ${site.address}`, logo ? 'their logo' : 'no usable logo'].filter(Boolean)
              events.push(`Read ${host}: found ${found.join(', ')}. Saved to the brand kit.`)
              break
            }
            case 'design_page':
            case 'change_page':
            case 'set_words':
            case 'fix_page':
            case 'sharpen_page': {
              if (needDesign('do that')) break
              const d = designRef.current!
              const pageIndex = Math.min(d.pages.length - 1, pageOf(a.page))
              const page = d.pages[pageIndex]
              const current = page.versions[page.current]
              const label = page.label
              if (a.type !== 'design_page' && !current) {
                events.push(`Page ${pageIndex + 1} (${label}) isn’t designed yet.`)
                break
              }
              if (a.type === 'design_page') {
                setWorking({ label: `Designing the ${label.toLowerCase()}`, startedAt: Date.now() })
                const out = await h.render(pageIndex, 'create', { prompt: a.prompt, takes: a.takes ?? 1, awaitCheck: true })
                showVersions(pageIndex, out.versions)
                events.push(outcomeEvent('designed', label, pageIndex + 1, out))
              } else if (a.type === 'change_page') {
                if (!a.instruction) break
                setWorking({ label: `Changing the ${label.toLowerCase()}`, startedAt: Date.now() })
                const out = await h.render(pageIndex, 'edit', { prompt: a.instruction, awaitCheck: true })
                showVersions(pageIndex, out.versions)
                events.push(outcomeEvent('changed', label, pageIndex + 1, out))
              } else if (a.type === 'set_words') {
                const copy = { ...(current.copy ?? {}) }
                if (a.headline) copy.headline = a.headline
                if (a.subhead) copy.subhead = a.subhead
                if (a.cta) copy.cta = a.cta
                if (a.body) copy.body = a.body
                if (a.details) copy.details = a.details
                setWorking({ label: 'Setting the new words', startedAt: Date.now() })
                const out = await h.render(pageIndex, 'retext', { copy, awaitCheck: true })
                showVersions(pageIndex, out.versions)
                events.push(outcomeEvent('updated the words on', label, pageIndex + 1, out))
              } else if (a.type === 'fix_page') {
                const issues = (current.check?.issues ?? []).filter((i) => i.kind !== 'resolution')
                if (!issues.length) {
                  events.push(`Page ${pageIndex + 1} (${label}) has nothing to fix.`)
                  break
                }
                setWorking({ label: 'Fixing it for print', startedAt: Date.now() })
                const out = await h.render(pageIndex, 'fix', { issues, awaitCheck: true })
                showVersions(pageIndex, out.versions)
                events.push(outcomeEvent('fixed', label, pageIndex + 1, out))
              } else {
                setWorking({ label: 'Sharpening it for print', startedAt: Date.now() })
                const out = await h.render(pageIndex, 'upscale', { awaitCheck: true })
                showVersions(pageIndex, out.versions)
                events.push(outcomeEvent('sharpened', label, pageIndex + 1, out))
              }
              break
            }
            case 'open_export': {
              if (designRef.current) {
                await h.flushSave()
                setExporting(true)
              }
              break
            }
          }
        } catch (err) {
          events.push(`Something went wrong (${a.type}): ${err instanceof Error ? err.message : 'unknown error'}.`)
        } finally {
          setWorking(null)
        }
      }
      return { events, images }
    },
    [brands, h, messages, updateKit],
  )

  // ---- talking -------------------------------------------------------------
  const toTurns = (list: ChatMessage[]): ChatTurn[] =>
    list.filter((m) => m.id !== 'hello' || list.length < 3).slice(-12).map((m) => ({ role: m.role, text: m.text }))

  const converse = useCallback(
    async (history: ChatMessage[]) => {
      setThinking(true)
      let turns = toTurns(history)
      let images: NonNullable<ChatMessage['images']> = []
      try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
          await Promise.all([h.flushSave(), h.flushBrands()])
          const reply = await api<ChatReply>('/api/print/chat', { method: 'POST', json: { designId: designRef.current?.id, turns } })
          if (reply.reply || images.length) {
            add({ role: 'kan', text: reply.reply, suggestions: reply.actions.length ? undefined : reply.suggestions, images: images.length ? images : undefined })
          }
          images = []
          if (!reply.actions.length) break
          setThinking(false)
          const done = await runActions(reply.actions)
          setThinking(true)
          if (!done.events.length) {
            // Silent actions (saving details): nothing new to look at, so Kan's
            // suggestions from this reply still stand.
            if (reply.suggestions.length) {
              setMessages((all) => {
                const last = all[all.length - 1]
                return last?.role === 'kan' ? [...all.slice(0, -1), { ...last, suggestions: reply.suggestions }] : all
              })
            }
            break
          }
          images = done.images
          turns = [...turns, { role: 'kan' as const, text: reply.reply }, ...done.events.map((e) => ({ role: 'event' as const, text: e }))].slice(-14)
          if (round === MAX_ROUNDS - 1 && images.length) add({ role: 'kan', text: '', images })
        }
      } catch (err) {
        add({ role: 'kan', text: err instanceof Error ? `I hit a snag: ${err.message}` : 'I hit a snag. Try again?' })
      } finally {
        setThinking(false)
      }
    },
    [add, h, runActions],
  )

  const send = (raw: string) => {
    const t = raw.trim()
    if (!t || thinking || working) return
    dictation.stop()
    setText('')
    const msg: ChatMessage = { id: shortId(), role: 'user', text: t, at: now() }
    const history = [...messages.map((m) => ({ ...m, suggestions: undefined })), msg]
    setMessages(history)
    void converse(history)
  }

  const attach = async (file: File, kind: 'logo' | 'asset') => {
    setAttachOpen(false)
    setWorking({ label: kind === 'logo' ? 'Adding your logo' : 'Adding your photo', startedAt: Date.now() })
    try {
      const up = await uploadImage(file, kind)
      const image = { id: shortId(), url: up.url, width: up.width, height: up.height }
      if (kind === 'logo') {
        await updateKit('My brand', (k) => ({ ...k, logo: image, colors: k.colors.length ? k.colors : (up.palette ?? []).slice(0, 4).map((hex) => ({ hex })) }))
        if (designRef.current) h.setBrief({ useLogo: true })
      } else {
        await updateKit('My brand', (k) => ({ ...k, assets: [...k.assets, image] }))
        if (designRef.current) h.setBrief({ assetIds: [...(designRef.current.brief.assetIds ?? []), image.id] })
      }
      setWorking(null)
      const msg: ChatMessage = {
        id: shortId(),
        role: 'user',
        text: kind === 'logo' ? 'Here’s my logo.' : 'Here’s a photo to use.',
        images: [{ url: up.url, label: kind === 'logo' ? 'Logo' : 'Photo', pageIndex: -1 }],
        at: now(),
      }
      const history = [...messages.map((m) => ({ ...m, suggestions: undefined })), msg]
      setMessages(history)
      void converse(history)
    } catch (err) {
      setWorking(null)
      notify(err instanceof Error ? err.message : 'Upload failed.')
    }
  }

  // ---- layout --------------------------------------------------------------
  if (loadError) {
    if (loadError.status === 401) return <SignInGate callbackUrl={initialId ? `/print/chat?d=${initialId}` : '/print/chat'} />
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-[15px]">{loadError.status === 404 ? 'This design doesn’t exist, or isn’t yours.' : loadError.message}</p>
        <Link href="/print" className="text-[14px] underline" style={{ color: 'var(--ink-2)' }}>
          Back to your designs
        </Link>
      </div>
    )
  }

  const last = messages[messages.length - 1]
  const suggestions = !thinking && !working && last?.role === 'kan' ? last.suggestions ?? [] : []
  const busy = thinking || !!working
  const sheet = design ? bleedSize(design.spec) : null

  return (
    <div className="h-full flex">
      {/* The conversation */}
      <section className="w-full md:w-[460px] lg:w-[500px] shrink-0 flex flex-col border-r" style={{ borderColor: 'var(--line)', background: 'var(--chrome)' }}>
        <header className="h-14 shrink-0 flex items-center gap-2 px-3 border-b" style={{ borderColor: 'var(--line)' }}>
          <Link href="/print" className="w-9 h-9 rounded-lg inline-flex items-center justify-center shrink-0" style={{ color: 'var(--ink-2)' }} aria-label="All designs">
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <path d="M10 3L5 8l5 5" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold truncate">{design?.name ?? 'Chat with Kan'}</div>
            {design && (
              <div className="text-[12px] truncate" style={{ color: 'var(--muted)' }}>
                {design.spec.name} · {formatCents(design.spendCents)} spent
              </div>
            )}
          </div>
          <SurfaceSwitch current="chat" designId={design?.id ?? null} />
        </header>

        <div ref={scroller} className="flex-1 overflow-y-auto print-scroll px-4 py-5 space-y-4" aria-live="polite">
          {!loaded && <div className="text-[14px]" style={{ color: 'var(--muted)' }}>Loading…</div>}
          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[82%]">
                  {m.images?.length ? (
                    <div className="flex justify-end gap-2 mb-1.5">
                      {m.images.map((img) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={img.url} src={thumb(img.url, 240)} alt={img.label} className="h-20 w-auto rounded-lg checker" />
                      ))}
                    </div>
                  ) : null}
                  <div className="rounded-2xl rounded-tr-md px-3.5 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap" style={{ background: 'var(--raise)', color: 'var(--ink)' }}>
                    {m.text}
                  </div>
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex items-start gap-2.5">
                <KanAvatar />
                <div className="min-w-0 flex-1">
                  {m.text && (
                    <div className="text-[14.5px] leading-relaxed whitespace-pre-wrap pt-1" style={{ color: 'var(--ink)' }}>
                      {m.text}
                    </div>
                  )}
                  {m.images?.length ? (
                    <div className="flex flex-wrap gap-2.5 mt-2.5">
                      {m.images.map((img) => (
                        <button
                          key={img.url}
                          type="button"
                          onClick={() => img.pageIndex >= 0 && setZoom(img.pageIndex)}
                          className="block text-left"
                          title={`See the ${img.label.toLowerCase()} larger`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={thumb(img.url, 420)} alt={img.label} className="max-h-60 w-auto rounded-md paper-shadow" />
                          <span className="block text-[12px] mt-1.5" style={{ color: 'var(--muted)' }}>
                            {img.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ),
          )}
          {working && <WorkingBubble working={working} />}
          {thinking && !working && (
            <div className="flex items-center gap-2.5">
              <KanAvatar />
              <span className="inline-flex gap-1" aria-label="Kan is thinking">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--muted)', animationDelay: `${i * 160}ms` }} />
                ))}
              </span>
            </div>
          )}
        </div>

        {suggestions.length > 0 && (
          <div className="px-4 pb-2 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="h-8 px-3 rounded-full text-[13px] border transition-colors hover:bg-[color:var(--raise)]"
                style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <form
          className="px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-1"
          onSubmit={(e) => {
            e.preventDefault()
            send(text)
          }}
        >
          <div className="rounded-2xl border flex items-end gap-1 p-1.5" style={{ borderColor: dictation.listening ? 'var(--magenta)' : 'var(--line)', background: 'var(--chrome-2)' }}>
            <div className="relative">
              <button
                type="button"
                onClick={() => setAttachOpen((v) => !v)}
                className="w-9 h-9 rounded-xl inline-flex items-center justify-center"
                style={{ color: 'var(--ink-2)' }}
                aria-label="Add your logo or a photo"
                title="Add your logo or a photo"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M10 4v12M4 10h12" />
                </svg>
              </button>
              {attachOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setAttachOpen(false)} />
                  <div className="absolute bottom-11 left-0 z-20 w-48 rounded-xl border p-1 shadow-2xl" style={{ background: 'var(--chrome-2)', borderColor: 'var(--line)' }}>
                    <button type="button" onClick={() => logoInput.current?.click()} className="w-full text-left px-3 py-2 rounded-lg text-[14px] hover:bg-[color:var(--raise)]">
                      My logo
                    </button>
                    <button type="button" onClick={() => photoInput.current?.click()} className="w-full text-left px-3 py-2 rounded-lg text-[14px] hover:bg-[color:var(--raise)]">
                      A photo to use
                    </button>
                  </div>
                </>
              )}
              <input ref={logoInput} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) attach(f, 'logo') }} />
              <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) attach(f, 'asset') }} />
            </div>
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(text)
                }
              }}
              placeholder={dictation.listening ? 'Listening…' : design ? 'Tell Kan what to change' : 'Tell Kan what you need'}
              className="flex-1 resize-none bg-transparent outline-none text-[15px] leading-6 py-1.5 px-1 placeholder:text-[color:var(--muted)]"
              style={{ color: 'var(--ink)' }}
            />
            {dictation.supported && (
              <button
                type="button"
                onClick={() => {
                  dictationBase.current = text
                  dictation.toggle()
                }}
                className="w-9 h-9 rounded-xl inline-flex items-center justify-center"
                style={{ color: dictation.listening ? '#ff6fb5' : 'var(--ink-2)', background: dictation.listening ? 'var(--magenta-soft)' : 'transparent' }}
                aria-label={dictation.listening ? 'Stop listening' : 'Talk instead of typing'}
                aria-pressed={dictation.listening}
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <rect x="7.5" y="3" width="5" height="9" rx="2.5" />
                  <path d="M5 9.5a5 5 0 0010 0M10 14.5V17" />
                </svg>
              </button>
            )}
            <button
              type="submit"
              disabled={!text.trim() || busy}
              className="h-9 px-3.5 rounded-xl text-[14px] font-semibold text-white disabled:opacity-35"
              style={{ background: 'var(--magenta)' }}
            >
              Send
            </button>
          </div>
        </form>
      </section>

      {/* What's being made */}
      <main className="mat flex-1 min-w-0 hidden md:flex flex-col items-center justify-center p-10 gap-6 overflow-auto print-scroll">
        {design && sheet ? (
          <>
            <div className="flex items-start gap-10 flex-wrap justify-center">
              {design.pages.map((p, i) => {
                const w = Math.min(440, Math.max(200, 560 / Math.max(1, design.pages.length) * (sheet.w / sheet.h > 1 ? 1.3 : 0.9)))
                return (
                  <div key={p.id} className="flex flex-col items-center">
                    <Sheet spec={design.spec} version={p.versions[p.current] ?? null} width={Math.round(w)} showGuides={false} label={p.label} pending={h.pending[i] ?? null} onClick={() => p.versions.length && setZoom(i)} />
                    <span className="mt-3 text-[13px]" style={{ color: 'var(--ink-2)' }}>
                      {p.label}
                      {p.versions.length > 1 ? ` · ${p.versions.length} versions` : ''}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2">
              <a href={`/print/${design.id}`} className="h-9 px-3.5 rounded-lg text-[13.5px] border inline-flex items-center" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
                Open in the studio
              </a>
              <button
                type="button"
                onClick={async () => {
                  await h.flushSave()
                  setExporting(true)
                }}
                disabled={!design.pages.some((p) => p.versions.length)}
                className="h-9 px-3.5 rounded-lg text-[13.5px] font-semibold disabled:opacity-40"
                style={{ background: 'var(--ink)', color: 'var(--chrome)' }}
              >
                Download for print
              </button>
            </div>
          </>
        ) : (
          <p className="text-[14.5px] max-w-[340px] text-center leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            Your design shows up here as Kan makes it. Tell Kan what you need — a flyer for a sale, postcards for customers, business cards — and it’ll take it from there.
          </p>
        )}
      </main>

      {zoom !== null && design && design.pages[zoom]?.versions.length > 0 && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 p-6" style={{ background: 'rgba(5,8,7,.86)' }} onClick={() => setZoom(null)} role="dialog" aria-label={`${design.pages[zoom].label}, larger`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumb(design.pages[zoom].versions[design.pages[zoom].current].url, 1600)} alt={design.pages[zoom].label} className="max-w-full max-h-[86vh] object-contain paper-shadow" />
          <span className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
            {design.pages[zoom].label} · tap anywhere to close
          </span>
        </div>
      )}
      {exporting && design && <ExportDialog design={design} onClose={() => setExporting(false)} />}
      <Notice notice={notice} />
    </div>
  )
}
