import { NextResponse } from 'next/server';
import { and, asc, desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { cards, columns, kanwatchReads } from '@/lib/db/schema';
import { inColumnBucket } from '@/lib/db/cardBuckets';
import { kanwatchUser } from '@/lib/kanwatch/access';
import { loadAccess } from '@/lib/voice/resolveReference';

/**
 * PATCH /api/kanwatch/reads/:id — what you made of a page Kan flagged.
 *
 * { verdict: 'dismissed' }             not interesting (Jev learns from this)
 * { verdict: 'saved', channelId }      save it as a card in that channel
 * { reflection: '…' }                  your answer to the nudge
 * { verdict: null }                    undo
 *
 * Saved and dismissed pages both ride along the next time Jev decides what's worth a
 * look, which is how it learns what you care about.
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

  let cardId: string | null = null;
  let channelId: string | null = null;
  if (body.verdict === 'saved' && typeof body.channelId === 'string') {
    const access = await loadAccess(userId);
    if (!access.writable.has(body.channelId)) {
      return NextResponse.json({ error: 'You can’t add cards to that channel' }, { status: 403 });
    }
    const cols = await db.query.columns.findMany({
      where: eq(columns.channelId, body.channelId),
      orderBy: [asc(columns.position)],
    });
    const col = cols.find((c) => c.isAiTarget) ?? cols[0];
    if (!col) return NextResponse.json({ error: 'That channel has no columns' }, { status: 400 });

    const last = await db.query.cards.findFirst({
      where: inColumnBucket(col.id, 'active'),
      orderBy: [desc(cards.position)],
      columns: { position: true },
    });
    const reflection = update.reflection ?? read.reflection;
    const content = [
      read.tldr,
      read.why ? `**Why it matters:** ${read.why}` : '',
      reflection ? `**My take:** ${reflection}` : '',
      `[${read.domain ?? 'Open the page'}](${read.url})`,
    ].filter(Boolean).join('\n\n');
    const now = new Date();
    cardId = nanoid();
    channelId = body.channelId;
    await db.insert(cards).values({
      id: cardId,
      channelId: body.channelId,
      columnId: col.id,
      title: (read.title || read.domain || 'Saved page').slice(0, 200),
      messages: [{ id: nanoid(), type: 'note', content, createdAt: now.toISOString() }] as typeof cards.$inferInsert.messages,
      source: 'manual',
      position: (last?.position ?? -1) + 1,
      createdAt: now,
      updatedAt: now,
    });
    update.cardId = cardId;
  }

  await db.update(kanwatchReads).set(update).where(eq(kanwatchReads.id, read.id));
  return NextResponse.json({ ok: true, cardId, channelId });
}
