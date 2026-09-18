import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { playgroundApps } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { publishDraft, rollbackTo, releaseView } from '@/lib/playground/appRelease'
import { signDraftAppToken } from '@/lib/playground/appToken'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ appId: string }>
}

/**
 * Deciding what customers get.
 *
 * POST { action: 'publish' }              — cut the draft as a release and serve it
 * POST { action: 'rollback', versionId }  — serve an earlier release again
 * POST { action: 'unpublish' }            — close the link, keep the release chosen
 * POST { action: 'republish' }            — open it again on the same release
 *
 * The last two are a pair on purpose. Taking an app down and changing which version
 * it serves were the same control once, so the only way to stop serving something
 * was to lose the record of what you had been serving. They are separate decisions
 * and now separate actions: unpublishing keeps the pointer and the share token, so
 * republishing puts the identical app back on the identical link.
 *
 * Neither touches the draft, and neither touches purchases, feedback or saved
 * records: a release carries only what is needed to run the app, so everything a
 * customer has accumulated sits outside it by construction.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { appId } = await params
  let body: {
    action?: 'publish' | 'rollback' | 'unpublish' | 'republish'
    versionId?: string
  }
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

    if (body.action === 'rollback') {
      if (!body.versionId) {
        return NextResponse.json({ error: 'Which release?' }, { status: 400 })
      }
      const result = await rollbackTo(app, body.versionId)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
      return respond(appId)
    }

    if (body.action === 'unpublish' || body.action === 'republish') {
      const open = body.action === 'republish'
      if (open && !app.publishedVersionId) {
        return NextResponse.json(
          { error: 'There is no release to put back. Publish the draft instead.' },
          { status: 400 },
        )
      }
      await db.update(playgroundApps)
        .set({
          isPublic: open,
          // Minted once and kept, so a link already shared survives a trip through
          // unpublished and comes back working rather than moving.
          ...(open && !app.shareToken ? { shareToken: nanoid(16) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(playgroundApps.id, appId))
      return respond(appId)
    }

    if (body.action === 'publish') {
      const result = await publishDraft(app, session.user.id)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

      // Publishing is the moment somebody decided this should be reachable, so it
      // is also where the app becomes public and gets a link — rather than a
      // separate switch that can sit off while a release quietly exists.
      const updates: Record<string, unknown> = {}
      if (!app.isPublic) updates.isPublic = true
      if (!app.shareToken) updates.shareToken = nanoid(16)
      if (Object.keys(updates).length > 0) {
        await db.update(playgroundApps)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(playgroundApps.id, appId))
      }

      return respond(appId, result.reused)
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[playground/apps/:id/release] POST failed:', error)
    return NextResponse.json({ error: 'Could not update what is published' }, { status: 500 })
  }
}

/** The app as the drawer wants it back: row, release state and history. */
async function respond(appId: string, reused = false) {
  const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
  if (!app) return NextResponse.json({ error: 'App not found' }, { status: 404 })

  return NextResponse.json({
    reused,
    app: {
      ...app,
      // Carried through so the drawer's preview iframe keeps a working draft token
      // after a publish — without it the preview goes blank on the next render.
      draftToken: signDraftAppToken(app.id),
      ...(await releaseView(app)),
    },
  })
}
