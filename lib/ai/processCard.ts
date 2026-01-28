import type { Card, Column, Channel, CardProperty } from '../types';
import { useSettingsStore } from '../settingsStore';

export interface SuggestedProperty {
  key: string;
  label: string;
  displayType: 'chip' | 'field';
  reason: string;
  color?: string;
}

export interface ProcessCardResult {
  success: boolean;
  properties: CardProperty[];
  suggestedProperties: SuggestedProperty[];
  error?: string;
  debug?: {
    systemPrompt: string;
    userPrompt: string;
    rawResponse: string;
  };
}

/**
 * Process a card using AI via server-side API route.
 * This is called when a card enters a column with a processing prompt.
 */
export async function processCard(
  card: Card,
  column: Column,
  channel: Channel,
  signal?: AbortSignal
): Promise<ProcessCardResult> {
  const { ai } = useSettingsStore.getState();

  if (!ai.apiKey) {
    return {
      success: false,
      properties: [],
      suggestedProperties: [],
      error: 'No API key configured. Please add your API key in Settings.',
    };
  }

  if (!column.processingPrompt) {
    return {
      success: false,
      properties: [],
      suggestedProperties: [],
      error: 'Column has no processing prompt configured.',
    };
  }

  try {
    const response = await fetch('/api/process-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card,
        column,
        channel,
        aiConfig: {
          provider: ai.provider,
          apiKey: ai.apiKey,
          model: ai.model || undefined,
        },
      }),
      signal,
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Process card API error:', error);
      return {
        success: false,
        properties: [],
        suggestedProperties: [],
        error: error.error || 'Failed to process card',
      };
    }

    const data = await response.json();
    return {
      success: true,
      properties: data.properties || [],
      suggestedProperties: data.suggestedProperties || [],
      debug: data.debug,
    };
  } catch (error) {
    // Don't log abort errors - they're expected when user cancels
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        properties: [],
        suggestedProperties: [],
        error: 'cancelled',
      };
    }
    console.error('Process card error:', error);
    return {
      success: false,
      properties: [],
      suggestedProperties: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
