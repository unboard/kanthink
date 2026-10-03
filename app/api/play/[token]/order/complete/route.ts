import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { appOrders } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { stripe } from '@/lib/stripe'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { findPublishedApp } from '@/lib/playground/publicApp'
import { markOrderPaid } from '@/lib/playground/orders'

export const runtime = 'nodejs'

/**
 * Where Stripe sends a buyer after paying for an order: record it (the webhook
 * does too, whichever is first) and take them back to the page they ordered from,
 * with the order named so the app can show its confirmation.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const sessionId = req.nextUrl.searchParams.get('session_id')
  const fallback = new URL(`/play/${token}`, req.nextUrl.origin)

  if (!sessionId || !stripe) return NextResponse.redirect(fallback)

  try {
    await ensureSchema()
    const app = await findPublishedApp(token)
    if (!app) return NextResponse.redirect(new URL('/', req.nextUrl.origin))

    const checkout = await stripe.checkout.sessions.retrieve(sessionId)
    const orderId = checkout.metadata?.kanthinkOrderId
    if (!orderId || checkout.metadata?.kanthinkAppId !== app.id) return NextResponse.redirect(fallback)

    const order = (await markOrderPaid(checkout)) ?? (await db.query.appOrders.findFirst({ where: eq(appOrders.id, orderId) }))
    const back = new URL(order?.returnPath || `/play/${token}`, req.nextUrl.origin)
    if (order) back.searchParams.set('order', order.id)
    // A bank payment still settling: the order is recorded when it clears, and the
    // page says so rather than claiming success.
    if (order?.status === 'pending') back.searchParams.set('order_status', 'processing')
    return NextResponse.redirect(back)
  } catch (error) {
    console.error('[play/order/complete] failed:', error)
    return NextResponse.redirect(fallback)
  }
}
