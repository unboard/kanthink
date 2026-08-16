import { NextResponse } from 'next/server';
import { getLLMClientForUser, type LLMMessage } from '@/lib/ai/llm';
import { auth } from '@/lib/auth';
import { recordUsage } from '@/lib/usage';
import type { ShroomCapabilities, ShroomInputRequirements } from '@/lib/types';

interface ShroomConfigStep {
  action: 'generate' | 'modify' | 'move' | 'report';
  targetColumnName: string;
  description: string;
  cardCount?: number;
}

interface ShroomConfigEmail {
  enabled: boolean;
  brief: string;
  subjectHint?: string;
  skipWhenNothingHappened?: boolean;
}

interface ShroomConfig {
  title: string;
  instructions: string;
  action: 'generate' | 'modify' | 'move' | 'report';
  targetColumnName: string;
  cardCount?: number;
  steps?: ShroomConfigStep[];
  email?: ShroomConfigEmail;
  capabilities?: ShroomCapabilities;
  inputRequirements?: ShroomInputRequirements;
}

interface InstructionChatRequest {
  userMessage: string;
  isInitialGreeting?: boolean;
  mode?: 'create' | 'edit';
  context: {
    channelName: string;
    channelDescription: string;
    currentInstructions: string;
    columnNames: string[];
    existingShrooms: string[];
    existingShroomConfig?: ShroomConfig;
    conversationHistory: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>;
  };
}

