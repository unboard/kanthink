import { describe, it, expect } from 'vitest'
import {
  resolveCapabilities,
  resolveInputRequirements,
  explainScopeConflict,
  canRunOnSingleCard,
  describeScope,
  cardIdsForTarget,
  type ShroomScope,
} from '../lib/shrooms/invocation'
import type { Channel, InstructionCard } from '../lib/types'

function shroom(over: Partial<InstructionCard> = {}): InstructionCard {
  return {
    id: 's1',
    channelId: 'c1',
    title: 'Expand into PRD',
    instructions: 'Expand the card into a product brief.',
    action: 'modify',
    target: { type: 'column', columnId: 'col1' },
    runMode: 'manual',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
    ...over,
  }
}

describe('capabilities are a stored decision, not a guess about the prose', () => {
  it('leaves an un-narrowed shroom unrestricted', () => {
    // The old behaviour inferred these from keywords, so a shroom whose wording happened
    // to omit "task" was told NOT to make tasks. Absent config must not narrow anything.
    expect(resolveCapabilities(shroom())).toEqual({
      tasks: true,
      tags: true,
      properties: true,
      assignment: true,
    })
  })

  it('honours a narrowed ceiling exactly', () => {
    const caps = { tasks: true, tags: false, properties: false, assignment: false }
    expect(resolveCapabilities(shroom({ capabilities: caps }))).toEqual(caps)
  })

  it('does not read the instructions at all', () => {
    // "categorize" used to silently unlock property writing; "checklist" unlocked tasks.
    const wordy = shroom({
      instructions: 'Categorize the metadata, label it, and assign an owner with a checklist.',
      capabilities: { tasks: false, tags: false, properties: false, assignment: false },
    })
    expect(resolveCapabilities(wordy)).toEqual({
      tasks: false,
      tags: false,
      properties: false,
      assignment: false,
    })
  })
})

describe('input requirements decide whether a scope makes sense', () => {
  it('defaults by action when the shroom declares nothing', () => {
    expect(resolveInputRequirements(shroom({ action: 'modify' })).minCards).toBe(1)
    expect(resolveInputRequirements(shroom({ action: 'move' })).minCards).toBe(1)
    expect(resolveInputRequirements(shroom({ action: 'report' })).minCards).toBe(2)
    expect(resolveInputRequirements(shroom({ action: 'generate' })).minCards).toBe(0)
  })

  it('lets a modify shroom refuse a single card for its own reason', () => {
    // The point of declaring requirements: "pick the best of these" is ill-defined on one
    // card, and no switch on `action` could ever know that.
    const ranker = shroom({
      title: 'Pick the standout',
      inputRequirements: {
        minCards: 2,
        reason: 'Picks the strongest of several ideas, so it needs at least two to compare.',
      },
    })
    expect(canRunOnSingleCard(ranker)).toBe(false)
    expect(explainScopeConflict(ranker, 1)).toBe(
      'Picks the strongest of several ideas, so it needs at least two to compare.'
    )
    expect(explainScopeConflict(ranker, 2)).toBeNull()
  })

  it('falls back to a readable sentence when no reason was written', () => {
    const report = shroom({ title: 'Weekly digest', action: 'report' })
    expect(explainScopeConflict(report, 1)).toContain('Weekly digest')
    expect(explainScopeConflict(report, 1)).toContain('at least 2 cards')
  })

  it('lets a generate shroom take a single card as a seed', () => {
    // Previously blocked outright by a hardcoded action check.
    expect(canRunOnSingleCard(shroom({ action: 'generate' }))).toBe(true)
    expect(explainScopeConflict(shroom({ action: 'generate' }), 0)).toBeNull()
  })
})

describe('the scope is stated to the model', () => {
  const scope = (over: Partial<ShroomScope>): ShroomScope => ({
    cardIds: ['a'],
    kind: 'card',
    ...over,
  })

  it('tells the model a column reference in the instructions is not the current scope', () => {
    // The whole reason this exists: a shroom written as "write a PRD for everything in
    // Inbox" gets run on one card from a thread.
    const text = describeScope(scope({}))
    expect(text).toContain('single card')
    expect(text).toMatch(/where this shroom usually runs/)
    expect(text).toContain('Apply them to the cards in this run and nothing else.')
  })

  it('distinguishes a selection from a whole column', () => {
    expect(describeScope(scope({ cardIds: ['a', 'b', 'c'], kind: 'selection' }))).toContain(
      'a selection, not a whole column'
    )
    expect(
      describeScope(scope({ cardIds: ['a', 'b'], kind: 'column', columnNames: ['Inbox'] }))
    ).toContain('everything currently in Inbox')
  })

  it('does not tell a generate shroom to work through its seed cards', () => {
    const text = describeScope(scope({}), 'seed')
    expect(text).toContain('starting point')
    expect(text).not.toContain('Apply them to the cards')
  })
})

describe('a target resolves to the cards it stands for', () => {
  const channel = {
    id: 'c1',
    columns: [
      { id: 'col1', name: 'Inbox', cardIds: ['a', 'b'] },
      { id: 'col2', name: 'Done', cardIds: ['c'] },
    ],
  } as unknown as Channel

  it('reads one column, several columns, or the whole board', () => {
    expect(cardIdsForTarget({ type: 'column', columnId: 'col1' }, channel)).toEqual(['a', 'b'])
    expect(cardIdsForTarget({ type: 'columns', columnIds: ['col2'] }, channel)).toEqual(['c'])
    expect(cardIdsForTarget({ type: 'board' }, channel)).toEqual(['a', 'b', 'c'])
  })
})
