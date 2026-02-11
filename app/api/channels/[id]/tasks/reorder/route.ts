import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { tasks } from '@/lib/db/schema'
import { eq, and, ne, sql } from 'drizzle-orm'
import { requirePermission, PermissionError } from '@/lib/api/permissions'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/channels/:id/tasks/reorder
 * Reorder tasks within a card
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
    const { taskId, cardId, toPosition } = body

    if (!taskId || toPosition === undefined) {
      return NextResponse.json(
        { error: 'taskId and toPosition are required' },
        { status: 400 }
      )
    }

    // Fix corrupt JSON before querying
    await db.run(sql`UPDATE tasks SET notes = '[]' WHERE channel_id = ${channelId} AND notes IS NOT NULL AND notes != '' AND notes NOT LIKE '[%'`)

    // Verify task belongs to this channel
    const task = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, taskId), eq(tasks.channelId, channelId)),
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const fromPosition = task.position

    // Get all tasks for this card
    const cardTasks = await db.query.tasks.findMany({
      where: cardId ? eq(tasks.cardId, cardId) : eq(tasks.channelId, channelId),
      orderBy: (tasks, { asc }) => [asc(tasks.position)],
    })

    // Reorder in memory
    const taskIds = cardTasks.map((t) => t.id)
    const fromIndex = taskIds.indexOf(taskId)
    const toIndex = Math.min(Math.max(0, toPosition), taskIds.length - 1)

    if (fromIndex === -1) {
      return NextResponse.json({ error: 'Task not in card' }, { status: 400 })
    }

    // Remove and reinsert
    taskIds.splice(fromIndex, 1)
    taskIds.splice(toIndex, 0, taskId)

    // Update positions in database
    for (let i = 0; i < taskIds.length; i++) {
      await db
        .update(tasks)
        .set({ position: i, updatedAt: new Date() })
        .where(eq(tasks.id, taskIds[i]))
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error reordering tasks:', error)
    return NextResponse.json({ error: 'Failed to reorder tasks' }, { status: 500 })
  }
}
