export interface ChannelConfigShroom {
  title: string;
  instructions: string;
  action: 'generate' | 'modify' | 'move';
  targetColumnName: string;
  cardCount?: number;
}

export interface ChannelConfigColumn {
  name: string;
  description: string;
  isAiTarget?: boolean;
}

export interface ChannelConfig {
  name: string;
  description: string;
  instructions: string;
  columns: ChannelConfigColumn[];
  shrooms: ChannelConfigShroom[];
}

/**
 * Extract a [CHANNEL_CONFIG]...[/CHANNEL_CONFIG] block from AI response text.
 * Returns null if no valid config found.
 */
export function extractChannelConfig(response: string): ChannelConfig | null {
  const match = response.match(/\[CHANNEL_CONFIG\]([\s\S]*?)\[\/CHANNEL_CONFIG\]/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1].trim());

    // Validate required fields
    if (!parsed.name || !parsed.columns || !Array.isArray(parsed.columns) || parsed.columns.length === 0) {
      return null;
    }

    return {
      name: parsed.name,
      description: parsed.description || '',
      instructions: parsed.instructions || '',
      columns: parsed.columns.map((col: Record<string, unknown>) => ({
        name: String(col.name || ''),
        description: String(col.description || ''),
        isAiTarget: Boolean(col.isAiTarget),
      })),
      shrooms: Array.isArray(parsed.shrooms)
        ? parsed.shrooms
            .filter((s: Record<string, unknown>) => s.title && s.instructions && s.action && s.targetColumnName)
            .map((s: Record<string, unknown>) => ({
              title: String(s.title),
              instructions: String(s.instructions),
              action: s.action as 'generate' | 'modify' | 'move',
              targetColumnName: String(s.targetColumnName),
              cardCount: s.action === 'generate' ? (typeof s.cardCount === 'number' ? s.cardCount : 5) : undefined,
            }))
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * Strip the [CHANNEL_CONFIG] block from response text for display.
 */
export function cleanDisplayResponse(rawText: string): string {
  const cleaned = rawText
    .replace(/\[CHANNEL_CONFIG\][\s\S]*?\[\/CHANNEL_CONFIG\]/, '')
    .trim();
  return cleaned || "Here's what I've put together for your channel:";
}
