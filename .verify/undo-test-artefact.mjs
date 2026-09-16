/**
 * Undo the test artefact I left behind.
 *
 * I changed the composer label to "Launch" to prove a cosmetic edit lands, then
 * reverted only the CODE. The instruction stayed in the thread and — worse — the
 * build that made it had written it into the contract as a standing requirement. So
 * the next build, accidental or not, was always going to put it back. Reverting the
 * code was not reverting the change.
 */
import fs from 'fs'
import { createClient } from '@libsql/client'
const env = fs.readFileSync(process.env.ENV_FILE, 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim()
const client = createClient({ url: get('DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') })

const { rows } = await client.execute({
  sql: `SELECT id, code, requirements, messages FROM playground_apps WHERE title LIKE ?`,
  args: ['%Launch Simulator%'],
})
const a = rows[0]

// 1. The contract line that keeps resurrecting it.
const kept = a.requirements.split('\n').filter((l) => !/labeled?\s+"?Launch"?/i.test(l))
// 2. The code.
const code = a.code.split('\n').map((l) => (l.trim() === 'Launch' ? l.replace('Launch', 'Post') : l)).join('\n')
// 3. The stale instructions in the thread, so nothing reads them as a live request.
const msgs = JSON.parse(a.messages || '[]')
const cleaned = msgs.filter((m) => {
  const c = String(m.content || '')
  return !/the Post button label should read "Launch"/i.test(c)
      && !/Purely cosmetic: make the "Post" button corners fully rounded/i.test(c)
      && !/Changed the button label in the composer from/i.test(c)
      && !/Ensured the Post button has fully rounded pill corners/i.test(c)
})

if (process.argv.includes('--fix')) {
  await client.execute({
    sql: `UPDATE playground_apps SET code = ?, requirements = ?, messages = ?, updated_at = ? WHERE id = ?`,
    args: [code, kept.join('\n'), JSON.stringify(cleaned), Math.floor(Date.now()/1000), a.id],
  })
}
console.log(`contract lines: ${a.requirements.split('\n').filter(Boolean).length} -> ${kept.filter(Boolean).length}`)
console.log(`thread messages: ${msgs.length} -> ${cleaned.length}`)
console.log(`label line now: ${code.split('\n').find((l) => /^\s*(Post|Launch)\s*$/.test(l))?.trim()}`)
console.log(process.argv.includes('--fix') ? 'APPLIED' : '(dry run — pass --fix)')
process.exit(0)
