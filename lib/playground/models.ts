/**
 * Gemini model options exposed in the Playground UI.
 * Pricing is USD per 1M tokens (input/output) at the standard ≤200K-context tier.
 * Sources: https://ai.google.dev/gemini-api/docs/models · https://ai.google.dev/pricing
 *
 * Curated for the code-gen playground. Excludes image-gen (Nano Banana / Imagen),
 * TTS, embedding, computer-use, robotics, and deep-research models.
 */
export interface PlaygroundModel {
  id: string;
  label: string;
  blurb: string;
  pricing: { input: number; output: number }; // USD per 1M tokens, standard tier
  thinkingBudget: number;
  isPreview?: boolean;
  isDefault?: boolean;
  isAuto?: boolean; // virtual option that routes per-edit
}

export const AUTO_MODEL_ID = 'auto';

export const PLAYGROUND_MODELS: PlaygroundModel[] = [
  {
    id: AUTO_MODEL_ID,
    label: 'Auto',
    blurb: 'Cosmetic → 3 Flash. Structural / first build → 3.1 Pro.',
    pricing: { input: 0, output: 0 },
    thinkingBudget: 0,
    isAuto: true,
    isDefault: true,
  },

  // === Frontier (3.x family) — best quality available ==================
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    blurb: 'Frontier model. Best code generation available.',
    pricing: { input: 2.0, output: 12.0 },
    thinkingBudget: 8000,
    isPreview: true,
  },
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    blurb: 'Fast frontier-class. Great for iteration.',
    pricing: { input: 0.5, output: 3.0 },
    thinkingBudget: 4000,
    isPreview: true,
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    blurb: 'Cheapest 3.x. Fast, low-cost.',
    pricing: { input: 0.25, output: 1.5 },
    thinkingBudget: 2000,
    isPreview: true,
  },

  // === Stable (2.5 family) — fallback / known-quantity =================
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    blurb: 'Stable previous-gen. Reliable but not frontier.',
    pricing: { input: 1.25, output: 10.0 },
    thinkingBudget: 8000,
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    blurb: 'Stable fast/cheap. Solid for routine edits.',
    pricing: { input: 0.3, output: 2.5 },
    thinkingBudget: 4000,
  },
  {
    id: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash-Lite',
    blurb: 'Cheapest stable. Tiny tweaks only.',
    pricing: { input: 0.1, output: 0.4 },
    thinkingBudget: 0,
  },
];

export const DEFAULT_PLAYGROUND_MODEL_ID = AUTO_MODEL_ID;

/** Real model used for code generation when something falls back. 'auto' is
 *  virtual — never call Gemini with this id. Frontier (3.1 Pro Preview) is our
 *  best available code generator and the right fallback. */
export const FALLBACK_GENERATION_MODEL_ID = 'gemini-3.1-pro-preview';

export function getPlaygroundModel(id: string | undefined | null): PlaygroundModel {
  return PLAYGROUND_MODELS.find((m) => m.id === id) || PLAYGROUND_MODELS.find((m) => m.id === FALLBACK_GENERATION_MODEL_ID)!;
}

/**
 * Resolve the actual model to call given the user's choice and an optional edit type.
 * 'auto' routes to the FRONTIER family — 3.x is our best:
 *   cosmetic   → Gemini 3 Flash Preview      (fast/cheap, frontier-class)
 *   behavior   → Gemini 3.1 Pro Preview      (touches logic; needs best reasoning)
 *   structural → Gemini 3.1 Pro Preview      (layout / new components / state changes)
 *   redesign   → Gemini 3.1 Pro Preview
 *   first      → Gemini 3.1 Pro Preview      (first generation gets the best model)
 */
export type EditType = 'cosmetic' | 'behavior' | 'structural' | 'redesign' | 'first';

export function resolveActiveModelId(
  selectedId: string | undefined | null,
  editType?: EditType
): string {
  if (selectedId && selectedId !== AUTO_MODEL_ID) return selectedId;
  // Auto routing — frontier 3.x family
  if (editType === 'cosmetic') return 'gemini-3-flash-preview';
  // first / behavior / structural / redesign / unknown → best available
  return 'gemini-3.1-pro-preview';
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
