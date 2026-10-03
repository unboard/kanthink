/**
 * End-to-end check of app styles against the real database and a real model.
 *
 *   npx tsx scripts/style-selftest.ts build "<what the app is>"  — throwaway card + app, first build; prints the style Kan picked and the design check
 *   npx tsx scripts/style-selftest.ts pass <appId> <pass>         — run a design pass (polish | bolder | quieter | restyle | fix)
 *   npx tsx scripts/style-selftest.ts doc <appId> <origin> <file>  — write the app's page to a file, loading the kit from <origin>
 *   npx tsx scripts/style-selftest.ts cleanup                      — delete every throwaway card this script made
 *
 * Owner is the ADMIN_EMAIL account. Cards go in the Studio's Dropped column, titled "Style self-test: …".
 */
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { Agent, setGlobalDispatcher } from 'undici'

for (const line of readFileSync(resolve(__dirname, '..', '.env.local'), 'utf-8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0 && !process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1)
}
// A build can run for several minutes.
setGlobalDispatcher(new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 }))

const PREFIX = 'Style self-test: '

async function main() {
  const [cmd, a, b, c] = process.argv.slice(2)
  const { db } = await import('../lib/db')
  const schema = await import('../lib/db/schema')
  const { eq, like } = await import('drizzle-orm')
  const owner = await db.query.users.findFirst({ where: eq(schema.users.email, (process.env.ADMIN_EMAIL || '').split(',')[0].trim()) })
  if (!owner) throw new Error('No ADMIN_EMAIL user')
  const out = (x: unknown) => console.log(JSON.stringify(x, null, 2))
  const { checkDesign } = await import('../lib/playground/style/slopCheck')
  const { generatePlaygroundApp } = await import('../lib/playground/generateApp')

  const report = async (appId: string, res: Response) => {
    const body = await res.json().catch(() => null)
    const app = await db.query.playgroundApps.findFirst({ where: eq(schema.playgroundApps.id, appId) })
    out({
      status: res.status,
      error: body?.error,
      appId,
      title: app?.title,
      style: app?.style,
      notes: app?.lastNotes,
      usage: app?.lastUsage,
      check: checkDesign(app?.code, { hasStyle: !!app?.style, look: app?.style?.look }),
      usesKit: /from\s+['"]kit['"]/.test(app?.code || ''),
    })
  }

  if (cmd === 'build') {
    const { getStudio } = await import('../lib/studio/setup')
    const studio = (await getStudio(owner.id))!
    const cardId = crypto.randomUUID()
    const now = new Date()
    await db.insert(schema.cards).values({
      id: cardId, channelId: studio.channelId, columnId: studio.droppedColumnId, title: PREFIX + a.slice(0, 60), position: 0,
      messages: [{ id: crypto.randomUUID(), type: 'question', content: a, createdAt: now.toISOString() }],
      createdAt: now, updatedAt: now,
    })
    const appId = crypto.randomUUID()
    await db.insert(schema.playgroundApps).values({ id: appId, channelId: studio.channelId, cardId, title: 'New app', createdAt: now, updatedAt: now })
    const res = await generatePlaygroundApp({ appId, prompt: 'Build the app described in this thread and on the source card.' }, { user: { id: owner.id } })
    await report(appId, res)
  }

  if (cmd === 'pass') {
    const res = await generatePlaygroundApp({ appId: a, prompt: 'pass', pass: b as never }, { user: { id: owner.id } })
    await report(a, res)
  }

  if (cmd === 'doc') {
    const { buildPlaygroundDoc } = await import('../components/playground/buildPlaygroundDoc')
    const { resolveDeps } = await import('../lib/playground/runtime')
    const app = (await db.query.playgroundApps.findFirst({ where: eq(schema.playgroundApps.id, a) }))!
    writeFileSync(c, buildPlaygroundDoc(app.code || '', {
      title: app.title,
      origin: b,
      uploadUrl: `${b}/api/playground/upload`,
      deps: resolveDeps(app.dependencies || []).deps,
      style: app.style,
    }))
    out({ wrote: c })
  }

  if (cmd === 'cleanup') {
    const cards = await db.query.cards.findMany({ where: like(schema.cards.title, `${PREFIX}%`), columns: { id: true } })
    for (const card of cards) await db.delete(schema.cards).where(eq(schema.cards.id, card.id))
    out({ deleted: cards.length })
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
