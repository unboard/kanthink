import { NextResponse } from 'next/server';
import { getLLMClientForUser, type LLMMessage } from '@/lib/ai/llm';
import { auth } from '@/lib/auth';
import { recordUsage } from '@/lib/usage';
import { extractChannelConfig, cleanDisplayResponse, type ChannelConfig } from '@/lib/channelCreation/extractChannelConfig';
import { CHANNEL_DESIGN_RULES, CHANNEL_CONFIG_EXAMPLE } from '@/lib/channelCreation/designRules';

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

You're helping the user create a new channel.

${CHANNEL_DESIGN_RULES}

Existing channels: ${existingList}

Your approach:
1. Ask what they want to organize or track (1-2 sentences, warm and concise)
2. Based on their response, ask 1-2 focused clarifying questions if needed
3. When you have enough context (usually after 1-3 exchanges), propose a complete channel config

When ready, include the config in your response using this exact format:

[CHANNEL_CONFIG]
${CHANNEL_CONFIG_EXAMPLE}
[/CHANNEL_CONFIG]

Important guidelines:
- Be conversational, warm, and concise — you're a helpful collaborator, not a wizard
- Don't ask more than 2 questions per message
- 1-3 exchanges should be enough before proposing a config
- If the user gives a clear, specific description, propose the config right away (even on the first message)
- When proposing, include a brief conversational message explaining what you've set up and why
- If they ask for changes after a proposal, propose the whole config again with the changes in`;

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

    const result = await getLLMClientForUser(userId, undefined, 'chat');
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
      // A full config — a rubric in the instructions, complete shroom briefs — outgrew
      // the provider default of 4096 tokens and was cut off mid-JSON, which reads as
      // no config at all.
      const response = await llm.complete(messages, { maxTokens: 16000 });
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
