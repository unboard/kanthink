import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { playgroundApps } from '@/lib/db/schema'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { listOrders, OrderError, setOrderStatus } from '@/lib/playground/orders'

export const runtime = 'nodejs'

/**
 * A shop's orders, for its owner. GET lists them; PATCH { orderId, status } marks
 * one fulfilled (or back to paid, or canceled when it was never paid).
 */
async function load(appId: string, userId: string, level: 'view' | 'edit') {
  const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId), columns: { id: true, channelId: true } })
  if (!app) return null
  await requirePermission(app.channelId, userId, level)
  return app
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ appId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { appId } = await params
  try {
    await ensureSchema()
    if (!(await load(appId, session.user.id, 'view'))) return NextResponse.json({ error: 'App not found' }, { status: 404 })
    // Abandoned checkouts are noise for someone fulfilling orders.
    const orders = (await listOrders(appId)).filter((o) => o.status !== 'pending' || Date.now() - (o.createdAt?.getTime() ?? 0) < 60 * 60 * 1000)
    return NextResponse.json({ orders })
  } catch (error) {
    if (error instanceof PermissionError) return NextResponse.json({ error: error.message }, { status: 403 })
    console.error('[playground/apps/:id/orders] GET failed:', error)
    return NextResponse.json({ error: 'Could not load orders' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ appId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { appId } = await params
  let body: { orderId?: string; status?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.orderId || !['fulfilled', 'paid', 'canceled'].includes(body.status || '')) {
    return NextResponse.json({ error: 'orderId and a status are required' }, { status: 400 })
  }
  try {
    await ensureSchema()
    if (!(await load(appId, session.user.id, 'edit'))) return NextResponse.json({ error: 'App not found' }, { status: 404 })
    const order = await setOrderStatus(appId, body.orderId, body.status as 'fulfilled' | 'paid' | 'canceled')
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    return NextResponse.json({ order })
  } catch (error) {
    if (error instanceof PermissionError) return NextResponse.json({ error: error.message }, { status: 403 })
    if (error instanceof OrderError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[playground/apps/:id/orders] PATCH failed:', error)
    return NextResponse.json({ error: 'Could not update the order' }, { status: 500 })
  }
}
