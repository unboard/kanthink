import { describe, it, expect } from 'vitest'
import { buildShroomGraph, capabilityBadges } from '../lib/shrooms/graph'
import type { Channel, InstructionCard } from '../lib/types'

function shroom(over: Partial<InstructionCard> & { id: string; title: string }): InstructionCard {
  return {
    channelId: 'c1',
    instructions: 'Do the thing.',
    action: 'modify',
    target: { type: 'column', columnId: 'col1' },
    runMode: 'manual',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
    ...over,
  }
}

const channels: Record<string, Channel> = {
  c1: {
    id: 'c1',
    name: 'Ideas',
    columns: [
      { id: 'col1', name: 'Inbox', cardIds: [] },
      { id: 'col2', name: 'Done', cardIds: [] },
    ],
  } as unknown as Channel,
}

describe('chains lay out left to right', () => {
  it('puts each hop one band further right', () => {
    const g = buildShroomGraph(
      [
        shroom({ id: 'a', title: 'Research', nextInstructionId: 'b' }),
        shroom({ id: 'b', title: 'Summarise', nextInstructionId: 'c' }),
        shroom({ id: 'c', title: 'File' }),
      ],
      channels
    )
    const depth = Object.fromEntries(g.nodes.map((n) => [n.id, n.depth]))
    expect(depth).toEqual({ a: 0, b: 1, c: 2 })
    expect(g.columns).toBe(3)
    expect(g.edges.map((e) => `${e.from}->${e.to}`)).toEqual(['a->b', 'b->c'])
  })

  it('places a node to the right of the longest path that reaches it', () => {
    // Two roots converge on 'end'. It belongs after the longer branch, not the shorter.
    const g = buildShroomGraph(
      [
        shroom({ id: 'short', title: 'Short', nextInstructionId: 'end' }),
        shroom({ id: 'long1', title: 'Long one', nextInstructionId: 'long2' }),
        shroom({ id: 'long2', title: 'Long two', nextInstructionId: 'end' }),
        shroom({ id: 'end', title: 'End' }),
      ],
      channels
    )
    expect(g.nodes.find((n) => n.id === 'end')!.depth).toBe(2)
  })

  it('stacks siblings in the same band on separate rows', () => {
    const g = buildShroomGraph(
      [shroom({ id: 'a', title: 'Alpha' }), shroom({ id: 'b', title: 'Beta' })],
      channels
    )
    expect(g.nodes.map((n) => n.row).sort()).toEqual([0, 1])
    expect(g.rows).toBe(2)
  })

  it('ignores a chain that points off this board', () => {
    const g = buildShroomGraph([shroom({ id: 'a', title: 'Alpha', nextInstructionId: 'elsewhere' })], channels)
    expect(g.edges).toHaveLength(0)
    expect(g.nodes[0].warnings.map((w) => w.kind)).toContain('dangling-chain')
  })
})

describe('what the graph catches that a list cannot', () => {
  it('flags an arity mismatch as a broken wire', () => {
    // A generate shroom making one card, feeding one that needs two to compare. Today
    // you find this out by running it.
    const g = buildShroomGraph(
      [
        shroom({ id: 'one', title: 'Draft one idea', action: 'generate', cardCount: 1, nextInstructionId: 'rank' }),
        shroom({
          id: 'rank',
          title: 'Pick the best',
          inputRequirements: { minCards: 2, reason: 'Compares ideas.' },
        }),
      ],
      channels
    )
    const rank = g.nodes.find((n) => n.id === 'rank')!
    expect(rank.warnings).toContainEqual({
      kind: 'arity',
      detail: 'Needs 2 cards, but “Draft one idea” only ever produces 1.',
    })
    expect(g.edges[0].broken).toBe(true)
  })

  it('does not cry wolf when the upstream count is unknowable', () => {
    // modify passes through whatever it was handed, so nothing can be proven wrong here.
    const g = buildShroomGraph(
      [
        shroom({ id: 'tidy', title: 'Tidy up', action: 'modify', nextInstructionId: 'rank' }),
        shroom({ id: 'rank', title: 'Pick the best', inputRequirements: { minCards: 2 } }),
      ],
      channels
    )
    expect(g.nodes.find((n) => n.id === 'rank')!.warnings).toEqual([])
    expect(g.edges[0].broken).toBe(false)
  })

  it('detects a loop instead of hanging on it', () => {
    const g = buildShroomGraph(
      [
        shroom({ id: 'a', title: 'A', nextInstructionId: 'b' }),
        shroom({ id: 'b', title: 'B', nextInstructionId: 'a' }),
      ],
      channels
    )
    expect(g.nodes.every((n) => n.warnings.some((w) => w.kind === 'cycle'))).toBe(true)
  })

  it('says when nothing can start a shroom', () => {
    const orphan = buildShroomGraph([shroom({ id: 'a', title: 'Orphan' })], channels)
    expect(orphan.nodes[0].reachable).toBe(false)

    const fed = buildShroomGraph(
      [
        shroom({ id: 'a', title: 'Alpha', nextInstructionId: 'b' }),
        shroom({ id: 'b', title: 'Beta' }),
      ],
      channels
    )
    expect(fed.nodes.find((n) => n.id === 'b')!.reachable).toBe(true)
  })
})

describe('entry points read the way a person would say them', () => {
  it('names the watched column', () => {
    const g = buildShroomGraph(
      [
        shroom({
          id: 'a',
          title: 'Sort',
          isEnabled: true,
          triggers: [{ type: 'event', eventType: 'card_created_in', columnId: 'col1' }],
        }),
      ],
      channels
    )
    expect(g.nodes[0].entry).toBe('column')
    expect(g.nodes[0].entryLabel).toBe('Inbox')
  })

  it('spells out a schedule, and treats a disabled one as manual', () => {
    const live = buildShroomGraph(
      [
        shroom({
          id: 'a',
          title: 'Digest',
          isEnabled: true,
          triggers: [{ type: 'scheduled', interval: 'daily', specificTime: '09:00' }],
        }),
      ],
      channels
    )
    expect(live.nodes[0].entryLabel).toBe('Every day at 09:00')

    const off = buildShroomGraph(
      [
        shroom({
          id: 'a',
          title: 'Digest',
          isEnabled: false,
          triggers: [{ type: 'scheduled', interval: 'daily', specificTime: '09:00' }],
        }),
      ],
      channels
    )
    expect(off.nodes[0].entry).toBe('manual')
  })
})

describe('capability badges', () => {
  it('shows an un-narrowed shroom as fully capable', () => {
    expect(capabilityBadges(shroom({ id: 'a', title: 'A' }))).toEqual([
      'tasks',
      'tags',
      'props',
      'assign',
    ])
  })

  it('shows only what a narrowed shroom may do', () => {
    const narrowed = shroom({
      id: 'a',
      title: 'A',
      capabilities: { tasks: true, tags: false, properties: false, assignment: false },
    })
    expect(capabilityBadges(narrowed)).toEqual(['tasks'])
  })
})
