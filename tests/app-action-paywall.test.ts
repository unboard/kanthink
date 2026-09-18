/**
 * Charging for something inside an app, rather than for opening it.
 *
 * The whole-app paywall is enforced by never handing over the code. An action
 * paywall cannot do that — the code goes to everybody, and the flag the app reads
 * lives in a browser the visitor controls. So it is enforced twice, in two places
 * that must not drift:
 *
 *   in the page, which decides what to render and what flag to bake in, and
 *   on the server, which decides whether it will spend the publisher's money.
 *
 * These pin both, plus the default that keeps the mistake safe: anything that is
 * not explicitly 'action' gates the whole app.
 */
import { describe, it, expect } from 'vitest'
import {
  gatesAction,
  gatesWholeApp,
  isPaywalled,
  paywallMode,
} from '../lib/playground/appAccess'
import { signPayToken, verifyPayToken, PAY_TOKEN_TTL_SECONDS } from '../lib/playground/payToken'
import { buildPlaygroundDoc } from '../components/playground/buildPlaygroundDoc'
import vm from 'node:vm'

const paid = { paywallEnabled: true, priceAmount: 400, stripePriceId: 'price_1' }

describe('where the gate sits', () => {
  it('defaults to the door when nothing says otherwise', () => {
    expect(paywallMode(paid)).toBe('app')
    expect(gatesWholeApp(paid)).toBe(true)
    expect(gatesAction(paid)).toBe(false)
  })

  it('reads an unrecognised mode as the door rather than trusting it', () => {
    // A typo in this column must not quietly publish a paid app to everybody.
    expect(paywallMode({ ...paid, paywallMode: 'Action' })).toBe('app')
    expect(paywallMode({ ...paid, paywallMode: 'inside' })).toBe('app')
    expect(gatesWholeApp({ ...paid, paywallMode: 'inside' })).toBe(true)
  })

  it('gates an action when asked to', () => {
    const app = { ...paid, paywallMode: 'action' }
    expect(gatesAction(app)).toBe(true)
    expect(gatesWholeApp(app)).toBe(false)
  })

  it('gates nothing when the app is not actually charging', () => {
    // The mode is not a paywall on its own. An app with a mode set but no price
    // configured would otherwise gate an action nobody can buy their way past.
    const noPrice = { paywallEnabled: true, paywallMode: 'action', priceAmount: null, stripePriceId: null }
    expect(isPaywalled(noPrice)).toBe(false)
    expect(gatesAction(noPrice)).toBe(false)
    expect(gatesWholeApp(noPrice)).toBe(false)

    const off = { ...paid, paywallEnabled: false, paywallMode: 'action' }
    expect(gatesAction(off)).toBe(false)
  })
})

describe('the entitlement token', () => {
  const claims = {
    appId: 'app_1',
    appUserId: 'user_1',
    epoch: 3,
    scope: 'purchase' as const,
    purchaseId: 'pur_1',
  }

  it('round-trips what the page put in it', () => {
    const read = verifyPayToken(signPayToken(claims))
    expect(read).toMatchObject(claims)
    expect(read!.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('carries a verified session with no purchase attached', () => {
    const read = verifyPayToken(
      signPayToken({ ...claims, scope: 'verified', purchaseId: null }),
    )
    expect(read!.scope).toBe('verified')
    expect(read!.purchaseId).toBeNull()
  })

  it('refuses a token whose claims were edited', () => {
    const token = signPayToken(claims)
    const parts = token.split('.')

    // Somebody else's row.
    expect(verifyPayToken(['app_1', 'user_2', ...parts.slice(2)].join('.'))).toBeNull()
    // An epoch from before a sign-out.
    expect(verifyPayToken(['app_1', 'user_1', '4', ...parts.slice(3)].join('.'))).toBeNull()
    // A purchase that was not theirs.
    expect(verifyPayToken([...parts.slice(0, 4), 'pur_2', ...parts.slice(5)].join('.'))).toBeNull()
    // A longer life than it was granted.
    expect(
      verifyPayToken([...parts.slice(0, 5), String(Number(parts[5]) + 99999), parts[6]].join('.')),
    ).toBeNull()
  })

  it('refuses garbage, the wrong shape, and an expired token', () => {
    expect(verifyPayToken(null)).toBeNull()
    expect(verifyPayToken('')).toBeNull()
    expect(verifyPayToken('nonsense')).toBeNull()
    // The access cookie is a different token with a different secret.
    expect(verifyPayToken('app_1.user_1.3.p.pur_1.deadbeef')).toBeNull()
    expect(
      verifyPayToken(signPayToken({ ...claims, expiresAt: Math.floor(Date.now() / 1000) - 1 })),
    ).toBeNull()
  })

  it('does not outlive a session', () => {
    expect(PAY_TOKEN_TTL_SECONDS).toBeLessThanOrEqual(60 * 60 * 24)
  })
})

describe('what reaches the iframe', () => {
  const APP = 'export default function App() { return <div>hi</div>; }'

  it('tells a free app there is nothing to sell', () => {
    const doc = buildPlaygroundDoc(APP)
    expect(doc).toContain('window.kanthinkPay')
    expect(doc).toContain('var __KPG_PAY = null')
  })

  it('bakes in the price and the locked state for someone who has not paid', () => {
    const doc = buildPlaygroundDoc(APP, {
      pay: { entitled: false, price: '$4.00', recurring: false },
    })
    expect(doc).toContain('"entitled":false')
    expect(doc).toContain('"price":"$4.00"')
    // No purchase, no proof. The one thing an unpaid visitor must never be handed.
    expect(doc).toContain('var __KPG_PAY_TOKEN = ""')
  })

  it('hands the proof to somebody who has paid', () => {
    const token = signPayToken({
      appId: 'app_1',
      appUserId: 'user_1',
      epoch: 0,
      scope: 'purchase',
      purchaseId: 'pur_1',
    })
    const doc = buildPlaygroundDoc(APP, {
      pay: { entitled: true, price: '$4.00/mo', recurring: true, token },
    })
    expect(doc).toContain('"entitled":true')
    expect(doc).toContain(`var __KPG_PAY_TOKEN = ${JSON.stringify(token)}`)
  })

  it('sends the proof with AI calls, so the server can refuse one without it', () => {
    const doc = buildPlaygroundDoc(APP, {
      pay: { entitled: true, price: '$4.00', recurring: false, token: 'tok' },
    })
    // Both generate() and generateImage() — an image call costs more, not less.
    expect(doc.match(/payToken: __KPG_PAY_TOKEN/g)?.length).toBe(2)
  })

  it('lets the author walk their own paywall without buying their own app', () => {
    const doc = buildPlaygroundDoc(APP, {
      pay: { entitled: false, price: '$4.00', recurring: false, preview: true },
    })
    expect(doc).toContain('"preview":true')
    expect(doc).toContain('kanthink:entitled')
  })

  it('emits a runtime that actually parses', () => {
    // The whole runtime is one template literal, so a stray backtick inside a
    // comment ends it early rather than failing — TypeScript is happy and the page
    // ships broken. Parsing every plain script block is what catches that.
    const doc = buildPlaygroundDoc(APP, {
      appToken: 'tok.abc',
      pay: { entitled: true, price: '$4.00', recurring: false, token: 'pay.tok', preview: true },
    })
    const blocks = [...doc.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
    expect(blocks.length).toBeGreaterThan(0)
    for (const src of blocks) expect(() => new vm.Script(src)).not.toThrow()
  })
})
