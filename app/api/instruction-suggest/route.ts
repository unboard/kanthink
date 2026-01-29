import { NextResponse } from 'next/server';
import { getLLMClientForUser, type LLMMessage } from '@/lib/ai/llm';
import { auth } from '@/lib/auth';
import type { InstructionAction } from '@/lib/types';

interface InstructionSuggestRequest {
  instructionTitle: string;
  action: InstructionAction;
  channelName: string;
  channelDescription: string;
}

export async function POST(request: Request) {
  try {
    const body: InstructionSuggestRequest = await request.json();
    const { instructionTitle, action, channelName, channelDescription } = body;

    if (!instructionTitle) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get LLM client - requires authentication
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ suggestions: [] });
    }

    const result = await getLLMClientForUser(userId);
    if (!result.client) {
      return NextResponse.json({ suggestions: [] });
    }

    const llm = result.client;

    const actionDescriptions: Record<InstructionAction, string> = {
      generate: 'create new cards',
      modify: 'update existing cards',
      move: 'move cards between columns',
    };

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `Generate 3 specific instruction texts for an AI that will ${actionDescriptions[action]}. Each instruction should be a complete, actionable prompt the AI can follow. Output as a JSON array of strings.`,
      },
      {
        role: 'user',
        content: `Channel: "${channelName}"
${channelDescription ? `Description: ${channelDescription}` : ''}

Instruction title: "${instructionTitle}"
Action type: ${action}

Generate 3 specific instruction texts that would tell the AI exactly what to do for "${instructionTitle}". Each should be 1-3 sentences, clear and actionable. Output as JSON array: ["instruction 1", "instruction 2", "instruction 3"]`,
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
    console.error('Instruction suggest error:', error);
    return NextResponse.json(
      { error: 'Failed to generate suggestions' },
      { status: 500 }
    );
  }
}
