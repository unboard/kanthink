/**
 * Two purchases, one email address.
 *
 * The defect these exist for: a purchase was a set of fields on the customer row, so
 * buying the same app twice under one address meant the second purchase overwrote
 * the first's subscription id — leaving a live Stripe subscription that nothing here
 * could cancel — and refunding either one revoked access for both.
 *
 * A purchase is its own row now, and a session granted by a purchase names it. These
 * pin the access decisions that follow from that; the round trip through the database
 * is exercised separately against a scratch database.
 */
import { describe, it, expect } from 'vitest'
import {
  hasActiveAccess,
  isPurchaseActive,
  signAccessToken,
  verifyAccessToken,
  type PurchaseRef,
} from '../lib/playground/appAccess'

const paidApp = { paywallEnabled: true, priceAmount: 400, stripePriceId: 'price_1' }

const MEMBER = 'member-shared-email'
const FIRST = 'purchase-first'
const SECOND = 'purchase-second'

const active = (id: string): PurchaseRef => ({ id, status: 'active' })
const refunded = (id: string): PurchaseRef => ({ id, status: 'refunded' })
const canceled = (id: string): PurchaseRef => ({ id, status: 'canceled' })

const sessionFor = (purchaseId: string) =>
  verifyAccessToken(signAccessToken(MEMBER, 0, 'purchase', purchaseId))
const verifiedSession = verifyAccessToken(signAccessToken(MEMBER, 0, 'verified'))

describe('a purchase session is access to the purchase, not to the address', () => {
  const both = [active(FIRST), active(SECOND)]

  it('lets each purchase in on its own', () => {
    expect(hasActiveAccess(paidApp, sessionFor(FIRST), both)).toBe(true)
    expect(hasActiveAccess(paidApp, sessionFor(SECOND), both)).toBe(true)
  })

  it('refuses a session naming a purchase that is not there', () => {
    expect(hasActiveAccess(paidApp, sessionFor('purchase-invented'), both)).toBe(false)
  })

  it('refuses a purchase session that names nothing', () => {
    // A purchase-scope token with no reference is malformed intent, not a wildcard.
    const vague = verifyAccessToken(signAccessToken(MEMBER, 0, 'purchase', null))
    expect(hasActiveAccess(paidApp, vague, both)).toBe(false)
  })
})

describe('refunding one purchase leaves the other alone', () => {
  // The demonstration: two purchases, same email, one refunded.
  const afterRefund = [refunded(FIRST), active(SECOND)]

  it('locks out the refunded purchase', () => {
    expect(hasActiveAccess(paidApp, sessionFor(FIRST), afterRefund)).toBe(false)
  })

  it('leaves the surviving purchase working', () => {
    expect(hasActiveAccess(paidApp, sessionFor(SECOND), afterRefund)).toBe(true)
  })

  it('does not let the refunded session borrow the survivor’s access', () => {
    // The heart of it. Both purchases share an email, so the old code would have
    // seen one 'paid' customer and let this session straight back in.
    const refundedSession = sessionFor(FIRST)
    expect(refundedSession?.purchaseId).toBe(FIRST)
    expect(hasActiveAccess(paidApp, refundedSession, afterRefund)).toBe(false)
  })

  it('keeps the verified customer in, because they still hold a live purchase', () => {
    expect(hasActiveAccess(paidApp, verifiedSession, afterRefund)).toBe(true)
  })
})

describe('cancelling one subscription leaves the other alone', () => {
  const afterCancel = [canceled(FIRST), active(SECOND)]

  it('ends only the cancelled purchase', () => {
    expect(hasActiveAccess(paidApp, sessionFor(FIRST), afterCancel)).toBe(false)
    expect(hasActiveAccess(paidApp, sessionFor(SECOND), afterCancel)).toBe(true)
  })
})

describe('once nothing is live, nobody is', () => {
  const allGone = [refunded(FIRST), canceled(SECOND)]

  it('locks out every purchase session', () => {
    expect(hasActiveAccess(paidApp, sessionFor(FIRST), allGone)).toBe(false)
    expect(hasActiveAccess(paidApp, sessionFor(SECOND), allGone)).toBe(false)
  })

  it('locks out the verified customer too', () => {
    // Verification proves who they are, not that they are entitled to anything.
    expect(hasActiveAccess(paidApp, verifiedSession, allGone)).toBe(false)
  })

  it('locks out a verified customer who never bought anything', () => {
    expect(hasActiveAccess(paidApp, verifiedSession, [])).toBe(false)
  })
})

describe('a subscription that has lapsed', () => {
  const past = new Date(Date.now() - 60_000)
  const future = new Date(Date.now() + 60_000)

  it('is not active once its period has run out', () => {
    expect(isPurchaseActive({ id: FIRST, status: 'active', accessExpiresAt: past })).toBe(false)
  })

  it('is active while the period is still running', () => {
    expect(isPurchaseActive({ id: FIRST, status: 'active', accessExpiresAt: future })).toBe(true)
  })

  it('never lapses when there is no expiry, which is a one-time purchase', () => {
    expect(isPurchaseActive({ id: FIRST, status: 'active' })).toBe(true)
  })

  it('does not take a sibling down with it', () => {
    const mixed = [
      { id: FIRST, status: 'active' as const, accessExpiresAt: past },
      { id: SECOND, status: 'active' as const },
    ]
    expect(hasActiveAccess(paidApp, sessionFor(FIRST), mixed)).toBe(false)
    expect(hasActiveAccess(paidApp, sessionFor(SECOND), mixed)).toBe(true)
    expect(hasActiveAccess(paidApp, verifiedSession, mixed)).toBe(true)
  })
})

describe('a purchase session still proves nothing about the inbox', () => {
  it('does not gain thread access by naming a live purchase', async () => {
    const { canReadPrivateData } = await import('../lib/playground/appAccess')
    expect(canReadPrivateData(sessionFor(FIRST))).toBe(false)
    expect(canReadPrivateData(verifiedSession)).toBe(true)
  })
})
