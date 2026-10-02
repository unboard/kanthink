import { NextRequest, NextResponse, after } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { appEmails, appPurchases, cards, instructionCards, playgroundApps, studioSettings } from '@/lib/db/schema'
import { and, eq, gte, inArray } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { ensureStudio, getStudio } from '@/lib/studio/setup'
import { rowToInstructionCard, runShroomServerSide } from '@/lib/shrooms/runServerSide'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * The Studio itself.
 *
 * GET              — whether you have one, its settings, and the week in a line.
 * GET ?channelId=  — the same, but only if that channel is your Studio (the board's strip).
 * POST             — make your Studio (once), and send the scout out straight away.
 * PATCH            — follow-up mode and the morning email.
 *
 * Admin-only while it's tried out, the same as Kanwatch.
 */

async function gate() {
  const session = await auth()
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  if (!session.user.isAdmin) return { error: NextResponse.json({ error: 'Not available' }, { status: 404 }) }
  return { userId: session.user.id }
}

export async function GET(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return g.error
  await ensureSchema()
  const studio = await getStudio(g.userId)
  const channelId = req.nextUrl.searchParams.get('channelId')
  if (!studio || (channelId && studio.channelId !== channelId)) return NextResponse.json({ studio: null })

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000)
  const apps = await db.query.playgroundApps.findMany({ where: eq(playgroundApps.channelId, studio.channelId), columns: { id: true } })
  const appIds = apps.map((a) => a.id)
  const [purchases, drafts, ready] = await Promise.all([
    appIds.length
      ? db.query.appPurchases.findMany({ where: and(inArray(appPurchases.appId, appIds), gte(appPurchases.createdAt, weekAgo), eq(appPurchases.status, 'active')), columns: { amount: true } })
      : Promise.resolve([]),
    db.query.appEmails.findMany({ where: and(eq(appEmails.ownerId, g.userId), eq(appEmails.status, 'draft')), columns: { id: true } }),
    db.query.cards.findMany({ where: and(eq(cards.columnId, studio.readyColumnId), eq(cards.isArchived, false)), columns: { id: true } }),
  ])

  return NextResponse.json({
    studio: {
      channelId: studio.channelId,
      sparksColumnId: studio.sparksColumnId,
      followUpMode: studio.followUpMode,
      sparkEmail: !!studio.sparkEmail,
      week: {
        earnedCents: purchases.reduce((n, p) => n + (p.amount ?? 0), 0),
        sales: purchases.length,
        draftsWaiting: drafts.length,
        readyForYou: ready.length,
      },
    },
  })
}

export async function POST() {
  const g = await gate()
  if ('error' in g) return g.error
  await ensureSchema()
  const { studio, created } = await ensureStudio(g.userId)

  // The first spark shouldn't wait for tomorrow's cron.
  if (created && studio.scoutShroomId) {
    const scoutId = studio.scoutShroomId
    after(async () => {
      const row = await db.query.instructionCards.findFirst({ where: eq(instructionCards.id, scoutId) })
      if (row) await runShroomServerSide({ instruction: rowToInstructionCard(row), triggerType: 'manual' }).catch((e) => console.error('[studio] first scout run failed:', e))
    })
  }
  return NextResponse.json({ channelId: studio.channelId, created })
}

export async function PATCH(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return g.error
  await ensureSchema()
  const studio = await getStudio(g.userId)
  if (!studio) return NextResponse.json({ error: 'No Studio yet' }, { status: 404 })
  const body = (await req.json().catch(() => ({}))) as { followUpMode?: string; sparkEmail?: boolean }
  const updates: Partial<typeof studioSettings.$inferInsert> = { updatedAt: new Date() }
  if (body.followUpMode === 'ask' || body.followUpMode === 'auto') updates.followUpMode = body.followUpMode
  if (typeof body.sparkEmail === 'boolean') updates.sparkEmail = body.sparkEmail
  await db.update(studioSettings).set(updates).where(eq(studioSettings.userId, g.userId))
  return NextResponse.json({ ok: true })
}
