/**
 * Gemini model options exposed in the Playground UI.
 * Pricing is USD per 1M tokens (input/output) for the standard tier.
 * Source: Google AI for Developers — Gemini API pricing (Dec 2025).
 */
export interface PlaygroundModel {
  id: string;
  label: string;
  blurb: string;
  pricing: { input: number; output: number }; // USD per 1M tokens
  thinkingBudget: number;
}

export const PLAYGROUND_MODELS: PlaygroundModel[] = [
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    blurb: 'Best quality. Slower, pricier.',
    pricing: { input: 1.25, output: 10.0 },
    thinkingBudget: 8000,
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    blurb: 'Fast and cheap. Great for iteration.',
    pricing: { input: 0.3, output: 2.5 },
    thinkingBudget: 4000,
  },
  {
    id: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash-Lite',
    blurb: 'Cheapest. Use when speed matters most.',
    pricing: { input: 0.1, output: 0.4 },
    thinkingBudget: 0,
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
