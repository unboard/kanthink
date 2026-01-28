import { NextResponse } from 'next/server';
import type { Card, Column, Channel, CardProperty } from '@/lib/types';
import { createLLMClient, getLLMClientForUser, type LLMMessage } from '@/lib/ai/llm';
import { auth } from '@/lib/auth';
import { recordUsage } from '@/lib/usage';

interface ProcessCardRequest {
  card: Card;
  column: Column;
  channel: Channel;
  aiConfig: {
    provider: 'anthropic' | 'openai';
    apiKey: string;
    model?: string;
  };
}

interface ProcessCardResponse {
  properties: CardProperty[];
  suggestedProperties: Array<{
    key: string;
    label: string;
    displayType: 'chip' | 'field';
    reason: string;
    color?: string;
  }>;
}

function buildPrompt(
  card: Card,
  column: Column,
  channel: Channel
): LLMMessage[] {
  const propertyDefs = channel.propertyDefinitions ?? [];

  const systemPrompt = `You are analyzing a card to extract properties/metadata for a Kanban board.

Your job is to:
1. Extract/infer property values based on the card content and the column's processing instructions
2. Set appropriate property values - NEVER modify the card's title or content
3. Suggest new property types if the channel would benefit from tracking something new

PROPERTY GUIDELINES:
- Use "chip" displayType for categorical values (cuisine types, difficulty levels, tags)
- Use "field" displayType for specific values (prep time, cost, dates)
- For chips, suggest a color: red, orange, yellow, green, blue, purple, pink, or gray
- Keep property keys lowercase with underscores (e.g., "prep_time", "cuisine_type")
- Keep values concise but descriptive

IMPORTANT: You are ONLY setting properties. Do NOT return any content changes. Never modify the card's title or content.

Respond ONLY with valid JSON matching this structure:
{
  "properties": [
    {"key": "cuisine_type", "value": "Mexican", "displayType": "chip", "color": "orange"},
    {"key": "prep_time", "value": "20 minutes", "displayType": "field"}
  ],
  "suggestedProperties": [
    {"key": "spice_level", "label": "Spice Level", "displayType": "chip", "color": "red", "reason": "Would help categorize meals by heat preference"}
  ]
}

Notes:
- Only suggest new properties if they would genuinely add value
- Don't suggest properties that already exist in the channel definitions`;

  // Get card content from messages
  const cardContent = card.messages && card.messages.length > 0
    ? card.messages.map(m => m.content).join('\n')
    : '(no content)';

  let userPrompt = `## Column Processing Instructions
${column.processingPrompt}

## Card to Process
**Title:** ${card.title}

**Content:**
${cardContent}

**Current Properties:**
${card.properties?.length ? card.properties.map(p => `- ${p.key}: ${p.value}`).join('\n') : '(none)'}

## Channel Property Definitions
${propertyDefs.length ? propertyDefs.map(p => `- ${p.key} (${p.label}): ${p.displayType}${p.allowedValues ? ` [${p.allowedValues.join(', ')}]` : ''}`).join('\n') : '(no property definitions yet - feel free to suggest ones that would be useful)'}

Process this card according to the instructions and return the JSON response.`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

function parseResponse(content: string): ProcessCardResponse {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('No JSON object found in LLM response');
      return { properties: [], suggestedProperties: [] };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and normalize properties - accept string or number values
    const properties: CardProperty[] = (parsed.properties || [])
      .filter((p: Record<string, unknown>) => p && typeof p.key === 'string' && (typeof p.value === 'string' || typeof p.value === 'number'))
      .map((p: Record<string, unknown>) => ({
        key: (p.key as string).toLowerCase().replace(/\s+/g, '_'),
        value: String(p.value),  // Coerce numbers to strings
        displayType: p.displayType === 'field' ? 'field' : 'chip',
        color: typeof p.color === 'string' ? p.color : undefined,
      }));

    // Validate and normalize suggested properties
    const suggestedProperties = (parsed.suggestedProperties || [])
      .filter((p: Record<string, unknown>) => p && typeof p.key === 'string' && typeof p.label === 'string')
      .map((p: Record<string, unknown>) => ({
        key: (p.key as string).toLowerCase().replace(/\s+/g, '_'),
        label: p.label as string,
        displayType: p.displayType === 'field' ? 'field' as const : 'chip' as const,
        reason: (p.reason as string) || '',
        color: typeof p.color === 'string' ? p.color : undefined,
      }));

    // Note: We intentionally ignore any 'content' field in the response
    // AI should not modify card content, only properties
    return {
      properties,
      suggestedProperties,
    };
  } catch (error) {
    console.warn('Failed to parse process-card response:', error);
    return { properties: [], suggestedProperties: [] };
  }
}

export async function POST(request: Request) {
  try {
    const body: ProcessCardRequest = await request.json();
    const { card, column, channel, aiConfig } = body;

    // Validate required fields
    if (!card || !column || !aiConfig) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!column.processingPrompt) {
      return NextResponse.json(
        { error: 'Column has no processing prompt' },
        { status: 400 }
      );
    }

    // Get LLM client
    const session = await auth();
    const userId = session?.user?.id;
    let llm;
    let usingOwnerKey = false;

    if (userId) {
      const result = await getLLMClientForUser(userId);
      if (!result.client) {
        return NextResponse.json(
          { error: result.error || 'No AI access available' },
          { status: 403 }
        );
      }
      llm = result.client;
      usingOwnerKey = result.source === 'owner';
    } else if (aiConfig?.apiKey) {
      llm = createLLMClient({
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
      });
    } else {
      return NextResponse.json(
        { error: 'Please sign in or configure an API key in Settings.' },
        { status: 403 }
      );
    }

    // Build prompt
    const messages = buildPrompt(card, column, channel);

    try {
      const response = await llm.complete(messages);
      const result = parseResponse(response.content);

      if (userId && usingOwnerKey) {
        await recordUsage(userId, 'process-card');
      }

      return NextResponse.json({
        success: true,
        ...result,
        debug: {
          systemPrompt: messages[0].content,
          userPrompt: messages[1].content,
          rawResponse: response.content,
        },
      });
    } catch (llmError) {
      console.error('LLM error:', llmError);
      return NextResponse.json(
        { error: `LLM error: ${llmError instanceof Error ? llmError.message : 'Unknown error'}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Process card error:', error);
    return NextResponse.json(
      { error: 'Failed to process card' },
      { status: 500 }
    );
  }
}
