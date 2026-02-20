import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { nanoid } from 'nanoid';
import type { CardMessage, TagDefinition, ProposedActionType, StoredAction } from '@/lib/types';
import { getLLMClientForUser, getLLMClient, type LLMMessage, type LLMContentPart } from '@/lib/ai/llm';
import { auth } from '@/lib/auth';
import { recordUsage, checkAnonymousUsageLimit, recordAnonymousUsage } from '@/lib/usage';

const ANON_COOKIE_NAME = 'kanthink_anon_id';

// Force Node.js runtime for jsdom compatibility
export const runtime = 'nodejs';

// Lazy import web tools to avoid module load issues
async function getWebTools() {
  const { extractUrls, fetchUrls, formatWebContext, detectsSearchIntent, webSearch, formatSearchContext } = await import('@/lib/web/tools');
  return { extractUrls, fetchUrls, formatWebContext, detectsSearchIntent, webSearch, formatSearchContext };
}

interface CardChatRequest {
  cardId: string;
  questionContent: string;
  imageUrls?: string[];
  context: {
    cardTitle: string;
    channelName: string;
    channelDescription: string;
    tasks: { title: string; status: string }[];
    previousMessages: CardMessage[];
    cardTags?: string[];           // Current tags on the card
    availableTags?: TagDefinition[];  // Tags defined in the channel
  };
}

// Type for AI-proposed actions (before we add IDs and status)
interface ProposedAction {
  type: ProposedActionType;
  data: {
    title?: string;
    description?: string;
    tagName?: string;
    createDefinition?: boolean;
    suggestedColor?: string;
  };
}

// Type for the structured JSON response from AI
interface AIStructuredResponse {
  response: string;
  actions?: ProposedAction[];
}

