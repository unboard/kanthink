import { describe, it, expect } from 'vitest'
import { botTools, guardTools, PER_RUN_LIMITS, type BotContext, type BotTool } from '@/lib/kan/bots/tools'
import { capabilityList } from '@/lib/kan/bots/prompt'
import { nextRunAfter } from '@/lib/kan/bots/run'
import { buildModelMenu, estimateBuildCost } from '@/lib/playground/estimate'
import { BUILD_RESERVE_MILLICENTS, roomLeft, shouldStopRun, thinkingCost } from '@/lib/kan/bots/spend'

const ctx = (over: Partial<BotContext> = {}): BotContext => ({
  userId: 'u1', isAdmin: false, readable: ['c1'], scope: ['c1'], sessionCardIds: [], recentTurns: [],
  channelId: 'c1', asks: [], ...over,
})

function fake(name: string, kind: 'read' | 'write'): BotTool & { calls: number } {
  const t = {
    name, kind, area: 'board' as const, description: 'x.', input_schema: { type: 'object' as const, properties: {} },
    running: () => `Doing ${name}`, calls: 0,
    async run() { t.calls++; return { content: 'ran' } },
  }
  return t
}

describe('channel bots', () => {
  it('rehearsal stops every write at the door and lets reads through', async () => {
    const write = fake('email_person', 'write')
    const read = fake('list_people', 'read')
    const [w, r] = guardTools([write, read], ctx({ rehearsal: true }))
    const out = await w.run({}, ctx())
    expect(out.content).toMatch(/Rehearsal/)
    expect(out.label).toMatch(/^Would: /)
    expect(write.calls).toBe(0)
    await r.run({}, ctx())
    expect(read.calls).toBe(1)
  })

  it('caps the moves that are costly or public per run', async () => {
    const build = fake('build_app', 'write')
    const [g] = guardTools([build], ctx())
    await g.run({}, ctx())
    const second = await g.run({}, ctx())
    expect(build.calls).toBe(PER_RUN_LIMITS.build_app)
    expect(second.isError).toBe(true)
  })

  it('strips chat-only "only when the user says" from what a bot is told', () => {
    const tools = botTools({ isAdmin: false, isStudio: true, canHandOff: true })
    for (const t of tools) expect(t.description).not.toMatch(/Only when/)
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['ship_app', 'start_test_page', 'hand_to_claude_code']))
  })

  it('never offers channel creation, and gates admin-only reads', () => {
    const names = botTools({ isAdmin: false, isStudio: false, canHandOff: false }).map((t) => t.name)
    expect(names).not.toContain('create_channel')
    expect(names).not.toContain('query_mixpanel')
    expect(names).not.toContain('ship_app')
    expect(names).toEqual(expect.arrayContaining(['list_people', 'email_person', 'reply_to_person', 'set_price', 'publish_app', 'app_numbers', 'remember']))
    expect(botTools({ isAdmin: true, isStudio: false, canHandOff: false }).map((t) => t.name)).toContain('query_mixpanel')
  })

  it('tells the bot everything it has, by area', () => {
    const list = capabilityList(botTools({ isAdmin: false, isStudio: false, canHandOff: false }))
    expect(list).toMatch(/Talk to people/)
    expect(list).toMatch(/\*\*email_person\*\*/)
    expect(list).toMatch(/web search/)
  })

  it('schedules the next run from the cadence, never sooner than an hour', () => {
    const from = new Date('2026-10-26T12:00:00Z')
    expect(nextRunAfter({ everyHours: 6 }, from).toISOString()).toBe('2026-10-26T18:00:00.000Z')
    expect(nextRunAfter({ everyHours: 0 }, from).toISOString()).toBe('2026-10-26T13:00:00.000Z')
  })

  it('prices cached input at a tenth, so a long run is not billed as if every round were new', () => {
    // gpt-5.6-sol: $4 in, $20 out per million.
    const fresh = thinkingCost('gpt-5.6-sol', { inputTokens: 100_000, outputTokens: 5_000 })
    const cached = thinkingCost('gpt-5.6-sol', { inputTokens: 100_000, outputTokens: 5_000, cachedInputTokens: 80_000 })
    expect(fresh).toBe(50_000) // $0.40 + $0.10
    expect(cached).toBe(21_200) // 20k at $4 + 80k at $0.40 + $0.10
  })

  it('takes the lowest ceiling and says which one it is', () => {
    const base = { botBudget: 200_000, botSpent: 0, dayCap: 500_000, daySpent: 0, monthCap: 5_000_000, monthSpent: 0 }
    expect(roomLeft(base)).toMatchObject({ left: 200_000, limitedBy: 'bot' })
    expect(roomLeft({ ...base, daySpent: 450_000 })).toMatchObject({ left: 50_000, limitedBy: 'day' })
    expect(roomLeft({ ...base, monthSpent: 5_100_000 })).toMatchObject({ left: 0, limitedBy: 'month' })
    // A paused ceiling ($0) stops everything.
    expect(roomLeft({ ...base, dayCap: 0 }).left).toBe(0)
  })

  it('stops before a round that would cross the cap, not after', () => {
    expect(shouldStopRun({ spent: 60_000, lastRound: 10_000, runCap: 75_000, room: 200_000 })).toBe(false)
    expect(shouldStopRun({ spent: 66_000, lastRound: 10_000, runCap: 75_000, room: 200_000 })).toBe(true)
    expect(shouldStopRun({ spent: 20_000, lastRound: 10_000, runCap: 75_000, room: 25_000 })).toBe(true)
  })

  it('charges a build to the bot, and refuses one there is no room for', async () => {
    const build = fake('build_app', 'write')
    build.run = async () => { build.calls++; return { content: 'built', costMillicents: 42_000 } }
    const spend = { builds: 0, handoffs: 0, left: () => 500_000 }
    const [g] = guardTools([build], ctx({ spend }))
    await g.run({}, ctx())
    expect(spend.builds).toBe(42_000)

    const poor = fake('build_app', 'write')
    const [p] = guardTools([poor], ctx({ spend: { builds: 0, handoffs: 0, left: () => BUILD_RESERVE_MILLICENTS - 1 } }))
    const out = await p.run({}, ctx())
    expect(out.isError).toBe(true)
    expect(poor.calls).toBe(0)
  })

  it('never builds on its own: builds are proposed, priced, for the owner to approve', () => {
    const names = botTools({ isAdmin: true, isStudio: true, canHandOff: true, providers: ['google', 'openai'] }).map((t) => t.name)
    expect(names).toContain('propose_build')
    expect(names).not.toContain('build_app')
    const propose = botTools({ isAdmin: false, isStudio: false, canHandOff: false, providers: ['google'] }).find((t) => t.name === 'propose_build')!
    // Only models the account can call are offered.
    const models = (propose.input_schema.properties as Record<string, { enum?: string[] }>).modelId.enum!
    expect(models.every((m) => m.startsWith('gemini'))).toBe(true)
    expect(propose.description).toMatch(/at most \$/)
  })

  it('estimates a build within reach of what real builds cost, and bounds the worst case', () => {
    // Real: an Astra first build cost $0.78; a Gemini 3.1 Pro first build about $0.06 of code plus thinking.
    const astra = estimateBuildCost({ modelId: 'gpt-6-astra', briefChars: 2_000 })
    expect(astra.likelyUsd).toBeGreaterThan(0.5)
    expect(astra.likelyUsd).toBeLessThan(1.1)
    const gemini = estimateBuildCost({ modelId: 'gemini-3.1-pro-preview', briefChars: 2_000 })
    expect(gemini.likelyUsd).toBeLessThan(0.2)
    // A rebuild can make three calls, so its ceiling is well above a first build's.
    const rebuild = estimateBuildCost({ modelId: 'gpt-6-astra', briefChars: 2_000, existingCodeChars: 35_000 })
    expect(rebuild.maxUsd).toBeGreaterThan(astra.maxUsd * 2)
    for (const e of [astra, gemini, rebuild]) expect(e.maxUsd).toBeGreaterThanOrEqual(e.likelyUsd)
  })

  it('lists only models the account holds a key for', () => {
    expect(buildModelMenu(['google']).every((m) => m.id.startsWith('gemini'))).toBe(true)
    expect(buildModelMenu(['google', 'openai']).map((m) => m.id)).toContain('gpt-6-astra')
    expect(buildModelMenu(['google', 'openai']).some((m) => m.id.startsWith('claude'))).toBe(false)
  })
})
