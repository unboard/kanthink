import { NextResponse } from 'next/server';
import { createLLMClient, type LLMMessage } from '@/lib/ai/llm';

interface InstructionChatRequest {
  userMessage: string;
  isInitialGreeting?: boolean;
  context: {
    channelName: string;
    channelDescription: string;
    currentInstructions: string;
    conversationHistory: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>;
  };
  aiConfig: {
    provider: 'anthropic' | 'openai';
    apiKey: string;
    model?: string;
  };
}

function buildPrompt(
  userMessage: string,
  isInitialGreeting: boolean,
  context: InstructionChatRequest['context']
): LLMMessage[] {
  const { channelName, channelDescription, currentInstructions, conversationHistory } = context;

  const systemPrompt = `You are a clarity engine helping users develop clear, actionable instructions for an AI-powered Kanban channel. Your role is to have a brief conversation to understand what the user wants, then generate well-structured instructions.

Channel context:
- Name: "${channelName}"
- Description: "${channelDescription || 'No description set'}"
- Current instructions: ${currentInstructions ? `"${currentInstructions}"` : 'None set yet'}

Your approach:
1. Ask 1-2 clarifying questions at a time to understand:
   - What topics/content should the AI generate?
   - What tone or style is preferred?
   - What format should cards take?
   - Any constraints or things to avoid?

2. When you have enough context (usually after 2-3 exchanges), generate structured instructions.

3. When generating instructions, wrap them in [INSTRUCTIONS] tags like this:
[INSTRUCTIONS]
Your clear, actionable instructions here...
[/INSTRUCTIONS]

Guidelines:
- Be conversational but concise
- Don't ask too many questions - 2-3 exchanges should be enough
- Instructions should be specific and actionable
- Focus on what the AI should generate, not how the user will use it
- If the user provides a clear description, you can generate instructions quickly`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Add conversation history
  for (const msg of conversationHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Add the current message (or initial greeting request)
  if (isInitialGreeting) {
    messages.push({
      role: 'user',
      content: `Start the conversation by greeting me and asking about what I want this "${channelName}" channel to generate. Keep it brief and friendly.`,
    });
  } else {
    messages.push({ role: 'user', content: userMessage });
  }

  return messages;
}

function extractInstructions(response: string): string | null {
  const match = response.match(/\[INSTRUCTIONS\]([\s\S]*?)\[\/INSTRUCTIONS\]/);
  if (match) {
    return match[1].trim();
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const body: InstructionChatRequest = await request.json();
    const { userMessage, isInitialGreeting, context, aiConfig } = body;

    // Validate required fields
    if (!context || !aiConfig) {
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

    if (!aiConfig.apiKey) {
      return NextResponse.json(
        { error: 'No API key configured' },
        { status: 400 }
      );
    }

    // Create LLM client
    const llm = createLLMClient({
      provider: aiConfig.provider,
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
    });

    // Build prompt
    const messages = buildPrompt(userMessage || '', isInitialGreeting ?? false, context);

    try {
      const response = await llm.complete(messages);
      const responseText = response.content;

      // Check if response contains instructions
      const draftInstructions = extractInstructions(responseText);

      // Clean the response text (remove instruction tags for display)
      let displayResponse = responseText;
      if (draftInstructions) {
        displayResponse = responseText
          .replace(/\[INSTRUCTIONS\][\s\S]*?\[\/INSTRUCTIONS\]/, '')
          .trim();

        // If there's text before or after, keep it. Otherwise, add a lead-in.
        if (!displayResponse) {
          displayResponse = "Here are the instructions I've drafted based on our conversation:";
        }
      }

      return NextResponse.json({
        success: true,
        response: displayResponse,
        draftInstructions: draftInstructions,
      });
    } catch (llmError) {
      console.error('LLM error:', llmError);
      return NextResponse.json(
        { error: `LLM error: ${llmError instanceof Error ? llmError.message : 'Unknown error'}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Instruction chat error:', error);
    return NextResponse.json(
      { error: 'Failed to get AI response' },
      { status: 500 }
    );
  }
}
