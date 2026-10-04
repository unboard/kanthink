/**
 * The image models the print studio offers.
 *
 * A narrower list than lib/ai/imageModels: print needs a model that holds a layout,
 * sets type cleanly, follows a reference image, and reaches print resolution. Both
 * Gemini models were checked to return 4K frames at every print ratio; the OpenAI
 * models take an exact pixel size (multiples of 16, to 3840 on the long edge).
 *
 * Prices are what the provider lists per image, in US cents, rounded. They are shown
 * so people always know what a render costs — they are estimates, not a bill.
 */

import type { Frame, ImageTier } from './spec'

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
  /** Cents for one image in this frame. */
  cents: (frame: Pick<Frame, 'tier' | 'width' | 'height'>) => number
}

const geminiPrice = (table: Record<ImageTier, number>) => (frame: Pick<Frame, 'tier'>) =>
  table[frame.tier ?? '2K']

const openaiPrice = (centsPerMegapixel: number) => (frame: Pick<Frame, 'width' | 'height'>) =>
  Math.max(1, Math.round((frame.width * frame.height) / 1e6 * centsPerMegapixel))

export const PRINT_MODELS: PrintModel[] = [
  {
    id: 'google:gemini-3.1-flash-image-preview',
    provider: 'google',
    model: 'gemini-3.1-flash-image-preview',
    label: 'Nano Banana 2',
    canvas: true,
    blurb: 'Fast, sharp type, follows references well. The everyday choice.',
    cents: geminiPrice({ '1K': 7, '2K': 10, '4K': 15 }),
  },
  {
    id: 'google:gemini-3-pro-image-preview',
    provider: 'google',
    model: 'gemini-3-pro-image-preview',
    label: 'Nano Banana Pro',
    canvas: false,
    blurb: 'Google’s premium model: richest layouts and longest copy. Slower, and it sometimes restyles a logo.',
    cents: geminiPrice({ '1K': 13, '2K': 13, '4K': 24 }),
  },
  {
    id: 'openai:gpt-image-2.5-sunburst',
    provider: 'openai',
    model: 'gpt-image-2.5-sunburst',
    label: 'GPT-Image 2.5 Sunburst',
    canvas: false,
    blurb: 'OpenAI’s most capable. Draws at the exact print shape.',
    cents: openaiPrice(17),
  },
  {
    id: 'openai:gpt-image-2.5-flare',
    provider: 'openai',
    model: 'gpt-image-2.5-flare',
    label: 'GPT-Image 2.5 Flare',
    canvas: false,
    blurb: 'Quick and inexpensive, at the exact print shape.',
    cents: openaiPrice(4),
  },
]

export const DEFAULT_PRINT_MODEL = PRINT_MODELS[0].id

export function findPrintModel(id: string | null | undefined): PrintModel | null {
  if (!id) return null
  return PRINT_MODELS.find((m) => m.id === id || m.model === id) ?? null
}

export function formatCents(cents: number): string {
  if (cents < 100) return `${Math.round(cents)}¢`
  return `$${(cents / 100).toFixed(2)}`
}
