/**
 * Model options exposed in the Playground UI, across both providers.
 *
 * Pricing is USD per 1M tokens (input/output) at the standard ≤200K-context tier.
 * Sources: the providers' model lists (each id below answered a live call on 2026-11-21)
 * and published per-token rates as of 2026-11-21. Retired ids live on in
 * LEGACY_MODEL_IDS so stored choices and older apps keep working.
 *
 * Curated for code generation. Excludes image-gen (Nano Banana / Imagen), TTS,
 * embedding, computer-use, robotics and deep-research models.
 *
 * Ids are bare provider ids rather than qualified ones, because that is what is
 * already stored in `playground_apps.model_id` and the two namespaces do not
 * collide — everything Google is `gemini-*`, everything OpenAI is `gpt-*`, everything
 * Anthropic is `claude-*`. The
 * `provider` field is what decides which SDK a build actually goes through.
 */
export type PlaygroundProvider = 'google' | 'openai' | 'anthropic';

export interface PlaygroundModel {
  id: string;
  provider: PlaygroundProvider;
  label: string;
  blurb: string;
  pricing: { input: number; output: number }; // USD per 1M tokens, standard tier
  /** Gemini only: tokens of thinking to allow. Ignored by OpenAI models. */
  thinkingBudget: number;
  /** OpenAI and Claude: how hard to think. Ignored by Gemini models. */
  reasoningEffort?: 'low' | 'medium' | 'high';
  isPreview?: boolean;
  isDefault?: boolean;
  isAuto?: boolean; // virtual option that routes per-edit
}

export const AUTO_MODEL_ID = 'auto';

