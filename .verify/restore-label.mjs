/**
 * Put the composer button back to "Post".
 *
 * The label was changed to "Launch" to prove a cosmetic edit lands without a rewrite.
 * It did; this undoes it. A direct edit rather than a build, because spending a
 * generation to revert a test artefact would be its own small waste.
 */
import fs from 'fs'
import { createClient } from '@libsql/client'
const env = fs.readFileSync(process.env.ENV_FILE ?? '.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const client = createClient({ url: get('DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') })

const { rows } = await client.execute({
  sql: `SELECT id, code FROM playground_apps WHERE title LIKE ? LIMIT 1`, args: ['%Launch Simulator%'],
})
const app = rows[0]
const lines = app.code.split('\n')

// Only the standalone label line the build changed — not every occurrence of the word.
let changed = 0
const next = lines.map((l) => {
  if (l.trim() === 'Launch') { changed++; return l.replace('Launch', 'Post') }
  return l
}).join('\n')

if (changed === 0) { console.log('no standalone "Launch" label found — nothing to do'); process.exit(0) }
if (process.argv.includes('--fix')) {
  await client.execute({ sql: `UPDATE playground_apps SET code = ? WHERE id = ?`, args: [next, app.id] })
  console.log(`restored ${changed} label line(s) to "Post"`)
} else {
  console.log(`would restore ${changed} label line(s); pass --fix`)
}
process.exit(0)
