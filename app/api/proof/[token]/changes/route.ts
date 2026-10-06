import { proofAction } from '@/lib/print/orders/proofRoute'
import { requestChanges } from '@/lib/print/orders/server'

/** POST /api/proof/:token/changes { note, marks?: [{ page, marks: Mark[] }], name? } */
export const POST = proofAction(async (job, req) => {
  const b = (await req.json().catch(() => ({}))) as { note?: string; marks?: { page: number; marks: unknown }[]; name?: string }
  await requestChanges(job, { note: typeof b.note === 'string' ? b.note : '', marks: Array.isArray(b.marks) ? b.marks : undefined, by: b.name }, 'customer')
})
