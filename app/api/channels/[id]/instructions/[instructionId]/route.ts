import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { instructionCards } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { requirePermission, PermissionError } from '@/lib/api/permissions'

interface RouteParams {
  params: Promise<{ id: string; instructionId: string }>
}

/**
 * PATCH /api/channels/:id/instructions/:instructionId
 * Update an instruction card
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId, instructionId } = await params
  const userId = session.user.id

  try {
    await requirePermission(channelId, userId, 'edit')

    // Verify instruction belongs to this channel
    const instruction = await db.query.instructionCards.findFirst({
      where: and(
        eq(instructionCards.id, instructionId),
        eq(instructionCards.channelId, channelId)
      ),
    })

    if (!instruction) {
      return NextResponse.json({ error: 'Instruction card not found' }, { status: 404 })
    }

    const body = await req.json()
    const {
      title,
      instructions,
      action,
      target,
      contextColumns,
      runMode,
      cardCount,
      interviewQuestions,
      isEnabled,
      triggers,
      safeguards,
      lastExecutedAt,
      nextScheduledRun,
      dailyExecutionCount,
      dailyCountResetAt,
      executionHistory,
      position,
    } = body

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (title !== undefined) updates.title = title
    if (instructions !== undefined) updates.instructions = instructions
    if (action !== undefined) updates.action = action
    if (target !== undefined) updates.target = target
    if (contextColumns !== undefined) updates.contextColumns = contextColumns
    if (runMode !== undefined) updates.runMode = runMode
    if (cardCount !== undefined) updates.cardCount = cardCount
    if (interviewQuestions !== undefined) updates.interviewQuestions = interviewQuestions
    if (isEnabled !== undefined) updates.isEnabled = isEnabled
    if (triggers !== undefined) updates.triggers = triggers
    if (safeguards !== undefined) updates.safeguards = safeguards
    if (lastExecutedAt !== undefined) updates.lastExecutedAt = lastExecutedAt ? new Date(lastExecutedAt) : null
    if (nextScheduledRun !== undefined) updates.nextScheduledRun = nextScheduledRun ? new Date(nextScheduledRun) : null
    if (dailyExecutionCount !== undefined) updates.dailyExecutionCount = dailyExecutionCount
    if (dailyCountResetAt !== undefined) updates.dailyCountResetAt = dailyCountResetAt ? new Date(dailyCountResetAt) : null
    if (executionHistory !== undefined) updates.executionHistory = executionHistory
    if (position !== undefined) updates.position = position

    await db.update(instructionCards).set(updates).where(eq(instructionCards.id, instructionId))

    const updated = await db.query.instructionCards.findFirst({
      where: eq(instructionCards.id, instructionId),
    })

    return NextResponse.json({
      instructionCard: {
        ...updated,
        lastExecutedAt: updated?.lastExecutedAt?.toISOString(),
        nextScheduledRun: updated?.nextScheduledRun?.toISOString(),
        dailyCountResetAt: updated?.dailyCountResetAt?.toISOString(),
        createdAt: updated?.createdAt?.toISOString(),
        updatedAt: updated?.updatedAt?.toISOString(),
      },
    })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error updating instruction card:', error)
    return NextResponse.json({ error: 'Failed to update instruction card' }, { status: 500 })
  }
}

/**
 * DELETE /api/channels/:id/instructions/:instructionId
 * Delete an instruction card
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId, instructionId } = await params
  const userId = session.user.id

  try {
    await requirePermission(channelId, userId, 'edit')

    // Verify instruction belongs to this channel
    const instruction = await db.query.instructionCards.findFirst({
      where: and(
        eq(instructionCards.id, instructionId),
        eq(instructionCards.channelId, channelId)
      ),
    })

    if (!instruction) {
      return NextResponse.json({ error: 'Instruction card not found' }, { status: 404 })
    }

    await db.delete(instructionCards).where(eq(instructionCards.id, instructionId))

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error deleting instruction card:', error)
    return NextResponse.json({ error: 'Failed to delete instruction card' }, { status: 500 })
  }
}
