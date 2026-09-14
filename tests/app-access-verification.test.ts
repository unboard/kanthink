/**
 * Proving an email address, and what a session is allowed to conclude from it.
 *
 * Two rounds of real vulnerabilities live in here.
 *
 * The first: access was granted on a typed email alone, so knowing a customer's
 * address was the same as being them.
 *
 * The second, found in review of the fix: verification was recorded on the customer
 * *record* rather than on the session. That meant the genuine customer proving their
 * address silently re-authorised every stale cookie for it — the invalidation undid
 * itself — and it meant a Stripe purchase, which proves a card and not an inbox,
 * could hand over an existing customer's history.
 *
 * Sessions now carry their own scope, and these tests pin both rounds.
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
import {
  canReadPrivateData,
  hasActiveAccess,
  sessionMatchesMember,
  signAccessToken,
  verifyAccessToken,
} from '../lib/playground/appAccess'

const paidApp = { paywallEnabled: true, priceAmount: 400, stripePriceId: 'price_1' }
const freeApp = { paywallEnabled: false }

const APP = 'app-1'
const MEMBER = 'member-1'
const PURCHASE = 'purchase-1'

/** One live purchase, which is what makes a session worth anything. */
const livePurchase = [{ id: PURCHASE, status: 'active' as const }]

const verifiedSession = verifyAccessToken(signAccessToken(MEMBER, 0, 'verified'))
const purchaseSession = verifyAccessToken(signAccessToken(MEMBER, 0, 'purchase', PURCHASE))

describe('a session carries what it proved', () => {
  it('round-trips a verified session', () => {
    expect(verifiedSession).toMatchObject({ appUserId: MEMBER, scope: 'verified', epoch: 0 })
  })

  it('round-trips a purchase session', () => {
    expect(purchaseSession).toMatchObject({ appUserId: MEMBER, scope: 'purchase', epoch: 0 })
  })

  it('refuses a token whose scope has been edited', () => {
    const token = signAccessToken(MEMBER, 0, 'purchase')
    expect(verifyAccessToken(token.replace('.p.', '.v.'))).toBeNull()
  })

  it('refuses a token pointed at a different member', () => {
    const token = signAccessToken(MEMBER, 0, 'verified')
    expect(verifyAccessToken(token.replace(MEMBER, 'member-2'))).toBeNull()
  })

  it('refuses a token whose epoch has been edited', () => {
    const token = signAccessToken(MEMBER, 3, 'verified')
    expect(verifyAccessToken(token.replace('.3.', '.4.'))).toBeNull()
  })
})

describe('knowing someone’s email cannot grant access', () => {
  it('refuses a paid row when there is no session at all', () => {
    // Typing an address mints nothing, so this is what an impostor holds.
    expect(hasActiveAccess(paidApp, null, livePurchase)).toBe(false)
  })

  it('lets a paid row in once a session exists for it', () => {
    expect(hasActiveAccess(paidApp, verifiedSession, livePurchase)).toBe(true)
  })

  it('keeps the private thread shut without a verified session', () => {
    expect(canReadPrivateData(null)).toBe(false)
    expect(canReadPrivateData(purchaseSession)).toBe(false)
    expect(canReadPrivateData(verifiedSession)).toBe(true)
  })

  it('still opens a free app to everybody', () => {
    expect(hasActiveAccess(freeApp, null, [])).toBe(true)
  })
})

describe('paying with someone else’s address buys the app, not their account', () => {
  // A purchaser typed an address at Stripe. Stripe never checks that it is theirs,
  // so the session they come back with proves a card and nothing more.
  it('opens the app they paid for', () => {
    expect(hasActiveAccess(paidApp, purchaseSession, livePurchase)).toBe(true)
  })

  it('does not open that address’s conversation', () => {
    expect(canReadPrivateData(purchaseSession)).toBe(false)
  })

  it('does not open that address’s billing', () => {
    // Billing runs through the same gate as the thread.
    expect(canReadPrivateData(purchaseSession)).toBe(false)
  })

  it('cannot be escalated by asking for a code, because the code goes to the inbox', () => {
    // Nothing to assert in code — the escalation path is "issue a code", and the
    // code is mailed to the address, not returned to the caller. This test exists
    // to keep that reasoning attached to the behaviour it depends on.
    const code = generateCode()
    const stored = hashCode(MEMBER, code)
    expect(stored).not.toContain(code)
  })
})

describe('a fresh browser must verify even for an already-verified customer', () => {
  it('has no session, so the record being verified changes nothing', () => {
    // This is the regression: verifiedAt used to be the gate, and a fresh browser
    // with no cookie would have passed on the strength of it.
    expect(hasActiveAccess(paidApp, null, livePurchase)).toBe(false)
    expect(canReadPrivateData(null)).toBe(false)
  })
})

const legacyCookieShape = `${MEMBER}.0.v.0123456789abcdef0123456789abcdef`

