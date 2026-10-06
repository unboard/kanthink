import { NextResponse } from 'next/server'
import { demoOrderPayload } from '@/lib/print/orders/demo'
import { createOrderOp } from '@/lib/print/orders/ops'
import { OrderError } from '@/lib/print/orders/server'
import { printUser } from '@/lib/print/server/store'

/**
 * POST /api/print/demo — make a demo order on the signed-in account, through the same
 * code the API uses, so the demo shows exactly what an integration would get back.
 * No email goes out.
 */

export const maxDuration = 300

export async function POST() {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: { message: 'Sign in.' } }, { status: 401 })
  try {
    const { order } = await createOrderOp({ userId, actor: 'printer' }, demoOrderPayload(`demo-${Date.now().toString(36)}`), 'studio')
    return NextResponse.json(order, { status: 201 })
  } catch (err) {
    const status = err instanceof OrderError ? err.status : 500
    return NextResponse.json({ error: { message: err instanceof Error ? err.message : 'The demo order didn’t go through.' } }, { status })
  }
}
