'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { PageView } from '@/lib/print/orders/views'
import { REVISE_CHANGES, type JobStatus, type ProofChange } from '@/lib/print/orders/types'
import { MARK_COLOR } from '@/lib/print/markup'

/**
 * The printer's tools on the shared page, as drawer sections: Work (fix the file),
 * Send (the proof and what changed), Details (the customer, links, status).
 *
 * Fixes make new versions the customer doesn't see until the proof is sent; sending
 * the proof is the only thing that changes their page.
 */

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error?.message ?? 'That didn’t work.')
  return json as T
}

export interface PrinterOps {
  revise: (action: 'fit' | 'fix' | 'sharpen' | 'marks', page: number) => Promise<void>
  sendProof: (message: string, changes: ProofChange[]) => Promise<boolean>
  setStatus: (status: JobStatus) => Promise<void>
  approve: () => Promise<void>
}

export function usePrinterOps(view: PageView, onView: (v: PageView) => void, setBusy: (b: string | null) => void, setError: (e: string | null) => void): PrinterOps {
  const id = view.job.id!
  const reload = async () => onView(await call<PageView>(`/api/print/jobs/${id}`))
  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label)
    setError(null)
    try {
      await fn()
      await reload()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work.')
      return false
    } finally {
      setBusy(null)
    }
  }
  return {
    revise: async (action, page) => {
      await act(`${action}-${page}`, async () => onView(await call<PageView>(`/api/print/jobs/${id}/revise`, { method: 'POST', body: JSON.stringify({ action, page }) })))
    },
    sendProof: (message, changes) => act('proof', () => call(`/api/v1/print/jobs/${id}/proof`, { method: 'POST', body: JSON.stringify({ message: message.trim() || undefined, changes }) })),
    setStatus: async (status) => {
      await act(status, () => call(`/api/v1/print/jobs/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }))
    },
    approve: async () => {
      await act('approve', () => call(`/api/v1/print/jobs/${id}/approve`, { method: 'POST', body: JSON.stringify({ by: 'Approved by phone or email' }) }))
    },
  }
}

const OPEN: JobStatus[] = ['received', 'awaiting_approval', 'changes_requested', 'approved']

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="py-5 border-b last:border-b-0" style={{ borderColor: 'var(--line)' }}>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {hint && (
        <p className="text-[13.5px] mt-0.5" style={{ color: 'var(--muted)' }}>
          {hint}
        </p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** Fix the file: one-click fixes per side, the studio, the check, the customer's marks, the files. */
export function PrinterWork({ view, ops, busy }: { view: PageView; ops: PrinterOps; busy: string | null }) {
  const open = OPEN.includes(view.job.status)
  const marks = view.pages.flatMap((p, i) => p.marks.filter((m) => m.status === 'open' && !m.hidden).map((m) => ({ ...m, page: i })))
  const markedSides = [...new Set(marks.map((m) => m.page))]
  return (
    <div>
      {marks.length > 0 && (
        <Section title={`${view.order.customerName || 'The customer'} asked for`}>
          <ul className="space-y-2.5">
            {marks.map((m) => (
              <li key={m.id} className="flex gap-2.5 text-[14.5px]">
                <span className="w-6 h-6 rounded-full text-[12px] font-bold text-white inline-flex items-center justify-center shrink-0" style={{ background: MARK_COLOR }}>
                  {m.n}
                </span>
                <span className="pt-0.5">
                  {m.note || <span style={{ color: 'var(--muted)' }}>A mark with no note</span>}
                  {view.pages.length > 1 && <span style={{ color: 'var(--muted)' }}> on the {view.pages[m.page].label.toLowerCase()}</span>}
                </span>
              </li>
            ))}
          </ul>
          {open && (
            <div className="flex flex-wrap gap-2 mt-3.5">
              {markedSides.map((i) => (
                <button key={i} type="button" className="pbtn sm primary" disabled={!!busy} onClick={() => ops.revise('marks', i)}>
                  {busy === `marks-${i}` ? 'Making the changes…' : `Make these changes${markedSides.length > 1 || view.pages.length > 1 ? ` on the ${view.pages[i].label.toLowerCase()}` : ''}`}
                </button>
              ))}
            </div>
          )}
        </Section>
      )}

      {open && (
        <Section title="One-click fixes" hint="Each fix makes a new version. Your customer sees it only when you send the proof.">
          <div className="space-y-3">
            {view.pages.map((p, i) => {
              const issues = (p.current?.check?.issues ?? []).filter((x) => x.kind !== 'resolution')
              const lowRes = (p.current?.check?.dpi ?? 300) < 240
              const misfit = view.fit.find((f) => f.page === i && f.kind === 'mismatch')
              const hasFile = view.artwork.some((a) => a.page === i)
              const nothing = !hasFile && !issues.length && !lowRes
              return (
                <div key={i}>
                  {view.pages.length > 1 && <div className="text-[13px] font-medium mb-1.5">{p.label}</div>}
                  {misfit && (
                    <p className="text-[13.5px] mb-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--signal-soft)', color: '#9d004f' }}>
                      {misfit.message}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {hasFile && (
                      <button type="button" className={`pbtn sm ${misfit ? 'primary' : ''}`} disabled={!!busy} onClick={() => ops.revise('fit', i)}>
                        {busy === `fit-${i}` ? 'Fitting…' : 'Fit to product'}
                      </button>
                    )}
                    {issues.length > 0 && (
                      <button type="button" className="pbtn sm" disabled={!!busy} onClick={() => ops.revise('fix', i)}>
                        {busy === `fix-${i}` ? 'Fixing…' : `Fix ${issues.length} print issue${issues.length === 1 ? '' : 's'}`}
                      </button>
                    )}
                    {lowRes && (
                      <button type="button" className="pbtn sm" disabled={!!busy} onClick={() => ops.revise('sharpen', i)}>
                        {busy === `sharpen-${i}` ? 'Sharpening…' : 'Sharpen'}
                      </button>
                    )}
                    {nothing && <span className="text-[13.5px]" style={{ color: 'var(--muted)' }}>No file on this side.</span>}
                  </div>
                  {issues.length > 0 && (
                    <ul className="mt-2 space-y-1 text-[13.5px]" style={{ color: 'var(--ink-2)' }}>
                      {issues.slice(0, 4).map((x, k) => (
                        <li key={k}>{x.message}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
            {busy && /^(fit|fix|sharpen|marks)/.test(busy) && (
              <p className="text-[13px]" style={{ color: 'var(--muted)' }}>
                About a minute. You can keep reading while it works.
              </p>
            )}
            {view.job.designId && (
              <Link href={`/print/${view.job.designId}`} className="pbtn sm ghost px-0">
                Open in the studio for anything else
              </Link>
            )}
          </div>
        </Section>
      )}

      {view.artwork.length > 0 && (
        <Section title="Files received">
          <ul className="space-y-3">
            {view.artwork.map((a) => (
              <li key={a.id} className="text-[14px]">
                <a href={a.url} target="_blank" rel="noreferrer" className="font-medium hover:underline underline-offset-2">
                  {a.filename || 'File'}
                </a>
                <div className="text-[13px]" style={{ color: 'var(--muted)' }}>
                  {view.pages[a.page]?.label}, {a.width} × {a.height} px{a.format ? `, ${a.format.toUpperCase()}` : ''}
                </div>
                {a.origin && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {a.origin.madeBy && a.origin.madeBy !== 'unknown' && <span className="proof-chip">Made by {a.origin.madeBy === 'printer' ? 'us' : a.origin.madeBy === 'customer' ? 'the customer' : 'their designer'}</span>}
                    {a.origin.madeWith && <span className="proof-chip">{a.origin.madeWith}</span>}
                    {a.origin.via === 'reorder' && <span className="proof-chip">Reorder</span>}
                    {a.origin.aiGenerated && (
                      <span className="proof-chip" style={{ background: 'var(--signal-soft)', color: '#9d004f' }}>
                        AI-made
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

/** Send the proof: what changed (suggested from the fixes made), and a note. */
export function PrinterSend({ view, ops, busy, onSent }: { view: PageView; ops: PrinterOps; busy: string | null; onSent: () => void }) {
  const suggested = useMemo(() => {
    const lastProof = [...view.events].reverse().find((e) => e.type === 'proof_sent')?.at ?? 0
    const out: ProofChange[] = []
    for (const e of view.events) {
      if (e.type !== 'revised' || e.at < lastProof) continue
      const c = REVISE_CHANGES[e.data?.action as keyof typeof REVISE_CHANGES]
      if (c && !out.some((x) => x.text === c.text)) out.push(c)
    }
    if (view.events.some((e) => e.type === 'changes_requested' && e.at > lastProof)) out.push({ kind: 'content', text: 'Made the changes you asked for' })
    return out
  }, [view.events])
  const [picked, setPicked] = useState<string[] | null>(null)
  const [extra, setExtra] = useState('')
  const [message, setMessage] = useState('')
  const chosen = picked ?? suggested.map((c) => c.text)

  const send = async () => {
    const changes: ProofChange[] = [
      ...suggested.filter((c) => chosen.includes(c.text)),
      ...extra.split('\n').map((t) => t.trim()).filter(Boolean).map((text) => ({ kind: 'other' as const, text })),
    ]
    if (await ops.sendProof(message, changes)) onSent()
  }

  return (
    <div>
      <Section title={view.proof ? 'Send an updated proof' : 'Send the proof'} hint="Your customer sees the current version of every side and can approve it or ask for a change.">
        {suggested.length > 0 && (
          <div className="mb-4">
            <div className="text-[13.5px] font-medium mb-2">Tell them what changed</div>
            <ul className="space-y-2">
              {suggested.map((s) => (
                <li key={s.text}>
                  <label className="flex gap-2.5 text-[14px] leading-snug">
                    <input type="checkbox" className="mt-0.5 w-4 h-4" checked={chosen.includes(s.text)} onChange={(e) => setPicked(e.target.checked ? [...chosen, s.text] : chosen.filter((x) => x !== s.text))} />
                    {s.text}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        <textarea className="proof-input" rows={2} placeholder={suggested.length ? 'Anything else you changed, one per line' : 'What you changed, one per line (optional)'} value={extra} onChange={(e) => setExtra(e.target.value)} />
        <textarea className="proof-input mt-2" rows={3} placeholder="A note for them (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
        <button type="button" className="pbtn primary w-full mt-3" disabled={!!busy} onClick={send}>
          {busy === 'proof' ? 'Sending…' : 'Send proof'}
        </button>
        <p className="text-[12.5px] mt-2" style={{ color: 'var(--muted)' }}>
          {view.order.customer?.email ? `We’ll email ${view.order.customer.email} the link.` : 'There’s no email on this order, so copy the link to them from Details.'}
        </p>
      </Section>
    </div>
  )
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

/** Who ordered it, the links to send them, and where the job goes next. */
export function PrinterDetails({ view, ops, busy }: { view: PageView; ops: PrinterOps; busy: string | null }) {
  const { job, order } = view
  const c = order.customer ?? {}
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const s = job.status
  const facts = Object.entries(job.product).filter(([k, v]) => !['key', 'shape', 'width', 'height', 'unit', 'bleed', 'safe', 'pages', 'name'].includes(k) && (typeof v === 'string' || typeof v === 'number'))
  return (
    <div>
      <Section title={c.name || 'Customer'}>
        <div className="text-[14px] space-y-1" style={{ color: 'var(--ink-2)' }}>
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
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <Copy text={`${origin}/proof/${job.token}`} label="Copy their link" />
          {view.siblings.length > 1 && <Copy text={`${origin}/proof/o/${order.token}`} label="Copy order link" />}
        </div>
      </Section>

      <Section title="Item">
        <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-[14px]">
          <dt style={{ color: 'var(--muted)' }}>Product</dt>
          <dd>{view.spec.name}</dd>
          {job.quantity && (
            <>
              <dt style={{ color: 'var(--muted)' }}>Quantity</dt>
              <dd>{job.quantity.toLocaleString()}</dd>
            </>
          )}
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="capitalize" style={{ color: 'var(--muted)' }}>
                {k}
              </dt>
              <dd>{String(v)}</dd>
            </div>
          ))}
          {order.ref && (
            <>
              <dt style={{ color: 'var(--muted)' }}>Order</dt>
              <dd>
                {order.id ? (
                  <Link href={`/print/orders/${order.id}`} className="hover:underline">
                    {order.ref}
                  </Link>
                ) : (
                  order.ref
                )}
              </dd>
            </>
          )}
        </dl>
      </Section>

      <Section title="Move it along">
        <div className="flex flex-wrap gap-2">
          {['received', 'awaiting_approval', 'changes_requested'].includes(s) && (
            <button type="button" className="pbtn sm" disabled={!!busy} onClick={ops.approve}>
              Approve for them
            </button>
          )}
          {OPEN.includes(s) && (
            <button type="button" className="pbtn sm" disabled={!!busy} onClick={() => ops.setStatus('locked')}>
              Lock for print now
            </button>
          )}
          {['approved', 'locked'].includes(s) && (
            <button type="button" className="pbtn sm" disabled={!!busy} onClick={() => ops.setStatus('in_production')}>
              Start printing
            </button>
          )}
          {s === 'in_production' && (
            <button type="button" className="pbtn sm" disabled={!!busy} onClick={() => ops.setStatus('complete')}>
              Mark complete
            </button>
          )}
          {['locked', 'cancelled'].includes(s) && (
            <button type="button" className="pbtn sm" disabled={!!busy} onClick={() => ops.setStatus('received')}>
              Reopen for changes
            </button>
          )}
          <a href={`/api/v1/print/jobs/${job.id}/print-file`} className="pbtn sm">
            Download print file
          </a>
          {!['complete', 'cancelled'].includes(s) && (
            <button type="button" className="pbtn sm ghost" disabled={!!busy} onClick={() => ops.setStatus('cancelled')}>
              Cancel this item
            </button>
          )}
        </div>
      </Section>
    </div>
  )
}
