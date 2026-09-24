import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cards, kanwatchEpisodes } from '@/lib/db/schema';
import { kanwatchUser } from '@/lib/kanwatch/access';
import { loadAccess } from '@/lib/voice/resolveReference';
import { rereadSites } from '@/lib/kanwatch/judge';

/**
 * PATCH /api/kanwatch/episodes/:id — what an episode actually was.
 *
 * { verdict: 'confirmed' }                          Jev had it right
 * { verdict: 'corrected', channelId?, cardId?, label? }  it was this instead
 * { verdict: 'not_work', label? }                   not work
 * { verdict: null }                                 undo
 *
 * These answers are the training signal: the most recent ones ride along as
 * examples every time a new episode is judged.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await kanwatchUser();
  if (!userId) return NextResponse.json({ error: 'Not available' }, { status: 403 });
  const { id } = await params;

  const ep = await db.query.kanwatchEpisodes.findFirst({
    where: and(eq(kanwatchEpisodes.id, id), eq(kanwatchEpisodes.userId, userId)),
  });
  if (!ep) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const verdict = body.verdict as 'confirmed' | 'corrected' | 'not_work' | null;
  if (verdict !== null && !['confirmed', 'corrected', 'not_work'].includes(verdict)) {
    return NextResponse.json({ error: 'Bad verdict' }, { status: 400 });
  }

  const access = await loadAccess(userId);
  let channelId: string | null = null;
  let cardId: string | null = null;
  if (verdict === 'confirmed') {
    channelId = ep.guessChannelId;
    cardId = ep.guessCardId;
  } else if (verdict === 'corrected') {
    if (typeof body.cardId === 'string') {
      const card = await db.query.cards.findFirst({ where: eq(cards.id, body.cardId), columns: { id: true, channelId: true } });
      if (card && access.readable.includes(card.channelId)) {
        cardId = card.id;
        channelId = card.channelId;
      }
    }
    if (!channelId && typeof body.channelId === 'string' && access.readable.includes(body.channelId)) {
      channelId = body.channelId;
    }
  }

  await db.update(kanwatchEpisodes).set({
    verdict,
    verdictChannelId: channelId,
    verdictCardId: cardId,
    label: verdict ? String(body.label ?? '').trim().slice(0, 120) || null : null,
    updatedAt: new Date(),
  }).where(eq(kanwatchEpisodes.id, ep.id));

  // Teach the rest of today's reads on these sites.
  let sites: string[] = [];
  try { sites = JSON.parse(ep.domains ?? '[]'); } catch {}
  await rereadSites(userId, sites, ep.id);

  return NextResponse.json({ ok: true });
}
