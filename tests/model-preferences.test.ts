/**
 * Which model runs where.
 *
 * The rules here decide what every AI call in the product actually uses, and the
 * failure they exist to prevent is silent: before keys were held per provider,
 * choosing an OpenAI model on a Google key ran Gemini and said nothing.
 */
import { describe, it, expect } from 'vitest'
import {
  resolveSurfaceModel,
  sanitizeOverrides,
  isAiSurface,
  EMPTY_PREFERENCES,
  type ModelPreferences,
} from '../lib/ai/modelPreferences'
import { resolveActiveModelId, getPlaygroundModel, PLAYGROUND_MODELS } from '../lib/playground/models'
import { MODEL_CATALOG, parseModelChoice } from '../lib/ai/modelCatalog'
import type { ProviderKeys } from '../lib/ai/keys'

const bothKeys: ProviderKeys = {
  openai: { apiKey: 'sk-test', source: 'byok' },
  google: { apiKey: 'goog-test', source: 'byok' },
}
const googleOnly: ProviderKeys = { google: { apiKey: 'goog-test', source: 'byok' } }
const openaiOnly: ProviderKeys = { openai: { apiKey: 'sk-test', source: 'byok' } }

const prefs = (overrides: Partial<ModelPreferences> = {}): ModelPreferences => ({
  ...EMPTY_PREFERENCES,
  ...overrides,
})

describe('resolveSurfaceModel', () => {
  it('uses the account default when no area says otherwise', () => {
    const resolved = resolveSurfaceModel(prefs({ default: 'google:gemini-3.8-flash' }), 'chat', bothKeys)
    expect(resolved).toMatchObject({ provider: 'google', model: 'gemini-3.8-flash', fellBack: false })
  })

  it('lets an area override the default', () => {
    const resolved = resolveSurfaceModel(
      prefs({ default: 'google:gemini-2.5-flash', overrides: { automations: 'openai:gpt-6-astra' } }),
      'automations',
      bothKeys,
    )
    expect(resolved).toMatchObject({ provider: 'openai', model: 'gpt-6-astra' })
  })

  it('leaves other areas on the default when one is overridden', () => {
    const preferences = prefs({
      default: 'google:gemini-2.5-flash',
      overrides: { automations: 'openai:gpt-6-astra' },
    })
    expect(resolveSurfaceModel(preferences, 'chat', bothKeys)).toMatchObject({
      model: 'gemini-2.5-flash',
    })
  })

  it('crosses providers freely once both keys are held', () => {
    // The whole point of two keys: the choice decides the provider, not the key.
    const resolved = resolveSurfaceModel(prefs({ default: 'openai:gpt-5.6-terra' }), 'chat', bothKeys)
    expect(resolved).toMatchObject({ provider: 'openai', fellBack: false })
  })

  it('says so when the chosen provider has no key, instead of quietly substituting', () => {
    const resolved = resolveSurfaceModel(prefs({ default: 'openai:gpt-6-astra' }), 'chat', googleOnly)
    expect(resolved?.provider).toBe('google')
    expect(resolved?.fellBack).toBe(true)
    expect(resolved?.requested).toEqual({ provider: 'openai', model: 'gpt-6-astra' })
  })

  it('does not claim a fallback when there was no preference to fall back from', () => {
    const resolved = resolveSurfaceModel(EMPTY_PREFERENCES, 'chat', googleOnly)
    expect(resolved?.fellBack).toBe(false)
  })

  it('returns nothing at all when there is no key anywhere', () => {
    expect(resolveSurfaceModel(prefs({ default: 'google:gemini-2.5-flash' }), 'chat', {})).toBeNull()
  })

  it('falls back to a model of a provider we actually hold', () => {
    const resolved = resolveSurfaceModel(prefs({ default: 'google:gemini-2.5-flash' }), 'chat', openaiOnly)
    expect(resolved?.provider).toBe('openai')
    // And to a real model id, not the name of one from the wrong provider.
    const group = MODEL_CATALOG.find((g) => g.provider === 'openai')!
    expect(group.models.some((m) => m.model === resolved!.model)).toBe(true)
  })
})

describe('sanitizeOverrides', () => {
  it('drops areas that do not exist', () => {
    expect(sanitizeOverrides({ chat: 'openai:gpt-5', nonsense: 'openai:gpt-5' })).toEqual({
      chat: 'openai:gpt-5',
    })
  })

  it('drops values that are not parseable choices', () => {
    expect(sanitizeOverrides({ chat: 'gpt-5', automations: 'nope:x', apps: '' })).toEqual({})
  })

  it('survives whatever arrives from a request body', () => {
    expect(sanitizeOverrides(null)).toEqual({})
    expect(sanitizeOverrides('chat')).toEqual({})
    expect(sanitizeOverrides(42)).toEqual({})
  })
})

