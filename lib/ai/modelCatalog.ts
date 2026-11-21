/**
 * Every model a user can pick, across the providers Kanthink can actually call.
 *
 * One list, because the same set is offered in several places that must not drift:
 * the account default, the per-area overrides in AI settings, and a shroom's own
 * model override.
 *
 * A choice is stored provider-qualified — `google:gemini-3.8-flash` — because a bare
 * model id doesn't say which client to build. `parseModelChoice` is the only thing
 * that should take that string apart.
 *
 * Prices are USD per 1M tokens at the standard tier, and are here to be shown to a
 * person choosing, not to bill anyone — the app builder does its own costing from
 * lib/playground/models. Gemini 3.x is on promotional pricing until 2026-12-31 and
 * doubles on 2027-01-01; where that applies it is noted on the model.
 *
 * OpenAI and Google lists refreshed 2026-11-21 (each id answered a live call); retired
 * ids keep working through parseModelChoice, which maps them to their successor.
 * Claude prices from
 * Anthropic's published rates on 2026-09-25.
 */

import { LEGACY_MODEL_IDS } from '@/lib/playground/models';

export type ModelProvider = 'openai' | 'google' | 'anthropic';

export interface CatalogModel {
  /** Raw provider model id, as sent to the API. */
  model: string;
  label: string;
  /** One line on what it is for. Shown next to the name when there is room. */
  blurb?: string;
  /** USD per 1M tokens, standard tier. */
  pricing?: { input: number; output: number };
  /** Not generally available — fine to pick, but it can be withdrawn. */
  isPreview?: boolean;
  /** Promotional pricing that is going to rise. */
  priceNote?: string;
}

export interface ProviderGroup {
  provider: ModelProvider;
  label: string;
  /** What the provider is called in the wild, for the group heading. */
  blurb: string;
  defaultModel: string;
  /** Where to get a key, for the empty state in settings. */
  keyUrl: string;
  models: CatalogModel[];
}

/** Gemini 3.x promotional pricing, which ends at the same moment for all of them. */
const GEMINI_PROMO = 'Promotional price until 31 Dec 2026, then double.';

export const MODEL_CATALOG: ProviderGroup[] = [
  {
    provider: 'openai',
    label: 'OpenAI',
    blurb: 'GPT models',
    // gpt-5 shuts down 2026-12-11. Terra is its successor and costs less, so moving
    // the default doesn't raise anyone's bill.
    defaultModel: 'gpt-6.1-terra',
    keyUrl: 'https://platform.openai.com/api-keys',
    models: [
      { model: 'gpt-6.2-astra', label: 'GPT-6.2 Astra', blurb: 'Most capable. The hardest end-to-end work.', pricing: { input: 8, output: 40 } },
      { model: 'gpt-6.2-sol', label: 'GPT-6.2 Sol', blurb: 'Everyday flagship for coding and agents.', pricing: { input: 2, output: 10 } },
      { model: 'gpt-6.1-terra', label: 'GPT-6.1 Terra', blurb: 'Balances intelligence and cost.', pricing: { input: 1, output: 5 } },
      { model: 'gpt-6-luna', label: 'GPT-6 Luna', blurb: 'Very cheap and quick. Good default for chat.', pricing: { input: 0.1, output: 0.5 } },
    ],
  },
  {
    provider: 'google',
    label: 'Google',
    blurb: 'Gemini models',
    // 2.5 Flash reroutes 2026-12-01; 3.8 Flash is what Kan itself runs on.
    defaultModel: 'gemini-3.8-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
    models: [
      { model: 'gemini-4-neon', label: 'Gemini 4 Neon', blurb: 'Strongest Gemini at code and agent work.', pricing: { input: 3, output: 15 } },
      { model: 'gemini-4-carbon', label: 'Gemini 4 Carbon', blurb: 'The hardest, longest projects and deep research.', pricing: { input: 4, output: 20 } },
      { model: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen', blurb: 'The fast Gemini 4.', pricing: { input: 1.5, output: 7.5 } },
      { model: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', blurb: 'Strong reasoning for the money.', pricing: { input: 2, output: 12 }, isPreview: true },
      { model: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', blurb: 'Newest flash. Built for long-horizon coding.', pricing: { input: 0.75, output: 3.75 }, priceNote: GEMINI_PROMO },
      { model: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', blurb: 'Fast and cheap.', pricing: { input: 0.3, output: 2.5 } },
      { model: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', blurb: 'Cheapest Gemini.', pricing: { input: 0.25, output: 1.5 } },
    ],
  },
  {
    provider: 'anthropic',
    label: 'Anthropic',
    blurb: 'Claude models',
    defaultModel: 'claude-opus-5-5',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    // Opus 5 is left out: Opus 5.5 replaces it and costs less.
    models: [
      { model: 'claude-fable-5-1', label: 'Claude Fable 5.1', blurb: 'Anthropic’s most capable. The hardest, longest work.', pricing: { input: 10, output: 50 } },
      { model: 'claude-opus-5-5', label: 'Claude Opus 5.5', blurb: 'Frontier Opus. Strong on code and long builds.', pricing: { input: 4, output: 20 } },
      { model: 'claude-sonnet-5', label: 'Claude Sonnet 5', blurb: 'Balances intelligence and cost.', pricing: { input: 2, output: 10 } },
      { model: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', blurb: 'Fast and cheap. Good for chat.', pricing: { input: 1, output: 5 } },
    ],
  },
];

export interface ModelChoice {
  provider: ModelProvider;
  model: string;
}

/** Build the stored form of a choice. */
export function formatModelChoice(provider: ModelProvider, model: string): string {
  return `${provider}:${model}`;
}

/**
 * Read a stored choice back. Returns null for empty, malformed, or unknown-provider
 * values, which all mean the same thing to callers: use the account default.
 */
export function parseModelChoice(value: string | null | undefined): ModelChoice | null {
  if (!value) return null;
  const separator = value.indexOf(':');
  if (separator <= 0) return null;
  const provider = value.slice(0, separator);
  const model = value.slice(separator + 1);
  if (!model) return null;
  if (provider !== 'openai' && provider !== 'google' && provider !== 'anthropic') return null;
  // A retired model resolves to its successor, so a stored choice never calls a dead id.
  return { provider, model: LEGACY_MODEL_IDS[model] ?? model };
}

/** Human-readable name for a stored choice, for showing what a shroom is set to. */
export function labelForModelChoice(value: string | null | undefined): string | null {
  const choice = parseModelChoice(value);
  if (!choice) return null;
  const group = MODEL_CATALOG.find((g) => g.provider === choice.provider);
  const known = group?.models.find((m) => m.model === choice.model);
  return `${group?.label ?? choice.provider} · ${known?.label ?? choice.model}`;
}

/** The catalog entry for a stored choice, when it is one we know about. */
export function findCatalogModel(value: string | null | undefined): CatalogModel | null {
  const choice = parseModelChoice(value);
  if (!choice) return null;
  const group = MODEL_CATALOG.find((g) => g.provider === choice.provider);
  return group?.models.find((m) => m.model === choice.model) ?? null;
}

/** The group for a provider. Always defined for a valid provider. */
export function providerGroup(provider: ModelProvider): ProviderGroup {
  return MODEL_CATALOG.find((g) => g.provider === provider)!;
}
