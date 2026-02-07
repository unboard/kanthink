import { NextResponse } from 'next/server';
import { marked } from 'marked';
import type { Channel, Card, CardInput, InstructionCard, InstructionTarget, ContextColumnSelection, Task } from '@/lib/types';
import { type LLMMessage } from '@/lib/ai/llm';
import { buildFeedbackContext } from '@/lib/ai/feedbackAnalyzer';
import { getAuthenticatedLLM } from '@/lib/ai/withAuth';

// Configure marked for safe HTML output
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Stub ideas for fallback when no LLM is configured
const STUB_IDEAS = [
  'Try a new approach to this',
  'Consider the opposite perspective',
  'What if we simplified this?',
  'Explore related concepts',
  'Break this into smaller parts',
];

function getRandomIdeas(count: number): string[] {
  const shuffled = [...STUB_IDEAS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Detect if instructions suggest the AI needs real web data
 * (e.g., finding YouTube videos, linking articles, referencing real URLs)
 */
function detectWebSearchIntent(instructions: string): boolean {
  if (!instructions) return false;
  const lower = instructions.toLowerCase();
  const webKeywords = [
    'youtube', 'video', 'link', 'url', 'website', 'webpage',
    'search for', 'find online', 'look up', 'browse',
    'article', 'blog post', 'podcast', 'episode',
    'reddit', 'twitter', 'github', 'stack overflow',
    'http', 'www', '.com', '.org', '.io',
  ];
  return webKeywords.some(kw => lower.includes(kw));
}

function markdownToHtml(markdown: string): string {
  try {
    const unescaped = markdown.replace(/\\n/g, '\n');
    const html = marked.parse(unescaped);
    return typeof html === 'string' ? html : markdown;
  } catch {
    return markdown;
  }
}

function getTargetColumnIds(target: InstructionTarget, channel: Channel): string[] {
  if (target.type === 'board') {
    return channel.columns.map((c) => c.id);
  }
  if (target.type === 'column') {
    return [target.columnId];
  }
  if (target.type === 'columns') {
    return target.columnIds;
  }
  return [];
}

function getContextColumnIds(contextColumns: ContextColumnSelection | null | undefined, channel: Channel): string[] {
  // Default behavior: no contextColumns (null/undefined) or 'all' = all columns
  if (!contextColumns || contextColumns.type === 'all') {
    return channel.columns.map((c) => c.id);
  }
  // Specific columns selected
  return contextColumns.columnIds;
}

/**
 * Parse instruction text to determine which capabilities to enable.
 * STRICT mode: Only enable tasks/properties/tags if explicitly mentioned.
 */
function parseInstructionKeywords(text: string): { allowTasks: boolean; allowProperties: boolean; allowTags: boolean } {
  const lowerText = text.toLowerCase();

  const taskKeywords = ['task', 'tasks', 'action item', 'action items', 'todo', 'to-do', 'checklist'];
  const propertyKeywords = ['property', 'properties', 'categorize', 'category', 'metadata'];
  const tagKeywords = ['tag', 'tags', 'label', 'labels'];

  return {
    allowTasks: taskKeywords.some(kw => lowerText.includes(kw)),
    allowProperties: propertyKeywords.some(kw => lowerText.includes(kw)),
    allowTags: tagKeywords.some(kw => lowerText.includes(kw)),
  };
}

function buildGeneratePrompt(
  instructionCard: InstructionCard,
  channel: Channel,
  contextColumnIds: string[],
  allCards: Record<string, Card>,
  systemInstructions?: string,
  targetColumnIds?: string[]
): LLMMessage[] {
  const count = instructionCard.cardCount ?? 5;

  // Get target column instructions if targeting a specific column
  let targetColumnInfo = '';
  if (targetColumnIds && targetColumnIds.length === 1) {
    const targetColumn = channel.columns.find((c) => c.id === targetColumnIds[0]);
    if (targetColumn) {
      targetColumnInfo = `\n\nTarget Column: "${targetColumn.name}"`;
      if (targetColumn.instructions) {
        targetColumnInfo += `\nColumn Rules (cards generated MUST fit these criteria):\n${targetColumn.instructions}`;
      }
    }
  }

  // SYSTEM PROMPT
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
- If web research data is provided, use ONLY real URLs from that data — NEVER fabricate or guess URLs
${targetColumnInfo ? '\n- IMPORTANT: All generated cards must fit the target column rules' : ''}

Respond with ONLY the JSON array:
[{"title": "Card Title", "content": "## Overview\\n\\nDetailed explanation..."}]`;

  // USER PROMPT
  const userParts: string[] = [];

  // Context
  let contextSection = `## Context\nChannel: ${channel.name}`;
  if (channel.description) {
    contextSection += `\n${channel.description}`;
  }
  if (systemInstructions?.trim()) {
    contextSection += `\n\nGeneral guidance:\n${systemInstructions.trim()}`;
  }
  if (targetColumnInfo) {
    contextSection += targetColumnInfo;
  }
  userParts.push(contextSection);

  // Board state - show existing cards in context columns
  let boardState = '\n## Current Board';
  const contextColumns = channel.columns.filter((c) => contextColumnIds.includes(c.id));
  for (const column of contextColumns) {
    const columnCards = column.cardIds.map((id) => allCards[id]).filter(Boolean);
    boardState += `\n\n### ${column.name}`;
    if (columnCards.length > 0) {
      for (const card of columnCards) {
        boardState += `\n- ${card.title}`;
        // Use summary or first message content
        if (card.summary) {
          boardState += `: ${card.summary.slice(0, 150)}`;
        } else if (card.messages && card.messages.length > 0) {
          boardState += `: ${card.messages[0].content.slice(0, 150)}`;
        }
      }
    } else {
      boardState += '\n(empty)';
    }
  }
  userParts.push(boardState);

  // Feedback context - what the AI has learned from user behavior
  const feedbackContext = buildFeedbackContext(channel, allCards);
  if (feedbackContext) {
    userParts.push(`## Learning from User Behavior\n${feedbackContext}\n\nUse this feedback to generate more relevant cards.`);
  }

  // TASK - instruction instructions LAST for maximum attention
  let taskSection = `## Your Task\nGenerate ${count} new cards.`;
  if (instructionCard.instructions?.trim()) {
    taskSection += `\n\n**Instructions:**\n${instructionCard.instructions.trim()}`;
  }
  userParts.push(taskSection);

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userParts.join('\n\n') },
  ];
}

