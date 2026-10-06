import { NextResponse } from 'next/server'
import { body, route } from '@/lib/print/orders/api'
import { getOrderOp, setDeadlineOp } from '@/lib/print/orders/ops'

/**
 * GET   /api/v1/print/orders/:id   — the order with its jobs (id, or your externalId)
 * PATCH /api/v1/print/orders/:id   — { lockAt } to move every job's deadline
 */

type P = { id: string }

export const GET = route<P>(async (_req, who, { id }) => NextResponse.json(await getOrderOp(who, id)))

export const PATCH = route<P>(async (req, who, { id }) => {
  const b = await body(req)
  return NextResponse.json(await setDeadlineOp(who, { orderId: id }, b.lockAt))
})
