import { describe, it, expect } from 'vitest'
import {
  MILLICENTS_PER_CENT,
  MILLICENTS_PER_DOLLAR,
  PRICED_MODELS,
  TOKENS_PER_ATTACHED_IMAGE,
  isPriced,
  maximumCostMillicents,
  actualCostMillicents,
  formatMillicents,
  dollarsToMillicents,
  centsToMillicents,
} from '../lib/playground/aiPricing'

/**
 * What the in-app AI helper is allowed to spend, and whether the number it sets
 * aside is actually enough.
 *
 * These exist because the first version of the budget reserved one flat figure for
 * all text and another for all images, and held it in a field called millicents
 * that was really tenths of a cent. Both are the kind of mistake that looks fine
 * until somebody switches model or does arithmetic.
 */

// What the route actually enforces. If these move, the headroom checks below are
// testing a request the route no longer accepts.
const MAX_PROMPT_LENGTH = 16_000
const MAX_SYSTEM_LENGTH = 8_000
const MAX_OUTPUT_TOKENS = 4_000

describe('units', () => {
  it('holds thousandths of a cent, as the name says', () => {
    expect(MILLICENTS_PER_CENT).toBe(1_000)
    expect(MILLICENTS_PER_DOLLAR).toBe(100_000)
    expect(MILLICENTS_PER_DOLLAR).toBe(MILLICENTS_PER_CENT * 100)
  })

  it('carries a known dollar amount there and back', () => {
    expect(dollarsToMillicents(1)).toBe(100_000)
    expect(formatMillicents(dollarsToMillicents(1))).toBe('$1.00')
    expect(formatMillicents(dollarsToMillicents(12.34))).toBe('$12.34')
    expect(centsToMillicents(1)).toBe(1_000)
    expect(formatMillicents(centsToMillicents(1))).toBe('1.0¢')
  })

  it('prices a million output tokens at the published rate', () => {
    // gemini-2.5-pro is $10 per million output tokens.
    const cost = actualCostMillicents('gemini-2.5-pro', 'text', { inputTokens: 0, outputTokens: 1_000_000 })
    expect(formatMillicents(cost)).toBe('$10.00')
  })
})

describe('only priced models are admitted', () => {
  it('refuses a model nobody has costed', () => {
    expect(isPriced('some-model-we-have-never-heard-of')).toBe(false)
    expect(maximumCostMillicents({
      modelId: 'some-model-we-have-never-heard-of',
      kind: 'text', promptChars: 100, maxOutputTokens: 1000,
    })).toBeNull()
  })

  it('prices every model the picker offers', () => {
    expect(Object.keys(PRICED_MODELS).length).toBeGreaterThan(3)
    for (const [id, price] of Object.entries(PRICED_MODELS)) {
      expect(price.input, id).toBeGreaterThan(0)
      expect(price.output + (price.perImage ?? 0), id).toBeGreaterThan(0)
    }
  })
})

describe('the reservation follows the model', () => {
  const call = (modelId: string) => maximumCostMillicents({
    modelId, kind: 'text', promptChars: 4_000, maxOutputTokens: 2_000,
  })!

  it('reserves more for a dearer model', () => {
    const cheap = call('gemini-2.5-flash-lite')
    const dear = call('gemini-3.1-pro-preview')
    expect(dear).toBeGreaterThan(cheap)
  })

  it('never reserves nothing, so a ceiling can always bind', () => {
    for (const id of Object.keys(PRICED_MODELS)) {
      const cost = maximumCostMillicents({ modelId: id, kind: 'text', promptChars: 1, maxOutputTokens: 1 })
      expect(cost, id).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('the largest request the route accepts fits its reservation', () => {
  const textModels = Object.entries(PRICED_MODELS).filter(([, p]) => p.perImage === undefined)
  const imageModels = Object.entries(PRICED_MODELS).filter(([, p]) => p.perImage !== undefined)

  it.each(textModels.map(([id]) => id))('%s', (modelId) => {
    const promptChars = MAX_PROMPT_LENGTH + MAX_SYSTEM_LENGTH
    const reserved = maximumCostMillicents({
      modelId, kind: 'text', promptChars, attachedImages: 2, maxOutputTokens: MAX_OUTPUT_TOKENS,
    })!
    // The worst the call can actually cost: every character its own token, both
    // attached images at the generous per-image figure, the output ceiling reached.
    const price = PRICED_MODELS[modelId]
    const worst =
      (promptChars / 3 + 2 * TOKENS_PER_ATTACHED_IMAGE) * price.input +
      MAX_OUTPUT_TOKENS * price.output
    expect(reserved).toBeGreaterThanOrEqual(Math.floor(worst))
  })

  it.each(imageModels.map(([id]) => id))('%s', (modelId) => {
    const promptChars = MAX_PROMPT_LENGTH + MAX_SYSTEM_LENGTH
    const reserved = maximumCostMillicents({
      modelId, kind: 'image', promptChars, attachedImages: 2, maxOutputTokens: 0, imagesOut: 1,
    })!
    const price = PRICED_MODELS[modelId]
    const worst =
      (promptChars / 3 + 2 * TOKENS_PER_ATTACHED_IMAGE) * price.input + (price.perImage ?? 0)
    expect(reserved).toBeGreaterThanOrEqual(Math.floor(worst))
  })
})

describe('settlement corrects the reservation downward', () => {
  it('a typical call settles well under what it reserved', () => {
    const modelId = 'gemini-2.5-flash'
    const reserved = maximumCostMillicents({
      modelId, kind: 'text', promptChars: 2_000, maxOutputTokens: MAX_OUTPUT_TOKENS,
    })!
    const settled = actualCostMillicents(modelId, 'text', { inputTokens: 600, outputTokens: 300 })
    expect(settled).toBeLessThan(reserved)
    expect(settled).toBeGreaterThan(0)
  })

  it('an unpriced model settles at nothing rather than inventing a charge', () => {
    expect(actualCostMillicents('not-a-model', 'text', { inputTokens: 1000, outputTokens: 1000 })).toBe(0)
  })
})
