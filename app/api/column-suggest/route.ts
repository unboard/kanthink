import { NextResponse } from 'next/server';
import { createLLMClient, type LLMMessage } from '@/lib/ai/llm';

interface ColumnSuggestRequest {
  columnName: string;
  channelName: string;
  channelDescription: string;
  channelInstructions: string;
  otherColumns: Array<{ name: string; description?: string }>;
  aiConfig: {
    provider: 'anthropic' | 'openai';
    apiKey: string;
    model?: string;
  };
}

export async function POST(request: Request) {
  try {
    const body: ColumnSuggestRequest = await request.json();
    const { columnName, channelName, channelDescription, channelInstructions, otherColumns, aiConfig } = body;

    if (!columnName || !aiConfig?.apiKey) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const llm = createLLMClient({
      provider: aiConfig.provider,
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
    });

    // Build context about other columns
    const otherColumnsContext = otherColumns
      .filter(c => c.name !== columnName)
      .map(c => c.description ? `- ${c.name}: ${c.description}` : `- ${c.name}`)
      .join('\n');

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `Generate 3 short description suggestions for a Kanban column. Each description should be 1-2 sentences explaining what content belongs in this column. Output as a JSON array of strings.`,
      },
      {
        role: 'user',
        content: `Channel: "${channelName}"
${channelDescription ? `Channel description: ${channelDescription}` : ''}
${channelInstructions ? `Channel purpose: ${channelInstructions}` : ''}

Column to describe: "${columnName}"

${otherColumnsContext ? `Other columns in this channel:\n${otherColumnsContext}` : ''}

Generate 3 description suggestions for the "${columnName}" column that fit this channel's context. Keep each under 100 characters. Output as JSON array: ["suggestion 1", "suggestion 2", "suggestion 3"]`,
      },
    ];

    try {
      const response = await llm.complete(messages);

      // Parse JSON array from response
      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const suggestions = JSON.parse(jsonMatch[0]);
        if (Array.isArray(suggestions)) {
          return NextResponse.json({
            suggestions: suggestions.slice(0, 3).filter(s => typeof s === 'string'),
          });
        }
      }

      return NextResponse.json({ suggestions: [] });
    } catch (llmError) {
      console.error('LLM error:', llmError);
      return NextResponse.json({ suggestions: [] });
    }
  } catch (error) {
    console.error('Column suggest error:', error);
    return NextResponse.json(
      { error: 'Failed to generate suggestions' },
      { status: 500 }
    );
  }
}
