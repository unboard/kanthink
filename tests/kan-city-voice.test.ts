import { describe, expect, it } from 'vitest'
import { draftEmailTool } from '@/lib/kan/agent/tools'
import { cityVoicePrompt, cityVoiceTools, jobDoneNote } from '@/lib/kan/city/voice'
import { buildSpokenNote, toOpenAITools } from '@/lib/voice/liveProviders'

describe('Kan City voice: live talk, work in the background', () => {
  it('gives the live model one tool that hands work to the city', () => {
    const [block] = cityVoiceTools(false)
    expect(block).toHaveProperty('functionDeclarations')
    const names = (block as { functionDeclarations: { name: string }[] }).functionDeclarations.map((d) => d.name)
    expect(names).toEqual(['city_job'])
    expect(cityVoiceTools(true)).toContainEqual({ googleSearch: {} })
    expect(toOpenAITools(cityVoiceTools(false) as never).map((t) => t.name)).toEqual(['city_job'])
  })

  it('tells Kan to keep talking while a job runs and never to claim it done early', () => {
    const p = cityVoicePrompt({ name: 'Dustin Hodge', plots: [{ name: 'Work', cards: 12, bot: 'working' }], search: false })
    expect(p).toMatch(/keep the conversation going/)
    expect(p).toMatch(/Never say a job is finished until its \[Job done\] note/)
    expect(p).toMatch(/- Work \(12 cards, bot working\)/)
    expect(p).toMatch(/cannot search the web/)
  })

  it('reports a landed job with what changed, and a failed one plainly', () => {
    expect(jobDoneNote({ ask: 'Card for Tim', reply: 'Made it.', did: ['Made a card'] })).toMatch(/What changed: Made a card/)
    expect(jobDoneNote({ ask: 'x', reply: null, did: [], error: 'No key' })).toMatch(/failed: No key/)
  })

  it('makes the model speak after a spoken note, on both providers', () => {
    expect(buildSpokenNote('openai', 'hi').at(-1)).toEqual({ type: 'response.create' })
    expect(buildSpokenNote('google', 'hi')[0]).toMatchObject({ clientContent: { turnComplete: true } })
  })
})

describe('Kan City: emails are drafts, never sent by Kan', () => {
  const ctx = { userId: 'u', isAdmin: false, readable: [], sessionCardIds: [], recentTurns: [] }

  it('hands the draft to the screen and tells Kan it has not been sent', async () => {
    const out = await draftEmailTool.run({ to: 'tim@example.com', subject: 'Proof is ready', body: 'Hi Tim', recipientName: 'Tim' }, ctx)
    expect(out.email).toMatchObject({ to: 'tim@example.com', subject: 'Proof is ready', status: 'ready', style: 'professional' })
    expect(out.content).toMatch(/NOT been sent/)
    expect(draftEmailTool.kind).toBe('read')
  })

  it('refuses a draft with no recipient', async () => {
    const out = await draftEmailTool.run({ subject: 'x', body: 'y' }, ctx)
    expect(out.isError).toBe(true)
    expect(out.email).toBeUndefined()
  })
})
