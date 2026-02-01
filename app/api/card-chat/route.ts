import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import type { CardMessage, TagDefinition, ProposedActionType, StoredAction } from '@/lib/types';
import { getLLMClientForUser, type LLMMessage, type LLMContentPart } from '@/lib/ai/llm';
import { auth } from '@/lib/auth';
import { recordUsage } from '@/lib/usage';

// Force Node.js runtime for jsdom compatibility
export const runtime = 'nodejs';

// Lazy import web tools to avoid module load issues
async function getWebTools() {
  const { extractUrls, fetchUrls, formatWebContext, detectsSearchIntent } = await import('@/lib/web/tools');
  return { extractUrls, fetchUrls, formatWebContext, detectsSearchIntent };
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

  const systemPrompt = `You are Kan, an AI assistant helping with a Kanban card. Respond helpfully and concisely.

Context:
- Card: "${cardTitle}"
- Channel: "${channelName}"${channelDescription ? ` - ${channelDescription}` : ''}
${tasks.length > 0 ? `- Tasks: ${tasks.map(t => `${t.title} (${t.status})`).join(', ')}` : ''}${tagContext}${currentTagsContext}${webContextSection}

You can propose actionable items when relevant. When the user mentions creating tasks, adding tags, or removing tags, you should include them in your response.

IMPORTANT: Your response MUST be valid JSON in this exact format:
{
  "response": "Your helpful text response here",
  "actions": [
    { "type": "create_task", "data": { "title": "Task title", "description": "Optional description" } },
    { "type": "add_tag", "data": { "tagName": "tag-name", "createDefinition": true, "suggestedColor": "blue" } },
    { "type": "remove_tag", "data": { "tagName": "tag-name" } }
  ]
}

Guidelines:
- Always respond with valid JSON
- The "response" field contains your helpful message to the user (can include markdown)
- The "actions" array is optional - only include it when proposing actionable items
- For create_task: use when user explicitly asks to create a task, or when you identify clear action items
- For add_tag: use when user asks to tag the card. Set createDefinition to true if the tag doesn't exist in available tags
- For remove_tag: use when user asks to remove a tag
- suggestedColor can be: "red", "orange", "yellow", "green", "blue", "purple", "pink", "neutral"
- Keep responses concise and to the point
- Don't repeat context unnecessarily`;

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

    // Get LLM client - requires authentication
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: 'Please sign in to use AI features.' },
        { status: 401 }
      );
    }

    const result = await getLLMClientForUser(userId);
    if (!result.client) {
      return NextResponse.json(
        { error: result.error || 'No AI access available. Configure your API key in Settings.' },
        { status: 403 }
      );
    }

    const llm = result.client;
    const usingOwnerKey = result.source === 'owner';

    // Extract and fetch URLs from the question
    let webContext = '';
    let urls: string[] = [];
    let isSearchQuery = false;

    try {
      const webTools = await getWebTools();
      urls = webTools.extractUrls(questionContent);

      if (urls.length > 0) {
        try {
          const pages = await webTools.fetchUrls(urls);
          webContext = webTools.formatWebContext(pages);
        } catch (error) {
          console.error('Web fetch error:', error);
        }
      }

      isSearchQuery = webTools.detectsSearchIntent(questionContent) && urls.length === 0;
    } catch (error) {
      console.error('Web tools load error:', error);
    }

    // Build prompt with web context
    const messages = buildPrompt(questionContent, context, imageUrls, webContext);

    try {
      let llmResponse;

      // Check if this is a search query and we have web search capability
      const hasWebSearch = typeof llm.webSearch === 'function';

      if (isSearchQuery && hasWebSearch) {
        // Use web search for research queries
        const systemPrompt = `You are Kan, an AI assistant helping with a Kanban card titled "${context.cardTitle}" in the "${context.channelName}" channel. Search the web for current information and provide a helpful response. Be concise and cite sources when relevant.`;
        llmResponse = await llm.webSearch!(questionContent, systemPrompt);
      } else {
        // Use regular completion (with fetched URL context if available)
        llmResponse = await llm.complete(messages);
      }

      if (userId && usingOwnerKey) {
        await recordUsage(userId, 'card-chat');
      }

      // Parse the structured response
      const parsed = parseAIResponse(llmResponse.content);

      // Convert proposed actions to stored actions with IDs
      const actions = parsed.actions
        ? convertToStoredActions(parsed.actions)
        : undefined;

      return NextResponse.json({
        success: true,
        response: parsed.response,
        actions: actions && actions.length > 0 ? actions : undefined,
      });
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
