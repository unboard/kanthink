import { NextResponse } from 'next/server';
import type { CardMessage } from '@/lib/types';
import { getLLMClientForUser, type LLMMessage } from '@/lib/ai/llm';
import { auth } from '@/lib/auth';
import { recordUsage } from '@/lib/usage';

interface CardSummaryRequest {
  cardTitle: string;
  messages: CardMessage[];
  tasks: { title: string; status: string }[];
}

function buildPrompt(
  cardTitle: string,
  messages: CardMessage[],
  tasks: { title: string; status: string }[]
): LLMMessage[] {
  const systemPrompt = `You are a concise summarizer. Generate a brief summary (1-2 sentences, max 100 characters) that captures the essence of this Kanban card for preview display.

Guidelines:
- Be extremely concise - aim for under 100 characters
- Focus on the most important information
- Don't mention "this card" or similar phrases
- Write in a neutral, informative tone
- If there's an AI conversation, focus on the key insight or conclusion
- If it's mostly notes, summarize the main point

Respond with ONLY the summary text, nothing else.`;

  let cardContent = `Card: "${cardTitle}"\n\n`;

  if (messages.length > 0) {
    cardContent += `Messages:\n`;
    for (const msg of messages.slice(-5)) { // Use last 5 messages
      const prefix = msg.type === 'ai_response' ? '[AI]' : msg.type === 'question' ? '[Question]' : '[Note]';
      cardContent += `${prefix} ${msg.content.slice(0, 200)}${msg.content.length > 200 ? '...' : ''}\n`;
    }
  }

  if (tasks.length > 0) {
    const completedCount = tasks.filter(t => t.status === 'done').length;
    cardContent += `\nTasks: ${completedCount}/${tasks.length} complete`;
  }

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: cardContent },
  ];
}

export async function POST(request: Request) {
  try {
    const body: CardSummaryRequest = await request.json();
    const { cardTitle, messages, tasks } = body;

    // Validate required fields
    if (!cardTitle) {
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

    // Build prompt
    const llmMessages = buildPrompt(cardTitle, messages || [], tasks || []);

    try {
      const response = await llm.complete(llmMessages);

      if (userId && usingOwnerKey) {
        await recordUsage(userId, 'card-summary');
      }

      // Clean up the response (remove quotes if present, trim)
      let summary = response.content.trim();
      if (summary.startsWith('"') && summary.endsWith('"')) {
        summary = summary.slice(1, -1);
      }

      // Truncate if too long
      if (summary.length > 150) {
        summary = summary.slice(0, 147) + '...';
      }

      return NextResponse.json({
        success: true,
        summary,
      });
    } catch (llmError) {
      console.error('LLM error:', llmError);
      return NextResponse.json(
        { error: `LLM error: ${llmError instanceof Error ? llmError.message : 'Unknown error'}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Card summary error:', error);
    return NextResponse.json(
      { error: 'Failed to generate summary' },
      { status: 500 }
    );
  }
}
