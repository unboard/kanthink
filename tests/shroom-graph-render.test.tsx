import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShroomGraph } from '../components/shrooms/ShroomGraph'
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
    columns: [{ id: 'col1', name: 'Inbox', cardIds: [] }],
  } as unknown as Channel,
}

const noop = () => {}

/** Coordinates of every node rect, read back out of the rendered SVG. */
function nodeTransforms(html: string): { x: number; y: number }[] {
  return [...html.matchAll(/translate\((\d+(?:\.\d+)?) (\d+(?:\.\d+)?)\)/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
  }))
}

describe('the canvas draws what the model says', () => {
  it('renders a chain left to right, with a wire between the hops', () => {
    const html = renderToStaticMarkup(
      <ShroomGraph
        shrooms={[
          shroom({ id: 'a', title: 'Research', nextInstructionId: 'b' }),
          shroom({ id: 'b', title: 'Summarise' }),
        ]}
        channels={channels}
        onOpen={noop}
      />
    )

    expect(html).toContain('Research')
    expect(html).toContain('Summarise')

    const positions = nodeTransforms(html)
    expect(positions).toHaveLength(2)
    // Second node sits in the next band along, on the same row.
    expect(positions[1].x).toBeGreaterThan(positions[0].x)
    expect(positions[0].y).toBe(positions[1].y)

    // One wire, drawn as a cubic curve.
    expect(html.match(/ C /g) ?? []).toHaveLength(1)
  })

  it('draws a broken wire when the downstream shroom cannot be fed', () => {
    const html = renderToStaticMarkup(
      <ShroomGraph
        shrooms={[
          shroom({ id: 'one', title: 'Draft one', action: 'generate', cardCount: 1, nextInstructionId: 'rank' }),
          shroom({ id: 'rank', title: 'Rank them', inputRequirements: { minCards: 2 } }),
        ]}
        channels={channels}
        onOpen={noop}
      />
    )
    // Rose stroke and a dashed wire are how "this cannot work" is shown.
    expect(html).toContain('#f43f5e')
    expect(html).toContain('stroke-dasharray="5 4"')
  })

  it('says what a node needs and what it may do', () => {
    const html = renderToStaticMarkup(
      <ShroomGraph
        shrooms={[
          shroom({
            id: 'a',
            title: 'Expand',
            capabilities: { tasks: true, tags: false, properties: false, assignment: false },
            inputRequirements: { minCards: 1 },
          }),
        ]}
        channels={channels}
        onOpen={noop}
      />
    )
    expect(html).toContain('needs 1 card')
    expect(html).toContain('tasks')
    expect(html).toContain('MANUAL')
  })

  it('shows an empty board as an invitation, not a blank canvas', () => {
    const html = renderToStaticMarkup(
      <ShroomGraph shrooms={[]} channels={channels} onOpen={noop} />
    )
    expect(html).toContain('No shrooms yet')
    expect(html).not.toContain('<svg')
  })

  it('offers no drag handle when chaining is not allowed', () => {
    const readOnly = renderToStaticMarkup(
      <ShroomGraph shrooms={[shroom({ id: 'a', title: 'A' })]} channels={channels} onOpen={noop} />
    )
    const editable = renderToStaticMarkup(
      <ShroomGraph shrooms={[shroom({ id: 'a', title: 'A' })]} channels={channels} onOpen={noop} onChain={noop} />
    )
    expect(readOnly).not.toContain('cursor-crosshair')
    expect(editable).toContain('cursor-crosshair')
  })
})
