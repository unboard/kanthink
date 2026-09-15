/**
 * Clear the fixtures left behind by the storage demonstration, so the real
 * sign-in walkthrough starts from nothing.
 *
 * Removes the two example.com customers, their saved rows, and the owner's draft
 * scribble. Leaves the app, its releases and its thread alone.
 */
import fs from 'fs'
import { createClient } from '@libsql/client'

const env = fs.readFileSync(process.env.ENV_FILE ?? '.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const client = createClient({ url: get('DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') })

const APP = 'fcc981b8-d6db-46c0-88aa-9b961d7e49f3'

const { rows: before } = await client.execute({
  sql: `SELECT u.email, u.verified_at, COUNT(d.id) AS rows
        FROM app_users u LEFT JOIN app_customer_data d ON d.app_user_id = u.id
        WHERE u.app_id = ? GROUP BY u.id`,
  args: [APP],
})
console.log('before:', JSON.stringify(before))

await client.execute({
  sql: `DELETE FROM app_customer_data WHERE app_id = ? AND app_user_id IN
        (SELECT id FROM app_users WHERE app_id = ? AND email LIKE '%@example.com')`,
  args: [APP, APP],
})
await client.execute({
  sql: `DELETE FROM app_users WHERE app_id = ? AND email LIKE '%@example.com'`,
  args: [APP],
})
// The owner's draft scribble from the scope test.
await client.execute({
  sql: `DELETE FROM app_customer_data WHERE app_id = ? AND scope = 'draft'`,
  args: [APP],
})

const { rows: after } = await client.execute({
  sql: `SELECT u.email, u.verified_at, COUNT(d.id) AS rows
        FROM app_users u LEFT JOIN app_customer_data d ON d.app_user_id = u.id
        WHERE u.app_id = ? GROUP BY u.id`,
  args: [APP],
})
const { rows: app } = await client.execute({
  sql: `SELECT paywall_enabled, price_amount, is_public, share_token FROM playground_apps WHERE id = ?`,
  args: [APP],
})
console.log('after: ', JSON.stringify(after))
console.log('app:   ', JSON.stringify(app[0]))
process.exit(0)