export const PLAYGROUND_MODELS: PlaygroundModel[] = [
  {
    id: AUTO_MODEL_ID,
    provider: 'google',
    label: 'Auto',
    blurb: 'Cosmetic edits go fast and cheap. Structural ones and first builds go to the best model you hold a key for.',
    pricing: { input: 0, output: 0 },
    thinkingBudget: 0,
    isAuto: true,
    isDefault: true,
  },

  // === Google: Gemini 4 (Nov 2026) ===================================
  {
    id: 'gemini-4-neon',
    provider: 'google',
    label: 'Gemini 4 Neon',
    blurb: 'Google’s strongest at code and agent work. Costs more than 3.1 Pro.',
    pricing: { input: 3, output: 15 },
    thinkingBudget: 8000,
  },
  {
    id: 'gemini-4-carbon',
    provider: 'google',
    label: 'Gemini 4 Carbon',
    blurb: 'For the hardest, longest builds. The priciest Google option.',
    // List price; it ran at 2 / 10 as a launch promo through 2026-11-30.
    pricing: { input: 4, output: 20 },
    thinkingBudget: 10000,
  },
  {
    id: 'gemini-4-hydrogen',
    provider: 'google',
    label: 'Gemini 4 Hydrogen',
    blurb: 'The fast Gemini 4. Good everyday builds.',
    pricing: { input: 1.5, output: 7.5 },
    thinkingBudget: 6000,
  },

  // === Google: 3.x ===================================================
  {
    id: 'gemini-3.1-pro-preview',
    provider: 'google',
    label: 'Gemini 3.1 Pro',
    blurb: 'Strong reasoning for the money. The default for structural work.',
    pricing: { input: 2.0, output: 12.0 },
    thinkingBudget: 8000,
    isPreview: true,
  },
  {
    id: 'gemini-3.8-flash',
    provider: 'google',
    label: 'Gemini 3.8 Flash',
    blurb: 'Newest flash, built for software work. Half price until 2027.',
    // Promotional pricing through 2026-12-31; rises to 1.5 / 7.5 on 2027-01-01.
    pricing: { input: 0.75, output: 3.75 },
    thinkingBudget: 6000,
  },
  {
    id: 'gemini-3.5-flash-lite',
    provider: 'google',
    label: 'Gemini 3.5 Flash-Lite',
    blurb: 'Cheap. Good for small, well-scoped edits.',
    pricing: { input: 0.3, output: 2.5 },
    thinkingBudget: 2000,
  },
  {
    id: 'gemini-3.1-flash-lite',
    provider: 'google',
    label: 'Gemini 3.1 Flash-Lite',
    blurb: 'Cheapest Gemini. Tiny tweaks and high-volume calls.',
    pricing: { input: 0.25, output: 1.5 },
    thinkingBudget: 2000,
  },

  // === OpenAI ==========================================================
  {
    id: 'gpt-6.2-astra',
    provider: 'openai',
    label: 'GPT-6.2 Astra',
    blurb: 'OpenAI’s most capable, and priced like it.',
    pricing: { input: 8, output: 40 },
    thinkingBudget: 0,
    reasoningEffort: 'high',
  },
  {
    id: 'gpt-6.2-sol',
    provider: 'openai',
    label: 'GPT-6.2 Sol',
    blurb: 'Everyday coding flagship, close to Astra for a fifth of the price.',
    pricing: { input: 2, output: 10 },
    thinkingBudget: 0,
    reasoningEffort: 'high',
  },
  {
    id: 'gpt-6.1-terra',
    provider: 'openai',
    label: 'GPT-6.1 Terra',
    blurb: 'Balances intelligence and cost.',
    pricing: { input: 1, output: 5 },
    thinkingBudget: 0,
    reasoningEffort: 'medium',
  },
  {
    id: 'gpt-6-luna',
    provider: 'openai',
    label: 'GPT-6 Luna',
    blurb: 'Very cheap and quick. Small edits only.',
    pricing: { input: 0.1, output: 0.5 },
    thinkingBudget: 0,
    reasoningEffort: 'low',
  },

  // === Anthropic =======================================================
  // Thinking is adaptive on all but Haiku; `reasoningEffort` becomes Claude's effort.
  // Opus 5 is left out: Opus 5.5 replaces it and costs less.
  {
    id: 'claude-fable-5-1',
    provider: 'anthropic',
    label: 'Claude Fable 5.1',
    blurb: 'Anthropic’s most capable. For the hardest builds, priced like it.',
    pricing: { input: 10, output: 50 },
    thinkingBudget: 0,
    reasoningEffort: 'high',
  },
  {
    id: 'claude-opus-5-5',
    provider: 'anthropic',
    label: 'Claude Opus 5.5',
    blurb: 'Frontier Opus. Strong on whole-app builds and careful edits.',
    pricing: { input: 4, output: 20 },
    thinkingBudget: 0,
    reasoningEffort: 'high',
  },
  {
    id: 'claude-sonnet-5',
    provider: 'anthropic',
    label: 'Claude Sonnet 5',
    blurb: 'The balanced Claude. Good for most edits.',
    pricing: { input: 2, output: 10 },
    thinkingBudget: 0,
    reasoningEffort: 'high',
  },
  {
    id: 'claude-haiku-4-5',
    provider: 'anthropic',
    label: 'Claude Haiku 4.5',
    blurb: 'Fast and cheap. Small edits only.',
    pricing: { input: 1, output: 5 },
    thinkingBudget: 0,
  },

];

/**
 * Ids we used to offer, and what now answers for them. Providers retire models
 * (2.5 Flash/Pro reroute 2026-12-01, the gpt-5 family shuts down 2026-12-11), but
 * apps call kanthinkAI with the id they were built with and choices are stored, so an
 * old id must keep resolving to its nearest current model.
 */
export const LEGACY_MODEL_IDS: Record<string, string> = {
  'gemini-3.7-flash': 'gemini-3.8-flash',
  'gemini-3.6-flash': 'gemini-3.8-flash',
  'gemini-3.5-flash': 'gemini-3.8-flash',
  'gemini-3-flash-preview': 'gemini-3.8-flash',
  'gemini-2.5-pro': 'gemini-3.1-pro-preview',
  'gemini-2.5-flash': 'gemini-3.8-flash',
  'gemini-2.5-flash-lite': 'gemini-3.1-flash-lite',
  'gemini-2.0-flash': 'gemini-3.8-flash',
  'gpt-6-astra': 'gpt-6.2-astra',
  'gpt-6-sol': 'gpt-6.2-sol',
  'gpt-6.1-sol': 'gpt-6.2-sol',
  'gpt-5.6-sol': 'gpt-6.2-sol',
  'gpt-5.6-terra': 'gpt-6.1-terra',
  'gpt-5.6-luna': 'gpt-6-luna',
  'gpt-5.2': 'gpt-6.1-terra',
  'gpt-5.1': 'gpt-6.1-terra',
  'gpt-5': 'gpt-6.1-terra',
  'gpt-5-mini': 'gpt-6-luna',
  'gpt-5-nano': 'gpt-6-luna',
  'gpt-4.1': 'gpt-6.1-terra',
  'gpt-4o-mini': 'gpt-6-luna',
  'gpt-4o': 'gpt-6.1-terra',
};

