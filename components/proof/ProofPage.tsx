'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MarkupLayer, type MarkTool } from '@/components/print/MarkupLayer'
import { Sheet } from '@/components/print/Sheet'
import { thumb } from '@/components/print/api'
import { badgeAt, joinsLast, markPath, MARK_COLOR, nextNumber, type Mark, type MarkKind, type Pt } from '@/lib/print/markup'
import { bleedSize, formatSize } from '@/lib/print/spec'
import type { PageView, VersionLite } from '@/lib/print/orders/views'
import { PRINTER_STATUS_LABEL, STATUS_LABEL, type JobStatus, type ProofChange } from '@/lib/print/orders/types'
import type { PrintVersion } from '@/lib/print/types'
import { PrinterPanel } from './PrinterPanel'

/**
 * The page a printer and their customer share for one job.
 *
 * One page, two audiences: the customer sees what will print, what was changed and
 * why, what was checked, and the deadline — and can approve, ask for a change with
 * numbered marks, or send a new file. The printer sees the same page with a working
 * panel beside it. Neither ever has to email a file to the other.
 */

export interface ProofActions {
  reload: () => Promise<PageView>
  approve?: (name?: string) => Promise<PageView>
  requestChanges?: (note: string, marks: { page: number; marks: Mark[] }[], name?: string) => Promise<PageView>
  upload?: (file: File, page: number) => Promise<PageView>
  message: (text: string) => Promise<PageView>
  jobHref: (sibling: PageView['siblings'][number]) => string
}

const asVersion = (v: VersionLite): PrintVersion =>
  ({ ...v, rawUrl: v.url, rawWidth: v.width, rawHeight: v.height, model: '', mode: v.mode, at: v.at }) as unknown as PrintVersion

function useWidth<T extends HTMLElement>() {
  const [el, ref] = useState<T | null>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [ref, w] as const
}

const STATUS_COLOR: Record<JobStatus, string> = {
  received: '#64748b',
  awaiting_approval: '#b45309',
  changes_requested: '#7c3aed',
  approved: '#15803d',
  locked: '#15803d',
  in_production: '#0369a1',
  complete: '#15803d',
  cancelled: '#9ca3af',
}

function headline(status: JobStatus, audience: PageView['audience']): { title: string; body: string } {
  if (audience === 'printer') {
    return {
      received: { title: 'Needs review', body: 'Check the artwork, fix what needs fixing, then send the proof.' },
      awaiting_approval: { title: 'Proof sent', body: 'Waiting for the customer to approve or ask for a change.' },
      changes_requested: { title: 'Changes requested', body: 'The customer asked for something. Their notes and marks are below.' },
      approved: { title: 'Approved', body: 'The customer approved this proof. It locks at the deadline, or lock it now.' },
      locked: { title: 'Locked', body: 'Final. This is what prints.' },
      in_production: { title: 'In production', body: 'Printing.' },
      complete: { title: 'Complete', body: 'Done.' },
      cancelled: { title: 'Cancelled', body: 'This job won’t be printed.' },
    }[status]
  }
  return {
    received: { title: 'We’re checking your artwork', body: 'We’ll email you as soon as your proof is ready. Below is the file we received.' },
    awaiting_approval: { title: 'Your proof is ready', body: 'This is exactly what we’ll print. Approve it, or tell us what to change.' },
    changes_requested: { title: 'We’ve got your changes', body: 'We’re on it. You’ll get an email when the updated proof is ready.' },
    approved: { title: 'Approved — thank you', body: 'This is what we’ll print. You can still ask for a change until the deadline.' },
    locked: { title: 'Final and going to print', body: 'The deadline has passed, so this version is locked in.' },
    in_production: { title: 'Printing now', body: 'Your order is on press.' },
    complete: { title: 'Your order is complete', body: 'Thanks for printing with us.' },
    cancelled: { title: 'This item was cancelled', body: 'Get in touch if that’s unexpected.' },
  }[status]
}

