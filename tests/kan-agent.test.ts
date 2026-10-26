import { describe, expect, it } from 'vitest'
import { pastTense } from '../lib/kan/agent/events'
import { agentTools, toJsonSchema } from '../lib/kan/agent/tools'

describe('kan agent', () => {
  it('turns voice declarations into JSON Schema Claude and OpenAI accept', () => {
    expect(toJsonSchema({ type: 'OBJECT', properties: { ids: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['ids'] }))
      .toEqual({ type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] })
  })

  it('says what a step did once it is done', () => {
    expect(pastTense('Searching Work for “deploy”')).toBe('Searched Work for “deploy”')
    expect(pastTense('Handing “X” to Claude Code')).toBe('Handed “X” to Claude Code')
  })

  it('offers Claude Code handoff only where the Work channel is reachable, and Mixpanel only to admins', () => {
    const names = (readable: string[], isAdmin: boolean) => agentTools({ readable, isAdmin }).map((t) => t.name)
    expect(names([], false)).not.toContain('hand_to_claude_code')
    expect(names(['64eQst0Zx_iYYN4QJLWw3'], true)).toContain('hand_to_claude_code')
    expect(names([], false)).not.toContain('query_mixpanel')
    expect(names([], false)).not.toContain('draft_email')
    expect(names([], false)).toContain('suggest')
  })
})
