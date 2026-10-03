import { checkPayments, type PaymentSettings } from './check'
import { codeHash, paymentSettings, settingsKey } from './settings'
import type { Fulfilment, PaymentFinding, PaymentReview, PaymentSetup } from './types'

/**
 * Everything the Access section shows about payments, in one place: the settings in
 * force, what the code check found, Kan's read if it's current, and what the owner
 * still needs to answer. Pure, so the drawer computes it as the code changes.
 */

type App = Parameters<typeof paymentSettings>[0] & {
  code?: string | null
  paymentReview?: PaymentReview | null
}

export type PaymentStatus = {
  settings: PaymentSettings
  findings: PaymentFinding[]
  /** Kan's read, when it was made against this code and these settings. */
  review: PaymentReview | null
  /** A review exists but the code or settings changed since. */
  stale: boolean
  /** Setup the owner hasn't given yet, as questions. */
  missing: string[]
}

export function paymentStatus(app: App): PaymentStatus {
  const settings = paymentSettings(app)
  const findings = checkPayments(app.code, settings)
  const r = app.paymentReview ?? null
  const current = !!r && r.codeHash === codeHash(app.code) && r.settingsKey === settingsKey(settings)
  const missing: string[] = []
  const setup = settings.setup ?? {}
  if (settings.mode === 'order') {
    if (!setup.fulfilment) missing.push('How do buyers get their order?')
    else if ((setup.fulfilment === 'pickup' || setup.fulfilment === 'contact') && !setup.fulfilmentNote) missing.push(setup.fulfilment === 'pickup' ? 'Where and when is pickup?' : 'What should buyers expect after ordering?')
  }
  if (settings.mode === 'action' && !setup.paidAction) missing.push('What costs money?')

  const seen = new Set(findings.map((f) => f.title))
  const all = current ? [...findings, ...(r!.issues ?? []).filter((i) => !seen.has(i.title))] : findings
  return { settings, findings: all, review: current ? r : null, stale: !!r && !current, missing }
}

export const FULFILMENTS: { id: Fulfilment; label: string; hint: string }[] = [
  { id: 'pickup', label: 'Pickup', hint: 'They collect it from you' },
  { id: 'shipping', label: 'Shipping', hint: 'Checkout asks for an address' },
  { id: 'digital', label: 'Digital', hint: 'Delivered in the app or by email' },
  { id: 'contact', label: 'I\'ll contact them', hint: 'You arrange it after ordering' },
]

/** Owner input made safe. */
export function cleanSetup(input: unknown, previous?: PaymentSetup | null): PaymentSetup {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) || null : null)
  const merged = { ...(previous ?? {}), ...raw } as Record<string, unknown>
  const fulfilment = FULFILMENTS.some((f) => f.id === merged.fulfilment) ? (merged.fulfilment as Fulfilment) : null
  const max = Math.floor(Number(merged.maxQuantity))
  return {
    fulfilment,
    fulfilmentNote: text(merged.fulfilmentNote, 300),
    collectPhone: merged.collectPhone === true,
    collectNote: merged.collectNote === true,
    noteLabel: text(merged.noteLabel, 50),
    maxQuantity: Number.isFinite(max) && max >= 1 ? Math.min(max, 50) : 1,
    paidAction: text(merged.paidAction, 300),
  }
}
