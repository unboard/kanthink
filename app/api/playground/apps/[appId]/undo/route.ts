import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { playgroundApps } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { releaseView } from '@/lib/playground/appRelease'

export const runtime = 'nodejs'

/**
 * POST /api/playground/apps/[appId]/undo
 *
 * Put the draft back to how it was before the last build.
 *
 * Rolling back to a release is the deliberate path, and it needs you to have
 * published. This is the other one: an app that has never been published has no
 * history at all, so a build that went the wrong way used to be simply the end of
 * that work. One step back covers the case that actually happens — a stray click on
 * a finished app.
 *
 * The undo is itself undoable: the state being replaced becomes the new snapshot, so
 * pressing it twice returns you to where you started rather than stranding you one
 * step further from it.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ appId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { appId } = await params
  try {
    await ensureSchema()
    const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
    if (!app) return NextResponse.json({ error: 'App not found' }, { status: 404 })
    await requirePermission(app.channelId, session.user.id, 'edit')

    const previous = app.previousBuild
    if (!previous?.code) {
      return NextResponse.json(
        { error: 'There is no earlier version of this draft to go back to.' },
        { status: 409 }
      )
    }

    await db.update(playgroundApps).set({
      code: previous.code,
      designNotes: previous.designNotes ?? null,
      requirements: previous.requirements ?? null,
      lastNotes: previous.notes ?? null,
      dependencies: previous.dependencies ?? [],
      generationCount: previous.generationCount,
      // Swapped rather than cleared, so undo is reversible.
      previousBuild: {
        code: app.code ?? '',
        designNotes: app.designNotes,
        requirements: app.requirements,
        notes: app.lastNotes,
        dependencies: app.dependencies ?? null,
        generationCount: app.generationCount,
        savedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    }).where(eq(playgroundApps.id, appId))

    const restored = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
    if (!restored) return NextResponse.json({ error: 'App not found' }, { status: 404 })

    // Undo moves the draft, so it moves the answer to "does this differ from what
    // customers have" — including back to no, when the step undone was the only
    // change since the release.
    return NextResponse.json({ app: { ...restored, ...(await releaseView(restored)) } })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[playground/undo] failed:', error)
    return NextResponse.json({ error: 'Could not go back' }, { status: 500 })
  }
}
