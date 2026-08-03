import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { instructionCards } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { generateShroomSummary } from '@/lib/shrooms/generateSummary';
import { requirePermission, PermissionError } from '@/lib/api/permissions';

/**
 * Generate a shroom's board summary on demand.
 *
 * Deliberately thin: the prompt lives in `generateShroomSummary`, which also runs
 * automatically when instructions change. Two copies of that prompt would drift, and
 * the button would slowly stop matching what the board generates on its own.
 */
export async function POST(request: Request) {
  try {
    const { instructionId } = (await request.json()) as { instructionId?: string };
    if (!instructionId) {
      return NextResponse.json({ error: 'Missing instructionId' }, { status: 400 });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Please sign in to use AI features.' }, { status: 401 });
    }

    const shroom = await db.query.instructionCards.findFirst({
      where: eq(instructionCards.id, instructionId),
      columns: { id: true, channelId: true },
    });
    if (!shroom) {
      return NextResponse.json({ error: 'Shroom not found' }, { status: 404 });
    }

    await requirePermission(shroom.channelId, session.user.id, 'edit');

    const summary = await generateShroomSummary(instructionId);
    if (!summary) {
      return NextResponse.json(
        { error: 'Could not write a usable summary. Try again, or write one yourself.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, summary });
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Shroom summary error:', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}
