import { PLAYGROUND_MODELS } from './models'

/**
 * What a model costs, and refusing to guess when we do not know.
 *
 * The first version of the budget used one generic estimate for all text and
 * another for all images. That is not a reservation — it is a number that happens
 * to be in the right area, and it is wrong in the direction that matters as soon as
 * an app is switched to a dearer model.
 *
 * ## Units
 *
 * Everything here is in **millicents**: thousandths of a cent. 1 cent = 1000.
 *
 * Named after what it is, because the previous version called the same field
 * millicents while actually holding tenths of a cent, and a unit that lies about
 * its own scale is a bug waiting for whoever reads it next. Thousandths give real
 * resolution — a small flash-lite call lands around 15 millicents rather than
 * rounding to zero.
 */

export const MILLICENTS_PER_CENT = 1_000
export const MILLICENTS_PER_DOLLAR = 100_000

/** USD per 1M tokens → millicents per token. */
const perToken = (usdPerMillion: number) => (usdPerMillion * MILLICENTS_PER_DOLLAR) / 1_000_000

export interface ModelPrice {
  /** Millicents per input token. */
  input: number
  /** Millicents per output token. */
  output: number
  /** Millicents per generated image, for image models. */
  perImage?: number
}

/**
 * Image model prices, which the playground model catalogue does not carry because
 * those models are excluded from it — they are not code generators.
 *
 * Verified against ai.google.dev/gemini-api/docs/pricing, rounded up.
 */
const IMAGE_PRICES: Record<string, ModelPrice> = {
  'gemini-3.1-flash-image-preview': { input: perToken(0.5), output: 0, perImage: 4_000 },
  'gemini-3.1-flash-lite-image': { input: perToken(0.25), output: 0, perImage: 2_500 },
  'gemini-2.5-flash-image': { input: perToken(0.3), output: 0, perImage: 4_000 },
  'gemini-3-pro-image': { input: perToken(2), output: 0, perImage: 14_000 },
}

/** Text prices come from the catalogue the picker already offers. */
const TEXT_PRICES: Record<string, ModelPrice> = Object.fromEntries(
  PLAYGROUND_MODELS
    .filter((m) => !m.isAuto)
    .map((m) => [m.id, { input: perToken(m.pricing.input), output: perToken(m.pricing.output) }]),
)

/**
 * Models the in-app AI helper is allowed to call.
 *
 * An explicit set, because the enforcement is the point: a model nobody has priced
 * cannot be reserved for, and a request for one is refused rather than admitted on
 * a number we invented.
 */
export const PRICED_MODELS: Record<string, ModelPrice> = { ...TEXT_PRICES, ...IMAGE_PRICES }

export function priceOf(modelId: string | null | undefined): ModelPrice | null {
  if (!modelId) return null
  return PRICED_MODELS[modelId] ?? null
}

export function isPriced(modelId: string | null | undefined): boolean {
  return priceOf(modelId) !== null
}

/** Every model that can be called, for an error message worth reading. */
export function pricedModelIds(): string[] {
  return Object.keys(PRICED_MODELS).sort()
}

/**
 * Roughly how many tokens a piece of text is.
 *
 * Four characters per token is the usual rule of thumb; three is used here because
 * this figure drives a reservation and under-counting the input is the direction
 * that lets real cost exceed what was set aside.
 */
export function estimateInputTokens(text: string): number {
  return Math.ceil(text.length / 3)
}

/** An attached image costs input tokens too, and generously. */
export const TOKENS_PER_ATTACHED_IMAGE = 1_600

export interface ReservationInput {
  modelId: string
  kind: 'text' | 'image'
  /** The prompt and any system instruction, for sizing the input. */
  promptChars: number
  /** Images being sent in, not generated. */
  attachedImages?: number
  /** The ceiling the route will actually enforce on the response. */
  maxOutputTokens: number
  /** Images the call may produce. */
  imagesOut?: number
}

/**
 * The most this call can cost, given the model and the limits the route enforces.
 *
 * A maximum, not an average. The reservation is the only thing standing between a
 * published app and an unbounded bill, so it is computed from the enforced output
 * ceiling rather than from what a typical response happens to use. Settlement
 * corrects it downward afterwards, which is the safe direction to be wrong in.
 */
export function maximumCostMillicents(input: ReservationInput): number | null {
  const price = priceOf(input.modelId)
  if (!price) return null

  const inputTokens =
    Math.ceil(input.promptChars / 3) + (input.attachedImages ?? 0) * TOKENS_PER_ATTACHED_IMAGE

  let total = inputTokens * price.input + input.maxOutputTokens * price.output

  if (input.kind === 'image') {
    total += (input.imagesOut ?? 1) * (price.perImage ?? 0)
  }

  // Never zero: a call that reserves nothing cannot be refused by a ceiling, and
  // would let an app make unlimited requests as long as each looked free.
  return Math.max(1, Math.ceil(total))
}

/** What it actually cost, from the provider's own token counts. */
export function actualCostMillicents(
  modelId: string,
  kind: 'text' | 'image',
  usage?: { inputTokens?: number; outputTokens?: number } | null,
  imagesOut = 1,
): number {
  const price = priceOf(modelId)
  if (!price) return 0

  const inputTokens = usage?.inputTokens ?? 0
  const outputTokens = usage?.outputTokens ?? 0
  let total = inputTokens * price.input + outputTokens * price.output
  if (kind === 'image') total += imagesOut * (price.perImage ?? 0)

  return Math.max(1, Math.ceil(total))
}

/** Money as a person reads it. */
export function formatMillicents(millicents: number): string {
  const cents = millicents / MILLICENTS_PER_CENT
  if (cents >= 100) return `$${(cents / 100).toFixed(2)}`
  if (cents >= 1) return `${cents.toFixed(1)}¢`
  return `${cents.toFixed(2)}¢`
}

/** Dollars in, millicents out — for limits that people set in familiar units. */
export function dollarsToMillicents(dollars: number): number {
  return Math.round(dollars * MILLICENTS_PER_DOLLAR)
}

export function centsToMillicents(cents: number): number {
  return Math.round(cents * MILLICENTS_PER_CENT)
}

export function millicentsToCents(millicents: number): number {
  return millicents / MILLICENTS_PER_CENT
}
