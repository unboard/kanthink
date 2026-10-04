/**
 * The image models the print studio offers, and what they cost.
 *
 * A narrower list than lib/ai/imageModels: print needs a model that holds a layout,
 * sets type cleanly, follows a reference image, and reaches print resolution. Both
 * Gemini models were checked to return 4K frames at every print ratio; the OpenAI
 * models take an exact pixel size (multiples of 16, to 3840 on the long edge).
 *
 * ## Cost
 *
 * Every provider bills images by tokens. Before a render the studio shows an estimate;
 * after it, the version records the actual cost from the usage the provider returned.
 *
 *   - Gemini publishes tokens per image by size, so its estimate is exact
 *     (ai.google.dev/gemini-api/docs/pricing, checked 2026-10-04).
 *   - OpenAI publishes the token *rate* ($30 per 1M image-output tokens for both
 *     gpt-image-2.5 models) but not tokens per size, so the per-megapixel token
 *     counts below were measured: a 2528×3264 high-quality image is 4,552 output
 *     tokens on either model; 1536×1024 medium is 343. Measured 2026-10-04.
 */

import type { Frame, ImageTier } from './spec'
import type { RenderQuality } from './types'

export interface TokenRates {
  /** USD per 1M input tokens (text and reference images). */
  input: number
  /** USD per 1M image output tokens. */
  output: number
}

export interface PrintModel {
  id: string
  provider: 'google' | 'openai'
  model: string
  label: string
  blurb: string
  /**
   * Whether a plain product is drawn on top of a blank canvas image of the sheet. Nano
   * Banana 2 replaces the canvas as told; Nano Banana Pro tends to treat it as a
   * tabletop and lay a mockup of the piece on it, so it gets the ratio from config
   * alone. Die-cut guides are always sent: the shape has to be seen.
   */
  canvas: boolean
  rates: TokenRates
  /** Estimated cents for one image in this frame, before it is drawn. */
  cents: (frame: Pick<Frame, 'tier' | 'width' | 'height'>, quality: RenderQuality) => number
}

/** Gemini output tokens per image, by size. Published. */
const GEMINI_TOKENS: Record<string, Record<ImageTier, number>> = {
  'gemini-3.1-flash-image-preview': { '1K': 1120, '2K': 1680, '4K': 2520 },
  'gemini-3-pro-image-preview': { '1K': 1120, '2K': 1120, '4K': 2000 },
}

/** OpenAI output tokens per megapixel, by quality. Measured; see above. */
const OPENAI_TOKENS_PER_MP: Record<RenderQuality, number> = { print: 552, draft: 220 }

/** A typical brief's input: the prompt plus a few reference images. */
const TYPICAL_INPUT_TOKENS = 3000

const usd = (tokens: number, perMillion: number) => (tokens * perMillion) / 1e6

export function tokenCents(rates: TokenRates, inputTokens: number, outputTokens: number): number {
  return (usd(inputTokens, rates.input) + usd(outputTokens, rates.output)) * 100
}

const GEMINI_FLASH: TokenRates = { input: 0.5, output: 60 }
const GEMINI_PRO: TokenRates = { input: 2, output: 120 }
// OpenAI bills text input at $5 and image input at $8; the studio's input is mostly images.
const GPT_IMAGE_25: TokenRates = { input: 8, output: 30 }

const geminiCents = (model: string, rates: TokenRates) => (frame: Pick<Frame, 'tier'>) =>
  tokenCents(rates, TYPICAL_INPUT_TOKENS, GEMINI_TOKENS[model][frame.tier ?? '2K'])

const openaiCents = (rates: TokenRates) => (frame: Pick<Frame, 'width' | 'height'>, quality: RenderQuality) =>
  tokenCents(rates, TYPICAL_INPUT_TOKENS, ((frame.width * frame.height) / 1e6) * OPENAI_TOKENS_PER_MP[quality])

export const PRINT_MODELS: PrintModel[] = [
  {
    id: 'google:gemini-3.1-flash-image-preview',
    provider: 'google',
    model: 'gemini-3.1-flash-image-preview',
    label: 'Nano Banana 2',
    canvas: true,
    blurb: 'Fast, sharp type, follows references well. The everyday choice.',
    rates: GEMINI_FLASH,
    cents: geminiCents('gemini-3.1-flash-image-preview', GEMINI_FLASH),
  },
  {
    id: 'google:gemini-3-pro-image-preview',
    provider: 'google',
    model: 'gemini-3-pro-image-preview',
    label: 'Nano Banana Pro',
    canvas: false,
    blurb: 'Google’s premium model: richest layouts and longest copy. Slower, and it sometimes restyles a logo.',
    rates: GEMINI_PRO,
    cents: geminiCents('gemini-3-pro-image-preview', GEMINI_PRO),
  },
  {
    id: 'openai:gpt-image-2.5-sunburst',
    provider: 'openai',
    model: 'gpt-image-2.5-sunburst',
    label: 'GPT-Image 2.5 Sunburst',
    canvas: false,
    blurb: 'OpenAI’s most capable. Draws at the exact print shape.',
    rates: GPT_IMAGE_25,
    cents: openaiCents(GPT_IMAGE_25),
  },
  {
    id: 'openai:gpt-image-2.5-flare',
    provider: 'openai',
    model: 'gpt-image-2.5-flare',
    label: 'GPT-Image 2.5 Flare',
    canvas: false,
    blurb: 'Quicker, at the exact print shape. Same price as Sunburst.',
    rates: GPT_IMAGE_25,
    cents: openaiCents(GPT_IMAGE_25),
  },
]

export const DEFAULT_PRINT_MODEL = PRINT_MODELS[0].id

export function findPrintModel(id: string | null | undefined): PrintModel | null {
  if (!id) return null
  return PRINT_MODELS.find((m) => m.id === id || m.model === id) ?? null
}

/** Cents as people read them: "0.4¢", "14¢", "$1.20". */
export function formatCents(cents: number): string {
  if (cents < 1) return `${cents < 0.05 ? '0' : cents.toFixed(1)}¢`
  if (cents < 100) return `${Math.round(cents)}¢`
  return `$${(cents / 100).toFixed(2)}`
}
