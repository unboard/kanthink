/**
 * Everything about one app's iteration: its versions, its thread, and how much the
 * code actually moved between builds.
 *
 *   node .verify/app-history.mjs "Product launch simulator"
 */
import fs from 'fs'
import { createClient } from '@libsql/client'

const env = fs.readFileSync(process.env.ENV_FILE ?? '.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const client = createClient({ url: get('DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') })

const needle = process.argv[2] ?? 'Product launch'

const { rows: apps } = await client.execute({
  sql: `SELECT a.id, a.title, a.card_id, a.generation_count, a.model_id, a.last_model_id,
               LENGTH(a.code) AS code_len, a.updated_at, c.title AS card_title
        FROM playground_apps a LEFT JOIN cards c ON c.id = a.card_id
        WHERE a.title LIKE ? OR c.title LIKE ?
        ORDER BY a.updated_at DESC`,
  args: [`%${needle}%`, `%${needle}%`],
})

if (!apps.length) {
  const { rows: all } = await client.execute({
    sql: `SELECT a.title, c.title AS card FROM playground_apps a LEFT JOIN cards c ON c.id = a.card_id
          ORDER BY a.updated_at DESC LIMIT 40`, args: [],
  })
  console.log('No match. Recent apps:')
  for (const r of all) console.log(`  ${r.title}   (card: ${r.card})`)
  process.exit(0)
}

for (const app of apps) {
  console.log('='.repeat(78))
  console.log(`${app.title}   card: ${app.card_title}`)
  console.log(`  id ${app.id}`)
  console.log(`  builds: ${app.generation_count}   code: ${app.code_len} chars`)
  console.log(`  model setting: ${app.model_id ?? '(auto)'}   last built with: ${app.last_model_id ?? '?'}`)

  const { rows: versions } = await client.execute({
    sql: `SELECT version, title, notes, LENGTH(code) AS code_len, published_at
          FROM playground_app_versions WHERE app_id = ? ORDER BY version`,
    args: [app.id],
  })
  console.log(`\n  RELEASES (${versions.length}):`)
  for (const v of versions) {
    console.log(`    v${v.version}  ${v.code_len} chars  ${new Date(v.published_at * 1000).toISOString().slice(0, 16)}`)
    if (v.notes) console.log(`        ${String(v.notes).slice(0, 160)}`)
  }

  const { rows: full } = await client.execute({
    sql: `SELECT messages, design_notes, last_notes, last_usage FROM playground_apps WHERE id = ?`,
    args: [app.id],
  })
  let msgs = []
  try { msgs = JSON.parse(full[0].messages ?? "[]") } catch { msgs = [] }

  console.log(`
  DESIGN NOTES: ${String(full[0].design_notes ?? "(none)").slice(0, 300)}`)
  console.log(`  LAST NOTES:   ${String(full[0].last_notes ?? "(none)").slice(0, 300)}`)

  console.log(`
  THREAD (${msgs.length} messages):`)
  msgs.forEach((m, i) => {
    const body = String(m.content ?? m.text ?? "").replace(/s+/g, " ").trim()
    console.log(`
  #${i} ${String(m.role ?? m.sender ?? "?").toUpperCase()}${m.model ? "  (" + m.model + ")" : ""}`)
    console.log(`    ${body.slice(0, 900)}${body.length > 900 ? " …" : ""}`)
  })
  console.log()
}
process.exit(0)
