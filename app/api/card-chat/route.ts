import { NextResponse } from 'next/server';
import type { CardMessage, Task } from '@/lib/types';
import { createLLMClient, type LLMMessage, type LLMContentPart } from '@/lib/ai/llm';

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
  };
  aiConfig: {
    provider: 'anthropic' | 'openai';
    apiKey: string;
    model?: string;
  };
}

function buildPrompt(
  questionContent: string,
  context: CardChatRequest['context'],
  imageUrls?: string[]
): LLMMessage[] {
  const { cardTitle, channelName, channelDescription, tasks, previousMessages } = context;

  const systemPrompt = `You are an AI assistant helping with a Kanban card. Respond helpfully and concisely. Keep responses focused and actionable.

Context:
- Card: "${cardTitle}"
- Channel: "${channelName}"${channelDescription ? ` - ${channelDescription}` : ''}
${tasks.length > 0 ? `- Tasks: ${tasks.map(t => `${t.title} (${t.status})`).join(', ')}` : ''}

Guidelines:
- Keep responses concise and to the point
- If suggesting actions, be specific
- Format lists and steps clearly
- Don't repeat context unnecessarily`;

  // Build conversation history
  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Add previous messages as conversation history (last 10)
  const recentMessages = previousMessages.slice(-10);
  for (const msg of recentMessages) {
    if (msg.type === 'note') {
      // Include image references for historical messages with images
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

export async function POST(request: Request) {
  try {
    const body: CardChatRequest = await request.json();
    const { questionContent, imageUrls, context, aiConfig } = body;

    // Validate required fields
    if ((!questionContent && (!imageUrls || imageUrls.length === 0)) || !context || !aiConfig) {
      return NextResponse.json(
        { error: 'Missing required fields' },
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
    const messages = buildPrompt(questionContent, context, imageUrls);

    try {
      const response = await llm.complete(messages);

      return NextResponse.json({
        success: true,
        response: response.content,
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
