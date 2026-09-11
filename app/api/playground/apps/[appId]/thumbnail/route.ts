import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { cards, playgroundApps, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { generateImageForUser } from '@/lib/ai/imageGeneration'
import { buildThumbnailPrompt, THUMBNAIL_ASPECT_RATIO } from '@/lib/playground/thumbnail'

export const runtime = 'nodejs'
// Image models are slow and the default ceiling cut these off mid-generation,
// leaving a row stuck on 'pending' with no picture to show for it.
export const maxDuration = 120

interface RouteParams {
  params: Promise<{ appId: string }>
}

/**
 * An app's thumbnail.
 *
 * POST — generate one, or attach an image the owner already has.
 * DELETE — drop it, back to the placeholder tile.
 *
 * Generation is owner-initiated rather than automatic. An image costs money, and an
 * app is typically rebuilt a dozen times before anyone would want a picture of it —
 * generating on every build would be spending on drafts.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { appId } = await params
  let body: { mode?: 'default' | 'custom' | 'upload'; prompt?: string; imageUrl?: string }
  try {
    body = await req.json()
  } catch {
    body = { mode: 'default' }
  }

  try {
    await ensureSchema()
    const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
    if (!app) return NextResponse.json({ error: 'App not found' }, { status: 404 })
    await requirePermission(app.channelId, session.user.id, 'edit')

    // An image the owner already has needs no model at all.
    if (body.mode === 'upload') {
      const url = (body.imageUrl || '').trim()
      if (!/^https?:\/\//i.test(url) && !url.startsWith('data:image/')) {
        return NextResponse.json({ error: 'That is not an image URL.' }, { status: 400 })
      }
      await db.update(playgroundApps).set({
        thumbnailUrl: url,
        thumbnailPrompt: null,
        thumbnailStatus: 'ready',
        updatedAt: new Date(),
      }).where(eq(playgroundApps.id, appId))
      const updated = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
      return NextResponse.json({ app: updated })
    }

    const [owner, card] = await Promise.all([
      db.query.users.findFirst({
        where: eq(users.id, session.user.id),
        columns: { appImagePrompt: true },
      }),
      db.query.cards.findFirst({
        where: eq(cards.id, app.cardId),
        columns: { title: true },
      }),
    ])

    const customPrompt = body.mode === 'custom' ? (body.prompt || '').trim() : ''
    const prompt = buildThumbnailPrompt({
      houseStyle: owner?.appImagePrompt,
      title: app.title,
      tagline: app.tagline,
      summary: app.summary,
      designNotes: app.designNotes,
      cardTitle: card?.title,
      customPrompt: customPrompt || null,
    })

    // Mark it in flight first. The request usually outlives the tab that started
    // it, and a directory opened on another device should say what is happening.
    await db.update(playgroundApps)
      .set({ thumbnailStatus: 'pending', updatedAt: new Date() })
      .where(eq(playgroundApps.id, appId))

    const result = await generateImageForUser(session.user.id, {
      prompt,
      aspectRatio: THUMBNAIL_ASPECT_RATIO,
      folder: `apps/${appId}`,
    })

    if (!result.url) {
      await db.update(playgroundApps)
        .set({ thumbnailStatus: 'failed', updatedAt: new Date() })
        .where(eq(playgroundApps.id, appId))
      return NextResponse.json(
        { error: result.error || 'Could not generate a thumbnail' },
        { status: result.status ?? 502 },
      )
    }

    await db.update(playgroundApps).set({
      thumbnailUrl: result.url,
      // Store what produced it so "try again" can iterate rather than start over.
      thumbnailPrompt: customPrompt || null,
      thumbnailStatus: 'ready',
      updatedAt: new Date(),
    }).where(eq(playgroundApps.id, appId))

    const updated = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
    return NextResponse.json({ app: updated, prompt })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[playground/apps/:id/thumbnail] POST failed:', error)
    // Never leave the row claiming a generation is still running.
    try {
      await db.update(playgroundApps)
        .set({ thumbnailStatus: 'failed', updatedAt: new Date() })
        .where(eq(playgroundApps.id, appId))
    } catch { /* the original error is the one worth reporting */ }
    return NextResponse.json({ error: 'Failed to generate a thumbnail' }, { status: 500 })
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
    if (!app) return NextResponse.json({ success: true })
    await requirePermission(app.channelId, session.user.id, 'edit')

    await db.update(playgroundApps).set({
      thumbnailUrl: null,
      thumbnailStatus: 'none',
      updatedAt: new Date(),
    }).where(eq(playgroundApps.id, appId))

    const updated = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
    return NextResponse.json({ app: updated })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[playground/apps/:id/thumbnail] DELETE failed:', error)
    return NextResponse.json({ error: 'Failed to clear the thumbnail' }, { status: 500 })
  }
}
