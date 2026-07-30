import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { instructionCards } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { sendShroomRunEmail } from '@/lib/shrooms/sendRunEmail'
import type { InstructionCard } from '@/lib/types'

interface RouteParams {
  params: Promise<{ id: string; instructionId: string }>
}

/**
 * POST /api/channels/:id/instructions/:instructionId/test-email
 *
 * Send the shroom's email once, using a stand-in outcome, so you can see what the brief
 * actually produces without waiting for a real run. Composing is non-deterministic, so
 * reading the brief tells you much less than reading one of its emails.
 *
 * Goes to the channel owner like any other shroom email — there's no recipient to pass.
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId, instructionId } = await params

  try {
    await ensureSchema()
    await requirePermission(channelId, session.user.id, 'edit')

    const row = await db.query.instructionCards.findFirst({
      where: and(
        eq(instructionCards.id, instructionId),
        eq(instructionCards.channelId, channelId)
      ),
    })

    if (!row) {
      return NextResponse.json({ error: 'Shroom not found' }, { status: 404 })
    }

    const instructionCard = row as unknown as InstructionCard

    if (!instructionCard.emailConfig?.brief?.trim()) {
      return NextResponse.json(
        { error: 'Describe what the email should say first.' },
        { status: 400 }
      )
    }

    // Force the send even if "skip when nothing happened" is on — a test that silently
    // sends nothing is indistinguishable from one that's broken.
    const result = await sendShroomRunEmail(
      {
        ...instructionCard,
        emailConfig: { ...instructionCard.emailConfig, enabled: true, skipWhenNothingHappened: false },
      },
      channelId,
      sampleOutcome(instructionCard),
      session.user.id
    )

    if (!result.sent) {
      return NextResponse.json({ error: `Could not send: ${result.reason}` }, { status: 502 })
    }

    return NextResponse.json({ sent: true })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error sending test shroom email:', error)
    return NextResponse.json({ error: 'Failed to send test email' }, { status: 500 })
  }
}

/** Plausible stand-in results, shaped to match the shroom's action. */
function sampleOutcome(instructionCard: InstructionCard) {
  switch (instructionCard.action) {
    case 'report':
      return {
        action: 'report' as const,
        report: {
          headline: 'Sample report — this is a test',
          highlights: [
            'This is a test email, so these findings are made up',
            'A real run would summarise what it actually found on your board',
          ],
          summary: 'Sent from the shroom editor to preview how your brief reads.',
        },
      }
    case 'modify':
      return {
        action: 'modify' as const,
        modified: [
          { title: 'Sample card A', change: 'Test email — no card was really changed' },
          { title: 'Sample card B' },
        ],
      }
    case 'move':
      return {
        action: 'move' as const,
        moved: [{ title: 'Sample card', toColumn: 'Done' }],
      }
    default:
      return {
        action: 'generate' as const,
        created: [
          { title: 'Sample generated card 1' },
          { title: 'Sample generated card 2' },
        ],
        createdArePending: !instructionCard.autoApprove,
      }
  }
}
