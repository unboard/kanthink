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
}

export const PLAYGROUND_MODELS: PlaygroundModel[] = [
  // === Stable (2.5 family) ============================================
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    blurb: 'Best stable default for code. Reliable.',
    pricing: { input: 1.25, output: 10.0 },
    thinkingBudget: 8000,
    isDefault: true,
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    blurb: 'Fast and cheap — great for rapid iteration.',
    pricing: { input: 0.3, output: 2.5 },
    thinkingBudget: 4000,
  },
  {
    id: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash-Lite',
    blurb: 'Cheapest stable. Best for minor tweaks.',
    pricing: { input: 0.1, output: 0.4 },
    thinkingBudget: 0,
  },

  // === Preview (3.x family) ===========================================
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    blurb: 'Frontier reasoning + best code today. Preview.',
    pricing: { input: 2.0, output: 12.0 },
    thinkingBudget: 8000,
    isPreview: true,
  },
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    blurb: 'Fast frontier-class iteration. Preview.',
    pricing: { input: 0.5, output: 3.0 },
    thinkingBudget: 4000,
    isPreview: true,
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    blurb: 'Cheapest 3.x model. Fast and low-cost.',
    pricing: { input: 0.25, output: 1.5 },
    thinkingBudget: 2000,
    isPreview: true,
  },
];

export const DEFAULT_PLAYGROUND_MODEL_ID = 'gemini-2.5-pro';

export function getPlaygroundModel(id: string | undefined | null): PlaygroundModel {
  return PLAYGROUND_MODELS.find((m) => m.id === id) || PLAYGROUND_MODELS[0];
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
