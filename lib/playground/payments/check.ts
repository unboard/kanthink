import type { PaymentFinding, PaymentModeKey, PaymentSetup } from './types'

/**
 * Does the app take money the way its settings say?
 *
 * Read off the code: no model, no cost, the same answer every time, so it can run
 * on every build and every settings change. It catches the failures that matter
 * most because they are silent: a shop whose "Confirm order" is a timer, a store
 * selling access instead of items, a price on the page that isn't the price Stripe
 * charges. Kan's review (review.ts) adds what only reading for meaning can find.
 */

export type PaymentSettings = {
  mode: PaymentModeKey
  /** As shown to buyers: "$2.00", "$4.00/mo". Null when free. */
  price: string | null
  setup?: PaymentSetup | null
}

const has = (code: string, re: RegExp) => re.test(code)

/** Strings and JSX text only, comments removed, so a word in a comment doesn't count as UI. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

export function codeSignals(raw: string) {
  const code = stripComments(raw)
  const ui = code.replace(/\b(className|class|key|id|href|src)\s*=\s*("[^"]*"|'[^']*'|\{`[^`]*`\})/g, '')
  return {
    callsUnlock: has(code, /kanthinkPay\??\.unlock\s*\(/),
    callsOrder: has(code, /kanthinkPay\??\.order\s*\(/),
    readsLastOrder: has(code, /kanthinkPay\??\.lastOrder/),
    readsEntitled: has(code, /kanthinkPay\??\.entitled/),
    gatesOnEnabled: has(code, /kanthinkPay\??\.enabled/),
    usesAI: has(code, /kanthinkAI\??\.(generate|generateImage)\s*\(/),
    handlesPaymentRequired: has(code, /payment_required/),
    /** Words a shop's buttons use. */
    looksLikeSelling: has(ui, />\s*[^<{]*\b(Buy( now)?|Order( now| for)?|Checkout|Check out|Add to cart|Purchase|Place order|Confirm order|Pay( now)?)\b/i)
      || has(ui, /['"`](Buy|Order|Checkout|Add to cart|Purchase|Place order|Confirm order|Pay now)[^'"`]{0,20}['"`]/),
    /** A success message a real payment would show. */
    claimsSuccess: has(ui, /(Order (confirmed|placed|received)|Payment (successful|complete|received)|Thank you for your (order|purchase)|Purchase complete)/i),
    /** A timer standing in for a payment, or a comment admitting it. */
    fakesCheckout: has(raw, /\/\/\s*(mock|fake|simulated?)\b[^\n]*(checkout|payment|order|purchase)/i) || fakeTimer(code),
    /** Prices written into the code: "$5.00", "$5". */
    priceLiterals: [...new Set((code.match(/\$\s?\d{1,5}(?:\.\d{2})?(?![\d.])/g) ?? []).map((p) => p.replace(/\s/g, '')))],
    /** The app's own contact form — what Stripe already asks for. */
    asksContact: has(code, /(placeholder|label|aria-label)\s*=\s*["'{`][^"'`}]*(e-?mail|phone|contact)/i)
      || has(ui, />\s*(Your )?(E-?mail|Phone|Contact)( (address|number|email or phone))?\s*</i),
  }
}

/** A setTimeout inside a buy/submit handler that ends in a success state. */
function fakeTimer(code: string): boolean {
  const re = /setTimeout\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(code))) {
    const before = code.slice(Math.max(0, m.index - 400), m.index)
    const after = code.slice(m.index, m.index + 250)
    if (/(checkout|order|payment|purchase|pay)\w*/i.test(before) && /(success|confirm|complete|setView|setStep|onSuccess|setOrdered|setPaid)/i.test(after)) return true
  }
  return false
}

function priceValue(p: string): number {
  return Number(p.replace(/[^0-9.]/g, ''))
}

