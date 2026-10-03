import { NextRequest, NextResponse } from 'next/server'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { findPublishedApp, requestOrigin } from '@/lib/playground/publicApp'
import { OrderError, startOrder } from '@/lib/playground/orders'
import { PricingAuthError, PricingUnavailableError } from '@/lib/playground/appPricing'

export const runtime = 'nodejs'

/**
 * A buyer pressed Buy in a shop. Makes the order and its Stripe checkout and says
 * where to send them. No sign-in and no code: checkout itself collects who is
 * buying, and paying is the proof.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  try {
    await ensureSchema()
    const app = await findPublishedApp(token)
    if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const origin = await requestOrigin()
    const { checkoutUrl } = await startOrder({
      app,
      token,
      origin,
      request: { item: body.item, quantity: body.quantity, details: body.details, returnPath: body.returnPath },
    })
    return NextResponse.json({ checkoutUrl })
  } catch (error) {
    if (error instanceof OrderError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof PricingUnavailableError || error instanceof PricingAuthError) {
      console.error('[play/order] checkout unavailable:', error.message)
      return NextResponse.json({ error: 'Payments are temporarily unavailable. Try again later.' }, { status: 503 })
    }
    console.error('[play/order] POST failed:', error)
    return NextResponse.json({ error: 'Could not start checkout. Try again.' }, { status: 500 })
  }
}
