import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { getLLMClientForUser, type LLMMessage, type LLMContentPart } from '@/lib/ai/llm';
import { auth } from '@/lib/auth';
import { recordUsage } from '@/lib/usage';
import { db } from '@/lib/db';
import { cards, columns, operatorChatThreads } from '@/lib/db/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { ensureSchema } from '@/lib/db/ensure-schema';

export const runtime = 'nodejs';

interface ChannelSummary {
  id: string;
  name: string;
  description?: string;
  isBookmarks?: boolean;
  columns: {
    name: string;
    cards: { id: string; title: string; summary?: string; tags?: string[] }[];
  }[];
}

interface TaskSummary {
  id: string;
  title: string;
  status: string;
  channelId: string;
  cardId?: string;
  assignedTo?: string[];
  dueDate?: string;
}

interface OperatorChatRequest {
  threadId?: string;
  message: string;
  imageUrls?: string[];
  history: { role: 'user' | 'assistant'; content: string }[];
  channels: ChannelSummary[];
  tasks?: TaskSummary[];
  user?: { name?: string | null; email?: string | null };
}

interface OperatorAction {
  type: 'add_note' | 'create_card' | 'update_summary';
  cardId?: string;
  channelId?: string;
  columnName?: string;
  title?: string;
  content?: string;
}

interface ActionResult {
  type: string;
  success: boolean;
  description: string;
  cardId?: string;
  channelId?: string;
}