describe('isAiSurface', () => {
  it('accepts the three areas offered and nothing else', () => {
    expect(isAiSurface('chat')).toBe(true)
    expect(isAiSurface('automations')).toBe(true)
    expect(isAiSurface('apps')).toBe(true)
    expect(isAiSurface('voice')).toBe(false)
    expect(isAiSurface(null)).toBe(false)
  })
})

describe('the app builder routing to a provider it holds a key for', () => {
  it('keeps a pinned model when it is pinned', () => {
    expect(resolveActiveModelId('gemini-2.5-pro', 'cosmetic', ['google'])).toBe('gemini-2.5-pro')
  })

  it('routes auto to Gemini when Google is available', () => {
    expect(resolveActiveModelId('auto', 'cosmetic', ['google', 'openai'])).toMatch(/^gemini-/)
    expect(resolveActiveModelId('auto', 'structural', ['google', 'openai'])).toMatch(/^gemini-/)
  })

  it('routes auto to OpenAI when that is the only key', () => {
    expect(resolveActiveModelId('auto', 'cosmetic', ['openai'])).toMatch(/^gpt-/)
    expect(resolveActiveModelId('auto', 'structural', ['openai'])).toMatch(/^gpt-/)
  })

  it('spends less on a cosmetic edit than a structural one', () => {
    for (const providers of [['google'], ['openai']] as const) {
      const cosmetic = getPlaygroundModel(resolveActiveModelId('auto', 'cosmetic', [...providers]))
      const structural = getPlaygroundModel(resolveActiveModelId('auto', 'structural', [...providers]))
      expect(cosmetic.pricing.output).toBeLessThan(structural.pricing.output)
    }
  })

  it('never routes to the virtual auto id', () => {
    for (const editType of ['cosmetic', 'behavior', 'structural', 'redesign', 'first'] as const) {
      expect(resolveActiveModelId('auto', editType, ['google'])).not.toBe('auto')
      expect(resolveActiveModelId('auto', editType, ['openai'])).not.toBe('auto')
    }
  })

  it('keeps the old behaviour when nobody says which providers are available', () => {
    // Called without the list — every existing caller before this change.
    expect(resolveActiveModelId('auto', 'cosmetic')).toMatch(/^gemini-/)
  })
})

describe('the catalogues agree with themselves', () => {
  it('gives every playground model a provider that matches its id', () => {
    for (const model of PLAYGROUND_MODELS) {
      if (model.isAuto) continue
      const expected = model.id.startsWith('gpt-') ? 'openai' : 'google'
      expect(model.provider, model.id).toBe(expected)
    }
  })

  it('has no duplicate ids across providers', () => {
    const ids = PLAYGROUND_MODELS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('parses every catalogue entry back to itself', () => {
    for (const group of MODEL_CATALOG) {
      for (const model of group.models) {
        expect(parseModelChoice(`${group.provider}:${model.model}`)).toEqual({
          provider: group.provider,
          model: model.model,
        })
      }
    }
  })

  it('names a default model that is actually in its own list', () => {
    for (const group of MODEL_CATALOG) {
      expect(group.models.some((m) => m.model === group.defaultModel), group.provider).toBe(true)
    }
  })
})

/**
 * The regression this file exists to prevent.
 *
 * An account that brought its own key and never set a default must keep running on
 * that key. Falling through to a shared key would change provider *and* start
 * metering someone against a quota their own key exists to avoid — silently, on a
 * deploy they did not ask anything of.
 */
describe('an account with its own key and no stated preference', () => {
  const ownGoogleSharedOpenAI: ProviderKeys = {
    openai: { apiKey: 'owner-key', source: 'owner' },
    google: { apiKey: 'users-own-key', source: 'byok' },
  }

  it('stays on the key the user brought', () => {
    const resolved = resolveSurfaceModel(EMPTY_PREFERENCES, 'chat', ownGoogleSharedOpenAI)
    expect(resolved?.provider).toBe('google')
  })

  it('holds for every area, not just chat', () => {
    for (const surface of ['chat', 'automations', 'apps'] as const) {
      expect(resolveSurfaceModel(EMPTY_PREFERENCES, surface, ownGoogleSharedOpenAI)?.provider).toBe('google')
    }
  })

  it('still honours an explicit choice of the shared provider', () => {
    // Preferring their own key is a fallback rule, not an override of what they asked for.
    const resolved = resolveSurfaceModel(
      prefs({ default: 'openai:gpt-5.6-terra' }),
      'chat',
      ownGoogleSharedOpenAI,
    )
    expect(resolved).toMatchObject({ provider: 'openai', model: 'gpt-5.6-terra', fellBack: false })
  })

  it('picks either one when both keys are the user’s own', () => {
    const resolved = resolveSurfaceModel(EMPTY_PREFERENCES, 'chat', bothKeys)
    expect(['openai', 'google']).toContain(resolved?.provider)
  })
})