function buildModifyPrompt(
  instructionCard: InstructionCard,
  channel: Channel,
  cardsToModify: Card[],
  allTasks: Record<string, Task>,
  systemInstructions?: string
): LLMMessage[] {
  // Parse instruction text to determine allowed capabilities
  const { allowTasks, allowProperties, allowTags } = parseInstructionKeywords(instructionCard.instructions || '');

  // Build the JSON example dynamically based on allowed capabilities
  const jsonFields: string[] = [
    '"id": "original-card-id"',
    '"title": "Updated Title"',
    '"content": "Optional updated content in markdown"',
  ];

  if (allowTags) {
    jsonFields.push('"tags": ["TagName1", "TagName2"]');
  }

  if (allowProperties) {
    jsonFields.push('"properties": [\n    { "key": "category", "value": "Example", "displayType": "chip", "color": "blue" }\n  ]');
  }

  if (allowTasks) {
    jsonFields.push('"tasks": [\n    { "title": "Action item extracted from content", "description": "Optional details" }\n  ]');
  }

  const jsonExample = `[{\n  ${jsonFields.join(',\n  ')}\n}]`;

  // Build explanations for allowed capabilities
  const capabilityExplanations: string[] = [];

  if (allowTags) {
    // Build existing tags list for reference
    const existingTagNames = channel.tagDefinitions?.map(t => t.name) || [];
    let tagsExplanation = `Tags: Use them to categorize or label cards.
- Provide an array of tag names to add to the card
- IMPORTANT: Check the existing tags list below and use matching names when applicable (case-insensitive match is OK)
- If a tag doesn't exist, provide the exact name you want - it will be created automatically`;
    if (existingTagNames.length > 0) {
      tagsExplanation += `\n- Existing tags in this channel: ${existingTagNames.join(', ')}`;
    }
    capabilityExplanations.push(tagsExplanation);
  }

  if (allowProperties) {
    capabilityExplanations.push(`Properties: Use them for key-value metadata (not simple tags).
- displayType: "chip" for categorical values (shown as colored badges) or "field" for key-value pairs
- color options: red, orange, yellow, green, blue, purple, pink, gray`);
  }

  if (allowTasks) {
    capabilityExplanations.push(`Tasks: Use them to extract action items from the card content.
- Only create NEW tasks - don't duplicate existing tasks shown in the card context
- Tasks should be concrete, actionable items`);
  }

  // Build restrictions for disallowed capabilities
  const restrictions: string[] = [];
  if (!allowTags) {
    restrictions.push('Do NOT add tags - this was not requested.');
  }
  if (!allowProperties) {
    restrictions.push('Do NOT add properties - this was not requested.');
  }
  if (!allowTasks) {
    restrictions.push('Do NOT create tasks or action items - this was not requested.');
  }

  // SYSTEM PROMPT
  const systemPrompt = `You are modifying existing cards based on instructions.

For each card, analyze its content and apply the requested modifications.

Respond with a JSON array of modified cards, maintaining the original card ID:
${jsonExample}

${capabilityExplanations.length > 0 ? capabilityExplanations.join('\n\n') + '\n\n' : ''}${restrictions.length > 0 ? 'IMPORTANT: ' + restrictions.join(' ') + '\n\n' : ''}Only include cards that have actual changes. If a card doesn't need modification, omit it.`;

  // USER PROMPT
  const userParts: string[] = [];

  // Context
  let contextSection = `## Context\nChannel: ${channel.name}`;
  if (systemInstructions?.trim()) {
    contextSection += `\n\nGeneral guidance:\n${systemInstructions.trim()}`;
  }
  userParts.push(contextSection);

  // Cards to modify
  let cardsSection = '## Cards to Modify';
  for (const card of cardsToModify) {
    // Get content from messages
    const cardContent = card.messages && card.messages.length > 0
      ? card.messages.map(m => m.content).join('\n')
      : '(no content)';
    cardsSection += `\n\n### Card ID: ${card.id}`;
    cardsSection += `\n**Title:** ${card.title}`;
    cardsSection += `\n**Content:**\n${cardContent}`;

    // Only include existing tasks if task creation is allowed (to prevent duplicates)
    if (allowTasks && card.taskIds && card.taskIds.length > 0) {
      const cardTasks = card.taskIds
        .map(id => allTasks[id])
        .filter(Boolean);
      if (cardTasks.length > 0) {
        cardsSection += `\n**Existing Tasks:**`;
        for (const task of cardTasks) {
          const statusIcon = task.status === 'done' ? '[x]' : task.status === 'in_progress' ? '[-]' : '[ ]';
          cardsSection += `\n  ${statusIcon} ${task.title}`;
        }
      }
    }
  }
  userParts.push(cardsSection);

  // TASK
  let taskSection = '## Your Task\nModify the cards according to these instructions:';
  if (instructionCard.instructions?.trim()) {
    taskSection += `\n\n${instructionCard.instructions.trim()}`;
  }
  userParts.push(taskSection);

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userParts.join('\n\n') },
  ];
}

