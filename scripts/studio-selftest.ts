/**
 * End-to-end check of the Studio against the real database.
 *
 *   npx tsx scripts/studio-selftest.ts setup        — make (or find) your Studio, run the scout once
 *   npx tsx scripts/studio-selftest.ts testcard     — a throwaway card with a test page; prints the token
 *   npx tsx scripts/studio-selftest.ts person <token> — the person who reserved, their detail and a Kan draft
 *   npx tsx scripts/studio-selftest.ts send <emailId> — send a draft for real; prints the delivery id
 *   npx tsx scripts/studio-selftest.ts email <emailId> — one email row
 *   npx tsx scripts/studio-selftest.ts context      — Kan's Studio briefing and today's spark
 *   npx tsx scripts/studio-selftest.ts cleanup      — delete every throwaway card this script made
 *
 * Owner is the ADMIN_EMAIL account. Throwaway cards are titled "Studio self-test".
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

for (const line of readFileSync(resolve(__dirname, '..', '.env.local'), 'utf-8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0 && !process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1)
}

const SELF_TEST = 'Studio self-test'

async function main() {
  const [cmd, arg] = process.argv.slice(2)
  const { db } = await import('../lib/db')
  const schema = await import('../lib/db/schema')
  const { eq, and } = await import('drizzle-orm')
  const owner = await db.query.users.findFirst({ where: eq(schema.users.email, (process.env.ADMIN_EMAIL || '').split(',')[0].trim()) })
  if (!owner) throw new Error('No ADMIN_EMAIL user')
  const out = (x: unknown) => console.log(JSON.stringify(x, null, 2))

  if (cmd === 'setup') {
    const { ensureStudio } = await import('../lib/studio/setup')
    const { studio, created } = await ensureStudio(owner.id)
    out({ created, channelId: studio.channelId, scout: studio.scoutShroomId })
    if (studio.scoutShroomId) {
      const { rowToInstructionCard, runShroomServerSide } = await import('../lib/shrooms/runServerSide')
      const row = await db.query.instructionCards.findFirst({ where: eq(schema.instructionCards.id, studio.scoutShroomId) })
      const res = await runShroomServerSide({ instruction: rowToInstructionCard(row!), triggerType: 'manual' })
      out({ scoutRun: res })
    }
    const sparks = await db.query.cards.findMany({ where: eq(schema.cards.columnId, studio.sparksColumnId), columns: { id: true, title: true, isPendingReview: true } })
    out({ sparks })
  }

  if (cmd === 'testcard') {
    const { getStudio } = await import('../lib/studio/setup')
    const { startTestPage } = await import('../lib/studio/pipeline')
    const studio = (await getStudio(owner.id))!
    const id = crypto.randomUUID()
    await db.insert(schema.cards).values({
      id, channelId: studio.channelId, columnId: studio.sparksColumnId, title: SELF_TEST, position: 0,
      messages: [{ id: crypto.randomUUID(), type: 'ai_response', content: 'A throwaway card for checking the Studio end to end. Safe to delete.', createdAt: new Date().toISOString() }],
      createdAt: new Date(), updatedAt: new Date(),
    })
    const r = await startTestPage({ userId: owner.id, cardId: id, headline: 'Check the Studio works', pitch: 'A test of the test page.', priceLabel: '$5 once', bullets: ['Reserve button', 'No charge'] })
    const app = await db.query.playgroundApps.findFirst({ where: eq(schema.playgroundApps.id, r.appId) })
    const card = await db.query.cards.findFirst({ where: eq(schema.cards.id, id) })
    out({ cardId: id, token: app?.shareToken, url: r.url, reserveMode: app?.reserveMode, movedToTesting: card?.columnId === studio.testingColumnId })
  }

  if (cmd === 'person') {
    const app = await db.query.playgroundApps.findFirst({ where: eq(schema.playgroundApps.shareToken, arg) })
    const member = await db.query.appUsers.findFirst({ where: eq(schema.appUsers.appId, app!.id) })
    const { listPeople, personDetail } = await import('../lib/studio/people')
    const people = await listPeople(owner.id)
    out({ member: { id: member?.id, email: member?.email, reservedAt: member?.reservedAt, ownerId: member?.ownerId === owner.id }, inList: people.some((p) => p.id === member?.id) })
    out((await personDetail(owner.id, member!.id))?.thread)
    const { askKanAboutPerson } = await import('../lib/studio/compose')
    const detail = await askKanAboutPerson(owner.id, member!.id, 'write them a short thank-you for reserving, and say I’ll email when it’s ready')
    out(detail?.side)
  }

  if (cmd === 'send') {
    const { sendEmail } = await import('../lib/studio/people')
    const sent = await sendEmail(owner.id, arg)
    out({ status: sent.status, deliveryId: sent.cioDeliveryId, sentAt: sent.sentAt })
  }

  if (cmd === 'email') {
    out(await db.query.appEmails.findFirst({ where: eq(schema.appEmails.id, arg) }))
  }

  if (cmd === 'context') {
    const { buildStudioContext } = await import('../lib/studio/context')
    const { todaysSpark } = await import('../lib/studio/daily')
    console.log(await buildStudioContext(owner.id))
    out(await todaysSpark(owner.id))
  }

  if (cmd === 'cleanup') {
    const { getStudio } = await import('../lib/studio/setup')
    const studio = (await getStudio(owner.id))!
    const throwaway = await db.query.cards.findMany({ where: and(eq(schema.cards.channelId, studio.channelId), eq(schema.cards.title, SELF_TEST)) })
    for (const c of throwaway) await db.delete(schema.cards).where(eq(schema.cards.id, c.id))
    out({ deleted: throwaway.length })
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