function buildPrompt(
  questionContent: string,
  context: CardChatRequest['context'],
  imageUrls?: string[],
  webContext?: string
): LLMMessage[] {
  const { cardTitle, channelName, channelDescription, tasks, previousMessages, cardTags, availableTags } = context;

  // Build tags context
  const tagContext = availableTags && availableTags.length > 0
    ? `\n- Available tags: ${availableTags.map(t => t.name).join(', ')}`
    : '';
  const currentTagsContext = cardTags && cardTags.length > 0
    ? `\n- Current card tags: ${cardTags.join(', ')}`
    : '';

  // Build web context section
  const webContextSection = webContext
    ? `\n\n${webContext}`
    : '';

  // Build task section with status breakdown
  let taskSection = '';
  if (tasks.length > 0) {
    const done = tasks.filter(t => t.status === 'done');
    const inProgress = tasks.filter(t => t.status === 'in_progress');
    const onHold = tasks.filter(t => t.status === 'on_hold');
    const notStarted = tasks.filter(t => t.status === 'not_started');
    const incomplete = tasks.filter(t => t.status !== 'done');

    const statusIcon: Record<string, string> = { done: '[DONE]', in_progress: '[IN PROGRESS]', on_hold: '[ON HOLD]', not_started: '[NOT STARTED]' };

    taskSection = `\nTasks (${done.length}/${tasks.length} done, ${incomplete.length} remaining):`;
    for (const t of tasks) {
      taskSection += `\n  ${statusIcon[t.status] ?? t.status} ${t.title}`;
    }
    if (notStarted.length > 0) taskSection += `\n  → ${notStarted.length} not started`;
    if (inProgress.length > 0) taskSection += `\n  → ${inProgress.length} in progress`;
    if (onHold.length > 0) taskSection += `\n  → ${onHold.length} on hold`;
    if (done.length > 0) taskSection += `\n  → ${done.length} done`;
  }

  const systemPrompt = `You are Kan, the AI assistant inside Kanthink — a Kanban board app.

Task statuses: not_started (hasn't begun), in_progress (being worked on), on_hold (paused/blocked), done (complete).
"Complete"/"done" = status is done. "Incomplete"/"remaining"/"left" = status is not_started or in_progress.
When answering about tasks, always cite specific task names and their statuses.

Card: "${cardTitle}"
Channel: "${channelName}"${channelDescription ? ` - ${channelDescription}` : ''}
${taskSection}${tagContext}${currentTagsContext}${webContextSection}

You can propose actions when relevant: create tasks, add/remove tags.

Your response MUST be valid JSON:
{
  "response": "Your message (markdown supported)",
  "actions": [
    { "type": "create_task", "data": { "title": "Task title", "description": "Optional" } },
    { "type": "add_tag", "data": { "tagName": "tag-name", "createDefinition": true, "suggestedColor": "blue" } },
    { "type": "remove_tag", "data": { "tagName": "tag-name" } }
  ]
}

Rules:
- Always valid JSON. "actions" is optional.
- create_task: when user asks to create a task or you identify action items
- add_tag: set createDefinition true if tag doesn't exist. Colors: red, orange, yellow, green, blue, purple, pink, neutral
- remove_tag: when user asks to remove a tag
- Be concise. Don't repeat context.`;

  // Build conversation history
  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Add previous messages as conversation history (last 10)
  const recentMessages = previousMessages.slice(-10);
  for (const msg of recentMessages) {
    if (msg.type === 'note') {
      const imageRef = msg.imageUrls?.length
        ? `\n[Attached images: ${msg.imageUrls.join(', ')}]`
        : '';
      messages.push({ role: 'user', content: `[Note] ${msg.content}${imageRef}` });
    } else if (msg.type === 'question') {
      const imageRef = msg.imageUrls?.length
        ? `\n[Attached images: ${msg.imageUrls.join(', ')}]`
        : '';
      messages.push({ role: 'user', content: `${msg.content}${imageRef}` });
    } else if (msg.type === 'ai_response') {
      messages.push({ role: 'assistant', content: msg.content });
    }
  }

  // Add the current question — with images if present
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
  // Try to parse as JSON first
  try {
    // Handle potential markdown code blocks
    let jsonContent = rawContent.trim();
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.slice(7);
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.slice(3);
    }
    if (jsonContent.endsWith('```')) {
      jsonContent = jsonContent.slice(0, -3);
    }
    jsonContent = jsonContent.trim();

    const parsed = JSON.parse(jsonContent);

    // Validate the structure
    if (typeof parsed.response === 'string') {
      return {
        response: parsed.response,
        actions: Array.isArray(parsed.actions) ? parsed.actions : undefined,
      };
    }
  } catch {
    // JSON parsing failed - fall through to plain text handling
  }

  // Fallback: treat as plain text response (backwards compatibility)
  return {
    response: rawContent,
    actions: undefined,
  };
}

function convertToStoredActions(actions: ProposedAction[]): StoredAction[] {
  const result: StoredAction[] = [];

  for (const action of actions) {
    // Validate action structure
    if (!action.type || !action.data) continue;

    if (action.type === 'create_task') {
      if (!action.data.title) continue;
      result.push({
        id: nanoid(),
        type: 'create_task',
        data: {
          title: action.data.title,
          description: action.data.description,
        },
        status: 'pending',
      });
    } else if (action.type === 'add_tag') {
      if (!action.data.tagName) continue;
      result.push({
        id: nanoid(),
        type: 'add_tag',
        data: {
          tagName: action.data.tagName,
          createDefinition: action.data.createDefinition,
          suggestedColor: action.data.suggestedColor,
        },
        status: 'pending',
      });
    } else if (action.type === 'remove_tag') {
      if (!action.data.tagName) continue;
      result.push({
        id: nanoid(),
        type: 'remove_tag',
        data: {
          tagName: action.data.tagName,
        },
        status: 'pending',
      });
    }
  }

  return result;
}

