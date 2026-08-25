import { NextResponse } from 'next/server';
import { marked } from 'marked';
import type { Channel, Card, CardInput, InstructionCard, InstructionTarget, ContextColumnSelection, Task, CardRejection } from '@/lib/types';
import { type LLMMessage, type LLMProvider, type LLMResponse, getLLMClientForUser } from '@/lib/ai/llm';
import { recordUsage } from '@/lib/usage';
import { buildFeedbackContext, buildRejectionContext } from '@/lib/ai/feedbackAnalyzer';
import { getAuthenticatedLLM } from '@/lib/ai/withAuth';
import { parseModelChoice } from '@/lib/ai/modelCatalog';
import { shouldResearchWeb, baseSearchQuery, researchWeb, formatResearchBlock } from '@/lib/shrooms/webResearch';
import {
  resolveCapabilities,
  explainScopeConflict,
  describeScope,
  type ShroomScope,
} from '@/lib/shrooms/invocation';
import { createNotification } from '@/lib/notifications/createNotification';
import { auth } from '@/lib/auth';
import { ensureSchema } from '@/lib/db/ensure-schema';
import { createShroomCards, createShroomReport, applyShroomModifications, applyShroomMoves } from '@/lib/shrooms/apply';
import { generatePlaygroundApp } from '@/lib/playground/generateApp';
import { stripEchoedContent, cardContentStrings } from '@/lib/shrooms/stripEchoedContent';
import { loadChannelRejections } from '@/lib/shrooms/rejections';
import { sendShroomRunEmail, type ShroomRunOutcome } from '@/lib/shrooms/sendRunEmail';

// Configure marked for safe HTML output
marked.setOptions({
  breaks: true,
  gfm: true,
});

/**
 * Output budget for a shroom run.
 *
 * A shroom answers with JSON that carries whole card bodies, so its response is far
 * longer than a chat reply — and on a reasoning model the thinking tokens come out of
 * the same allowance before a single character of that JSON is written. The provider
 * default of 4096 was enough for a short card and not for a long one, so a shroom over
 * a pasted article would truncate mid-JSON, parse as zero changes, and record a
 * successful run that did nothing.
 */
const SHROOM_MAX_TOKENS = 32000;

/** The response ran out of room, so an empty parse means "cut off", not "no changes". */
const TRUNCATED_ERROR =
  'The AI response was cut off before it finished. The cards involved are likely too long — try running on fewer cards, or shortening the card content.';

/**
 * Run a shroom completion, retrying once on a roomier model if the first answer
 * was cut off before it produced anything usable.
 *
 * `parse` decides what "usable" means, because that differs per action — one path
 * wants cards, another wants moves — and a truncated response that still parsed
 * into real work should be kept rather than paid for twice.
 *
 * Exactly one retry. Escalation costs real money, so it is capped here rather
 * than left to a loop, and `escalatedTo` is returned so the caller can say it
 * happened instead of quietly spending more.
 */
async function completeWithEscalation<T>(
  llm: LLMProvider,
  messages: LLMMessage[],
  parse: (raw: string) => T,
  isEmpty: (parsed: T) => boolean,
  label: string
): Promise<{ response: LLMResponse; parsed: T; escalatedTo?: string }> {
  const response = await llm.complete(messages, { maxTokens: SHROOM_MAX_TOKENS });
  const parsed = parse(response.content);

  if (!response.truncated || !isEmpty(parsed)) return { response, parsed };

  const roomier = llm.escalate?.();
  if (!roomier) {
    console.error(`[shrooms] "${label}" truncated at ${SHROOM_MAX_TOKENS} tokens, no roomier model available`);
    return { response, parsed };
  }

  console.warn(`[shrooms] "${label}" truncated on ${llm.model}, retrying on ${roomier.model}`);
  const retry = await roomier.complete(messages, { maxTokens: SHROOM_MAX_TOKENS });
  const retryParsed = parse(retry.content);

  if (retry.truncated && isEmpty(retryParsed)) {
    console.error(`[shrooms] "${label}" truncated again on ${roomier.model}`);
    return { response: retry, parsed: retryParsed, escalatedTo: roomier.model };
  }

  return { response: retry, parsed: retryParsed, escalatedTo: roomier.model };
}

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
  scope?: ShroomScope
): LLMMessage[] {
  const count = instructionCard.cardCount ?? 5;
  const allowAssignment = resolveCapabilities(instructionCard).assignment;

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

  // Only worth saying when the run was actually pointed at cards. A generate shroom on
  // its usual schedule has none, and inventing a scope line for that is noise.
  if (scope && scope.cardIds.length > 0) userParts.push(describeScope(scope, 'seed'));

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
  contextColumnIds: string[],
  allCards: Record<string, Card>,
  systemInstructions?: string,
  members?: MemberInfo[],
  scope?: ShroomScope
): { messages: LLMMessage[]; cardIdMap: Record<string, string> } {
  // Build a mapping from simple numeric IDs to real card IDs
  // This prevents LLMs from mangling complex nanoid strings
  const cardIdMap: Record<string, string> = {};
  for (let i = 0; i < cardsToModify.length; i++) {
    cardIdMap[`card_${i + 1}`] = cardsToModify[i].id;
  }

  // What the shroom is permitted to do — a stored decision, not a guess about its prose.
  const caps = resolveCapabilities(instructionCard);
  const allowTasks = caps.tasks;
  const allowProperties = caps.properties;
  const allowTags = caps.tags;
  const allowAssignment = caps.assignment;

  // Build the JSON example dynamically based on allowed capabilities
  const jsonFields: string[] = [
    '"id": "card_1"',
    '"title": "Updated Title"',
    '"content": "The new note to add, in markdown"',
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

The "content" field is APPENDED to the card as a new note. It is not a replacement body — the card keeps everything already on it.
- Write ONLY your new material: your analysis, findings, or additions.
- Do NOT copy, quote at length, restate or summarize back the card's existing content. The reader already has it directly above your note.
- Start straight at your contribution. No "here is the original" preamble, no reproduction of the source text.
Even when the instructions say to "update the description" or "rewrite the card", write only the new note — appending is how the update happens.

${capabilityExplanations.length > 0 ? capabilityExplanations.join('\n\n') + '\n\n' : ''}${restrictions.length > 0 ? 'IMPORTANT: ' + restrictions.join(' ') + '\n\n' : ''}IMPORTANT: You MUST return a modification for EVERY card. The "content" field is REQUIRED — always provide the new note called for by the instructions. The "id" field must exactly match the card ID shown (e.g. "card_1", "card_2").`;

  // USER PROMPT
  const userParts: string[] = [];

  // Context
  let contextSection = `## Context\nChannel: ${channel.name}`;
  if (systemInstructions?.trim()) {
    contextSection += `\n\nGeneral guidance:\n${systemInstructions.trim()}`;
  }
  userParts.push(contextSection);

  // Say what this run's scope actually is. The same shroom is invoked on one card from a
  // thread and on a whole column from a schedule; without this the model has to infer
  // which it's in from what it wasn't given.
  if (scope) userParts.push(describeScope(scope));

  // Cards to modify (using simple numeric IDs for reliable LLM echo-back)
  let cardsSection =
    '## Cards to Modify\n(Everything below is already on these cards. Your note is added underneath it — do not repeat any of it back.)';
  for (let i = 0; i < cardsToModify.length; i++) {
    const card = cardsToModify[i];
    const simpleId = `card_${i + 1}`;
    // Get content from messages
    const cardContent = card.messages && card.messages.length > 0
      ? card.messages.map(m => m.content).join('\n')
      : '(no content)';
    cardsSection += `\n\n### Card ID: ${simpleId}`;
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

  // Board context - show cards in context columns (excluding cards already in "Cards to Modify")
  const modifyCardIds = new Set(cardsToModify.map(c => c.id));
  const targetColumnIds = getTargetColumnIds(instructionCard.target, channel);
  const contextColumns = channel.columns.filter(
    (c) => contextColumnIds.includes(c.id) && !targetColumnIds.includes(c.id)
  );
  if (contextColumns.length > 0) {
    let boardContext = '## Board Context';
    for (const column of contextColumns) {
      const columnCards = column.cardIds
        .map((id) => allCards[id])
        .filter((c): c is Card => Boolean(c) && !modifyCardIds.has(c.id));
      boardContext += `\n\n### ${column.name}`;
      if (columnCards.length > 0) {
        for (const card of columnCards) {
          boardContext += `\n- ${card.title}`;
          if (card.summary) {
            boardContext += `: ${card.summary.slice(0, 150)}`;
          } else if (card.messages && card.messages.length > 0) {
            boardContext += `: ${card.messages[0].content.slice(0, 150)}`;
          }
        }
      } else {
        boardContext += '\n(empty)';
      }
    }
    userParts.push(boardContext);
  }

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

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userParts.join('\n\n') },
    ],
    cardIdMap,
  };
}

