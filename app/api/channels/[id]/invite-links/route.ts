import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { channelInviteLinks, users } from '@/lib/db/schema'
import { eq, and, or } from 'drizzle-orm'
import { requirePermission, PermissionError, ChannelRole } from '@/lib/api/permissions'
import { nanoid } from 'nanoid'

interface RouteParams {
  params: Promise<{ id: string }>
}

// Generate a URL-safe token
function generateToken(): string {
  // Use nanoid with custom alphabet for URL-safe tokens
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let token = ''
  for (let i = 0; i < 24; i++) {
    token += alphabet.charAt(Math.floor(Math.random() * alphabet.length))
  }
  return token
}

/**
 * GET /api/channels/:id/invite-links
 * List all invite links for a channel
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId } = await params
  const userId = session.user.id

  try {
    await requirePermission(channelId, userId, 'manage_shares')

    const links = await db.query.channelInviteLinks.findMany({
      where: eq(channelInviteLinks.channelId, channelId),
    })

    // Get creator info
    const creatorIds = links.filter(l => l.createdBy).map(l => l.createdBy!)
    const creators = creatorIds.length > 0
      ? await db.query.users.findMany({
          where: or(...creatorIds.map(id => eq(users.id, id))),
          columns: { id: true, name: true, email: true },
        })
      : []

    const creatorMap = new Map(creators.map(u => [u.id, u]))

    return NextResponse.json({
      links: links.map(link => ({
        id: link.id,
        channelId: link.channelId,
        token: link.token,
        defaultRole: link.defaultRole,
        requiresApproval: link.requiresApproval,
        expiresAt: link.expiresAt?.toISOString(),
        maxUses: link.maxUses,
        useCount: link.useCount,
        createdBy: link.createdBy ? creatorMap.get(link.createdBy) : null,
        createdAt: link.createdAt?.toISOString(),
        isExpired: link.expiresAt ? new Date() > link.expiresAt : false,
        isExhausted: link.maxUses ? (link.useCount ?? 0) >= link.maxUses : false,
      })),
    })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error fetching invite links:', error)
    return NextResponse.json({ error: 'Failed to fetch invite links' }, { status: 500 })
  }
}

/**
 * POST /api/channels/:id/invite-links
 * Create a new invite link
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId } = await params
  const userId = session.user.id

  try {
    await requirePermission(channelId, userId, 'manage_shares')

    const body = await req.json()
    const {
      defaultRole = 'viewer',
      requiresApproval = false,
      expiresInDays,
      maxUses,
    } = body

    if (!['editor', 'viewer'].includes(defaultRole)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be "editor" or "viewer"' },
        { status: 400 }
      )
    }

    const linkId = nanoid()
    const token = generateToken()
    const now = new Date()

    let expiresAt: Date | null = null
    if (expiresInDays && typeof expiresInDays === 'number' && expiresInDays > 0) {
      expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000)
    }

    await db.insert(channelInviteLinks).values({
      id: linkId,
      channelId,
      token,
      defaultRole: defaultRole as 'editor' | 'viewer',
      requiresApproval,
      expiresAt,
      maxUses: maxUses && typeof maxUses === 'number' && maxUses > 0 ? maxUses : null,
      useCount: 0,
      createdBy: userId,
      createdAt: now,
    })

    const createdLink = await db.query.channelInviteLinks.findFirst({
      where: eq(channelInviteLinks.id, linkId),
    })

    return NextResponse.json(
      {
        link: {
          ...createdLink,
          expiresAt: createdLink?.expiresAt?.toISOString(),
          createdAt: createdLink?.createdAt?.toISOString(),
          isExpired: false,
          isExhausted: false,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error creating invite link:', error)
    return NextResponse.json({ error: 'Failed to create invite link' }, { status: 500 })
  }
}
