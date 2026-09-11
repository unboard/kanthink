/**
 * Setting a price on a published app.
 *
 * Written after a live report that "setting a price just errors". The price was
 * fine; the deployment's Stripe key had been revoked, and every failure mode —
 * a dead key, a bad amount, a network blip — surfaced as the same unhelpful
 * "Could not save the price". These tests pin the distinction.
 */
import { describe, it, expect } from 'vitest'
import { stripeFailureMessage, validatePriceInput } from '../lib/playground/appPricing'
import { formatAppPrice, isPaywalled, hasActiveAccess } from '../lib/playground/appAccess'

describe('stripeFailureMessage', () => {
  it('names a revoked key by its type', () => {
    const message = stripeFailureMessage({ type: 'StripeAuthenticationError', message: 'nope' })
    expect(message).toMatch(/STRIPE_SECRET_KEY/)
  })

  it('recognises the message Stripe actually sends for a dead key', () => {
    // Verbatim shape of what the live account returned.
    const err = new Error('Invalid API Key provided: sk_live_****fr6.')
    expect(stripeFailureMessage(err)).toMatch(/rotated or revoked/)
  })

  it('separates a permissions problem from an auth one', () => {
    expect(stripeFailureMessage({ type: 'StripePermissionError', message: '' }))
      .toMatch(/permission/)
  })

  it('treats a connection blip as temporary', () => {
    expect(stripeFailureMessage({ type: 'StripeConnectionError', message: '' }))
      .toMatch(/try again/i)
  })

  it('stays out of the way of errors about the request itself', () => {
    // A bad amount is the caller's problem and already has a good message.
    expect(stripeFailureMessage(new Error('Invalid integer: -1'))).toBeNull()
    expect(stripeFailureMessage({ type: 'StripeInvalidRequestError', message: 'bad currency' })).toBeNull()
  })

  it('survives whatever it is handed', () => {
    expect(stripeFailureMessage(null)).toBeNull()
    expect(stripeFailureMessage(undefined)).toBeNull()
    expect(stripeFailureMessage('a string')).toBeNull()
  })
})

describe('validatePriceInput', () => {
  it('accepts an ordinary price', () => {
    expect(validatePriceInput({ amount: 400, currency: 'usd', interval: 'one_time' }))
      .toEqual({ amount: 400, currency: 'usd', interval: 'one_time' })
  })

  it('defaults to a one-time charge in dollars', () => {
    expect(validatePriceInput({ amount: 400 })).toEqual({
      amount: 400, currency: 'usd', interval: 'one_time',
    })
  })

  it('rejects an amount below what Stripe will charge', () => {
    expect(() => validatePriceInput({ amount: 10 })).toThrow(/at least/)
  })

  it('rejects a missing amount rather than charging zero', () => {
    expect(() => validatePriceInput({})).toThrow(/at least/)
    expect(() => validatePriceInput({ amount: NaN })).toThrow(/at least/)
  })

  it('catches a typo before it reaches a customer', () => {
    expect(() => validatePriceInput({ amount: 500_000_00 })).toThrow(/typo/)
  })

  it('rejects a currency that is not a currency', () => {
    expect(() => validatePriceInput({ amount: 400, currency: 'dollars' })).toThrow(/three-letter/)
  })

  it('normalises the currency case, because Stripe wants it lower', () => {
    expect(validatePriceInput({ amount: 400, currency: 'GBP' }).currency).toBe('gbp')
  })
})

describe('free apps stay free', () => {
  it('is not paywalled without all three of flag, price and Stripe price id', () => {
    expect(isPaywalled({ paywallEnabled: false })).toBe(false)
    expect(isPaywalled({ paywallEnabled: true })).toBe(false)
    expect(isPaywalled({ paywallEnabled: true, priceAmount: 400 })).toBe(false)
    expect(isPaywalled({ paywallEnabled: true, priceAmount: 400, stripePriceId: 'price_1' })).toBe(true)
  })

  it('lets anyone in when it is not paywalled', () => {
    expect(hasActiveAccess({ paywallEnabled: false }, null)).toBe(true)
  })

  it('says Free rather than a zero price', () => {
    expect(formatAppPrice(null, 'usd', null)).toBe('Free')
    expect(formatAppPrice(0, 'usd', null)).toBe('Free')
  })

  it('spells a recurring price so a buyer knows it recurs', () => {
    expect(formatAppPrice(400, 'usd', 'month')).toBe('$4.00/mo')
    expect(formatAppPrice(400, 'usd', 'year')).toBe('$4.00/yr')
    expect(formatAppPrice(400, 'usd', 'one_time')).toBe('$4.00')
  })
})
