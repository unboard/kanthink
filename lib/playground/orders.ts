import type Stripe from 'stripe'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { appOrders, playgroundApps } from '@/lib/db/schema'
import { stripe } from '@/lib/stripe'
import { createNotification } from '@/lib/notifications/createNotification'
import { formatAppPrice, takesOrders } from './appAccess'
import { PricingUnavailableError } from './appPricing'
import { findAppOwnerId } from './publicApp'

/**
 * Orders: a shop built in the app builder selling items one checkout at a time.
 *
 * The app names what is being bought; the server decides what it costs. Stripe
 * Checkout collects who is buying (name, email, and phone or address when the owner
 * asked), so the app never builds a contact form of its own. The buyer comes back to
 * the page they ordered from, which shows the confirmation from the order itself.
 */

export type AppRow = typeof playgroundApps.$inferSelect
export type OrderRow = typeof appOrders.$inferSelect

export { OrderError, cleanOrderRequest, type OrderRequest, type CleanOrder } from './payments/orderRequest'
import { OrderError, cleanOrderRequest, type OrderRequest } from './payments/orderRequest'

async function nextNumber(appId: string): Promise<number> {
  const row = await db.select({ n: sql<number>`coalesce(max(${appOrders.number}), 0)` }).from(appOrders).where(eq(appOrders.appId, appId))
  return (row[0]?.n ?? 0) + 1
}

/** Make the order and its checkout. Returns where to send the buyer. */
export async function startOrder(opts: { app: AppRow; token: string; origin: string; request: OrderRequest }): Promise<{ checkoutUrl: string; orderId: string }> {
  const { app, token, origin } = opts
  if (!takesOrders(app)) throw new OrderError('This app is not taking orders right now.', 409)
  if (!stripe) throw new PricingUnavailableError()

  const setup = app.paymentSetup ?? null
  const order = cleanOrderRequest(opts.request, token, setup)
  const unit = app.priceAmount!
  const currency = (app.priceCurrency || 'usd').toLowerCase()
  const ownerId = await findAppOwnerId(app)

  const id = crypto.randomUUID()
  const now = new Date()
  await db.insert(appOrders).values({
    id,
    appId: app.id,
    ownerId,
    number: await nextNumber(app.id),
    item: order.item,
    quantity: order.quantity,
    details: order.details,
    amount: unit * order.quantity,
    currency,
    status: 'pending',
    returnPath: order.returnPath,
    createdAt: now,
    updatedAt: now,
  })

  const customFields: Stripe.Checkout.SessionCreateParams.CustomField[] = [
    { key: 'buyername', label: { type: 'custom', custom: 'Your name' }, type: 'text' },
  ]
  if (setup?.collectNote) {
    customFields.push({
      key: 'buyernote',
      label: { type: 'custom', custom: (setup.noteLabel || 'Anything we should know?').slice(0, 50) },
      type: 'text',
      optional: true,
    })
  }

  // What the buyer reads under the item. Details are the app's own ids and choices,
  // kept on the order for the owner, and are no business of the checkout page.
  const describe = (setup?.fulfilmentNote || '').slice(0, 500)

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      quantity: order.quantity,
      price_data: {
        currency,
        unit_amount: unit,
        product_data: { name: order.item, ...(describe ? { description: describe } : {}) },
      },
    }],
    custom_fields: customFields,
    ...(setup?.collectPhone ? { phone_number_collection: { enabled: true } } : {}),
    ...(setup?.fulfilment === 'shipping' ? { shipping_address_collection: { allowed_countries: ['US', 'CA'] } } : {}),
    ...(setup?.fulfilmentNote ? { custom_text: { submit: { message: setup.fulfilmentNote.slice(0, 1000) } } } : {}),
    success_url: `${origin}/api/play/${token}/order/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${order.returnPath}`,
    metadata: { kanthinkAppId: app.id, kanthinkOrderId: id },
    payment_intent_data: { metadata: { kanthinkAppId: app.id, kanthinkOrderId: id } },
  })

  await db.update(appOrders).set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() }).where(eq(appOrders.id, id))
  if (!session.url) throw new OrderError('Could not start checkout.', 502)
  return { checkoutUrl: session.url, orderId: id }
}

function field(session: Stripe.Checkout.Session, key: string): string | null {
  const f = session.custom_fields?.find((c) => c.key === key)
  return f?.text?.value?.trim() || null
}

/**
 * Record a paid checkout against its order. Idempotent: the redirect and the
 * webhook both call it, and only the first one to see it paid notifies the owner.
 */
