'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MarkupLayer, type MarkTool } from '@/components/print/MarkupLayer'
import { Sheet } from '@/components/print/Sheet'
import { thumb } from '@/lib/print/thumb'
import { badgeAt, joinsLast, markPath, MARK_COLOR, nextNumber, type Mark, type MarkKind, type Pt } from '@/lib/print/markup'
import { bleedSize, formatSize } from '@/lib/print/spec'
import type { PageView, VersionLite } from '@/lib/print/orders/views'
import type { JobStatus, ProofChange } from '@/lib/print/orders/types'
import type { PrintVersion } from '@/lib/print/types'
import { PrinterDetails, PrinterSend, PrinterWork, usePrinterOps } from './PrinterPanel'

/**
 * The page a printer and their customer share for one printed item.
 *
 * The artwork is the page: it sits on a light table, as large as the screen allows,
 * with a few controls floating around it. One dock at the bottom says whose move it
 * is and offers the one or two things to do; everything else lives in a drawer.
 * The printer sees the same canvas with their tools, and can flip to exactly what
 * the customer sees.
 */

export interface ProofActions {
  reload: () => Promise<PageView>
  approve?: (name?: string) => Promise<PageView>
  requestChanges?: (note: string, marks: { page: number; marks: Mark[] }[], name?: string) => Promise<PageView>
  upload?: (file: File, page: number) => Promise<PageView>
  message: (text: string) => Promise<PageView>
  jobHref: (sibling: PageView['siblings'][number]) => string
  /** Printer only: the page as their customer sees it. */
  customerView?: () => Promise<PageView>
}

type Drawer = 'changes' | 'activity' | 'details' | 'work' | 'send' | 'items'

const asVersion = (v: VersionLite): PrintVersion =>
  ({ ...v, rawUrl: v.url, rawWidth: v.width, rawHeight: v.height, model: '', mode: v.mode, at: v.at }) as unknown as PrintVersion

