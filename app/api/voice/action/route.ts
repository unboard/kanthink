import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { cards, channels, columns, tasks } from '@/lib/db/schema';
import { eq, and, desc, asc, like } from 'drizzle-orm';
import { ensureSchema } from '@/lib/db/ensure-schema';

/** Find a task by ID, or fallback to title search if ID doesn't match */
async function findTask(taskId: string) {
  // Try exact ID first
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (task) return task;
  // Fallback: maybe Gemini passed a title instead of ID
  const byTitle = await db.query.tasks.findFirst({ where: like(tasks.title, `%${taskId}%`) });
  return byTitle;
}

/** Find a card by ID, or fallback to title search */
async function findCard(cardId: string) {
  const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) });
  if (card) return card;
  const byTitle = await db.query.cards.findFirst({ where: like(cards.title, `%${cardId}%`) });
  return byTitle;
}

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
        const task = await findTask(args.taskId);
        if (!task) return NextResponse.json({ result: `Task not found: "${args.taskId}"` });
        await db.update(tasks).set({ status: 'done', completedAt: new Date(), updatedAt: new Date() }).where(eq(tasks.id, task.id));
        return NextResponse.json({ result: `Completed task "${task.title}"`, taskId: task.id });
      }

      case 'create_task': {
        const id = nanoid();
        const nowDate = new Date();

        // Resolve cardId — might be an ID or a card name
        let resolvedCardId: string | null = null;
        if (args.cardId) {
          const card = await findCard(args.cardId);
          resolvedCardId = card?.id || null;
        }

        // Resolve channelId — might be an ID or channel name
        let resolvedChannelId = args.channelId;
        if (args.channelId) {
          const ch = await db.query.channels.findFirst({ where: eq(channels.id, args.channelId) });
          if (!ch) {
            // Try by name
            const { channels: channelsTable } = await import('@/lib/db/schema');
            const byName = await db.query.channels.findFirst({ where: like(channelsTable.name, `%${args.channelId}%`) });
            if (byName) resolvedChannelId = byName.id;
          }
        }

        await db.insert(tasks).values({
          id,
          channelId: resolvedChannelId,
          cardId: resolvedCardId,
          title: args.title,
          description: args.description || '',
          status: 'not_started',
          createdBy: session.user.id,
          createdAt: nowDate,
          updatedAt: nowDate,
        });
        return NextResponse.json({ result: `Created task "${args.title}"${resolvedCardId ? '' : ' (standalone)'}`, taskId: id });
      }

      case 'add_note': {
        const card = await findCard(args.cardId);
        if (!card) return NextResponse.json({ result: `Card not found: "${args.cardId}"` });
        const msgs = (card.messages || []) as unknown[];
        const newMsg = { id: nanoid(), type: 'note' as const, content: args.content, createdAt: new Date().toISOString() };
        const updated = [...msgs, newMsg] as typeof card.messages;
        await db.update(cards).set({ messages: updated, updatedAt: new Date() }).where(eq(cards.id, card.id));
        return NextResponse.json({ result: `Added note to "${card.title}"`, cardId: card.id });
      }

      case 'create_card': {
        // Resolve channelId from name if needed
        let cardChannelId = args.channelId;
        const chCheck = await db.query.channels.findFirst({ where: eq(channels.id, args.channelId) });
        if (!chCheck) {
          const byName = await db.query.channels.findFirst({ where: like(channels.name, `%${args.channelId}%`) });
          if (byName) cardChannelId = byName.id;
        }

        const channelCols = await db.query.columns.findMany({
          where: eq(columns.channelId, cardChannelId),
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
          id, channelId: cardChannelId, columnId: col.id, title: args.title,
          messages: messages as typeof cards.$inferInsert.messages,
          source: 'ai', position: pos, createdAt: now, updatedAt: now,
        });
        return NextResponse.json({ result: `Created card "${args.title}" in ${col.name}`, cardId: id });
      }

      case 'update_task_status': {
        const task = await findTask(args.taskId);
        if (!task) return NextResponse.json({ result: `Task not found: "${args.taskId}"` });
        const updates: Record<string, unknown> = { status: args.status, updatedAt: new Date() };
        if (args.status === 'done') updates.completedAt = new Date();
        await db.update(tasks).set(updates).where(eq(tasks.id, task.id));
        return NextResponse.json({ result: `Updated task "${task.title}" to ${args.status}`, taskId: task.id });
      }

      case 'search_cards': {
        // Resolve channel
        let chId = args.channelId;
        const ch = await db.query.channels.findFirst({ where: eq(channels.id, chId) });
        if (!ch) {
          const byName = await db.query.channels.findFirst({ where: like(channels.name, `%${chId}%`) });
          if (byName) chId = byName.id;
          else return NextResponse.json({ result: `Channel not found: "${args.channelId}"` });
        }

        const limit = parseInt(args.limit || '5') || 5;
        let results;

        if (args.query) {
          // Search by keyword
          results = await db.query.cards.findMany({
            where: and(eq(cards.channelId, chId), eq(cards.isArchived, false), like(cards.title, `%${args.query}%`)),
            orderBy: [desc(cards.updatedAt)],
            limit,
          });
        } else {
          // Most recent cards
          results = await db.query.cards.findMany({
            where: and(eq(cards.channelId, chId), eq(cards.isArchived, false)),
            orderBy: [desc(cards.updatedAt)],
            limit,
          });
        }

        const channelName = ch?.name || (await db.query.channels.findFirst({ where: eq(channels.id, chId), columns: { name: true } }))?.name || chId;
        const cardSummaries = results.map(c => {
          const fmtDate = (d: Date | null) => d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '?';
          return `- "${c.title}" (cardId: ${c.id}) — modified: ${fmtDate(c.updatedAt)}, created: ${fmtDate(c.createdAt)}${c.summary ? ` — ${c.summary}` : ''}`;
        }).join('\n');

        return NextResponse.json({
          result: results.length > 0
            ? `Found ${results.length} card(s) in "${channelName}"${args.query ? ` matching "${args.query}"` : ' (most recent)'}:\n${cardSummaries}`
            : `No cards found in "${channelName}"${args.query ? ` matching "${args.query}"` : ''}`,
        });
      }

      case 'show_card': {
        const card = await findCard(args.cardId);
        if (!card) return NextResponse.json({ result: `Card not found: "${args.cardId}"` });
        const msgs = (card.messages || []) as Array<{ type: string; content: string }>;
        const cardTasks = await db.query.tasks.findMany({ where: eq(tasks.cardId, card.id) });
        const channel = await db.query.channels.findFirst({ where: eq(channels.id, card.channelId), columns: { name: true } });
        return NextResponse.json({
          result: `Showing card "${card.title}"`,
          cardPreview: {
            id: card.id,
            title: card.title,
            summary: card.summary,
            channelName: channel?.name || '',
            channelId: card.channelId,
            messages: msgs.map(m => ({ type: m.type, content: m.content })),
            tasks: cardTasks.map(t => ({ id: t.id, title: t.title, status: t.status })),
            tags: card.tags,
            coverImageUrl: card.coverImageUrl,
          },
        });
      }

      case 'archive_card': {
        const card = await findCard(args.cardId);
        if (!card) return NextResponse.json({ result: `Card not found: "${args.cardId}"` });
        await db.update(cards).set({ isArchived: true, updatedAt: new Date() }).where(eq(cards.id, card.id));
        return NextResponse.json({ result: `Archived card "${card.title}"`, cardId: card.id });
      }

      case 'send_email': {
        try {
          const { sendTransactionalEmail } = await import('@/lib/customerio');
          const { render } = await import('@react-email/render');
          const React = await import('react');
          const { VoiceComposed } = await import('@/lib/emails/VoiceComposed');

          if (!sendTransactionalEmail) {
            return NextResponse.json({ result: 'Email service not configured' });
          }

          const baseUrl = process.env.NEXTAUTH_URL || 'https://kanthink.com';
          const cardUrl = args.cardId ? `${baseUrl}/channel/${args.channelId || ''}/card/${args.cardId}` : undefined;
          const senderName = session.user.name || 'Kanthink User';

          const html = await render(React.createElement(VoiceComposed, {
            style: (args.style || 'professional') as 'professional' | 'casual' | 'newsletter' | 'update',
            senderName,
            recipientName: args.recipientName || undefined,
            subject: args.subject,
            body: args.body,
            cardTitle: args.cardTitle || undefined,
            cardUrl,
            ctaText: args.ctaText || undefined,
            ctaUrl: args.ctaUrl || undefined,
          }));

          const sent = await sendTransactionalEmail({ to: args.to, subject: args.subject, html });
          return NextResponse.json({ result: sent ? `Email sent to ${args.to}: "${args.subject}"` : 'Email sending failed' });
        } catch (emailErr) {
          console.error('[Voice email]', emailErr);
          return NextResponse.json({ result: `Email error: ${emailErr instanceof Error ? emailErr.message : 'Unknown'}` });
        }
      }

      default:
        return NextResponse.json({ result: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('[Voice action]', err);
    return NextResponse.json({ result: `Failed: ${err instanceof Error ? err.message : 'Unknown error'}` });
  }
}
