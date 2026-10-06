/**
 * End-to-end check of print orders against the real database and models.
 *
 *   npx tsx scripts/print-orders-selftest.ts          — make a two-job order, walk it through, clean up
 *   npx tsx scripts/print-orders-selftest.ts keep     — same, but leave the order for a look in the browser
 *
 * Runs as the ADMIN_EMAIL account with no customer email, so nobody is emailed.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

for (const line of readFileSync(resolve(__dirname, '..', '.env.local'), 'utf-8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0 && !process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1).replace(/^"|"$/g, '')
}

const ART = 'https://res.cloudinary.com/dcht3dytz/image/upload/v1791211980/kanthink/print/8a42865c-80fc-49bc-8adf-5ee45cf6f44f/pages/cdldiblrxvpop4jm203g.jpg'

async function main() {
  const keep = process.argv[2] === 'keep'
  const { db } = await import('../lib/db')
  const schema = await import('../lib/db/schema')
  const { eq } = await import('drizzle-orm')
  const sharp = (await import('sharp')).default
  const { buildPrintPdf } = await import('../lib/print/pdf')
  const ops = await import('../lib/print/orders/ops')
  const server = await import('../lib/print/orders/server')
  const { pageView } = await import('../lib/print/orders/views')
  const { handleRpc } = await import('../lib/print/orders/mcp')

  const owner = await db.query.users.findFirst({ where: eq(schema.users.email, (process.env.ADMIN_EMAIL || '').split(',')[0].trim()) })
  if (!owner) throw new Error('No ADMIN_EMAIL user')
  const who = { userId: owner.id, actor: 'api' as const }
  const step = (label: string, x: unknown) => console.log(`\n== ${label}\n`, typeof x === 'string' ? x : JSON.stringify(x, null, 1).slice(0, 1400))

  // A two-page 6x4 postcard PDF, with bleed, from our own writer.
  const card = async (color: string, text: string) =>
    new Uint8Array(await sharp({ create: { width: 1875, height: 1275, channels: 3, background: color } }).composite([{ input: Buffer.from(`<svg width="1875" height="1275"><text x="200" y="700" font-family="Arial" font-size="180" fill="white">${text}</text></svg>`) }]).jpeg().toBuffer())
  const spec = { id: 'x', name: 'Postcard', widthIn: 6, heightIn: 4, bleedIn: 0.125, safeIn: 0.125, pages: [{ label: 'Front' }, { label: 'Back' }] }
  const pdf = buildPrintPdf(spec as never, [{ jpeg: await card('#0f766e', 'Spring Sale'), width: 1875, height: 1275 }, { jpeg: await card('#1e3a8a', 'Call 614-555-0100'), width: 1875, height: 1275 }])
  const pdfUrl = `data:application/pdf;base64,${Buffer.from(pdf).toString('base64')}`

  // Validation errors name the field.
  try {
    await ops.createOrderOp(who, { jobs: [{ product: { width: 4 } , artwork: [{ url: 'ftp://x' }] }] }, 'api')
  } catch (e) {
    step('bad payload is refused with fields', { message: (e as Error).message, fields: (e as { fields?: unknown }).fields })
  }

  const t0 = Date.now()
  const made = await ops.createOrderOp(
    who,
    {
      externalId: `selftest-${Date.now()}`,
      ref: 'TEST-1001',
      customer: { name: 'Pat Example', phone: '614-555-0100' },
      approvalHours: 48,
      notifyCustomer: false,
      metadata: { source: 'selftest' },
      offer: { title: 'Need yard signs too?', body: '20% off a matching set this week.', url: 'https://example.com', cta: 'See signs' },
      jobs: [
        { externalId: 'line-1', name: 'Door hangers', quantity: 500, product: { key: 'door-hanger', shape: 'square', sku: 'DH-425x11', stock: '14pt gloss' }, artwork: [{ url: ART, page: 'front', filename: 'yard-sign.jpg', origin: { madeBy: 'customer', madeWith: 'Canva', via: 'upload', aiGenerated: false } }] },
        { externalId: 'line-2', name: 'Postcards', quantity: 1000, product: { width: 6, height: 4, bleed: 0.125, safe: 0.125, pages: ['Front', 'Back'], sku: 'PC-6x4' }, artwork: [{ url: pdfUrl, filename: 'postcard.pdf' }] },
      ],
    },
    'api',
  )
  const order = made.order
  step(`order created in ${Date.now() - t0} ms`, { id: order.id, ref: order.ref, links: order.links, jobs: order.jobs?.map((j) => ({ id: j.id, name: j.name, status: j.status, lockAt: j.lockAt, pages: j.pages.map((p) => ({ label: p.label, original: !!p.original, w: p.original?.width, h: p.original?.height })), customer: j.links.customer })) })

  const again = await ops.createOrderOp(who, { externalId: order.externalId, jobs: [{ product: { key: 'flyer-letter' } }] }, 'api')
  step('same externalId returns the same order', { created: again.created, sameId: again.order.id === order.id })

  const [hanger, postcard] = order.jobs!
  const hangerRow = (await server.findJob(owner.id, hanger.id))!
  const orderRow = (await server.findOrder(owner.id, order.id))!

  // Wait for the background print check on the door hanger.
  for (let i = 0; i < 40; i++) {
    const d = await server.designOf(hangerRow)
    if (d.pages[0].versions[0]?.check) break
    await new Promise((r) => setTimeout(r, 1500))
  }
  const printerView = await pageView(hangerRow, orderRow, 'printer')
  step('printer view: fit, checks, siblings', { fit: printerView.fit, checks: printerView.checks, siblings: printerView.siblings.map((s) => [s.name, s.status, !!s.thumb]), events: printerView.events.map((e) => `${e.actor}:${e.type} ${e.message ?? ''}`) })

  await ops.sendProofOp(who, hanger.id, { message: 'Your file was a yard sign shape, so we fit it to the door hanger.', changes: [{ kind: 'fit', text: 'Fit the design to the 4.25 × 11 in door hanger' }], notify: false })
  const customerView = await pageView((await server.jobByToken(hangerRow.token))!, orderRow, 'customer')
  step('customer view after proof', { status: customerView.job.status, timeLeft: customerView.job.timeLeft, can: customerView.can, proof: customerView.proof, hasProofImage: !!customerView.pages[0].proof, leaksDesignId: customerView.job.designId ?? null, leaksCustomer: customerView.order.customer ?? null })

  await server.requestChanges((await server.jobByToken(hangerRow.token))!, { note: 'Can the phone number be bigger?', marks: [{ page: 0, marks: [{ id: 'm1', n: 1, kind: 'ellipse', pts: [[[0.4, 0.8], [0.95, 0.95]]], note: 'bigger please', status: 'open', at: 0 }] }], by: 'Pat' }, 'customer')
  const afterChanges = await pageView((await server.jobByToken(hangerRow.token))!, orderRow, 'customer')
  step('customer asked for a change', { status: afterChanges.job.status, marks: afterChanges.pages[0].marks.map((m) => [m.n, m.kind, m.note, m.by]) })

  await ops.sendProofOp(who, hanger.id, { message: 'Made the phone number bigger.', changes: ['Phone number enlarged'], notify: false })
  await server.approveJob((await server.jobByToken(hangerRow.token))!, 'customer', 'Pat')
  const approved = await ops.getJobOp(who, hanger.id)
  step('approved', { status: approved.status, approvedBy: approved.approvedBy, final: approved.pages.map((p) => p.final?.url?.slice(-30)) })

  const rpc = async (method: string, params?: Record<string, unknown>) => handleRpc(who, { jsonrpc: '2.0', id: 1, method, params })
  const tools = (await rpc('tools/list')) as { result: { tools: { name: string }[] } }
  const viaMcp = (await rpc('tools/call', { name: 'get_job', arguments: { id: postcard.id } })) as { result: { structuredContent: { status: string; pages: { label: string }[] } } }
  step('mcp', { tools: tools.result.tools.map((t) => t.name), postcard: { status: viaMcp.result.structuredContent.status, pages: viaMcp.result.structuredContent.pages.map((p) => p.label) } })

  const events = await ops.eventsOp(who, hanger.id)
  step('timeline', events.events.map((e) => `${e.at.slice(11, 19)} ${e.actor} ${e.type} ${e.message ?? ''}`))

  if (!keep) {
    for (const j of order.jobs!) await db.delete(schema.printDesigns).where(eq(schema.printDesigns.id, (await server.findJob(owner.id, j.id))!.designId))
    await db.delete(schema.printOrders).where(eq(schema.printOrders.id, order.id))
    step('cleaned up', order.id)
  } else {
    step('kept', { printer: order.links.printer, customer: hanger.links.customer, orderPage: order.links.customer })
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
