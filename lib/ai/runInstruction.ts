import type { Channel, Card, CardInput, InstructionCard, Task, ChannelMember, CardRejection } from '../types';
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
  assignedTo?: string[];
}

export interface RunInstructionResult {
  action: 'generate' | 'modify' | 'move' | 'multi-step';
  targetColumnIds: string[];
  generatedCards?: CardInput[];
  modifiedCards?: Array<{
    id: string;
    title: string;
    content?: string;
    tags?: string[];
    properties?: ModifiedCardProperty[];
    tasks?: ModifiedCardTask[];
    assignedTo?: string[];
  }>;
  movedCards?: Array<{ cardId: string; destinationColumnId: string; reason?: string }>;
  skippedCardIds?: string[];  // Cards skipped because they were already processed
  message?: string;
  error?: string;
  debug?: AIDebugInfo;
}

/**
 * Run an instruction card via server-side API route.
 * API keys are securely stored server-side and never sent from the client.
 */
export async function runInstruction(
  instructionCard: InstructionCard,
  channel: Channel,
  allCards: Record<string, Card> = {},
  allTasks: Record<string, Task> = {},
  signal?: AbortSignal,
  triggeringCardId?: string,
  skipAlreadyProcessed?: boolean,
  members?: ChannelMember[],
  rejections?: CardRejection[]
): Promise<RunInstructionResult> {
  // Get system instructions from settings store (no API key)
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
        systemInstructions: ai.systemInstructions,
        members: members?.map(m => ({
          id: m.id,
          name: m.name,
          role: m.role,
          roleDescription: m.roleDescription,
        })),
        rejections: rejections?.filter(r => r.channelId === channel.id).slice(-20),
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
