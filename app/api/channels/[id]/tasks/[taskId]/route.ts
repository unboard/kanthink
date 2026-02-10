import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { tasks } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { createNotification } from '@/lib/notifications/createNotification'

interface RouteParams {
  params: Promise<{ id: string; taskId: string }>
}

/**
 * PATCH /api/channels/:id/tasks/:taskId
 * Update a task
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId, taskId } = await params
  const userId = session.user.id

  try {
    await requirePermission(channelId, userId, 'edit')

    // Verify task belongs to this channel
    const task = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, taskId), eq(tasks.channelId, channelId)),
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const body = await req.json()
    const {
      title,
      description,
      status,
      assignedTo,
      dueDate,
      completedAt,
      cardId,
      position,
    } = body

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (title !== undefined) updates.title = title
    if (description !== undefined) updates.description = description
    if (status !== undefined) {
      updates.status = status
      // Auto-set completedAt when marking as done
      if (status === 'done' && !task.completedAt) {
        updates.completedAt = new Date()
      } else if (status !== 'done') {
        updates.completedAt = null
      }
    }
    if (assignedTo !== undefined) updates.assignedTo = assignedTo
    if (dueDate !== undefined) updates.dueDate = dueDate ? new Date(dueDate) : null
    if (completedAt !== undefined) updates.completedAt = completedAt ? new Date(completedAt) : null
    if (cardId !== undefined) updates.cardId = cardId
    if (position !== undefined) updates.position = position

    await db.update(tasks).set(updates).where(eq(tasks.id, taskId))

    const updatedTask = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
    })

    // Notify on task assignment changes
    if (assignedTo !== undefined && updatedTask) {
      const oldAssigned = (task.assignedTo as string[] | null) ?? []
      const newAssigned = (assignedTo as string[]) ?? []
      const newlyAssigned = newAssigned.filter(id => !oldAssigned.includes(id) && id !== userId)
      for (const assigneeId of newlyAssigned) {
        createNotification({
          userId: assigneeId,
          type: 'task_assigned',
          title: 'Task assigned to you',
          body: updatedTask.title,
          data: { channelId, taskId },
        }).catch(() => {})
      }
    }

    return NextResponse.json({
      task: {
        ...updatedTask,
        dueDate: updatedTask?.dueDate?.toISOString(),
        completedAt: updatedTask?.completedAt?.toISOString(),
        createdAt: updatedTask?.createdAt?.toISOString(),
        updatedAt: updatedTask?.updatedAt?.toISOString(),
      },
    })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error updating task:', error)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}

/**
 * DELETE /api/channels/:id/tasks/:taskId
 * Delete a task
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId, taskId } = await params
  const userId = session.user.id

  try {
    await requirePermission(channelId, userId, 'edit')

    // Verify task belongs to this channel
    const task = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, taskId), eq(tasks.channelId, channelId)),
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    await db.delete(tasks).where(eq(tasks.id, taskId))

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error deleting task:', error)
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}
