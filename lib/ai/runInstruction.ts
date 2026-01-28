import type { Channel, Card, CardInput, InstructionCard, Task } from '../types';
import { useSettingsStore } from '../settingsStore';

export interface AIDebugInfo {
  systemPrompt: string;
  userPrompt: string;
  rawResponse: string;
}

export interface ModifiedCardProperty {
  key: string;
  value: string;
  displayType: 'chip' | 'field';
  color?: string;
}

export interface ModifiedCardTask {
  title: string;
  description?: string;
}

export interface RunInstructionResult {
  action: 'generate' | 'modify' | 'move';
  targetColumnIds: string[];
  generatedCards?: CardInput[];
  modifiedCards?: Array<{
    id: string;
    title: string;
    content?: string;
    tags?: string[];
    properties?: ModifiedCardProperty[];
    tasks?: ModifiedCardTask[];
  }>;
  movedCards?: Array<{ cardId: string; destinationColumnId: string; reason?: string }>;
  skippedCardIds?: string[];  // Cards skipped because they were already processed
  message?: string;
  error?: string;
  debug?: AIDebugInfo;
}

/**
 * Run an instruction card via server-side API route.
 */
export async function runInstruction(
  instructionCard: InstructionCard,
  channel: Channel,
  allCards: Record<string, Card> = {},
  allTasks: Record<string, Task> = {},
  signal?: AbortSignal,
  triggeringCardId?: string,
  skipAlreadyProcessed?: boolean
): Promise<RunInstructionResult> {
  // Get AI config from settings store
  const { ai } = useSettingsStore.getState();

  try {
    const response = await fetch('/api/run-instruction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instructionCard,
        channel,
        cards: allCards,
        tasks: allTasks,
        triggeringCardId,
        skipAlreadyProcessed,
        aiConfig: {
          provider: ai.provider,
          apiKey: ai.apiKey,
          model: ai.model || undefined,
          systemInstructions: ai.systemInstructions,
        },
      }),
      signal,
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Run instruction API error:', error);
      throw new Error(error.error || 'Failed to run instruction');
    }

    const data = await response.json();
    return data as RunInstructionResult;
  } catch (error) {
    // Don't log abort errors - they're expected when user cancels
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        action: instructionCard.action,
        targetColumnIds: [],
        error: 'cancelled',
      };
    }
    console.error('Run instruction error:', error);
    return {
      action: instructionCard.action,
      targetColumnIds: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