function buildPrompt(
  userMessage: string,
  isInitialGreeting: boolean,
  mode: 'create' | 'edit',
  context: InstructionChatRequest['context']
): LLMMessage[] {
  const { channelName, channelDescription, currentInstructions, conversationHistory, columnNames, existingShrooms, existingShroomConfig } = context;

  const columnList = columnNames.length > 0 ? columnNames.join(', ') : 'No columns yet';
  const existingShroomList = existingShrooms.length > 0
    ? existingShrooms.map(s => `"${s}"`).join(', ')
    : 'None';

  const editContext = mode === 'edit' && existingShroomConfig
    ? `\n\nCurrent shroom being edited:
- Title: "${existingShroomConfig.title}"
- Action: ${existingShroomConfig.action}
- Instructions: "${existingShroomConfig.instructions}"
- Target column: "${existingShroomConfig.targetColumnName}"
${existingShroomConfig.cardCount ? `- Card count: ${existingShroomConfig.cardCount}` : ''}
${existingShroomConfig.email?.enabled
  ? `- Emails the owner after each run. Current brief: "${existingShroomConfig.email.brief}"`
  : '- Does not email after running'}`
    : '';

  const systemPrompt = `You are Kan, a helpful AI assistant for configuring "shrooms" — AI-powered automations for a Kanban board.

Channel context:
- Channel name: "${channelName}"
- Description: "${channelDescription || 'No description set'}"
- Channel instructions: ${currentInstructions ? `"${currentInstructions}"` : 'None set yet'}
- Available columns: ${columnList}
- Existing shrooms: ${existingShroomList}${editContext}

A shroom has these fields:
- **title**: A short, descriptive name (e.g., "Generate article ideas", "Review and promote best idea")
- **action**: The primary action — one of "generate" (create new cards), "modify" (update existing cards), "move" (move cards between columns), or "report" (read the board and write a single summary card, changing nothing else)
- **instructions**: Detailed instructions for the AI to follow when running this shroom. This is the core of the shroom — the AI reads these instructions and acts accordingly.
- **targetColumnName**: The shroom's DEFAULT SCOPE — the cards a run acts on when whoever runs it doesn't supply any. For "generate", new cards are also added here. For "move", this is where cards are found; the destination is decided per card and belongs in the instructions. Must be one of the available columns.
- **cardCount**: Number of cards to generate (only for generate action, typically 3-5)
- **capabilities**: What the shroom is allowed to do beyond writing a note — {"tasks": bool, "tags": bool, "properties": bool, "assignment": bool}. Always include it.
- **inputRequirements**: {"minCards": number, "reason": "..."} — the fewest cards a run needs to mean anything. Always include it.
- **email**: Optional. If set, the shroom emails the board owner after every run.

**Instructions must be scope-free.** Instructions say WHAT to do to a card. They must never say WHICH cards, because targetColumnName already records that — and a shroom gets run at scopes it was never written for: on one card from that card's thread, on a hand-picked selection, on a whole column overnight. Instructions saying "every card in Inbox" become a lie in three of those four cases.
- Write: "Expand the card into a PRD covering problem, audience, key features and success metrics."
- Not: "Write a PRD for all the cards in Inbox."
The one exception is a **move** destination ("...then move it to This Week"), which has nowhere else to live — the destination is chosen per card, so it is criteria, not configuration.

**Capabilities are permissions, not requests.** Set one true when the user's intent could reasonably call for it, false when it plainly could not. A shroom that summarises a card doesn't need properties. A shroom told to "break this down into steps I can work through" needs tasks — even though the word "task" never appears. Judge the intent, not the vocabulary. When unsure leave it true: an unused capability costs nothing, a missing one silently prevents the thing the user asked for.

**Input requirements** stop a shroom being run where it cannot make sense. Set minCards to:
- **1** for most modify/move shrooms — they transform whatever card they are handed.
- **2 or more** when the instructions compare, rank, or choose between cards ("pick the best", "find duplicates", "summarise the week"). One card cannot be ranked against itself.
- **0** for generate shrooms — they write new cards and need no input; a card handed to one is just a seed.
Write reason as a plain sentence the person will read when a run is refused: "Picks the strongest of several ideas, so it needs at least two cards to compare."

**The email field.** Shrooms can email the owner once a run finishes. This is off unless the user asks for it. What you save is a *brief* — a plain-English description of what the email should say and how — not a fixed template. Kan writes the actual email at send time from the brief plus what the run really did, so a quiet run and a busy one produce different emails.

- **enabled**: true when the user wants the email
- **brief**: what to cover, tone, length, what to lead with. Write this in the user's own terms, specific enough to act on. Good: "Summarise the new cards in one short paragraph, then bullet anything tagged urgent. Casual tone, under 150 words." Weak: "Send me a summary."
- **subjectHint**: optional steer on the subject line, only if the user expressed one
- **skipWhenNothingHappened**: default true — don't email when the run changed nothing. Set false only if the user explicitly wants an email every time.

Ask about email when the user's description implies being told about something ("let me know", "send me", "so I don't have to check", "every morning") — and otherwise only when the rest of the config is settled, as a brief one-line offer. Never ask about recipients: mail always goes to the board owner's own account email, and there is no way to send it elsewhere. If asked, say so plainly.

**Multi-step shrooms**: A single shroom can combine multiple actions in sequence. For example, a user might want to "review all cards in Ideas, add feedback as a note, then move the best one to This Week." This is a multi-step shroom. For these:
- Set the **action** to the primary/final action (e.g., "move" if the end goal is moving cards)
- Put **all steps** in the **instructions** field — the AI will follow them in order
- Include a "steps" array describing the sequence
- IMPORTANT: Each step's **targetColumnName** is the SOURCE column where the AI finds cards — NOT the destination. For a move step, set targetColumnName to the column cards are moved FROM. The move destination goes in the instructions.

Your approach:
${mode === 'create' ? `1. Ask what they'd like to automate — be concise and specific to their channel context (1-2 sentences)
2. Based on their response, ask 1-2 focused clarifying questions if needed
3. When you have enough context (usually after 1-3 exchanges), assemble the shroom config` : `1. Summarize the current shroom config and ask what they'd like to change
2. Based on their response, ask a clarifying question if needed
3. Present the updated config`}

When you're ready to propose a configuration, include it in your response using this exact format:

For a simple single-action shroom:
[SHROOM_CONFIG]
{"title": "...", "instructions": "...", "action": "generate|modify|move|report", "targetColumnName": "...", "cardCount": 5, "capabilities": {"tasks": true, "tags": true, "properties": false, "assignment": false}, "inputRequirements": {"minCards": 0}}
[/SHROOM_CONFIG]

For a shroom that emails the owner after it runs:
[SHROOM_CONFIG]
{"title": "Morning inbox digest", "instructions": "Summarise what has come in and flag anything that looks urgent or blocked.", "action": "report", "targetColumnName": "Inbox", "capabilities": {"tasks": false, "tags": false, "properties": false, "assignment": false}, "inputRequirements": {"minCards": 2, "reason": "Writes one digest across a set of cards, so a single card gives it nothing to summarise."}, "email": {"enabled": true, "brief": "Short morning summary of what landed overnight. Open with a one-line headline, then up to five bullets. Lead with anything urgent. Casual tone, under 150 words.", "skipWhenNothingHappened": true}}
[/SHROOM_CONFIG]

For a multi-step shroom (e.g., review cards in Ideas, add a note, then move the best to This Week):
[SHROOM_CONFIG]
{"title": "Review and promote best idea", "instructions": "Step 1: Review the cards and select the most compelling idea.\\nStep 2: Add a note to the selected card explaining why it stands out.\\nStep 3: Move that card to the This Week column.", "action": "move", "targetColumnName": "Ideas", "capabilities": {"tasks": false, "tags": false, "properties": false, "assignment": false}, "inputRequirements": {"minCards": 2, "reason": "Picks the strongest of several ideas, so it needs at least two cards to compare."}, "steps": [{"action": "modify", "targetColumnName": "Ideas", "description": "Review and add note to best card"}, {"action": "move", "targetColumnName": "Ideas", "description": "Move best card to This Week"}]}
[/SHROOM_CONFIG]
Note two things. Every step's targetColumnName is the SOURCE column (Ideas) — where cards are found — while the move destination (This Week) stays in the instructions, because it is chosen per card. And the instructions say "the cards", never "the cards in Ideas": the column is already in targetColumnName, and repeating it would break this shroom the moment someone ran it on a selection.

Important guidelines:
- Be conversational, warm, and concise
- Don't ask more than 2 questions per message
- 1-3 exchanges should be enough before proposing a config
- If the user gives a clear description, propose the config right away
- The targetColumnName must match one of the available column names exactly
- Never name a column inside instructions — targetColumnName carries it. The only exception is a move destination
- Always include capabilities and inputRequirements
- For "generate" action, always include cardCount (default 5)
- For "modify", "move" or "report" actions, don't include cardCount
- For "report", targetColumnName is the column to read and summarise
- Only include the "email" object when the user actually wants an email — omit it otherwise
- Don't duplicate existing shrooms — suggest variations if similar ones exist
- Keep instructions specific and actionable
- When proposing, also include a brief conversational message explaining what it does
- If the user describes something that involves multiple steps (e.g., review then move, modify then reorganize), create a multi-step shroom with clear sequential instructions
- Give a helpful nudge based on the channel context to help users articulate what they want`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Add conversation history
  for (const msg of conversationHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Add the current message (or initial greeting request)
  if (isInitialGreeting) {
    if (mode === 'edit' && existingShroomConfig) {
      messages.push({
        role: 'user',
        content: `I want to edit my existing shroom "${existingShroomConfig.title}". Summarize what it currently does and ask what I'd like to change. Be brief.`,
      });
    } else {
      messages.push({
        role: 'user',
        content: `I'm creating a new shroom for my "${channelName}" channel. Based on the channel context, give me a brief greeting and a helpful nudge — maybe suggest a direction based on what this channel seems to be about, or ask what I'd like to automate. Don't introduce yourself or explain what shrooms are — I already know. Keep it to 2-3 sentences.`,
      });
    }
  } else {
    messages.push({ role: 'user', content: userMessage });
  }

  return messages;
}

function extractInstructions(response: string): string | null {
  const match = response.match(/\[INSTRUCTIONS\]([\s\S]*?)\[\/INSTRUCTIONS\]/);
  if (match) {
    return match[1].trim();
  }
  return null;
}

/**
 * An email with no brief has nothing to compose from, so treat it as absent rather
 * than saving a shroom that would silently fail to send.
 */
function parseEmail(raw: unknown): ShroomConfigEmail | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const e = raw as Record<string, unknown>;
  const brief = typeof e.brief === 'string' ? e.brief.trim() : '';
  if (!brief) return undefined;

  return {
    enabled: e.enabled !== false,
    brief,
    subjectHint: typeof e.subjectHint === 'string' && e.subjectHint.trim() ? e.subjectHint.trim() : undefined,
    skipWhenNothingHappened: e.skipWhenNothingHappened !== false,
  };
}

