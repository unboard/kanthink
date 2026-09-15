/**
 * What is actually in app_customer_data, read straight from the production
 * database rather than from anything the page says.
 */
import fs from 'fs'
import { createClient } from '@libsql/client'

const env = fs.readFileSync(process.env.ENV_FILE ?? '.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const client = createClient({ url: get('DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') })

const { rows } = await client.execute({
  sql: `SELECT u.email, d.scope, d.key, d.bytes, d.updated_at, d.value
        FROM app_customer_data d
        JOIN app_users u ON u.id = d.app_user_id
        JOIN playground_apps a ON a.id = d.app_id
        WHERE a.title = 'Verbo'
        ORDER BY u.email, d.scope, d.key`,
  args: [],
})

if (!rows.length) { console.log('(no rows)'); process.exit(0) }
for (const r of rows) {
  console.log(`${r.email}  [${r.scope}]  ${r.key}  ${r.bytes}B  updated ${new Date(r.updated_at * 1000).toISOString()}`)
  console.log('    ' + r.value.slice(0, 400))
}
process.exit(0)
