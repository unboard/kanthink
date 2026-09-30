/**
 * Design a channel from what someone said they want, in one model call.
 *
 * Home chat and voice used to build channels from keyword templates: the words in the
 * request picked one of four intents, and the intent picked canned columns, canned
 * instructions and canned shrooms. A long, specific brief came out as the same channel
 * a one-word one did — and any request with "ideas" in it became the six-column app
 * assembly line. The model now reads the whole brief against the same design rules
 * Ask Kan uses. The templates are kept only as the fallback when no model answers.
 */

import type { LLMProvider } from '@/lib/ai/llm';
import { inferIntent } from './inferIntent';
import {
  getWorkflowSuggestions,
  getShroomsForIntent,
  suggestChannelDescription,
  getChannelInstructions,
} from './generateShrooms';
import { CHANNEL_DESIGN_RULES, CHANNEL_CONFIG_EXAMPLE } from './designRules';
import { parseChannelConfigJson, type ChannelConfig } from './extractChannelConfig';
import { DEFAULT_COLUMN_NAMES } from '@/lib/constants';

export interface ChannelBrief {
  /** What the person said they want, as fully as they said it. */
  brief: string;
  /** A name they gave, if any. Kept as given. */
  name?: string;
  /** Columns they named, if any. Kept as given, in order. */
  columnNames?: string[];
  existingChannelNames?: string[];
}

/**
 * A detailed config — a rubric in the instructions, complete shroom briefs — is a few
 * thousand tokens, and a reasoning model spends its thinking from the same allowance.
 * The provider default of 4096 cut those off mid-JSON.
 */
const DESIGN_MAX_TOKENS = 16000;

export async function designChannel(llm: LLMProvider, input: ChannelBrief): Promise<ChannelConfig | null> {
  const constraints: string[] = [];
  if (input.name) constraints.push(`Name the channel exactly "${input.name}".`);
  if (input.columnNames?.length) {
    constraints.push(`Use exactly these columns, in this order: ${input.columnNames.map((c) => `"${c}"`).join(', ')}.`);
  }
  if (input.existingChannelNames?.length) {
    constraints.push(`Channels they already have: ${input.existingChannelNames.map((n) => `"${n}"`).join(', ')}.`);
  }

  const response = await llm.complete(
    [
      {
        role: 'system',
        content: `You design channels for Kanthink, a Kanban app where each channel is a goal-driven space and Kan, the AI, works inside it through automations called shrooms.

${CHANNEL_DESIGN_RULES}

Respond with only the JSON object, no prose:
${CHANNEL_CONFIG_EXAMPLE}`,
      },
      {
        role: 'user',
        content: `Design a channel from this request.\n\n${input.brief.trim()}${constraints.length ? `\n\n${constraints.join('\n')}` : ''}`,
      },
    ],
    { maxTokens: DESIGN_MAX_TOKENS }
  );

  const config = parseChannelConfigJson(response.content);
  if (!config) return null;
  return applyConstraints(config, input);
}

/** What the person stated outright wins over what the model chose. */
function applyConstraints(config: ChannelConfig, input: ChannelBrief): ChannelConfig {
  let next = config;
  if (input.name) next = { ...next, name: input.name };

  const requested = input.columnNames ?? [];
  const sameColumns = requested.length === next.columns.length
    && requested.every((name, i) => name.toLowerCase() === next.columns[i].name.toLowerCase());
  if (requested.length > 0 && !sameColumns) {
    const described = new Map(next.columns.map((c) => [c.name.toLowerCase(), c.description]));
    const columns = requested.map((name, i) => ({
      name,
      description: described.get(name.toLowerCase()) ?? '',
      isAiTarget: i === 0,
    }));
    const names = new Set(requested.map((n) => n.toLowerCase()));
    next = {
      ...next,
      columns,
      shrooms: next.shrooms.map((s) =>
        names.has(s.targetColumnName.toLowerCase()) ? s : { ...s, targetColumnName: requested[0] }
      ),
    };
  }
  return next;
}

/**
 * The channel the keyword templates would make — used only when no model is
 * available or its answer can't be read.
 */
export function fallbackChannelConfig(input: ChannelBrief): ChannelConfig {
  const name = input.name?.trim() || 'New Channel';
  const { intent } = inferIntent(`${name}. ${input.brief}`);

  // The app assembly line is first among the idea workflows, and it is a specific
  // thing — a build pipeline. Only offer it to someone who asked for apps.
  const wantsApps = /\b(apps?|prototypes?|build|playground)\b/i.test(input.brief);
  const workflow = getWorkflowSuggestions(intent)
    .find((w) => wantsApps || w.value !== 'app-assembly-line');
  const columnNames = input.columnNames?.length
    ? input.columnNames
    : workflow ? [...workflow.columns] : [...DEFAULT_COLUMN_NAMES];

  // The name, not the brief: templates read "…ideas about {topic}", and a whole
  // sentence dropped into that slot reads as nonsense.
  const topic = name;

  return {
    name,
    description: suggestChannelDescription(intent, topic),
    instructions: input.brief.trim() || getChannelInstructions(intent, topic),
    columns: columnNames.map((colName, i) => ({ name: colName, description: '', isAiTarget: i === 0 })),
    shrooms: getShroomsForIntent(intent, columnNames, topic)
      .filter((s) => s.targetColumnName === 'board' || columnNames.includes(s.targetColumnName))
      .map((s) => ({
        title: s.title,
        instructions: s.instructions,
        action: s.action,
        targetColumnName: s.targetColumnName === 'board' ? columnNames[0] : s.targetColumnName,
        cardCount: s.cardCount,
        triggerOnArrival: s.triggerOnArrival,
      })),
  };
}
