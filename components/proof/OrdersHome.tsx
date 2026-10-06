'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { SignInGate } from '@/components/print/ui'
import { CATALOG } from '@/lib/print/spec'
import { PRINTER_STATUS_LABEL, type JobStatus } from '@/lib/print/orders/types'
import { thumb } from '@/lib/print/thumb'
import { uploadToStorage } from './upload'

/**
 * /print/orders — the printer's orders, and a way to start one by hand.
 *
 * Orders usually arrive through the API; this form is the same door for the times one
 * comes in by phone, email or counter: customer, deadline, and one or more items, each
 * with a product and its files.
 */

interface OrderRow {
  id: string
  ref: string | null
  source: string | null
  customer: { name?: string; email?: string }
  lockAt: string | null
  createdAt: string | null
  updatedAt: string | null
  jobs: { id: string; name: string; quantity: number | null; status: JobStatus; thumb: string | null }[]
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw Object.assign(new Error(json?.error?.message ?? 'That didn’t work.'), { status: res.status })
  return json as T
}

interface DraftJob {
  key: string
  name: string
  quantity: string
  product: string
  shape: string
  sides: number
  width: string
  height: string
  unit: 'in' | 'mm'
  files: File[]
}

const blankJob = (): DraftJob => ({ key: Math.random().toString(36).slice(2), name: '', quantity: '', product: 'flyer-letter', shape: '', sides: 1, width: '', height: '', unit: 'in', files: [] })

