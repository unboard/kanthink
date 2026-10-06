'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { SignInGate } from '@/components/print/ui'
import { thumb } from '@/lib/print/thumb'
import { PRINTER_STATUS_LABEL, type JobStatus } from '@/lib/print/orders/types'

interface ApiOrder {
  id: string
  externalId: string | null
  ref: string | null
  source: string | null
  customer: { name?: string; email?: string; phone?: string; company?: string }
  lockAt: string | null
  metadata: Record<string, unknown> | null
  links: { customer: string; printer: string }
  jobs: {
    id: string
    name: string
    quantity: number | null
    status: JobStatus
    spec: { name: string }
    links: { customer: string; printFile: string }
    pages: { label: string; current: { url: string } | null; final: { url: string } | null }[]
  }[]
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw Object.assign(new Error(json?.error?.message ?? 'That didn’t work.'), { status: res.status })
  return json as T
}

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="pbtn sm"
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1500)
      }}
    >
      {done ? 'Copied' : label}
    </button>
  )
}

/** Local datetime-local value for an ISO date. */
const local = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function PrinterOrder({ id }: { id: string }) {
  const [order, setOrder] = useState<ApiOrder | null>(null)
  const [status, setStatus] = useState<number | null>(null)
  const [deadline, setDeadline] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    call<ApiOrder>(`/api/v1/print/orders/${id}`)
      .then((o) => {
        setOrder(o)
        setDeadline(local(o.lockAt))
      })
      .catch((e) => setStatus((e as { status?: number }).status ?? 500))
  }, [id])

  if (status === 401) return <SignInGate callbackUrl={`/print/orders/${id}`} />
  if (status) return <div className="proof h-full flex items-center justify-center">This order doesn’t exist, or isn’t yours.</div>
  if (!order) return <div className="proof h-full" aria-busy="true" />

  const saveDeadline = async () => {
    setSaving(true)
    try {
      const o = await call<ApiOrder>(`/api/v1/print/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ lockAt: deadline ? new Date(deadline).toISOString() : null }) })
      setOrder({ ...order, lockAt: o.lockAt })
    } finally {
      setSaving(false)
    }
  }

  const c = order.customer
  const needs = order.jobs.filter((j) => j.status === 'received' || j.status === 'changes_requested').length
  return (
    <div className="proof light-table h-full overflow-y-auto">
      <header className="sticky top-0 z-10 bg-white/85 backdrop-blur border-b" style={{ borderColor: 'var(--line)' }}>
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 h-[60px] flex items-center gap-2">
          <Link href="/print/orders" className="icon-btn -ml-2" aria-label="Back to orders">
            <svg viewBox="0 0 20 20" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 5-5 5 5 5" />
            </svg>
          </Link>
          <h1 className="text-[17px] font-semibold flex-1 truncate">{order.ref ? `Order ${order.ref}` : c.name || 'Order'}</h1>
          <Copy text={order.links.customer} label="Copy customer link" />
        </div>
      </header>
      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-6 sm:py-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
        <section>
          <div className="mb-4 px-1">
            <div className="text-[22px] font-semibold tracking-tight">{c.name || 'Customer'}</div>
            <div className="text-[14.5px] mt-0.5" style={{ color: needs ? '#9d004f' : 'var(--ink-2)' }}>
              {needs ? `${needs} of ${order.jobs.length} item${order.jobs.length === 1 ? '' : 's'} need${needs === 1 ? 's' : ''} you` : `${order.jobs.length} item${order.jobs.length === 1 ? '' : 's'}`}
            </div>
          </div>
          <ul className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            {order.jobs.map((j) => {
              const img = j.pages[0]?.current?.url ?? j.pages[0]?.final?.url
              const waiting = j.status === 'received' || j.status === 'changes_requested'
              return (
                <li key={j.id}>
                  <Link href={`/print/jobs/${j.id}`} className="block rounded-3xl bg-white/70 hover:bg-white transition-colors p-3 border" style={{ borderColor: waiting ? 'rgba(229,0,126,.35)' : 'var(--line)' }}>
                    <span className="light-table h-56 rounded-2xl flex items-center justify-center p-5">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb(img, 640)} alt="" className="max-w-full max-h-full object-contain bg-white" style={{ boxShadow: '0 2px 4px rgba(0,0,0,.08), 0 14px 30px rgba(20,24,29,.16)' }} />
                      ) : (
                        <span className="text-[13.5px]" style={{ color: 'var(--muted)' }}>
                          No artwork yet
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2 px-2 pt-3">
                      {waiting && <span className="signal-dot" />}
                      <span className="text-[16px] font-semibold">{j.name}</span>
                    </span>
                    <span className="block px-2 pb-1 text-[14px]" style={{ color: waiting ? '#9d004f' : 'var(--ink-2)' }}>
                      {PRINTER_STATUS_LABEL[j.status]}
                      {j.quantity ? `, ${j.quantity.toLocaleString()} copies` : ''}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
        <aside className="space-y-3 lg:sticky lg:top-[84px]">
          <div className="rounded-3xl bg-white p-5 border" style={{ borderColor: 'var(--line)' }}>
            <div className="text-[15px] font-semibold">Contact</div>
            <div className="text-[14px] mt-1.5 space-y-0.5" style={{ color: 'var(--ink-2)' }}>
              {c.company && <div>{c.company}</div>}
              {c.email && (
                <div>
                  <a href={`mailto:${c.email}`} className="hover:underline">
                    {c.email}
                  </a>
                </div>
              )}
              {c.phone && (
                <div>
                  <a href={`tel:${c.phone}`} className="hover:underline">
                    {c.phone}
                  </a>
                </div>
              )}
              {!c.email && !c.phone && <div>No contact details on this order.</div>}
            </div>
          </div>
          <div className="rounded-3xl bg-white p-5 border" style={{ borderColor: 'var(--line)' }}>
            <div className="text-[15px] font-semibold">Changes close</div>
            <input type="datetime-local" className="proof-input mt-2" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            <button type="button" className="pbtn sm mt-2" disabled={saving || deadline === local(order.lockAt)} onClick={saveDeadline}>
              {saving ? 'Saving…' : 'Save deadline'}
            </button>
            <p className="text-[13px] mt-2" style={{ color: 'var(--muted)' }}>
              For every item. After it, each proof is final.
            </p>
          </div>
          {(order.externalId || order.metadata) && (
            <div className="rounded-3xl bg-white p-5 border text-[13px]" style={{ borderColor: 'var(--line)' }}>
              <div className="text-[15px] font-semibold mb-1">From your system</div>
              {order.externalId && <div style={{ color: 'var(--ink-2)' }}>Order id {order.externalId}</div>}
              {order.metadata && <pre className="mt-1 whitespace-pre-wrap break-all" style={{ color: 'var(--ink-2)' }}>{JSON.stringify(order.metadata, null, 1)}</pre>}
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}