export async function markOrderPaid(session: Stripe.Checkout.Session): Promise<OrderRow | null> {
  const orderId = session.metadata?.kanthinkOrderId
  if (!orderId) return null
  const order = await db.query.appOrders.findFirst({ where: eq(appOrders.id, orderId) })
  if (!order) return null
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return order
  if (order.status !== 'pending') return order

  const details = session.customer_details
  const shippingSource = (session as unknown as { collected_information?: { shipping_details?: { name?: string; address?: Stripe.Address } }; shipping_details?: { name?: string; address?: Stripe.Address } })
  const ship = shippingSource.collected_information?.shipping_details ?? shippingSource.shipping_details ?? null
  const shipping = ship?.address
    ? Object.fromEntries(Object.entries({ name: ship.name, ...ship.address }).filter(([, v]) => !!v).map(([k, v]) => [k, String(v)]))
    : null

  // Only a pending order moves to paid, so a redelivered event can't notify twice.
  const result = await db.update(appOrders).set({
    status: 'paid',
    buyerEmail: details?.email ?? null,
    buyerName: field(session, 'buyername') || details?.name || null,
    buyerPhone: details?.phone ?? null,
    buyerNote: field(session, 'buyernote'),
    shipping,
    stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    amount: session.amount_total ?? order.amount,
    paidAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(appOrders.id, order.id), eq(appOrders.status, 'pending'))).returning({ id: appOrders.id })

  const updated = await db.query.appOrders.findFirst({ where: eq(appOrders.id, order.id) })
  if (result.length > 0 && updated) await notifyOwner(updated)
  return updated ?? null
}

async function notifyOwner(order: OrderRow) {
  const app = await db.query.playgroundApps.findFirst({
    where: eq(playgroundApps.id, order.appId),
    columns: { id: true, title: true, cardId: true, channelId: true },
  })
  if (!app) return
  const who = order.buyerName || order.buyerEmail || 'Someone'
  await createNotification({
    userId: order.ownerId,
    type: 'app_order',
    title: `Order #${order.number} in ${app.title}`,
    body: `${who} ordered ${order.quantity > 1 ? `${order.quantity} × ` : ''}${order.item} · ${formatAppPrice(order.amount, order.currency, null)}`,
    data: { appId: app.id, cardId: app.cardId, channelId: app.channelId, orderId: order.id, kind: 'app_order' },
  }).catch(() => {})
}

/** A refunded payment marks its order refunded. */
export async function refundOrderByIntent(paymentIntentId: string): Promise<boolean> {
  const order = await db.query.appOrders.findFirst({ where: eq(appOrders.stripePaymentIntentId, paymentIntentId) })
  if (!order) return false
  await db.update(appOrders).set({ status: 'refunded', updatedAt: new Date() }).where(eq(appOrders.id, order.id))
  return true
}

/** What the app sees as kanthinkPay.lastOrder after the buyer returns. */
export type LastOrder = {
  id: string
  number: number
  item: string
  quantity: number
  amount: string
  status: 'paid'
  details: Record<string, string> | null
  fulfilmentNote: string | null
  preview?: boolean
}

/**
 * The order a returning buyer just paid for, if the id in the URL is a paid order
 * of this app. Only recent orders count, so an old link doesn't re-show a
 * confirmation forever.
 */
export async function returnedOrder(app: AppRow, orderId: string | undefined | null): Promise<LastOrder | null> {
  if (!orderId || !/^[0-9a-f-]{36}$/.test(orderId)) return null
  const order = await db.query.appOrders.findFirst({ where: and(eq(appOrders.id, orderId), eq(appOrders.appId, app.id)) })
  if (!order || order.status === 'pending' || order.status === 'canceled' || order.status === 'refunded') return null
  if (!order.paidAt || Date.now() - order.paidAt.getTime() > 6 * 60 * 60 * 1000) return null
  return {
    id: order.id,
    number: order.number,
    item: order.item,
    quantity: order.quantity,
    amount: formatAppPrice(order.amount, order.currency, null),
    status: 'paid',
    details: order.details ?? null,
    fulfilmentNote: app.paymentSetup?.fulfilmentNote ?? null,
  }
}

export async function listOrders(appId: string, limit = 200): Promise<OrderRow[]> {
  return db.query.appOrders.findMany({
    where: eq(appOrders.appId, appId),
    orderBy: [desc(appOrders.createdAt)],
    limit,
  })
}

export async function setOrderStatus(appId: string, orderId: string, status: 'fulfilled' | 'paid' | 'canceled'): Promise<OrderRow | null> {
  const order = await db.query.appOrders.findFirst({ where: and(eq(appOrders.id, orderId), eq(appOrders.appId, appId)) })
  if (!order) return null
  // Pending checkouts never paid; marking one fulfilled would invent a sale.
  if (order.status === 'pending' && status !== 'canceled') throw new OrderError('That order was never paid.')
  if (order.status === 'refunded') throw new OrderError('That order was refunded.')
  await db.update(appOrders).set({
    status,
    fulfilledAt: status === 'fulfilled' ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(appOrders.id, order.id))
  return (await db.query.appOrders.findFirst({ where: eq(appOrders.id, order.id) })) ?? null
}