/** The current id for a model id, following a retirement if there was one. */
export function currentModelId<T extends string | null | undefined>(id: T): T {
  return (id && LEGACY_MODEL_IDS[id] ? LEGACY_MODEL_IDS[id] : id) as T;
}

export const DEFAULT_PLAYGROUND_MODEL_ID = AUTO_MODEL_ID;

/** Real model used for code generation when something falls back. 'auto' is
 *  virtual — never call a provider with this id. Frontier (3.1 Pro Preview) is our
 *  best available code generator and the right fallback. */
export const FALLBACK_GENERATION_MODEL_ID = 'gemini-3.1-pro-preview';

/** The same, for an account that only holds an OpenAI key. */
export const OPENAI_FALLBACK_GENERATION_MODEL_ID = 'gpt-6.2-sol';

/** The same, for an account that only holds an Anthropic key. */
export const ANTHROPIC_FALLBACK_GENERATION_MODEL_ID = 'claude-opus-5-5';

export function getPlaygroundModel(id: string | undefined | null): PlaygroundModel {
  const current = currentModelId(id);
  return PLAYGROUND_MODELS.find((m) => m.id === current) || PLAYGROUND_MODELS.find((m) => m.id === FALLBACK_GENERATION_MODEL_ID)!;
}

/**
 * Resolve the actual model to call given the user's choice and an optional edit type.
 *
 * 'auto' routes by how much of the app an edit touches:
 *   cosmetic   → the fast flash model     (layout and styling; speed is the win)
 *   everything → the best model available (logic, structure, and first builds)
 *
 * `providers` is which providers the account actually holds a key for. Auto stays
 * on Google where it can, because that is where the routing was tuned, and falls to
 * OpenAI for an account holding only an OpenAI key — rather than resolving to a
 * model that cannot be called at all.
 */
export type EditType = 'cosmetic' | 'behavior' | 'structural' | 'redesign' | 'first';

export function resolveActiveModelId(
  selectedId: string | undefined | null,
  editType?: EditType,
  providers?: PlaygroundProvider[]
): string {
  if (selectedId && selectedId !== AUTO_MODEL_ID) return currentModelId(selectedId);

  const canGoogle = !providers || providers.includes('google');
  if (!canGoogle && providers?.includes('openai')) {
    // Terra is the balanced one; Sol for anything that has to reason about the
    // whole file. Astra exists, but at $8/$40 it is never an automatic choice.
    return editType === 'cosmetic' ? 'gpt-6.1-terra' : OPENAI_FALLBACK_GENERATION_MODEL_ID;
  }
  if (!canGoogle && providers?.includes('anthropic')) {
    return editType === 'cosmetic' ? 'claude-sonnet-5' : ANTHROPIC_FALLBACK_GENERATION_MODEL_ID;
  }

  // Cosmetic edits are mostly layout and styling, which is what a flash model is
  // for — and 3.8 is GA, newest, explicitly aimed at software work, and costs the
  // same as the 3.7 that used to sit here.
  if (editType === 'cosmetic') return 'gemini-3.8-flash';
  return FALLBACK_GENERATION_MODEL_ID;
}

/** Calculate the USD cost of a single generation given a model id and token usage. */
export function computeGenerationCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const model = getPlaygroundModel(modelId);
  return (
    (inputTokens * model.pricing.input + outputTokens * model.pricing.output) / 1_000_000
  );
}

/** Pretty-print a small USD amount. */
export function formatCost(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return '—';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