function parseGenerateResponse(content: string): CardInput[] {
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
        // Store AI-generated content as initialMessage to match CardInput
        initialMessage: typeof item.content === 'string'
          ? item.content.trim()
          : undefined,
      }));
  } catch (error) {
    console.warn('Failed to parse LLM response:', error);
    return [];
  }
}

interface ModifyResponseProperty {
  key: string;
  value: string;
  displayType: 'chip' | 'field';
  color?: string;
}

interface ModifyResponseTask {
  title: string;
  description?: string;
}

interface ModifyResponseCard {
  id: string;
  title: string;
  content?: string;
  tags?: string[];
  properties?: ModifyResponseProperty[];
  tasks?: ModifyResponseTask[];
}

function parseModifyResponse(content: string): ModifyResponseCard[] {
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
      .filter((item) => item && typeof item.id === 'string' && typeof item.title === 'string')
      .map((item) => ({
        id: item.id,
        title: item.title.trim(),
        content: typeof item.content === 'string' ? item.content.trim() : undefined,
        tags: Array.isArray(item.tags)
          ? item.tags
              .filter((t: unknown) => typeof t === 'string' && t.trim().length > 0)
              .map((t: string) => t.trim())
          : undefined,
        properties: Array.isArray(item.properties)
          ? item.properties.filter(
              (p: Record<string, unknown>) =>
                p && typeof p.key === 'string' && typeof p.value === 'string'
            ).map((p: Record<string, unknown>) => ({
              key: String(p.key),
              value: String(p.value),
              displayType: p.displayType === 'field' ? 'field' as const : 'chip' as const,
              color: typeof p.color === 'string' ? p.color : undefined,
            }))
          : undefined,
        tasks: Array.isArray(item.tasks)
          ? item.tasks.filter(
              (t: Record<string, unknown>) =>
                t && typeof t.title === 'string'
            ).map((t: Record<string, unknown>) => ({
              title: String(t.title).trim(),
              description: typeof t.description === 'string' ? t.description.trim() : undefined,
            }))
          : undefined,
      }));
  } catch (error) {
    console.warn('Failed to parse LLM response:', error);
    return [];
  }
}