function stripCodeBlocks(text: string): string {
  let s = text.trim();
  if (s.startsWith('```json')) s = s.slice(7);
  else if (s.startsWith('```')) s = s.slice(3);
  if (s.endsWith('```')) s = s.slice(0, -3);
  return s.trim();
}

function parseGenerateResponse(content: string): CardInput[] {
  try {
    const cleaned = stripCodeBlocks(content);
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
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
    const cleaned = stripCodeBlocks(content);
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
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
  systemInstructions?: string,
  scope?: ShroomScope
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

  if (scope) userParts.push(describeScope(scope, 'transform'));

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

interface ReportResult {
  headline: string;
  highlights: { text: string; cardIds?: string[] }[];
  summary?: string;
}

/**
 * Build a prompt for a `report` shroom.
 *
 * Unlike the other actions this produces no card mutations — it reads the context
 * columns and writes an observation. Boards get harder to read as they fill up; a
 * shroom that says "these three have been sitting a week" is useful precisely because
 * it doesn't add to the pile.
 */
function buildReportPrompt(
  instructionCard: InstructionCard,
  channel: Channel,
  contextCards: Card[],
  systemInstructions?: string,
  scope?: ShroomScope
): LLMMessage[] {
  const systemPrompt = `You are analyzing a Kanban channel and writing a short, useful status report for its owner.

You do NOT create, modify, or move cards. You observe and report.

Respond with a JSON object:
{
  "headline": "One short line summarizing the state (max 80 chars)",
  "highlights": [
    {"text": "A specific, concrete observation", "cardIds": ["id-of-a-card-it-refers-to"]}
  ],
  "summary": "Optional 1-2 sentence closing thought"
}

Rules:
- 2-5 highlights. Fewer good ones beats more filler.
- Be specific. "3 cards in Do These haven't moved in over a week" beats "some cards are stale".
- Reference real card IDs from the data when a highlight is about particular cards.
- If nothing noteworthy is happening, say so plainly in the headline with an empty highlights array.
- Never invent cards, dates, or activity that isn't in the data.`;

  const userParts: string[] = [];

  let contextSection = `## Context\nChannel: ${channel.name}`;
  if (channel.description) contextSection += `\nDescription: ${channel.description}`;
  contextSection += `\nToday: ${new Date().toISOString().slice(0, 10)}`;
  if (systemInstructions?.trim()) {
    contextSection += `\n\nGeneral guidance:\n${systemInstructions.trim()}`;
  }
  userParts.push(contextSection);

  if (scope) userParts.push(describeScope(scope, 'read'));

  let cardsSection = '## Cards';
  if (contextCards.length === 0) {
    cardsSection += '\n(no cards)';
  }
  for (const card of contextCards) {
    const currentColumn = channel.columns.find((c) => c.cardIds.includes(card.id));
    cardsSection += `\n\n### ${card.title} (id:${card.id})`;
    cardsSection += `\nColumn: ${currentColumn?.name || 'Unknown'}`;
    cardsSection += `\nCreated: ${card.createdAt?.slice(0, 10) ?? 'unknown'} · Updated: ${card.updatedAt?.slice(0, 10) ?? 'unknown'}`;
    if (card.tags?.length) cardsSection += `\nTags: ${card.tags.join(', ')}`;
    if (card.summary) cardsSection += `\nSummary: ${card.summary}`;
  }
  userParts.push(cardsSection);

  let taskSection = '## What to report on';
  if (instructionCard.instructions?.trim()) {
    taskSection += `\n\n${instructionCard.instructions.trim()}`;
  } else {
    taskSection += '\n\nSummarize the current state of this channel and flag anything that needs attention.';
  }
  userParts.push(taskSection);

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userParts.join('\n\n') },
  ];
}

