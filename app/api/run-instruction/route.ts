import { NextResponse } from 'next/server';
import { marked } from 'marked';
import type { Channel, Card, CardInput, InstructionCard, InstructionTarget, ContextColumnSelection, Task } from '@/lib/types';
import { type LLMMessage } from '@/lib/ai/llm';
import { buildFeedbackContext } from '@/lib/ai/feedbackAnalyzer';
import { getAuthenticatedLLM } from '@/lib/ai/withAuth';
import { createNotification } from '@/lib/notifications/createNotification';
import { auth } from '@/lib/auth';

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
function parseInstructionKeywords(text: string): { allowTasks: boolean; allowProperties: boolean; allowTags: boolean; allowAssignment: boolean } {
  const lowerText = text.toLowerCase();

  const taskKeywords = ['task', 'tasks', 'action item', 'action items', 'todo', 'to-do', 'checklist'];
  const propertyKeywords = ['property', 'properties', 'categorize', 'category', 'metadata'];
  const tagKeywords = ['tag', 'tags', 'label', 'labels'];
  const assignmentKeywords = ['assign', 'assignee', 'assigned to', 'delegate', 'responsibility', 'responsible', 'who should', 'allocate', 'owner of', 'point person'];

  return {
    allowTasks: taskKeywords.some(kw => lowerText.includes(kw)),
    allowProperties: propertyKeywords.some(kw => lowerText.includes(kw)),
    allowTags: tagKeywords.some(kw => lowerText.includes(kw)),
    allowAssignment: assignmentKeywords.some(kw => lowerText.includes(kw)),
  };
}

interface MemberInfo {
  id: string;
  name: string;
  role?: string;
  roleDescription?: string | null;
}

function buildMembersContext(members: MemberInfo[]): string {
  if (!members || members.length === 0) return '';
  const lines = members.map(m => {
    let line = `- **${m.name}** (ID: "${m.id}")`;
    if (m.role) line += ` — Role: ${m.role}`;
    if (m.roleDescription) line += `\n  Context: ${m.roleDescription}`;
    return line;
  });
  return `## Channel Members\n${lines.join('\n')}`;
}

