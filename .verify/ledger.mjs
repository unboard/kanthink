import fs from 'fs'
import { createClient } from '@libsql/client'
const env = fs.readFileSync(process.env.ENV_FILE, 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim()
const client = createClient({ url: get('DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') })
const { rows } = await client.execute({
  sql: `SELECT u.created_at, a.title, u.kind, u.model, u.is_draft, u.status,
               u.reserved_millicents, u.actual_millicents, u.note
        FROM app_ai_usage u LEFT JOIN playground_apps a ON a.id = u.app_id
        ORDER BY u.created_at DESC LIMIT 25`,
  args: [],
})
if (!rows.length) { console.log('LEDGER IS EMPTY — no in-app AI call has ever been reserved.'); process.exit(0) }
console.log(`${rows.length} most recent in-app AI calls:\n`)
for (const r of rows) {
  const when = new Date(r.created_at * 1000).toISOString().slice(5, 16)
  console.log(`  ${when}  ${String(r.title).padEnd(20)} ${String(r.kind).padEnd(6)} ${String(r.model || '?').padEnd(30)} ${r.is_draft ? 'draft' : 'live '} ${String(r.status).padEnd(9)} res=${r.reserved_millicents} act=${r.actual_millicents ?? '-'}${r.note ? '  ' + r.note : ''}`)
}
process.exit(0)
