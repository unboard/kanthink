import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { and, eq, ne } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { normalizeAppPageSlug } from '@/lib/playground/appAccess'
import { DEFAULT_APP_IMAGE_PROMPT } from '@/lib/playground/thumbnail'
import type { AppPublisherProfile } from '@/lib/types'

export const runtime = 'nodejs'

/**
 * The publisher's account-level app settings: the house style for thumbnails, and
 * the public page their published apps appear on.
 *
 * The house style lives here rather than on each app on purpose. It is the thing
 * that makes a directory of twenty apps look like one person's shelf, and a setting
 * repeated twenty times is a setting nobody keeps consistent.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    await ensureSchema()
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: {
        name: true,
        image: true,
        appImagePrompt: true,
        appPageSlug: true,
        appPageTitle: true,
        appPageBio: true,
        appPagePublic: true,
      },
    })

    const profile: AppPublisherProfile = {
      appImagePrompt: user?.appImagePrompt ?? null,
      appPageSlug: user?.appPageSlug ?? null,
      appPageTitle: user?.appPageTitle ?? null,
      appPageBio: user?.appPageBio ?? null,
      appPagePublic: !!user?.appPagePublic,
      name: user?.name ?? null,
      image: user?.image ?? null,
    }

    return NextResponse.json({ profile, defaultImagePrompt: DEFAULT_APP_IMAGE_PROMPT })
  } catch (error) {
    console.error('[playground/profile] GET failed:', error)
    return NextResponse.json({ error: 'Failed to load your app settings' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: {
    appImagePrompt?: string | null
    appPageSlug?: string | null
    appPageTitle?: string | null
    appPageBio?: string | null
    appPagePublic?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    await ensureSchema()
    const updates: Record<string, unknown> = { updatedAt: new Date() }

    if (body.appImagePrompt !== undefined) {
      const prompt = (body.appImagePrompt || '').trim().slice(0, 1000)
      // Empty means "use the default", not "generate with no style at all".
      updates.appImagePrompt = prompt || null
    }
    if (body.appPageTitle !== undefined) {
      updates.appPageTitle = (body.appPageTitle || '').trim().slice(0, 100) || null
    }
    if (body.appPageBio !== undefined) {
      updates.appPageBio = (body.appPageBio || '').trim().slice(0, 500) || null
    }
    if (typeof body.appPagePublic === 'boolean') {
      updates.appPagePublic = body.appPagePublic
    }

    if (body.appPageSlug !== undefined) {
      const raw = (body.appPageSlug || '').trim()
      if (!raw) {
        // Dropping the slug takes the page down with it — there is nowhere to serve.
        updates.appPageSlug = null
        updates.appPagePublic = false
      } else {
        const slug = normalizeAppPageSlug(raw)
        if (!slug) {
          return NextResponse.json(
            { error: 'Pick 3 or more letters or numbers. Some words are reserved.' },
            { status: 400 },
          )
        }
        const taken = await db.query.users.findFirst({
          where: and(eq(users.appPageSlug, slug), ne(users.id, session.user.id)),
          columns: { id: true },
        })
        if (taken) {
          return NextResponse.json({ error: `"${slug}" is taken. Try another.` }, { status: 409 })
        }
        updates.appPageSlug = slug
      }
    }

    // Publishing the page needs somewhere to publish it to.
    if (updates.appPagePublic === true && updates.appPageSlug === undefined) {
      const existing = await db.query.users.findFirst({
        where: eq(users.id, session.user.id),
        columns: { appPageSlug: true },
      })
      if (!existing?.appPageSlug) {
        return NextResponse.json(
          { error: 'Choose a page address before making the page public.' },
          { status: 400 },
        )
      }
    }

    await db.update(users).set(updates).where(eq(users.id, session.user.id))

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: {
        name: true,
        image: true,
        appImagePrompt: true,
        appPageSlug: true,
        appPageTitle: true,
        appPageBio: true,
        appPagePublic: true,
      },
    })

    const profile: AppPublisherProfile = {
      appImagePrompt: user?.appImagePrompt ?? null,
      appPageSlug: user?.appPageSlug ?? null,
      appPageTitle: user?.appPageTitle ?? null,
      appPageBio: user?.appPageBio ?? null,
      appPagePublic: !!user?.appPagePublic,
      name: user?.name ?? null,
      image: user?.image ?? null,
    }

    return NextResponse.json({ profile })
  } catch (error) {
    console.error('[playground/profile] PATCH failed:', error)
    return NextResponse.json({ error: 'Failed to save your app settings' }, { status: 500 })
  }
}