export function checkPayments(code: string | null | undefined, settings: PaymentSettings): PaymentFinding[] {
  if (!code) return []
  const s = codeSignals(code)
  const out: PaymentFinding[] = []
  const add = (f: PaymentFinding) => out.push(f)

  if (s.fakesCheckout || (s.claimsSuccess && !s.callsOrder && !s.readsLastOrder && settings.mode !== 'app' && settings.mode !== 'action')) {
    add({
      id: 'fake-checkout',
      severity: 'high',
      title: 'Pretends to take payment',
      detail: 'A purchase "succeeds" without any money changing hands, and nothing the buyer typed reaches you.',
      fix: 'Remove the simulated checkout (timers and success screens not backed by a real payment). Take payment with window.kanthinkPay.order() and show the confirmation only from window.kanthinkPay.lastOrder.',
    })
  }

  switch (settings.mode) {
    case 'free':
      if (s.looksLikeSelling && (s.priceLiterals.length > 0 || s.claimsSuccess)) {
        add({
          id: 'selling-without-payments',
          severity: 'high',
          title: 'Sells things, but payments are off',
          detail: 'The app has buy or order buttons with prices, but it can\'t charge anyone. Turn on Orders in Access.',
          fix: 'Payments are not set up for this app. Do not fake a checkout. Keep browsing and choosing; make the buy button say the shop is not taking orders yet.',
        })
      }
      break

    case 'app':
      if (s.callsUnlock || s.callsOrder) {
        add({
          id: 'buttons-behind-door',
          severity: 'low',
          title: 'Buy buttons inside a paid app',
          detail: 'Everyone inside has already paid at the door, so these buttons never do anything.',
          fix: 'Remove the in-app purchase buttons and kanthinkPay calls; every visitor has already paid.',
        })
      }
      break

    case 'action':
      if (!s.callsUnlock && !s.usesAI) {
        add({
          id: 'nothing-charges',
          severity: 'high',
          title: 'Nothing in the app asks for payment',
          detail: 'Payment is set to an action inside the app, but no button asks for it, so nobody can pay.',
          fix: `Gate the paid action${settings.setup?.paidAction ? ` (${settings.setup.paidAction})` : ''} with window.kanthinkPay: when enabled && !entitled, the button shows the price and calls unlock().`,
        })
      }
      if (s.usesAI && !s.callsUnlock && !s.handlesPaymentRequired) {
        add({
          id: 'ai-refusal-unhandled',
          severity: 'medium',
          title: 'Unpaid AI calls just fail',
          detail: 'AI features are refused until someone pays, but the app shows an error instead of offering to buy.',
          fix: 'Catch err.code === "payment_required" from kanthinkAI calls and call window.kanthinkPay.unlock() instead of showing an error.',
        })
      }
      if (s.readsEntitled && !s.gatesOnEnabled) {
        add({
          id: 'entitled-without-enabled',
          severity: 'medium',
          title: 'Paid features may hide from everyone',
          detail: 'The app checks "has paid" without checking that charging is on, which locks features if payments are ever turned off.',
          fix: 'Gate on window.kanthinkPay.enabled && !window.kanthinkPay.entitled, never on !entitled alone.',
        })
      }
      if (s.callsOrder) {
        add({
          id: 'order-in-action-app',
          severity: 'medium',
          title: 'Takes orders, but sells access',
          detail: 'The app calls the order flow, but payment is set to unlock an action. Switch Access to Orders if it sells items.',
          fix: 'Use window.kanthinkPay.unlock() for the paid action, not order().',
        })
      }
      break

    case 'order':
      if (!s.callsOrder) {
        add({
          id: 'buying-takes-no-payment',
          severity: 'high',
          title: 'Buying doesn\'t take payment',
          detail: 'Orders are on, but no button starts a checkout, so no order reaches you.',
          fix: 'Call window.kanthinkPay.order({ item, quantity, details }) from the buy button, naming exactly what is being bought.',
        })
      }
      if (s.callsUnlock) {
        add({
          id: 'unlock-in-shop',
          severity: 'high',
          title: 'Sells access instead of items',
          detail: 'One payment would unlock every later purchase for free, and you\'d never see what was bought.',
          fix: 'Replace kanthinkPay.unlock() and any entitled checks with window.kanthinkPay.order(). A shop has nothing to unlock.',
        })
      }
      if (s.callsOrder && !s.readsLastOrder) {
        add({
          id: 'no-confirmation',
          severity: 'medium',
          title: 'No confirmation after paying',
          detail: 'Buyers come back from checkout to the same page with no sign their order went through.',
          fix: 'When window.kanthinkPay.lastOrder is set, show its confirmation (order number, item, what happens next) on first render.',
        })
      }
      if (s.callsOrder && /location\.reload\s*\(/.test(code)) {
        add({
          id: 'reload-after-order',
          severity: 'medium',
          title: 'Going back reloads into the confirmation',
          detail: 'After ordering, "back to the shop" reloads the page, which shows the same confirmation again.',
          fix: 'Replace window.location.reload() with window.kanthinkPay.dismissOrder() and then set the view back to the shop.',
        })
      }
      if (s.asksContact) {
        add({
          id: 'duplicate-contact-form',
          severity: 'medium',
          title: 'Asks for contact details twice',
          detail: 'Stripe checkout collects the buyer\'s name, email' + (settings.setup?.collectPhone ? ', phone' : '') + (settings.setup?.fulfilment === 'shipping' ? ' and address' : '') + '. A form in the app asks again and loses what they typed.',
          fix: 'Remove the app\'s own name/email/phone/address fields from the buying flow; checkout collects them. Keep only choices about the item, passed as order details.',
        })
      }
      break
  }

  if (settings.price && settings.mode !== 'free') {
    const real = priceValue(settings.price)
    const wrong = s.priceLiterals.filter((p) => Math.abs(priceValue(p) - real) > 0.001)
    if (wrong.length > 0) {
      add({
        id: 'price-mismatch',
        severity: 'medium',
        title: `Shows ${wrong.slice(0, 2).join(', ')} but charges ${settings.price}`,
        detail: 'A price is written into the app that doesn\'t match what checkout charges.',
        fix: `Remove hard-coded prices (${wrong.join(', ')}). Show window.kanthinkPay.price, which is always the real price.`,
      })
    }
  }

  const order = { high: 0, medium: 1, low: 2 }
  return out.sort((a, b) => order[a.severity] - order[b.severity])
}

export function paymentBrief(findings: PaymentFinding[]): string {
  return findings.map((f) => `- ${f.title}: ${f.fix}`).join('\n')
}
