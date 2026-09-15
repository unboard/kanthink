/**
 * The paywall, and what a completed purchase does to it.
 *
 * Deliberately does NOT talk to Stripe. The configured key is live, so creating a
 * price would leave a real product in the user's catalogue and completing a checkout
 * would charge a real card. What this does instead is set the app's price directly
 * and then write the purchase row that the Stripe webhook writes — which is the only
 * thing downstream of the card form that anything in Kanthink actually reads.
 *
 *   node .verify/paywall.mjs on      — gate the app
 *   node .verify/paywall.mjs buy     — record Alice's purchase, as the webhook would
 *   node .verify/paywall.mjs refund  — end it
 *   node .verify/paywall.mjs off     — back to free, and tidy up
 */
import fs from 'fs'
import { createClient } from '@libsql/client'

const env = fs.readFileSync(process.env.ENV_FILE ?? '.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const client = createClient({ url: get('DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') })

const APP = 'fcc981b8-d6db-46c0-88aa-9b961d7e49f3'
const ALICE = 'c3b50498-feb3-4659-8fe4-f83d15624605'
const now = () => Math.floor(Date.now() / 1000)
const run = (sql, args = []) => client.execute({ sql, args })

const mode = process.argv[2]

if (mode === 'on') {
  await run(
    `UPDATE playground_apps SET paywall_enabled = 1, price_amount = 300, price_currency = 'usd',
     price_interval = 'one_time', stripe_price_id = 'price_demo_not_a_real_stripe_price',
     updated_at = ? WHERE id = ?`,
    [now(), APP],
  )
  console.log('Paywall on: $3.00 one-time. stripe_price_id is a placeholder, so checkout would fail — deliberately.')
}

if (mode === 'buy') {
  await run(
    `INSERT INTO app_purchases (id, app_id, app_user_id, status, stripe_checkout_session_id,
       stripe_payment_intent_id, amount, currency, interval, paid_at, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?, 300, 'usd', 'one_time', ?, ?, ?)`,
    [crypto.randomUUID(), APP, ALICE, 'cs_demo_' + now(), 'pi_demo_' + now(), now(), now(), now()],
  )
  // The roll-up the publisher's list reads. Derived, never the access decision.
  await run(`UPDATE app_users SET status = 'paid', amount_paid = 300, currency = 'usd', paid_at = ?,
             updated_at = ? WHERE id = ?`, [now(), now(), ALICE])
  console.log('Purchase recorded for Alice, exactly as the webhook writes it.')
}

if (mode === 'refund') {
  await run(`UPDATE app_purchases SET status = 'refunded', ended_at = ?, updated_at = ?
             WHERE app_user_id = ? AND app_id = ?`, [now(), now(), ALICE, APP])
  await run(`UPDATE app_users SET status = 'refunded', updated_at = ? WHERE id = ?`, [now(), ALICE])
  console.log('Purchase refunded.')
}

if (mode === 'off') {
  await run(
    `UPDATE playground_apps SET paywall_enabled = 0, price_amount = NULL, price_interval = NULL,
     stripe_price_id = NULL, updated_at = ? WHERE id = ?`,
    [now(), APP],
  )
  await run(`DELETE FROM app_purchases WHERE app_id = ? AND stripe_checkout_session_id LIKE 'cs_demo_%'`, [APP])
  await run(`UPDATE app_users SET status = 'free', amount_paid = NULL, paid_at = NULL, updated_at = ?
             WHERE id = ?`, [now(), ALICE])
  console.log('Back to free, demo purchases removed. Nothing was ever sent to Stripe.')
}

const { rows: app } = await run(
  `SELECT paywall_enabled, price_amount, price_currency FROM playground_apps WHERE id = ?`, [APP])
const { rows: buys } = await run(
  `SELECT status, amount, paid_at FROM app_purchases WHERE app_id = ?`, [APP])
const { rows: data } = await run(
  `SELECT COUNT(*) AS n FROM app_customer_data WHERE app_id = ? AND scope = 'live'`, [APP])

console.log('\napp:', JSON.stringify(app[0]))
console.log('purchases:', JSON.stringify(buys))
console.log('customer data rows (live):', data[0].n)
process.exit(0)
