import { NextResponse } from 'next/server'
import { body, route } from '@/lib/print/orders/api'
import { getJobOp, setDeadlineOp, setStatusOp } from '@/lib/print/orders/ops'

/**
 * GET   /api/v1/print/jobs/:id   — the job: status, pages (final, proof, current, original), links
 * PATCH /api/v1/print/jobs/:id   — { status } (locked | in_production | complete | cancelled | received)
 *                                  and/or { lockAt } for this job's own deadline
 */

type P = { id: string }

export const GET = route<P>(async (_req, who, { id }) => NextResponse.json(await getJobOp(who, id)))

export const PATCH = route<P>(async (req, who, { id }) => {
  const b = await body(req)
  let out: unknown = null
  if (b.lockAt !== undefined) out = await setDeadlineOp(who, { jobId: id }, b.lockAt)
  if (b.status !== undefined) out = await setStatusOp(who, id, b.status)
  return NextResponse.json(out ?? (await getJobOp(who, id)))
})
