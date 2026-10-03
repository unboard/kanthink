import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { playgroundApps } from '@/lib/db/schema'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { releaseView } from '@/lib/playground/appRelease'
import { cleanSetup } from '@/lib/playground/payments/status'
import { reviewPayments } from '@/lib/playground/payments/review'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * The payment overseer, for the owner.
 *
 * POST { setup }        saves the owner's answers (how buyers get it, what to collect,
 *                       what costs money), then has Kan re-read the app against them.
 * POST { review: true } has Kan re-read the app as it stands.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ appId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { appId } = await params
  let body: { setup?: unknown; review?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    await ensureSchema()
    const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
    if (!app) return NextResponse.json({ error: 'App not found' }, { status: 404 })
    await requirePermission(app.channelId, session.user.id, 'edit')

    if (body.setup !== undefined) {
      await db.update(playgroundApps)
        .set({ paymentSetup: cleanSetup(body.setup, app.paymentSetup), updatedAt: new Date() })
        .where(eq(playgroundApps.id, appId))
    }
    if (body.review || body.setup !== undefined) await reviewPayments(appId, session.user.id)

    const updated = (await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) }))!
    return NextResponse.json({ app: { ...updated, ...(await releaseView(updated)) } })
  } catch (error) {
    if (error instanceof PermissionError) return NextResponse.json({ error: error.message }, { status: 403 })
    console.error('[playground/apps/:id/payments] POST failed:', error)
    return NextResponse.json({ error: 'Could not save that' }, { status: 500 })
  }
}
