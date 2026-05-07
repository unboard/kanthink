import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cards } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{ token: string }>;
}

interface PlaygroundTypeData {
  code?: string;
  codeTitle?: string;
  codeSummary?: string;
  generationCount?: number;
}

/**
 * GET /api/public/playground/:token
 * Returns the latest playground snapshot for a public card. No auth required.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { token } = await params;

  const card = await db.query.cards.findFirst({
    where: and(eq(cards.shareToken, token), eq(cards.isPublic, true)),
  });

  if (!card || card.cardType !== 'playground') {
    return NextResponse.json({ error: 'Playground not found or not public' }, { status: 404 });
  }

  const typeData = (card.typeData as PlaygroundTypeData | null) || {};
  if (!typeData.code) {
    return NextResponse.json({ error: 'Playground has no code yet' }, { status: 404 });
  }

  return NextResponse.json({
    title: typeData.codeTitle || card.title,
    summary: typeData.codeSummary || card.summary || '',
    code: typeData.code,
    generationCount: typeData.generationCount || 0,
  });
}
