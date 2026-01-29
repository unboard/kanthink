import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { tasks, cards } from '@/lib/db/schema'
import { eq, and, desc, gte, sql } from 'drizzle-orm'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
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
    await requirePermission(channelId, userId, 'edit')

    const body = await req.json()
    const {
      id: clientId,
      cardId,
      title,
      description = '',
      status = 'not_started',
      position: requestedPosition,
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

    // Get max position for this card (or unlinked tasks)
    const existingTasks = await db.query.tasks.findMany({
      where: cardId
        ? eq(tasks.cardId, cardId)
        : and(eq(tasks.channelId, channelId), eq(tasks.cardId, '')),
      orderBy: [desc(tasks.position)],
      limit: 1,
    })

    const maxPosition = existingTasks.length > 0 ? existingTasks[0].position : -1
    const position = requestedPosition !== undefined ? requestedPosition : maxPosition + 1

    // If inserting at a specific position, shift other tasks
    if (requestedPosition !== undefined && cardId) {
      await db
        .update(tasks)
        .set({ position: sql`${tasks.position} + 1` })
        .where(
          and(
            eq(tasks.cardId, cardId),
            gte(tasks.position, requestedPosition)
          )
        )
    }

    // Use client-provided ID if given (for optimistic sync), otherwise generate
    const taskId = clientId || nanoid()
    const now = new Date()

    await db.insert(tasks).values({
      id: taskId,
      channelId,
      cardId: cardId || null,
      title,
      description,
      status,
      position,
      createdAt: now,
      updatedAt: now,
    })

    const createdTask = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
    })

    return NextResponse.json(
      {
        task: {
          ...createdTask,
          dueDate: createdTask?.dueDate?.toISOString(),
          completedAt: createdTask?.completedAt?.toISOString(),
          createdAt: createdTask?.createdAt?.toISOString(),
          updatedAt: createdTask?.updatedAt?.toISOString(),
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error creating task:', error)
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}
