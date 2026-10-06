/**
 * Sample orders with real artwork, for showing the print orders API working: the
 * one-click demo on /print/developers and the quickstart people paste into a terminal.
 *
 * The demo order tells the whole story in two items: a yard sign whose file fits, and
 * door hangers sent the same yard-sign file, which doesn't. The second is the case
 * printers deal with every day: the page flags it, and "Fit to product" rebuilds it.
 */

const ART = 'https://res.cloudinary.com/dcht3dytz/image/upload/v1791211980/kanthink/print/8a42865c-80fc-49bc-8adf-5ee45cf6f44f/pages/cdldiblrxvpop4jm203g.jpg'

export const SAMPLE_ARTWORK = { yardSign: ART }

/** The quickstart: one item, a file that fits, no email sent. Works as pasted. */
export function quickstartPayload(externalId = 'demo-1042') {
  return {
    externalId,
    ref: '1042',
    customer: { name: 'Pat Example', phone: '614-555-0100' },
    approvalHours: 24,
    notifyCustomer: false,
    jobs: [
      {
        externalId: 'line-1',
        name: 'Yard signs',
        quantity: 25,
        product: { width: 24, height: 12, unit: 'in', bleed: 0.5, safe: 0.5, sku: 'YS-24x12', stock: 'Coroplast 4mm' },
        artwork: [{ url: ART, filename: 'yard-sign.jpg', origin: { madeBy: 'customer', madeWith: 'Canva', via: 'upload' } }],
      },
    ],
  }
}

/** The fuller demo: a file that fits, and the same file on a product it doesn't fit. */
export function demoOrderPayload(externalId: string) {
  return {
    externalId,
    ref: `DEMO-${externalId.slice(-4).toUpperCase()}`,
    customer: { name: 'Pat Example', company: 'D&B Junk Removal', phone: '614-555-0100' },
    approvalHours: 48,
    notifyCustomer: false,
    metadata: { demo: true },
    offer: { title: 'Matching business cards?', body: 'Same look, 500 for $39 this week.', url: 'https://www.kanthink.com', cta: 'See business cards' },
    jobs: [
      {
        externalId: 'line-1',
        name: 'Yard signs',
        quantity: 25,
        product: { width: 24, height: 12, unit: 'in', bleed: 0.5, safe: 0.5, sku: 'YS-24x12', stock: 'Coroplast 4mm' },
        artwork: [{ url: ART, filename: 'yard-sign.jpg', origin: { madeBy: 'customer', madeWith: 'Canva', via: 'upload' } }],
      },
      {
        externalId: 'line-2',
        name: 'Door hangers',
        quantity: 500,
        product: { key: 'door-hanger', shape: 'square', sku: 'DH-425x11', stock: '14pt gloss' },
        artwork: [{ url: ART, filename: 'yard-sign.jpg', origin: { madeBy: 'customer', via: 'upload' } }],
        notes: 'Customer sent their yard sign file for the door hangers too.',
      },
    ],
  }
}
