/**
 * Voice opened from a card
 *
 * The card asked for the open card's context to be prioritised immediately. Two
 * things have to be true for that: Kan has to actually receive what the card SAYS
 * (not just its name), and it has to arrive before the workspace dump rather than
 * buried after every channel, card and task in the account.
 */
import { describe, it, expect } from 'vitest'
import { buildVoiceSystemPrompt } from '../lib/ai/voicePrompt'
import type { Card, Channel, Task } from '../lib/types'

const CARD_ID = 'card-focus'
const OTHER_CARD_ID = 'card-other'

const channel = {
  id: 'chan-1',
  name: 'Word Study',
  columns: [{ id: 'col-1', name: 'Inbox', cardIds: [CARD_ID, OTHER_CARD_ID], taskIds: [], itemOrder: [] }],
} as unknown as Channel

const focusedCard = {
  id: CARD_ID,
  channelId: 'chan-1',
  title: 'Word study lesson',
  summary: 'Weekly phonics practice for Lennon',
  messages: [
    { id: 'm1', type: 'note', content: 'Roll and spell worksheet, Thursday', createdAt: '2026-09-01T00:00:00Z' },
    { id: 'm2', type: 'ai_response', content: 'We could make a dice-rolling typing game', createdAt: '2026-09-01T00:01:00Z' },
  ],
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
} as unknown as Card

const otherCard = {
  id: OTHER_CARD_ID,
  channelId: 'chan-1',
  title: 'Unrelated card',
  messages: [],
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
} as unknown as Card

const task = {
  id: 't1',
  cardId: CARD_ID,
  channelId: 'chan-1',
  title: 'Pick the word bank',
  status: 'not_started',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
} as unknown as Task

function build(focus?: { channelId: string; cardId?: string; cardTitle?: string }) {
  return buildVoiceSystemPrompt({
    channelList: [channel],
    cards: { [CARD_ID]: focusedCard, [OTHER_CARD_ID]: otherCard },
    tasks: { t1: task },
    folders: {},
    folderOrder: [],
    channelOrder: ['chan-1'],
    session: { user: { id: 'u1', name: 'Dustin', email: 'd@example.com' } },
    focus,
  })
}

describe('voice prompt with a focused card', () => {
  it('includes what the card actually says, not just its title', () => {
    const prompt = build({ channelId: 'chan-1', cardId: CARD_ID })
    expect(prompt).toContain('Roll and spell worksheet, Thursday')
    expect(prompt).toContain('dice-rolling typing game')
  })

  it('includes the card summary and its tasks', () => {
    const prompt = build({ channelId: 'chan-1', cardId: CARD_ID })
    expect(prompt).toContain('Weekly phonics practice for Lennon')
    expect(prompt).toContain('Pick the word bank')
  })

  it('puts the focused card ahead of the workspace listing', () => {
    const prompt = build({ channelId: 'chan-1', cardId: CARD_ID })
    const focusAt = prompt.indexOf('THE USER IS ON THIS CARD RIGHT NOW')
    const workspaceAt = prompt.indexOf('WORKSPACE (')
    expect(focusAt).toBeGreaterThan(-1)
    expect(workspaceAt).toBeGreaterThan(-1)
    // Buried focus was the bug — it must come first.
    expect(focusAt).toBeLessThan(workspaceAt)
  })

  it('tells Kan to open on the card rather than ask what they want', () => {
    const prompt = build({ channelId: 'chan-1', cardId: CARD_ID })
    expect(prompt).toMatch(/reference something specific from it/i)
  })

  it('still lets the conversation go elsewhere', () => {
    const prompt = build({ channelId: 'chan-1', cardId: CARD_ID })
    expect(prompt).toMatch(/this is where to start, not a fence/i)
  })

  it('carries the ids the tools need', () => {
    const prompt = build({ channelId: 'chan-1', cardId: CARD_ID })
    expect(prompt).toContain(`cardId: ${CARD_ID}`)
    expect(prompt).toContain('channelId: chan-1')
  })

  it('falls back to a channel focus when opened without a card', () => {
    const prompt = build({ channelId: 'chan-1' })
    expect(prompt).toContain('THE USER IS IN THE "Word Study" CHANNEL RIGHT NOW')
    expect(prompt).not.toContain('THE USER IS ON THIS CARD RIGHT NOW')
  })

  it('says nothing about focus when voice is opened from nowhere in particular', () => {
    const prompt = build(undefined)
    expect(prompt).not.toContain('THE USER IS ON THIS CARD RIGHT NOW')
    expect(prompt).not.toContain('CHANNEL RIGHT NOW')
    // The workspace is still there — losing focus must not lose the board.
    expect(prompt).toContain('WORKSPACE (')
  })

  it('handles a focused card that has nothing written on it', () => {
    const prompt = build({ channelId: 'chan-1', cardId: OTHER_CARD_ID })
    expect(prompt).toContain('nothing written on it yet')
  })
})
