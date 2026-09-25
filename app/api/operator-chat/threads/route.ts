import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { operatorChatThreads } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { ensureSchema } from '@/lib/db/ensure-schema';
import { nanoid } from 'nanoid';
import { afterResponse } from '@/lib/afterResponse';
import { displayTitle, isVoice, titleThreads, untitledThreads } from '@/lib/chat/threadTitles';

export const runtime = 'nodejs';

/** GET /api/operator-chat/threads — list threads for current user */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureSchema();

    const threads = await db.query.operatorChatThreads.findMany({
      where: eq(operatorChatThreads.userId, session.user.id),
      orderBy: [desc(operatorChatThreads.updatedAt)],
      columns: {
        id: true,
        title: true,
        kind: true,
        titleGenerated: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Titles still to be written from their conversations; done after the response,
    // so the list opens instantly and the client re-fetches once.
    const pending = (await untitledThreads(session.user.id)).length;
    if (pending > 0) {
      const userId = session.user.id;
      afterResponse(async () => { await titleThreads(userId); });
    }

    return NextResponse.json({
      pending,
      threads: threads.map((t) => ({
        id: t.id,
        title: displayTitle(t),
        voice: isVoice(t),
        titled: !!t.titleGenerated,
        createdAt: t.createdAt?.toISOString(),
        updatedAt: t.updatedAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error('List operator threads error:', error);
    return NextResponse.json({ error: 'Failed to list threads' }, { status: 500 });
  }
}

/** POST /api/operator-chat/threads — create a new thread */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureSchema();

    const id = nanoid();
    const now = new Date();

    await db.insert(operatorChatThreads).values({
      id,
      userId: session.user.id,
      title: 'New conversation',
      messages: [],
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ id, title: 'New conversation', createdAt: now.toISOString() });
  } catch (error) {
    console.error('Create operator thread error:', error);
    return NextResponse.json({ error: 'Failed to create thread' }, { status: 500 });
  }
}
