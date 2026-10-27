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
    expect(user).toMatch(/FIXED \(Claude Code reads its columns by id\): never file into it, reshape it, or change its bot/)
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
