import { describe, it, expect } from 'vitest'
import { buildAttentionPrompt } from '@/lib/kan/attention/run'
import type { Area } from '@/lib/kan/attention/inputs'

const area = (over: Partial<Area> = {}): Area => ({
  channelId: 'c1', name: 'Garden', description: '', columns: ['Ideas'], cards: 3, recentActivity: 0, lastActivityAt: null,
  apps: 0, shrooms: 0, attention: null, botOn: false, startedByKan: false, isShareInbox: false, ...over,
})

describe('attention loop prompt', () => {
  it('marks load-bearing areas so they are never filed into, reshaped or re-botted', () => {
    const { user } = buildAttentionPrompt({ ownerName: 'D', now: new Date('2026-10-27'), inputs: [], areas: [area({ channelId: 'w', name: 'Work', fixed: 'Claude Code reads its columns by id' })] })
    expect(user).toMatch(/FIXED \(Claude Code reads its columns by id\): never file into it, reshape, quiet or mute it, or change its bot/)
  })

  it('asks for patterns, not single links, and protects areas that earn money', () => {
    const { system } = buildAttentionPrompt({ ownerName: 'D', now: new Date(), inputs: [], areas: [area()] })
    expect(system).toMatch(/One stray link is not a pattern/)
    expect(system).toMatch(/Never mute an area with apps people use or money coming in/)
    expect(system).toMatch(/don't want admin/)
  })

  it('gives every input an id a decision can point at', () => {
    const { user } = buildAttentionPrompt({
      ownerName: 'D', now: new Date(), areas: [area()],
      inputs: [{ id: 'share:abc', kind: 'share', at: new Date('2026-10-20'), text: 'Steam milk video' }],
    })
    expect(user).toMatch(/\[share:abc\] 2026-10-20 SHARE: Steam milk video/)
  })
})

describe('what the owner told Kan about their work', () => {
  const plan = {
    note: 'n',
    areas: [
      { channelId: null, name: 'MyPrintSite', attention: 'active' as const, change: 'start' as const, why: 'w', bot: { on: true } },
      { channelId: 'c1', name: 'MyPrintSite Ideas', attention: 'active' as const, change: 'keep' as const, why: 'w', bot: { on: true } },
      { channelId: 'c2', name: 'Lennon', attention: 'active' as const, change: 'keep' as const, why: 'w', bot: { on: true } },
    ],
    filings: [
      { input: 'i1', area: 'MyPrintSite', as: 'card' as const, title: 't' },
      { input: 'i2', area: 'c2', as: 'card' as const, title: 't' },
    ],
    questions: [{ topic: 'MyPrintSite', ask: '?', why: 'w' }],
  }
  const topic = (role: 'help' | 'aware' | 'hands_off') => ({ id: 'x', ownerId: 'o', name: 'MyPrintSite', key: 'myprintsite', role, note: 'I build it in its own codebase', createdAt: null, updatedAt: null })

  it('takes out what Kan only knows about: no new area, no bot, no filings, no question', async () => {
    const { fitDecisions } = await import('@/lib/kan/attention/topics')
    const { decisions, removed } = fitDecisions(plan, [topic('aware')])
    expect(removed).toEqual(['MyPrintSite'])
    expect(decisions.areas.map((a) => a.name)).toEqual(['MyPrintSite Ideas', 'Lennon'])
    expect(decisions.areas[0].bot).toEqual({ on: false })
    expect(decisions.areas[1].bot).toEqual({ on: true })
    expect(decisions.filings.map((f) => f.input)).toEqual(['i2'])
    expect(decisions.questions).toEqual([])
    expect(decisions.setAside).toEqual([{ name: 'MyPrintSite', why: 'I build it in its own codebase' }])
  })

  it('leaves the plan alone when Kan is asked to help', async () => {
    const { fitDecisions } = await import('@/lib/kan/attention/topics')
    const { decisions, removed } = fitDecisions(plan, [topic('help')])
    expect(removed).toEqual([])
    expect(decisions.areas).toHaveLength(3)
    expect(decisions.questions).toEqual([])
  })
})
