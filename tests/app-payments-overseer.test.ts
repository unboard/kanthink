import { describe, expect, it } from 'vitest'
import { checkPayments, codeSignals } from '@/lib/playground/payments/check'
import { paymentContract, paymentPassPrompt } from '@/lib/playground/payments/contract'
import { cleanOrderRequest, OrderError } from '@/lib/playground/payments/orderRequest'
import { activeMode, paymentSettings, previewPay } from '@/lib/playground/payments/settings'
import { cleanSetup, paymentStatus } from '@/lib/playground/payments/status'
import { isPaywalled, takesOrders, gatesAction } from '@/lib/playground/appAccess'
import { buildPlaygroundDoc } from '@/components/playground/buildPlaygroundDoc'

// The shape of the shop that started this: an order form with its own contact
// fields, unlock() for payment, a timer for a checkout and a $5 fallback price.
const BOO_ROCKS = `
function Checkout({ rock, onSuccess }) {
  const price = window.kanthinkPay?.price || "$5.00";
  const handleSubmit = (e) => {
    e.preventDefault();
    if (window.kanthinkPay?.enabled && !window.kanthinkPay?.entitled) {
      window.kanthinkPay.unlock();
      return;
    }
    setSubmitting(true);
    // Mock checkout process
    setTimeout(() => {
      setSubmitting(false);
      onSuccess();
    }, 800);
  };
  return (
    <form onSubmit={handleSubmit}>
      <Field label="Your Name"><Input required placeholder="Jack Skellington" /></Field>
      <Field label="Contact Email or Phone"><Input required placeholder="For pickup details..." /></Field>
      <Button type="submit">Confirm order</Button>
    </form>
  );
}
function CheckoutSuccess() { return <h2>Order confirmed!</h2>; }
`

const GOOD_SHOP = `
export default function App() {
  const done = window.kanthinkPay?.lastOrder;
  if (done) return <Card><CardTitle>Order #{done.number}: {done.item}</CardTitle><p>{done.fulfilmentNote}</p></Card>;
  return rocks.map((rock) => (
    <Button key={rock.id} onClick={() => window.kanthinkPay.order({ item: rock.title, details: { rockId: rock.id } })}>
      Buy · {window.kanthinkPay.price}
    </Button>
  ));
}
`

const shop = { paywallEnabled: true, paywallMode: 'order', priceAmount: 200, priceCurrency: 'usd', priceInterval: 'one_time' as const, stripePriceId: 'price_1' }

describe('payment modes', () => {
  it('a shop is not paywalled: sign-in and AI never route through checkout', () => {
    expect(isPaywalled(shop)).toBe(false)
    expect(gatesAction(shop)).toBe(false)
    expect(takesOrders(shop)).toBe(true)
    expect(activeMode(shop)).toBe('order')
  })

  it('a switched-on price with nothing behind it is free', () => {
    expect(activeMode({ ...shop, stripePriceId: null })).toBe('free')
  })

  it('a shop price is per item, never a subscription', () => {
    expect(paymentSettings({ ...shop, priceInterval: 'month' }).price).toBe('$2.00')
  })
})

describe('payment check', () => {
  it('catches everything wrong with the rock shop', () => {
    const ids = checkPayments(BOO_ROCKS, paymentSettings(shop)).map((f) => f.id)
    expect(ids).toEqual(expect.arrayContaining(['fake-checkout', 'buying-takes-no-payment', 'unlock-in-shop', 'duplicate-contact-form', 'price-mismatch']))
  })

  it('names the wrong price', () => {
    const mismatch = checkPayments(BOO_ROCKS, paymentSettings(shop)).find((f) => f.id === 'price-mismatch')!
    expect(mismatch.title).toContain('$5.00')
    expect(mismatch.title).toContain('$2.00')
  })

  it('flags a confirmation that reloads into itself', () => {
    const code = GOOD_SHOP.replace('</Card>;', '<Button onClick={() => window.location.reload()}>Back</Button></Card>;')
    expect(checkPayments(code, paymentSettings(shop)).map((f) => f.id)).toContain('reload-after-order')
  })

  it('passes a shop built the right way', () => {
    expect(checkPayments(GOOD_SHOP, paymentSettings(shop))).toEqual([])
  })

  it('a free app with buy buttons and prices is told payments are off', () => {
    const code = '<Button>Buy now</Button><span>$12.00</span>'
    expect(checkPayments(code, { mode: 'free', price: null }).map((f) => f.id)).toContain('selling-without-payments')
  })

  it('a free tool is left alone', () => {
    expect(checkPayments('<Button>Add bill</Button><span>Total $42.00</span>', { mode: 'free', price: null })).toEqual([])
  })

  it('an action paywall nothing asks for is flagged, with the owner\'s words in the fix', () => {
    const f = checkPayments('<Button>Export</Button>', { mode: 'action', price: '$4.00', setup: { paidAction: 'exporting a PDF' } })
    expect(f[0].id).toBe('nothing-charges')
    expect(f[0].fix).toContain('exporting a PDF')
  })

  it('an action paywall done right passes', () => {
    const code = `const locked = window.kanthinkPay?.enabled && !window.kanthinkPay?.entitled;
      <Button onClick={() => { if (locked) { window.kanthinkPay.unlock(); return; } exportIt(); }}>{locked ? \`Export · \${window.kanthinkPay.price}\` : "Export"}</Button>`
    expect(checkPayments(code, { mode: 'action', price: '$4.00' })).toEqual([])
  })

  it('reads a timer standing in for a payment', () => {
    const code = 'const placeOrder = () => { setLoading(true); setTimeout(() => setView("success"), 500) }'
    expect(codeSignals(code).fakesCheckout).toBe(true)
    expect(codeSignals('setTimeout(() => setToast(null), 2000)').fakesCheckout).toBe(false)
  })
})

