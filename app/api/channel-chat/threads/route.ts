import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { channelChatThreads } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { ensureSchema } from '@/lib/db/ensure-schema';

export const runtime = 'nodejs';

// GET /api/channel-chat/threads?channelId=xxx — List threads
// GET /api/channel-chat/threads?threadId=xxx — Get single thread with messages
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureSchema();

  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get('threadId');
  const channelId = searchParams.get('channelId');

  // Single thread fetch
  if (threadId) {
    const thread = await db.query.channelChatThreads.findFirst({
      where: and(
        eq(channelChatThreads.id, threadId),
        eq(channelChatThreads.userId, session.user.id),
      ),
    });

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: thread.id,
      channelId: thread.channelId,
      title: thread.title,
      messages: thread.messages ?? [],
      createdAt: thread.createdAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: thread.updatedAt?.toISOString() ?? new Date().toISOString(),
    });
  }

  // List threads for channel
  if (!channelId) {
    return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
  }

  const threads = await db.query.channelChatThreads.findMany({
    where: and(
      eq(channelChatThreads.channelId, channelId),
      eq(channelChatThreads.userId, session.user.id),
    ),
    orderBy: [desc(channelChatThreads.updatedAt)],
  });

  return NextResponse.json(
    threads.map((t) => ({
      id: t.id,
      channelId: t.channelId,
      title: t.title,
      messageCount: Array.isArray(t.messages) ? t.messages.length : 0,
      createdAt: t.createdAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: t.updatedAt?.toISOString() ?? new Date().toISOString(),
    }))
  );
}

// POST /api/channel-chat/threads — Create a new thread
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureSchema();

  const body = await request.json();
  const { channelId } = body;

  if (!channelId) {
    return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
  }

  const now = new Date();
  const id = crypto.randomUUID();

  await db.insert(channelChatThreads).values({
    id,
    channelId,
    userId: session.user.id,
    title: 'New conversation',
    messages: [],
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({
    id,
    channelId,
    title: 'New conversation',
    messages: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
}

// PATCH /api/channel-chat/threads — Update thread messages (e.g. action status changes)
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureSchema();

  const body = await request.json();
  const { threadId, messages } = body;

  if (!threadId || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'threadId and messages are required' }, { status: 400 });
  }

  await db.update(channelChatThreads)
    .set({ messages, updatedAt: new Date() })
    .where(
      and(
        eq(channelChatThreads.id, threadId),
        eq(channelChatThreads.userId, session.user.id),
      )
    );

  return NextResponse.json({ success: true });
}

// DELETE /api/channel-chat/threads?threadId=xxx — Delete a thread
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureSchema();

  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get('threadId');

  if (!threadId) {
    return NextResponse.json({ error: 'threadId is required' }, { status: 400 });
  }

  await db.delete(channelChatThreads).where(
    and(
      eq(channelChatThreads.id, threadId),
      eq(channelChatThreads.userId, session.user.id),
    )
  );

  return NextResponse.json({ success: true });
}