/**
 * Capabilities from the model, or undefined.
 *
 * Undefined means unrestricted downstream, which is the right reading of "the model
 * didn't say" — a permission nobody narrowed shouldn't narrow itself. Only a well-formed
 * object counts, so a half-filled one can't quietly switch three things off.
 */
function parseCapabilities(raw: unknown): ShroomCapabilities | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Record<string, unknown>;
  const keys = ['tasks', 'tags', 'properties', 'assignment'] as const;
  if (!keys.every((k) => typeof c[k] === 'boolean')) return undefined;
  return { tasks: !!c.tasks, tags: !!c.tags, properties: !!c.properties, assignment: !!c.assignment };
}

function parseInputRequirements(raw: unknown): ShroomInputRequirements | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.minCards !== 'number' || !Number.isFinite(r.minCards) || r.minCards < 0) {
    return undefined;
  }
  const reason = typeof r.reason === 'string' ? r.reason.trim() : '';
  return { minCards: Math.floor(r.minCards), reason: reason || undefined };
}

function extractShroomConfig(response: string): ShroomConfig | null {
  const match = response.match(/\[SHROOM_CONFIG\]([\s\S]*?)\[\/SHROOM_CONFIG\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1].trim());
      // Validate required fields
      if (parsed.title && parsed.instructions && parsed.action && parsed.targetColumnName) {
        return {
          title: parsed.title,
          instructions: parsed.instructions,
          action: parsed.action,
          targetColumnName: parsed.targetColumnName,
          cardCount: parsed.action === 'generate' ? (parsed.cardCount ?? 5) : undefined,
          steps: Array.isArray(parsed.steps) ? parsed.steps : undefined,
          email: parseEmail(parsed.email),
          capabilities: parseCapabilities(parsed.capabilities),
          inputRequirements: parseInputRequirements(parsed.inputRequirements),
        };
      }
    } catch {
      // Invalid JSON — fall through
    }
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const body: InstructionChatRequest = await request.json();
    const { userMessage, isInitialGreeting, mode = 'create', context } = body;

    // Validate required fields
    if (!context) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!isInitialGreeting && !userMessage) {
      return NextResponse.json(
        { error: 'Missing user message' },
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
    const messages = buildPrompt(userMessage || '', isInitialGreeting ?? false, mode, context);

    try {
      const response = await llm.complete(messages);
      const responseText = response.content;

      if (userId && usingOwnerKey) {
        await recordUsage(userId, 'instruction-chat');
      }

      // Check for structured shroom config first (new format)
      const shroomConfig = extractShroomConfig(responseText);

      // Fall back to legacy instructions format
      const draftInstructions = !shroomConfig ? extractInstructions(responseText) : null;

      // Clean the response text (remove config/instruction tags for display)
      let displayResponse = responseText;
      if (shroomConfig) {
        displayResponse = responseText
          .replace(/\[SHROOM_CONFIG\][\s\S]*?\[\/SHROOM_CONFIG\]/, '')
          .trim();
        if (!displayResponse) {
          displayResponse = "Here's what I've put together:";
        }
      } else if (draftInstructions) {
        displayResponse = responseText
          .replace(/\[INSTRUCTIONS\][\s\S]*?\[\/INSTRUCTIONS\]/, '')
          .trim();
        if (!displayResponse) {
          displayResponse = "Here are the instructions I've drafted based on our conversation:";
        }
      }

      return NextResponse.json({
        success: true,
        response: displayResponse,
        draftInstructions,
        shroomConfig,
      });
    } catch (llmError) {
      console.error('LLM error:', llmError);
      return NextResponse.json(
        { error: `LLM error: ${llmError instanceof Error ? llmError.message : 'Unknown error'}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Instruction chat error:', error);
    return NextResponse.json(
      { error: 'Failed to get AI response' },
      { status: 500 }
    );
  }
}
