import { readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(import.meta.dirname || __dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx < 0) continue
  const key = trimmed.slice(0, eqIdx)
  const val = trimmed.slice(eqIdx + 1)
  if (!process.env[key]) process.env[key] = val
}

const SOURCE_EMAIL = 'dhodg22@gmail.com'
const TARGET_EMAIL = 'amber.hodgson3@gmail.com'

async function main() {
  const { db } = await import('../lib/db')
  const { users } = await import('../lib/db/schema')
  const { eq, like } = await import('drizzle-orm')
  const { resolveProviderKeys, setProviderKey, userOwnedProviders } = await import('../lib/ai/keys')

  const source = await db.query.users.findFirst({ where: eq(users.email, SOURCE_EMAIL) })
  const target = await db.query.users.findFirst({ where: eq(users.email, TARGET_EMAIL) })

  if (!source) throw new Error(`Source user not found: ${SOURCE_EMAIL}`)

  if (!target) {
    console.log(`No exact match for ${TARGET_EMAIL}. Searching for similar emails…`)
    const candidates = await db.query.users.findMany({
      where: like(users.email, '%amber%'),
      columns: { id: true, email: true, name: true },
    })
    console.log(`Candidates containing "amber":`, candidates)

    const candidates2 = await db.query.users.findMany({
      where: like(users.email, '%hodgson%'),
      columns: { id: true, email: true, name: true },
    })
    console.log(`Candidates containing "hodgson":`, candidates2)

    const allUsers = await db.query.users.findMany({
      columns: { id: true, email: true, name: true },
    })
    console.log(`\nTotal users in DB: ${allUsers.length}`)
    throw new Error(`Target user not found: ${TARGET_EMAIL}`)
  }

  console.log(`Source: ${source.name} <${source.email}> id=${source.id}`)
  console.log(`Target: ${target.name} <${target.email}> id=${target.id}`)

  // Keys are held per provider now, so a copy means every provider the source
  // has — copying only one of two would look like it worked and silently leave
  // the target unable to run half its models.
  const sourceKeys = await resolveProviderKeys(source.id)
  if (sourceKeys.error) throw new Error(`Source decrypt failed: ${sourceKeys.error}`)

  const owned = await userOwnedProviders(source.id)
  if (owned.length === 0) throw new Error('Source has no API keys of its own to copy')

  console.log(`\nSource keys: ${owned.join(', ')}`)
  for (const provider of owned) {
    const key = sourceKeys.keys[provider]
    if (!key) continue
    console.log(`  ${provider}: ${key.apiKey.slice(0, 8)}…(${key.apiKey.length} chars)`)
    await setProviderKey(target.id, provider, key.apiKey)
  }

  const targetAfter = await userOwnedProviders(target.id)
  console.log(`\nTarget keys after: ${targetAfter.join(', ') || 'none'}`)

  const ok = owned.every((provider) => targetAfter.includes(provider))

  console.log(`\n${ok ? 'OK — settings match.' : 'MISMATCH — please review.'}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => process.exit(0))