export async function POST(request: Request) {
  try {
    const body: CardChatRequest = await request.json();
    const { questionContent, imageUrls, context } = body;

    // Validate required fields
    if ((!questionContent && (!imageUrls || imageUrls.length === 0)) || !context) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get LLM client - supports both authenticated and anonymous users
    const session = await auth();
    const userId = session?.user?.id;

    let llm;
    let usingOwnerKey = false;
    let anonId: string | null = null;

    if (userId) {
      // Authenticated user
      const result = await getLLMClientForUser(userId);
      if (!result.client) {
        return NextResponse.json(
          { error: result.error || 'No AI access available. Configure your API key in Settings.' },
          { status: 403 }
        );
      }
      llm = result.client;
      usingOwnerKey = result.source === 'owner';
    } else {
      // Anonymous user - check usage limit
      const cookieStore = await cookies();
      anonId = cookieStore.get(ANON_COOKIE_NAME)?.value || `anon_${crypto.randomUUID()}`;

      const usageCheck = await checkAnonymousUsageLimit(anonId);
      if (!usageCheck.allowed) {
        const response = NextResponse.json(
          { error: usageCheck.message, code: 'ANONYMOUS_LIMIT_REACHED' },
          { status: 403 }
        );
        response.cookies.set(ANON_COOKIE_NAME, anonId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 365,
        });
        return response;
      }

      llm = getLLMClient();
      if (!llm) {
        return NextResponse.json(
          { error: 'AI service not available' },
          { status: 503 }
        );
      }
      usingOwnerKey = true;
    }

    // Extract and fetch URLs from the question
    let webContext = '';
    let useWebSearch = false;

    try {
      const webTools = await getWebTools();
      const urls = webTools.extractUrls(questionContent);

      if (urls.length > 0) {
        // Fetch specific URLs mentioned in the message
        try {
          const pages = await webTools.fetchUrls(urls);
          webContext = webTools.formatWebContext(pages);
        } catch (error) {
          console.error('Web fetch error:', error);
        }
      } else if (webTools.detectsSearchIntent(questionContent)) {
        // No URLs found but user seems to want current information
        // Use OpenAI's web_search tool via Responses API
        useWebSearch = true;
      }
    } catch (error) {
      console.error('Web tools load error:', error);
    }

    // Build prompt with web context (from URL fetch)
    const messages = buildPrompt(questionContent, context, imageUrls, webContext);

    try {
      let llmResponse;

      // Use OpenAI web search for search queries (if available)
      if (useWebSearch && typeof llm.webSearch === 'function') {
        const systemPrompt = `You are Kan, an AI assistant helping with a Kanban card titled "${context.cardTitle}" in the "${context.channelName}" channel. Search the web for current information and provide a helpful, concise response. Cite your sources when relevant.`;
        llmResponse = await llm.webSearch(questionContent, systemPrompt);
      } else {
        // Regular completion (with URL context if available)
        llmResponse = await llm.complete(messages);
      }

      // Record usage
      if (usingOwnerKey) {
        if (userId) {
          await recordUsage(userId, 'card-chat');
        } else if (anonId) {
          await recordAnonymousUsage(anonId, 'card-chat');
        }
      }

      // Parse the structured response
      const parsed = parseAIResponse(llmResponse.content);

      // Convert proposed actions to stored actions with IDs
      const actions = parsed.actions
        ? convertToStoredActions(parsed.actions)
        : undefined;

      const response = NextResponse.json({
        success: true,
        response: parsed.response,
        actions: actions && actions.length > 0 ? actions : undefined,
      });

      // Set anonymous cookie if needed
      if (anonId) {
        response.cookies.set(ANON_COOKIE_NAME, anonId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 365,
        });
      }

      return response;
    } catch (llmError) {
      console.error('LLM error:', llmError);
      return NextResponse.json(
        { error: `LLM error: ${llmError instanceof Error ? llmError.message : 'Unknown error'}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Card chat error:', error);
    return NextResponse.json(
      { error: 'Failed to get AI response' },
      { status: 500 }
    );
  }
}
