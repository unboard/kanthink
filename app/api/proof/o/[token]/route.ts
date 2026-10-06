import { NextResponse } from 'next/server'
import { getPartner, jobsOf, orderByToken, parseJson } from '@/lib/print/orders/server'
import { pageView } from '@/lib/print/orders/views'
import type { Customer } from '@/lib/print/orders/types'

/** GET /api/proof/o/:token — an order's jobs, for the customer's order page. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const order = await orderByToken(token)
  if (!order) return NextResponse.json({ error: { message: 'This link isn’t valid any more.' } }, { status: 404 })
  const jobs = await jobsOf(order.id)
  const first = jobs[0] ? await pageView(jobs[0], order, 'customer') : null
  return NextResponse.json({
    brand: (await getPartner(order.userId)).brand,
    ref: order.ref,
    customerName: parseJson<Customer>(order.customer, {}).name ?? null,
    lockAt: order.lockAt,
    jobs: first?.siblings ?? [],
  })
}