function useBox<T extends HTMLElement>() {
  const [el, ref] = useState<T | null>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useEffect(() => {
    if (!el) return
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [ref, box] as const
}

/** Is this status waiting on whoever is looking? That is what the magenta means. */
export function waitingOn(status: JobStatus, audience: 'printer' | 'customer'): boolean {
  return audience === 'printer' ? status === 'received' || status === 'changes_requested' : status === 'awaiting_approval'
}

const when = (t: number, now: number) => {
  const s = now - t
  if (s < 60) return 'Just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(t * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const deadlineText = (t: number) => new Date(t * 1000).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

const PRINTER_STATUS: Record<JobStatus, string> = { received: 'Needs review', awaiting_approval: 'Proof sent', changes_requested: 'Changes requested', approved: 'Approved', locked: 'Locked', in_production: 'Printing', complete: 'Complete', canceled: 'Canceled' }
const CUSTOMER_STATUS: Record<JobStatus, string> = { received: 'Being checked', awaiting_approval: 'Ready to approve', changes_requested: 'Being changed', approved: 'Approved', locked: 'Final', in_production: 'Printing', complete: 'Complete', canceled: 'Canceled' }

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

const Icon = {
  info: <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-9v5m0-8h.01" />,
  chat: <path d="M4 15.5V5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5v6a1.5 1.5 0 0 1-1.5 1.5H7L4 15.5Z" />,
  list: <path d="M7 5h9M7 10h9M7 15h9M3.5 5h.01M3.5 10h.01M3.5 15h.01" />,
  wand: <path d="m4 16 8-8m2-4 .5 1.5L16 6l-1.5.5L14 8l-.5-1.5L12 6l1.5-.5L14 4ZM9 3l.3.9.9.3-.9.3L9 5.4l-.3-.9-.9-.3.9-.3L9 3Z" />,
  send: <path d="M17 3 9 11M17 3l-5 14-3-6-6-3 14-5Z" />,
  user: <path d="M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 7a6 6 0 0 1 12 0" />,
  clock: <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-12v4l2.5 2" />,
  lock: <path d="M6 9V7a4 4 0 1 1 8 0v2M5 9h10v8H5z" />,
  guides: <path d="M3 6h14M3 14h14M6 3v14M14 3v14" />,
  close: <path d="m5 5 10 10M15 5 5 15" />,
  chevron: <path d="m6 8 4 4 4-4" />,
  back: <path d="m12 5-5 5 5 5" />,
  check: <path d="m4.5 10.5 3.5 3.5 7.5-8" />,
  pen: <path d="M13.5 3.5 16.5 6.5 7 16H4v-3l9.5-9.5ZM11.5 5.5l3 3" />,
}

function Svg({ d, size = 20 }: { d: React.ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d}
    </svg>
  )
}

function ReadMarks({ marks, width, height }: { marks: Mark[]; width: number; height: number }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg width={width} height={height} className="absolute inset-0">
        {marks.map((m) => {
          const d = markPath(m, width, height)
          return (
            <g key={m.id}>
              <path d={d} fill="none" stroke="#fff" strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" />
              <path d={d} fill="none" stroke={MARK_COLOR} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          )
        })}
      </svg>
      {marks.map((m) => {
        const [x, y] = badgeAt(m)
        return (
          <span key={m.id} className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full text-[12px] font-bold text-white inline-flex items-center justify-center" style={{ left: x * width, top: y * height, background: MARK_COLOR, border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} title={m.note}>
            {m.n}
          </span>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export function ProofPage({ initial, actions }: { initial: PageView; actions: ProofActions }) {
  const [own, setOwn] = useState(initial)
  const [customerSide, setCustomerSide] = useState<PageView | null>(null)
  const [viewAs, setViewAs] = useState<'mine' | 'customer'>('mine')
  const account = own.audience // who is signed in to this page
  const view = viewAs === 'customer' && customerSide ? customerSide : own
  const printer = view.audience === 'printer'
  const preview = account === 'printer' && !printer // the printer looking at the customer's page

  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<Drawer | null>(null)
  const [side, setSide] = useState(0)
  const [show, setShow] = useState<'proof' | 'file' | 'working'>(account === 'printer' ? 'working' : 'proof')
  const [guides, setGuides] = useState(false)
  const [asking, setAsking] = useState(false)
  const [draft, setDraft] = useState<Record<number, Mark[]>>({})
  const [tool, setTool] = useState<MarkTool>('ellipse')
  const [selected, setSelected] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [name, setName] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState('')
  const [uploadPage, setUploadPage] = useState(0)
  const lastDraw = useRef<{ id: string; at: number; page: number } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const thread = useRef<HTMLDivElement>(null)
  const [canvasRef, canvas] = useBox<HTMLDivElement>()
  const sheetWrap = useRef<HTMLDivElement>(null)

  const ops = usePrinterOps(own, setOwn, setBusy, setError)

  const { job, order, brand, spec } = view
  const accent = /^#[0-9a-f]{6}$/i.test(brand.color ?? '') ? brand.color! : '#14181d'
  const sheet = bleedSize(spec)
  const page = view.pages[Math.min(side, view.pages.length - 1)]
  const mobile = canvas.w > 0 && canvas.w < 700
  // The artwork takes whatever the rails leave. Wide screens: pages on the left, tools
  // on the right, the drawer beside the tools. Phones: side chips and a tab bar.
  const multi = view.pages.length > 1
  const towerW = mobile ? 0 : 84
  const railW = !mobile && multi ? 112 : 0
  const aside = drawer && canvas.w >= 900 ? 412 : 0
  const reserveTop = account === 'printer' && mobile ? 100 : 60
  const reserveBottom = mobile ? (multi ? 64 : 20) : 52
  const room = canvas.w - aside - towerW - railW
  const pageW = Math.max(120, Math.floor(Math.min(room - (mobile ? 28 : 64), ((canvas.h - reserveTop - reserveBottom) * sheet.w) / sheet.h)))
  const pageH = Math.round((pageW * sheet.h) / sheet.w)

  const refresh = useCallback(async () => {
    setOwn(await actions.reload())
    if (viewAs === 'customer' && actions.customerView) setCustomerSide(await actions.customerView())
  }, [actions, viewAs])

  // Keep up with the other side, gently.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && !busy && !asking && !drawer) refresh().catch(() => {})
    }, 30000)
    return () => clearInterval(t)
  }, [refresh, busy, asking, drawer])

  const switchView = async (to: 'mine' | 'customer') => {
    setDrawer(null)
    setAsking(false)
    if (to === 'customer' && actions.customerView) {
      setBusy('view')
      try {
        setCustomerSide(await actions.customerView())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Couldn’t load their view.')
        return
      } finally {
        setBusy(null)
      }
      setShow('proof')
    } else setShow('working')
    setViewAs(to)
  }

  const run = async (label: string, fn: () => Promise<PageView>) => {
    setBusy(label)
    setError(null)
    try {
      setOwn(await fn())
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work. Try again.')
      return false
    } finally {
      setBusy(null)
    }
  }

  // ---- markup ----
  const addStroke = (pageIndex: number) => (kind: MarkKind, pts: Pt[]) => {
    const marks = draft[pageIndex] ?? []
    const now = Date.now()
    const last = lastDraw.current?.page === pageIndex ? marks.find((m) => m.id === lastDraw.current!.id) ?? null : null
    if (kind === 'draw' && last && joinsLast(last, lastDraw.current!.at, pts, now)) {
      setDraft({ ...draft, [pageIndex]: marks.map((m) => (m.id === last.id ? { ...m, pts: [...m.pts, pts] } : m)) })
      lastDraw.current = { id: last.id, at: now, page: pageIndex }
      return
    }
    const id = Math.random().toString(36).slice(2, 10)
    setDraft({ ...draft, [pageIndex]: [...marks, { id, n: nextNumber(Object.values(draft).flat()), kind, pts: [pts], note: '', status: 'open', at: 0 }] })
    lastDraw.current = kind === 'draw' ? { id, at: now, page: pageIndex } : null
    if (kind !== 'draw') setSelected(id)
  }
  const editMark = (pageIndex: number, id: string, change: Partial<Mark> | null) =>
    setDraft({ ...draft, [pageIndex]: change ? (draft[pageIndex] ?? []).map((m) => (m.id === id ? { ...m, ...change } : m)) : (draft[pageIndex] ?? []).filter((m) => m.id !== id) })
  const markCount = Object.values(draft).flat().length

  const startAsking = () => {
    setDrawer(null)
    setShow('proof')
    setGuides(false)
    setAsking(true)
  }
  const stopAsking = () => {
    setAsking(false)
    setDraft({})
    setNote('')
    setSelected(null)
  }
  const submitChanges = async () => {
    if (!actions.requestChanges) return
    const ok = await run('changes', () => actions.requestChanges!(note, Object.entries(draft).map(([p, marks]) => ({ page: Number(p), marks })).filter((x) => x.marks.length), name || undefined))
    if (ok) stopAsking()
  }

  // ---- what's on the table ----
  const fileFor = (i: number) => view.artwork.filter((a) => a.page === i).at(-1)
  const raw = !asking && (show === 'file' || (!printer && !view.proof))
  const version: VersionLite | null = raw
    ? null
    : show === 'working' && printer
      ? page.current ?? page.proof ?? page.original
      : page.proof ?? (printer ? page.current ?? null : page.original)
  const openMarks = view.pages.flatMap((p, i) => p.marks.filter((m) => m.status === 'open' && !m.hidden && (printer || m.by?.startsWith('customer'))).map((m) => ({ ...m, page: i })))
  const blankSides = view.pages.filter((p) => !p.proof).map((p) => p.label.toLowerCase())
  const file = fileFor(side)
  const shownId = raw ? null : version?.id ?? null
  // A page image can take a few seconds the first time it's sized; say so rather than show a blank sheet.
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const loaded = !!imgSrc && loadedSrc === imgSrc
  useEffect(() => {
    const img = sheetWrap.current?.querySelector('img')
    if (!img) return
    const src = img.currentSrc || img.src
    setImgSrc(src)
    if (img.complete && img.naturalWidth) {
      setLoadedSrc(src)
      return
    }
    const done = () => setLoadedSrc(src)
    img.addEventListener('load', done)
    img.addEventListener('error', done)
    return () => {
      img.removeEventListener('load', done)
      img.removeEventListener('error', done)
    }
  }, [shownId, pageW])

  // ---- whose move ----
  const s = job.status
  const yours = waitingOn(s, printer ? 'printer' : 'customer')
  const customerName = order.customerName?.split(' ')[0] || 'the customer'
  const status: { title: string; sub?: string } = printer
    ? {
        received: { title: 'Needs your review', sub: 'Check the file, fix what needs fixing, then send the proof.' },
        changes_requested: { title: `${customerName} asked for changes`, sub: `${openMarks.length ? `${openMarks.length} mark${openMarks.length === 1 ? '' : 's'} on the page. ` : ''}Make them, then send the updated proof.` },
        awaiting_approval: { title: `Waiting on ${customerName}`, sub: 'The proof is with them.' },
        approved: { title: `Approved by ${customerName}`, sub: job.lockAt ? `Locks ${deadlineText(job.lockAt)}, or lock it now.` : undefined },
        locked: { title: 'Locked — this is what prints' },
        in_production: { title: 'Printing' },
        complete: { title: 'Complete' },
        canceled: { title: 'Canceled' },
      }[s]
    : {
        received: { title: 'We’re checking your file', sub: 'You’ll get an email as soon as your proof is ready.' },
        awaiting_approval: { title: 'Your proof is ready', sub: job.lockAt ? `Approve or ask for a change by ${deadlineText(job.lockAt)}.` : 'Approve it, or ask for a change.' },
        changes_requested: { title: 'We’re making your changes', sub: 'You’ll get an email when the new proof is ready.' },
        approved: { title: 'Approved — thank you', sub: 'We’ll print exactly this.' },
        locked: { title: 'Final — going to print' },
        in_production: { title: 'Printing now' },
        complete: { title: 'Your order is complete' },
        canceled: { title: 'This item was canceled' },
      }[s]

  const siblingsWaiting = view.siblings.filter((x) => !x.current && waitingOn(x.status, printer ? 'printer' : 'customer')).length
  const shortLeft = job.timeLeft?.replace('in ', '').replace(/ hours?/, 'h').replace(/ days?/, 'd').replace(/ minutes?/, 'm')

  // Messages read like a text thread: oldest first, opened at the newest.
  useEffect(() => {
    if (drawer === 'activity') thread.current?.scrollIntoView({ block: 'end' })
  }, [drawer, view.events.length])

  // A blank side can be filled from here: the printer adds the file, the customer sends one.
  const addFile = async (f: File, pageIndex: number) => {
    if (account === 'printer' && !preview) {
      await run('upload', async () => {
        const { uploadToStorage } = await import('./upload')
        const url = await uploadToStorage(f, '/api/print/sign-artwork')
        const res = await fetch(`/api/v1/print/jobs/${own.job.id}/artwork`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ artwork: [{ url, page: pageIndex, filename: f.name }] }) })
        const json = await res.json().catch(() => null)
        if (!res.ok) throw new Error(json?.error?.message ?? 'That file didn’t go through.')
        return actions.reload()
      })
    } else if (actions.upload && !preview) {
      await run('upload', () => actions.upload!(f, pageIndex))
    }
  }

  // The one thing to do now, for whoever is looking. It lives in the top right.
  const primary: { label: string; onClick: () => void; quiet?: boolean } | null = asking
    ? null
    : printer
      ? s === 'received' || s === 'changes_requested'
        ? { label: 'Send proof', onClick: () => setDrawer('send') }
        : s === 'awaiting_approval'
          ? { label: 'Send update', onClick: () => setDrawer('send'), quiet: true }
          : s === 'approved'
            ? { label: 'Lock for print', onClick: () => void ops.setStatus('locked') }
            : s === 'locked'
              ? { label: 'Start printing', onClick: () => void ops.setStatus('in_production') }
              : s === 'in_production'
                ? { label: 'Mark complete', onClick: () => void ops.setStatus('complete') }
                : null
      : view.can.approve
        ? { label: 'Approve', onClick: () => setConfirming(true) }
        : null

  // The tools, in the right-hand rail (a tab bar on phones).
  const tools: { id: Drawer | 'ask' | 'guides'; label: string; icon: React.ReactNode; badge?: number; signal?: boolean; on?: boolean; hidden?: boolean }[] = printer
    ? [
        { id: 'work', label: 'Fix', icon: Icon.wand, badge: openMarks.length || undefined, signal: openMarks.length > 0 },
        { id: 'activity', label: 'Messages', icon: Icon.chat },
        { id: 'details', label: 'Customer', icon: Icon.user },
        { id: 'guides', label: 'Guides', icon: Icon.guides, on: guides, hidden: raw || !version },
      ]
    : [
        { id: 'changes', label: 'Changes', icon: Icon.info, badge: view.proof?.changes.length || undefined, hidden: !view.proof },
        { id: 'ask', label: 'Mark up', icon: Icon.pen, hidden: !view.can.requestChanges || !view.proof },
        { id: 'activity', label: 'Messages', icon: Icon.chat },
        { id: 'details', label: 'Order', icon: Icon.list },
        { id: 'guides', label: 'Guides', icon: Icon.guides, on: guides, hidden: raw || !version || mobile },
      ]
  const pickTool = (id: (typeof tools)[number]['id']) => {
    if (id === 'guides') setGuides(!guides)
    else if (id === 'ask') {
      if (!preview) startAsking()
    } else setDrawer(drawer === id ? null : id)
  }
  const visibleTools = tools.filter((t) => !t.hidden)

  // A page's picture for the side rail: what this view would show of it.
  const thumbFor = (p: PageView['pages'][number], i: number) => (raw ? fileFor(i)?.url : (show === 'working' && printer ? p.current ?? p.proof ?? p.original : p.proof ?? (printer ? p.current : p.original))?.url) ?? null

  return (
    <div className="proof h-full w-full flex flex-col overflow-hidden" style={{ ['--accent' as string]: accent }}>
      {/* Top bar: whose page, which item and whose move, and the one thing to do */}
      <header className="relative z-30 h-[64px] shrink-0 flex items-center gap-2 px-2.5 sm:px-4 bg-white/85 backdrop-blur border-b" style={{ borderColor: 'var(--line)' }}>
        {account === 'printer' && (
          <Link href={order.id ? `/print/orders/${order.id}` : '/print/orders'} className="icon-btn -ml-1 shrink-0" aria-label="Back to the order">
            <Svg d={Icon.back} />
          </Link>
        )}
        <div className={`shrink-0 items-center ${mobile ? 'hidden' : 'flex'} max-w-[180px]`}>
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt={brand.name ?? ''} className="max-h-8 max-w-full object-contain" />
          ) : (
            <span className="font-semibold text-[15px] truncate">{brand.name || (account === 'printer' ? 'Your shop' : 'Your order')}</span>
          )}
        </div>

        <div className="flex-1 min-w-0 flex sm:justify-center">
          <button
            type="button"
            onClick={() => setDrawer(drawer === 'items' ? null : 'items')}
            className="min-w-0 max-w-full flex items-center gap-1.5 h-12 px-2.5 rounded-xl enabled:hover:bg-black/5 text-left"
            aria-expanded={drawer === 'items'}
            disabled={view.siblings.length < 2}
          >
            <span className="min-w-0 leading-tight">
              <span className="block text-[15.5px] font-semibold truncate">
                {job.name}
                {view.siblings.length > 1 && (
                  <span className="font-normal" style={{ color: 'var(--muted)' }}>
                    {' '}
                    {view.siblings.findIndex((x) => x.current) + 1}/{view.siblings.length}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1.5 text-[12.5px] truncate" style={{ color: yours ? '#9d004f' : 'var(--ink-2)' }}>
                {yours ? <span className="signal-dot" style={{ width: 7, height: 7 }} /> : <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: ['approved', 'locked', 'complete', 'in_production'].includes(s) ? 'var(--good)' : 'var(--muted)' }} />}
                <span className="truncate">
                  {status.title}
                  {mobile && job.lockAt && job.timeLeft !== 'closed' ? `, closes ${shortLeft}` : ''}
                </span>
              </span>
            </span>
            {view.siblings.length > 1 && (
              <span className="relative shrink-0" style={{ color: 'var(--muted)' }}>
                <Svg d={Icon.chevron} size={18} />
                {siblingsWaiting > 0 && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: 'var(--signal)' }} />}
              </span>
            )}
          </button>
        </div>

        {job.lockAt && !mobile && (
          <div
            className="shrink-0 flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-medium"
            style={{ background: job.timeLeft !== 'closed' && yours ? 'var(--signal-soft)' : 'var(--raise)', color: job.timeLeft !== 'closed' && yours ? '#9d004f' : 'var(--ink-2)' }}
            title={`Changes close ${deadlineText(job.lockAt)}`}
          >
            <Svg d={job.timeLeft === 'closed' ? Icon.lock : Icon.clock} size={16} />
            {job.timeLeft === 'closed' ? 'Final' : `Closes ${job.timeLeft}`}
          </div>
        )}
        {asking ? (
          <>
            <button type="button" className="pbtn sm ghost shrink-0" onClick={stopAsking}>
              Cancel
            </button>
            <button type="button" className="pbtn sm primary shrink-0" disabled={preview || !!busy || (!note.trim() && !markCount)} onClick={submitChanges}>
              {busy === 'changes' ? 'Sending…' : markCount ? `Send ${markCount} change${markCount === 1 ? '' : 's'}` : 'Send'}
            </button>
          </>
        ) : (
          <>
            {!printer && view.can.approve && !mobile && (
              <button type="button" className="pbtn sm shrink-0" disabled={preview} onClick={startAsking}>
                Request a change
              </button>
            )}
            {primary && (
              <button type="button" className={`pbtn sm shrink-0 ${primary.quiet ? '' : 'primary'}`} disabled={preview || !!busy} onClick={primary.onClick}>
                {primary.label}
              </button>
            )}
          </>
        )}
      </header>

      {/* The light table */}
      <div ref={canvasRef} className="light-table relative flex-1 min-h-0 overflow-hidden">
        {/* Above the artwork: whose view and which version, or the markup tools */}
        <div className="absolute top-3 z-10 flex flex-wrap items-center justify-center gap-2 pointer-events-none transition-[right] duration-200" style={{ left: railW + 8, right: aside + towerW + 8 }}>
          {asking ? (
            <div className="glass seg pointer-events-auto" role="toolbar" aria-label="Markup tools">
              {(['ellipse', 'arrow', 'rect', 'draw'] as MarkKind[]).map((t) => (
                <button key={t} type="button" aria-pressed={tool === t} onClick={() => setTool(tool === t ? null : t)}>
                  {t === 'ellipse' ? 'Circle' : t === 'arrow' ? 'Arrow' : t === 'rect' ? 'Box' : 'Draw'}
                </button>
              ))}
            </div>
          ) : (
            <>
              {account === 'printer' && (
                <div className="glass seg pointer-events-auto" role="group" aria-label="Whose view">
                  <button type="button" aria-pressed={viewAs === 'mine'} onClick={() => switchView('mine')}>
                    My view
                  </button>
                  <button type="button" aria-pressed={viewAs === 'customer'} onClick={() => switchView('customer')}>
                    {busy === 'view' ? 'Loading…' : 'Customer’s view'}
                  </button>
                </div>
              )}
              {(printer || view.proof) && (
                <div className="glass seg pointer-events-auto" role="group" aria-label="Which version">
                  {printer && (
                    <button type="button" aria-pressed={show === 'working'} onClick={() => setShow('working')}>
                      Latest
                    </button>
                  )}
                  {view.proof && (
                    <button type="button" aria-pressed={show === 'proof'} onClick={() => setShow('proof')}>
                      {printer ? 'Sent' : 'Proof'}
                    </button>
                  )}
                  <button type="button" aria-pressed={show === 'file'} onClick={() => setShow('file')}>
                    {printer ? 'Their file' : 'Your file'}
                  </button>
                </div>
              )}
              {preview && (
                <span className="pointer-events-auto text-[12.5px] h-9 px-3 rounded-full inline-flex items-center" style={{ background: 'var(--signal-soft)', color: '#9d004f' }}>
                  Exactly what {customerName} sees
                </span>
              )}
            </>
          )}
        </div>

        {error && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 max-w-[min(520px,90%)] rounded-xl px-3.5 py-2.5 text-[13.5px] flex items-start gap-2 shadow-lg" style={{ background: '#fdecee', color: '#9b1c2c' }}>
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="shrink-0">
              <Svg d={Icon.close} size={16} />
            </button>
          </div>
        )}

        {/* Pages: every side the product has */}
        {multi && !mobile && (
          <nav className="absolute left-3 top-1/2 -translate-y-1/2 z-10 glass rounded-2xl p-2 flex flex-col gap-2 max-h-[calc(100%-32px)] overflow-y-auto" style={{ width: railW - 16 }} aria-label="Sides">
            {view.pages.map((p, i) => {
              const t = thumbFor(p, i)
              const marked = p.marks.some((m) => m.status === 'open' && !m.hidden && (printer || m.by?.startsWith('customer'))) || (draft[i]?.length ?? 0) > 0
              return (
                <button key={i} type="button" onClick={() => setSide(i)} aria-current={side === i ? 'page' : undefined} className="relative flex flex-col items-center gap-1.5 rounded-xl p-1.5 hover:bg-black/[.04]" style={{ background: side === i ? 'rgba(20,24,29,.07)' : undefined }}>
                  <span className="light-table w-full h-[72px] rounded-lg flex items-center justify-center overflow-hidden" style={{ outline: side === i ? '2px solid var(--ink)' : 'none', outlineOffset: 1 }}>
                    {t ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb(t, 180)} alt="" className="max-w-[86%] max-h-[86%] object-contain bg-white shadow" />
                    ) : (
                      <span className="w-[58%] h-[78%] rounded-sm border-2 border-dashed" style={{ borderColor: 'rgba(20,24,29,.18)' }} />
                    )}
                  </span>
                  <span className="text-[12px] font-medium" style={{ color: side === i ? 'var(--ink)' : 'var(--ink-2)' }}>
                    {p.label}
                  </span>
                  {marked && <span className="absolute top-2 right-2 w-2 h-2 rounded-full" style={{ background: 'var(--signal)' }} />}
                </button>
              )
            })}
          </nav>
        )}

        {/* The artwork */}
        <div className="absolute flex flex-col items-center justify-center transition-[right] duration-200" style={{ top: reserveTop, bottom: reserveBottom, left: railW, right: aside + towerW }}>
          {canvas.w > 0 &&
            (raw ? (
              file ? (
                <figure className="flex flex-col items-center min-h-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumb(file.url, 1800)}
                    alt={file.filename ?? page.label}
                    className="bg-white"
                    style={{ maxWidth: Math.min(room - (mobile ? 28 : 64), 1400), maxHeight: canvas.h - reserveTop - reserveBottom - 30, objectFit: 'contain', boxShadow: '0 2px 4px rgba(0,0,0,.08), 0 18px 44px rgba(20,24,29,.16)' }}
                  />
                  <figcaption className="mt-2.5 text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
                    {file.filename || 'The file'}, exactly as {printer ? 'it was sent' : 'you sent it'}
                  </figcaption>
                </figure>
              ) : (
                <div className="text-[14px] px-6 py-10 rounded-2xl bg-white/60" style={{ color: 'var(--muted)' }}>
                  No file for the {page.label.toLowerCase()}
                </div>
              )
            ) : version ? (
              <div ref={sheetWrap} className="relative">
                {!loaded && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                    <span className="glass text-[13px] px-3.5 py-1.5 rounded-full" style={{ color: 'var(--ink-2)' }}>
                      Loading the artwork…
                    </span>
                  </div>
                )}
                <Sheet
                  spec={spec}
                  version={asVersion(version)}
                  width={pageW}
                  showGuides={guides}
                  label={page.label}
                  selected
                  issues={printer && show === 'working' && guides ? (version.check?.issues as never) : undefined}
                  overlay={
                    asking ? (
                      <MarkupLayer
                        width={pageW}
                        height={pageH}
                        marks={draft[side] ?? []}
                        tool={tool}
                        selectedId={selected}
                        onSelect={setSelected}
                        onStroke={addStroke(side)}
                        onChange={(id, m) => editMark(side, id, { pts: m.pts })}
                        onNote={(id, n) => editMark(side, id, { note: n })}
                        onDelete={(id) => editMark(side, id, null)}
                        onDone={() => setSelected(null)}
                      />
                    ) : page.marks.some((m) => m.status === 'open' && !m.hidden && (printer || m.by?.startsWith('customer'))) ? (
                      <ReadMarks marks={page.marks.filter((m) => m.status === 'open' && !m.hidden && (printer || m.by?.startsWith('customer')))} width={pageW} height={pageH} />
                    ) : null
                  }
                />
              </div>
            ) : (
              // A blank side still shows the product's shape: the hole of a door hanger, the round of a sticker.
              <div className="relative" style={{ width: pageW, height: pageH }}>
                <Sheet spec={spec} version={null} width={pageW} showGuides={guides} selected />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[14px] text-center px-5" style={{ color: 'var(--muted)' }}>
                <span>{printer ? `No artwork on the ${page.label.toLowerCase()} yet` : `The ${page.label.toLowerCase()} prints blank`}</span>
                {((printer && !preview && ['received', 'awaiting_approval', 'changes_requested', 'approved'].includes(s)) || (!printer && view.can.upload && !preview)) && (
                  <button
                    type="button"
                    className="pbtn sm"
                    disabled={!!busy}
                    onClick={() => {
                      setUploadPage(side)
                      fileInput.current?.click()
                    }}
                  >
                    {busy === 'upload' ? 'Adding…' : printer ? `Add a file for the ${page.label.toLowerCase()}` : `Send a file for the ${page.label.toLowerCase()}`}
                  </button>
                )}
                </div>
              </div>
            ))}
        </div>

        {/* What to do, said quietly under the page */}
        {!mobile && status.sub && !asking && (
          <p className="absolute bottom-4 z-10 text-center text-[13px] px-4 pointer-events-none" style={{ left: railW, right: aside + towerW, color: 'var(--ink-2)' }}>
            {status.sub}
          </p>
        )}
        {asking && (
          <div className="absolute bottom-3 z-20 flex justify-center px-3" style={{ left: railW, right: aside + towerW }}>
            <input className="proof-input glass max-w-[560px]" placeholder={markCount ? 'Anything else? (optional)' : 'Circle what to change, or just write it here'} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}

        {/* Sides, on a phone */}
        {multi && mobile && !asking && (
          <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center">
            <div className="glass seg" role="group" aria-label="Side">
              {view.pages.map((p, i) => (
                <button key={i} type="button" aria-pressed={side === i} onClick={() => setSide(i)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tools: the right-hand rail */}
        {!mobile && (
          <nav className="absolute right-3 top-1/2 -translate-y-1/2 z-20 glass rounded-2xl p-1.5 flex flex-col gap-1" style={{ width: towerW - 16 }} aria-label="Tools">
            {visibleTools.map((t) => {
              const active = t.id === 'guides' ? t.on : t.id === 'ask' ? asking : drawer === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickTool(t.id)}
                  aria-pressed={active}
                  className="relative flex flex-col items-center gap-1 rounded-xl py-2.5 hover:bg-black/[.05]"
                  style={{ background: active ? 'var(--ink)' : undefined, color: active ? '#fff' : 'var(--ink-2)' }}
                  disabled={t.id === 'ask' && preview}
                >
                  <Svg d={t.icon} size={21} />
                  <span className="text-[11px] font-medium leading-none">{t.label}</span>
                  {t.badge ? <span className={`badge ${t.signal ? 'signal' : ''}`}>{t.badge}</span> : null}
                </button>
              )
            })}
          </nav>
        )}
      </div>

      {/* Tools: a tab bar on a phone */}
      {mobile && (
        <nav className="shrink-0 z-20 bg-white/90 backdrop-blur border-t flex justify-around px-1 pt-1 pb-[max(6px,env(safe-area-inset-bottom))]" style={{ borderColor: 'var(--line)' }} aria-label="Tools">
          {visibleTools.map((t) => {
            const active = t.id === 'guides' ? t.on : t.id === 'ask' ? asking : drawer === t.id
            return (
              <button key={t.id} type="button" onClick={() => pickTool(t.id)} aria-pressed={active} className="relative flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl" style={{ color: active ? 'var(--ink)' : 'var(--muted)' }} disabled={t.id === 'ask' && preview}>
                <Svg d={t.icon} size={22} />
                <span className="text-[11px] font-medium">{t.label}</span>
                {t.badge ? <span className={`badge ${t.signal ? 'signal' : ''}`} style={{ right: '22%' }}>{t.badge}</span> : null}
              </button>
            )
          })}
        </nav>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void addFile(f, uploadPage)
        }}
      />

      {/* Approve: one more look, then yes */}
      {confirming && (
        <>
          <div className="scrim" onClick={() => setConfirming(false)} />
          <div className="drawer approve" role="dialog" aria-label="Approve for print">
            <div className="p-5 sm:p-6">
              <h2 className="text-[21px] font-semibold tracking-tight">Approve for print?</h2>
              <p className="text-[15px] mt-1.5 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                We’ll print {job.quantity ? `${job.quantity.toLocaleString()} copies of ` : ''}exactly what you see
                {blankSides.length ? `, and the ${blankSides.join(' and ')} ${blankSides.length === 1 ? 'prints' : 'print'} blank` : view.pages.length > 1 ? `, all ${view.pages.length} sides` : ''}. Check names, phone numbers and dates one last time.
              </p>
              <input className="proof-input mt-4" placeholder="Your name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
              <div className="flex gap-2 mt-4">
                <button type="button" className="pbtn ghost" onClick={() => setConfirming(false)}>
                  Not yet
                </button>
                <button
                  type="button"
                  className="pbtn primary flex-1"
                  disabled={!!busy}
                  onClick={async () => {
                    if (await run('approve', () => actions.approve!(name || undefined))) setConfirming(false)
                  }}
                >
                  {busy === 'approve' ? 'Approving…' : 'Yes, approve'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* The drawer, beside the tools on a wide screen */}
      {drawer && (
        <>
          <div className="scrim desktop-clear" onClick={() => setDrawer(null)} />
          <aside className="drawer" role="dialog" aria-label="Details" style={canvas.w >= 900 ? { right: towerW + 8 } : undefined}>
            <div className="flex items-center justify-between px-5 pt-4 pb-1">
              <h2 className="text-[18px] font-semibold tracking-tight">
                {
                  {
                    changes: 'What we changed',
                    activity: 'Messages',
                    details: printer ? 'Customer and item' : 'Your order',
                    work: 'Fix the file',
                    send: view.proof ? 'Send an updated proof' : 'Send the proof',
                    items: 'Items in this order',
                  }[drawer]
                }
              </h2>
              <button type="button" className="icon-btn -mr-2" onClick={() => setDrawer(null)} aria-label="Close">
                <Svg d={Icon.close} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">
              {drawer === 'items' && (
                <ul className="py-2 space-y-1.5">
                  {view.siblings.map((x, i) => {
                    const waiting = waitingOn(x.status, printer ? 'printer' : 'customer')
                    return (
                      <li key={x.token}>
                        <Link href={actions.jobHref(x)} onClick={() => setDrawer(null)} className="flex items-center gap-3 p-2 rounded-2xl hover:bg-black/[.04]" style={{ background: x.current ? 'var(--raise)' : undefined }}>
                          <span className="light-table w-16 h-16 rounded-xl inline-flex items-center justify-center shrink-0 overflow-hidden">
                            {x.thumb && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={thumb(x.thumb, 160)} alt="" className="max-w-[80%] max-h-[80%] object-contain shadow" />
                            )}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-[15px] font-semibold truncate">
                              {i + 1}. {x.name}
                            </span>
                            <span className="flex items-center gap-1.5 text-[13px]" style={{ color: waiting ? '#9d004f' : 'var(--ink-2)' }}>
                              {waiting && <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--signal)' }} />}
                              {(printer ? PRINTER_STATUS : CUSTOMER_STATUS)[x.status]}
                            </span>
                          </span>
                          {x.current && (
                            <span className="text-[12px] pr-1" style={{ color: 'var(--muted)' }}>
                              Viewing
                            </span>
                          )}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}

              {drawer === 'changes' && <ChangesPanel view={view} />}

              {drawer === 'activity' && (
                <div className="flex flex-col min-h-full">
                  <ol className="py-3 space-y-4 mt-auto">
                    {view.events.map((e) => {
                      const mine = e.actor === 'customer' ? !printer : printer
                      return (
                        <li key={e.id} className={`flex ${mine ? 'justify-end' : ''}`}>
                          <div className="max-w-[85%]">
                            <div className={`text-[12px] mb-1 ${mine ? 'text-right' : ''}`} style={{ color: 'var(--muted)' }}>
                              {e.actor === 'customer' ? (printer ? order.customerName || 'Customer' : 'You') : printer ? (e.actor === 'system' ? 'Automatic' : 'You') : brand.name || 'Your printer'}, {when(e.at, view.now).toLowerCase()}
                            </div>
                            {e.message && (
                              <div className="rounded-2xl px-3.5 py-2.5 text-[14.5px] leading-snug whitespace-pre-wrap" style={{ background: mine ? 'var(--ink)' : 'var(--raise)', color: mine ? '#fff' : 'var(--ink)' }}>
                                {e.message}
                              </div>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                  <div ref={thread} />
                  {!['complete', 'canceled'].includes(s) && (
                    <div className="sticky bottom-0 bg-white pt-2 flex gap-2">
                      <input
                        className="proof-input"
                        placeholder={printer ? `Message ${customerName}` : 'Message us'}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && message.trim() && !preview) void run('message', () => actions.message(message)).then((ok) => ok && setMessage(''))
                        }}
                      />
                      <button type="button" className="pbtn" aria-label="Send message" disabled={preview || !message.trim() || !!busy} onClick={() => void run('message', () => actions.message(message)).then((ok) => ok && setMessage(''))}>
                        <Svg d={Icon.send} size={18} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {drawer === 'details' &&
                (printer ? (
                  <PrinterDetails view={own} ops={ops} busy={busy} />
                ) : (
                  <div className="py-3 space-y-7">
                    <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-[14.5px]">
                      {order.ref && (
                        <>
                          <dt style={{ color: 'var(--muted)' }}>Order</dt>
                          <dd>{order.ref}</dd>
                        </>
                      )}
                      <dt style={{ color: 'var(--muted)' }}>Item</dt>
                      <dd>{job.name}</dd>
                      <dt style={{ color: 'var(--muted)' }}>Size</dt>
                      <dd>
                        {spec.name}, {formatSize(spec)}
                      </dd>
                      {job.quantity && (
                        <>
                          <dt style={{ color: 'var(--muted)' }}>Quantity</dt>
                          <dd>{job.quantity.toLocaleString()}</dd>
                        </>
                      )}
                      {job.lockAt && (
                        <>
                          <dt style={{ color: 'var(--muted)' }}>Changes close</dt>
                          <dd>{deadlineText(job.lockAt)}</dd>
                        </>
                      )}
                    </dl>
                    {view.can.upload && (
                      <div>
                        <div className="text-[15px] font-semibold">Need to swap the file?</div>
                        <p className="text-[14px] mt-0.5" style={{ color: 'var(--ink-2)' }}>
                          Send a new one and we’ll check it and send a fresh proof. A PDF can hold every side.
                        </p>
                        <div className="flex gap-2 mt-3">
                          {view.pages.length > 1 && (
                            <select className="proof-input w-auto" value={uploadPage} onChange={(e) => setUploadPage(Number(e.target.value))} aria-label="Which side">
                              {view.pages.map((p, i) => (
                                <option key={i} value={i}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                          )}
                          <button type="button" className="pbtn" disabled={preview || !!busy} onClick={() => fileInput.current?.click()}>
                            {busy === 'upload' ? 'Sending…' : 'Send a new file'}
                          </button>
                        </div>
                      </div>
                    )}
                    {(brand.phone || brand.email || brand.website) && (
                      <div>
                        <div className="text-[15px] font-semibold">{brand.name || 'Your printer'}</div>
                        <div className="text-[14px] mt-1 space-y-0.5" style={{ color: 'var(--ink-2)' }}>
                          {brand.phone && (
                            <div>
                              <a href={`tel:${brand.phone}`}>{brand.phone}</a>
                            </div>
                          )}
                          {brand.email && (
                            <div>
                              <a href={`mailto:${brand.email}`}>{brand.email}</a>
                            </div>
                          )}
                          {brand.website && <div>{brand.website}</div>}
                        </div>
                      </div>
                    )}
                    {order.offer && (
                      <div className="rounded-2xl p-4" style={{ background: 'var(--raise)' }}>
                        <div className="text-[15px] font-semibold">{order.offer.title}</div>
                        {order.offer.body && (
                          <p className="text-[14px] mt-0.5" style={{ color: 'var(--ink-2)' }}>
                            {order.offer.body}
                          </p>
                        )}
                        {order.offer.url && (
                          <a href={order.offer.url} target="_blank" rel="noreferrer" className="pbtn sm mt-3">
                            {order.offer.cta || 'Take a look'}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ))}

              {drawer === 'work' && <PrinterWork view={own} ops={ops} busy={busy} />}
              {drawer === 'send' && <PrinterSend view={own} ops={ops} busy={busy} onSent={() => setDrawer(null)} />}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}

const CHANGE_GLYPH: Record<ProofChange['kind'], React.ReactNode> = {
  fit: <path d="M4 8V4h4M16 12v4h-4M4 4l5 5M16 16l-5-5" />,
  resolution: <path d="M10 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />,
  spelling: <path d="M4 15 7.5 5 11 15M5.2 11.5h4.6M13 10h3M13 13h3" />,
  safe: <path d="M3.5 3.5h13v13h-13zM6.5 6.5h7v7h-7z" />,
  bleed: <path d="M3 3h14v14H3zM6 6h8v8H6z" />,
  content: <path d="m13.5 4 2.5 2.5L8 14.5H5.5V12L13.5 4Z" />,
  other: <path d="M6 10.5h.01M10 10.5h.01M14 10.5h.01" />,
}

/** For the customer: what was changed, what they asked for, what was checked. */
function ChangesPanel({ view }: { view: PageView }) {
  const asked = view.pages.flatMap((p, i) => p.marks.filter((m) => m.status === 'open' && m.by?.startsWith('customer')).map((m) => ({ ...m, page: i })))
  return (
    <div className="py-3 space-y-7">
      {view.proof?.message && (
        <blockquote className="text-[15.5px] leading-relaxed">
          “{view.proof.message}”
          <footer className="text-[13px] mt-1.5" style={{ color: 'var(--muted)' }}>
            {view.brand.name || 'Your printer'}
          </footer>
        </blockquote>
      )}
      {!!view.proof?.changes.length && (
        <ul className="space-y-3">
          {view.proof.changes.map((c, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-snug">
              <span className="w-8 h-8 rounded-xl inline-flex items-center justify-center shrink-0" style={{ background: 'var(--raise)' }}>
                <Svg d={CHANGE_GLYPH[c.kind]} size={17} />
              </span>
              <span className="pt-1.5">{c.text}</span>
            </li>
          ))}
          <li className="text-[13px] pt-1" style={{ color: 'var(--muted)' }}>
            Tap “Your file” above the page to compare.
          </li>
        </ul>
      )}
      {asked.length > 0 && (
        <div>
          <h3 className="text-[15px] font-semibold mb-2.5">What you asked for</h3>
          <ul className="space-y-2">
            {asked.map((m) => (
              <li key={m.id} className="flex gap-2.5 text-[14.5px]">
                <span className="w-6 h-6 rounded-full text-[12px] font-bold text-white inline-flex items-center justify-center shrink-0" style={{ background: MARK_COLOR }}>
                  {m.n}
                </span>
                <span className="pt-0.5">{m.note || 'A mark on the page'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {view.checks.length > 0 && (
        <div>
          <h3 className="text-[15px] font-semibold mb-2.5">What we checked</h3>
          <ul className="space-y-2.5">
            {view.checks.map((c) => (
              <li key={c.label} className="flex gap-2.5 text-[14.5px]">
                <span className="w-6 h-6 rounded-full inline-flex items-center justify-center shrink-0" style={{ background: c.ok === false ? 'var(--signal-soft)' : 'var(--good-soft)', color: c.ok === false ? '#9d004f' : 'var(--good)' }}>
                  {c.ok === false ? <span className="text-[13px] font-bold">!</span> : <Svg d={Icon.check} size={15} />}
                </span>
                <span className="pt-0.5 leading-snug">
                  {c.label}
                  {c.note && (
                    <span className="block text-[13px]" style={{ color: 'var(--muted)' }}>
                      {c.note}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
