import { describe, it, expect } from 'vitest'
import { messageToAskKanAbout } from '@/lib/chat/askKan'

const me = 'user-1'
const note = (over: Record<string, unknown> = {}) => ({ id: 'n1', type: 'note', content: 'hello', authorId: me, ...over })

describe('messageToAskKanAbout', () => {
  it('offers your latest note', () => {
    expect(messageToAskKanAbout([note()], me)?.id).toBe('n1')
  })

  it('never offers Kan’s own message', () => {
    expect(messageToAskKanAbout([note(), { id: 'a1', type: 'ai_response', content: 'hi' }], me)).toBeNull()
  })

  it('never offers someone else’s message', () => {
    expect(messageToAskKanAbout([note({ authorId: 'user-2' })], me)).toBeNull()
  })

  it('only looks at the last message', () => {
    expect(messageToAskKanAbout([note(), note({ id: 'n2', authorId: 'user-2' })], me)).toBeNull()
  })

  it('offers a question Kan never answered, as a retry', () => {
    expect(messageToAskKanAbout([note({ type: 'question' })], me)?.id).toBe('n1')
  })

  it('skips shroom runs and empty messages', () => {
    expect(messageToAskKanAbout([note({ shroomRunId: 's1' })], me)).toBeNull()
    expect(messageToAskKanAbout([note({ content: '  ' })], me)).toBeNull()
    expect(messageToAskKanAbout([note({ content: '', imageUrls: ['x'] })], me)?.id).toBe('n1')
  })

  it('treats a message with no author as yours', () => {
    expect(messageToAskKanAbout([note({ authorId: undefined })], me)?.id).toBe('n1')
  })

  it('offers nothing on an empty thread', () => {
    expect(messageToAskKanAbout([], me)).toBeNull()
  })
})
