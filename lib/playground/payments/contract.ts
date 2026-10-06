import type { PaymentModeKey, PaymentSetup } from './types'

/**
 * What every build is told about this app's payments.
 *
 * The general rules for kanthinkPay live in the system prompt. This is the part
 * that only this app knows: which kind of selling it does, at what price, and what
 * the owner said about getting things to buyers. A build that knows the contract
 * can't wire the wrong flow. The shop that started this had a timer for a checkout
 * because nothing told the builder what the settings actually were.
 */

export type ContractInput = {
  mode: PaymentModeKey
  /** As shown to buyers, already formatted. Null when free. */
  price: string | null
  setup?: PaymentSetup | null
}

const FULFILMENT_WORDS: Record<string, string> = {
  pickup: 'Buyers collect it in person (local pickup). Stripe does not ask for an address.',
  shipping: 'It is shipped. Stripe checkout collects the shipping address.',
  digital: 'It is delivered inside the app or by the owner digitally. No address is collected.',
  contact: 'The owner contacts each buyer to arrange it. No address is collected.',
}

export const ORDERS_API = `TAKING ORDERS: this app is a shop, and every purchase is its own order (already wired up):

window.kanthinkPay.mode        // "order"
window.kanthinkPay.price       // "$5.00": the price of ONE item, already formatted. Always show this, never a number of your own.
window.kanthinkPay.order({ item, quantity, details })
  // Starts Stripe checkout for this order. Call it from the buy button's click handler.
  // item:     string, required: exactly what is being bought, as the buyer would name it ("Pumpkin Boo rock").
  // quantity: number, optional, default 1.
  // details:  optional object of short strings the owner needs to fulfill it ({ rockId: "r12", color: "orange" }).
  // The page navigates to checkout; when the buyer pays they come back to this same page.
window.kanthinkPay.lastOrder   // set when the buyer has just returned from paying, otherwise null:
  // { id, number, item, quantity, amount: "$5.00", status: "paid", details, fulfilmentNote, preview }
  // preview is true in the owner's draft preview, where nothing is charged.

THE PATTERN:
const confirmed = window.kanthinkPay?.lastOrder;
window.kanthinkPay.dismissOrder() // the "Back to the shop" button on the confirmation: clears lastOrder. Then re-render (e.g. set your view state). NEVER reload the page.
if (confirmed) -> render the confirmation first: "Order #{number}: {item}", the amount paid, what happens next (show confirmed.fulfilmentNote once; never also hard-code the same words), "A receipt is on its way to your email", and a way back to browsing that calls dismissOrder().
<Button onClick={() => window.kanthinkPay.order({ item: rock.title, details: { rockId: rock.id } })}>
  Buy · {window.kanthinkPay.price}
</Button>

RULES for orders. These are judged:
- Checkout collects the buyer's name, email and payment (plus phone/address when the owner asked). NEVER build your own name, email, phone or address form for buying. It duplicates checkout and its contents are lost.
- NEVER show "Order confirmed", "Thank you for your order" or similar except from kanthinkPay.lastOrder. No timers, no optimistic success.
- NEVER call kanthinkPay.unlock() or check kanthinkPay.entitled in a shop: there is nothing to unlock, and one payment must never unlock later orders.
- The price is the server's. Never compute or write a price; quantity × kanthinkPay.price is shown by checkout itself.
- Out-of-stock or unavailable items must not offer the buy button.
- Never call window.location.reload(): the page would come back showing the same confirmation.`

export function paymentContract(input: ContractInput): string {
  const setup = input.setup ?? {}
  switch (input.mode) {
    case 'free':
      return `PAYMENT SETTINGS FOR THIS APP: free. It charges nobody.
Build no checkout, payment step, price tags or "order confirmed" screens. If the thread asks for selling, build the browsing and choosing, make the buy button say the shop isn't taking orders yet, and say in your notes that the owner turns on Orders in Settings → Access. Never fake a payment.`

    case 'app':
      return `PAYMENT SETTINGS FOR THIS APP: paid at the door (${input.price}). Everyone who can see the app has already paid.
Build no purchase buttons, and don't call kanthinkPay.unlock() or order(). Everything is available to everyone inside.`

    case 'action':
      return `PAYMENT SETTINGS FOR THIS APP: charges for an action inside the app (${input.price}${input.price?.includes('/') ? ', a subscription' : ', once'}).
${setup.paidAction ? `What costs money, in the owner's words: "${setup.paidAction}". Gate exactly that; everything else stays free.` : 'The owner hasn\'t said which action costs money: gate the single most valuable action the thread describes, and name it in your notes.'}
Use the CHARGING FOR AN ACTION pattern: gate on enabled && !entitled, show the price on the button, call unlock() from the click. Don't use order(); this app sells access, not items.`

    case 'order': {
      const lines = [
        `PAYMENT SETTINGS FOR THIS APP: a shop taking orders at ${input.price} per item.`,
        setup.fulfilment ? FULFILMENT_WORDS[setup.fulfilment] : 'How buyers get their order isn\'t set yet; say "We\'ll be in touch about getting it to you" in the confirmation.',
        setup.fulfilmentNote ? `Tell buyers, on the item page and in the confirmation: "${setup.fulfilmentNote}"` : '',
        setup.collectNote ? `Checkout asks the buyer for "${setup.noteLabel || 'a note'}". Don't ask for it in the app.` : '',
        setup.maxQuantity && setup.maxQuantity > 1 ? `Buyers may order up to ${setup.maxQuantity} of an item: offer a quantity choice.` : 'One item per order: no quantity picker.',
        '',
        ORDERS_API,
      ]
      return lines.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n')
    }
  }
}

/** The brief for the "Fix how it takes payment" pass. */
export function paymentPassPrompt(findings: { title: string; fix: string }[], missing: string[]): string {
  const list = findings.length ? findings.map((f) => `- ${f.title}: ${f.fix}`).join('\n') : '- Nothing specific was flagged. Make the buying flow match PAYMENT SETTINGS FOR THIS APP exactly.'
  return `Fix how the app takes payment so it matches PAYMENT SETTINGS FOR THIS APP.

Change only what buying and paying touch: buy and order buttons, checkout steps, confirmation screens, price display, and any fake or duplicate payment steps. Everything else stays exactly as it is: features, layout, styling, data and copy.

What the payment check found:
${list}${missing.length ? `\n\nThe owner hasn't answered these yet. Build so the answer can be added later without a rebuild, and don't invent answers:\n${missing.map((m) => `- ${m}`).join('\n')}` : ''}`
}
