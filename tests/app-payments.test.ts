/**
 * When a published app's buyer gets access, and when they lose it.
 *
 * Money and access are the part of the playground where a quiet mistake costs
 * someone: a publisher giving away what was never paid for, or a buyer locked out.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/notifications/createNotification', () => ({ createNotification: vi.fn() }))
vi.mock('@/lib/emails/send', () => ({ sendAppPurchasedEmail: vi.fn() }))

import { checkoutIsPaid, checkoutInterval } from '@/lib/playground/appPurchase'
import { keepaliveJson } from '@/lib/api/keepaliveJson'

describe('checkoutIsPaid', () => {
  it('grants on a paid checkout, or one that needed no payment', () => {
    expect(checkoutIsPaid({ payment_status: 'paid' })).toBe(true)
    expect(checkoutIsPaid({ payment_status: 'no_payment_required' })).toBe(true)
  })

  it('does not grant on a bank payment that is still settling', () => {
    // Stripe marks these checkouts complete while the money is pending.
    expect(checkoutIsPaid({ payment_status: 'unpaid' })).toBe(false)
    expect(checkoutIsPaid({})).toBe(false)
  })
})

describe('checkoutInterval', () => {
  it('reads the interval the checkout was created for', () => {
    expect(checkoutInterval({ mode: 'payment' })).toBe('one_time')
    expect(checkoutInterval({ mode: 'subscription', metadata: { kanthinkInterval: 'year' } })).toBe('year')
    expect(checkoutInterval({ mode: 'subscription', metadata: {} })).toBe('month')
  })
})

describe('keepaliveJson', () => {
  it('sends headers at once and the body when the work finishes, still parseable as JSON', async () => {
    const res = keepaliveJson(async () => { await new Promise((r) => setTimeout(r, 30)); return { ok: 1 } }, 5)
    expect(res.headers.get('content-type')).toBe('application/json')
    const text = await res.text()
    expect(text.startsWith(' ')).toBe(true)
    expect(JSON.parse(text)).toEqual({ ok: 1 })
  })

  it('turns a failure into an error body', async () => {
    const res = keepaliveJson(async () => { throw new Error('boom') })
    expect(await res.json()).toEqual({ error: 'boom' })
  })
})