function buildMovePrompt(
  instructionCard: InstructionCard,
  channel: Channel,
  cardsToMove: Card[],
  systemInstructions?: string
): LLMMessage[] {
  // Build list of available destination columns with their instructions
  const columnsList = channel.columns.map((c) => {
    let colInfo = `- "${c.name}" (ID: ${c.id})`;
    if (c.instructions) {
      colInfo += `\n  Rules: ${c.instructions}`;
    }
    return colInfo;
  }).join('\n');

  // SYSTEM PROMPT
  const systemPrompt = `You are analyzing cards to determine which column they should be moved to.

Available columns and their rules:
${columnsList}

For each card, decide if it should be moved to a different column based on the user's criteria AND the column rules.

Respond with a JSON array of move decisions:
[{"cardId": "card-id-here", "destinationColumnId": "column-id-here", "reason": "brief explanation"}]

Only include cards that SHOULD be moved. If a card should stay in its current column, omit it from the response.
If no cards should be moved, return an empty array: []`;

  // USER PROMPT
  const userParts: string[] = [];

  // Context
  let contextSection = `## Context\nChannel: ${channel.name}`;
  if (systemInstructions?.trim()) {
    contextSection += `\n\nGeneral guidance:\n${systemInstructions.trim()}`;
  }
  userParts.push(contextSection);

  // Cards to analyze
  let cardsSection = '## Cards to Analyze';
  for (const card of cardsToMove) {
    // Find current column
    const currentColumn = channel.columns.find((c) => c.cardIds.includes(card.id));
    cardsSection += `\n\n### Card ID: ${card.id}`;
    cardsSection += `\n**Current Column:** ${currentColumn?.name || 'Unknown'}`;
    cardsSection += `\n**Title:** ${card.title}`;
    // Use summary or messages content
    if (card.summary) {
      cardsSection += `\n**Summary:** ${card.summary}`;
    } else if (card.messages && card.messages.length > 0) {
      const messagesText = card.messages.map(m => m.content).join(' ').slice(0, 300);
      cardsSection += `\n**Content:** ${messagesText}${messagesText.length >= 300 ? '...' : ''}`;
    }
  }
  userParts.push(cardsSection);

  // TASK
  let taskSection = '## Move Criteria\nAnalyze each card and determine if it should be moved based on these criteria:';
  if (instructionCard.instructions?.trim()) {
    taskSection += `\n\n${instructionCard.instructions.trim()}`;
  }
  userParts.push(taskSection);

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userParts.join('\n\n') },
  ];
}

function parseMoveResponse(content: string): Array<{ cardId: string; destinationColumnId: string; reason?: string }> {
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
      .filter((item) => item && typeof item.cardId === 'string' && typeof item.destinationColumnId === 'string')
      .map((item) => ({
        cardId: item.cardId,
        destinationColumnId: item.destinationColumnId,
        reason: typeof item.reason === 'string' ? item.reason : undefined,
      }));
  } catch (error) {
    console.warn('Failed to parse move response:', error);
    return [];
  }
}

interface RunInstructionRequest {
  instructionCard: InstructionCard;
  channel: Channel;
  cards: Record<string, Card>;
  tasks?: Record<string, Task>;
  triggeringCardId?: string;
  skipAlreadyProcessed?: boolean;  // For automatic runs, skip cards already processed by this instruction
  systemInstructions?: string;
}

