'use client'

import { useEffect, useMemo, useState } from 'react'
import { SignInGate } from '@/components/print/ui'
import type { PageView } from '@/lib/print/orders/views'
import { ProofPage, type ProofActions } from './ProofPage'

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw Object.assign(new Error(json?.error?.message ?? 'That didn’t work.'), { status: res.status })
  return json as T
}

/** /print/jobs/:id — the same page the customer sees, with the printer's panel beside it. */
export function PrinterJob({ id }: { id: string }) {
  const [view, setView] = useState<PageView | null>(null)
  const [status, setStatus] = useState<number | null>(null)

  const actions = useMemo<ProofActions>(
    () => ({
      reload: () => call<PageView>(`/api/print/jobs/${id}`),
      message: async (text) => {
        await call(`/api/v1/print/jobs/${id}/messages`, { method: 'POST', body: JSON.stringify({ message: text }) })
        return call<PageView>(`/api/print/jobs/${id}`)
      },
      jobHref: (s) => `/print/jobs/${s.id}`,
      customerView: () => call<PageView>(`/api/print/jobs/${id}?as=customer`),
    }),
    [id],
  )

  useEffect(() => {
    let live = true
    actions
      .reload()
      .then((v) => live && setView(v))
      .catch((e) => live && setStatus((e as { status?: number }).status ?? 500))
    return () => {
      live = false
    }
  }, [actions])

  if (status === 401) return <SignInGate callbackUrl={`/print/jobs/${id}`} />
  if (status) return <div className="h-full flex items-center justify-center text-[15px]">This job doesn’t exist, or isn’t yours.</div>
  if (!view) return <div className="proof h-full" aria-busy="true" />
  return <ProofPage key={id} initial={view} actions={actions} />
}
