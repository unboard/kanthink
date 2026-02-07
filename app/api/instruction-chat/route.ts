import { NextResponse } from 'next/server';
import { getLLMClientForUser, type LLMMessage } from '@/lib/ai/llm';
import { auth } from '@/lib/auth';
import { recordUsage } from '@/lib/usage';

interface ShroomConfig {
  title: string;
  instructions: string;
  action: 'generate' | 'modify' | 'move';
  targetColumnName: string;
  cardCount?: number;
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

  const systemPrompt = `You are Kan, a friendly AI assistant helping users create and configure "shrooms" — AI-powered automations for a Kanban board. Your mascot is a mushroom character.

Channel context:
- Channel name: "${channelName}"
- Description: "${channelDescription || 'No description set'}"
- Channel instructions: ${currentInstructions ? `"${currentInstructions}"` : 'None set yet'}
- Available columns: ${columnList}
- Existing shrooms: ${existingShroomList}${editContext}

A shroom has these fields:
- **title**: A short, descriptive name (e.g., "Generate article ideas", "Tag by priority")
- **action**: One of "generate" (create new cards), "modify" (update existing cards), or "move" (move cards between columns)
- **instructions**: Detailed instructions for the AI to follow when running this shroom
- **targetColumnName**: Which column to add cards to (for generate) or which columns to read from (for modify/move). Must be one of the available columns.
- **cardCount**: Number of cards to generate (only for generate action, typically 3-5)

Your approach:
${mode === 'create' ? `1. Greet warmly and ask what kind of automation they want (1-2 sentences)
2. Based on their response, ask 1-2 focused clarifying questions if needed
3. When you have enough context (usually after 1-3 exchanges), assemble the shroom config` : `1. Summarize the current shroom config and ask what they'd like to change
2. Based on their response, ask a clarifying question if needed
3. Present the updated config`}

When you're ready to propose a shroom configuration, include it in your response using this exact format:
[SHROOM_CONFIG]
{"title": "...", "instructions": "...", "action": "generate|modify|move", "targetColumnName": "...", "cardCount": 5}
[/SHROOM_CONFIG]

Important guidelines:
- Be conversational, warm, and concise — you're Kan the mushroom!
- Don't ask more than 2 questions per message
- 1-3 exchanges should be enough before proposing a config
- If the user gives a clear description, propose the config right away
- The targetColumnName must match one of the available column names exactly
- For "generate" action, always include cardCount (default 5)
- For "modify" or "move" actions, don't include cardCount
- Don't duplicate existing shrooms — suggest variations if similar ones exist
- Keep instructions specific and actionable
- When proposing, also include a brief conversational message explaining the config`;

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
        content: `I want to edit my existing shroom "${existingShroomConfig.title}". Start by summarizing what it currently does and ask what I'd like to change. Keep it brief and friendly.`,
      });
    } else {
      messages.push({
        role: 'user',
        content: `Start the conversation by greeting me and asking about what kind of shroom (automation) I want to create for this "${channelName}" channel. Keep it brief and friendly.`,
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
          displayResponse = "Here's what I've put together based on our conversation:";
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
