/**
 * Card duplication.
 *
 * The bug this pins down: duplicate was implemented as
 * `createCard({ title, initialMessage: messages[0].content })`, so a copy was
 * rebuilt from the card's opening note. Everything a shroom had appended to the
 * thread, and every task on the card, was dropped — duplicating an enriched card
 * silently handed back the card as it looked at creation.
 *
 * The other half is the part that must NOT carry over. A duplicate that
 * inherited the original's public share link would publish content nobody
 * chose to publish, so that one is worth a test of its own.
 */
import { describe, it, expect } from 'vitest'
import { buildCardDuplicate } from '@/lib/cards/duplicate'
import type { Card, Task } from '@/lib/types'

const T0 = '2026-01-01T00:00:00.000Z'
const NOW = '2026-08-31T12:00:00.000Z'

/** Deterministic ids so the result can be asserted on exactly. */
function counter() {
  let n = 0
  return () => `id${++n}`
}

/** A card that has been worked on: an original note plus two shroom passes. */
function enrichedCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    channelId: 'chan-1',
    title: 'Design the empty state',
    source: 'manual',
    createdAt: T0,
    updatedAt: NOW,
    messages: [
      { id: 'm1', type: 'note', content: 'Original note from the phone', createdAt: T0 },
      { id: 'm2', type: 'ai_response', content: 'Shroom pass one: three directions', createdAt: T0 },
      { id: 'm3', type: 'ai_response', content: 'Shroom pass two: picked direction B', createdAt: T0 },
    ],
    tags: ['design', 'question'],
    summary: 'Three directions explored, B chosen.',
    properties: [{ key: 'Effort', value: 'M' }],
    coverImageUrl: 'https://example.test/cover.png',
    color: 'violet',
    assignedTo: ['user-1'],
    hideCompletedTasks: true,
    processedByInstructions: { 'shroom-1': T0 },
    createdByInstructionId: 'shroom-0',
    taskIds: ['task-1', 'task-2'],
    ...overrides,
  } as Card
}

function tasks(): Task[] {
  return [
    {
      id: 'task-1',
      cardId: 'card-1',
      channelId: 'chan-1',
      title: 'Sketch direction B',
      description: 'Two frames',
      status: 'done',
      completedAt: NOW,
      createdAt: T0,
      updatedAt: NOW,
      notes: [{ id: 'n1', content: 'Done in Figma', createdAt: NOW }],
    },
    {
      id: 'task-2',
      cardId: 'card-1',
      channelId: 'chan-1',
      title: 'Write the copy',
      description: '',
      status: 'in_progress',
      createdAt: T0,
      updatedAt: NOW,
    },
  ] as Task[]
}

