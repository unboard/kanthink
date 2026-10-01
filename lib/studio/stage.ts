/**
 * Where a person stands with one of your apps, and how they got there.
 *
 * Derived from facts already on the app_users row rather than stored, so nothing
 * has to remember to update it: reserving sets reservedAt, proving an address in
 * the app sets verifiedAt, a purchase sets status. The stage is whatever those
 * say right now.
 */

export type PersonStage = 'prospect' | 'using' | 'customer' | 'lapsed'

export interface StageFacts {
  status: 'free' | 'paid' | 'refunded' | 'canceled'
  verifiedAt?: Date | null
  reservedAt?: Date | null
  paidAt?: Date | null
  createdAt?: Date | null
  unsubscribedAt?: Date | null
  amountPaid?: number | null
  currency?: string | null
}

export const STAGE_LABEL: Record<PersonStage, string> = {
  prospect: 'Prospect',
  using: 'Using',
  customer: 'Customer',
  lapsed: 'Lapsed',
}

export function personStage(m: StageFacts): PersonStage {
  if (m.status === 'paid') return 'customer'
  if (m.status === 'refunded' || m.status === 'canceled') return 'lapsed'
  if (m.verifiedAt) return 'using'
  return 'prospect'
}

export interface StageEvent {
  at: Date
  text: string
}

function money(minor?: number | null, currency?: string | null) {
  if (minor == null) return ''
  const amount = minor / 100
  const symbol = (currency || 'usd').toLowerCase() === 'usd' ? '$' : `${(currency || '').toUpperCase()} `
  return `${symbol}${Number.isInteger(amount) ? amount : amount.toFixed(2)}`
}

/**
 * The moments their stage changed, oldest first, for the conversation thread.
 * Each names the stage it moved to, so the thread reads as a history.
 */
export function stageEvents(m: StageFacts, appTitle: string): StageEvent[] {
  const events: StageEvent[] = []
  if (m.reservedAt) {
    events.push({ at: m.reservedAt, text: `Reserved ${appTitle} on its test page. Prospect` })
  } else if (m.createdAt) {
    events.push({ at: m.createdAt, text: `Gave their email in ${appTitle}. Prospect` })
  }
  if (m.verifiedAt) {
    events.push({ at: m.verifiedAt, text: 'Proved their email in the app. Prospect → Using' })
  }
  if (m.paidAt) {
    const paid = money(m.amountPaid, m.currency)
    events.push({ at: m.paidAt, text: `Paid${paid ? ` ${paid}` : ''}. → Customer` })
  }
  if (m.unsubscribedAt) {
    events.push({ at: m.unsubscribedAt, text: 'Asked not to be emailed about this app' })
  }
  return events.sort((a, b) => a.at.getTime() - b.at.getTime())
}
