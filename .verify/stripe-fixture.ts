/**
 * The app the payment test buys.
 *
 * Deliberately not Verbo, which stays free. This is a throwaway that carries the
 * same code, so it has real customer storage to check against after the refund —
 * the point of the refund half is that access closes and saved work does not.
 *
 *   npx tsx .verify/stripe-fixture.ts create   — card, app, release, share link
 *   npx tsx .verify/stripe-fixture.ts price    — set a test-mode price (needs the test key)
 *   npx tsx .verify/stripe-fixture.ts status   — where everything stands
 *   npx tsx .verify/stripe-fixture.ts destroy  — remove it all
 */
import fs from 'fs'
import crypto from 'crypto'

// The production database, and — when present — the local test-mode Stripe key.
// Loaded before anything imports lib/db or lib/stripe, so the override takes.
for (const file of ['.env.local', '.stripe-test.env']) {
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const CHANNEL = 'BfdFa4Vq2fm-VygHu4QPX'      // Playground apps
const SOURCE = 'fcc981b8-d6db-46c0-88aa-9b961d7e49f3'  // Verbo, for its code
const TITLE = 'Checkout Test'

async function main() {
  const mode = process.argv[2] ?? 'status'

  const { db } = await import('../lib/db')
  const { playgroundApps, playgroundAppVersions, cards, channels, appUsers, appPurchases, appCustomerData } =
    await import('../lib/db/schema')
  const { eq, and } = await import('drizzle-orm')

  const existing = await db.query.playgroundApps.findFirst({
    where: eq(playgroundApps.title, TITLE),
  })

  if (mode === 'create') {
    if (existing) { console.log('already exists:', existing.id); return report(existing.id) }

    const source = (await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, SOURCE) }))!
    const channel = (await db.query.channels.findFirst({ where: eq(channels.id, CHANNEL) }))!
    const now = new Date()

    const cardId = crypto.randomUUID()
    await db.insert(cards).values({
      id: cardId,
      channelId: CHANNEL,
      columnId: (await db.query.columns.findFirst({ where: eq((await import('../lib/db/schema')).columns.channelId, CHANNEL) }))!.id,
      title: 'Payment test',
      description: 'Throwaway card for verifying Stripe checkout end to end. Safe to delete.',
      position: 99999,
      createdAt: now,
      updatedAt: now,
    } as never)

    const appId = crypto.randomUUID()
    const shareToken = crypto.randomBytes(12).toString('base64url')
    await db.insert(playgroundApps).values({
      id: appId,
      channelId: CHANNEL,
      cardId,
      title: TITLE,
      tagline: 'A throwaway app used to verify Stripe checkout.',
      code: source.code,
      dependencies: source.dependencies,
      isPublic: true,
      shareToken,
      generationCount: 1,
      createdAt: now,
      updatedAt: now,
    } as never)

    const versionId = crypto.randomUUID()
    await db.insert(playgroundAppVersions).values({
      id: versionId,
      appId,
      version: 1,
      title: TITLE,
      code: source.code,
      dependencies: source.dependencies,
      notes: 'Payment test fixture.',
      publishedAt: now,
      createdAt: now,
    } as never)
    await db.update(playgroundApps)
      .set({ publishedVersionId: versionId, updatedAt: now })
      .where(eq(playgroundApps.id, appId))

    console.log(`created app ${appId}`)
    console.log(`channel owner ${channel.ownerId}`)
    return report(appId)
  }

  if (!existing) { console.log('no fixture; run create first'); return }

  if (mode === 'price') {
    const { syncAppPrice, validatePriceInput } = await import('../lib/playground/appPricing')
    const key = process.env.STRIPE_SECRET_KEY ?? ''
    if (!key.startsWith('sk_test_')) {
      console.log(`REFUSING: STRIPE_SECRET_KEY is not a test key (starts "${key.slice(0, 8)}").`)
      console.log('Put a test key in .stripe-test.env first.')
      process.exit(1)
    }
    const price = validatePriceInput({ amount: 300, currency: 'usd', interval: 'one_time' })
    const { productId, priceId } = await syncAppPrice(existing, price)
    await db.update(playgroundApps).set({
      paywallEnabled: true,
      priceAmount: price.amount,
      priceCurrency: price.currency,
      priceInterval: price.interval,
      stripeProductId: productId,
      stripePriceId: priceId,
      updatedAt: new Date(),
    }).where(eq(playgroundApps.id, existing.id))
    console.log(`test-mode price created: ${priceId}`)
    return report(existing.id)
  }

  if (mode === 'destroy') {
    await db.delete(appCustomerData).where(eq(appCustomerData.appId, existing.id))
    await db.delete(appPurchases).where(eq(appPurchases.appId, existing.id))
    await db.delete(appUsers).where(eq(appUsers.appId, existing.id))
    await db.delete(playgroundAppVersions).where(eq(playgroundAppVersions.appId, existing.id))
    await db.delete(playgroundApps).where(eq(playgroundApps.id, existing.id))
    if (existing.cardId) await db.delete(cards).where(eq(cards.id, existing.cardId))
    console.log('fixture removed.')
    return
  }

  return report(existing.id)

  async function report(appId: string) {
    const app = (await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) }))!
    const members = await db.select().from(appUsers).where(eq(appUsers.appId, appId))
    const buys = await db.select().from(appPurchases).where(eq(appPurchases.appId, appId))
    const data = await db.select().from(appCustomerData).where(
      and(eq(appCustomerData.appId, appId), eq(appCustomerData.scope, 'live')))

    console.log(JSON.stringify({
      appId,
      shareUrl: `/play/${app.shareToken}`,
      published: !!app.publishedVersionId,
      paywallEnabled: app.paywallEnabled,
      price: app.priceAmount ? `$${(app.priceAmount / 100).toFixed(2)}` : null,
      stripePriceId: app.stripePriceId,
      customers: members.map((m) => ({ email: m.email, verified: !!m.verifiedAt, status: m.status })),
      purchases: buys.map((p) => ({ status: p.status, amount: p.amount, session: p.stripeCheckoutSessionId })),
      savedRows: data.map((d) => ({ key: d.key, bytes: d.bytes })),
    }, null, 2))
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
