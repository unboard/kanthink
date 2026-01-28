import type { Channel, Card, CardInput } from '../types';
import { useSettingsStore } from '../settingsStore';

export interface AIDebugInfo {
  systemPrompt: string;
  userPrompt: string;
  rawResponse: string;
}

export interface GenerateCardsResult {
  cards: CardInput[];
  debug?: AIDebugInfo;
}

/**
 * Generate cards using AI via server-side API route.
 * API key is sent to our server, which makes the LLM call.
 * Browser never makes direct requests to OpenAI/Anthropic.
 */
export async function generateCards(
  channel: Channel,
  count: number = 5,
  allCards: Record<string, Card> = {},
  targetColumnId?: string,
  signal?: AbortSignal
): Promise<GenerateCardsResult> {
  // Get AI config from settings store
  const { ai } = useSettingsStore.getState();

  try {
    const response = await fetch('/api/generate-cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel,
        count,
        cards: allCards,
        targetColumnId,
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
      console.error('Generate cards API error:', error);
      throw new Error(error.error || 'Failed to generate cards');
    }

    const data = await response.json();
    return {
      cards: data.cards || [],
      debug: data.debug,
    };
  } catch (error) {
    // Don't log abort errors - they're expected when user cancels
    if (error instanceof Error && error.name === 'AbortError') {
      return { cards: [] };
    }
    console.error('Generate cards error:', error);
    // Return empty result on error - let the UI handle it
    return { cards: [] };
  }
}
