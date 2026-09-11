import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { playgroundApps } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import {
  PricingAuthError,
  PricingUnavailableError,
  syncAppPrice,
  validatePriceInput,
} from '@/lib/playground/appPricing'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ appId: string }>
}

/**
 * What a published app charges.
 *
 * PUT with `enabled: false` switches the paywall off without touching Stripe — the
 * product and price stay, so turning it back on later does not mint duplicates and
 * does not disturb anyone already subscribed.
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { appId } = await params
  let body: {
    enabled?: boolean
    amount?: number
    currency?: string
    interval?: 'one_time' | 'month' | 'year'
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    await ensureSchema()
    const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
    if (!app) return NextResponse.json({ error: 'App not found' }, { status: 404 })
    await requirePermission(app.channelId, session.user.id, 'edit')

    if (body.enabled === false) {
      await db.update(playgroundApps)
        .set({ paywallEnabled: false, updatedAt: new Date() })
        .where(eq(playgroundApps.id, appId))
      const off = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
      return NextResponse.json({ app: off })
    }

    const price = validatePriceInput({
      amount: body.amount,
      currency: body.currency,
      interval: body.interval,
    })

    const { productId, priceId } = await syncAppPrice(app, price)

    await db.update(playgroundApps).set({
      paywallEnabled: true,
      priceAmount: price.amount,
      priceCurrency: price.currency,
      priceInterval: price.interval,
      stripeProductId: productId,
      stripePriceId: priceId,
      updatedAt: new Date(),
    }).where(eq(playgroundApps.id, appId))

    const updated = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
    return NextResponse.json({ app: updated })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof PricingUnavailableError || error instanceof PricingAuthError) {
      // 502, not 500: the failure is upstream at Stripe, and the message says so
      // rather than leaving someone re-typing a price that was never wrong.
      return NextResponse.json({ error: error.message }, { status: 502 })
    }
    // validatePriceInput throws messages written for the person typing the price.
    if (error instanceof Error && /price|currency|billing/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[playground/apps/:id/pricing] PUT failed:', error)
    return NextResponse.json({ error: 'Failed to save the price' }, { status: 500 })
  }
}