function buildGeneratePrompt(
  instructionCard: InstructionCard,
  channel: Channel,
  contextColumnIds: string[],
  allCards: Record<string, Card>,
  systemInstructions?: string,
  targetColumnIds?: string[],
  members?: MemberInfo[],
  allowAssignment?: boolean
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
  const assignedToField = allowAssignment && members && members.length > 0
    ? ', "assignedTo": ["user-id"]'
    : '';
  const assignmentNote = allowAssignment && members && members.length > 0
    ? '\n- "assignedTo": optional array of member IDs to assign this card to (use IDs from the Channel Members list)'
    : '';

  const systemPrompt = `Generate ${count} cards as a JSON array.

Each card has:
- "title": concise (1-8 words)
- "content": detailed markdown-formatted content (2-4 paragraphs minimum)${assignmentNote}

Content Guidelines:
- Write substantively - explain each idea thoroughly
- Use markdown: **bold**, *italics*, bullet lists, numbered lists, headers (##)
- Include context, rationale, implications, or examples as appropriate
- Aim for 150-400 words per card - depth matters for planning/brainstorming
- Each card should stand alone as a complete thought
- If web research data is provided, use ONLY real URLs from that data — NEVER fabricate or guess URLs
${targetColumnInfo ? '\n- IMPORTANT: All generated cards must fit the target column rules' : ''}

Respond with ONLY the JSON array:
[{"title": "Card Title", "content": "## Overview\\n\\nDetailed explanation..."${assignedToField}}]`;

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

  // Members context for assignment
  if (allowAssignment && members && members.length > 0) {
    userParts.push(buildMembersContext(members));
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
  systemInstructions?: string,
  members?: MemberInfo[],
  allowAssignment?: boolean
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
    const taskFields = allowAssignment && members && members.length > 0
      ? '"tasks": [\n    { "title": "Action item extracted from content", "description": "Optional details", "assignedTo": ["user-id"] }\n  ]'
      : '"tasks": [\n    { "title": "Action item extracted from content", "description": "Optional details" }\n  ]';
    jsonFields.push(taskFields);
  }

  if (allowAssignment && members && members.length > 0) {
    jsonFields.push('"assignedTo": ["user-id"]');
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

  if (allowAssignment && members && members.length > 0) {
    capabilityExplanations.push(`Assignment: You can assign channel members to cards and tasks.
- Use the "assignedTo" field with an array of member IDs from the Channel Members list
- Choose members based on their role descriptions and expertise
- Only assign members whose skills match the card/task content`);
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
  if (!allowAssignment || !members || members.length === 0) {
    restrictions.push('Do NOT add assignedTo - assignment was not requested.');
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

  // Members context for assignment
  if (allowAssignment && members && members.length > 0) {
    userParts.push(buildMembersContext(members));
  }

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
        assignedTo: Array.isArray(item.assignedTo)
          ? item.assignedTo.filter((id: unknown) => typeof id === 'string')
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
  assignedTo?: string[];
}

interface ModifyResponseCard {
  id: string;
  title: string;
  content?: string;
  tags?: string[];
  properties?: ModifyResponseProperty[];
  tasks?: ModifyResponseTask[];
  assignedTo?: string[];
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
              assignedTo: Array.isArray(t.assignedTo)
                ? (t.assignedTo as unknown[]).filter((id): id is string => typeof id === 'string')
                : undefined,
            }))
          : undefined,
        assignedTo: Array.isArray(item.assignedTo)
          ? item.assignedTo.filter((id: unknown) => typeof id === 'string')
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

/**
 * Build a UNIFIED prompt for multi-step shrooms.
 * Instead of running each step as an independent LLM call,
 * we send ONE prompt that asks the AI to perform ALL actions
 * (modify + move, generate + move, etc.) in a single response.
 * This ensures the AI's decisions are coherent across steps.
 */
function buildMultiStepPrompt(
  instructionCard: InstructionCard,
  channel: Channel,
  allCards: Record<string, Card>,
  allTasks: Record<string, Task>,
  systemInstructions?: string,
  members?: MemberInfo[],
  allowAssignment?: boolean
): LLMMessage[] {
  // Collect all unique source column IDs from steps
  const sourceColumnIds = new Set<string>();
  if (instructionCard.steps) {
    for (const step of instructionCard.steps) {
      sourceColumnIds.add(step.targetColumnId);
    }
  }
  // Also add the main target
  if (instructionCard.target.type === 'column') {
    sourceColumnIds.add(instructionCard.target.columnId);
  } else if (instructionCard.target.type === 'columns') {
    for (const id of instructionCard.target.columnIds) {
      sourceColumnIds.add(id);
    }
  }

  // Parse instruction keywords for capabilities
  const { allowTasks, allowProperties, allowTags } = parseInstructionKeywords(instructionCard.instructions || '');

  // Determine which action types are involved
  const hasGenerate = instructionCard.steps?.some(s => s.action === 'generate') ?? false;
  const hasModify = instructionCard.steps?.some(s => s.action === 'modify') ?? false;
  const hasMove = instructionCard.steps?.some(s => s.action === 'move') ?? false;

  // Build available columns list
  const columnsList = channel.columns.map((c) => {
    let colInfo = `- "${c.name}" (ID: ${c.id})`;
    if (c.instructions) {
      colInfo += `\n  Rules: ${c.instructions}`;
    }
    return colInfo;
  }).join('\n');

  // Build response format dynamically based on what actions are needed
  const responseFields: string[] = [];

  if (hasGenerate) {
    const generateStep = instructionCard.steps?.find(s => s.action === 'generate');
    const count = generateStep?.cardCount ?? instructionCard.cardCount ?? 5;
    const genAssigned = allowAssignment && members && members.length > 0 ? ', "assignedTo": ["user-id"]' : '';
    responseFields.push(`"generatedCards": [{"title": "Card Title", "content": "Detailed markdown content", "targetColumnId": "column-id-where-card-goes"${genAssigned}}]  // Generate ${count} cards`);
  }

  if (hasModify) {
    const modifyFields: string[] = ['"id": "original-card-id"', '"title": "Updated Title"', '"content": "Updated content in markdown"'];
    if (allowTags) modifyFields.push('"tags": ["TagName"]');
    if (allowProperties) modifyFields.push('"properties": [{"key": "category", "value": "Example", "displayType": "chip", "color": "blue"}]');
    if (allowTasks) {
      const taskAssigned = allowAssignment && members && members.length > 0 ? ', "assignedTo": ["user-id"]' : '';
      modifyFields.push(`"tasks": [{"title": "Action item", "description": "Details"${taskAssigned}}]`);
    }
    if (allowAssignment && members && members.length > 0) modifyFields.push('"assignedTo": ["user-id"]');
    responseFields.push(`"modifiedCards": [{${modifyFields.join(', ')}}]  // Cards you modified`);
  }

  if (hasMove) {
    responseFields.push(`"movedCards": [{"cardId": "card-id", "destinationColumnId": "column-id", "reason": "brief explanation"}]  // Cards to move`);
  }

  // SYSTEM PROMPT
  const systemPrompt = `You are performing a multi-step operation on a Kanban board. You will analyze cards and perform ALL requested actions in ONE response.

Available columns:
${columnsList}

IMPORTANT: You must respond with a single JSON object containing the results of ALL actions:
{
  ${responseFields.join(',\n  ')}
}

Rules:
- Perform the actions described in the instructions IN ORDER, but return everything in a single response
- If a step says "select the best card" and then "modify it" and then "move it", the SAME card must appear in both modifiedCards and movedCards
- For modifiedCards: only include cards that have actual changes. Use the original card ID.
- For movedCards: only include cards that should actually move. Use the column ID (not name) for destinationColumnId.
- For generatedCards: include the targetColumnId for where each card should go.
${hasModify ? '- Content in modifiedCards will be added as a new note/message on the card' : ''}
${!allowTags ? '- Do NOT add tags.' : ''}
${!allowProperties ? '- Do NOT add properties.' : ''}
${!allowTasks ? '- Do NOT create tasks.' : ''}
${(!allowAssignment || !members || members.length === 0) ? '- Do NOT add assignedTo.' : '- You may assign channel members using their IDs from the members list.'}

Respond with ONLY the JSON object, no other text.`;

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
  userParts.push(contextSection);

  // Cards in source columns
  let cardsSection = '## Cards to Work With';
  for (const columnId of sourceColumnIds) {
    const column = channel.columns.find((c) => c.id === columnId);
    if (!column) continue;

    cardsSection += `\n\n### Column: "${column.name}" (ID: ${column.id})`;
    const columnCards = column.cardIds.map(id => allCards[id]).filter(Boolean);

    if (columnCards.length === 0) {
      cardsSection += '\n(empty)';
      continue;
    }

    for (const card of columnCards) {
      cardsSection += `\n\n**Card ID: ${card.id}**`;
      cardsSection += `\n- Title: ${card.title}`;
      if (card.summary) {
        cardsSection += `\n- Summary: ${card.summary}`;
      } else if (card.messages && card.messages.length > 0) {
        const content = card.messages.map(m => m.content).join('\n').slice(0, 500);
        cardsSection += `\n- Content: ${content}`;
      }

      // Include existing tasks if task creation is allowed
      if (allowTasks && card.taskIds && card.taskIds.length > 0) {
        const cardTasks = card.taskIds.map(id => allTasks[id]).filter(Boolean);
        if (cardTasks.length > 0) {
          cardsSection += `\n- Existing Tasks:`;
          for (const task of cardTasks) {
            const statusIcon = task.status === 'done' ? '[x]' : task.status === 'in_progress' ? '[-]' : '[ ]';
            cardsSection += `\n  ${statusIcon} ${task.title}`;
          }
        }
      }
    }
  }
  userParts.push(cardsSection);

  // Members context for assignment
  if (allowAssignment && members && members.length > 0) {
    userParts.push(buildMembersContext(members));
  }

  // Instructions - the full multi-step instructions
  let taskSection = '## Your Task\nPerform the following operations:';
  if (instructionCard.instructions?.trim()) {
    taskSection += `\n\n${instructionCard.instructions.trim()}`;
  }

  // Add step descriptions for clarity
  if (instructionCard.steps && instructionCard.steps.length > 0) {
    taskSection += '\n\nExpected actions:';
    for (let i = 0; i < instructionCard.steps.length; i++) {
      const step = instructionCard.steps[i];
      const colName = channel.columns.find(c => c.id === step.targetColumnId)?.name || 'Unknown';
      taskSection += `\n${i + 1}. ${step.action.toUpperCase()} — ${step.description} (source column: "${colName}")`;
    }
  }

  userParts.push(taskSection);

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userParts.join('\n\n') },
  ];
}

