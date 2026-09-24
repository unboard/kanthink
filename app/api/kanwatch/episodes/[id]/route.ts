import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cards, kanwatchEpisodes } from '@/lib/db/schema';
import { kanwatchUser } from '@/lib/kanwatch/access';
import { loadAccess } from '@/lib/voice/resolveReference';
import { MODES, rereadSites } from '@/lib/kanwatch/judge';

/**
 * PATCH /api/kanwatch/episodes/:id — what an episode actually was.
 *
 * { verdict: 'confirmed' }                          Jev had it right
 * { verdict: 'corrected', channelId?, cardId?, label? }  it was this instead
 * { verdict: 'not_work', label? }                   not work
 * { verdict: null }                                 undo
 * { mode: 'admin' }                                 what you were doing — separate from what it was for
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

  // "Doing" can be changed on its own, without touching what the stretch was for.
  if ('mode' in body) {
    const mode = body.mode === null ? null : String(body.mode);
    if (mode !== null && !(mode in MODES)) return NextResponse.json({ error: 'Bad mode' }, { status: 400 });
    await db.update(kanwatchEpisodes).set({ verdictMode: mode, updatedAt: new Date() }).where(eq(kanwatchEpisodes.id, ep.id));
    if (!('verdict' in body)) {
      let touched: string[] = [];
      try { touched = JSON.parse(ep.domains ?? '[]'); } catch {}
      await rereadSites(userId, touched, ep.id);
      return NextResponse.json({ ok: true });
    }
  }

  // "It was… Admin" with no channel is an answer about doing, not about what for.
  const typed = typeof body.label === 'string' ? body.label.trim().toLowerCase() : '';
  if (body.verdict === 'corrected' && !body.channelId && typed in MODES) {
    await db.update(kanwatchEpisodes).set({ verdictMode: typed, updatedAt: new Date() }).where(eq(kanwatchEpisodes.id, ep.id));
    return NextResponse.json({ ok: true, movedToMode: typed });
  }

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
