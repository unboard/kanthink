import { NextResponse } from 'next/server';
import { marked } from 'marked';
import type { Channel, Card, CardInput, Column } from '@/lib/types';
import { createLLMClient, getLLMClientForUser, type LLMMessage } from '@/lib/ai/llm';
import { auth } from '@/lib/auth';
import { recordUsage } from '@/lib/usage';

// Configure marked for safe HTML output
marked.setOptions({
  breaks: true,  // Convert \n to <br>
  gfm: true,     // GitHub Flavored Markdown
});

// Stub ideas for fallback when no LLM is configured
const STUB_IDEAS = [
  'Try a new approach to this',
  'Consider the opposite perspective',
  'What if we simplified this?',
  'Explore related concepts',
  'Break this into smaller parts',
  'Look for patterns here',
  'Ask why three times',
  'Combine two unrelated ideas',
  'What would an expert do?',
  'Start from first principles',
];

function getRandomIdeas(count: number): string[] {
  const shuffled = [...STUB_IDEAS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function buildColumnContext(
  channel: Channel,
  allCards: Record<string, Card>,
  targetColumnId: string
): string {
  let context = '';
  const includeBackside = channel.includeBacksideInAI ?? false;

  for (const column of channel.columns) {
    const isTarget = column.id === targetColumnId;

    // Get front-side cards in this column
    const columnCards = column.cardIds
      .map((id) => allCards[id])
      .filter(Boolean);

    // Get backside cards if enabled
    const backsideCards = includeBackside
      ? (column.backsideCardIds ?? []).map((id) => allCards[id]).filter(Boolean)
      : [];

    // Skip empty columns UNLESS it's the target column
    if (columnCards.length === 0 && backsideCards.length === 0 && !isTarget) continue;

    // Column header with target indicator
    context += `\n\n### ${column.name}${isTarget ? ' (generating here)' : ''}`;

    // Front-side cards
    if (columnCards.length > 0) {
      for (const card of columnCards) {
        context += `\n- ${card.title}`;
        // Use summary or first message content
        if (card.summary) {
          context += `: ${card.summary.slice(0, 150)}`;
        } else if (card.messages && card.messages.length > 0) {
          context += `: ${card.messages[0].content.slice(0, 150)}`;
        }
      }
    } else if (isTarget) {
      context += '\n(empty - new column)';
    }

    // Backside cards (completed)
    if (backsideCards.length > 0) {
      context += '\n\nCompleted:';
      for (const card of backsideCards) {
        context += `\n- ${card.title}`;
      }
    }
  }

  return context;
}

function buildPrompt(
  channel: Channel,
  targetColumn: Column,
  count: number,
  allCards: Record<string, Card>,
  systemInstructions?: string
): LLMMessage[] {
  // SYSTEM PROMPT: Output format with content quality guidance
  const systemPrompt = `Generate ${count} cards as a JSON array.

Each card has:
- "title": concise (1-8 words)
- "content": detailed markdown-formatted content (2-4 paragraphs minimum)

Content Guidelines:
- Write substantively - explain each idea thoroughly
- Use markdown: **bold**, *italics*, bullet lists, numbered lists, headers (##)
- Include context, rationale, implications, or examples as appropriate
- Aim for 150-400 words per card - depth matters for planning/brainstorming
- Each card should stand alone as a complete thought

Respond with ONLY the JSON array:
[{"title": "Card Title", "content": "## Overview\\n\\nDetailed explanation of the idea...\\n\\n## Key Points\\n\\n- First important point\\n- Second important point\\n\\nFurther elaboration and context."}]`;

  // USER PROMPT: Context → Board State → TASK (column instructions LAST for max attention)
  const userParts: string[] = [];

  // 1. Background context (channel info, system guidance)
  let contextSection = `## Context\nChannel: ${channel.name}`;
  if (channel.description) {
    contextSection += `\n${channel.description}`;
  }
  if (systemInstructions?.trim()) {
    contextSection += `\n\nGeneral guidance:\n${systemInstructions.trim()}`;
  }
  if (channel.aiInstructions?.trim()) {
    contextSection += `\n\nChannel focus:\n${channel.aiInstructions.trim()}`;
  }
  userParts.push(contextSection);

  // 2. Board state (reference, shows what exists)
  const boardState = buildColumnContext(channel, allCards, targetColumn.id);
  if (boardState) {
    userParts.push(`## Current Board${boardState}`);
  }

  // 3. THE TASK - Column instructions LAST for maximum attention
  let taskSection = `## Your Task\nGenerate ${count} cards for the "${targetColumn.name}" column.`;
  if (targetColumn.instructions?.trim()) {
    taskSection += `\n\n**Column Instructions:**\n${targetColumn.instructions.trim()}`;
  }
  userParts.push(taskSection);

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userParts.join('\n\n') },
  ];
}