/**
 * Parse the unified multi-step response.
 * Returns a flat object with modifiedCards, movedCards, and generatedCards.
 */
function parseMultiStepResponse(content: string): {
  modifiedCards: ModifyResponseCard[];
  movedCards: Array<{ cardId: string; destinationColumnId: string; reason?: string }>;
  generatedCards: CardInput[];
} {
  const result = {
    modifiedCards: [] as ModifyResponseCard[],
    movedCards: [] as Array<{ cardId: string; destinationColumnId: string; reason?: string }>,
    generatedCards: [] as CardInput[],
  };

  try {
    // Find the JSON object in the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('No JSON object found in multi-step response');
      return result;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Parse modifiedCards
    if (Array.isArray(parsed.modifiedCards)) {
      result.modifiedCards = parsed.modifiedCards
        .filter((item: Record<string, unknown>) => item && typeof item.id === 'string' && typeof item.title === 'string')
        .map((item: Record<string, unknown>) => ({
          id: String(item.id),
          title: String(item.title).trim(),
          content: typeof item.content === 'string' ? item.content.trim() : undefined,
          tags: Array.isArray(item.tags)
            ? (item.tags as unknown[]).filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map(t => t.trim())
            : undefined,
          properties: Array.isArray(item.properties)
            ? (item.properties as Record<string, unknown>[]).filter(p => p && typeof p.key === 'string' && typeof p.value === 'string').map(p => ({
                key: String(p.key),
                value: String(p.value),
                displayType: p.displayType === 'field' ? 'field' as const : 'chip' as const,
                color: typeof p.color === 'string' ? p.color : undefined,
              }))
            : undefined,
          tasks: Array.isArray(item.tasks)
            ? (item.tasks as Record<string, unknown>[]).filter(t => t && typeof t.title === 'string').map(t => ({
                title: String(t.title).trim(),
                description: typeof t.description === 'string' ? t.description.trim() : undefined,
                assignedTo: Array.isArray(t.assignedTo)
                  ? (t.assignedTo as unknown[]).filter((id): id is string => typeof id === 'string')
                  : undefined,
              }))
            : undefined,
          assignedTo: Array.isArray(item.assignedTo)
            ? (item.assignedTo as unknown[]).filter((id): id is string => typeof id === 'string')
            : undefined,
        }));
    }

    // Parse movedCards
    if (Array.isArray(parsed.movedCards)) {
      result.movedCards = parsed.movedCards
        .filter((item: Record<string, unknown>) => item && typeof item.cardId === 'string' && typeof item.destinationColumnId === 'string')
        .map((item: Record<string, unknown>) => ({
          cardId: String(item.cardId),
          destinationColumnId: String(item.destinationColumnId),
          reason: typeof item.reason === 'string' ? String(item.reason) : undefined,
        }));
    }

    // Parse generatedCards
    if (Array.isArray(parsed.generatedCards)) {
      result.generatedCards = parsed.generatedCards
        .filter((item: Record<string, unknown>) => item && typeof item.title === 'string')
        .map((item: Record<string, unknown>) => ({
          title: String(item.title).trim(),
          initialMessage: typeof item.content === 'string' ? String(item.content).trim() : undefined,
          assignedTo: Array.isArray(item.assignedTo)
            ? (item.assignedTo as unknown[]).filter((id): id is string => typeof id === 'string')
            : undefined,
        }));
    }
  } catch (error) {
    console.warn('Failed to parse multi-step response:', error);
  }

  return result;
}

