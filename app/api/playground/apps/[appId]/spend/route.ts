import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { playgroundApps, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { findAppOwnerId } from '@/lib/playground/publicApp'
import {
  summarise,
  DEFAULT_APP_LIMIT_CENTS,
  DEFAULT_CUSTOMER_LIMIT_CENTS,
  DEFAULT_OWNER_LIMIT_CENTS,
} from '@/lib/playground/aiBudget'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ appId: string }>
}

/**
 * What this app has spent on AI, and what it is allowed to.
 *
 * GET   — usage, remaining allowance, and when the window resets.
 * PATCH — change the ceilings. Every value is finite; clearing one returns it to a
 *         default that is also finite, because there is no setting here that means
 *         "spend whatever it takes".
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { appId } = await params
  try {
    await ensureSchema()
    const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
    if (!app) return NextResponse.json({ error: 'App not found' }, { status: 404 })
    await requirePermission(app.channelId, session.user.id, 'view')

    const ownerId = await findAppOwnerId(app)
    const summary = await summarise(app.id, ownerId)

    return NextResponse.json({
      ...summary,
      /** Null means "using a default", which the UI says out loud. */
      appLimitSetting: app.aiSpendLimitCents,
      customerLimitSetting: app.aiCustomerLimitCents,
      defaults: {
        app: DEFAULT_APP_LIMIT_CENTS,
        owner: DEFAULT_OWNER_LIMIT_CENTS,
        customer: DEFAULT_CUSTOMER_LIMIT_CENTS,
      },
    })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[playground/apps/:id/spend] GET failed:', error)
    return NextResponse.json({ error: 'Could not load spending' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { appId } = await params
  let body: { appLimitCents?: number | null; customerLimitCents?: number | null; ownerLimitCents?: number | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  /** Null clears back to a default; anything else is clamped into something sane. */
  const clean = (value: number | null | undefined, max: number) => {
    if (value === null) return null
    if (value === undefined) return undefined
    const n = Math.round(Number(value))
    if (!Number.isFinite(n) || n < 0) return undefined
    return Math.min(n, max)
  }

  try {
    await ensureSchema()
    const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
    if (!app) return NextResponse.json({ error: 'App not found' }, { status: 404 })
    await requirePermission(app.channelId, session.user.id, 'edit')

    const appLimit = clean(body.appLimitCents, 100_000)      // $1,000 per app
    const customerLimit = clean(body.customerLimitCents, 10_000)
    if (appLimit !== undefined || customerLimit !== undefined) {
      await db.update(playgroundApps).set({
        ...(appLimit !== undefined ? { aiSpendLimitCents: appLimit } : {}),
        ...(customerLimit !== undefined ? { aiCustomerLimitCents: customerLimit } : {}),
        updatedAt: new Date(),
      }).where(eq(playgroundApps.id, appId))
    }

    const ownerId = await findAppOwnerId(app)
    const ownerLimit = clean(body.ownerLimitCents, 500_000)
    // Only the owner moves the account-wide ceiling — an editor on a shared channel
    // can shape one app's spending, not the bill for every app on the account.
    if (ownerLimit !== undefined && ownerId === session.user.id) {
      await db.update(users)
        .set({ appAiSpendLimitCents: ownerLimit, updatedAt: new Date() })
        .where(eq(users.id, ownerId))
    }

    const fresh = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
    const summary = await summarise(appId, ownerId)
    return NextResponse.json({
      ...summary,
      appLimitSetting: fresh?.aiSpendLimitCents ?? null,
      customerLimitSetting: fresh?.aiCustomerLimitCents ?? null,
      defaults: {
        app: DEFAULT_APP_LIMIT_CENTS,
        owner: DEFAULT_OWNER_LIMIT_CENTS,
        customer: DEFAULT_CUSTOMER_LIMIT_CENTS,
      },
    })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[playground/apps/:id/spend] PATCH failed:', error)
    return NextResponse.json({ error: 'Could not save the limits' }, { status: 500 })
  }
}