describe('what builds are told', () => {
  it('a shop build gets the order API, the fulfilment and the rules', () => {
    const c = paymentContract({ mode: 'order', price: '$2.00', setup: { fulfilment: 'pickup', fulfilmentNote: 'Pickup in Fargo, Saturdays' } })
    expect(c).toContain('kanthinkPay.order(')
    expect(c).toContain('Pickup in Fargo, Saturdays')
    expect(c).toContain('NEVER build your own name, email, phone or address form')
    expect(c).toContain('NEVER call kanthinkPay.unlock()')
  })

  it('a free build is told not to fake a checkout', () => {
    expect(paymentContract({ mode: 'free', price: null })).toContain('Never fake a payment')
  })

  it('the fix pass carries the findings and the open questions', () => {
    const p = paymentPassPrompt([{ title: 'Buying doesn\'t take payment', fix: 'Call order()' }], ['Where and when is pickup?'])
    expect(p).toContain('Call order()')
    expect(p).toContain('Where and when is pickup?')
  })
})

describe('order requests', () => {
  it('needs an item', () => {
    expect(() => cleanOrderRequest({ item: '  ' }, 'tok', null)).toThrow(OrderError)
  })

  it('holds quantity to what the owner allows', () => {
    expect(() => cleanOrderRequest({ item: 'Rock', quantity: 2 }, 'tok', null)).toThrow(/one item/)
    expect(cleanOrderRequest({ item: 'Rock', quantity: 2 }, 'tok', { maxQuantity: 3 }).quantity).toBe(2)
  })

  it('keeps only short, plain details', () => {
    const o = cleanOrderRequest({ item: 'Rock', details: { rockId: 'r1', 'bad key!': 'x', nested: { a: 1 }, n: 3 } }, 'tok', null)
    expect(o.details).toEqual({ rockId: 'r1', n: '3' })
  })

  it('only ever returns the buyer to this app', () => {
    expect(cleanOrderRequest({ item: 'Rock', returnPath: '/play/tok/r/abc?x=1' }, 'tok', null).returnPath).toBe('/play/tok/r/abc')
    expect(cleanOrderRequest({ item: 'Rock', returnPath: 'https://evil.example' }, 'tok', null).returnPath).toBe('/play/tok')
    expect(cleanOrderRequest({ item: 'Rock', returnPath: '/play/other' }, 'tok', null).returnPath).toBe('/play/tok')
  })
})

describe('setup and status', () => {
  it('cleans owner input and keeps what was there', () => {
    const s = cleanSetup({ collectPhone: true, maxQuantity: 999 }, { fulfilment: 'pickup', fulfilmentNote: 'Fargo' })
    expect(s).toMatchObject({ fulfilment: 'pickup', fulfilmentNote: 'Fargo', collectPhone: true, maxQuantity: 50 })
    expect(cleanSetup({ fulfilment: 'teleport' }).fulfilment).toBeNull()
  })

  it('asks the owner what a shop still needs', () => {
    expect(paymentStatus({ ...shop, code: GOOD_SHOP }).missing).toEqual(['How do buyers get their order?'])
    expect(paymentStatus({ ...shop, code: GOOD_SHOP, paymentSetup: { fulfilment: 'pickup' } }).missing).toEqual(['Where and when is pickup?'])
  })

  it('ignores a review of older code', () => {
    const review = { sells: 'Rocks', suggestedMode: 'order' as const, why: '', issues: [{ id: 'kan-0', severity: 'low' as const, title: 'x', detail: '', fix: '' }], codeHash: 'old', settingsKey: 'old', reviewedAt: '' }
    const st = paymentStatus({ ...shop, code: GOOD_SHOP, paymentReview: review })
    expect(st.review).toBeNull()
    expect(st.stale).toBe(true)
  })
})

describe('the shop runtime', () => {
  const doc = (pay: Parameters<typeof buildPlaygroundDoc>[1] extends infer O ? O extends { pay?: infer P } ? P : never : never) =>
    buildPlaygroundDoc('export default function App(){return null}', { title: 'Boo Rocks', pay })

  it('exposes order() and the returned order', () => {
    const d = doc({ mode: 'order', entitled: false, price: '$2.00', recurring: false, lastOrder: { id: 'o1', number: 3, item: 'Pumpkin rock', status: 'paid' } })
    expect(d).toContain('order: function(opts)')
    expect(d).toContain('"lastOrder":{"id":"o1","number":3,"item":"Pumpkin rock","status":"paid"}')
    expect(d).toContain('"mode":"order"')
    // A shop is never "entitled": one payment must not unlock the next order.
    expect(d).toContain('"entitled":false')
  })

  it('escapes what a buyer could have typed into an item name', () => {
    const d = doc({ mode: 'order', entitled: false, price: '$2.00', recurring: false, lastOrder: { item: '</script><script>alert(1)</script>' } })
    expect(d).not.toContain('</script><script>alert(1)')
  })

  it('previews a shop without charging', () => {
    expect(previewPay(shop)).toMatchObject({ mode: 'order', preview: true, lastOrder: null })
  })
})