export async function POST(request: Request) {
  try {
    const body: RunInstructionRequest = await request.json();
    const { instructionCard, channel, cards, tasks = {}, triggeringCardId, skipAlreadyProcessed, systemInstructions } = body;

    // Validate required fields
    if (!instructionCard || !channel) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const targetColumnIds = getTargetColumnIds(instructionCard.target, channel);
    const contextColumnIds = getContextColumnIds(instructionCard.contextColumns, channel);

    // Get authenticated LLM client
    const authResult = await getAuthenticatedLLM('run-instruction');
    if (authResult.error) {
      // Check if we should return stub data for unauthenticated users
      if (instructionCard.action === 'generate') {
        const ideas = getRandomIdeas(instructionCard.cardCount ?? 5);
        return NextResponse.json({
          action: 'generate',
          targetColumnIds,
          generatedCards: ideas.map((idea) => ({
            title: idea,
            content: '<p>Sign in or configure an API key for real AI suggestions.</p>',
          })),
        });
      } else {
        return authResult.error;
      }
    }

    const { llm, recordUsageAfterSuccess } = authResult.context;
    const effectiveSystemInstructions = systemInstructions;

    // ==========================================
    // MULTI-STEP EXECUTION
    // ==========================================
    if (instructionCard.steps && instructionCard.steps.length > 0) {
      const stepResults: Array<{
        action: string;
        targetColumnIds: string[];
        generatedCards?: CardInput[];
        modifiedCards?: Array<{ id: string; title: string; content?: string; tags?: string[]; properties?: Array<{ key: string; value: string; displayType: 'chip' | 'field'; color?: string }>; tasks?: Array<{ title: string; description?: string }> }>;
        movedCards?: Array<{ cardId: string; destinationColumnId: string; reason?: string }>;
      }> = [];

      for (const step of instructionCard.steps) {
        const stepTargetColumnIds = [step.targetColumnId];

        // Build a virtual instruction card for this step
        const stepInstruction: InstructionCard = {
          ...instructionCard,
          action: step.action as 'generate' | 'modify' | 'move',
          target: { type: 'column', columnId: step.targetColumnId },
          cardCount: step.cardCount,
          instructions: instructionCard.instructions, // Full instructions for context
        };

        try {
          if (step.action === 'generate') {
            const messages = buildGeneratePrompt(stepInstruction, channel, contextColumnIds, cards, effectiveSystemInstructions, stepTargetColumnIds);

            // Web research if needed
            if (llm.webSearch && detectWebSearchIntent(instructionCard.instructions || '')) {
              try {
                const searchQuery = (instructionCard.instructions || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
                const webResult = await llm.webSearch(searchQuery, `Search the web and return detailed, factual information including real URLs. Return specific URLs, titles, and descriptions.`);
                if (webResult.content) {
                  const userMsg = messages[messages.length - 1];
                  userMsg.content = (userMsg.content as string) + `\n\n## Web Research (real data from the internet)\nIMPORTANT: Use ONLY the real URLs below. Do NOT invent or hallucinate any URLs.\n\n${webResult.content}`;
                }
              } catch (e) { console.warn('Web search failed:', e); }
            }

            const response = await llm.complete(messages);
            const generatedCards = parseGenerateResponse(response.content);
            stepResults.push({ action: 'generate', targetColumnIds: stepTargetColumnIds, generatedCards: generatedCards.slice(0, step.cardCount ?? 5) });
          } else if (step.action === 'modify') {
            const cardsToModify: Card[] = [];
            for (const columnId of stepTargetColumnIds) {
              const column = channel.columns.find((c) => c.id === columnId);
              if (column) {
                for (const cardId of column.cardIds) {
                  if (cards[cardId]) cardsToModify.push(cards[cardId]);
                }
              }
            }
            if (cardsToModify.length > 0) {
              const messages = buildModifyPrompt(stepInstruction, channel, cardsToModify, tasks, effectiveSystemInstructions);
              const response = await llm.complete(messages);
              const modifiedCards = parseModifyResponse(response.content);
              stepResults.push({ action: 'modify', targetColumnIds: stepTargetColumnIds, modifiedCards });
            }
          } else if (step.action === 'move') {
            const cardsToMove: Card[] = [];
            for (const columnId of stepTargetColumnIds) {
              const column = channel.columns.find((c) => c.id === columnId);
              if (column) {
                for (const cardId of column.cardIds) {
                  if (cards[cardId]) cardsToMove.push(cards[cardId]);
                }
              }
            }
            if (cardsToMove.length > 0) {
              const messages = buildMovePrompt(stepInstruction, channel, cardsToMove, effectiveSystemInstructions);
              const response = await llm.complete(messages);
              const moveDecisions = parseMoveResponse(response.content);
              stepResults.push({ action: 'move', targetColumnIds: stepTargetColumnIds, movedCards: moveDecisions });
            }
          }
        } catch (stepError) {
          console.error(`Step ${step.action} failed:`, stepError);
        }
      }

      await recordUsageAfterSuccess();

      return NextResponse.json({
        action: 'multi-step',
        steps: stepResults,
      });
    }

    // ==========================================
    // SINGLE ACTION EXECUTION (existing flow)
    // ==========================================

    // Build debug info
    const debug = {
      systemPrompt: '',
      userPrompt: '',
      rawResponse: '',
    };

    if (instructionCard.action === 'generate') {
      // GENERATE action
      const messages = buildGeneratePrompt(
        instructionCard,
        channel,
        contextColumnIds,
        cards,
        effectiveSystemInstructions,
        targetColumnIds
      );

      // Web research: if instructions reference URLs, videos, articles etc.,
      // do a real web search first so the AI has factual data to work with
      if (llm.webSearch && detectWebSearchIntent(instructionCard.instructions || '')) {
        try {
          const searchQuery = (instructionCard.instructions || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
          const webResult = await llm.webSearch(
            searchQuery,
            `Search the web and return detailed, factual information including real URLs. The user needs real links and data for a Kanban board called "${channel.name}". Return specific URLs, titles, and descriptions.`
          );
          if (webResult.content) {
            // Append web research to the user prompt
            const userMsg = messages[messages.length - 1];
            const currentContent = userMsg.content as string;
            userMsg.content = currentContent + `\n\n## Web Research (real data from the internet)\nIMPORTANT: Use ONLY the real URLs below. Do NOT invent or hallucinate any URLs.\n\n${webResult.content}`;
          }
        } catch (e) {
          console.warn('Web search failed, proceeding without:', e);
        }
      }

      debug.systemPrompt = messages[0].content as string;
      debug.userPrompt = messages[1].content as string;

      try {
        const response = await llm.complete(messages);
        debug.rawResponse = response.content;
        const generatedCards = parseGenerateResponse(response.content);

        if (generatedCards.length === 0) {
          return NextResponse.json({
            action: 'generate',
            targetColumnIds,
            generatedCards: getRandomIdeas(instructionCard.cardCount ?? 5).map((idea) => ({
              title: idea,
              content: '<p>AI generation failed. Please try again.</p>',
            })),
            debug,
          });
        }

        // Record usage after successful generation
        await recordUsageAfterSuccess();

        return NextResponse.json({
          action: 'generate',
          targetColumnIds,
          generatedCards: generatedCards.slice(0, instructionCard.cardCount ?? 5),
          debug,
        });
      } catch (llmError) {
        console.error('LLM error:', llmError);
        debug.rawResponse = `Error: ${llmError instanceof Error ? llmError.message : 'Unknown error'}`;

        return NextResponse.json({
          action: 'generate',
          targetColumnIds,
          generatedCards: getRandomIdeas(instructionCard.cardCount ?? 5).map((idea) => ({
            title: idea,
            content: '<p>AI generation encountered an error. Please try again.</p>',
          })),
          debug,
        });
      }
    } else if (instructionCard.action === 'modify') {
      // MODIFY action
      // If triggered by a specific card event, only modify that card
      // Otherwise, get all cards in target columns
      const cardsToModify: Card[] = [];
      const skippedCardIds: string[] = [];

      if (triggeringCardId && cards[triggeringCardId]) {
        const card = cards[triggeringCardId];
        // Check if already processed by this instruction
        if (skipAlreadyProcessed && card.processedByInstructions?.[instructionCard.id]) {
          skippedCardIds.push(card.id);
        } else {
          cardsToModify.push(card);
        }
      } else {
        for (const columnId of targetColumnIds) {
          const column = channel.columns.find((c) => c.id === columnId);
          if (column) {
            for (const cardId of column.cardIds) {
              const card = cards[cardId];
              if (card) {
                // Check if already processed by this instruction
                if (skipAlreadyProcessed && card.processedByInstructions?.[instructionCard.id]) {
                  skippedCardIds.push(card.id);
                } else {
                  cardsToModify.push(card);
                }
              }
            }
          }
        }
      }

      if (cardsToModify.length === 0) {
        return NextResponse.json({
          action: 'modify',
          modifiedCards: [],
          skippedCardIds,
          message: skippedCardIds.length > 0
            ? `All ${skippedCardIds.length} card(s) already processed by this instruction.`
            : 'No cards found in target columns.',
        });
      }

      const messages = buildModifyPrompt(
        instructionCard,
        channel,
        cardsToModify,
        tasks,
        effectiveSystemInstructions
      );

      // Web research for modify: if instructions reference web content, fetch real data
      if (llm.webSearch && detectWebSearchIntent(instructionCard.instructions || '')) {
        try {
          const searchQuery = (instructionCard.instructions || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
          const webResult = await llm.webSearch(
            searchQuery,
            `Search the web and return detailed, factual information including real URLs. Return specific URLs, titles, and descriptions.`
          );
          if (webResult.content) {
            const userMsg = messages[messages.length - 1];
            const currentContent = userMsg.content as string;
            userMsg.content = currentContent + `\n\n## Web Research (real data from the internet)\nIMPORTANT: Use ONLY the real URLs below. Do NOT invent or hallucinate any URLs.\n\n${webResult.content}`;
          }
        } catch (e) {
          console.warn('Web search failed, proceeding without:', e);
        }
      }

      debug.systemPrompt = messages[0].content as string;
      debug.userPrompt = messages[1].content as string;

      try {
        const response = await llm.complete(messages);
        debug.rawResponse = response.content;
        const modifiedCards = parseModifyResponse(response.content);

        // Record usage after successful modification
        await recordUsageAfterSuccess();

        return NextResponse.json({
          action: 'modify',
          modifiedCards,
          skippedCardIds: skippedCardIds.length > 0 ? skippedCardIds : undefined,
          debug,
        });
      } catch (llmError) {
        console.error('LLM error:', llmError);
        debug.rawResponse = `Error: ${llmError instanceof Error ? llmError.message : 'Unknown error'}`;

        return NextResponse.json({
          action: 'modify',
          modifiedCards: [],
          skippedCardIds: skippedCardIds.length > 0 ? skippedCardIds : undefined,
          error: 'AI modification encountered an error. Please try again.',
          debug,
        });
      }
    } else {
      // MOVE action
      // If triggered by a specific card event, only analyze that card
      // Otherwise, get all cards in source columns (target columns are the source for move)
      const cardsToMove: Card[] = [];
      const skippedCardIds: string[] = [];

      if (triggeringCardId && cards[triggeringCardId]) {
        const card = cards[triggeringCardId];
        if (skipAlreadyProcessed && card.processedByInstructions?.[instructionCard.id]) {
          skippedCardIds.push(card.id);
        } else {
          cardsToMove.push(card);
        }
      } else {
        for (const columnId of targetColumnIds) {
          const column = channel.columns.find((c) => c.id === columnId);
          if (column) {
            for (const cardId of column.cardIds) {
              const card = cards[cardId];
              if (card) {
                if (skipAlreadyProcessed && card.processedByInstructions?.[instructionCard.id]) {
                  skippedCardIds.push(card.id);
                } else {
                  cardsToMove.push(card);
                }
              }
            }
          }
        }
      }

      if (cardsToMove.length === 0) {
        return NextResponse.json({
          action: 'move',
          movedCards: [],
          skippedCardIds,
          message: skippedCardIds.length > 0
            ? `All ${skippedCardIds.length} card(s) already processed by this instruction.`
            : 'No cards found in source columns.',
        });
      }

      const messages = buildMovePrompt(
        instructionCard,
        channel,
        cardsToMove,
        effectiveSystemInstructions
      );

      debug.systemPrompt = messages[0].content as string;
      debug.userPrompt = messages[1].content as string;

      try {
        const response = await llm.complete(messages);
        debug.rawResponse = response.content;
        const moveDecisions = parseMoveResponse(response.content);

        // Record usage after successful move analysis
        await recordUsageAfterSuccess();

        return NextResponse.json({
          action: 'move',
          movedCards: moveDecisions,
          skippedCardIds: skippedCardIds.length > 0 ? skippedCardIds : undefined,
          debug,
        });
      } catch (llmError) {
        console.error('LLM error:', llmError);
        debug.rawResponse = `Error: ${llmError instanceof Error ? llmError.message : 'Unknown error'}`;

        return NextResponse.json({
          action: 'move',
          movedCards: [],
          skippedCardIds: skippedCardIds.length > 0 ? skippedCardIds : undefined,
          error: 'AI move analysis encountered an error. Please try again.',
          debug,
        });
      }
    }
  } catch (error) {
    console.error('Run instruction error:', error);
    return NextResponse.json(
      { error: 'Failed to run instruction' },
      { status: 500 }
    );
  }
}
