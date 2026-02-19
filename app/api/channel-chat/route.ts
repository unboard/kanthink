import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import type { ChannelChatMessage, ChannelStoredAction, ChannelProposedActionType } from '@/lib/types';
import { getLLMClientForUser, type LLMMessage, type LLMContentPart } from '@/lib/ai/llm';
import { auth } from '@/lib/auth';
import { recordUsage } from '@/lib/usage';
import { db } from '@/lib/db';
import { channelChatThreads } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { ensureSchema } from '@/lib/db/ensure-schema';

export const runtime = 'nodejs';

async function getWebTools() {
  const { extractUrls, fetchUrls, formatWebContext, detectsSearchIntent, webSearch, formatSearchContext } = await import('@/lib/web/tools');
  return { extractUrls, fetchUrls, formatWebContext, detectsSearchIntent, webSearch, formatSearchContext };
}

interface ColumnContext {
  name: string;
  cards: { title: string; tags?: string[]; taskCount?: number }[];
}

interface ChannelChatRequest {
  threadId: string;
  channelId: string;
  questionContent: string;
  imageUrls?: string[];
  context: {
    channelName: string;
    channelDescription: string;
    aiInstructions: string;
    columns: ColumnContext[];
    tagDefinitions?: { name: string; color: string }[];
    threadMessages: ChannelChatMessage[];
    threadTitle?: string;
  };
}

interface ProposedAction {
  type: ChannelProposedActionType;
  data: {
    title?: string;
    description?: string;
    columnName?: string;
    cardTitle?: string;
  };
}

interface AIStructuredResponse {
  response: string;
  actions?: ProposedAction[];
  threadTitle?: string;
}

function buildPrompt(
  questionContent: string,
  context: ChannelChatRequest['context'],
  imageUrls?: string[],
  webContext?: string,
): LLMMessage[] {
  const { channelName, channelDescription, aiInstructions, columns, tagDefinitions, threadMessages, threadTitle } = context;

  // Build column/card context
  const columnContext = columns
    .map((col) => {
      const cardList = col.cards.length > 0
        ? col.cards.map((c) => {
          let desc = `  - ${c.title}`;
          if (c.tags?.length) desc += ` [${c.tags.join(', ')}]`;
          if (c.taskCount) desc += ` (${c.taskCount} tasks)`;
          return desc;
        }).join('\n')
        : '  (empty)';
      return `${col.name}:\n${cardList}`;
    })
    .join('\n\n');

  const tagContext = tagDefinitions?.length
    ? `\nAvailable tags: ${tagDefinitions.map((t) => t.name).join(', ')}`
    : '';

  const webContextSection = webContext ? `\n\n${webContext}` : '';

  const needsTitle = !threadTitle || threadTitle === 'New conversation';
  const titleInstruction = needsTitle
    ? `\n- "threadTitle": A short (3-6 word) title summarizing the conversation topic. Only include this field in your FIRST response.`
    : '';

  const systemPrompt = `You are Kan, an AI assistant for a Kanban channel. You help users organize, plan, and manage work at the channel level. Respond helpfully and concisely.

Channel: "${channelName}"${channelDescription ? ` — ${channelDescription}` : ''}
${aiInstructions ? `Channel instructions: ${aiInstructions}\n` : ''}
Board structure:
${columnContext}${tagContext}${webContextSection}

You can propose actions when relevant. Available actions:
- create_card: Create a new card in a specific column
- create_task: Create a task (optionally linked to a card by title)

IMPORTANT: Your response MUST be valid JSON in this exact format:
{
  "response": "Your helpful message here (supports markdown)"${titleInstruction},
  "actions": [
    { "type": "create_card", "data": { "title": "Card title", "columnName": "Column Name" } },
    { "type": "create_task", "data": { "title": "Task title", "description": "Optional", "cardTitle": "Optional parent card" } }
  ]
}

Guidelines:
- Always respond with valid JSON
- The "actions" array is optional — only include when proposing actionable items
- For create_card: use the exact column name from the board structure above
- For create_task: cardTitle is optional; omit to create a standalone task
- Keep responses concise and helpful
- You have full awareness of the board structure — reference cards and columns by name when relevant`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Add recent thread messages as conversation history
  const recentMessages = threadMessages.slice(-10);
  for (const msg of recentMessages) {
    if (msg.type === 'question') {
      const imageRef = msg.imageUrls?.length
        ? `\n[Attached images: ${msg.imageUrls.join(', ')}]`
        : '';
      messages.push({ role: 'user', content: `${msg.content}${imageRef}` });
    } else if (msg.type === 'ai_response') {
      messages.push({ role: 'assistant', content: msg.content });
    }
  }

  // Add the current question
  if (imageUrls && imageUrls.length > 0) {
    const parts: LLMContentPart[] = [];
    if (questionContent) {
      parts.push({ type: 'text', text: questionContent });
    }
    for (const url of imageUrls) {
      parts.push({ type: 'image_url', image_url: { url } });
    }
    messages.push({ role: 'user', content: parts });
  } else {
    messages.push({ role: 'user', content: questionContent });
  }

  return messages;
}

