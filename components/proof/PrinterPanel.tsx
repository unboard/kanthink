'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { PageView } from '@/lib/print/orders/views'
import { REVISE_CHANGES, type JobStatus, type ProofChange } from '@/lib/print/orders/types'

/**
 * The printer's side of the shared page: who ordered it, where the file came from,
 * one-click fixes, sending the proof, and moving the job along.
 *
 * Fixes make new versions the customer doesn't see until "Send proof"; the proof is
 * the only thing that changes their page.
 */

interface Props {
  view: PageView
  onView: (v: PageView) => void
  busy: string | null
  setBusy: (b: string | null) => void
  setError: (e: string | null) => void
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error?.message ?? 'That didn’t work.')
  return json as T
}

const ORIGIN_LABEL: Record<string, string> = { customer: 'made by the customer', designer: 'made by their designer', printer: 'made by us', unknown: 'maker unknown' }

export function PrinterPanel({ view, onView, busy, setBusy, setError }: Props) {
  const { job, order } = view
  const id = job.id!
  const open = ['received', 'awaiting_approval', 'changes_requested', 'approved'].includes(job.status)

  // Changes made since the last proof, as suggested lines for the customer.
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

  const [message, setMessage] = useState('')
  const [picked, setPicked] = useState<string[] | null>(null)
  const [extra, setExtra] = useState('')
  const [copied, setCopied] = useState(false)
  const chosen = picked ?? suggested.map((c) => c.text)

  const reload = async () => onView(await call<PageView>(`/api/print/jobs/${id}`))
  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label)
    setError(null)
    try {
      await fn()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work.')
    } finally {
      setBusy(null)
    }
  }

  const revise = (action: 'fit' | 'fix' | 'sharpen', page: number) =>
    act(`${action}-${page}`, async () => onView(await call<PageView>(`/api/print/jobs/${id}/revise`, { method: 'POST', body: JSON.stringify({ action, page }) })))

  const sendProof = () =>
    act('proof', () => {
      const changes: ProofChange[] = [
        ...suggested.filter((c) => chosen.includes(c.text)),
        ...extra.split('\n').map((t) => t.trim()).filter(Boolean).map((text) => ({ kind: 'other' as const, text })),
      ]
      return call(`/api/v1/print/jobs/${id}/proof`, { method: 'POST', body: JSON.stringify({ message: message.trim() || undefined, changes }) }).then(() => {
        setMessage('')
        setExtra('')
        setPicked(null)
      })
    })

  const setStatus = (status: JobStatus) => act(status, () => call(`/api/v1/print/jobs/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }))
  const approve = () => act('approve', () => call(`/api/v1/print/jobs/${id}/approve`, { method: 'POST', body: JSON.stringify({ by: 'Approved by phone or email' }) }))

  const customerLink = typeof window !== 'undefined' ? `${window.location.origin}/proof/${job.token}` : `/proof/${job.token}`
  const c = order.customer ?? {}

  return (
    <div className="proof-card p-5 space-y-5" style={{ borderColor: 'var(--accent)' }}>
      {/* Who and where */}
      <div>
        <div className="text-[12px] uppercase tracking-wide font-semibold" style={{ color: 'var(--muted)' }}>
          Customer
        </div>
        <div className="text-[14px] mt-1">
          {c.name || 'No name'}
          {c.company ? ` · ${c.company}` : ''}
        </div>
        <div className="text-[13px] flex flex-wrap gap-x-3" style={{ color: 'var(--ink-2)' }}>
          {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
          {c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>}
        </div>
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            className="proof-btn h-8 text-[13px]"
            onClick={() => {
              void navigator.clipboard.writeText(customerLink)
              setCopied(true)
              setTimeout(() => setCopied(false), 1600)
            }}
          >
            {copied ? 'Copied' : 'Copy customer link'}
          </button>
          <a href={`/proof/${job.token}`} target="_blank" rel="noreferrer" className="proof-btn quiet h-8 text-[13px]">
            View as customer ↗
          </a>
        </div>
      </div>

      {/* The files */}
      {view.artwork.length > 0 && (
        <div>
          <div className="text-[12px] uppercase tracking-wide font-semibold" style={{ color: 'var(--muted)' }}>
            Artwork received
          </div>
          <ul className="mt-1.5 space-y-1.5">
            {view.artwork.map((a) => (
              <li key={a.id} className="text-[13px]">
                <a href={a.url} target="_blank" rel="noreferrer" className="font-medium underline-offset-2 hover:underline">
                  {a.filename || 'File'}
                </a>
                <span style={{ color: 'var(--muted)' }}>
                  {' '}
                  · {view.pages[a.page]?.label} · {a.width}×{a.height}px{a.format ? ` · ${a.format.toUpperCase()}` : ''}
                </span>
                {a.origin && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {a.origin.madeBy && <span className="proof-chip">{ORIGIN_LABEL[a.origin.madeBy]}</span>}
                    {a.origin.madeWith && <span className="proof-chip">{a.origin.madeWith}</span>}
                    {a.origin.via === 'reorder' && <span className="proof-chip">reorder</span>}
                    {a.origin.aiGenerated && <span className="proof-chip" style={{ background: '#fef3c7', color: '#92400e' }}>AI-made</span>}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {view.fit.map((f) => (
            <p key={f.page} className="text-[12.5px] mt-2 rounded-lg px-2.5 py-2" style={{ background: '#fffbeb', color: '#92400e' }}>
              {view.pages[f.page]?.label}: {f.message}
            </p>
          ))}
        </div>
      )}

      {/* Fixes */}
      {open && (
        <div>
          <div className="text-[12px] uppercase tracking-wide font-semibold" style={{ color: 'var(--muted)' }}>
            Fix
          </div>
          <div className="space-y-2 mt-1.5">
            {view.pages.map((p, i) => {
              const issues = (p.current?.check?.issues ?? []).filter((x) => x.kind !== 'resolution')
              const lowRes = (p.current?.check?.dpi ?? 300) < 240
              const misfit = view.fit.some((f) => f.page === i && f.kind === 'mismatch')
              const hasOriginal = view.artwork.some((a) => a.page === i)
              return (
                <div key={i} className="flex flex-wrap items-center gap-1.5">
                  {view.pages.length > 1 && <span className="text-[12.5px] w-12" style={{ color: 'var(--muted)' }}>{p.label}</span>}
                  {hasOriginal && (
                    <button type="button" className="proof-btn h-8 text-[13px]" disabled={!!busy} onClick={() => revise('fit', i)} style={misfit ? { borderColor: '#d97706' } : undefined} title="Rebuild the customer’s file at this product’s size, keeping every word">
                      {busy === `fit-${i}` ? 'Fitting…' : 'Fit to product'}
                    </button>
                  )}
                  {p.current && issues.length > 0 && (
                    <button type="button" className="proof-btn h-8 text-[13px]" disabled={!!busy} onClick={() => revise('fix', i)}>
                      {busy === `fix-${i}` ? 'Fixing…' : `Fix ${issues.length} issue${issues.length === 1 ? '' : 's'}`}
                    </button>
                  )}
                  {p.current && lowRes && (
                    <button type="button" className="proof-btn h-8 text-[13px]" disabled={!!busy} onClick={() => revise('sharpen', i)}>
                      {busy === `sharpen-${i}` ? 'Sharpening…' : 'Sharpen'}
                    </button>
                  )}
                </div>
              )
            })}
            {job.designId && (
              <Link href={`/print/${job.designId}`} className="proof-btn quiet h-8 text-[13px] px-0">
                Open in the studio for anything else →
              </Link>
            )}
            {busy && /^(fit|fix|sharpen)/.test(busy) && (
              <p className="text-[12.5px]" style={{ color: 'var(--muted)' }}>
                This takes 20–60 seconds. The customer won’t see it until you send the proof.
              </p>
            )}
          </div>
        </div>
      )}

      {/* The proof */}
      {open && (
        <div>
          <div className="text-[12px] uppercase tracking-wide font-semibold" style={{ color: 'var(--muted)' }}>
            {job.status === 'received' ? 'Send the proof' : 'Send an updated proof'}
          </div>
          {suggested.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {suggested.map((s) => (
                <li key={s.text}>
                  <label className="flex gap-2 text-[13px]">
                    <input type="checkbox" checked={chosen.includes(s.text)} onChange={(e) => setPicked(e.target.checked ? [...chosen, s.text] : chosen.filter((x) => x !== s.text))} />
                    {s.text}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <textarea className="proof-input mt-2" rows={2} placeholder="Other changes, one per line (optional)" value={extra} onChange={(e) => setExtra(e.target.value)} />
          <textarea className="proof-input mt-2" rows={2} placeholder="A note to the customer (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
          <button type="button" className="proof-btn primary w-full mt-2" disabled={!!busy} onClick={sendProof}>
            {busy === 'proof' ? 'Sending…' : 'Send proof to customer'}
          </button>
          <p className="text-[12px] mt-1.5" style={{ color: 'var(--muted)' }}>
            Shows them the current version of every page{order.customer?.email ? ' and emails them the link' : ''}.
          </p>
        </div>
      )}

      {/* Status */}
      <div>
        <div className="text-[12px] uppercase tracking-wide font-semibold" style={{ color: 'var(--muted)' }}>
          Status
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {['received', 'awaiting_approval', 'changes_requested'].includes(job.status) && (
            <button type="button" className="proof-btn h-8 text-[13px]" disabled={!!busy} onClick={approve}>
              Approve for them
            </button>
          )}
          {open && (
            <button type="button" className="proof-btn h-8 text-[13px]" disabled={!!busy} onClick={() => setStatus('locked')}>
              Lock now
            </button>
          )}
          {['approved', 'locked'].includes(job.status) && (
            <button type="button" className="proof-btn h-8 text-[13px]" disabled={!!busy} onClick={() => setStatus('in_production')}>
              In production
            </button>
          )}
          {job.status === 'in_production' && (
            <button type="button" className="proof-btn h-8 text-[13px]" disabled={!!busy} onClick={() => setStatus('complete')}>
              Complete
            </button>
          )}
          {['locked', 'cancelled'].includes(job.status) && (
            <button type="button" className="proof-btn quiet h-8 text-[13px]" disabled={!!busy} onClick={() => setStatus('received')}>
              Reopen
            </button>
          )}
          {!['complete', 'cancelled'].includes(job.status) && (
            <button type="button" className="proof-btn quiet h-8 text-[13px]" disabled={!!busy} onClick={() => setStatus('cancelled')}>
              Cancel job
            </button>
          )}
          <a href={`/api/v1/print/jobs/${id}/print-file`} className="proof-btn quiet h-8 text-[13px]">
            Print file (PDF)
          </a>
        </div>
      </div>
    </div>
  )
}
