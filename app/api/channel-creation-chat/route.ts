import { NextResponse } from 'next/server';
import { getLLMClientForUser, type LLMMessage } from '@/lib/ai/llm';
import { auth } from '@/lib/auth';
import { recordUsage } from '@/lib/usage';
import { extractChannelConfig, cleanDisplayResponse, type ChannelConfig } from '@/lib/channelCreation/extractChannelConfig';

interface ChannelCreationChatRequest {
  userMessage: string;
  isInitialGreeting?: boolean;
  isWelcome?: boolean;
  context: {
    existingChannelNames: string[];
    conversationHistory: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>;
  };
}

function buildPrompt(
  userMessage: string,
  isInitialGreeting: boolean,
  isWelcome: boolean,
  context: ChannelCreationChatRequest['context']
): LLMMessage[] {
  const { existingChannelNames, conversationHistory } = context;

  const existingList = existingChannelNames.length > 0
    ? existingChannelNames.map(n => `"${n}"`).join(', ')
    : 'None yet';

  const systemPrompt = `You are Kan, a helpful AI assistant for Kanthink — a Kanban app where each channel is an AI-assisted, goal-driven workspace.

You're helping the user create a new channel. A channel has:
- **name**: Short, descriptive (e.g., "Competitor Research", "Product Ideas", "Weekly Planning")
- **description**: One sentence explaining the channel's purpose
- **instructions**: Guidance for the AI when working in this channel (what to focus on, tone, domain knowledge)
- **columns**: 3-5 Kanban columns for organizing cards. The first column marked isAiTarget is where AI-generated cards land. Common patterns:
  - Research: Inbox → Interesting → Deep Dive → Archive
  - Ideas: New Ideas → Promising → In Progress → Done
  - Planning: Backlog → This Week → In Progress → Done
  - Tracking: Feed → Watching → Acting On → Archive
- **shrooms**: AI-powered automations. Each shroom has:
  - title: Short name (e.g., "Generate article ideas")
  - instructions: What the AI should do when this shroom runs
  - action: "generate" (create new cards), "modify" (update existing cards), or "move" (move cards between columns)
  - targetColumnName: The source column — where AI looks for/adds cards
  - cardCount: Number of cards to generate (only for "generate" action, typically 3-5)

Existing channels: ${existingList}

Your approach:
1. Ask what they want to organize or track (1-2 sentences, warm and concise)
2. Based on their response, ask 1-2 focused clarifying questions if needed
3. When you have enough context (usually after 1-3 exchanges), propose a complete channel config

When ready, include the config in your response using this exact format:

[CHANNEL_CONFIG]
{
  "name": "Channel Name",
  "description": "One sentence describing the channel",
  "instructions": "Detailed instructions for AI behavior in this channel",
  "columns": [
    {"name": "Inbox", "description": "New items land here", "isAiTarget": true},
    {"name": "Interesting", "description": "Items worth exploring"},
    {"name": "Deep Dive", "description": "Items being researched in depth"},
    {"name": "Archive", "description": "Completed or dismissed items"}
  ],
  "shrooms": [
    {"title": "Generate ideas", "instructions": "Generate fresh, specific ideas related to...", "action": "generate", "targetColumnName": "Inbox", "cardCount": 5}
  ]
}
[/CHANNEL_CONFIG]

Important guidelines:
- Be conversational, warm, and concise — you're a helpful collaborator, not a wizard
- Don't ask more than 2 questions per message
- 1-3 exchanges should be enough before proposing a config
- If the user gives a clear, specific description, propose the config right away (even on the first message)
- Don't duplicate existing channel names — suggest variations if similar ones exist
- Always propose 3-5 columns with the first one marked as isAiTarget
- Always propose 1-2 relevant shrooms (at least one "generate" action)
- Keep instructions specific and actionable, tailored to the user's topic
- When proposing, include a brief conversational message explaining what you've set up and why
- Column names should be short (1-3 words) and reflect the user's domain`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Add conversation history
  for (const msg of conversationHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Add the current message or greeting request
  if (isInitialGreeting) {
    if (isWelcome) {
      messages.push({
        role: 'user',
        content: `I'm brand new to Kanthink and creating my first channel. Give me a brief, warm welcome (2-3 sentences) and ask what I'd like to organize or work on. Don't explain what Kanthink is — just ask what I'm working on. Keep it concise.`,
      });
    } else {
      messages.push({
        role: 'user',
        content: `I'm creating another channel. Give me a brief greeting (1-2 sentences) and ask what this channel should focus on. Don't re-introduce yourself. Keep it very concise.`,
      });
    }
  } else {
    messages.push({ role: 'user', content: userMessage });
  }

  return messages;
}

export async function POST(request: Request) {
  try {
    const body: ChannelCreationChatRequest = await request.json();
    const { userMessage, isInitialGreeting, isWelcome = false, context } = body;

    if (!context) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!isInitialGreeting && !userMessage) {
      return NextResponse.json(
        { error: 'Missing user message' },
        { status: 400 }
      );
    }

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

    const messages = buildPrompt(userMessage || '', isInitialGreeting ?? false, isWelcome, context);

    try {
      const response = await llm.complete(messages);
      const responseText = response.content;

      if (userId && usingOwnerKey) {
        await recordUsage(userId, 'channel-creation-chat');
      }

      const channelConfig: ChannelConfig | null = extractChannelConfig(responseText);
      const displayResponse = channelConfig
        ? cleanDisplayResponse(responseText)
        : responseText;

      return NextResponse.json({
        success: true,
        response: displayResponse,
        channelConfig,
      });
    } catch (llmError) {
      console.error('LLM error:', llmError);
      return NextResponse.json(
        { error: `LLM error: ${llmError instanceof Error ? llmError.message : 'Unknown error'}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Channel creation chat error:', error);
    return NextResponse.json(
      { error: 'Failed to get AI response' },
      { status: 500 }
    );
  }
}
