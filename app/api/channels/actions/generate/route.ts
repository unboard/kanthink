import { NextResponse } from 'next/server';
import { createLLMClient } from '@/lib/ai/llm';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, channelName, channelDescription, prompt, cards } = body;

    if (!type || !prompt || !cards?.length) {
      return NextResponse.json(
        { error: 'Missing required fields: type, prompt, cards' },
        { status: 400 }
      );
    }

    // Use owner key or env key
    const apiKey = process.env.OWNER_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    const googleKey = process.env.OWNER_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey && !googleKey) {
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 500 }
      );
    }

    const provider = apiKey ? 'openai' : 'google';
    const client = createLLMClient({
      provider: provider as 'openai' | 'google',
      apiKey: (apiKey || googleKey)!,
    });

    // Build card context
    const cardSummaries = cards
      .map((card: any, i: number) => {
        const parts = [`Card ${i + 1}: ${card.title}`];
        if (card.summary) parts.push(`Summary: ${card.summary}`);
        if (card.content) parts.push(`Content: ${card.content}`);
        if (card.tags?.length) parts.push(`Tags: ${card.tags.join(', ')}`);
        return parts.join('\n');
      })
      .join('\n\n');

    const systemPrompt = `You are Kan, an AI assistant for Kanthink — an AI-driven Kanban app. You're generating ${type} content from channel cards. Output clean, well-structured HTML. Do not include <html>, <head>, or <body> tags — just the inner content HTML. Use inline styles for compatibility. Keep the design clean and professional.`;

    const userMessage = `${prompt}\n\nHere are the cards from the "${channelName}" channel:\n\n${cardSummaries}`;

    const response = await client.complete([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ], { maxTokens: 4000 });

    return NextResponse.json({ content: response.content });
  } catch (error: any) {
    console.error('[Actions/Generate] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Generation failed' },
      { status: 500 }
    );
  }
}
