/**
 * Does a recorded purchase actually open the door, and does a refund close it?
 *
 * Runs the real hasActiveAccess / purchasesForMember against the production rows —
 * the same functions the published page calls — rather than re-deriving the answer.
 */
import fs from 'fs'

const env = fs.readFileSync('.verify/combined.env', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  // Vercel's env dump quotes values; libsql will not parse a quoted URL.
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

async function main() {
const APP = 'fcc981b8-d6db-46c0-88aa-9b961d7e49f3'
const ALICE = 'c3b50498-feb3-4659-8fe4-f83d15624605'

const { db } = await import('../lib/db')
const { playgroundApps, appUsers } = await import('../lib/db/schema')
const { eq } = await import('drizzle-orm')
const { hasActiveAccess, isPaywalled, signAccessToken, verifyAccessToken } =
  await import('../lib/playground/appAccess')
const { purchasesForMember, toRef } = await import('../lib/playground/appPurchases')
const { readAll } = await import('../lib/playground/customerData')

const app = (await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, APP) }))!
const member = (await db.query.appUsers.findFirst({ where: eq(appUsers.id, ALICE) }))!
const purchases = (await purchasesForMember(ALICE)).map(toRef)

// The session a verified sign-in would produce.
const session = verifyAccessToken(signAccessToken(member.id, member.sessionEpoch ?? 0, 'verified'))

const saved = await readAll(APP, ALICE, 'live')

console.log(JSON.stringify({
  appIsPaywalled: isPaywalled(app),
  price: app.priceAmount ? `$${(app.priceAmount / 100).toFixed(2)} ${app.priceInterval}` : null,
  purchases: purchases.map((p) => ({ status: p.status, expires: p.accessExpiresAt })),
  aliceHasAccess: hasActiveAccess(app, session, purchases),
  strangerHasAccess: hasActiveAccess(app, null, []),
  aliceSavedKeys: saved.map((r) => ({ key: r.key, value: r.value })),
}, null, 2))
process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