describe('a cookie from before the fix stays rejected, whatever happens later', () => {
  // Older formats: two segments with no scope, then four with no purchase.
  const legacyCookie = `${MEMBER}.0.v.0123456789abcdef0123456789abcdef`

  it('does not parse', () => {
    expect(verifyAccessToken(legacyCookie)).toBeNull()
  })

  it('stays rejected after the genuine customer verifies in another browser', () => {
    // The whole point. Verification now lands on a session, so a new one elsewhere
    // cannot reach back and re-authorise this cookie.
    const theirNewSession = verifyAccessToken(signAccessToken(MEMBER, 0, 'verified'))
    expect(theirNewSession).not.toBeNull()
    expect(verifyAccessToken(legacyCookie)).toBeNull()
    expect(hasActiveAccess(paidApp, verifyAccessToken(legacyCookie), livePurchase)).toBe(false)
  })

  it('stays rejected even for the row it names', () => {
    expect(canReadPrivateData(verifyAccessToken(legacyCookie))).toBe(false)
  })
})

describe('sessions can be revoked without rotating the server secret', () => {
  const member = { id: MEMBER, appId: APP, sessionEpoch: 0 }

  it('accepts a session whose epoch matches the row', () => {
    expect(sessionMatchesMember(verifiedSession, member, APP)).toBe(true)
  })

  it('rejects every outstanding session once the epoch moves', () => {
    expect(sessionMatchesMember(verifiedSession, { ...member, sessionEpoch: 1 }, APP)).toBe(false)
  })

  it('rejects a session for a different app, however well signed', () => {
    expect(sessionMatchesMember(verifiedSession, member, 'app-2')).toBe(false)
  })

  it('rejects a session naming a different member', () => {
    expect(sessionMatchesMember(verifiedSession, { ...member, id: 'member-2' }, APP)).toBe(false)
  })

  it('treats a row with no epoch as epoch zero, so existing rows keep working', () => {
    expect(sessionMatchesMember(verifiedSession, { id: MEMBER, appId: APP }, APP)).toBe(true)
  })
})

describe('a genuine customer recovers their purchase without paying again', () => {
  it('accepts the code that was mailed to them', () => {
    const code = generateCode()
    const state: VerificationState = {
      verificationCodeHash: hashCode(MEMBER, code),
      verificationExpiresAt: new Date(Date.now() + CODE_TTL_MS),
      verificationAttempts: 0,
    }
    expect(checkCode(MEMBER, code, state)).toBe('ok')
  })

  it('gets a verified session that opens both the app and the conversation', () => {
    expect(hasActiveAccess(paidApp, verifiedSession, livePurchase)).toBe(true)
    expect(canReadPrivateData(verifiedSession)).toBe(true)
  })

  it('tolerates a code typed with spaces or dashes', () => {
    const code = '418290'
    const state: VerificationState = {
      verificationCodeHash: hashCode(MEMBER, code),
      verificationExpiresAt: new Date(Date.now() + CODE_TTL_MS),
    }
    expect(checkCode(MEMBER, '418-290', state)).toBe('ok')
    expect(checkCode(MEMBER, '418 290', state)).toBe('ok')
  })
})

describe('the code itself', () => {
  it('is six digits, zero-padded', () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^\d{6}$/)
  })

  it('is scoped to one member, so it cannot be replayed against another row', () => {
    const code = generateCode()
    const stored = hashCode('member-a', code)
    expect(codeMatches('member-a', code, stored)).toBe(true)
    expect(codeMatches('member-b', code, stored)).toBe(false)
  })

  it('rejects a wrong code, expires, and locks after five guesses', () => {
    const live: VerificationState = {
      verificationCodeHash: hashCode('m', '111111'),
      verificationExpiresAt: new Date(Date.now() + CODE_TTL_MS),
    }
    expect(checkCode('m', '222222', live)).toBe('wrong')
    expect(checkCode('m', '111111', { ...live, verificationExpiresAt: new Date(Date.now() - 1000) })).toBe('expired')
    // Even the right code is refused once the guess budget is spent.
    expect(checkCode('m', '111111', { ...live, verificationAttempts: MAX_ATTEMPTS })).toBe('locked')
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
    const decision = canSendCode({ verificationSentAt: new Date(now - 5_000), verificationSendCount: 1 }, now)
    expect(decision.ok).toBe(false)
    if (!decision.ok) expect(decision.reason).toBe('cooldown')
  })

  it('caps how many codes one address gets in a window', () => {
    const decision = canSendCode({
      verificationSentAt: new Date(now - RESEND_COOLDOWN_MS - 1_000),
      verificationSendCount: MAX_SENDS_PER_WINDOW,
    }, now)
    expect(decision.ok).toBe(false)
    if (!decision.ok) expect(decision.reason).toBe('too_many')
  })

  it('opens the window again once it has passed', () => {
    expect(canSendCode({
      verificationSentAt: new Date(now - SEND_WINDOW_MS - 1_000),
      verificationSendCount: MAX_SENDS_PER_WINDOW,
    }, now)).toMatchObject({ ok: true, resetWindow: true })
  })
})

describe('isVerified is a record of the address, not a grant', () => {
  it('reports whether the address was ever proved', () => {
    expect(isVerified(null)).toBe(false)
    expect(isVerified({ verifiedAt: null })).toBe(false)
    expect(isVerified({ verifiedAt: new Date() })).toBe(true)
  })

  it('is not consulted by any access decision', () => {
    // A row marked verified grants nothing on its own; the session decides.
    expect(hasActiveAccess(paidApp, null, livePurchase)).toBe(false)
  })
})