function NewOrder({ onClose, approvalHours }: { onClose: () => void; approvalHours: number }) {
  const router = useRouter()
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '', company: '' })
  const [ref, setRef] = useState('')
  const [hours, setHours] = useState(String(approvalHours))
  const [notify, setNotify] = useState(true)
  const [jobs, setJobs] = useState<DraftJob[]>([blankJob()])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const edit = (key: string, change: Partial<DraftJob>) => setJobs(jobs.map((j) => (j.key === key ? { ...j, ...change } : j)))

  const submit = async () => {
    setError(null)
    try {
      setBusy('Uploading files…')
      const payloadJobs = []
      for (const j of jobs) {
        const urls = []
        for (const f of j.files) urls.push({ url: await uploadToStorage(f, '/api/print/sign-artwork'), filename: f.name, origin: { via: 'upload' as const } })
        const catalog = CATALOG.find((p) => p.key === j.product)
        payloadJobs.push({
          name: j.name.trim() || catalog?.name || 'Custom size',
          quantity: Number(j.quantity) || undefined,
          product: catalog
            ? { key: catalog.key, shape: j.shape || undefined, pages: catalog.pageOptions ? j.sides : undefined }
            : { width: Number(j.width), height: Number(j.height), unit: j.unit, pages: j.sides },
          artwork: urls,
        })
      }
      setBusy('Creating the order and checking the artwork…')
      const order = await call<{ id: string }>('/api/v1/print/orders', {
        method: 'POST',
        body: JSON.stringify({
          ref: ref.trim() || undefined,
          customer: Object.fromEntries(Object.entries(customer).filter(([, v]) => v.trim())),
          approvalHours: Number(hours) || approvalHours,
          notifyCustomer: notify,
          jobs: payloadJobs,
        }),
      })
      router.push(`/print/orders/${order.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work.')
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-start justify-center overflow-y-auto sm:p-8" style={{ background: 'rgba(20,24,29,.35)' }}>
      <div className="bg-white w-full max-w-[720px] p-5 sm:p-7 rounded-t-3xl sm:rounded-3xl shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-[21px] font-semibold tracking-tight">New order</h2>
          <button type="button" className="pbtn sm ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="text-[13.5px] mt-1" style={{ color: 'var(--ink-2)' }}>
          Each item gets its own proof page and link. The customer can approve or ask for changes until the deadline.
        </p>

        <div className="grid sm:grid-cols-2 gap-2.5 mt-5">
          <input className="proof-input" placeholder="Customer name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
          <input className="proof-input" placeholder="Company (optional)" value={customer.company} onChange={(e) => setCustomer({ ...customer, company: e.target.value })} />
          <input className="proof-input" placeholder="Email (for the proof link)" type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
          <input className="proof-input" placeholder="Phone (optional)" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
          <input className="proof-input" placeholder="Order number (optional)" value={ref} onChange={(e) => setRef(e.target.value)} />
          <label className="flex items-center gap-2 text-[13.5px]">
            Changes close after
            <input className="proof-input w-20" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d]/g, ''))} />
            hours
          </label>
        </div>

        <div className="mt-6 space-y-3">
          {jobs.map((j, i) => {
            const catalog = CATALOG.find((p) => p.key === j.product)
            return (
              <div key={j.key} className="rounded-2xl p-3.5" style={{ background: 'var(--raise)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-semibold">Item {i + 1}</span>
                  {jobs.length > 1 && (
                    <button type="button" className="text-[12.5px]" style={{ color: 'var(--muted)' }} onClick={() => setJobs(jobs.filter((x) => x.key !== j.key))}>
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid sm:grid-cols-[1fr_1fr_110px] gap-2">
                  <select className="proof-input" value={j.product} onChange={(e) => edit(j.key, { product: e.target.value, shape: '', sides: CATALOG.find((p) => p.key === e.target.value)?.spec.pages.length ?? 1 })}>
                    {CATALOG.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.name} — {p.blurb}
                      </option>
                    ))}
                    <option value="custom">Custom size…</option>
                  </select>
                  <input className="proof-input" placeholder={`Name (e.g. ${catalog?.name ?? 'Banner'})`} value={j.name} onChange={(e) => edit(j.key, { name: e.target.value })} />
                  <input className="proof-input" placeholder="Qty" inputMode="numeric" value={j.quantity} onChange={(e) => edit(j.key, { quantity: e.target.value.replace(/[^\d]/g, '') })} />
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-[13px]">
                  {!catalog && (
                    <>
                      <input className="proof-input w-24" placeholder="Width" inputMode="decimal" value={j.width} onChange={(e) => edit(j.key, { width: e.target.value })} />
                      ×
                      <input className="proof-input w-24" placeholder="Height" inputMode="decimal" value={j.height} onChange={(e) => edit(j.key, { height: e.target.value })} />
                      <select className="proof-input w-20" value={j.unit} onChange={(e) => edit(j.key, { unit: e.target.value as 'in' | 'mm' })}>
                        <option value="in">in</option>
                        <option value="mm">mm</option>
                      </select>
                    </>
                  )}
                  {catalog?.shapes && (
                    <select className="proof-input w-auto" value={j.shape || catalog.shapes[0].key} onChange={(e) => edit(j.key, { shape: e.target.value })}>
                      {catalog.shapes.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {(!catalog || catalog.pageOptions) && (
                    <select className="proof-input w-auto" value={j.sides} onChange={(e) => edit(j.key, { sides: Number(e.target.value) })}>
                      {(catalog?.pageOptions ?? [1, 2]).map((n) => (
                        <option key={n} value={n}>
                          {n === 1 ? 'Front only' : n === 2 ? 'Front and back' : `${n} pages`}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <label className="mt-2.5 flex items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 text-[13.5px] cursor-pointer" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
                  <input type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={(e) => edit(j.key, { files: [...j.files, ...Array.from(e.target.files ?? [])] })} />
                  {j.files.length ? j.files.map((f) => f.name).join(', ') : 'Add artwork — a PDF, or an image per side'}
                </label>
              </div>
            )
          })}
          <button type="button" className="pbtn sm ghost" onClick={() => setJobs([...jobs, blankJob()])}>
            + Add another item
          </button>
        </div>

        <label className="flex items-center gap-2 text-[13.5px] mt-4">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email the customer their order page now
        </label>
        {error && (
          <p className="text-[13.5px] mt-3" style={{ color: 'var(--err)' }}>
            {error}
          </p>
        )}
        <div className="flex items-center gap-3 mt-5">
          <button type="button" className="pbtn primary" disabled={!!busy || jobs.some((j) => !CATALOG.find((p) => p.key === j.product) && !(Number(j.width) > 0 && Number(j.height) > 0))} onClick={submit}>
            {busy ?? 'Create order'}
          </button>
          <span className="text-[12.5px]" style={{ color: 'var(--muted)' }}>
            Artwork is checked for size, bleed, safe area and resolution as it comes in.
          </span>
        </div>
      </div>
    </div>
  )
}

const NEEDS_YOU: JobStatus[] = ['received', 'changes_requested']
const WITH_THEM: JobStatus[] = ['awaiting_approval']

function OrderRowView({ o }: { o: OrderRow }) {
  const waiting = o.jobs.filter((j) => NEEDS_YOU.includes(j.status)).length
  const thumbs = o.jobs.filter((j) => j.thumb).slice(0, 3)
  const settled = o.jobs.every((j) => ['locked', 'in_production', 'complete', 'canceled'].includes(j.status))
  return (
    <li>
      <Link href={`/print/orders/${o.id}`} className="flex items-center gap-4 rounded-2xl bg-white px-3 py-3 sm:px-4 border hover:shadow-md transition-shadow" style={{ borderColor: 'var(--line)' }}>
        <span className="light-table relative w-[76px] h-[64px] rounded-xl shrink-0 overflow-hidden flex items-center justify-center">
          {thumbs.map((j, i) => {
            const k = i - (thumbs.length - 1) / 2
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={j.id}
                src={thumb(j.thumb!, 200)}
                alt=""
                className="absolute max-w-[62%] max-h-[70%] object-contain bg-white"
                style={{ transform: `translate(${k * 9}px, ${k * -4}px) rotate(${k * 5}deg)`, boxShadow: '0 2px 6px rgba(20,24,29,.18)', zIndex: i }}
              />
            )
          })}
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2">
            {waiting > 0 && <span className="signal-dot" />}
            <span className="text-[16px] font-semibold truncate">{o.ref ? `Order ${o.ref}` : o.customer.name || 'Order'}</span>
          </span>
          <span className="block text-[13.5px] truncate mt-0.5" style={{ color: 'var(--ink-2)' }}>
            {o.ref && o.customer.name ? `${o.customer.name}, ` : ''}
            {o.jobs.map((j) => j.name).join(', ')}
          </span>
          <span className="block text-[13px] mt-0.5" style={{ color: waiting ? '#9d004f' : 'var(--muted)' }}>
            {waiting
              ? `${waiting} item${waiting === 1 ? '' : 's'} need${waiting === 1 ? 's' : ''} you`
              : o.jobs.every((j) => ['approved', 'locked', 'in_production', 'complete'].includes(j.status))
                ? 'All approved'
                : o.jobs.some((j) => WITH_THEM.includes(j.status))
                  ? 'Waiting on the customer'
                  : PRINTER_STATUS_LABEL[o.jobs[0]?.status ?? 'received']}
            {o.lockAt && !settled ? `, closes ${new Date(o.lockAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
          </span>
        </span>
        {o.source === 'api' || o.source === 'mcp' ? <span className="proof-chip hidden sm:inline-flex">{o.source === 'mcp' ? 'From a bot' : 'From your system'}</span> : null}
      </Link>
    </li>
  )
}

export function OrdersHome() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null)
  const [status, setStatus] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [approvalHours, setApprovalHours] = useState(24)

  useEffect(() => {
    Promise.all([call<{ orders: OrderRow[] }>('/api/v1/print/orders'), call<{ approvalHours: number }>('/api/print/partner')])
      .then(([o, p]) => {
        setOrders(o.orders)
        setApprovalHours(p.approvalHours)
      })
      .catch((e) => setStatus((e as { status?: number }).status ?? 500))
  }, [])

  if (status === 401) return <SignInGate callbackUrl="/print/orders" />

  const open = (o: OrderRow, list: JobStatus[]) => o.jobs.some((j) => list.includes(j.status))
  const groups = orders
    ? [
        { title: 'Needs you', hint: 'New files to review, or changes the customer asked for.', rows: orders.filter((o) => open(o, NEEDS_YOU)) },
        { title: 'With customers', hint: 'Proofs waiting for approval.', rows: orders.filter((o) => !open(o, NEEDS_YOU) && open(o, WITH_THEM)) },
        { title: 'Approved and printing', hint: '', rows: orders.filter((o) => !open(o, NEEDS_YOU) && !open(o, WITH_THEM) && open(o, ['approved', 'locked', 'in_production'])) },
        { title: 'Done', hint: '', rows: orders.filter((o) => o.jobs.length > 0 && o.jobs.every((j) => ['complete', 'canceled'].includes(j.status))) },
      ].filter((g) => g.rows.length)
    : []

  return (
    <div className="proof light-table h-full overflow-y-auto">
      <header className="sticky top-0 z-10 bg-white/85 backdrop-blur border-b" style={{ borderColor: 'var(--line)' }}>
        <div className="max-w-[920px] mx-auto px-4 sm:px-6 h-[60px] flex items-center gap-2">
          <Link href="/print" className="icon-btn -ml-2" aria-label="Back to the studio">
            <svg viewBox="0 0 20 20" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 5-5 5 5 5" />
            </svg>
          </Link>
          <h1 className="text-[17px] font-semibold flex-1">Orders</h1>
          <Link href="/print/developers" className="pbtn sm ghost hidden sm:inline-flex">
            Settings and API
          </Link>
          <button type="button" className="pbtn sm primary" onClick={() => setCreating(true)}>
            New order
          </button>
        </div>
      </header>
      <main className="max-w-[920px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {orders && orders.length === 0 && (
          <div className="rounded-3xl bg-white p-8 sm:p-12 text-center border" style={{ borderColor: 'var(--line)' }}>
            <p className="text-[20px] font-semibold tracking-tight">No orders yet</p>
            <p className="text-[15px] mt-1.5 max-w-[440px] mx-auto" style={{ color: 'var(--ink-2)' }}>
              Start one here, or send them in from your own system. Each item gets a page you and your customer share until it’s approved.
            </p>
            <div className="flex justify-center gap-2 mt-5">
              <button type="button" className="pbtn primary" onClick={() => setCreating(true)}>
                New order
              </button>
              <Link href="/print/developers" className="pbtn">
                Connect your system
              </Link>
            </div>
          </div>
        )}
        {groups.map((g) => (
          <section key={g.title} className="mb-8">
            <div className="flex items-baseline justify-between mb-2.5 px-1">
              <h2 className="text-[15px] font-semibold">
                {g.title} <span style={{ color: 'var(--muted)' }}>{g.rows.length}</span>
              </h2>
              {g.hint && (
                <span className="text-[13px] hidden sm:inline" style={{ color: 'var(--muted)' }}>
                  {g.hint}
                </span>
              )}
            </div>
            <ul className="space-y-2">
              {g.rows.map((o) => (
                <OrderRowView key={o.id} o={o} />
              ))}
            </ul>
          </section>
        ))}
        {status && status !== 401 && <p style={{ color: 'var(--err)' }}>Couldn’t load your orders. Refresh to try again.</p>}
      </main>
      {creating && <NewOrder onClose={() => setCreating(false)} approvalHours={approvalHours} />}
    </div>
  )
}
