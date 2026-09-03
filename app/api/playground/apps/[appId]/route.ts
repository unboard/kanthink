import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { playgroundApps } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { ensureSchema } from '@/lib/db/ensure-schema'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ appId: string }>
}

/**
 * A single playground app.
 *
 * GET    — read it, including the code and thread. Also what the client polls when
 *          a generate request dies mid-flight (screen-off, tab suspension, blip):
 *          the server-side write completes regardless of whether anyone is listening.
 * PATCH  — rename, publish/unpublish, set the sticky model, append thread messages.
 * DELETE — remove it. The source card is untouched.
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
    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 })
    }
    await requirePermission(app.channelId, session.user.id, 'view')
    return NextResponse.json({ app })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[playground/apps/:id] GET failed:', error)
    return NextResponse.json({ error: 'Failed to load app' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { appId } = await params
  let body: {
    title?: string
    isPublic?: boolean
    modelId?: string | null
    messages?: unknown
    position?: number
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    await ensureSchema()
    const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 })
    }
    await requirePermission(app.channelId, session.user.id, 'edit')

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (typeof body.title === 'string' && body.title.trim()) {
      updates.title = body.title.trim().slice(0, 200)
    }
    if (typeof body.isPublic === 'boolean') {
      updates.isPublic = body.isPublic
      // Publishing needs a token to publish to. Minted once and kept, so a link
      // that has been shared keeps working across unpublish/republish cycles.
      if (body.isPublic && !app.shareToken) updates.shareToken = nanoid(16)
    }
    if (body.modelId !== undefined) {
      updates.modelId = body.modelId || null
    }
    if (Array.isArray(body.messages)) {
      updates.messages = body.messages
    }
    if (typeof body.position === 'number') {
      updates.position = body.position
    }

    await db.update(playgroundApps).set(updates).where(eq(playgroundApps.id, appId))
    const updated = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
    return NextResponse.json({ app: updated })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[playground/apps/:id] PATCH failed:', error)
    return NextResponse.json({ error: 'Failed to update app' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { appId } = await params
  try {
    await ensureSchema()
    const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
    if (!app) {
      return NextResponse.json({ success: true })
    }
    await requirePermission(app.channelId, session.user.id, 'edit')
    await db.delete(playgroundApps).where(eq(playgroundApps.id, appId))
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[playground/apps/:id] DELETE failed:', error)
    return NextResponse.json({ error: 'Failed to delete app' }, { status: 500 })
  }
}
