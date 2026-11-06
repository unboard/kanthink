import { describe, expect, it } from 'vitest'
import { planCards } from '@/lib/kan/attention/plan'

describe('Town Hall plan cards', () => {
  it('asks one card per change, files ride with a new space, and the rest group by place', () => {
    const cards = planCards({
      areas: [
        { channelId: 'gh', name: 'GitHub Library Hub', attention: 'active', why: 'weekly trends', change: 'reshape', columns: ['Top five'] },
        { channelId: null, name: 'Garden', attention: 'active', why: 'you keep sharing seeds', change: 'start' },
        // A keep that changes nothing they'd see isn't a card.
        { channelId: 'ui', name: 'UI Inspiration', attention: 'active', why: 'busy', change: 'keep' },
        // Deleted since the plan was made: not asked about.
        { channelId: 'old', name: 'Work', attention: 'muted', why: 'quiet', change: 'mute' },
      ],
      filings: [
        { input: 'a', area: 'Garden', as: 'card', title: 'Tomato seeds' },
        { input: 'b', area: 'ui', as: 'card', title: 'Nice button' },
        { input: 'c', area: 'ui', as: 'card', title: 'Nice card' },
        { input: 'd', area: 'grok', as: 'card', title: 'Grok 5' },
        { input: 'e', area: 'old', as: 'card', title: 'Gone' },
      ],
    }, new Map(), new Map([['gh', 'GitHub Library Hub'], ['ui', 'UI Inspiration'], ['grok', 'Grok']]))
    expect(cards.map((c) => c.kind === 'area' ? c.name : c.to)).toEqual(['GitHub Library Hub', 'Garden', 'UI Inspiration', 'Grok'])
    const garden = cards[1]
    expect(garden.kind === 'area' && garden.files).toEqual(['Tomato seeds'])
    const ui = cards[2]
    expect(ui.kind === 'filing' && ui.key).toBe('ui')
    expect(ui.kind === 'filing' && ui.titles).toEqual(['Nice button', 'Nice card'])
  })
})
