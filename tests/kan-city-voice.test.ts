import { describe, expect, it } from 'vitest'
import { spokenText } from '@/components/kan/city/useCityVoice'
import { draftEmailTool } from '@/lib/kan/agent/tools'

describe('Kan City voice: what Kan says out loud', () => {
  it('drops markdown, links and lists but keeps the words', () => {
    const md = '## Done\n\n- Made a card **Call Tim** in [Work](/channel/abc)\n- Ran the bot\n\nSee https://example.com for more.'
    expect(spokenText(md)).toBe('Done Made a card Call Tim in Work Ran the bot See for more.')
  })

  it('stops at a sentence when the reply is long', () => {
    const md = `${'This is a sentence. '.repeat(60)}`
    const out = spokenText(md, 200)
    expect(out.length).toBeLessThanOrEqual(200)
    expect(out.endsWith('.')).toBe(true)
  })

  it('says nothing for a reply that is only code', () => {
    expect(spokenText('```ts\nconst x = 1\n```')).toBe('')
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
