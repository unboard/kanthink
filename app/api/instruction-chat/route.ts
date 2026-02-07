import { NextResponse } from 'next/server';
import { getLLMClientForUser, type LLMMessage } from '@/lib/ai/llm';
import { auth } from '@/lib/auth';
import { recordUsage } from '@/lib/usage';

interface ShroomConfigStep {
  action: 'generate' | 'modify' | 'move';
  targetColumnName: string;
  description: string;
  cardCount?: number;
}

interface ShroomConfig {
  title: string;
  instructions: string;
  action: 'generate' | 'modify' | 'move';
  targetColumnName: string;
  cardCount?: number;
  steps?: ShroomConfigStep[];
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
${existingShroomConfig.cardCount ? `- Card count: ${existingShroomConfig.cardCount}` : ''}`
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
- **action**: The primary action — one of "generate" (create new cards), "modify" (update existing cards), or "move" (move cards between columns)
- **instructions**: Detailed instructions for the AI to follow when running this shroom. This is the core of the shroom — the AI reads these instructions and acts accordingly.
- **targetColumnName**: Which column to add cards to (generate) or which columns to work with (modify/move). Must be one of the available columns.
- **cardCount**: Number of cards to generate (only for generate action, typically 3-5)

**Multi-step shrooms**: A single shroom can combine multiple actions in sequence. For example, a user might want to "review all cards in Ideas, add feedback as a note, then move the best one to This Week." This is a multi-step shroom. For these:
- Set the **action** to the primary/final action (e.g., "move" if the end goal is moving cards)
- Put **all steps** in the **instructions** field — the AI will follow them in order
- Optionally include a "steps" array to describe the sequence for the user's clarity

Your approach:
${mode === 'create' ? `1. Ask what they'd like to automate — be concise and specific to their channel context (1-2 sentences)
2. Based on their response, ask 1-2 focused clarifying questions if needed
3. When you have enough context (usually after 1-3 exchanges), assemble the shroom config` : `1. Summarize the current shroom config and ask what they'd like to change
2. Based on their response, ask a clarifying question if needed
3. Present the updated config`}

When you're ready to propose a configuration, include it in your response using this exact format:

For a simple single-action shroom:
[SHROOM_CONFIG]
{"title": "...", "instructions": "...", "action": "generate|modify|move", "targetColumnName": "...", "cardCount": 5}
[/SHROOM_CONFIG]

For a multi-step shroom:
[SHROOM_CONFIG]
{"title": "...", "instructions": "Step 1: Review all cards in [column]...\\nStep 2: Add a note...\\nStep 3: Move the best card to...", "action": "move", "targetColumnName": "...", "steps": [{"action": "modify", "targetColumnName": "...", "description": "Review and annotate cards"}, {"action": "move", "targetColumnName": "...", "description": "Move the best card"}]}
[/SHROOM_CONFIG]

Important guidelines:
- Be conversational, warm, and concise
- Don't ask more than 2 questions per message
- 1-3 exchanges should be enough before proposing a config
- If the user gives a clear description, propose the config right away
- The targetColumnName must match one of the available column names exactly
- For "generate" action, always include cardCount (default 5)
- For "modify" or "move" actions, don't include cardCount
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
