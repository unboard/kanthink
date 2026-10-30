import { db } from '@/lib/db'
import { attentionPasses, botRuns, channelBots, channels, folders, userChannelOrg } from '@/lib/db/schema'
import { and, desc, eq, gt, inArray, ne } from 'drizzle-orm'
import type { AgentTool, ToolContext } from '@/lib/kan/agent/tools'

/**
 * What Kan can do from Kan City, on top of everything the agent already does: run
 * the town. Switch a channel's bot on or off, change how often it works, send it to
 * work now, have Kan sort what came in, and carry out Kan's plan. Each one names
 * its channel in the step's href, so the city can show where it landed.
 */

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))
const channelHref = (id: string) => `/channel/${id}`

async function ownChannel(channelId: string, ctx: ToolContext) {
  const ch = await db.query.channels.findFirst({ where: eq(channels.id, channelId), columns: { id: true, name: true, ownerId: true } })
  return ch && ch.ownerId === ctx.userId ? ch : null
}

const NOT_YOURS = { content: 'That channel isn’t one they own, so its bot can’t be changed from here.', isError: true }

export const cityTools: AgentTool[] = [
  {
    name: 'city_bots',
    description: 'Every channel in their city by neighborhood, with its bot: on or off, how often it works, what it last did, whether it is at work now. Use before changing bots or neighborhoods, or when they ask who is doing what.',
    input_schema: { type: 'object', properties: {} },
    kind: 'read',
    running: () => 'Checking on your bots',
    async run(_input, ctx) {
      const owned = await db.query.channels.findMany({ where: and(eq(channels.ownerId, ctx.userId), eq(channels.status, 'active')), columns: { id: true, name: true } })
      if (!owned.length) return { content: 'They have no channels.' }
      const ids = owned.map((c) => c.id)
      const [bots, runs, org, hoods] = await Promise.all([
        db.query.channelBots.findMany({ where: inArray(channelBots.channelId, ids) }),
        db.query.botRuns.findMany({
          where: and(inArray(botRuns.channelId, ids), ne(botRuns.trigger, 'build'), gt(botRuns.startedAt, new Date(Date.now() - 7 * 86_400_000))),
          orderBy: [desc(botRuns.startedAt)],
          limit: 80,
          columns: { channelId: true, status: true, summary: true, startedAt: true },
        }),
        db.query.userChannelOrg.findMany({ where: eq(userChannelOrg.userId, ctx.userId), columns: { channelId: true, folderId: true } }),
        db.query.folders.findMany({ where: eq(folders.userId, ctx.userId), columns: { id: true, name: true } }),
      ])
      const hoodName = new Map(hoods.map((h) => [h.id, h.name]))
      const hoodOf = new Map(org.map((o) => [o.channelId, o.folderId ? hoodName.get(o.folderId) : undefined]))
      const botOf = new Map(bots.map((b) => [b.channelId, b]))
      const lines = owned.map((c) => {
        const b = botOf.get(c.id)
        const last = runs.find((r) => r.channelId === c.id)
        const at = last?.status === 'running' && Date.now() - +(last.startedAt ?? 0) < 15 * 60_000 ? ' · at work right now' : ''
        const did = last && last.status !== 'running' ? ` · last: ${str(last.summary).replace(/\s+/g, ' ').slice(0, 120)}` : ''
        return `- ${c.name} (channelId:${c.id}) in ${hoodOf.get(c.id) ?? 'Downtown'}: ${b?.enabled ? `on, every ${b.everyHours ?? 24}h, up to $${((b.dailyBudgetCents ?? 200) / 100).toFixed(2)}/day` : 'off'}${b?.attention ? ` · Kan marked it ${b.attention}` : ''}${at}${did}`
      })
      const on = bots.filter((b) => b.enabled).length
      const empty = hoods.filter((h) => !org.some((o) => o.folderId === h.id)).map((h) => h.name)
      if (empty.length) lines.push(`Empty neighborhoods: ${empty.join(', ')}`)
      return { content: lines.join('\n'), label: `${on} of ${owned.length} bots on` }
    },
  },
  {
    name: 'set_bot',
    description: 'Switch a channel’s bot on or off, or change how often it works (hours between runs) and what it may spend a day. A bot that is on works its channel on its own schedule and spends from its budget, so switch one on only when they ask. When switching one on, say roughly what a run costs (about $0.10–$0.30) in your reply.',
    input_schema: {
      type: 'object',
      properties: {
        channelId: { type: 'string' },
        on: { type: 'boolean', description: 'true to switch on, false to switch off; leave out to keep' },
        everyHours: { type: 'number', description: 'Hours between runs, 1–168' },
        dailyBudgetCents: { type: 'number', description: 'Most it may spend a day, in cents' },
      },
      required: ['channelId'],
    },
    kind: 'write',
    running: (i) => (i.on === true ? 'Switching the bot on' : i.on === false ? 'Switching the bot off' : 'Changing the bot’s hours'),
    async run(input, ctx) {
      const channelId = str(input.channelId)
      const ch = await ownChannel(channelId, ctx)
      if (!ch) return NOT_YOURS
      const { ensureBot } = await import('@/lib/kan/bots/run')
      const bot = await ensureBot(channelId, ch.ownerId)
      const set: Partial<typeof channelBots.$inferInsert> = { updatedAt: new Date() }
      if (typeof input.on === 'boolean') {
        set.enabled = input.on
        if (input.on && !bot.enabled) set.nextRunAt = new Date()
      }
      if (typeof input.everyHours === 'number') set.everyHours = Math.min(168, Math.max(1, Math.round(input.everyHours)))
      if (typeof input.dailyBudgetCents === 'number') set.dailyBudgetCents = Math.min(5000, Math.max(10, Math.round(input.dailyBudgetCents)))
      await db.update(channelBots).set(set).where(eq(channelBots.channelId, channelId))
      const on = set.enabled ?? bot.enabled
      const hours = set.everyHours ?? bot.everyHours ?? 24
      return {
        content: `${ch.name}’s bot is ${on ? `on, working every ${hours}h${set.enabled ? ' (first run within the hour)' : ''}` : 'off'}.`,
        label: `${ch.name}’s bot is ${on ? `on, every ${hours}h` : 'off'}`,
        href: channelHref(channelId),
      }
    },
  },
  {
    name: 'arrange_neighborhood',
    description: 'Put channels into a neighborhood (the same thing as a folder on their board), starting it if it doesn’t exist; "Downtown" takes them out of any neighborhood. A neighborhood is also a fence: bots may help each other across the channels in it and can never reach outside it. Use when they ask to group, move or reorganize channels ("make a Scarlett neighborhood", "move Recipes in with Home"). Only on their word.',
    input_schema: {
      type: 'object',
      properties: {
        neighborhood: { type: 'string', description: 'Its name, existing or new; "Downtown" for none' },
        channelIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['neighborhood', 'channelIds'],
    },
    kind: 'write',
    running: (i) => `Moving ${Array.isArray(i.channelIds) ? i.channelIds.length : 0} into ${str(i.neighborhood)}`,
    async run(input, ctx) {
      const { createNeighborhood, moveToNeighborhood } = await import('./neighborhoods')
      const name = str(input.neighborhood).trim()
      const ids = (Array.isArray(input.channelIds) ? input.channelIds.map(str) : []).slice(0, 50)
      if (!ids.length) return { content: 'Name at least one channel.', isError: true }
      if (/^downtown$/i.test(name)) {
        for (const id of ids) {
          const r = await moveToNeighborhood(ctx.userId, id, null)
          if ('error' in r) return { content: r.error, isError: true }
        }
        return { content: `Moved ${ids.length} channel${ids.length === 1 ? '' : 's'} Downtown; their bots now keep to their own channel.`, label: `Moved ${ids.length} Downtown`, href: channelHref(ids[0]) }
      }
      const r = await createNeighborhood(ctx.userId, name, ids)
      if ('error' in r) return { content: r.error, isError: true }
      return { content: `${r.name} now has these ${ids.length} channel${ids.length === 1 ? '' : 's'} (plus any already there). Their bots can help each other, and no other neighborhood's bots can come in.`, label: `Moved ${ids.length} into ${r.name}`, href: channelHref(ids[0]) }
    },
  },
  {
    name: 'run_bot_now',
    description: 'Send a channel’s bot to work right now, once, whether or not it is switched on. It costs a run (about $0.10–$0.30). Only when they ask.',
    input_schema: { type: 'object', properties: { channelId: { type: 'string' } }, required: ['channelId'] },
    kind: 'write',
    running: () => 'Sending the bot to work',
    async run(input, ctx) {
      const channelId = str(input.channelId)
      const ch = await ownChannel(channelId, ctx)
      if (!ch) return NOT_YOURS
      const running = await db.query.botRuns.findFirst({
        where: and(eq(botRuns.channelId, channelId), eq(botRuns.status, 'running'), ne(botRuns.trigger, 'build')),
        columns: { startedAt: true },
      })
      if (running && Date.now() - +(running.startedAt ?? 0) < 15 * 60_000) return { content: `${ch.name}’s bot is already at work.`, label: `${ch.name}’s bot is already at work`, href: channelHref(channelId) }
      const [{ afterResponse }, { runBot }] = await Promise.all([import('@/lib/afterResponse'), import('@/lib/kan/bots/run')])
      afterResponse(async () => { await runBot(channelId, { trigger: 'manual' }) })
      return { content: `${ch.name}’s bot went to work. It takes a minute or two; the city shows it at work.`, label: `Sent ${ch.name}’s bot to work`, href: channelHref(channelId) }
    },
  },
  {
    name: 'sort_new_context',
    description: 'Have Kan read everything that came in since it last looked (chats, notes, shares, browsing) and work out how the city should change: which channels to start, quiet or mute, and where things belong. It decides and changes nothing; the plan waits at Town Hall for them. Costs a little (a few cents). Only when they ask Kan to sort, file or look things over.',
    input_schema: { type: 'object', properties: {} },
    kind: 'write',
    running: () => 'Reading what came in',
    async run(_input, ctx) {
      const running = await db.query.attentionPasses.findFirst({
        where: and(eq(attentionPasses.ownerId, ctx.userId), eq(attentionPasses.status, 'running'), gt(attentionPasses.startedAt, new Date(Date.now() - 15 * 60_000))),
      })
      if (running) return { content: 'Kan is already reading it over; the plan lands at Town Hall in a minute or two.', label: 'Already reading it over' }
      const [{ afterResponse }, { runAttentionPass }] = await Promise.all([import('@/lib/afterResponse'), import('@/lib/kan/attention/run')])
      afterResponse(() => runAttentionPass(ctx.userId, { mode: 'rehearsal' }).then(() => undefined))
      return { content: 'Started. The plan lands at Town Hall in a minute or two, and nothing changes until they say so.', label: 'Reading over what came in' }
    },
  },
  {
    name: 'carry_out_plan',
    description: 'Carry out the plan Kan made at Town Hall: start the new channels it proposed, quiet or mute the ones it said, and file things where it said they belong. Only on their clear word ("do it", "go ahead").',
    input_schema: { type: 'object', properties: {} },
    kind: 'write',
    running: () => 'Rearranging the city',
    async run(_input, ctx) {
      const pass = (await db.query.attentionPasses.findMany({
        where: and(eq(attentionPasses.ownerId, ctx.userId), eq(attentionPasses.status, 'done')),
        orderBy: [desc(attentionPasses.startedAt)],
        limit: 3,
      })).find((p) => !p.appliedAt)
      if (!pass) return { content: 'There is no plan waiting at Town Hall. Offer to have Kan sort what came in first.', isError: true }
      const { applyAttentionPass } = await import('@/lib/kan/attention/apply')
      const r = await applyAttentionPass(pass.id, ctx.userId)
      if ('error' in r) return { content: r.error, isError: true }
      return { content: `Done:\n${r.log.map((l) => `- ${l}`).join('\n')}`, label: `Rearranged the city: ${r.log.length} change${r.log.length === 1 ? '' : 's'}` }
    },
  },
]

/** What Kan knows about where the user is standing, appended to its prompt. */
export function cityPrompt(city: { focus?: { channelId?: string; name?: string; kind?: string } | null }): string {
  const f = city.focus
  const here = f?.channelId
    ? `They are looking at ${f.name} (channelId:${f.channelId}) right now, so "this", "here" and "its bot" mean that channel.`
    : f?.kind === 'townhall' ? 'They are looking at Town Hall, where approvals, bot questions and Kan’s plan wait.' : 'They are looking at the whole city.'
  return `

## Where they are
They are talking to you from Kan City: a map of their channels as a town. Each channel is a building, each folder a district, and each channel's bot is a little mushroom who lives there and goes to work on its schedule. Town Hall in the middle is where anything that needs them waits. ${here}
- This is where they run things now. Prefer doing it here over sending them to a board: you can switch bots on or off (set_bot), send one to work (run_bot_now), group channels into neighborhoods (arrange_neighborhood), sort what came in (sort_new_context), carry out the plan (carry_out_plan), approve or pass on builds, and change cards.
- Neighborhoods are folders and fences: bots help each other inside one and never reach outside it. Downtown (no folder) bots keep to their own channel.
- The city redraws as you act, so keep replies short; they can see the change happen.`
}
