/**
 * checkout → webhook → purchase → access, and then refund.
 *
 * Reads the real rows and calls the real access functions; nothing here writes a
 * purchase or decides entitlement on its own.
 *
 *   npx tsx .verify/stripe-journey.ts checkout  — start a session, print the URL to pay at
 *   npx tsx .verify/stripe-journey.ts seed      — give the buyer some saved work to lose
 *   npx tsx .verify/stripe-journey.ts check     — where access stands, and what is saved
 */
import fs from 'fs'
import crypto from 'crypto'

for (const file of ['.env.local', '.stripe-test.env']) {
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const TITLE = 'Checkout Test'
const BUYER = process.env.TEST_BUYER ?? 'dhodg22@gmail.com'
const LOCAL = 'http://localhost:3000'

async function main() {
  const mode = process.argv[2] ?? 'check'

  const { db } = await import('../lib/db')
  const { playgroundApps, appUsers, appPurchases, appCustomerData } = await import('../lib/db/schema')
  const { eq, and } = await import('drizzle-orm')
  const { hasActiveAccess, isPaywalled, signAccessToken, verifyAccessToken } =
    await import('../lib/playground/appAccess')
  const { purchasesForMember, toRef } = await import('../lib/playground/appPurchases')

  const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.title, TITLE) })
  if (!app) { console.log('No fixture. Run stripe-fixture.ts create.'); return }

  if (mode === 'checkout') {
    // The real endpoint a buyer hits. It mints the Stripe session and hands back
    // the URL; nothing about the payment is simulated from here on.
    const res = await fetch(`${LOCAL}/api/play/${app.shareToken}/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: BUYER }),
    })
    const data = await res.json()
    if (!data.checkoutUrl) {
      console.log(`No checkout URL (HTTP ${res.status}):`, JSON.stringify(data))
      return
    }
    console.log('\nPay here (test mode — card 4242 4242 4242 4242, any future expiry, any CVC):\n')
    console.log(data.checkoutUrl + '\n')
    return
  }

  const member = await db.query.appUsers.findFirst({
    where: and(eq(appUsers.appId, app.id), eq(appUsers.email, BUYER)),
  })

  if (mode === 'seed') {
    if (!member) { console.log('No buyer row yet — start checkout first.'); return }
    const { write } = await import('../lib/playground/customerData')
    const result = await write(app.id, member.id, 'live', 'stats', {
      streak: 4, totalRounds: 3, correctAnswers: 26, totalQuestions: 30,
      verbMistakes: { poder: 2, saber: 1 }, bestScore: 10, bestScoreTotal: 10,
      note: 'work done before the refund',
    })
    console.log(result.ok ? 'seeded saved work for the buyer' : `refused: ${JSON.stringify(result)}`)
    return
  }

  // ── check ──────────────────────────────────────────────────────────────
  const purchases = member ? (await purchasesForMember(member.id)).map(toRef) : []
  const session = member
    ? verifyAccessToken(signAccessToken(member.id, member.sessionEpoch ?? 0, 'purchase'))
    : null
  const saved = member
    ? await db.select().from(appCustomerData).where(
        and(eq(appCustomerData.appId, app.id), eq(appCustomerData.appUserId, member.id)))
    : []
  const rows = await db.select().from(appPurchases).where(eq(appPurchases.appId, app.id))

  console.log(JSON.stringify({
    app: { title: app.title, paywalled: isPaywalled(app), price: app.priceAmount, priceId: app.stripePriceId },
    buyer: member ? { email: member.email, status: member.status, verified: !!member.verifiedAt } : null,
    purchaseRows: rows.map((p) => ({
      status: p.status,
      amount: p.amount,
      session: p.stripeCheckoutSessionId,
      paymentIntent: p.stripePaymentIntentId,
      endedAt: p.endedAt,
    })),
    buyerHasAccess: member ? hasActiveAccess(app, session, purchases) : false,
    strangerHasAccess: hasActiveAccess(app, null, []),
    savedWork: saved.map((d) => ({ key: d.key, bytes: d.bytes, value: JSON.parse(d.value) })),
  }, null, 2))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
