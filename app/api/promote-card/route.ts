import { NextResponse } from 'next/server';
import { createLLMClient, type LLMMessage } from '@/lib/ai/llm';
import type { InstructionAction, InstructionRunMode } from '@/lib/types';

interface PromoteCardRequest {
  cardTitle: string;
  cardContent: string;
  aiConfig: {
    provider: 'anthropic' | 'openai';
    apiKey: string;
    model?: string;
  };
}

interface ColumnConfig {
  name: string;
  isAiTarget?: boolean;
}

interface StarterInstruction {
  title: string;
  instructions: string;
  action: InstructionAction;
  targetColumnName: string;
  runMode: InstructionRunMode;
  cardCount?: number;
}

interface PromoteCardResponse {
  channelName: string;
  description: string;
  aiInstructions: string;
  columns: ColumnConfig[];
  starterInstructions?: StarterInstruction[];
}

function buildPrompt(cardTitle: string, cardContent: string): LLMMessage[] {
  const systemPrompt = `You are helping create a Kanthink channel from a card idea.

Kanthink is an AI-assisted Kanban application where:
- Each channel is a focused workspace for a specific goal or domain
- Columns represent workflow stages (like "Ideas", "In Progress", "Done")
- AI can generate cards, modify existing cards, or move cards between columns
- Instruction cards define what AI actions are available

Your task: Given a card idea, generate the structure for a new channel.

Respond with ONLY valid JSON in this exact format:
{
  "channelName": "Short, clear name for the channel",
  "description": "1-2 sentence description of what this channel is for",
  "aiInstructions": "Detailed instructions for AI when generating cards. Include domain context, what makes good cards, and any constraints.",
  "columns": [
    {"name": "Column Name", "isAiTarget": true},
    {"name": "Second Column"},
    {"name": "Third Column"},
    {"name": "Fourth Column"}
  ],
  "starterInstructions": [
    {
      "title": "Generate Ideas",
      "instructions": "What the AI should do when this instruction runs",
      "action": "generate",
      "targetColumnName": "Column Name",
      "runMode": "manual",
      "cardCount": 5
    }
  ]
}

Guidelines:
- Create 3-5 columns that represent a natural workflow for the topic
- The first column should typically be the AI target (where generated cards land)
- Column names should be short (1-3 words) and represent stages or categories
- AI instructions should be detailed (2-4 paragraphs) explaining the domain
- Include 1-3 starter instruction cards that would be useful for this channel
- action can be "generate" (create new cards), "modify" (update existing), or "move" (relocate cards)`;

  // Strip HTML from content for cleaner input
  const plainContent = cardContent
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const userPrompt = `Create a channel structure for this idea:

Title: ${cardTitle}

${plainContent ? `Details:\n${plainContent}` : '(No additional details provided)'}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

function parseResponse(content: string): PromoteCardResponse | null {
  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    } else {
      // Try to find raw JSON object
      const objMatch = content.match(/\{[\s\S]*\}/);
      if (objMatch) {
        jsonStr = objMatch[0];
      }
    }

    const parsed = JSON.parse(jsonStr);

    // Validate required fields
    if (!parsed.channelName || !parsed.columns || !Array.isArray(parsed.columns)) {
      console.warn('Invalid response structure:', parsed);
      return null;
    }

    // Ensure at least one column is marked as AI target
    const hasAiTarget = parsed.columns.some((c: ColumnConfig) => c.isAiTarget);
    if (!hasAiTarget && parsed.columns.length > 0) {
      parsed.columns[0].isAiTarget = true;
    }

    // Validate starter instructions if present
    if (parsed.starterInstructions) {
      parsed.starterInstructions = parsed.starterInstructions.filter(
        (inst: StarterInstruction) =>
          inst.title &&
          inst.instructions &&
          ['generate', 'modify', 'move'].includes(inst.action) &&
          inst.targetColumnName
      );
    }

    return {
      channelName: parsed.channelName,
      description: parsed.description || '',
      aiInstructions: parsed.aiInstructions || '',
      columns: parsed.columns.map((c: ColumnConfig) => ({
        name: c.name,
        isAiTarget: c.isAiTarget || false,
      })),
      starterInstructions: parsed.starterInstructions,
    };
  } catch (error) {
    console.error('Failed to parse promote-card response:', error);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body: PromoteCardRequest = await request.json();
    const { cardTitle, cardContent, aiConfig } = body;

    if (!cardTitle) {
      return NextResponse.json(
        { error: 'Card title is required' },
        { status: 400 }
      );
    }

    // If no API key, return null to signal fallback to defaults
    if (!aiConfig?.apiKey) {
      return NextResponse.json({ result: null });
    }

    const llm = createLLMClient({
      provider: aiConfig.provider,
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
    });

    const messages = buildPrompt(cardTitle, cardContent);

    try {
      const response = await llm.complete(messages);
      const result = parseResponse(response.content);

      return NextResponse.json({ result });
    } catch (llmError) {
      console.error('LLM error in promote-card:', llmError);
      return NextResponse.json({ result: null });
    }
  } catch (error) {
    console.error('Promote card error:', error);
    return NextResponse.json(
      { error: 'Failed to generate channel structure' },
      { status: 500 }
    );
  }
}
