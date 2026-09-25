/**
 * Claude as a third provider.
 *
 * Nothing here calls the API. These pin the parts that fail silently when wrong:
 * a builder schema Claude's structured outputs would reject, a stored model choice
 * that no longer parses, and an Anthropic-only account routed to a model it cannot
 * call.
 */
import { describe, it, expect } from 'vitest'
import { toClaudeSchema, fallbackParams, imageBlock } from '@/lib/ai/anthropic'
import { parseModelChoice, providerGroup } from '@/lib/ai/modelCatalog'
import { resolveActiveModelId, getPlaygroundModel, PLAYGROUND_MODELS } from '@/lib/playground/models'

describe('toClaudeSchema', () => {
  const schema = {
    type: 'object',
    properties: {
      edits: {
        type: 'array',
        minItems: 1,
        items: { type: 'object', properties: { find: { type: 'string', maxLength: 10 }, pattern: { type: 'string' } }, required: ['find'] },
      },
      notes: { type: 'string' },
    },
    required: ['edits'],
  }
  const out = toClaudeSchema(schema) as any

  it('closes every object', () => {
    expect(out.additionalProperties).toBe(false)
    expect(out.properties.edits.items.additionalProperties).toBe(false)
  })

  it('drops the constraints structured outputs rejects', () => {
    expect(out.properties.edits.minItems).toBeUndefined()
    expect(out.properties.edits.items.properties.find.maxLength).toBeUndefined()
  })

  it('keeps a property that happens to be named like a keyword', () => {
    expect(out.properties.edits.items.properties.pattern).toEqual({ type: 'string' })
  })

  it('leaves optional fields optional and does not touch the input', () => {
    expect(out.required).toEqual(['edits'])
    expect((schema as any).additionalProperties).toBeUndefined()
  })
})

describe('Claude models', () => {
  it('parses a stored Anthropic choice', () => {
    expect(parseModelChoice('anthropic:claude-opus-5-5')).toEqual({ provider: 'anthropic', model: 'claude-opus-5-5' })
  })

  it('has a default that is one of its own models', () => {
    const group = providerGroup('anthropic')
    expect(group.models.map((m) => m.model)).toContain(group.defaultModel)
  })

  it('routes an Anthropic-only account to Claude, never to a model it cannot call', () => {
    for (const edit of ['cosmetic', 'structural', 'first'] as const) {
      const id = resolveActiveModelId('auto', edit, ['anthropic'])
      expect(getPlaygroundModel(id).provider).toBe('anthropic')
    }
  })

  it('offers Claude in the app builder with pricing', () => {
    const claude = PLAYGROUND_MODELS.filter((m) => m.provider === 'anthropic')
    expect(claude.length).toBeGreaterThan(0)
    for (const m of claude) expect(m.pricing.output).toBeGreaterThan(0)
  })

  it('turns on refusal fallbacks only where they are documented', () => {
    expect(fallbackParams('claude-fable-5-1').fallbacks).toBe('default')
    expect(fallbackParams('claude-haiku-4-5')).toEqual({})
  })

  it('sends data-URL images as base64 and web images by URL', () => {
    expect(imageBlock('data:image/png;base64,AAAA')?.source).toEqual({ type: 'base64', media_type: 'image/png', data: 'AAAA' })
    expect(imageBlock('https://x.test/a.png')?.source).toEqual({ type: 'url', url: 'https://x.test/a.png' })
    expect(imageBlock('blob:nope')).toBeNull()
  })
})
