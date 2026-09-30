/**
 * The shape every channel-creation path produces: Ask Kan in the new-channel overlay,
 * the home chat, and voice. One shape and one normaliser, so a channel comes out the
 * same whichever way it was asked for.
 */

export type ChannelShroomAction = 'generate' | 'modify' | 'move' | 'build';

export interface ChannelConfigShroom {
  title: string;
  instructions: string;
  action: ChannelShroomAction;
  targetColumnName: string;
  cardCount?: number;
  /** Run whenever a card lands in the target column — a stage in a pipeline. */
  triggerOnArrival?: boolean;
}

export interface ChannelConfigColumn {
  name: string;
  /** What belongs in this column. Stored as the column's instructions. */
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

const ACTIONS: ChannelShroomAction[] = ['generate', 'modify', 'move', 'build'];
const DEFAULT_CARD_COUNT = 5;
const MAX_CARD_COUNT = 20;
const MAX_COLUMNS = 8;

/**
 * Turn whatever a model answered into a config the app can create, or null.
 *
 * Lenient about shape and strict about sense: a shroom aimed at a column that doesn't
 * exist is re-aimed at the first column rather than dropped, since the rest of it is
 * usually right; a shroom with no instructions is dropped, since a shroom with no
 * instructions does nothing.
 */
export function normalizeChannelConfig(raw: unknown): ChannelConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = raw as Record<string, unknown>;
  const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
  if (!name || !Array.isArray(parsed.columns)) return null;

  const seen = new Set<string>();
  const columns: ChannelConfigColumn[] = [];
  for (const col of parsed.columns as Record<string, unknown>[]) {
    const colName = String(col?.name ?? '').trim();
    if (!colName || seen.has(colName.toLowerCase())) continue;
    seen.add(colName.toLowerCase());
    columns.push({
      name: colName,
      description: String(col.description ?? col.instructions ?? '').trim(),
      isAiTarget: Boolean(col.isAiTarget),
    });
    if (columns.length === MAX_COLUMNS) break;
  }
  if (columns.length === 0) return null;
  if (!columns.some((c) => c.isAiTarget)) columns[0].isAiTarget = true;

  const columnByName = new Map(columns.map((c) => [c.name.toLowerCase(), c.name]));
  const shrooms: ChannelConfigShroom[] = Array.isArray(parsed.shrooms)
    ? (parsed.shrooms as Record<string, unknown>[])
        .filter((s) => s && s.title && s.instructions && ACTIONS.includes(s.action as ChannelShroomAction))
        .map((s) => {
          const action = s.action as ChannelShroomAction;
          const target = columnByName.get(String(s.targetColumnName ?? '').trim().toLowerCase()) ?? columns[0].name;
          const count = Number(s.cardCount);
          return {
            title: String(s.title).trim(),
            instructions: String(s.instructions).trim(),
            action,
            targetColumnName: target,
            cardCount: action === 'generate'
              ? Number.isFinite(count) && count >= 1 ? Math.min(MAX_CARD_COUNT, Math.round(count)) : DEFAULT_CARD_COUNT
              : undefined,
            triggerOnArrival: action !== 'generate' && s.triggerOnArrival === true ? true : undefined,
          };
        })
    : [];

  return {
    name,
    description: String(parsed.description ?? '').trim(),
    instructions: String(parsed.instructions ?? '').trim(),
    columns,
    shrooms,
  };
}

/**
 * Pull the first JSON object out of a model answer — bare, fenced, or with prose
 * around it.
 */
export function parseChannelConfigJson(text: string): ChannelConfig | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return normalizeChannelConfig(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return null;
  }
}

/**
 * Extract a [CHANNEL_CONFIG]...[/CHANNEL_CONFIG] block from AI response text.
 * Returns null if no valid config found.
 */
export function extractChannelConfig(response: string): ChannelConfig | null {
  const match = response.match(/\[CHANNEL_CONFIG\]([\s\S]*?)\[\/CHANNEL_CONFIG\]/);
  if (!match) return null;
  return parseChannelConfigJson(match[1]);
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
