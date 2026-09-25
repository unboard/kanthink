import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { operatorChatThreads } from '@/lib/db/schema';
import { ensureSchema } from '@/lib/db/ensure-schema';
import { nanoid } from 'nanoid';
import { and, eq } from 'drizzle-orm';

export const runtime = 'nodejs';

/**
 * Persist a voice session's transcript.
 *
 * Voice conversations used to vanish when the overlay closed — nothing the user or
 * Kan said was stored anywhere. Each session now lands as an operator chat thread,
 * so it shows up in the same history as typed conversations with Kan.
 *
 * The client saves as the conversation goes, not only at the end: a phone that
 * locks or a tab that is killed never runs the end-of-session save, and a whole
 * conversation used to disappear that way. The first save creates the thread and
 * returns its id; later saves pass `threadId` and replace its messages.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await ensureSchema();

  const body = await request.json().catch(() => null);
  const turns: Array<{ role: 'user' | 'kan'; text: string; at: string }> =
    Array.isArray(body?.turns) ? body.turns : [];

  // A session where nobody said anything worth keeping shouldn't create a thread.
  const meaningful = turns.filter((t) => t?.text?.trim().length > 0);
  if (meaningful.length === 0) {
    return NextResponse.json({ saved: false });
  }

  const firstUserLine = meaningful.find((t) => t.role === 'user')?.text.trim();
  const title = `🎙 ${(firstUserLine || 'Voice conversation').slice(0, 60)}`;

  const now = new Date();
  const messages = meaningful.map((t) => ({
    id: nanoid(),
    type: t.role === 'user' ? ('question' as const) : ('ai_response' as const),
    content: String(t.text).trim().slice(0, 8000),
    createdAt: t.at || now.toISOString(),
  }));

  // A later save in the same session: replace that thread, if it is this user's.
  if (typeof body?.threadId === 'string') {
    const existing = await db.query.operatorChatThreads.findFirst({
      where: and(eq(operatorChatThreads.id, body.threadId), eq(operatorChatThreads.userId, session.user.id)),
      columns: { id: true, titleGenerated: true },
    });
    if (existing) {
      // A title Kan already wrote from the conversation outranks its first line.
      await db.update(operatorChatThreads)
        .set({ ...(existing.titleGenerated ? {} : { title }), messages, updatedAt: now })
        .where(eq(operatorChatThreads.id, existing.id));
      return NextResponse.json({ saved: true, threadId: existing.id });
    }
  }

  const id = nanoid();
  await db.insert(operatorChatThreads).values({
    id,
    userId: session.user.id,
    title,
    kind: 'voice',
    messages,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ saved: true, threadId: id });
}
