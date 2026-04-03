import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { cards, columns, tasks } from '@/lib/db/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { ensureSchema } from '@/lib/db/ensure-schema';

export const runtime = 'nodejs';

interface ActionRequest {
  action: string;
  args: Record<string, string>;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureSchema();
  const { action, args }: ActionRequest = await request.json();

  try {
    switch (action) {
      case 'complete_task': {
        const task = await db.query.tasks.findFirst({ where: eq(tasks.id, args.taskId) });
        if (!task) return NextResponse.json({ result: 'Task not found' });
        await db.update(tasks).set({ status: 'done', completedAt: new Date(), updatedAt: new Date() }).where(eq(tasks.id, args.taskId));
        return NextResponse.json({ result: `Completed task "${task.title}"`, taskId: args.taskId });
      }

      case 'create_task': {
        const id = nanoid();
        const now = new Date().toISOString();
        const nowDate = new Date();
        await db.insert(tasks).values({
          id,
          channelId: args.channelId,
          cardId: args.cardId || null,
          title: args.title,
          description: args.description || '',
          status: 'not_started',
          createdBy: session.user.id,
          createdAt: nowDate,
          updatedAt: nowDate,
        });
        return NextResponse.json({ result: `Created task "${args.title}"`, taskId: id });
      }

      case 'add_note': {
        const card = await db.query.cards.findFirst({ where: eq(cards.id, args.cardId) });
        if (!card) return NextResponse.json({ result: 'Card not found' });
        const msgs = (card.messages || []) as unknown[];
        const newMsg = { id: nanoid(), type: 'note' as const, content: args.content, createdAt: new Date().toISOString() };
        const updated = [...msgs, newMsg] as typeof card.messages;
        await db.update(cards).set({ messages: updated, updatedAt: new Date() }).where(eq(cards.id, args.cardId));
        return NextResponse.json({ result: `Added note to "${card.title}"`, cardId: args.cardId });
      }

      case 'create_card': {
        const channelCols = await db.query.columns.findMany({
          where: eq(columns.channelId, args.channelId),
          orderBy: [asc(columns.position)],
        });
        const col = args.columnName
          ? channelCols.find(c => c.name.toLowerCase() === args.columnName.toLowerCase())
          : channelCols[0];
        if (!col) return NextResponse.json({ result: `Column "${args.columnName}" not found` });

        const existing = await db.query.cards.findMany({
          where: and(eq(cards.columnId, col.id), eq(cards.isArchived, false)),
          orderBy: [desc(cards.position)],
          limit: 1,
        });
        const pos = existing.length > 0 ? existing[0].position + 1 : 0;
        const id = nanoid();
        const now = new Date();
        const messages = args.content ? [{ id: nanoid(), type: 'note' as const, content: args.content, createdAt: now.toISOString() }] : [];

        await db.insert(cards).values({
          id, channelId: args.channelId, columnId: col.id, title: args.title,
          messages: messages as typeof cards.$inferInsert.messages,
          source: 'ai', position: pos, createdAt: now, updatedAt: now,
        });
        return NextResponse.json({ result: `Created card "${args.title}" in ${col.name}`, cardId: id });
      }

      case 'update_task_status': {
        const task = await db.query.tasks.findFirst({ where: eq(tasks.id, args.taskId) });
        if (!task) return NextResponse.json({ result: 'Task not found' });
        const updates: Record<string, unknown> = { status: args.status, updatedAt: new Date() };
        if (args.status === 'done') updates.completedAt = new Date();
        await db.update(tasks).set(updates).where(eq(tasks.id, args.taskId));
        return NextResponse.json({ result: `Updated task "${task.title}" to ${args.status}`, taskId: args.taskId });
      }

      default:
        return NextResponse.json({ result: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('[Voice action]', err);
    return NextResponse.json({ result: `Failed: ${err instanceof Error ? err.message : 'Unknown error'}` });
  }
}
