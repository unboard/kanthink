import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { tasks, cards } from '@/lib/db/schema'
import { eq, and, desc, gte, sql } from 'drizzle-orm'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { nanoid } from 'nanoid'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/channels/:id/tasks
 * Create a new task
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId } = await params
  const userId = session.user.id

  try {
    await ensureSchema()
    await requirePermission(channelId, userId, 'edit')

    const body = await req.json()
    const {
      id: clientId,
      cardId,
      title,
      description = '',
      status = 'not_started',
      assignedTo,
      position: requestedPosition,
      createdAt: clientCreatedAt,
    } = body

    if (!title) {
      return NextResponse.json(
        { error: 'title is required' },
        { status: 400 }
      )
    }

    // If cardId provided, verify it belongs to this channel
    if (cardId) {
      const card = await db.query.cards.findFirst({
        where: and(eq(cards.id, cardId), eq(cards.channelId, channelId)),
      })

      if (!card) {
        return NextResponse.json({ error: 'Card not found' }, { status: 404 })
      }
    }

    // Get max position — non-fatal, default to 0 if query fails
    let position = 0
    try {
      const existingTasks = await db.query.tasks.findMany({
        where: cardId
          ? eq(tasks.cardId, cardId)
          : and(eq(tasks.channelId, channelId), eq(tasks.cardId, '')),
        orderBy: [desc(tasks.position)],
        limit: 1,
      })

      const maxPosition = existingTasks.length > 0 ? existingTasks[0].position : -1
      position = requestedPosition !== undefined ? requestedPosition : maxPosition + 1
    } catch (e) {
      console.error('Position query failed (using 0):', e)
      position = requestedPosition !== undefined ? requestedPosition : 0
    }

    // If inserting at a specific position, shift other tasks
    if (requestedPosition !== undefined && cardId) {
      try {
        await db
          .update(tasks)
          .set({ position: sql`${tasks.position} + 1` })
          .where(
            and(
              eq(tasks.cardId, cardId),
              gte(tasks.position, requestedPosition)
            )
          )
      } catch (e) {
        console.error('Position shift failed:', e)
      }
    }

    // Use client-provided ID if given (for optimistic sync), otherwise generate
    const taskId = clientId || nanoid()
    const now = new Date()
    const createdAtDate = clientCreatedAt ? new Date(clientCreatedAt) : now

    // INSERT — the critical operation
    await db.insert(tasks).values({
      id: taskId,
      channelId,
      cardId: cardId || null,
      title,
      description,
      status,
      assignedTo: assignedTo || null,
      position,
      createdBy: body.createdBy || userId,
      createdAt: createdAtDate,
      updatedAt: now,
    })

    // Read back — non-fatal, construct response from input if this fails
    let responseTask: Record<string, unknown> = {
      id: taskId,
      channelId,
      cardId: cardId || null,
      title,
      description,
      status,
      assignedTo: assignedTo || null,
      notes: [],
      position,
      dueDate: null,
      completedAt: null,
      createdBy: body.createdBy || userId,
      createdAt: createdAtDate.toISOString(),
      updatedAt: now.toISOString(),
    }
    try {
      const createdTask = await db.query.tasks.findFirst({
        where: eq(tasks.id, taskId),
      })
      if (createdTask) {
        responseTask = {
          ...createdTask,
          dueDate: createdTask.dueDate?.toISOString() ?? null,
          completedAt: createdTask.completedAt?.toISOString() ?? null,
          createdAt: createdTask.createdAt?.toISOString() ?? createdAtDate.toISOString(),
          updatedAt: createdTask.updatedAt?.toISOString() ?? now.toISOString(),
        }
      }
    } catch (e) {
      console.error('Task read-back failed (using constructed response):', e)
    }

    return NextResponse.json({ task: responseTask }, { status: 201 })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error creating task:', error)
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}
