import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { columns, cards } from '@/lib/db/schema'
import { eq, and, desc, asc, gte, sql } from 'drizzle-orm'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { nanoid } from 'nanoid'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/channels/:id/columns
 * Create a new column
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId } = await params
  const userId = session.user.id

  try {
    await requirePermission(channelId, userId, 'edit')

    const body = await req.json()
    const { id: clientId, name, instructions, position: requestedPosition } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Get max position
    const existingColumns = await db.query.columns.findMany({
      where: eq(columns.channelId, channelId),
      orderBy: [desc(columns.position)],
      limit: 1,
    })

    const maxPosition = existingColumns.length > 0 ? existingColumns[0].position : -1
    const position = requestedPosition !== undefined ? requestedPosition : maxPosition + 1

    // If inserting at a specific position, shift other columns
    if (requestedPosition !== undefined) {
      await db
        .update(columns)
        .set({ position: sql`${columns.position} + 1` })
        .where(
          and(eq(columns.channelId, channelId), gte(columns.position, requestedPosition))
        )
    }

    // Use client-provided ID if given (for optimistic sync), otherwise generate
    const columnId = clientId || nanoid()
    const now = new Date()

    await db.insert(columns).values({
      id: columnId,
      channelId,
      name,
      instructions,
      position,
      createdAt: now,
      updatedAt: now,
    })

    const createdColumn = await db.query.columns.findFirst({
      where: eq(columns.id, columnId),
    })

    return NextResponse.json(
      {
        column: {
          ...createdColumn,
          createdAt: createdColumn?.createdAt?.toISOString(),
          updatedAt: createdColumn?.updatedAt?.toISOString(),
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error creating column:', error)
    return NextResponse.json({ error: 'Failed to create column' }, { status: 500 })
  }
}
