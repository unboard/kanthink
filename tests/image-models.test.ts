import { describe, it, expect } from 'vitest'
import {
  DEFAULT_IMAGE_MODEL_ID,
  DEFAULT_TRANSPARENT_MODEL_ID,
  IMAGE_MODELS,
  findImageModel,
  isImageBackground,
  labelForImageModel,
  resolveImageModel,
} from '@/lib/ai/imageModels'
import { PRICED_MODELS } from '@/lib/playground/aiPricing'

/**
 * The image-model choice has three inputs — the request, the account default, and
 * which keys exist — and one input that overrides all of them, transparency. These
 * pin the order, because the failure they prevent is silent: a request for a sticker
 * that comes back opaque looks like a bad prompt, not a routing bug.
 */

const BOTH = ['google', 'openai'] as const
const GOOGLE_ONLY = ['google'] as const
const OPENAI_ONLY = ['openai'] as const

describe('the catalogue', () => {
  it('only claims transparency for models that actually take the parameter', () => {
    for (const model of IMAGE_MODELS) {
      if (model.provider === 'google') expect(model.supportsTransparency).toBe(false)
    }
    expect(IMAGE_MODELS.some((m) => m.supportsTransparency)).toBe(true)
  })

  it('has qualified ids that match their provider and model', () => {
    for (const model of IMAGE_MODELS) {
      expect(model.id).toBe(`${model.provider}:${model.model}`)
    }
  })

  it('names defaults that exist', () => {
    expect(findImageModel(DEFAULT_IMAGE_MODEL_ID)).toBeTruthy()
    expect(findImageModel(DEFAULT_TRANSPARENT_MODEL_ID)?.supportsTransparency).toBe(true)
  })

  it('keeps the default on Gemini, so existing boards are not re-pointed', () => {
    expect(findImageModel(DEFAULT_IMAGE_MODEL_ID)?.provider).toBe('google')
  })

  it('prices every model, or the playground budget cannot reserve for it', () => {
    // An unpriced model is refused by lib/playground/aiBudget rather than guessed
    // at, so a catalogue entry with no price is a feature that fails at runtime.
    for (const model of IMAGE_MODELS) {
      expect(PRICED_MODELS[model.model], `${model.model} is unpriced`).toBeTruthy()
      expect(PRICED_MODELS[model.model].perImage).toBeGreaterThan(0)
    }
  })
})

describe('parsing a stored choice', () => {
  it('accepts the qualified form and the bare model id', () => {
    expect(findImageModel('openai:gpt-image-2.5-flare')?.model).toBe('gpt-image-2.5-flare')
    expect(findImageModel('gpt-image-2.5-flare')?.id).toBe('openai:gpt-image-2.5-flare')
  })

  it('returns null for empty and unknown values, which both mean “no preference”', () => {
    expect(findImageModel(null)).toBeNull()
    expect(findImageModel('')).toBeNull()
    expect(findImageModel('openai:some-retired-model')).toBeNull()
    expect(labelForImageModel('nonsense')).toBeNull()
  })

  it('guards the background parameter', () => {
    expect(isImageBackground('transparent')).toBe(true)
    expect(isImageBackground('auto')).toBe(true)
    expect(isImageBackground('rainbow')).toBe(false)
    expect(isImageBackground(undefined)).toBe(false)
  })
})

describe('resolution order', () => {
  it('honours what the single request asked for', () => {
    const r = resolveImageModel({
      requested: 'openai:gpt-image-2.5-sunburst',
      accountDefault: DEFAULT_IMAGE_MODEL_ID,
      available: [...BOTH],
    })
    expect(r?.model.id).toBe('openai:gpt-image-2.5-sunburst')
    expect(r?.fellBack).toBe(false)
  })

  it('falls to the account default when the request named nothing', () => {
    const r = resolveImageModel({
      accountDefault: 'openai:gpt-image-2.5-flare',
      available: [...BOTH],
    })
    expect(r?.model.id).toBe('openai:gpt-image-2.5-flare')
    expect(r?.fellBack).toBe(false)
  })

  it('says so when a request names a provider with no key', () => {
    const r = resolveImageModel({
      requested: 'openai:gpt-image-2.5-flare',
      accountDefault: DEFAULT_IMAGE_MODEL_ID,
      available: [...GOOGLE_ONLY],
    })
    expect(r?.model.provider).toBe('google')
    expect(r?.fellBack).toBe(true)
    expect(r?.reason).toBe('no-key')
  })

  it('lands on something callable when neither the request nor the default is', () => {
    const r = resolveImageModel({
      requested: 'google:gemini-2.5-flash-image',
      accountDefault: 'google:gemini-3.1-flash-image-preview',
      available: [...OPENAI_ONLY],
    })
    expect(r?.model.provider).toBe('openai')
    expect(r?.fellBack).toBe(true)
  })

  it('returns null when there is no key at all', () => {
    expect(resolveImageModel({ available: [] })).toBeNull()
  })
})

describe('transparency overrides everything', () => {
  it('refuses to hand a transparent request to a model that cannot do it', () => {
    const r = resolveImageModel({
      requested: 'google:gemini-3.1-flash-image-preview',
      accountDefault: 'google:gemini-3.1-flash-image-preview',
      available: [...BOTH],
      needsTransparency: true,
    })
    expect(r?.model.supportsTransparency).toBe(true)
    expect(r?.fellBack).toBe(true)
    expect(r?.reason).toBe('needs-transparency')
  })

  it('moves off a Gemini account default rather than returning an opaque sticker', () => {
    const r = resolveImageModel({
      accountDefault: DEFAULT_IMAGE_MODEL_ID,
      available: [...BOTH],
      needsTransparency: true,
    })
    expect(r?.model.provider).toBe('openai')
  })

  it('fails outright rather than silently dropping the request', () => {
    // Google-only account, transparent asked for: there is nothing that can do it,
    // and the caller has to say why rather than quietly return a backdrop.
    expect(resolveImageModel({
      accountDefault: DEFAULT_IMAGE_MODEL_ID,
      available: [...GOOGLE_ONLY],
      needsTransparency: true,
    })).toBeNull()
  })

  it('keeps an explicitly chosen transparent-capable model', () => {
    const r = resolveImageModel({
      requested: 'openai:gpt-image-2.5-sunburst',
      available: [...BOTH],
      needsTransparency: true,
    })
    expect(r?.model.id).toBe('openai:gpt-image-2.5-sunburst')
    expect(r?.fellBack).toBe(false)
  })
})
