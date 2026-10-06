'use client'

import { useMemo } from 'react'
import type { Mark } from '@/lib/print/markup'
import type { PageView } from '@/lib/print/orders/views'
import { ProofPage, type ProofActions } from './ProofPage'
import { uploadToStorage } from './upload'

async function call(url: string, init?: RequestInit): Promise<PageView> {
  const res = await fetch(url, init)
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error?.message ?? 'That didn’t work. Try again.')
  return json as PageView
}

const post = (url: string, body: unknown) => call(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/** The customer's page, acting through the job's link and nothing else. */
export function CustomerProof({ initial, token }: { initial: PageView; token: string }) {
  const actions = useMemo<ProofActions>(
    () => ({
      reload: () => call(`/api/proof/${token}`),
      approve: (name) => post(`/api/proof/${token}/approve`, { name }),
      requestChanges: (note: string, marks: { page: number; marks: Mark[] }[], name?: string) => post(`/api/proof/${token}/changes`, { note, marks, name }),
      upload: async (file, page) => {
        // Small files go inline; anything bigger goes straight to storage first.
        if (file.size <= 3.5 * 1024 * 1024) {
          const form = new FormData()
          form.append('file', file)
          form.append('page', String(page))
          return call(`/api/proof/${token}/upload`, { method: 'POST', body: form })
        }
        const url = await uploadToStorage(file, `/api/proof/${token}/sign`)
        return post(`/api/proof/${token}/upload`, { url, page, filename: file.name })
      },
      message: (text) => post(`/api/proof/${token}/message`, { message: text }),
      jobHref: (s) => `/proof/${s.token}`,
    }),
    [token],
  )
  return <ProofPage initial={initial} actions={actions} />
}
