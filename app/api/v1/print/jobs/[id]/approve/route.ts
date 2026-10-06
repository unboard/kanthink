import { NextResponse } from 'next/server'
import { route } from '@/lib/print/orders/api'
import { approveOp } from '@/lib/print/orders/ops'

/** POST /api/v1/print/jobs/:id/approve   { by? } — approve on the customer's behalf (a phone call, say). */

export const POST = route<{ id: string }>(async (req, who, { id }) => {
  const b = (await req.json().catch(() => ({}))) as { by?: unknown }
  return NextResponse.json(await approveOp(who, id, b?.by))
})
