'use client'

/** Small fetch helpers for the print studio. Every error carries the server's own message. */

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {}
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { 'Content-Type': 'application/json', ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, res.status)
  return data as T
}

export type UploadKind = 'logo' | 'asset' | 'inspiration' | 'guide'

export interface Uploaded {
  url: string
  width: number
  height: number
  palette?: string[]
}

const MAX_SEND = 3.8 * 1024 * 1024

/**
 * Shrink a large photo in the browser before sending: request bodies are capped, and a
 * 12-megapixel phone photo is far more than a model needs. Logos and guides keep PNG.
 */
async function prepare(file: File, kind: UploadKind): Promise<Blob> {
  if (file.type === 'image/svg+xml' || file.size <= MAX_SEND) return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 3000 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const keepPng = kind === 'logo' || kind === 'guide'
  for (const q of [0.9, 0.8, 0.7]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, keepPng ? 'image/png' : 'image/jpeg', q))
    if (blob && blob.size <= MAX_SEND) return blob
    if (keepPng) break
  }
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t shrink that image'))), 'image/jpeg', 0.6),
  )
}

export async function uploadImage(file: File, kind: UploadKind): Promise<Uploaded> {
  const blob = await prepare(file, kind)
  const form = new FormData()
  form.append('file', blob, file.name)
  form.append('kind', kind)
  return api<Uploaded>('/api/print/upload', { method: 'POST', body: form })
}

export async function importImage(url: string, kind: UploadKind): Promise<Uploaded> {
  return api<Uploaded>('/api/print/import', { method: 'POST', json: { url, kind } })
}

export function shortId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** A smaller copy of one of our stored images, via Cloudinary's on-the-fly resize. */
export { thumb } from '@/lib/print/thumb'