interface RunInstructionRequest {
  instructionCard: InstructionCard;
  channel: Channel;
  cards: Record<string, Card>;
  tasks?: Record<string, Task>;
  triggeringCardId?: string;
  skipAlreadyProcessed?: boolean;  // For automatic runs, skip cards already processed by this instruction
  systemInstructions?: string;
  members?: MemberInfo[];
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    const body: RunInstructionRequest = await request.json();
    const { instructionCard, channel, cards, tasks = {}, triggeringCardId, skipAlreadyProcessed, systemInstructions, members } = body;

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
    // MULTI-STEP EXECUTION (unified single-prompt)
    // ==========================================
    // Parse assignment capability from instruction keywords (shared across all paths)
    const { allowAssignment } = parseInstructionKeywords(instructionCard.instructions || '');

    if (instructionCard.steps && instructionCard.steps.length > 0) {
      const messages = buildMultiStepPrompt(instructionCard, channel, cards, tasks, effectiveSystemInstructions, members, allowAssignment);

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

      try {
        const response = await llm.complete(messages);
        const multiStepResult = parseMultiStepResponse(response.content);

        await recordUsageAfterSuccess();

        // Collect all target column IDs from steps
        const allTargetColumnIds = [...new Set(instructionCard.steps.map(s => s.targetColumnId))];

        // Notify shroom completed
        if (userId) {
          createNotification({
            userId,
            type: 'shroom_completed',
            title: 'Shroom finished running',
            body: `"${instructionCard.title}" completed`,
            data: { channelId: channel.id, instructionCardId: instructionCard.id },
          }).catch(() => {});
        }

        return NextResponse.json({
          action: 'multi-step',
          targetColumnIds: allTargetColumnIds,
          modifiedCards: multiStepResult.modifiedCards.length > 0 ? multiStepResult.modifiedCards : undefined,
          movedCards: multiStepResult.movedCards.length > 0 ? multiStepResult.movedCards : undefined,
          generatedCards: multiStepResult.generatedCards.length > 0 ? multiStepResult.generatedCards : undefined,
        });
      } catch (llmError) {
        console.error('Multi-step LLM error:', llmError);
        return NextResponse.json({
          action: 'multi-step',
          targetColumnIds: [],
          error: `AI error: ${llmError instanceof Error ? llmError.message : 'Unknown error'}`,
        });
      }
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
        targetColumnIds,
        members,
        allowAssignment
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

        // Notify shroom completed
        if (userId) {
          createNotification({
            userId,
            type: 'shroom_completed',
            title: 'Shroom finished running',
            body: `"${instructionCard.title}" generated ${generatedCards.length} card(s)`,
            data: { channelId: channel.id, instructionCardId: instructionCard.id },
          }).catch(() => {});
        }

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
        effectiveSystemInstructions,
        members,
        allowAssignment
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

        // Notify shroom completed
        if (userId) {
          createNotification({
            userId,
            type: 'shroom_completed',
            title: 'Shroom finished running',
            body: `"${instructionCard.title}" modified ${modifiedCards.length} card(s)`,
            data: { channelId: channel.id, instructionCardId: instructionCard.id },
          }).catch(() => {});
        }

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

        // Notify shroom completed
        if (userId) {
          createNotification({
            userId,
            type: 'shroom_completed',
            title: 'Shroom finished running',
            body: `"${instructionCard.title}" moved ${moveDecisions.length} card(s)`,
            data: { channelId: channel.id, instructionCardId: instructionCard.id },
          }).catch(() => {});
        }

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