function parseAIResponse(rawContent: string): AIStructuredResponse {
  try {
    let jsonContent = rawContent.trim();
    if (jsonContent.startsWith('```json')) jsonContent = jsonContent.slice(7);
    else if (jsonContent.startsWith('```')) jsonContent = jsonContent.slice(3);
    if (jsonContent.endsWith('```')) jsonContent = jsonContent.slice(0, -3);
    jsonContent = jsonContent.trim();

    const parsed = JSON.parse(jsonContent);
    if (typeof parsed.response === 'string') {
      return {
        response: parsed.response,
        actions: Array.isArray(parsed.actions) ? parsed.actions : undefined,
        threadTitle: typeof parsed.threadTitle === 'string' ? parsed.threadTitle : undefined,
      };
    }
  } catch {
    // Fall through to plain text
  }
  return { response: rawContent };
}

function convertToStoredActions(actions: ProposedAction[]): ChannelStoredAction[] {
  const result: ChannelStoredAction[] = [];

  for (const action of actions) {
    if (!action.type || !action.data) continue;

    if (action.type === 'create_card') {
      if (!action.data.title || !action.data.columnName) continue;
      result.push({
        id: nanoid(),
        type: 'create_card',
        data: {
          title: action.data.title,
          columnName: action.data.columnName,
        },
        status: 'pending',
      });
    } else if (action.type === 'create_task') {
      if (!action.data.title) continue;
      result.push({
        id: nanoid(),
        type: 'create_task',
        data: {
          title: action.data.title,
          description: action.data.description,
          cardTitle: action.data.cardTitle,
        },
        status: 'pending',
      });
    }
  }

  return result;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureSchema();

    const body: ChannelChatRequest = await request.json();
    const { threadId, questionContent, imageUrls, context } = body;

    if ((!questionContent && (!imageUrls || imageUrls.length === 0)) || !context || !threadId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get LLM client
    const result = await getLLMClientForUser(session.user.id);
    if (!result.client) {
      return NextResponse.json(
        { error: result.error || 'No AI access available.' },
        { status: 403 },
      );
    }
    const llm = result.client;
    const usingOwnerKey = result.source === 'owner';

    // URL fetching and search intent
    let webContext = '';
    let useWebSearch = false;

    try {
      const webTools = await getWebTools();
      const urls = webTools.extractUrls(questionContent);

      if (urls.length > 0) {
        try {
          const pages = await webTools.fetchUrls(urls);
          webContext = webTools.formatWebContext(pages);
        } catch (error) {
          console.error('Web fetch error:', error);
        }
      } else if (webTools.detectsSearchIntent(questionContent)) {
        useWebSearch = true;
      }
    } catch (error) {
      console.error('Web tools load error:', error);
    }

    const messages = buildPrompt(questionContent, context, imageUrls, webContext);

    try {
      let llmResponse;

      if (useWebSearch && typeof llm.webSearch === 'function') {
        const systemPrompt = `You are Kan, an AI assistant for the "${context.channelName}" Kanban channel. Search the web for current information and provide a helpful, concise response.`;
        llmResponse = await llm.webSearch(questionContent, systemPrompt);
      } else {
        llmResponse = await llm.complete(messages);
      }

      if (usingOwnerKey) {
        await recordUsage(session.user.id, 'channel-chat');
      }

      const parsed = parseAIResponse(llmResponse.content);
      const actions = parsed.actions ? convertToStoredActions(parsed.actions) : undefined;

      // Build the user message and AI response
      const now = new Date().toISOString();
      const userMessage: ChannelChatMessage = {
        id: nanoid(),
        type: 'question',
        content: questionContent,
        imageUrls,
        authorId: session.user.id,
        authorName: session.user.name ?? undefined,
        authorImage: session.user.image ?? undefined,
        createdAt: now,
      };

      const aiMessage: ChannelChatMessage = {
        id: nanoid(),
        type: 'ai_response',
        content: parsed.response,
        createdAt: new Date().toISOString(),
        replyToMessageId: userMessage.id,
        proposedActions: actions && actions.length > 0 ? actions : undefined,
      };

      // Persist messages to thread
      const thread = await db.query.channelChatThreads.findFirst({
        where: and(
          eq(channelChatThreads.id, threadId),
          eq(channelChatThreads.userId, session.user.id),
        ),
      });

      if (thread) {
        const existingMessages = Array.isArray(thread.messages) ? thread.messages : [];
        const updatedMessages = [...existingMessages, userMessage, aiMessage];

        const updateData: Record<string, unknown> = {
          messages: updatedMessages,
          updatedAt: new Date(),
        };

        // Auto-set thread title on first response
        if (parsed.threadTitle && (thread.title === 'New conversation' || !thread.title)) {
          updateData.title = parsed.threadTitle;
        }

        await db.update(channelChatThreads)
          .set(updateData)
          .where(eq(channelChatThreads.id, threadId));
      }

      return NextResponse.json({
        response: parsed.response,
        actions: actions && actions.length > 0 ? actions : undefined,
        threadTitle: parsed.threadTitle,
        userMessage,
        aiMessage,
      });
    } catch (llmError) {
      console.error('LLM error:', llmError);
      return NextResponse.json(
        { error: `LLM error: ${llmError instanceof Error ? llmError.message : 'Unknown error'}` },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error('Channel chat error:', error);
    return NextResponse.json({ error: 'Failed to get AI response' }, { status: 500 });
  }
}
