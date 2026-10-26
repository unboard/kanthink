import { describe, it, expect } from 'vitest'
import { botTools, guardTools, PER_RUN_LIMITS, type BotContext, type BotTool } from '@/lib/kan/bots/tools'
import { capabilityList } from '@/lib/kan/bots/prompt'
import { nextRunAfter } from '@/lib/kan/bots/run'

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
})
