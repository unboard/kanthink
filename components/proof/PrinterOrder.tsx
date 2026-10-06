'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { SignInGate } from '@/components/print/ui'
import { thumb } from '@/components/print/api'
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
      className="proof-btn h-8 text-[13px]"
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
  return (
    <div className="proof h-full overflow-y-auto">
      <header className="border-b bg-white sticky top-0 z-10" style={{ borderColor: 'var(--line)' }}>
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/print/orders" className="text-[13px]" style={{ color: 'var(--muted)' }}>
            ← Orders
          </Link>
          <h1 className="text-[16px] font-semibold flex-1">{order.ref ? `Order ${order.ref}` : 'Order'}</h1>
          <Copy text={order.links.customer} label="Copy customer’s order link" />
        </div>
      </header>
      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
        <section>
          <ul className="grid gap-3 sm:grid-cols-2">
            {order.jobs.map((j, i) => {
              const img = j.pages[0]?.current?.url ?? j.pages[0]?.final?.url
              return (
                <li key={j.id} className="proof-card overflow-hidden">
                  <Link href={`/print/jobs/${j.id}`} className="block">
                    <div className="proof-stage rounded-none h-48 flex items-center justify-center p-4">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb(img, 520)} alt="" className="max-w-full max-h-full shadow" />
                      ) : (
                        <span className="text-[13px]" style={{ color: 'var(--muted)' }}>
                          No artwork yet
                        </span>
                      )}
                    </div>
                    <div className="px-4 pt-3">
                      <div className="text-[15px] font-semibold">
                        {i + 1}. {j.name}
                      </div>
                      <div className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
                        {j.spec.name}
                        {j.quantity ? ` · ${j.quantity.toLocaleString()}` : ''} · {PRINTER_STATUS_LABEL[j.status]}
                      </div>
                    </div>
                  </Link>
                  <div className="px-4 pb-3 pt-2 flex gap-2">
                    <Copy text={j.links.customer} label="Copy link" />
                    <a href={j.links.printFile} className="proof-btn quiet h-8 text-[13px]">
                      Print file
                    </a>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
        <aside className="space-y-4">
          <div className="proof-card p-5">
            <div className="text-[12px] uppercase tracking-wide font-semibold" style={{ color: 'var(--muted)' }}>
              Customer
            </div>
            <div className="text-[15px] mt-1">{c.name || '—'}{c.company ? ` · ${c.company}` : ''}</div>
            <div className="text-[13px] mt-0.5 space-x-3" style={{ color: 'var(--ink-2)' }}>
              {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
              {c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>}
            </div>
          </div>
          <div className="proof-card p-5">
            <div className="text-[12px] uppercase tracking-wide font-semibold" style={{ color: 'var(--muted)' }}>
              Changes close
            </div>
            <input type="datetime-local" className="proof-input mt-2" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            <button type="button" className="proof-btn mt-2 h-8 text-[13px]" disabled={saving || deadline === local(order.lockAt)} onClick={saveDeadline}>
              {saving ? 'Saving…' : 'Save deadline'}
            </button>
            <p className="text-[12px] mt-2" style={{ color: 'var(--muted)' }}>
              Applies to every item. After it, each item’s proof is final.
            </p>
          </div>
          {(order.externalId || order.metadata) && (
            <div className="proof-card p-5 text-[12.5px]">
              <div className="text-[12px] uppercase tracking-wide font-semibold mb-1" style={{ color: 'var(--muted)' }}>
                From your system
              </div>
              {order.externalId && <div>externalId: {order.externalId}</div>}
              {order.metadata && <pre className="mt-1 whitespace-pre-wrap break-all" style={{ color: 'var(--ink-2)' }}>{JSON.stringify(order.metadata, null, 1)}</pre>}
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}
