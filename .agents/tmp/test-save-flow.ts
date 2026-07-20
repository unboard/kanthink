import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@libsql/client'
import crypto from 'crypto'

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
  // Find a playground card to test against
  const r = await db.execute({
    sql: `SELECT id, title, type_data, share_token, is_public FROM cards WHERE card_type = 'playground' AND type_data IS NOT NULL LIMIT 1`,
    args: [],
  })
  if (!r.rows.length) { console.error('no playground card found'); process.exit(1) }
  const card = r.rows[0]
  console.log(`Using card: ${card.id} (${card.title})`)
  console.log(`  isPublic=${card.is_public}  shareToken=${card.share_token}`)

  // Mint a cardToken like the server does
  const SECRET = env.PLAYGROUND_TOKEN_SECRET || env.NEXTAUTH_SECRET || env.AUTH_SECRET || 'kanthink-playground-dev-secret'
  const hmac = crypto.createHmac('sha256', SECRET).update(card.id as string).digest('hex').slice(0, 32)
  const cardToken = `${card.id}.${hmac}`

  // Call the save endpoint — needs the dev server running
  const baseUrl = process.env.SAVE_BASE_URL || 'http://localhost:3000'
  console.log(`\nPOST ${baseUrl}/api/playground/save`)
  const res = await fetch(`${baseUrl}/api/playground/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cardToken,
      data: { title: 'Origami Crane', steps: ['Fold square paper diagonally', 'Repeat 17 times'] },
      label: 'Test Idea',
    }),
  })
  const body = await res.json()
  console.log('  status:', res.status)
  console.log('  body:  ', JSON.stringify(body, null, 2))

  if (!res.ok) process.exit(1)

  // Verify the public per-record route renders
  const recordUrl = `${baseUrl}${body.url}`
  console.log(`\nGET ${recordUrl}`)
  const pageRes = await fetch(recordUrl)
  console.log('  status:', pageRes.status)
  const html = await pageRes.text()
  const hasInitial = html.includes('"slug":"' + body.slug + '"')
  const hasOrigamiInBaked = html.includes('Origami Crane')
  console.log(`  iframe contains slug: ${hasInitial ? 'YES' : 'no'}`)
  console.log(`  iframe contains data ("Origami Crane"): ${hasOrigamiInBaked ? 'YES' : 'no'}`)

  // Clean up: remove the test record so we don't pollute the card
  const updatedTypeData = JSON.parse(card.type_data as string)
  updatedTypeData.savedRecords = (updatedTypeData.savedRecords || []).filter((rec: any) => rec.slug !== body.slug)
  await db.execute({
    sql: 'UPDATE cards SET type_data = ? WHERE id = ?',
    args: [JSON.stringify(updatedTypeData), card.id as string],
  })
  console.log('\n  ✓ cleanup done — test record removed')
})()
