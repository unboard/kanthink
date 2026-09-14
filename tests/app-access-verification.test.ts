/**
 * Proving an email address before granting access.
 *
 * Written against a real vulnerability: access was granted on a typed email alone,
 * so knowing a customer's address was the same as being them — their paid app and
 * their private support thread. These are the three demonstrations that the fix
 * actually closes it, plus the rate limits that keep a six-digit code honest.
 */
import { describe, it, expect } from 'vitest'
import {
  canSendCode,
  checkCode,
  codeMatches,
  generateCode,
  hashCode,
  isVerified,
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  MAX_SENDS_PER_WINDOW,
  RESEND_COOLDOWN_MS,
  SEND_WINDOW_MS,
  type VerificationState,
} from '../lib/playground/appVerification'
import { hasActiveAccess, canReadPrivateData } from '../lib/playground/appAccess'

const paidApp = { paywallEnabled: true, priceAmount: 400, stripePriceId: 'price_1' }
const freeApp = { paywallEnabled: false }

describe('knowing someone’s email cannot grant access', () => {
  it('refuses a paid row that has never proved the address', () => {
    // Exactly the attack: the row is real and paid, the person typing is not them.
    const impostor = { status: 'paid' as const, verifiedAt: null }
    expect(hasActiveAccess(paidApp, impostor)).toBe(false)
  })

  it('lets the same row in the moment the address is proved', () => {
    const owner = { status: 'paid' as const, verifiedAt: new Date() }
    expect(hasActiveAccess(paidApp, owner)).toBe(true)
  })

  it('keeps the private thread shut to an unproved row, paid or not', () => {
    expect(canReadPrivateData({ status: 'paid', verifiedAt: null })).toBe(false)
    expect(canReadPrivateData({ status: 'free', verifiedAt: null })).toBe(false)
    expect(canReadPrivateData({ status: 'free', verifiedAt: new Date() })).toBe(true)
  })

  it('still opens a free app to everybody', () => {
    // Verification gates private data, not the front door of a free app.
    expect(hasActiveAccess(freeApp, null)).toBe(true)
    expect(hasActiveAccess(freeApp, { status: 'free', verifiedAt: null })).toBe(true)
  })
})

describe('sessions granted before verification existed stop working', () => {
  it('rejects a paid row carried over with no verifiedAt', () => {
    // Every row written before this change looks exactly like this.
    const legacy = { status: 'paid' as const, verifiedAt: undefined }
    expect(hasActiveAccess(paidApp, legacy)).toBe(false)
    expect(canReadPrivateData(legacy)).toBe(false)
  })

  it('does not reject them for any other reason, so proving the address is enough', () => {
    const legacy: { status: 'paid'; verifiedAt: Date | null } = { status: 'paid', verifiedAt: null }
    expect(hasActiveAccess(paidApp, legacy)).toBe(false)
    // The only thing that changed is the proof.
    expect(hasActiveAccess(paidApp, { ...legacy, verifiedAt: new Date() })).toBe(true)
  })
})

describe('a genuine customer recovers their purchase without paying again', () => {
  const memberId = 'member-1'

  it('accepts the code that was mailed to them', () => {
    const code = generateCode()
    const state: VerificationState = {
      verificationCodeHash: hashCode(memberId, code),
      verificationExpiresAt: new Date(Date.now() + CODE_TTL_MS),
      verificationAttempts: 0,
    }
    expect(checkCode(memberId, code, state)).toBe('ok')
  })

  it('still has its paid status once proved, so nothing is charged again', () => {
    const recovered = { status: 'paid' as const, verifiedAt: new Date() }
    expect(hasActiveAccess(paidApp, recovered)).toBe(true)
  })

  it('tolerates a code typed with spaces or dashes', () => {
    const code = '418290'
    const state: VerificationState = {
      verificationCodeHash: hashCode(memberId, code),
      verificationExpiresAt: new Date(Date.now() + CODE_TTL_MS),
    }
    expect(checkCode(memberId, '418-290', state)).toBe('ok')
    expect(checkCode(memberId, '418 290', state)).toBe('ok')
  })
})

describe('the code itself', () => {
  it('is six digits, zero-padded', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateCode()).toMatch(/^\d{6}$/)
    }
  })

  it('is scoped to one member, so it cannot be replayed against another row', () => {
    const code = generateCode()
    const stored = hashCode('member-a', code)
    expect(codeMatches('member-a', code, stored)).toBe(true)
    expect(codeMatches('member-b', code, stored)).toBe(false)
  })

  it('is never stored in the clear', () => {
    const code = '123456'
    expect(hashCode('member-a', code)).not.toContain(code)
  })

  it('rejects a wrong code', () => {
    const state: VerificationState = {
      verificationCodeHash: hashCode('m', '111111'),
      verificationExpiresAt: new Date(Date.now() + CODE_TTL_MS),
    }
    expect(checkCode('m', '222222', state)).toBe('wrong')
  })

  it('expires', () => {
    const state: VerificationState = {
      verificationCodeHash: hashCode('m', '111111'),
      verificationExpiresAt: new Date(Date.now() - 1000),
    }
    expect(checkCode('m', '111111', state)).toBe('expired')
  })

  it('locks after five wrong guesses, so a million combinations stay a million', () => {
    const state: VerificationState = {
      verificationCodeHash: hashCode('m', '111111'),
      verificationExpiresAt: new Date(Date.now() + CODE_TTL_MS),
      verificationAttempts: MAX_ATTEMPTS,
    }
    // Even the right code is refused once the budget is spent.
    expect(checkCode('m', '111111', state)).toBe('locked')
  })

  it('refuses when no code was ever issued', () => {
    expect(checkCode('m', '111111', {})).toBe('no_code')
  })
})

describe('codes cannot be used to mailbomb an address', () => {
  const now = Date.now()

  it('allows the first code', () => {
    expect(canSendCode({}, now)).toMatchObject({ ok: true })
  })

  it('holds a resend behind a short cooldown', () => {
    const state: VerificationState = { verificationSentAt: new Date(now - 5_000), verificationSendCount: 1 }
    const decision = canSendCode(state, now)
    expect(decision.ok).toBe(false)
    if (!decision.ok) expect(decision.reason).toBe('cooldown')
  })

  it('allows a resend once the cooldown passes', () => {
    const state: VerificationState = {
      verificationSentAt: new Date(now - RESEND_COOLDOWN_MS - 1_000),
      verificationSendCount: 1,
    }
    expect(canSendCode(state, now)).toMatchObject({ ok: true })
  })

  it('caps how many codes one address gets in a window', () => {
    const state: VerificationState = {
      verificationSentAt: new Date(now - RESEND_COOLDOWN_MS - 1_000),
      verificationSendCount: MAX_SENDS_PER_WINDOW,
    }
    const decision = canSendCode(state, now)
    expect(decision.ok).toBe(false)
    if (!decision.ok) expect(decision.reason).toBe('too_many')
  })

  it('opens the window again once it has passed', () => {
    const state: VerificationState = {
      verificationSentAt: new Date(now - SEND_WINDOW_MS - 1_000),
      verificationSendCount: MAX_SENDS_PER_WINDOW,
    }
    expect(canSendCode(state, now)).toMatchObject({ ok: true, resetWindow: true })
  })
})

describe('isVerified', () => {
  it('is false for everything that is not a date', () => {
    expect(isVerified(null)).toBe(false)
    expect(isVerified(undefined)).toBe(false)
    expect(isVerified({})).toBe(false)
    expect(isVerified({ verifiedAt: null })).toBe(false)
    expect(isVerified({ verifiedAt: new Date() })).toBe(true)
  })
})