function buildSystemPrompt(
  channels: ChannelSummary[],
  tasks?: TaskSummary[],
  user?: { name?: string | null; email?: string | null; id?: string },
  membershipMap?: Record<string, string[]>,
): string {
  const channelContext = channels.map((ch) => {
    const cols = ch.columns.map((col) => {
      const cardList = col.cards.length > 0
        ? col.cards.map((c) => {
          let desc = `    - ${c.title} (id:${c.id})`;
          if (c.tags?.length) desc += ` [${c.tags.join(', ')}]`;
          if (c.summary) desc += ` — ${c.summary}`;
          return desc;
        }).join('\n')
        : '    (empty)';
      return `  ${col.name} (${col.cards.length}):\n${cardList}`;
    }).join('\n');
    const label = ch.isBookmarks ? '🔖' : '📋';
    return `${label} ${ch.name} (channelId:${ch.id})${ch.isBookmarks ? ' [BOOKMARKS CHANNEL]' : ''}${ch.description ? ` — ${ch.description}` : ''}\n${cols}`;
  }).join('\n\n');

  const totalCards = channels.reduce(
    (sum, ch) => sum + ch.columns.reduce((s, col) => s + col.cards.length, 0), 0
  );

  // Build task inventory
  let taskSection = '';
  if (tasks && tasks.length > 0) {
    const assignedToUser = user?.id ? tasks.filter(t => t.assignedTo?.includes(user.id!)) : [];
    const notDone = tasks.filter(t => t.status !== 'done');
    const done = tasks.filter(t => t.status === 'done');

    taskSection = `\n\n## TASKS (${tasks.length} total — ${done.length} done, ${notDone.length} not done)`;

    if (user?.id && assignedToUser.length > 0) {
      const myNotDone = assignedToUser.filter(t => t.status !== 'done');
      taskSection += `\n\nAssigned to current user (${assignedToUser.length} total, ${myNotDone.length} not done):`;
      for (const t of assignedToUser) {
        const channelName = channels.find(c => c.id === t.channelId)?.name || '?';
        taskSection += `\n  - "${t.title}" [${t.status}] in ${channelName}${t.dueDate ? ` (due: ${t.dueDate})` : ''}`;
      }
    }

    if (notDone.length > 0) {
      taskSection += `\n\nAll not-done tasks (${notDone.length}):`;
      for (const t of notDone.slice(0, 50)) {
        const channelName = channels.find(c => c.id === t.channelId)?.name || '?';
        const assigned = t.assignedTo?.length ? ` [assigned: ${t.assignedTo.join(', ')}]` : '';
        taskSection += `\n  - "${t.title}" [${t.status}] in ${channelName}${assigned}`;
      }
    }
  }

  // Build membership context
  let membershipSection = '';
  if (membershipMap && Object.keys(membershipMap).length > 0) {
    membershipSection = '\n\n## CHANNEL MEMBERSHIP';
    for (const ch of channels) {
      const members = membershipMap[ch.id];
      if (members && members.length > 0) {
        membershipSection += `\n${ch.name}: ${members.join(', ')}`;
      }
    }
  }

  // User identity
  const userSection = user?.name
    ? `\n\n## CURRENT USER\nName: ${user.name}${user.email ? ` (${user.email})` : ''}${user.id ? `\nUser ID: ${user.id}` : ''}`
    : '';

  return `You are Kan, the AI operator for Kanthink — a smart Kanban workspace.

You are the user's central hub. They come to you to:
- Ask questions about anything across their channels and cards
- Get suggestions on what to work on next
- Think through ideas and get feedback
- Route new information to the right channel
- Take actions: create cards, add notes to card threads, update cards
${userSection}

## YOUR WORKSPACE (${channels.length} channels, ${totalCards} cards)

${channelContext || '(No channels yet)'}${taskSection}${membershipSection}

## KAN BOOKMARKS

The channel marked [BOOKMARKS CHANNEL] is "Kan Bookmarks" — a special system channel where users save links, articles, and snippets from the web. When the user asks "what's in my bookmarks?" or "what have I saved?", look at this channel's cards. It's different from regular channels — it's a personal knowledge capture tool, not a project workspace.

## HOW TO RESPOND

- Be conversational, warm, and concise. You're a smart collaborator, not a formal assistant.
- When referencing cards or channels, be specific — name them and ALWAYS link them.
- If the user shares an idea, help them think it through. Suggest which channel it might belong in.
- If asked "what should I work on?", look at cards across channels and suggest priorities.
- If asked about a specific topic, search across all channels for relevant cards.
- Use markdown for formatting. Keep responses focused — 2-4 paragraphs max unless they ask for detail.
- Don't list every card unless asked. Summarize and highlight what's important.
- If you don't know something that isn't in the workspace data, say so honestly.

## LINKING — CRITICAL

ALWAYS use clickable kanthink:// links when mentioning cards or channels:
- Cards: [Card Title](kanthink://card/CARD_ID) — use the id shown as "id:XXX" in the data above
- Channels: [Channel Name](kanthink://channel/CHANNEL_ID) — use the channelId shown as "channelId:XXX" in the data above

Never mention a card or channel by name without linking it. This is how users navigate from the operator.

## ACTIONS

When the user asks you to DO something (create a card, add a note to a thread, update a card), include actions in your response. Actions are executed immediately.

Available actions:
- **add_note**: Add a note/message to a card's thread. Use when the user wants to capture text, a summary, or conversation content onto a card.
  - Requires: cardId, content (markdown)
- **create_card**: Create a new card in a channel. Suggest the best channel and column based on context.
  - Requires: channelId, columnName (exact column name from data), title, content (markdown, becomes the first message)
- **update_summary**: Update a card's summary/description.
  - Requires: cardId, content

When in doubt about where to place something, suggest a location and explain your reasoning — then include the action. The user asked you to do it, so do it.

## RESPONSE FORMAT

Respond with valid JSON:
{
  "response": "Your message (markdown supported with kanthink:// links)",
  "actions": [
    { "type": "add_note", "cardId": "CARD_ID", "content": "Note content in markdown" },
    { "type": "create_card", "channelId": "CHANNEL_ID", "columnName": "Inbox", "title": "Card Title", "content": "First message content" },
    { "type": "update_summary", "cardId": "CARD_ID", "content": "New summary text" }
  ]
}

The "actions" array is optional — only include it when the user asks you to do something. The "response" field is always required. Always respond with valid JSON.`;
}

interface ParsedResponse {
  response: string;
  actions?: OperatorAction[];
}