const CHANGE_ICON: Record<ProofChange['kind'], string> = { fit: '⤢', resolution: '◎', spelling: 'Aa', safe: '▣', bleed: '▢', content: '✎', other: '•' }

function when(t: number, now: number): string {
  const s = now - t
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(t * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function ReadMarks({ marks, width, height }: { marks: Mark[]; width: number; height: number }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg width={width} height={height} className="absolute inset-0">
        {marks.map((m) => {
          const d = markPath(m, width, height)
          return (
            <g key={m.id} opacity={m.status === 'done' ? 0.4 : 1}>
              <path d={d} fill="none" stroke="#fff" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
              <path d={d} fill="none" stroke={MARK_COLOR} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          )
        })}
      </svg>
      {marks.map((m) => {
        const [x, y] = badgeAt(m)
        return (
          <span key={m.id} className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full text-[12px] font-bold text-white inline-flex items-center justify-center shadow" style={{ left: x * width, top: y * height, background: MARK_COLOR, border: '2px solid #fff' }} title={m.note}>
            {m.n}
          </span>
        )
      })}
    </div>
  )
}

export function ProofPage({ initial, actions }: { initial: PageView; actions: ProofActions }) {
  const [view, setView] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [show, setShow] = useState<'proof' | 'original' | 'working'>(initial.audience === 'printer' ? 'working' : 'proof')
  const [guides, setGuides] = useState(false)
  // Asking for a change: marks per page, the note, the tool.
  const [asking, setAsking] = useState(false)
  const [draft, setDraft] = useState<Record<number, Mark[]>>({})
  const [tool, setTool] = useState<MarkTool>('ellipse')
  const [selected, setSelected] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [name, setName] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState('')
  const lastDraw = useRef<{ id: string; at: number; page: number } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploadPage, setUploadPage] = useState(0)
  const [stageRef, stageW] = useWidth<HTMLDivElement>()

  const { job, order, brand, spec, audience } = view
  const printer = audience === 'printer'
  const accent = /^#[0-9a-f]{6}$/i.test(brand.color ?? '') ? brand.color! : '#1f2937'
  const sheet = bleedSize(spec)
  const pageW = Math.max(160, Math.min(stageW - 32, (560 * sheet.w) / sheet.h, 760))
  const pageH = Math.round((pageW * sheet.h) / sheet.w)
  const h = headline(job.status, audience)

  // Poll gently while something is happening on the other side.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && !busy && !asking) actions.reload().then(setView).catch(() => {})
    }, 30000)
    return () => clearInterval(t)
  }, [actions, busy, asking])

  const run = async (label: string, fn: () => Promise<PageView>) => {
    setBusy(label)
    setError(null)
    try {
      setView(await fn())
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work. Try again.')
      return false
    } finally {
      setBusy(null)
    }
  }

  const raw = !asking && (show === 'original' || (!printer && !view.proof))
  const shownFor = (p: PageView['pages'][number]): VersionLite | null => {
    if (show === 'original') return p.original
    if (show === 'working') return p.current ?? p.proof ?? p.original
    return p.proof ?? (printer ? p.current ?? null : p.original)
  }

  const addStroke = (page: number) => (kind: MarkKind, pts: Pt[]) => {
    const marks = draft[page] ?? []
    const now = Date.now()
    const last = lastDraw.current?.page === page ? marks.find((m) => m.id === lastDraw.current!.id) ?? null : null
    if (kind === 'draw' && last && joinsLast(last, lastDraw.current!.at, pts, now)) {
      setDraft({ ...draft, [page]: marks.map((m) => (m.id === last.id ? { ...m, pts: [...m.pts, pts] } : m)) })
      lastDraw.current = { id: last.id, at: now, page }
      return
    }
    const all = Object.values(draft).flat()
    const id = Math.random().toString(36).slice(2, 10)
    setDraft({ ...draft, [page]: [...marks, { id, n: nextNumber(all), kind, pts: [pts], note: '', status: 'open', at: 0 }] })
    lastDraw.current = kind === 'draw' ? { id, at: now, page } : null
    if (kind !== 'draw') setSelected(id)
  }
  const editMark = (page: number, id: string, change: Partial<Mark> | null) =>
    setDraft({ ...draft, [page]: change ? (draft[page] ?? []).map((m) => (m.id === id ? { ...m, ...change } : m)) : (draft[page] ?? []).filter((m) => m.id !== id) })
  const markCount = Object.values(draft).flat().length

  const submitChanges = async () => {
    if (!actions.requestChanges) return
    const ok = await run('changes', () => actions.requestChanges!(note, Object.entries(draft).map(([page, marks]) => ({ page: Number(page), marks })).filter((x) => x.marks.length), name || undefined))
    if (ok) {
      setAsking(false)
      setDraft({})
      setNote('')
    }
  }

  const blankSides = view.pages.filter((p) => !p.proof).map((p) => p.label)
  const openMarks = view.pages.flatMap((p, i) => p.marks.filter((m) => m.status === 'open').map((m) => ({ ...m, page: i })))
  const lockDate = job.lockAt ? new Date(job.lockAt * 1000).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null
  const product = useMemo(() => Object.entries(job.product).filter(([k, v]) => !['key', 'shape', 'width', 'height', 'unit', 'bleed', 'safe', 'pages', 'name'].includes(k) && (typeof v === 'string' || typeof v === 'number')), [job.product])

  return (
    <div className="proof h-full overflow-y-auto" style={{ ['--accent' as string]: accent }}>
      {/* Header: whose page this is */}
      <header className="border-b bg-white" style={{ borderColor: 'var(--line)' }}>
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          {printer && (
            <Link href={order.id ? `/print/orders/${order.id}` : '/print/orders'} className="text-[13px] shrink-0" style={{ color: 'var(--muted)' }}>
              ← Orders
            </Link>
          )}
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt={brand.name ?? ''} className="max-h-9 max-w-[160px] object-contain" />
          ) : (
            <span className="font-semibold text-[16px]">{brand.name || 'Your order'}</span>
          )}
          <div className="flex-1" />
          {lockDate && (
            <div className="text-right leading-tight">
              <div className="text-[12px]" style={{ color: 'var(--muted)' }}>
                {job.timeLeft === 'closed' ? 'Changes closed' : 'Changes close'}
              </div>
              <div className="text-[13.5px] font-semibold">{job.timeLeft === 'closed' ? lockDate : `${job.timeLeft} · ${lockDate}`}</div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-[1180px] mx-auto px-4 sm:px-6 py-6">
        {/* The order and its other jobs */}
        <div className="mb-5">
          <div className="text-[13px]" style={{ color: 'var(--muted)' }}>
            {order.ref ? `Order ${order.ref}` : 'Your order'}
            {order.customerName ? ` · ${order.customerName}` : ''}
          </div>
          <h1 className="text-[26px] sm:text-[30px] font-semibold tracking-tight mt-0.5">{job.name}</h1>
          <div className="text-[13.5px] mt-1" style={{ color: 'var(--ink-2)' }}>
            {spec.name} · {formatSize(spec)}
            {job.quantity ? ` · ${job.quantity.toLocaleString()} copies` : ''}
            {product.map(([, v]) => ` · ${v}`).join('')}
          </div>
          {view.siblings.length > 1 && (
            <nav className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Items in this order">
              {view.siblings.map((s, i) => (
                <Link
                  key={s.token}
                  href={actions.jobHref(s)}
                  aria-current={s.current ? 'page' : undefined}
                  className="shrink-0 flex items-center gap-2.5 rounded-xl border pl-1.5 pr-3 py-1.5 bg-white"
                  style={{ borderColor: s.current ? 'var(--accent)' : 'var(--line)', boxShadow: s.current ? '0 0 0 1px var(--accent)' : undefined }}
                >
                  <span className="w-10 h-10 rounded-md overflow-hidden bg-[var(--raise)] inline-flex items-center justify-center">
                    {s.thumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb(s.thumb, 120)} alt="" className="max-w-full max-h-full object-contain" />
                    )}
                  </span>
                  <span className="leading-tight">
                    <span className="block text-[13.5px] font-medium">
                      {i + 1}. {s.name}
                    </span>
                    <span className="block text-[12px]" style={{ color: STATUS_COLOR[s.status] }}>
                      {(printer ? PRINTER_STATUS_LABEL : STATUS_LABEL)[s.status]}
                    </span>
                  </span>
                </Link>
              ))}
            </nav>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
          {/* The artwork */}
          <section>
            <div className="proof-card p-4 sm:p-5 mb-4 flex items-start gap-3" style={{ borderColor: STATUS_COLOR[job.status] + '55' }}>
              <span className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATUS_COLOR[job.status] }} />
              <div>
                <div className="text-[17px] font-semibold">{h.title}</div>
                <div className="text-[14px] mt-0.5" style={{ color: 'var(--ink-2)' }}>
                  {h.body}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              {/* Before a proof, the customer sees only what they sent: nothing has been decided yet. */}
              {(printer || view.proof) && (
              <div className="inline-flex rounded-full border p-0.5 bg-white text-[13px]" style={{ borderColor: 'var(--line)' }} role="tablist">
                {(printer ? (['working', 'proof', 'original'] as const) : (['proof', 'original'] as const)).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={show === k}
                    onClick={() => setShow(k)}
                    className="px-3 h-7 rounded-full"
                    style={{ background: show === k ? 'var(--ink)' : 'transparent', color: show === k ? '#fff' : 'var(--ink-2)' }}
                  >
                    {k === 'working' ? 'Working' : k === 'proof' ? (printer ? 'Customer sees' : 'What we’ll print') : printer ? 'As sent' : 'Your file'}
                  </button>
                ))}
              </div>
              )}
              {!raw && (
              <label className="inline-flex items-center gap-1.5 text-[13px] ml-1" style={{ color: 'var(--ink-2)' }}>
                <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} /> Show trim and safe lines
              </label>
              )}
            </div>

            <div ref={stageRef} className="proof-stage p-4 sm:p-6 flex flex-col items-center gap-6" style={{ minHeight: 320 }}>
              {/* Drawn once measured: the page size (and image size) depend on the screen. */}
              {stageW > 0 && view.pages.map((p, i) => {
                const v = shownFor(p)
                const mine = draft[i] ?? []
                // The file exactly as it was sent: its own shape, nothing cropped.
                const file = raw ? view.artwork.filter((a) => a.page === i).at(-1) : undefined
                if (raw) {
                  return (
                    <figure key={i} className="flex flex-col items-center">
                      {file ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb(file.url, 1600)} alt={file.filename ?? p.label} className="bg-white shadow-md" style={{ maxWidth: Math.max(160, Math.min(stageW - 32, 760)), maxHeight: 560, objectFit: 'contain' }} />
                      ) : (
                        <div className="rounded-sm bg-white flex items-center justify-center text-[13px] px-6 py-10" style={{ color: 'var(--muted)' }}>
                          No file for the {p.label.toLowerCase()}
                        </div>
                      )}
                      <figcaption className="mt-2 text-[13px]" style={{ color: 'var(--ink-2)' }}>
                        {p.label}
                        {file?.filename ? ` · ${file.filename}` : ''}
                        {file ? ` · as ${printer ? 'sent' : 'you sent it'}` : ''}
                      </figcaption>
                    </figure>
                  )
                }
                return (
                  <figure key={i} className="flex flex-col items-center">
                    {v ? (
                      <Sheet
                        spec={spec}
                        version={asVersion(v)}
                        width={pageW}
                        showGuides={guides}
                        label={p.label}
                        selected
                        issues={printer && show === 'working' ? (v.check?.issues as never) : undefined}
                        overlay={
                          asking ? (
                            <MarkupLayer
                              width={pageW}
                              height={pageH}
                              marks={mine}
                              tool={tool}
                              selectedId={selected}
                              onSelect={setSelected}
                              onStroke={addStroke(i)}
                              onChange={(id, m) => editMark(i, id, { pts: m.pts })}
                              onNote={(id, n) => editMark(i, id, { note: n })}
                              onDelete={(id) => editMark(i, id, null)}
                              onDone={() => setSelected(null)}
                            />
                          ) : p.marks.some((m) => m.status === 'open' && (printer || m.by?.startsWith('customer'))) ? (
                            <ReadMarks marks={p.marks.filter((m) => m.status === 'open')} width={pageW} height={pageH} />
                          ) : null
                        }
                      />
                    ) : (
                      <div className="rounded-sm bg-white flex items-center justify-center text-[13px]" style={{ width: pageW, height: pageH, color: 'var(--muted)', boxShadow: '0 1px 2px rgba(0,0,0,.08)' }}>
                        {p.label}: no artwork{printer ? '' : ' — blank'}
                      </div>
                    )}
                    <figcaption className="mt-2 text-[13px]" style={{ color: 'var(--ink-2)' }}>
                      {p.label}
                      {printer && p.versions ? ` · ${p.versions} version${p.versions === 1 ? '' : 's'}` : ''}
                    </figcaption>
                  </figure>
                )
              })}
            </div>
            {guides && (
              <p className="text-[12.5px] mt-2" style={{ color: 'var(--muted)' }}>
                Everything outside the white line is trimmed off. Words and logos stay inside the dashed blue line.
              </p>
            )}
          </section>

          {/* What happened, and what to do */}
          <aside className="space-y-4 lg:sticky lg:top-4">
            {error && (
              <div className="rounded-xl px-4 py-3 text-[14px]" style={{ background: '#fef2f2', color: '#991b1b' }}>
                {error}
              </div>
            )}

            {printer && <PrinterPanel view={view} onView={setView} busy={busy} setBusy={setBusy} setError={setError} />}

            {/* Customer actions */}
            {!printer && (view.can.approve || view.can.requestChanges) && (
              <div className="proof-card p-5">
                {asking ? (
                  <div>
                    <div className="text-[15px] font-semibold">What should we change?</div>
                    <p className="text-[13px] mt-1" style={{ color: 'var(--ink-2)' }}>
                      Circle or point at things on the page — each mark gets a number and its own note. Or just write it below.
                    </p>
                    <div className="flex flex-wrap gap-1.5 my-3">
                      {(['ellipse', 'arrow', 'rect', 'draw'] as MarkKind[]).map((t) => (
                        <button key={t} type="button" onClick={() => setTool(tool === t ? null : t)} className="proof-chip" style={{ background: tool === t ? 'var(--accent)' : undefined, color: tool === t ? 'var(--accent-ink)' : undefined }}>
                          {t === 'ellipse' ? 'Circle' : t === 'arrow' ? 'Arrow' : t === 'rect' ? 'Box' : 'Draw'}
                        </button>
                      ))}
                      {markCount > 0 && <span className="proof-chip">{markCount} mark{markCount === 1 ? '' : 's'}</span>}
                    </div>
                    <textarea className="proof-input" rows={3} placeholder="e.g. Please make the phone number bigger" value={note} onChange={(e) => setNote(e.target.value)} />
                    <input className="proof-input mt-2" placeholder="Your name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
                    <div className="flex gap-2 mt-3">
                      <button type="button" className="proof-btn primary flex-1" disabled={!!busy || (!note.trim() && !markCount)} onClick={submitChanges}>
                        {busy === 'changes' ? 'Sending…' : 'Send changes'}
                      </button>
                      <button type="button" className="proof-btn" onClick={() => { setAsking(false); setDraft({}) }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : confirming ? (
                  <div>
                    <div className="text-[15px] font-semibold">Approve for print?</div>
                    <p className="text-[13.5px] mt-1" style={{ color: 'var(--ink-2)' }}>
                      We’ll print exactly what’s shown
                      {blankSides.length ? ` — the ${blankSides.join(' and ').toLowerCase()} ${blankSides.length === 1 ? 'prints' : 'print'} blank` : view.pages.length > 1 ? `, all ${view.pages.length} sides` : ''}. Check names, numbers and dates one more time.
                    </p>
                    <input className="proof-input mt-3" placeholder="Your name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
                    <div className="flex gap-2 mt-3">
                      <button type="button" className="proof-btn primary flex-1" disabled={!!busy} onClick={async () => { if (await run('approve', () => actions.approve!(name || undefined))) setConfirming(false) }}>
                        {busy === 'approve' ? 'Approving…' : 'Yes, approve'}
                      </button>
                      <button type="button" className="proof-btn" onClick={() => setConfirming(false)}>
                        Back
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {view.can.approve && (
                      <button type="button" className="proof-btn primary w-full h-12 text-[15px]" onClick={() => setConfirming(true)}>
                        Approve this proof
                      </button>
                    )}
                    {view.can.requestChanges && (
                      <button type="button" className="proof-btn w-full" onClick={() => { setAsking(true); setShow('proof') }}>
                        Ask for a change
                      </button>
                    )}
                    {view.can.upload && (
                      <button type="button" className="proof-btn quiet w-full" onClick={() => fileInput.current?.click()} disabled={!!busy}>
                        {busy === 'upload' ? 'Sending your file…' : 'Send a new file instead'}
                      </button>
                    )}
                    {job.status === 'received' && (
                      <p className="text-[12.5px]" style={{ color: 'var(--muted)' }}>
                        You’ll be able to approve as soon as we send your proof.
                      </p>
                    )}
                  </div>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f && actions.upload) void run('upload', () => actions.upload!(f, uploadPage))
                  }}
                />
                {view.can.upload && view.pages.length > 1 && !asking && !confirming && (
                  <label className="flex items-center gap-2 text-[12.5px] mt-2" style={{ color: 'var(--muted)' }}>
                    New file is for
                    <select className="bg-transparent" value={uploadPage} onChange={(e) => setUploadPage(Number(e.target.value))}>
                      {view.pages.map((p, i) => (
                        <option key={i} value={i}>
                          {p.label}
                          {i === 0 ? ' (a multi-page PDF fills the rest)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}

            {/* What changed */}
            {view.proof && (view.proof.message || view.proof.changes.length > 0) && (
              <div className="proof-card p-5">
                <div className="text-[15px] font-semibold mb-2">{printer ? 'Sent with the proof' : 'What we changed'}</div>
                {view.proof.message && (
                  <p className="text-[14px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--ink-2)' }}>
                    {view.proof.message}
                  </p>
                )}
                {view.proof.changes.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {view.proof.changes.map((c, i) => (
                      <li key={i} className="flex gap-2.5 text-[14px]">
                        <span className="w-6 h-6 rounded-md inline-flex items-center justify-center text-[11px] font-semibold shrink-0" style={{ background: 'var(--raise)' }}>
                          {CHANGE_ICON[c.kind]}
                        </span>
                        <span>{c.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {!printer && (
                  <p className="text-[12.5px] mt-3" style={{ color: 'var(--muted)' }}>
                    Compare with your file using the tabs above the page.
                  </p>
                )}
              </div>
            )}

            {/* What was asked for */}
            {openMarks.length > 0 && (
              <div className="proof-card p-5">
                <div className="text-[15px] font-semibold mb-2">{printer ? 'Customer’s marks' : 'What you asked for'}</div>
                <ul className="space-y-1.5">
                  {openMarks.map((m) => (
                    <li key={m.id} className="flex gap-2 text-[14px]">
                      <span className="w-5 h-5 rounded-full text-[11px] font-bold text-white inline-flex items-center justify-center shrink-0 mt-0.5" style={{ background: MARK_COLOR }}>
                        {m.n}
                      </span>
                      <span>
                        {m.note || <i style={{ color: 'var(--muted)' }}>no note</i>}
                        {view.pages.length > 1 && <span style={{ color: 'var(--muted)' }}> · {view.pages[m.page].label}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* What was checked */}
            {view.checks.length > 0 && (
              <div className="proof-card p-5">
                <div className="text-[15px] font-semibold mb-2">What we checked</div>
                <ul className="space-y-2">
                  {view.checks.map((c) => (
                    <li key={c.label} className="flex gap-2.5 text-[14px]">
                      <span className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5" style={{ background: c.ok === false ? '#fef3c7' : '#dcfce7', color: c.ok === false ? '#92400e' : '#166534' }}>
                        {c.ok === false ? '!' : '✓'}
                      </span>
                      <span>
                        {c.label}
                        {c.note && (
                          <span className="block text-[12.5px]" style={{ color: 'var(--muted)' }}>
                            {c.note}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                {!printer && view.checks.some((c) => c.ok === false) && job.status === 'received' && (
                  <p className="text-[12.5px] mt-3" style={{ color: 'var(--muted)' }}>
                    We’ll take care of these before we send your proof.
                  </p>
                )}
              </div>
            )}

            {/* Timeline and messages */}
            <div className="proof-card p-5">
              <div className="text-[15px] font-semibold mb-3">History</div>
              <ol className="space-y-3">
                {[...view.events].reverse().map((e) => (
                  <li key={e.id} className="text-[13.5px]">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{e.actor === 'customer' ? (printer ? order.customerName || 'Customer' : 'You') : brand.name || 'Printer'}</span>
                      <span className="text-[12px] shrink-0" style={{ color: 'var(--muted)' }}>
                        {when(e.at, view.now)}
                      </span>
                    </div>
                    {e.message && (
                      <div className="whitespace-pre-wrap" style={{ color: 'var(--ink-2)' }}>
                        {e.message}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
              {!['complete', 'cancelled'].includes(job.status) && (
                <div className="mt-4 flex gap-2">
                  <input className="proof-input" placeholder={printer ? 'Message the customer…' : 'Message us…'} value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && message.trim()) void run('message', () => actions.message(message)).then((ok) => ok && setMessage('')) }} />
                  <button type="button" className="proof-btn" disabled={!message.trim() || !!busy} onClick={() => void run('message', () => actions.message(message)).then((ok) => ok && setMessage(''))}>
                    Send
                  </button>
                </div>
              )}
            </div>

            {!printer && order.offer && (
              <div className="proof-card p-5" style={{ background: '#fffdf7' }}>
                <div className="text-[15px] font-semibold">{order.offer.title}</div>
                {order.offer.body && (
                  <p className="text-[14px] mt-1" style={{ color: 'var(--ink-2)' }}>
                    {order.offer.body}
                  </p>
                )}
                {order.offer.url && (
                  <a href={order.offer.url} target="_blank" rel="noreferrer" className="proof-btn mt-3">
                    {order.offer.cta || 'Take a look'}
                  </a>
                )}
              </div>
            )}
          </aside>
        </div>

        <footer className="mt-10 pb-8 text-center text-[12.5px]" style={{ color: 'var(--muted)' }}>
          {[brand.name, brand.phone, brand.email, brand.website].filter(Boolean).join(' · ')}
        </footer>
      </main>
    </div>
  )
}
