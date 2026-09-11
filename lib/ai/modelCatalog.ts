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
 * Verified against ai.google.dev/gemini-api/docs/models and
 * developers.openai.com/api/docs/models on 2026-09-11.
 */

export type ModelProvider = 'openai' | 'google';

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
    // Unchanged on purpose. A default is what runs when nobody chose, and moving it
    // silently re-prices every board on the account.
    defaultModel: 'gpt-5',
    keyUrl: 'https://platform.openai.com/api-keys',
    models: [
      { model: 'gpt-6-astra', label: 'GPT-6 Astra', blurb: 'Frontier. The hardest end-to-end work.', pricing: { input: 10, output: 50 } },
      { model: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', blurb: 'Flagship for complex professional work.', pricing: { input: 4, output: 20 } },
      { model: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', blurb: 'Balances intelligence and cost.', pricing: { input: 2, output: 12 } },
      { model: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', blurb: 'Cheap and quick. Good default for chat.', pricing: { input: 0.2, output: 1.2 } },
      { model: 'gpt-5.2', label: 'GPT-5.2', pricing: { input: 1.75, output: 14 } },
      { model: 'gpt-5.1', label: 'GPT-5.1', pricing: { input: 1.25, output: 10 } },
      { model: 'gpt-5', label: 'GPT-5', pricing: { input: 1.25, output: 10 } },
      { model: 'gpt-5-mini', label: 'GPT-5 Mini', pricing: { input: 0.25, output: 2 } },
      { model: 'gpt-5-nano', label: 'GPT-5 Nano', pricing: { input: 0.05, output: 0.4 } },
    ],
  },
  {
    provider: 'google',
    label: 'Google',
    blurb: 'Gemini models',
    defaultModel: 'gemini-2.5-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
    models: [
      { model: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', blurb: 'Newest flash. Built for long-horizon coding.', pricing: { input: 0.75, output: 3.75 }, priceNote: GEMINI_PROMO },
      { model: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', blurb: 'Previous flash. Strong on code.', pricing: { input: 0.75, output: 3.75 }, priceNote: GEMINI_PROMO },
      { model: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', blurb: 'Speed and multimodal, balanced.', pricing: { input: 0.75, output: 3.75 }, priceNote: GEMINI_PROMO },
      { model: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', blurb: 'High-throughput workloads.', pricing: { input: 1.5, output: 9 } },
      { model: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', blurb: 'Fast and cheap.', pricing: { input: 0.3, output: 2.5 } },
      { model: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', blurb: 'Frontier-class for the price.', pricing: { input: 0.25, output: 1.5 } },
      { model: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', blurb: 'Best reasoning available.', pricing: { input: 2, output: 12 }, isPreview: true },
      { model: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', pricing: { input: 0.5, output: 3 }, isPreview: true },
      { model: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', blurb: 'Previous generation, reliable.', pricing: { input: 1.25, output: 10 } },
      { model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', blurb: 'Solid, cheap, well understood.', pricing: { input: 0.3, output: 2.5 } },
      { model: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', blurb: 'Cheapest thing here.', pricing: { input: 0.1, output: 0.4 } },
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
  if (provider !== 'openai' && provider !== 'google') return null;
  return { provider, model };
}

/** Human-readable name for a stored choice, for showing what a shroom is set to. */
export function labelForModelChoice(value: string | null | undefined): string | null {
  const choice = parseModelChoice(value);
  if (!choice) return null;
  const group = MODEL_CATALOG.find((g) => g.provider === choice.provider);
  const known = group?.models.find((m) => m.model === choice.model);
  return `${group?.label ?? choice.provider} · ${known?.label ?? choice.model}`;
}

/** The catalogue entry for a stored choice, when it is one we know about. */
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