function parseResponse(raw: string): ParsedResponse {
  try {
    let json = raw.trim();
    if (json.startsWith('```json')) json = json.slice(7);
    else if (json.startsWith('```')) json = json.slice(3);
    if (json.endsWith('```')) json = json.slice(0, -3);
    json = json.trim();

    const parsed = JSON.parse(json);
    if (typeof parsed.response === 'string') {
      return {
        response: parsed.response,
        actions: Array.isArray(parsed.actions) ? parsed.actions : undefined,
      };
    }
  } catch {
    // Fall through to plain text
  }
  return { response: raw };
}

async function executeActions(actions: OperatorAction[], userId: string): Promise<ActionResult[]> {
  const results: ActionResult[] = [];

  for (const action of actions) {
    try {
      if (action.type === 'add_note' && action.cardId && action.content) {
        const card = await db.query.cards.findFirst({
          where: eq(cards.id, action.cardId),
        });
        if (!card) {
          results.push({ type: 'add_note', success: false, description: `Card not found: ${action.cardId}` });
          continue;
        }
        const existingMessages = (card.messages || []) as unknown[];
        const newMessage = {
          id: nanoid(),
          type: 'note' as const,
          content: action.content,
          createdAt: new Date().toISOString(),
        };
        const updatedMessages = [...existingMessages, newMessage] as typeof card.messages;
        await db.update(cards)
          .set({ messages: updatedMessages, updatedAt: new Date() })
          .where(eq(cards.id, action.cardId));
        results.push({
          type: 'add_note',
          success: true,
          description: `Added note to card`,
          cardId: action.cardId,
          channelId: card.channelId,
        });

      } else if (action.type === 'create_card' && action.channelId && action.title) {
        // Find the target column
        const channelColumns = await db.query.columns.findMany({
          where: eq(columns.channelId, action.channelId),
          orderBy: [asc(columns.position)],
        });
        const targetCol = action.columnName
          ? channelColumns.find(c => c.name === action.columnName)
          : channelColumns[0];
        if (!targetCol) {
          results.push({ type: 'create_card', success: false, description: `Column "${action.columnName}" not found` });
          continue;
        }

        // Get max position
        const existingCards = await db.query.cards.findMany({
          where: and(eq(cards.columnId, targetCol.id), eq(cards.isArchived, false)),
          orderBy: [desc(cards.position)],
          limit: 1,
        });
        const position = existingCards.length > 0 ? existingCards[0].position + 1 : 0;

        const cardId = nanoid();
        const now = new Date();
        const messages = action.content ? [{
          id: nanoid(),
          type: 'note' as const,
          content: action.content,
          createdAt: now.toISOString(),
        }] : [] as { id: string; type: 'note'; content: string; createdAt: string }[];

        await db.insert(cards).values({
          id: cardId,
          channelId: action.channelId,
          columnId: targetCol.id,
          title: action.title,
          messages,
          source: 'ai',
          position,
          createdAt: now,
          updatedAt: now,
        });
        results.push({
          type: 'create_card',
          success: true,
          description: `Created card "${action.title}" in ${targetCol.name}`,
          cardId,
          channelId: action.channelId,
        });

      } else if (action.type === 'update_summary' && action.cardId && action.content) {
        const card = await db.query.cards.findFirst({
          where: eq(cards.id, action.cardId),
        });
        if (!card) {
          results.push({ type: 'update_summary', success: false, description: `Card not found: ${action.cardId}` });
          continue;
        }
        await db.update(cards)
          .set({ summary: action.content, summaryUpdatedAt: new Date(), updatedAt: new Date() })
          .where(eq(cards.id, action.cardId));
        results.push({
          type: 'update_summary',
          success: true,
          description: `Updated card summary`,
          cardId: action.cardId,
          channelId: card.channelId,
        });
      }
    } catch (error) {
      console.error(`Action ${action.type} failed:`, error);
      results.push({ type: action.type, success: false, description: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  }

  return results;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureSchema();

    const body: OperatorChatRequest = await request.json();
    const { threadId, message, imageUrls, history, channels: channelData, tasks: taskData, user: userData } = body;

    if (!message && (!imageUrls || imageUrls.length === 0)) {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    }

    // Query channel membership
    let membershipMap: Record<string, string[]> = {};
    try {
      const { channelShares, channels: channelsTable, users: usersTable } = await import('@/lib/db/schema');
      const shares = await db.query.channelShares.findMany({
        columns: { channelId: true, userId: true },
      });
      // Also get channel owners
      const ownedChannels = await db.query.channels.findMany({
        columns: { id: true, ownerId: true },
      });
      // Get all relevant user names
      const userIds = new Set<string>();
      for (const s of shares) if (s.userId) userIds.add(s.userId);
      for (const c of ownedChannels) if (c.ownerId) userIds.add(c.ownerId);
      const allUsers = userIds.size > 0
        ? await db.query.users.findMany({ columns: { id: true, name: true, email: true } })
        : [];
      const userNameMap = new Map(allUsers.map(u => [u.id, u.name || u.email || u.id]));

      for (const c of ownedChannels) {
        if (c.ownerId) {
          membershipMap[c.id] = [userNameMap.get(c.ownerId) || c.ownerId + ' (owner)'];
        }
      }
      for (const s of shares) {
        if (s.userId && s.channelId) {
          if (!membershipMap[s.channelId]) membershipMap[s.channelId] = [];
          const name = userNameMap.get(s.userId) || s.userId;
          if (!membershipMap[s.channelId].includes(name)) {
            membershipMap[s.channelId].push(name);
          }
        }
      }
    } catch (e) {
      console.error('Failed to load membership:', e);
    }

    const result = await getLLMClientForUser(session.user.id);
    if (!result.client) {
      return NextResponse.json(
        { error: result.error || 'No AI access available.' },
        { status: 403 },
      );
    }

    const llm = result.client;
    const usingOwnerKey = result.source === 'owner';

    const messages: LLMMessage[] = [
      { role: 'system', content: buildSystemPrompt(
        channelData,
        taskData,
        { ...userData, id: session.user.id },
        membershipMap,
      ) },
    ];

    // Add conversation history (last 20 messages)
    const recentHistory = history.slice(-20);
    for (const msg of recentHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Add current message
    if (imageUrls && imageUrls.length > 0) {
      const parts: LLMContentPart[] = [];
      if (message) parts.push({ type: 'text', text: message });
      for (const url of imageUrls) {
        parts.push({ type: 'image_url', image_url: { url } });
      }
      messages.push({ role: 'user', content: parts });
    } else {
      messages.push({ role: 'user', content: message });
    }

    const llmResponse = await llm.complete(messages);

    if (usingOwnerKey) {
      await recordUsage(session.user.id, 'operator-chat');
    }

    const parsed = parseResponse(llmResponse.content);

    // Execute actions if any
    let actionResults: ActionResult[] | undefined;
    if (parsed.actions && parsed.actions.length > 0) {
      actionResults = await executeActions(parsed.actions, session.user.id);
    }

    // Persist messages to thread if threadId provided
    if (threadId) {
      try {
        const thread = await db.query.operatorChatThreads.findFirst({
          where: and(eq(operatorChatThreads.id, threadId), eq(operatorChatThreads.userId, session.user.id)),
        });
        if (thread) {
          const existing = (thread.messages || []) as unknown[];
          const now = new Date().toISOString();
          const userMsg = { id: nanoid(), type: 'question' as const, content: message, createdAt: now };
          const aiMsg = { id: nanoid(), type: 'ai_response' as const, content: parsed.response, createdAt: now };
          const updated = [...existing, userMsg, aiMsg] as typeof thread.messages;

          const updateData: Record<string, unknown> = { messages: updated, updatedAt: new Date() };

          // Auto-title on first exchange
          if (!thread.title || thread.title === 'New conversation') {
            updateData.title = message.slice(0, 60) + (message.length > 60 ? '...' : '');
          }

          await db.update(operatorChatThreads).set(updateData).where(eq(operatorChatThreads.id, threadId));
        }
      } catch (e) {
        console.error('Failed to persist operator thread:', e);
      }
    }

    return NextResponse.json({
      response: parsed.response,
      actionResults,
    });
  } catch (error) {
    console.error('Operator chat error:', error);
    return NextResponse.json({ error: 'Failed to get AI response' }, { status: 500 });
  }
}
