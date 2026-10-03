import type { PaymentSetup } from './types'

/** Validating what a shop's buy button sent. Pure, so it is tested without a database. */

export class OrderError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
    this.name = 'OrderError'
  }
}

export type OrderRequest = {
  item: unknown
  quantity?: unknown
  details?: unknown
  /** Path on this site the buyer ordered from, e.g. /play/abc/r/xyz. */
  returnPath?: unknown
}

export type CleanOrder = { item: string; quantity: number; details: Record<string, string> | null; returnPath: string }

/** Validate what the app sent. The app runs in the buyer's browser, so none of it is trusted. */
export function cleanOrderRequest(req: OrderRequest, token: string, setup: PaymentSetup | null | undefined): CleanOrder {
  const item = typeof req.item === 'string' ? req.item.replace(/\s+/g, ' ').trim().slice(0, 120) : ''
  if (!item) throw new OrderError('Say what is being ordered: kanthinkPay.order({ item }).')

  const max = Math.min(Math.max(setup?.maxQuantity ?? 1, 1), 50)
  const q = Math.floor(Number(req.quantity ?? 1))
  if (!Number.isFinite(q) || q < 1) throw new OrderError('Quantity must be at least 1.')
  if (q > max) throw new OrderError(max === 1 ? 'This shop takes one item per order.' : `At most ${max} per order.`)

  let details: Record<string, string> | null = null
  if (req.details && typeof req.details === 'object' && !Array.isArray(req.details)) {
    const entries = Object.entries(req.details as Record<string, unknown>)
      .filter(([k, v]) => /^[\w .-]{1,40}$/.test(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
      .slice(0, 12)
      .map(([k, v]) => [k, String(v).slice(0, 300)] as const)
    if (entries.length) details = Object.fromEntries(entries)
  }

  // Only ever back to this app's own pages on this site.
  const path = typeof req.returnPath === 'string' ? req.returnPath : ''
  const returnPath = path.startsWith(`/play/${token}`) && !/[\s<>"'\\]/.test(path) && path.length < 300
    ? path.replace(/[?#].*$/, '')
    : `/play/${token}`

  return { item, quantity: q, details, returnPath }
}

