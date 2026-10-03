import { NextResponse } from 'next/server'
import { inArray } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { playgroundApps } from '@/lib/db/schema'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { ordersForOwner } from '@/lib/playground/orders'

export const runtime = 'nodejs'

/**
 * Everything sold across the signed-in owner's apps, newest first, grouped by app.
 * What the Orders orb on Home shows: paid orders waiting to be fulfilled first.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try {
    await ensureSchema()
    const orders = await ordersForOwner(session.user.id)
    const appIds = [...new Set(orders.map((o) => o.appId))]
    const apps = appIds.length
      ? await db.query.playgroundApps.findMany({
          where: inArray(playgroundApps.id, appIds),
          columns: { id: true, title: true, cardId: true, channelId: true, thumbnailUrl: true },
        })
      : []
    const groups = apps
      .map((app) => {
        const mine = orders.filter((o) => o.appId === app.id)
        return {
          app,
          toFulfil: mine.filter((o) => o.status === 'paid').length,
          orders: mine.map((o) => ({
            id: o.id,
            number: o.number,
            item: o.item,
            quantity: o.quantity,
            amount: o.amount,
            currency: o.currency,
            status: o.status,
            buyerName: o.buyerName,
            buyerEmail: o.buyerEmail,
            buyerPhone: o.buyerPhone,
            buyerNote: o.buyerNote,
            paidAt: o.paidAt?.toISOString() ?? null,
          })),
        }
      })
      .sort((a, b) => b.toFulfil - a.toFulfil)
    return NextResponse.json({ groups })
  } catch (error) {
    console.error('[orders] GET failed:', error)
    return NextResponse.json({ error: 'Could not load orders' }, { status: 500 })
  }
}