function parseReportResponse(content: string): ReportResult | null {
  try {
    const cleaned = stripCodeBlocks(content);
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed || typeof parsed.headline !== 'string') return null;

    return {
      headline: parsed.headline.trim(),
      highlights: Array.isArray(parsed.highlights)
        ? parsed.highlights
            .filter((h: unknown) => h && typeof (h as { text?: unknown }).text === 'string')
            .map((h: { text: string; cardIds?: unknown }) => ({
              text: h.text.trim(),
              cardIds: Array.isArray(h.cardIds)
                ? h.cardIds.filter((id: unknown) => typeof id === 'string')
                : undefined,
            }))
        : [],
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : undefined,
    };
  } catch (error) {
    console.warn('Failed to parse report response:', error);
    return null;
  }
}

function parseMoveResponse(content: string): Array<{ cardId: string; destinationColumnId: string; reason?: string }> {
  try {
    const cleaned = stripCodeBlocks(content);
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
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
  scope?: ShroomScope
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

  // What the shroom is permitted to do — a stored decision, not a guess about its prose.
  const caps = resolveCapabilities(instructionCard);
  const allowTasks = caps.tasks;
  const allowProperties = caps.properties;
  const allowTags = caps.tags;
  const allowAssignment = caps.assignment;

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
    const modifyFields: string[] = ['"id": "original-card-id"', '"title": "Updated Title"', '"content": "The new note to add, in markdown"'];
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
${hasModify ? '- Content in modifiedCards is APPENDED to the card as a new note. Write only your new material — never copy back or restate the card\'s existing content.' : ''}
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

  if (scope) userParts.push(describeScope(scope));

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

function isMultiStepEmpty(result: {
  modifiedCards: unknown[];
  movedCards: unknown[];
  generatedCards: unknown[];
}): boolean {
  return (
    result.modifiedCards.length === 0 &&
    result.movedCards.length === 0 &&
    result.generatedCards.length === 0
  );
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
    const cleaned = stripCodeBlocks(content);
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
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
  cardIds?: string[];              // Scope the run to specific cards (card menu, multi-select, "run only unprocessed")
  apply?: boolean;                 // Write generated cards server-side. Default false so previews stay dry runs.
  asUserId?: string;               // Internal (cron) only: whose LLM quota to spend
  skipAlreadyProcessed?: boolean;  // For automatic runs, skip cards already processed by this instruction
  systemInstructions?: string;
  members?: MemberInfo[];
  rejections?: CardRejection[];
}

export async function POST(request: Request) {
  try {
    await ensureSchema();

    const body: RunInstructionRequest = await request.json();

    // Cron has no session. It authenticates with the internal secret and tells us which
    // user's LLM quota to spend (the channel owner's).
    const internalSecret = request.headers.get('x-internal-secret');
    const isInternal = Boolean(
      process.env.INTERNAL_API_SECRET && internalSecret === process.env.INTERNAL_API_SECRET
    );

    const session = isInternal ? null : await auth();
    const userId = isInternal ? body.asUserId ?? null : session?.user?.id;
    const { instructionCard, channel, cards, tasks = {}, triggeringCardId, cardIds, apply = false, skipAlreadyProcessed, systemInstructions, members, rejections } = body;

    // Validate required fields
    if (!instructionCard || !channel) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const targetColumnIds = getTargetColumnIds(instructionCard.target, channel);
    const contextColumnIds = getContextColumnIds(instructionCard.contextColumns, channel);

    /**
     * The invocation's scope: which cards this run is actually about.
     *
     * Resolved once, here, rather than re-derived inside each action branch — the branches
     * used to each contain their own copy of this ladder, which is how the prompt ended up
     * never mentioning the answer. Narrowest wins: a triggering card, then an explicit
     * selection, then the shroom's default scope.
     */
    const scope: ShroomScope = triggeringCardId && cards[triggeringCardId]
      ? { cardIds: [triggeringCardId], kind: 'card' }
      : cardIds?.length
        ? { cardIds, kind: cardIds.length === 1 ? 'card' : 'selection' }
        : {
            cardIds: targetColumnIds.flatMap(
              (columnId) => channel.columns.find((c) => c.id === columnId)?.cardIds ?? []
            ),
            kind: instructionCard.target.type === 'board' ? 'board' : 'column',
            columnNames: targetColumnIds
              .map((id) => channel.columns.find((c) => c.id === id)?.name)
              .filter((n): n is string => Boolean(n)),
          };

    // Refuse a run the shroom can't make sense of, before spending a model call. The
    // reason comes from what the shroom declares it needs, so it's the author's words.
    const scopeConflict = explainScopeConflict(instructionCard, scope.cardIds.length);
    if (scopeConflict) {
      return NextResponse.json({
        action: instructionCard.action,
        targetColumnIds,
        error: scopeConflict,
      });
    }

    // Rejection history lives on the server so a shroom learns from every device, not
    // just the one it happened to run on. `rejections` in the body is the legacy
    // client-passed array, kept only as a fallback while old clients are in flight.
    let cachedRejections: CardRejection[] | null = null;
    const resolveRejections = async (): Promise<CardRejection[]> => {
      if (cachedRejections) return cachedRejections;
      try {
        const stored = await loadChannelRejections(channel.id);
        cachedRejections = stored.length > 0 ? stored : (rejections ?? []);
      } catch {
        cachedRejections = rejections ?? [];
      }
      return cachedRejections;
    };

    const appendRejectionContext = (messages: LLMMessage[], entries: CardRejection[]) => {
      if (entries.length === 0) return;
      const rejectionContext = buildRejectionContext(entries, channel.id);
      if (!rejectionContext) return;
      const userMsg = messages[messages.length - 1];
      userMsg.content = `${userMsg.content as string}\n\n${rejectionContext}\n\nUse this rejection history to avoid generating similar cards.`;
    };

    /**
     * Email the channel owner about this run, if the shroom asks for it.
     *
     * Awaited rather than fired-and-forgotten: composing the email is another LLM call,
     * and on serverless the function can be frozen the moment the response is returned,
     * which would drop the send. Runs are already slow enough that a few more seconds
     * is the right trade for actually delivering.
     *
     * Only fires on `apply` runs — previews and dry runs shouldn't mail anyone.
     */
    const maybeSendRunEmail = async (outcome: ShroomRunOutcome): Promise<void> => {
      if (!apply) return;
      if (!instructionCard.emailConfig?.enabled) return;
      const result = await sendShroomRunEmail(instructionCard, channel.id, outcome, userId ?? undefined);
      if (!result.sent && result.reason !== 'not enabled' && result.reason !== 'nothing happened') {
        console.warn(`[run-instruction] Shroom email not sent: ${result.reason}`);
      }
    };

    /**
     * Tell the owner a run ended without doing anything, and why.
     *
     * The email is the usual way a shroom reports in, but a run that produced nothing
     * has nothing to email about — `skipWhenNothingHappened` suppresses it. Without
     * this, a run that failed for a real reason is indistinguishable from a quiet one.
     */
    const notifyRunFailed = (reason: string): void => {
      if (!apply || !userId) return;
      createNotification({
        userId,
        type: 'shroom_failed',
        title: `"${instructionCard.title}" couldn't finish`,
        body: reason,
        data: { channelId: channel.id, instructionCardId: instructionCard.id },
      }).catch(() => {});
    };

    const columnName = (columnId: string): string =>
      channel.columns.find((c) => c.id === columnId)?.name ?? 'another column';

    // Get authenticated LLM client. A shroom can name its own model; it's honoured only
    // when a key for that provider exists, otherwise the run falls back to the account
    // default rather than failing.
    const preferredModel = parseModelChoice(instructionCard.modelId) ?? undefined;
    let llm: LLMProvider;
    let recordUsageAfterSuccess: () => Promise<void>;

    if (isInternal) {
      // Cron path: resolve the channel owner's client directly. No session to check, and
      // usage is recorded against them since it's their shroom and their quota.
      if (!userId) {
        return NextResponse.json({ error: 'asUserId is required for internal runs' }, { status: 400 });
      }
      const internalLlm = await getLLMClientForUser(userId, preferredModel);
      if (!internalLlm.client) {
        return NextResponse.json(
          { error: internalLlm.error ?? 'No LLM configured for this user' },
          { status: 400 }
        );
      }
      llm = internalLlm.client;
      recordUsageAfterSuccess = async () => {
        await recordUsage(userId, 'run-instruction').catch(() => {});
      };
    } else {
      const authResult = await getAuthenticatedLLM('run-instruction', preferredModel);
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
      llm = authResult.context.llm;
      recordUsageAfterSuccess = authResult.context.recordUsageAfterSuccess;
    }

    const effectiveSystemInstructions = systemInstructions;

    // ==========================================
    // MULTI-STEP EXECUTION (unified single-prompt)
    // ==========================================
    if (instructionCard.steps && instructionCard.steps.length > 0) {
      const messages = buildMultiStepPrompt(instructionCard, channel, cards, tasks, effectiveSystemInstructions, members, scope);

      // Web research if the shroom's Web ability calls for it
      if (llm.webSearch && shouldResearchWeb(instructionCard)) {
        try {
          const searchQuery = baseSearchQuery(instructionCard);
          const webResult = await llm.webSearch(searchQuery, `Search the web and return detailed, factual information including real URLs. Return specific URLs, titles, and descriptions.`);
          if (webResult.content) {
            const userMsg = messages[messages.length - 1];
            let verifiedUrlSection = '';
            if (webResult.webSearchResults && webResult.webSearchResults.length > 0) {
              const urlList = webResult.webSearchResults.map((r) => `- ${r.title}: ${r.url}`).join('\n');
              verifiedUrlSection = `\n\n### Verified URLs (use ONLY these)\n${urlList}`;
            }
            userMsg.content = (userMsg.content as string) + `\n\n## Web Research (real data from the internet)\nIMPORTANT: Use ONLY the verified URLs listed below. Do NOT invent or hallucinate any URLs. If no verified URLs are listed, do not include any URLs.\n\n${webResult.content}${verifiedUrlSection}`;
          }
        } catch (e) { console.warn('Web search failed:', e); }
      }

      // Multi-step can generate cards, so it needs the same rejection history
      appendRejectionContext(messages, await resolveRejections());

      try {
        const { response, parsed: multiStepResult } = await completeWithEscalation(
          llm,
          messages,
          parseMultiStepResponse,
          isMultiStepEmpty,
          instructionCard.title
        );

        if (response.truncated && isMultiStepEmpty(multiStepResult)) {
          notifyRunFailed(TRUNCATED_ERROR);
          return NextResponse.json({ action: 'multi-step', error: TRUNCATED_ERROR });
        }

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

        // Multi-step can generate cards too — route them through the same server-side
        // creation path so they land pending-review like any other generated card.
        let multiStepApplied: Awaited<ReturnType<typeof createShroomCards>> | undefined;
        const multiStepColumnId = allTargetColumnIds[0] || channel.columns[0]?.id;
        if (apply && userId && multiStepColumnId && multiStepResult.generatedCards.length > 0) {
          multiStepApplied = await createShroomCards({
            channelId: channel.id,
            columnId: multiStepColumnId,
            generatedCards: multiStepResult.generatedCards,
            instructionCardId: instructionCard.id,
            autoApprove: !!instructionCard.autoApprove,
            validMemberIds: members?.map((m) => m.id),
          });
        }

        // Same appended-note contract as the single-step modify path, so a multi-step
        // shroom can't reproduce a card onto itself either.
        for (const modified of multiStepResult.modifiedCards) {
          const source = cards[modified.id];
          if (source && modified.content) {
            modified.content = stripEchoedContent(modified.content, cardContentStrings(source));
          }
        }

        // Edits before relocations — a card should be updated in the column it was
        // judged in, then moved.
        if (apply && multiStepResult.modifiedCards.length > 0) {
          await applyShroomModifications({
            channelId: channel.id,
            instructionCardId: instructionCard.id,
            modifications: multiStepResult.modifiedCards,
            validMemberIds: members?.map((m) => m.id),
          });
        }
        if (apply && multiStepResult.movedCards.length > 0) {
          await applyShroomMoves({
            channelId: channel.id,
            instructionCardId: instructionCard.id,
            moves: multiStepResult.movedCards,
          });
        }

        await maybeSendRunEmail({
          action: instructionCard.action,
          created: multiStepResult.generatedCards.map((c, i) => ({
            title: c.title,
            body: c.initialMessage,
            cardId: multiStepApplied?.created[i]?.id,
          })),
          createdArePending: multiStepApplied?.pending ?? !instructionCard.autoApprove,
          modified: multiStepResult.modifiedCards.map((c) => ({
            title: c.title,
            body: c.content,
            cardId: c.id,
          })),
          moved: multiStepResult.movedCards.map((m) => ({
            title: cards[m.cardId]?.title ?? 'A card',
            toColumn: columnName(m.destinationColumnId),
            cardId: m.cardId,
          })),
        });

        return NextResponse.json({
          action: 'multi-step',
          targetColumnIds: allTargetColumnIds,
          modifiedCards: multiStepResult.modifiedCards.length > 0 ? multiStepResult.modifiedCards : undefined,
          movedCards: multiStepResult.movedCards.length > 0 ? multiStepResult.movedCards : undefined,
          generatedCards: multiStepResult.generatedCards.length > 0 ? multiStepResult.generatedCards : undefined,
          applied: multiStepApplied
            ? { runId: multiStepApplied.runId, columnId: multiStepColumnId, pending: multiStepApplied.pending, cardIds: multiStepApplied.created.map((c) => c.id) }
            : undefined,
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
        scope
      );

      // Web research: when the shroom's Web ability is on (explicitly, or inferred from
      // the instructions), search first so the AI has factual data to work with
      if (llm.webSearch && shouldResearchWeb(instructionCard)) {
        try {
          const instructionLower = (instructionCard.webAccess?.focus || instructionCard.instructions || '').toLowerCase();

          // Detect content type for focused searching
          let contentType = '';
          if (instructionLower.includes('youtube') || instructionLower.includes('video')) contentType = 'YouTube video';
          else if (instructionLower.includes('article') || instructionLower.includes('blog')) contentType = 'article';
          else if (instructionLower.includes('podcast')) contentType = 'podcast';

          // Extract topics from context columns (other cards on the board)
          const topicTitles: string[] = [];
          for (const column of channel.columns) {
            for (const cardId of column.cardIds) {
              const card = cards[cardId];
              if (card) topicTitles.push(card.title);
            }
          }

          // Build search queries — per-topic if we have topics + content type
          const searchQueries: string[] = [];
          if (topicTitles.length > 0 && contentType) {
            for (const topic of topicTitles.slice(0, 4)) {
              searchQueries.push(`best ${contentType} ${topic} 2025`);
            }
          } else {
            searchQueries.push(baseSearchQuery(instructionCard));
          }

          const searchSystemPrompt = contentType.includes('YouTube')
            ? `Find real ${contentType}s about this topic. Return ONLY actual YouTube video URLs (youtube.com/watch?v=...) with exact video titles. Focus on highly-rated, recent, educational content.`
            : `Search the web and return detailed, factual information including real URLs. The user needs real links and data for a Kanban board called "${channel.name}". Return specific URLs, titles, and descriptions.`;

          // Run searches in parallel
          const searchPromises = searchQueries.map(query =>
            llm.webSearch!(query, searchSystemPrompt).catch(err => {
              console.warn(`Web search failed for "${query}":`, err);
              return null;
            })
          );
          const searchResults = await Promise.all(searchPromises);

          // Aggregate results
          const allContent: string[] = [];
          const allVerifiedUrls: { url: string; title: string; topic: string }[] = [];
          const seenUrls = new Set<string>();

          for (let i = 0; i < searchResults.length; i++) {
            const result = searchResults[i];
            if (!result) continue;
            const topic = topicTitles[i] || searchQueries[i];
            if (result.content) allContent.push(`### Results for: ${topic}\n${result.content}`);
            if (result.webSearchResults) {
              for (const r of result.webSearchResults) {
                if (r.url && !seenUrls.has(r.url)) {
                  seenUrls.add(r.url);
                  allVerifiedUrls.push({ url: r.url, title: r.title || '', topic });
                }
              }
            }
          }

          if (allContent.length > 0 || allVerifiedUrls.length > 0) {
            const userMsg = messages[messages.length - 1];
            const currentContent = userMsg.content as string;
            let verifiedUrlSection = '';
            if (allVerifiedUrls.length > 0) {
              const urlList = allVerifiedUrls.map(r => `- [${r.topic}] ${r.title}: ${r.url}`).join('\n');
              verifiedUrlSection = `\n\n### Verified URLs (use ONLY these — grouped by topic)\n${urlList}`;
            }
            userMsg.content = currentContent + `\n\n## Web Research (real data from the internet)\nCRITICAL: You may ONLY use URLs from the "Verified URLs" list below. Do NOT invent, guess, or fabricate ANY URLs. If a topic has no verified URL, say "no link found" — do NOT make one up.\n\n${allContent.join('\n\n')}${verifiedUrlSection}`;
          }
        } catch (e) {
          console.warn('Web search failed, proceeding without:', e);
        }
      }

      // Append rejection context so the shroom learns what not to generate
      appendRejectionContext(messages, await resolveRejections());

      debug.systemPrompt = messages[0].content as string;
      debug.userPrompt = messages[1].content as string;

      try {
        const { response, parsed: generatedCards } = await completeWithEscalation(
          llm,
          messages,
          parseGenerateResponse,
          (cards) => cards.length === 0,
          instructionCard.title
        );
        debug.rawResponse = response.content;

        if (response.truncated && generatedCards.length === 0) {
          notifyRunFailed(TRUNCATED_ERROR);
          return NextResponse.json({
            action: 'generate',
            targetColumnIds,
            generatedCards: [],
            error: TRUNCATED_ERROR,
            debug,
          });
        }

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

        const cardsToCreate = generatedCards.slice(0, instructionCard.cardCount ?? 5);
        const targetColumnId = targetColumnIds[0] || channel.columns[0]?.id;

        // When applying, write the cards here so they're born pending-review — see
        // lib/shrooms/apply.ts for why creation can't happen on the client.
        let applied: Awaited<ReturnType<typeof createShroomCards>> | undefined;
        if (apply && userId && targetColumnId) {
          applied = await createShroomCards({
            channelId: channel.id,
            columnId: targetColumnId,
            generatedCards: cardsToCreate,
            instructionCardId: instructionCard.id,
            autoApprove: !!instructionCard.autoApprove,
            validMemberIds: members?.map((m) => m.id),
          });
        }

        // Notify shroom completed
        if (userId) {
          const pending = applied?.pending ?? !instructionCard.autoApprove;
          createNotification({
            userId,
            type: 'shroom_completed',
            title: 'Shroom finished running',
            body: pending
              ? `"${instructionCard.title}" generated ${cardsToCreate.length} card(s) — tap to review`
              : `"${instructionCard.title}" added ${cardsToCreate.length} card(s)`,
            data: {
              channelId: channel.id,
              instructionCardId: instructionCard.id,
              columnId: targetColumnId,
              reviewRunId: applied?.runId,
            },
          }).catch(() => {});
        }

        await maybeSendRunEmail({
          action: 'generate',
          created: cardsToCreate.map((c, i) => ({
            title: c.title,
            body: c.initialMessage,
            // Ids only exist once the rows are written, in the same order
            cardId: applied?.created[i]?.id,
          })),
          createdArePending: applied?.pending ?? !instructionCard.autoApprove,
        });

        return NextResponse.json({
          action: 'generate',
          targetColumnIds,
          generatedCards: cardsToCreate,
          applied: applied
            ? { runId: applied.runId, columnId: targetColumnId, pending: applied.pending, cardIds: applied.created.map((c) => c.id) }
            : undefined,
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

      // Resolve the candidate card set: a single triggering card, an explicit
      // cardIds scope (card menu / multi-select / "run only unprocessed"), or
      // every card in the target columns.
      const candidateIds: string[] = triggeringCardId && cards[triggeringCardId]
        ? [triggeringCardId]
        : cardIds?.length
          ? cardIds
          : targetColumnIds.flatMap(
              (columnId) => channel.columns.find((c) => c.id === columnId)?.cardIds ?? []
            );

      for (const cardId of candidateIds) {
        const card = cards[cardId];
        if (!card) continue;
        // Check if already processed by this instruction
        if (skipAlreadyProcessed && card.processedByInstructions?.[instructionCard.id]) {
          skippedCardIds.push(card.id);
        } else {
          cardsToModify.push(card);
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

      const { messages, cardIdMap } = buildModifyPrompt(
        instructionCard,
        channel,
        cardsToModify,
        tasks,
        contextColumnIds,
        cards,
        effectiveSystemInstructions,
        members,
        // Cards already processed by this shroom were filtered out above, so the scope
        // the model is told about is the one it actually receives.
        { ...scope, cardIds: cardsToModify.map((c) => c.id) }
      );

      // Web research for modify: run targeted per-topic searches using card context
      if (llm.webSearch && shouldResearchWeb(instructionCard)) {
        try {
          const instructionLower = (instructionCard.webAccess?.focus || instructionCard.instructions || '').toLowerCase();

          // Detect the content type the user wants
          let contentType = '';
          if (instructionLower.includes('youtube') || instructionLower.includes('video')) contentType = 'YouTube video';
          else if (instructionLower.includes('article') || instructionLower.includes('blog')) contentType = 'article';
          else if (instructionLower.includes('podcast')) contentType = 'podcast';
          else if (instructionLower.includes('tutorial')) contentType = 'tutorial';

          // Extract topics from context columns (cards NOT being modified)
          // These are the actual subjects to search for
          const modifyCardIdSet = new Set(cardsToModify.map(c => c.id));
          const topicTitles: string[] = [];
          for (const column of channel.columns) {
            for (const cardId of column.cardIds) {
              const card = cards[cardId];
              if (card && !modifyCardIdSet.has(card.id)) {
                topicTitles.push(card.title);
              }
            }
          }

          // Build targeted search queries per topic (cap at 5 to control cost)
          const searchQueries: string[] = [];
          const topics = topicTitles.slice(0, 5);
          if (topics.length > 0 && contentType) {
            for (const topic of topics) {
              searchQueries.push(`best ${contentType} ${topic} 2025`);
            }
          } else if (topics.length > 0) {
            // Batch topics into 1-2 searches
            const mid = Math.ceil(topics.length / 2);
            searchQueries.push(topics.slice(0, mid).join(', '));
            if (topics.length > mid) {
              searchQueries.push(topics.slice(mid).join(', '));
            }
          } else {
            // No topic cards found — fall back to the shroom's own focus/instructions
            searchQueries.push(baseSearchQuery(instructionCard));
          }

          // Run all searches in parallel (cap at 5)
          const searchPromises = searchQueries.slice(0, 5).map(query =>
            llm.webSearch!(
              query,
              contentType.includes('YouTube')
                ? `Find real ${contentType}s about this topic. Return ONLY actual YouTube video URLs (youtube.com/watch?v=...) with exact video titles. Focus on highly-rated, recent, educational content.`
                : `Search the web and return detailed, factual information with real URLs. Return specific URLs, titles, and descriptions.`
            ).catch(err => {
              console.warn(`Web search failed for "${query}":`, err);
              return null;
            })
          );

          const searchResults = await Promise.all(searchPromises);

          // Aggregate all verified URLs and content from all searches
          const allContent: string[] = [];
          const allVerifiedUrls: { url: string; title: string; topic: string }[] = [];
          const seenUrls = new Set<string>();

          for (let i = 0; i < searchResults.length; i++) {
            const result = searchResults[i];
            if (!result) continue;
            const topic = topics[i] || searchQueries[i];

            if (result.content) {
              allContent.push(`### Results for: ${topic}\n${result.content}`);
            }
            if (result.webSearchResults) {
              for (const r of result.webSearchResults) {
                if (r.url && !seenUrls.has(r.url)) {
                  seenUrls.add(r.url);
                  allVerifiedUrls.push({ url: r.url, title: r.title || '', topic });
                }
              }
            }
          }

          if (allContent.length > 0 || allVerifiedUrls.length > 0) {
            const userMsg = messages[messages.length - 1];
            const currentContent = userMsg.content as string;

            let verifiedUrlSection = '';
            if (allVerifiedUrls.length > 0) {
              const urlList = allVerifiedUrls
                .map(r => `- [${r.topic}] ${r.title}: ${r.url}`)
                .join('\n');
              verifiedUrlSection = `\n\n### Verified URLs (use ONLY these — grouped by topic)\n${urlList}`;
            }

            userMsg.content = currentContent + `\n\n## Web Research (real data from the internet)\nCRITICAL: You may ONLY use URLs from the "Verified URLs" list below. Do NOT invent, guess, or fabricate ANY URLs. If a topic has no verified URL, say "no link found" for that topic — do NOT make one up.\n\n${allContent.join('\n\n')}${verifiedUrlSection}`;
          }
        } catch (e) {
          console.warn('Web search failed, proceeding without:', e);
        }
      }

      // Modify writes card content too, so the same rejection history applies
      appendRejectionContext(messages, await resolveRejections());

      debug.systemPrompt = messages[0].content as string;
      debug.userPrompt = messages[1].content as string;

      try {
        const { response, parsed: modifiedCards } = await completeWithEscalation(
          llm,
          messages,
          parseModifyResponse,
          (cards) => cards.length === 0,
          instructionCard.title
        );
        debug.rawResponse = response.content;

        // A truncated response usually ends mid-string inside a card body, so the JSON
        // never parses and this looks like "the AI chose to change nothing" — which then
        // suppresses the run email as a quiet run. Fail loudly instead.
        if (response.truncated && modifiedCards.length === 0) {
          notifyRunFailed(TRUNCATED_ERROR);
          return NextResponse.json({
            action: 'modify',
            modifiedCards: [],
            skippedCardIds: skippedCardIds.length > 0 ? skippedCardIds : undefined,
            error: TRUNCATED_ERROR,
            debug,
          });
        }

        // Remap simple IDs (card_1, card_2) back to real card IDs
        // Also try title-based fallback matching for robustness
        const titleToIdMap = new Map(cardsToModify.map(c => [c.title.toLowerCase().trim(), c.id]));
        for (const modified of modifiedCards) {
          if (cardIdMap[modified.id]) {
            // Direct mapping from simple ID to real ID
            modified.id = cardIdMap[modified.id];
          } else if (!cardsToModify.some(c => c.id === modified.id)) {
            // ID doesn't match any real card — try title-based fallback
            const matchByTitle = titleToIdMap.get(modified.title.toLowerCase().trim());
            if (matchByTitle) {
              modified.id = matchByTitle;
            }
          }
        }

        // A note is appended, so anything the model copied from the card would appear on
        // it twice. Cut the echo before it reaches the card *or* the run email.
        for (const modified of modifiedCards) {
          const source = cardsToModify.find((c) => c.id === modified.id);
          if (source && modified.content) {
            modified.content = stripEchoedContent(modified.content, cardContentStrings(source));
          }
        }

        // Snapshot the markdown before it becomes HTML — the email composer renders
        // through a Markdown node, and handing it HTML would show tags as text.
        const modifiedMarkdown = new Map(
          modifiedCards.filter((c) => c.content).map((c) => [c.id, c.content as string])
        );

        // Convert markdown content to HTML for each modified card
        for (const modified of modifiedCards) {
          if (modified.content) {
            modified.content = markdownToHtml(modified.content);
          }
        }

        // Record usage after successful modification
        await recordUsageAfterSuccess();

        // Write the edits here rather than on the client, so a run means the same thing
        // whether a board was open to receive it or not.
        if (apply && modifiedCards.length > 0) {
          await applyShroomModifications({
            channelId: channel.id,
            instructionCardId: instructionCard.id,
            modifications: modifiedCards,
            validMemberIds: members?.map((m) => m.id),
          });
        }

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

        await maybeSendRunEmail({
          action: 'modify',
          modified: modifiedCards.map((c) => ({
            title: c.title,
            body: modifiedMarkdown.get(c.id),
            cardId: c.id,
          })),
        });

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
    } else if (instructionCard.action === 'build') {
      // BUILD action — turn a card into a working app.
      //
      // The card's own thread is the brief, which is what makes this composable with
      // the rest of a pipeline: every earlier shroom that wrote onto the card (a PM
      // adding requirements, a CTO adding a spec, a designer adding taste) has already
      // enriched the context this reads. Nothing needs to be passed between shrooms
      // explicitly — the card accumulates it.
      //
      // Runs the same generator as the interactive playground, so a shroom-built app
      // and a hand-built one are identical artifacts.
      const buildTargets: string[] = triggeringCardId && cards[triggeringCardId]
        ? [triggeringCardId]
        : cardIds?.length
          ? cardIds
          : targetColumnIds.flatMap(
              (columnId) => channel.columns.find((c) => c.id === columnId)?.cardIds ?? []
            );

      if (!userId) {
        return NextResponse.json({ error: 'A build needs a user to bill the generation to' }, { status: 400 });
      }

      // Building is minutes of model time per card, so a shroom pointed at a full
      // column can't be allowed to fan out unbounded.
      const MAX_BUILDS_PER_RUN = 3;
      const selected = buildTargets.slice(0, MAX_BUILDS_PER_RUN);

      const built: Array<{ cardId: string; title?: string; error?: string }> = [];
      for (const cardId of selected) {
        try {
          const result = await generatePlaygroundApp(
            {
              cardId,
              // The shroom's instructions are the standing brief; the card's thread
              // supplies everything else.
              prompt: instructionCard.instructions || 'Build an app from this card.',
            },
            { user: { id: userId } },
            // Nobody is watching an automated run, so it must never stop to ask.
            { skipPreflight: true }
          );
          const payload = await result.json();
          if (payload?.error) {
            built.push({ cardId, error: payload.error });
          } else {
            built.push({ cardId, title: payload?.snapshot?.title });
          }
        } catch (err) {
          built.push({ cardId, error: err instanceof Error ? err.message : 'Build failed' });
        }
      }

      const succeeded = built.filter((b) => !b.error);
      return NextResponse.json({
        action: 'build',
        builtCards: built,
        // runShroomServerSide reads this to decide whether anything happened.
        applied: { cardIds: succeeded.map((b) => b.cardId) },
        skippedCardIds: buildTargets.length > selected.length
          ? buildTargets.slice(MAX_BUILDS_PER_RUN)
          : undefined,
        debug,
      });
    } else if (instructionCard.action === 'report') {
      // REPORT action — observes and writes a single digest card, mutates nothing else
      const reportCards: Card[] = [];
      const seen = new Set<string>();
      for (const columnId of contextColumnIds.length > 0 ? contextColumnIds : targetColumnIds) {
        const column = channel.columns.find((c) => c.id === columnId);
        for (const cardId of column?.cardIds ?? []) {
          const card = cards[cardId];
          if (card && !seen.has(cardId)) {
            seen.add(cardId);
            reportCards.push(card);
          }
        }
      }

      const messages = buildReportPrompt(
        instructionCard,
        channel,
        reportCards,
        effectiveSystemInstructions,
        { ...scope, cardIds: reportCards.map((c) => c.id) }
      );

      // A report shroom with the Web ability on is a research mission: it goes and looks
      // something up, then writes what it found back to the board as a digest card.
      if (llm.webSearch && shouldResearchWeb(instructionCard)) {
        try {
          const findings = await researchWeb(
            llm,
            [baseSearchQuery(instructionCard)],
            `Search the web and return detailed, factual information with real URLs. The findings will be written up as a digest on a Kanban board called "${channel.name}". Return specific URLs, titles, and descriptions.`
          );
          const block = formatResearchBlock(findings);
          if (block) {
            const userMsg = messages[messages.length - 1];
            userMsg.content = (userMsg.content as string) + block;
          }
        } catch (e) {
          console.warn('Web search failed, proceeding without:', e);
        }
      }

      debug.systemPrompt = messages[0].content as string;
      debug.userPrompt = messages[1].content as string;

      try {
        const { response, parsed: report } = await completeWithEscalation(
          llm,
          messages,
          parseReportResponse,
          (r) => !r,
          instructionCard.title
        );
        debug.rawResponse = response.content;

        if (!report) {
          const cutOff = response.truncated;
          if (cutOff) notifyRunFailed(TRUNCATED_ERROR);
          return NextResponse.json({
            action: 'report',
            targetColumnIds,
            error: cutOff
              ? TRUNCATED_ERROR
              : 'Could not read the report back from the AI. Please try again.',
            debug,
          });
        }

        await recordUsageAfterSuccess();

        const reportColumnId = targetColumnIds[0] || channel.columns[0]?.id;
        let createdReport: { cardId: string; title: string } | undefined;
        if (apply && userId && reportColumnId) {
          createdReport = await createShroomReport({
            channelId: channel.id,
            columnId: reportColumnId,
            instructionCardId: instructionCard.id,
            instructionTitle: instructionCard.title,
            report,
          });
        }

        if (userId) {
          createNotification({
            userId,
            type: 'shroom_report',
            title: report.headline,
            body: report.highlights.length > 0
              ? report.highlights.map((h) => h.text).join(' · ').slice(0, 200)
              : `"${instructionCard.title}" had nothing to flag`,
            data: {
              channelId: channel.id,
              instructionCardId: instructionCard.id,
              cardId: createdReport?.cardId,
              columnId: reportColumnId,
            },
          }).catch(() => {});
        }

        await maybeSendRunEmail({
          action: 'report',
          report: {
            headline: report.headline,
            highlights: report.highlights.map((h) => h.text),
            summary: report.summary,
            cardId: createdReport?.cardId,
          },
        });

        return NextResponse.json({
          action: 'report',
          targetColumnIds,
          report,
          applied: createdReport
            ? { runId: createdReport.cardId, columnId: reportColumnId, pending: false, cardIds: [createdReport.cardId] }
            : undefined,
          debug,
        });
      } catch (llmError) {
        console.error('Report LLM error:', llmError);
        return NextResponse.json({
          action: 'report',
          targetColumnIds,
          error: `AI error: ${llmError instanceof Error ? llmError.message : 'Unknown error'}`,
          debug,
        });
      }
    } else {
      // MOVE action
      // If triggered by a specific card event, only analyze that card
      // Otherwise, get all cards in source columns (target columns are the source for move)
      const cardsToMove: Card[] = [];
      const skippedCardIds: string[] = [];

      // Same candidate resolution as modify: triggering card, explicit scope, or all.
      const candidateIds: string[] = triggeringCardId && cards[triggeringCardId]
        ? [triggeringCardId]
        : cardIds?.length
          ? cardIds
          : targetColumnIds.flatMap(
              (columnId) => channel.columns.find((c) => c.id === columnId)?.cardIds ?? []
            );

      for (const cardId of candidateIds) {
        const card = cards[cardId];
        if (!card) continue;
        if (skipAlreadyProcessed && card.processedByInstructions?.[instructionCard.id]) {
          skippedCardIds.push(card.id);
        } else {
          cardsToMove.push(card);
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
        effectiveSystemInstructions,
        { ...scope, cardIds: cardsToMove.map((c) => c.id) }
      );

      debug.systemPrompt = messages[0].content as string;
      debug.userPrompt = messages[1].content as string;

      try {
        const { response, parsed: moveDecisions } = await completeWithEscalation(
          llm,
          messages,
          parseMoveResponse,
          (moves) => moves.length === 0,
          instructionCard.title
        );
        debug.rawResponse = response.content;

        if (response.truncated && moveDecisions.length === 0) {
          notifyRunFailed(TRUNCATED_ERROR);
          return NextResponse.json({ action: 'move', movedCards: [], error: TRUNCATED_ERROR, debug });
        }

        // Record usage after successful move analysis
        await recordUsageAfterSuccess();

        if (apply && moveDecisions.length > 0) {
          await applyShroomMoves({
            channelId: channel.id,
            instructionCardId: instructionCard.id,
            moves: moveDecisions,
          });
        }

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

        await maybeSendRunEmail({
          action: 'move',
          moved: moveDecisions.map((m) => ({
            title: cardsToMove.find((c) => c.id === m.cardId)?.title ?? 'A card',
            toColumn: columnName(m.destinationColumnId),
            cardId: m.cardId,
          })),
        });

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
