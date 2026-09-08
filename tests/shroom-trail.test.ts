/**
 * Shroom trails
 *
 * The trail replaces the graph view, so the bar it has to clear is honesty: every
 * shape a shroom can take must either be drawn correctly or be visibly absent. A
 * confidently wrong map is exactly what got deleted.
 */
import { describe, it, expect } from 'vitest'
import { buildShroomTrail, describeTrail } from '../lib/shrooms/trail'
import type { Channel, InstructionCard } from '../lib/types'

const channel = {
  id: 'ch1',
  columns: [
    { id: 'col-inbox', name: 'Inbox', cardIds: [], taskIds: [], itemOrder: [] },
    { id: 'col-draft', name: 'Drafting', cardIds: [], taskIds: [], itemOrder: [] },
    { id: 'col-ready', name: 'Ready', cardIds: [], taskIds: [], itemOrder: [] },
  ],
} as unknown as Channel

const base = {
  id: 's1',
  channelId: 'ch1',
  title: 'A shroom',
  instructions: 'Do the thing.',
  action: 'modify',
  target: { type: 'column', columnId: 'col-inbox' },
  runMode: 'manual',
  createdAt: '',
  updatedAt: '',
} as unknown as InstructionCard

const make = (over: Partial<InstructionCard>) => ({ ...base, ...over }) as InstructionCard

describe('buildShroomTrail', () => {
  it('draws a single-column shroom as one stop', () => {
    const t = buildShroomTrail(make({}), channel)
    expect(t.stops).toHaveLength(1)
    expect(t.stops[0].columnName).toBe('Inbox')
  })

  it('draws every column of a multi-column target', () => {
    const t = buildShroomTrail(
      make({ target: { type: 'columns', columnIds: ['col-inbox', 'col-ready'] } }),
      channel
    )
    expect(t.stops.map((s) => s.columnName)).toEqual(['Inbox', 'Ready'])
  })

  it('keeps steps in order, which two colours could not express', () => {
    const t = buildShroomTrail(
      make({
        steps: [
          { action: 'modify', targetColumnId: 'col-inbox', description: 'tags it' },
          { action: 'move', targetColumnId: 'col-draft', description: 'moves it here' },
        ],
      }),
      channel
    )
    expect(t.stops.map((s) => s.columnName)).toEqual(['Inbox', 'Drafting'])
    expect(t.stops[0].verb).toBe('tags it')
  })

  it('prefers steps over the top-level action when both exist', () => {
    const t = buildShroomTrail(
      make({
        action: 'generate',
        steps: [{ action: 'move', targetColumnId: 'col-ready', description: '' }],
      }),
      channel
    )
    expect(t.stops).toHaveLength(1)
    expect(t.stops[0].columnName).toBe('Ready')
  })

  it('sends a report off the board rather than onto a column', () => {
    const t = buildShroomTrail(make({ action: 'report' }), channel)
    expect(t.stops[0].offBoard).toBe('report')
    expect(t.stops[0].columnId).toBeNull()
  })

  it('says a generate lands in review when it is not auto-approved', () => {
    const t = buildShroomTrail(
      make({ action: 'generate', autoApprove: false, target: { type: 'column', columnId: 'col-inbox' } }),
      channel
    )
    expect(t.stops[0].offBoard).toBe('review')
  })

  it('does not say review when the generate is auto-approved', () => {
    const t = buildShroomTrail(
      make({ action: 'generate', autoApprove: true, target: { type: 'column', columnId: 'col-inbox' } }),
      channel
    )
    expect(t.stops[0].offBoard).toBeUndefined()
  })

  it('draws a board-wide shroom as one stop, not as every column lit', () => {
    const t = buildShroomTrail(make({ target: { type: 'board' } }), channel)
    expect(t.stops).toHaveLength(1)
    expect(t.stops[0].columnId).toBeNull()
    expect(t.stops[0].verb).toMatch(/anywhere on the board/)
  })

  it('reads everything when no context columns are set', () => {
    expect(buildShroomTrail(make({}), channel).readsEverything).toBe(true)
  })

  it('lists context columns it only reads', () => {
    const t = buildShroomTrail(
      make({ contextColumns: { type: 'columns', columnIds: ['col-ready'] } }),
      channel
    )
    expect(t.readsEverything).toBe(false)
    expect(t.readsColumnIds).toEqual(['col-ready'])
  })

  it('does not colour a column twice when it is both read and acted on', () => {
    const t = buildShroomTrail(
      make({ contextColumns: { type: 'columns', columnIds: ['col-inbox', 'col-ready'] } }),
      channel
    )
    // col-inbox is the target, so it is a stop and must not also be a context read.
    expect(t.readsColumnIds).toEqual(['col-ready'])
  })

  it('flags a conditional shroom, since a drawing cannot show "sometimes"', () => {
    expect(buildShroomTrail(make({ instructions: 'Move it if it looks like marketing.' }), channel).conditional).toBe(true)
    expect(buildShroomTrail(make({ instructions: 'Rewrite every card.' }), channel).conditional).toBe(false)
  })

  it('survives a column that no longer exists', () => {
    const t = buildShroomTrail(make({ target: { type: 'column', columnId: 'gone' } }), channel)
    expect(t.stops[0].columnName).toBeNull()
  })
})

describe('describeTrail', () => {
  it('joins stops in order', () => {
    const t = buildShroomTrail(
      make({
        steps: [
          { action: 'modify', targetColumnId: 'col-inbox', description: 'tags it' },
          { action: 'move', targetColumnId: 'col-draft', description: 'moves it here' },
        ],
      }),
      channel
    )
    expect(describeTrail(t)).toBe('tags it · Inbox, then moves it here · Drafting')
  })

  it('hedges when the shroom decides per card', () => {
    const t = buildShroomTrail(make({ instructions: 'Only move it if it is stale.' }), channel)
    expect(describeTrail(t).startsWith('may ')).toBe(true)
  })
})
