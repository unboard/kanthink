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
  const { getUserByokConfigWithError, setUserByokConfig } = await import('../lib/usage')

  const source = await db.query.users.findFirst({ where: eq(users.email, SOURCE_EMAIL) })
  let target = await db.query.users.findFirst({ where: eq(users.email, TARGET_EMAIL) })

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

  const sourceCfg = await getUserByokConfigWithError(source.id)
  if (sourceCfg.error) throw new Error(`Source decrypt failed: ${sourceCfg.error}`)
  if (!sourceCfg.config?.apiKey || !sourceCfg.config?.provider) {
    throw new Error(`Source has no BYOK config to copy`)
  }

  console.log(`\nSource BYOK:`)
  console.log(`  provider: ${sourceCfg.config.provider}`)
  console.log(`  model:    ${sourceCfg.config.model}`)
  console.log(`  key:      ${sourceCfg.config.apiKey.slice(0, 8)}…(${sourceCfg.config.apiKey.length} chars)`)

  const targetBefore = await getUserByokConfigWithError(target.id)
  console.log(`\nTarget BYOK before:`)
  console.log(`  provider: ${targetBefore.config?.provider ?? 'none'}`)
  console.log(`  model:    ${targetBefore.config?.model ?? 'none'}`)
  console.log(`  has key:  ${!!targetBefore.config?.apiKey}`)

  await setUserByokConfig(target.id, {
    provider: sourceCfg.config.provider,
    apiKey: sourceCfg.config.apiKey,
    model: sourceCfg.config.model ?? undefined,
  })

  const targetAfter = await getUserByokConfigWithError(target.id)
  console.log(`\nTarget BYOK after:`)
  console.log(`  provider: ${targetAfter.config?.provider ?? 'none'}`)
  console.log(`  model:    ${targetAfter.config?.model ?? 'none'}`)
  console.log(`  key:      ${targetAfter.config?.apiKey?.slice(0, 8)}…(${targetAfter.config?.apiKey?.length} chars)`)

  const ok =
    targetAfter.config?.provider === sourceCfg.config.provider &&
    targetAfter.config?.model === sourceCfg.config.model &&
    targetAfter.config?.apiKey === sourceCfg.config.apiKey

  console.log(`\n${ok ? 'OK — settings match.' : 'MISMATCH — please review.'}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => process.exit(0))
