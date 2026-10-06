import { formatAppPrice, gatesAction, gatesWholeApp, takesOrders, type PaywallState } from '../appAccess'
import type { PaymentSettings } from './check'
import type { PaymentModeKey, PaymentSetup } from './types'

type AppPayments = PaywallState & {
  priceCurrency?: string | null
  priceInterval?: 'one_time' | 'month' | 'year' | null
  paymentSetup?: PaymentSetup | null
}

/** The mode that is actually in force: a switched-on price with nothing behind it is free. */
export function activeMode(app: AppPayments): PaymentModeKey {
  if (takesOrders(app)) return 'order'
  if (gatesAction(app)) return 'action'
  if (gatesWholeApp(app)) return 'app'
  return 'free'
}

export function paymentSettings(app: AppPayments): PaymentSettings {
  const mode = activeMode(app)
  return {
    mode,
    price: mode === 'free' ? null : formatAppPrice(app.priceAmount ?? null, app.priceCurrency ?? 'usd', mode === 'order' ? 'one_time' : app.priceInterval ?? null),
    setup: app.paymentSetup ?? null,
  }
}

/** A fingerprint of the settings a review was made against. */
export function settingsKey(settings: PaymentSettings): string {
  return JSON.stringify([settings.mode, settings.price, settings.setup ?? null])
}

/** A short, stable hash of code, so a review of an older build is recognizable. */
export function codeHash(code: string | null | undefined): string {
  let h = 2166136261
  const s = code || ''
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36) + ':' + s.length
}

/**
 * kanthinkPay for the owner's own draft preview: starts unpaid so they see what a
 * buyer sees, and unlock()/order() complete in place without charging anyone.
 */
export function previewPay(app: AppPayments) {
  const mode = activeMode(app)
  if (mode === 'action') {
    return {
      mode: 'action' as const,
      entitled: false,
      price: formatAppPrice(app.priceAmount ?? null, app.priceCurrency ?? 'usd', app.priceInterval ?? null),
      recurring: app.priceInterval === 'month' || app.priceInterval === 'year',
      preview: true,
    }
  }
  if (mode === 'order') {
    return {
      mode: 'order' as const,
      entitled: false,
      price: formatAppPrice(app.priceAmount ?? null, app.priceCurrency ?? 'usd', 'one_time'),
      recurring: false,
      preview: true,
      lastOrder: null,
    }
  }
  return null
}
