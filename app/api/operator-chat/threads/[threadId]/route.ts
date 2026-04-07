import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { operatorChatThreads } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { ensureSchema } from '@/lib/db/ensure-schema';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ threadId: string }>;
}

/** GET /api/operator-chat/threads/:threadId — load a thread with messages */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureSchema();
    const { threadId } = await params;

    const thread = await db.query.operatorChatThreads.findFirst({
      where: and(
        eq(operatorChatThreads.id, threadId),
        eq(operatorChatThreads.userId, session.user.id),
      ),
    });

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: thread.id,
      title: thread.title,
      messages: thread.messages || [],
      createdAt: thread.createdAt?.toISOString(),
      updatedAt: thread.updatedAt?.toISOString(),
    });
  } catch (error) {
    console.error('Get operator thread error:', error);
    return NextResponse.json({ error: 'Failed to load thread' }, { status: 500 });
  }
}

/** PATCH /api/operator-chat/threads/:threadId — update thread title/messages */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureSchema();
    const { threadId } = await params;
    const body = await req.json();

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.messages !== undefined) updates.messages = body.messages;

    await db.update(operatorChatThreads)
      .set(updates)
      .where(and(
        eq(operatorChatThreads.id, threadId),
        eq(operatorChatThreads.userId, session.user.id),
      ));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Update operator thread error:', error);
    return NextResponse.json({ error: 'Failed to update thread' }, { status: 500 });
  }
}

/** DELETE /api/operator-chat/threads/:threadId — delete a thread */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureSchema();
    const { threadId } = await params;

    await db.delete(operatorChatThreads)
      .where(and(
        eq(operatorChatThreads.id, threadId),
        eq(operatorChatThreads.userId, session.user.id),
      ));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Delete operator thread error:', error);
    return NextResponse.json({ error: 'Failed to delete thread' }, { status: 500 });
  }
}
