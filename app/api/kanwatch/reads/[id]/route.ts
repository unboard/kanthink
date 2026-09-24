import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { kanwatchReads } from '@/lib/db/schema';
import { kanwatchUser } from '@/lib/kanwatch/access';
import { BuildError, cardFromRead } from '@/lib/kanwatch/build';

/**
 * PATCH /api/kanwatch/reads/:id — what you made of a page Kan flagged.
 *
 * { verdict: 'dismissed' }             not interesting (Jev learns from this)
 * { verdict: 'saved', channelId }      save it as a card in that channel
 * { reflection: '…' }                  your answer to the nudge
 * { verdict: null }                    undo
 *
 * Saved and dismissed pages both ride along the next time Jev decides what's worth a
 * look, which is how it learns what you care about. Building an app from a page is
 * POST …/build.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await kanwatchUser();
  if (!userId) return NextResponse.json({ error: 'Not available' }, { status: 403 });
  const { id } = await params;

  const read = await db.query.kanwatchReads.findFirst({
    where: and(eq(kanwatchReads.id, id), eq(kanwatchReads.userId, userId)),
  });
  if (!read) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const update: Partial<typeof kanwatchReads.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.reflection === 'string') update.reflection = body.reflection.trim().slice(0, 2000) || null;

  if ('verdict' in body) {
    if (body.verdict !== null && body.verdict !== 'saved' && body.verdict !== 'dismissed') {
      return NextResponse.json({ error: 'Bad verdict' }, { status: 400 });
    }
    update.verdict = body.verdict;
  }

  let saved: { cardId: string; channelId: string } | null = null;
  if (body.verdict === 'saved' && typeof body.channelId === 'string') {
    try {
      saved = await cardFromRead(userId, read, body.channelId, { reflection: update.reflection ?? read.reflection });
    } catch (err) {
      if (err instanceof BuildError) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }
    update.cardId = saved.cardId;
  }

  await db.update(kanwatchReads).set(update).where(eq(kanwatchReads.id, read.id));
  return NextResponse.json({ ok: true, cardId: saved?.cardId ?? null, channelId: saved?.channelId ?? null });
}
