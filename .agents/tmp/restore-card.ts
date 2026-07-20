import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@libsql/client'

function loadEnv(): Record<string, string> {
  const scriptDir = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url))
  const envPath = resolve(scriptDir, '..', '..', '.env.local')
  const content = readFileSync(envPath, 'utf-8')
  const env: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    env[t.slice(0, i)] = t.slice(i + 1)
  }
  return env
}

const env = loadEnv()
const db = createClient({ url: env.DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })

;(async () => {
  // Restore the test card's isPublic to false. The test card was already
  // identifiable by name; restore conservatively only that card.
  const r = await db.execute({
    sql: 'UPDATE cards SET is_public = 0 WHERE id = ?',
    args: ['S9FJ0072y9ytsue0qXGdo'],
  })
  console.log('restored isPublic=0 on S9FJ0072y9ytsue0qXGdo  rowsAffected=', r.rowsAffected)
})()
