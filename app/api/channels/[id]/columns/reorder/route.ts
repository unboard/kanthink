import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { columns } from '@/lib/db/schema'
import { eq, and, gte, lte, gt, lt, sql, asc } from 'drizzle-orm'
import { requirePermission, PermissionError } from '@/lib/api/permissions'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/channels/:id/columns/reorder
 * Reorder columns within a channel
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
    const { columnId, toPosition } = body

    if (!columnId || toPosition === undefined) {
      return NextResponse.json(
        { error: 'columnId and toPosition are required' },
        { status: 400 }
      )
    }

    // Get the column
    const column = await db.query.columns.findFirst({
      where: and(eq(columns.id, columnId), eq(columns.channelId, channelId)),
    })

    if (!column) {
      return NextResponse.json({ error: 'Column not found' }, { status: 404 })
    }

    const fromPosition = column.position

    if (fromPosition === toPosition) {
      // No change needed
      return NextResponse.json({ success: true })
    }

    if (fromPosition < toPosition) {
      // Moving down: shift columns between old and new position up
      await db
        .update(columns)
        .set({ position: sql`${columns.position} - 1` })
        .where(
          and(
            eq(columns.channelId, channelId),
            gt(columns.position, fromPosition),
            lte(columns.position, toPosition)
          )
        )
    } else {
      // Moving up: shift columns between new and old position down
      await db
        .update(columns)
        .set({ position: sql`${columns.position} + 1` })
        .where(
          and(
            eq(columns.channelId, channelId),
            gte(columns.position, toPosition),
            lt(columns.position, fromPosition)
          )
        )
    }

    // Update the column's position
    await db
      .update(columns)
      .set({ position: toPosition, updatedAt: new Date() })
      .where(eq(columns.id, columnId))

    // Return all columns in new order
    const updatedColumns = await db.query.columns.findMany({
      where: eq(columns.channelId, channelId),
      orderBy: [asc(columns.position)],
    })

    return NextResponse.json({
      columns: updatedColumns.map(col => ({
        ...col,
        createdAt: col.createdAt?.toISOString(),
        updatedAt: col.updatedAt?.toISOString(),
      })),
    })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error reordering columns:', error)
    return NextResponse.json({ error: 'Failed to reorder columns' }, { status: 500 })
  }
}