function markdownToHtml(markdown: string): string {
  try {
    // Handle escaped newlines from JSON
    const unescaped = markdown.replace(/\\n/g, '\n');
    const html = marked.parse(unescaped);
    // marked.parse returns string | Promise<string>, but with sync options it's string
    return typeof html === 'string' ? html : markdown;
  } catch {
    return markdown;
  }
}

function parseResponse(content: string): CardInput[] {
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('No JSON array found in LLM response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      console.warn('LLM response is not an array');
      return [];
    }

    return parsed
      .filter((item) => item && typeof item.title === 'string')
      .map((item) => ({
        title: item.title.trim(),
        // Convert markdown content to HTML
        content: typeof item.content === 'string'
          ? markdownToHtml(item.content.trim())
          : '',
      }));
  } catch (error) {
    console.warn('Failed to parse LLM response:', error);
    return [];
  }
}

interface GenerateRequest {
  channel: Channel;
  count: number;
  cards: Record<string, Card>;
  targetColumnId?: string;
  systemInstructions?: string;
  // Legacy: aiConfig is still accepted for backward compatibility
  aiConfig?: {
    provider: 'anthropic' | 'openai';
    apiKey: string;
    model?: string;
    systemInstructions?: string;
  };
}

export async function POST(request: Request) {
  try {
    // Check authentication
    const session = await auth();
    const userId = session?.user?.id;

    const body: GenerateRequest = await request.json();
    const { channel, count, cards, targetColumnId, systemInstructions, aiConfig } = body;

    // Validate required fields
    if (!channel) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Find target column by ID, or fall back to first column
    const targetColumn = targetColumnId
      ? channel.columns.find((c) => c.id === targetColumnId) || channel.columns[0]
      : channel.columns[0];

    // Get LLM client
    let llm;
    let usingOwnerKey = false;

    if (userId) {
      // Authenticated user - use the new system
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
      // Legacy: unauthenticated with API key from client
      llm = createLLMClient({
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
      });
    } else {
      // No auth and no API key - return stub data
      const ideas = getRandomIdeas(count || 5);
      const columnContext = targetColumn?.instructions || targetColumn?.name || channel.name;
      return NextResponse.json({
        cards: ideas.map((idea) => ({
          title: idea,
          content: `<p>Generated for "${columnContext}". Sign in or configure an API key in Settings for AI suggestions.</p>`,
        })),
      });
    }

    // Build prompt with column context
    const effectiveSystemInstructions = systemInstructions || aiConfig?.systemInstructions;
    const messages = buildPrompt(channel, targetColumn, count || 5, cards || {}, effectiveSystemInstructions);

    // Build debug info
    const debug = {
      systemPrompt: messages[0].content,
      userPrompt: messages[1].content,
      rawResponse: '',
    };

    try {
      const response = await llm.complete(messages);
      debug.rawResponse = response.content;
      const generatedCards = parseResponse(response.content);

      if (generatedCards.length === 0) {
        return NextResponse.json({
          cards: getRandomIdeas(count || 5).map((idea) => ({
            title: idea,
            content: '<p>AI generation failed. Please try again.</p>',
          })),
          debug,
        });
      }

      // Record usage if using owner's key
      if (userId && usingOwnerKey) {
        await recordUsage(userId, 'generate-cards');
      }

      return NextResponse.json({
        cards: generatedCards.slice(0, count || 5),
        debug,
      });
    } catch (llmError) {
      console.error('LLM error:', llmError);
      debug.rawResponse = `Error: ${llmError instanceof Error ? llmError.message : 'Unknown error'}`;

      // Retry once
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const response = await llm.complete(messages);
        debug.rawResponse = response.content;
        const generatedCards = parseResponse(response.content);
        if (generatedCards.length > 0) {
          // Record usage if using owner's key
          if (userId && usingOwnerKey) {
            await recordUsage(userId, 'generate-cards');
          }
          return NextResponse.json({
            cards: generatedCards.slice(0, count || 5),
            debug,
          });
        }
      } catch (retryError) {
        console.error('LLM retry failed:', retryError);
        debug.rawResponse += `\nRetry error: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`;
      }

      // Return fallback
      return NextResponse.json({
        cards: getRandomIdeas(count || 5).map((idea) => ({
          title: idea,
          content: '<p>AI generation encountered an error. Please try again.</p>',
        })),
        debug,
      });
    }
  } catch (error) {
    console.error('Generate cards error:', error);
    return NextResponse.json(
      { error: 'Failed to generate cards' },
      { status: 500 }
    );
  }
}
