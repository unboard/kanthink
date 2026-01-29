import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { instructionCards } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { nanoid } from 'nanoid'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/channels/:id/instructions
 * Create a new instruction card
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
      title,
      instructions,
      action,
      target,
      contextColumns,
      runMode = 'manual',
      cardCount,
      interviewQuestions,
      isEnabled = false,
      triggers,
      safeguards,
    } = body

    if (!title || !instructions || !action || !target) {
      return NextResponse.json(
        { error: 'title, instructions, action, and target are required' },
        { status: 400 }
      )
    }

    // Get max position
    const existingInstructions = await db.query.instructionCards.findMany({
      where: eq(instructionCards.channelId, channelId),
      orderBy: [desc(instructionCards.position)],
      limit: 1,
    })

    const maxPosition = existingInstructions.length > 0 ? existingInstructions[0].position : -1
    const position = maxPosition + 1

    const instructionId = nanoid()
    const now = new Date()

    await db.insert(instructionCards).values({
      id: instructionId,
      channelId,
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
      position,
      createdAt: now,
      updatedAt: now,
    })

    const created = await db.query.instructionCards.findFirst({
      where: eq(instructionCards.id, instructionId),
    })

    return NextResponse.json(
      {
        instructionCard: {
          ...created,
          lastExecutedAt: created?.lastExecutedAt?.toISOString(),
          nextScheduledRun: created?.nextScheduledRun?.toISOString(),
          dailyCountResetAt: created?.dailyCountResetAt?.toISOString(),
          createdAt: created?.createdAt?.toISOString(),
          updatedAt: created?.updatedAt?.toISOString(),
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error creating instruction card:', error)
    return NextResponse.json({ error: 'Failed to create instruction card' }, { status: 500 })
  }
}
