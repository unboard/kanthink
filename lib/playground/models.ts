/**
 * Model options exposed in the Playground UI, across both providers.
 *
 * Pricing is USD per 1M tokens (input/output) at the standard ≤200K-context tier.
 * Sources: ai.google.dev/gemini-api/docs/models · developers.openai.com/api/docs/models
 * Verified 2026-09-11.
 *
 * Curated for code generation. Excludes image-gen (Nano Banana / Imagen), TTS,
 * embedding, computer-use, robotics and deep-research models.
 *
 * Ids are bare provider ids rather than qualified ones, because that is what is
 * already stored in `playground_apps.model_id` and the two namespaces do not
 * collide — everything Google is `gemini-*`, everything OpenAI is `gpt-*`. The
 * `provider` field is what decides which SDK a build actually goes through.
 */
export type PlaygroundProvider = 'google' | 'openai';

export interface PlaygroundModel {
  id: string;
  provider: PlaygroundProvider;
  label: string;
  blurb: string;
  pricing: { input: number; output: number }; // USD per 1M tokens, standard tier
  /** Gemini only: tokens of thinking to allow. Ignored by OpenAI models. */
  thinkingBudget: number;
  /** OpenAI only: how hard to think. Ignored by Gemini models. */
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

  // === Google: current GA flash — frontier-class without preview risk ===
  {
    id: 'gemini-3.8-flash',
    provider: 'google',
    label: 'Gemini 3.8 Flash',
    blurb: 'Newest flash, built for long-horizon software work. Half price until 2027.',
    // Promotional pricing through 2026-12-31; rises to 1.5 / 7.5 on 2027-01-01.
    pricing: { input: 0.75, output: 3.75 },
    thinkingBudget: 6000,
  },
  {
    id: 'gemini-3.7-flash',
    provider: 'google',
    label: 'Gemini 3.7 Flash',
    blurb: 'Previous GA flash. Strong on code, same price as 3.8.',
    pricing: { input: 0.75, output: 3.75 },
    thinkingBudget: 6000,
  },
  {
    id: 'gemini-3.6-flash',
    provider: 'google',
    label: 'Gemini 3.6 Flash',
    blurb: 'Older GA flash. Speed and multimodal, balanced.',
    pricing: { input: 0.75, output: 3.75 },
    thinkingBudget: 6000,
  },
  {
    id: 'gemini-3.5-flash-lite',
    provider: 'google',
    label: 'Gemini 3.5 Flash-Lite',
    blurb: 'Cheap GA. Good for small, well-scoped edits.',
    pricing: { input: 0.3, output: 2.5 },
    thinkingBudget: 2000,
  },
  {
    id: 'gemini-3.1-flash-lite',
    provider: 'google',
    label: 'Gemini 3.1 Flash-Lite',
    blurb: 'Cheapest 3.x. Frontier-class for the money.',
    pricing: { input: 0.25, output: 1.5 },
    thinkingBudget: 2000,
  },

  // === Google: frontier ================================================
  {
    id: 'gemini-3.1-pro-preview',
    provider: 'google',
    label: 'Gemini 3.1 Pro',
    blurb: 'Best reasoning Google has. The default for structural work.',
    pricing: { input: 2.0, output: 12.0 },
    thinkingBudget: 8000,
    isPreview: true,
  },
  {
    id: 'gemini-3-flash-preview',
    provider: 'google',
    label: 'Gemini 3 Flash',
    blurb: 'Fast frontier-class. Great for iteration.',
    pricing: { input: 0.5, output: 3.0 },
    thinkingBudget: 4000,
    isPreview: true,
  },

  // === OpenAI ==========================================================
  {
    id: 'gpt-6-astra',
    provider: 'openai',
    label: 'GPT-6 Astra',
    blurb: 'Frontier. The most capable thing here, and priced like it.',
    pricing: { input: 10, output: 50 },
    thinkingBudget: 0,
    reasoningEffort: 'high',
  },
  {
    id: 'gpt-5.6-sol',
    provider: 'openai',
    label: 'GPT-5.6 Sol',
    blurb: 'Flagship. Strong on complex, multi-part builds.',
    pricing: { input: 4, output: 20 },
    thinkingBudget: 0,
    reasoningEffort: 'high',
  },
  {
    id: 'gpt-5.6-terra',
    provider: 'openai',
    label: 'GPT-5.6 Terra',
    blurb: 'Balances intelligence and cost. The sensible OpenAI pick.',
    pricing: { input: 2, output: 12 },
    thinkingBudget: 0,
    reasoningEffort: 'medium',
  },
  {
    id: 'gpt-5.6-luna',
    provider: 'openai',
    label: 'GPT-5.6 Luna',
    blurb: 'Cheap and quick. Small edits only.',
    pricing: { input: 0.2, output: 1.2 },
    thinkingBudget: 0,
    reasoningEffort: 'low',
  },

  // === Google: stable 2.5 family — fallback / known quantity ===========
  {
    id: 'gemini-2.5-pro',
    provider: 'google',
    label: 'Gemini 2.5 Pro',
    blurb: 'Stable previous-gen. Reliable but not frontier.',
    pricing: { input: 1.25, output: 10.0 },
    thinkingBudget: 8000,
  },
  {
    id: 'gemini-2.5-flash',
    provider: 'google',
    label: 'Gemini 2.5 Flash',
    blurb: 'Stable fast/cheap. Solid for routine edits.',
    pricing: { input: 0.3, output: 2.5 },
    thinkingBudget: 4000,
  },
  {
    id: 'gemini-2.5-flash-lite',
    provider: 'google',
    label: 'Gemini 2.5 Flash-Lite',
    blurb: 'Cheapest stable. Tiny tweaks only.',
    pricing: { input: 0.1, output: 0.4 },
    thinkingBudget: 0,
  },
];

export const DEFAULT_PLAYGROUND_MODEL_ID = AUTO_MODEL_ID;

/** Real model used for code generation when something falls back. 'auto' is
 *  virtual — never call a provider with this id. Frontier (3.1 Pro Preview) is our
 *  best available code generator and the right fallback. */
export const FALLBACK_GENERATION_MODEL_ID = 'gemini-3.1-pro-preview';

/** The same, for an account that only holds an OpenAI key. */
export const OPENAI_FALLBACK_GENERATION_MODEL_ID = 'gpt-5.6-sol';

export function getPlaygroundModel(id: string | undefined | null): PlaygroundModel {
  return PLAYGROUND_MODELS.find((m) => m.id === id) || PLAYGROUND_MODELS.find((m) => m.id === FALLBACK_GENERATION_MODEL_ID)!;
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
  if (selectedId && selectedId !== AUTO_MODEL_ID) return selectedId;

  const canGoogle = !providers || providers.includes('google');
  if (!canGoogle && providers?.includes('openai')) {
    // Terra is the balanced one; Sol for anything that has to reason about the
    // whole file. Astra exists, but at $10/$50 it is not an automatic choice.
    return editType === 'cosmetic' ? 'gpt-5.6-terra' : OPENAI_FALLBACK_GENERATION_MODEL_ID;
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
