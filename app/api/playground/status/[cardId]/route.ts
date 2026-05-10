import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { cards } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ cardId: string }>;
}

/**
 * Lightweight GET used by PlaygroundView to poll for generation completion when
 * the original /api/playground/generate fetch dies (mobile screen-off, tab
 * suspension, network blip). Returns enough of the card to reconcile local
 * state with whatever the server-side Gemini call produced.
 *
 * The generate route's DB write happens regardless of whether the client is
 * still connected — Vercel functions complete on their own — so by the time
 * the user comes back to their phone the work is usually done.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { cardId } = await params;
  const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) });
  if (!card) {
    return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  }

  return NextResponse.json({
    typeData: card.typeData,
    messages: card.messages,
    title: card.title,
    summary: card.summary,
    cardType: card.cardType,
    isPublic: card.isPublic,
    shareToken: card.shareToken,
  });
}
