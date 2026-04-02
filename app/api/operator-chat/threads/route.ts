import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { operatorChatThreads } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { ensureSchema } from '@/lib/db/ensure-schema';
import { nanoid } from 'nanoid';

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
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      threads: threads.map((t) => ({
        id: t.id,
        title: t.title,
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
