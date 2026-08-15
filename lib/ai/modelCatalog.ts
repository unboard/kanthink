/**
 * Every model a user can pick, across the providers Kanthink can actually call.
 *
 * One list, because the same set is offered in two places that must not drift: BYOK
 * settings (which model your key gets used with) and a shroom's own model override
 * (which model that one automation runs on).
 *
 * A shroom stores its choice provider-qualified — `google:gemini-3.7-flash` — because
 * a bare model id doesn't say which client to build. `parseModelChoice` is the only
 * thing that should take that string apart.
 */

export type ModelProvider = 'openai' | 'google';

export interface CatalogModel {
  /** Raw provider model id, as sent to the API. */
  model: string;
  label: string;
}

export interface ProviderGroup {
  provider: ModelProvider;
  label: string;
  /** What the provider is called in the wild, for the group heading. */
  blurb: string;
  defaultModel: string;
  models: CatalogModel[];
}

export const MODEL_CATALOG: ProviderGroup[] = [
  {
    provider: 'openai',
    label: 'OpenAI',
    blurb: 'GPT models',
    defaultModel: 'gpt-5',
    models: [
      { model: 'gpt-5.2', label: 'GPT-5.2' },
      { model: 'gpt-5.1', label: 'GPT-5.1' },
      { model: 'gpt-5', label: 'GPT-5' },
      { model: 'gpt-5-mini', label: 'GPT-5 Mini' },
      { model: 'gpt-5-nano', label: 'GPT-5 Nano' },
      { model: 'gpt-5-pro', label: 'GPT-5 Pro' },
      { model: 'gpt-4.1', label: 'GPT-4.1' },
      { model: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
      { model: 'gpt-4o', label: 'GPT-4o' },
      { model: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    ],
  },
  {
    provider: 'google',
    label: 'Google',
    blurb: 'Gemini models',
    defaultModel: 'gemini-2.5-flash',
    models: [
      { model: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
      { model: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
      { model: 'gemini-3-flash', label: 'Gemini 3 Flash' },
      { model: 'gemini-3-flash-lite', label: 'Gemini 3 Flash Lite' },
      { model: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)' },
      { model: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { model: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
      { model: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { model: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
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