describe('buildCardDuplicate — what carries over', () => {
  it('copies the whole thread, not just the first message', () => {
    const { card } = buildCardDuplicate(enrichedCard(), [], NOW, counter())
    expect(card.messages.map((m) => m.content)).toEqual([
      'Original note from the phone',
      'Shroom pass one: three directions',
      'Shroom pass two: picked direction B',
    ])
  })

  it('gives the copied messages fresh ids so they cannot collide with the original', () => {
    const source = enrichedCard()
    const { card } = buildCardDuplicate(source, [], NOW, counter())
    const originalIds = source.messages.map((m) => m.id)
    for (const m of card.messages) expect(originalIds).not.toContain(m.id)
    expect(new Set(card.messages.map((m) => m.id)).size).toBe(3)
  })

  it('copies the tasks, repointed at the new card', () => {
    const { card, tasks: copied } = buildCardDuplicate(enrichedCard(), tasks(), NOW, counter())
    expect(copied).toHaveLength(2)
    expect(copied.map((t) => t.title)).toEqual(['Sketch direction B', 'Write the copy'])
    for (const t of copied) expect(t.cardId).toBe(card.id)
    expect(card.taskIds).toEqual(copied.map((t) => t.id))
  })

  it('keeps task state rather than resetting it to not_started', () => {
    const { tasks: copied } = buildCardDuplicate(enrichedCard(), tasks(), NOW, counter())
    expect(copied[0].status).toBe('done')
    expect(copied[0].completedAt).toBe(NOW)
    expect(copied[0].notes?.[0].content).toBe('Done in Figma')
    expect(copied[1].status).toBe('in_progress')
  })

  it('gives copied tasks fresh ids', () => {
    const { tasks: copied } = buildCardDuplicate(enrichedCard(), tasks(), NOW, counter())
    expect(copied.map((t) => t.id)).not.toContain('task-1')
    expect(copied.map((t) => t.id)).not.toContain('task-2')
  })

  it('carries the rest of the card body across', () => {
    const { card } = buildCardDuplicate(enrichedCard(), [], NOW, counter())
    expect(card.tags).toEqual(['design', 'question'])
    expect(card.summary).toBe('Three directions explored, B chosen.')
    expect(card.properties).toEqual([{ key: 'Effort', value: 'M' }])
    expect(card.coverImageUrl).toBe('https://example.test/cover.png')
    expect(card.color).toBe('violet')
    expect(card.assignedTo).toEqual(['user-1'])
    expect(card.hideCompletedTasks).toBe(true)
  })

  it('carries processedByInstructions, so shrooms that already ran do not re-run on the copy', () => {
    const { card } = buildCardDuplicate(enrichedCard(), [], NOW, counter())
    expect(card.processedByInstructions).toEqual({ 'shroom-1': T0 })
  })

  it('marks the copy in the title and gives it a new identity and timestamps', () => {
    const { card } = buildCardDuplicate(enrichedCard(), [], NOW, counter())
    expect(card.title).toBe('Design the empty state (copy)')
    expect(card.id).not.toBe('card-1')
    expect(card.createdAt).toBe(NOW)
    expect(card.updatedAt).toBe(NOW)
    expect(card.channelId).toBe('chan-1')
  })
})

describe('buildCardDuplicate — what must not carry over', () => {
  it('never inherits the share link, so duplicating cannot publish anything', () => {
    const source = enrichedCard({ isPublic: true, shareToken: 'public-token', shareTheme: 'dark' })
    const { card } = buildCardDuplicate(source, [], NOW, counter())
    expect(card.isPublic).toBe(false)
    expect(card.shareToken).toBeUndefined()
  })

  it('does not claim the channels the original spawned', () => {
    const source = enrichedCard({ spawnedChannelIds: ['chan-9'] })
    const { card } = buildCardDuplicate(source, [], NOW, counter())
    expect(card.spawnedChannelIds).toBeUndefined()
  })

  it('does not copy reactions — they were responses to the original', () => {
    const source = enrichedCard({ reactions: [{ emoji: '🔥', userIds: ['user-2'] }] })
    source.messages[0].reactions = [{ emoji: '👍', userIds: ['user-2'] }] as never
    const { card } = buildCardDuplicate(source, [], NOW, counter())
    expect(card.reactions).toBeUndefined()
    expect(card.messages[0].reactions).toBeUndefined()
  })

  it('does not copy in-flight processing state, so the copy has no false shimmer', () => {
    const source = enrichedCard({ isProcessing: true, processingStatus: 'Thinking…', reviewRunId: 'run-3' })
    const { card } = buildCardDuplicate(source, [], NOW, counter())
    expect(card.isProcessing).toBe(false)
    expect(card.processingStatus).toBeUndefined()
    expect(card.reviewRunId).toBeUndefined()
  })
})

describe('buildCardDuplicate — degenerate cards', () => {
  it('handles a card with no messages and no tasks', () => {
    const source = enrichedCard({ messages: [], taskIds: undefined })
    const { card, tasks: copied } = buildCardDuplicate(source, [], NOW, counter())
    expect(card.messages).toEqual([])
    expect(copied).toEqual([])
    expect(card.taskIds).toEqual([])
  })

  it('does not mutate the card it copied', () => {
    const source = enrichedCard()
    const before = JSON.stringify(source)
    buildCardDuplicate(source, tasks(), NOW, counter())
    expect(JSON.stringify(source)).toBe(before)
  })
})
