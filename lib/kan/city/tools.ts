import { db } from '@/lib/db'
import { attentionPasses, botRuns, channelBots, channels, folders, userChannelOrg } from '@/lib/db/schema'
import { and, desc, eq, gt, inArray, ne } from 'drizzle-orm'
import type { AgentTool, ToolContext } from '@/lib/kan/agent/tools'
import { planCards, waitingPass } from '@/lib/kan/attention/plan'
import { ARCHETYPE_LABEL } from './layout'
import { cleanStyle, parseStyle, PLOT_BUILDINGS, PLOT_THEMES, type PlotStyle } from './style'
import { FEATURES, FLOORS, INTERIOR_PLANS, LIGHTS, MAX_PETS, parseInterior, PETS, petsOf, ROOM_DISPLAYS, roomKey, type InteriorStyle } from './interior'

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

/** A channel of theirs by id, or failing that by name. */
async function findOwnChannel(ref: string, ctx: ToolContext) {
  const byId = await ownChannel(ref, ctx)
  if (byId) return byId
  const mine = await db.query.channels.findMany({ where: and(eq(channels.ownerId, ctx.userId), eq(channels.status, 'active')), columns: { id: true, name: true, ownerId: true } })
  const q = ref.toLowerCase().trim()
  return mine.find((c) => c.name.toLowerCase() === q) ?? mine.find((c) => c.name.toLowerCase().includes(q)) ?? null
}

export const cityTools: AgentTool[] = [
  {
    name: 'arrange_interior',
    description: 'Rearrange the inside of a channel’s building, which they can walk around: each column is a room with its cards on the walls, apps are arcade cabinets. Change the floor plan, how a room shows its cards, the floor, the lights, the wall color, lobby features (including a cat tower and toys), the pets who live there, room accent colors, and which rooms come first. Pets are alive: they walk around, chase toys, climb the cat tower, nap, have faces, and come say hi. This is how anything inside a building gets made, so never hand a change inside a building to Claude Code; if something asked for isn’t on the list, do the closest thing and say what you did. Only what you pass changes; cards, columns and the bot are untouched. Set reset to go back to the default layout.',
    input_schema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'The channel’s id or name' },
        plan: { type: 'string', enum: Object.keys(INTERIOR_PLANS), description: Object.entries(INTERIOR_PLANS).map(([k, v]) => `${k}: ${v}`).join('; ') },
        floor: { type: 'string', enum: Object.keys(FLOORS) },
        light: { type: 'string', enum: Object.keys(LIGHTS), description: Object.entries(LIGHTS).map(([k, v]) => `${k}: ${v}`).join('; ') },
        walls: { type: 'string', description: 'Wall color as #rrggbb' },
        features: { type: 'array', items: { type: 'string', enum: Object.keys(FEATURES) }, description: `The full list of lobby features to have, replacing the current list (a lobby starts with plants, sofa and lamps). To add or take away a few, use add_features / remove_features instead: ${Object.entries(FEATURES).map(([k, v]) => `${k} (${v})`).join('; ')}` },
        rooms: {
          type: 'array',
          description: 'Per-room changes, by column name',
          items: {
            type: 'object',
            properties: {
              column: { type: 'string', description: 'The column’s name' },
              display: { type: 'string', enum: Object.keys(ROOM_DISPLAYS), description: Object.entries(ROOM_DISPLAYS).map(([k, v]) => `${k}: ${v}`).join('; ') },
              color: { type: 'string', description: 'Accent color as #rrggbb' },
            },
            required: ['column'],
          },
        },
        pets: {
          type: 'array',
          description: `The full list of pets who live here (replaces the current list; up to ${MAX_PETS}; [] for none). A cat-themed building starts with a cat and a kitten. Keep the pets already there unless they ask to change them.`,
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: Object.keys(PETS) },
              color: { type: 'string', description: 'Fur color as #rrggbb' },
              name: { type: 'string' },
            },
            required: ['kind'],
          },
        },
        add_features: { type: 'array', items: { type: 'string', enum: Object.keys(FEATURES) }, description: 'Lobby features to add to what is already there (use this to add; use features only to replace the whole list)' },
        remove_features: { type: 'array', items: { type: 'string', enum: Object.keys(FEATURES) }, description: 'Lobby features to take away' },
        add_pets: {
          type: 'array',
          description: 'Pets to add to the ones already living here (use this to add; use pets only to replace the whole list)',
          items: { type: 'object', properties: { kind: { type: 'string', enum: Object.keys(PETS) }, color: { type: 'string' }, name: { type: 'string' } }, required: ['kind'] },
        },
        order: { type: 'array', items: { type: 'string' }, description: 'Column names, the room to put first first' },
        reset: { type: 'boolean', description: 'Back to the default layout' },
      },
      required: ['channel'],
    },
    kind: 'write',
    running: (i) => `Rearranging inside ${str(i.channel) || 'a building'}`,
    async run(input, ctx) {
      const ch = await findOwnChannel(str(input.channel), ctx)
      if (!ch) return { content: `No channel of theirs called "${str(input.channel)}".`, isError: true }
      const { ensureBot } = await import('@/lib/kan/bots/run')
      const { saveInterior } = await import('./redecorate')
      const bot = await ensureBot(ch.id, ch.ownerId)
      const now: InteriorStyle = input.reset === true ? {} : parseInterior(bot.interiorStyle)
      const next: Record<string, unknown> = { ...now }
      if (input.reset !== true) {
        for (const k of ['plan', 'floor', 'light', 'walls', 'features'] as const) if (input[k] != null) next[k] = input[k]
        if (Array.isArray(input.order)) next.order = input.order
        if (Array.isArray(input.pets)) next.pets = input.pets
        if (Array.isArray(input.add_features) || Array.isArray(input.remove_features)) {
          const { DEFAULT_FEATURES } = await import('./interior')
          const drop = new Set((input.remove_features as string[] | undefined) ?? [])
          next.features = [...new Set([...((next.features as string[] | undefined) ?? now.features ?? DEFAULT_FEATURES), ...((input.add_features as string[] | undefined) ?? [])])].filter((f) => !drop.has(f))
        }
        if (Array.isArray(input.add_pets)) {
          const { parseStyle } = await import('./style')
          next.pets = [...petsOf(now, parseStyle(bot.plotStyle).theme), ...input.add_pets]
        }
        if (Array.isArray(input.rooms)) {
          const rooms = { ...(now.rooms ?? {}) } as Record<string, Record<string, unknown>>
          for (const r of input.rooms as Record<string, unknown>[]) {
            const key = roomKey(str(r?.column))
            if (!key) continue
            rooms[key] = { ...(rooms[key] ?? {}), ...(r.display ? { display: r.display } : {}), ...(r.color ? { color: r.color } : {}) }
          }
          next.rooms = rooms
        }
      }
      const out = await saveInterior(ctx.userId, ch.id, next)
      if ('error' in out) return { content: out.error, isError: true }
      const s = out.style
      const pets = s.pets?.map((p) => [p.name, p.kind].filter(Boolean).join(' the ')).join(', ')
      const desc = [s.plan && `${s.plan} plan`, pets && `pets: ${pets}`, s.floor && `${s.floor} floor`, s.light && `${s.light} light`, s.features?.length && s.features.join(', '),
        ...Object.entries(s.rooms ?? {}).map(([k, v]) => `${k}: ${[v.display, v.color].filter(Boolean).join(' ')}`)].filter(Boolean).join('; ')
      return {
        content: desc ? `Inside ${ch.name} is now: ${desc}. It rearranges itself while they watch.` : `Inside ${ch.name} is back to its default layout.`,
        label: `Rearranged inside ${ch.name}`,
        href: channelHref(ch.id),
      }
    },
  },
  {
    name: 'move_plot',
    description: 'Move a channel’s building to a different spot in the city, right next to another channel’s building ("put Lennon next to Scarlett"). It goes on the same block when there’s room, else across the road; if the lot is taken, the two swap. Nothing else moves, and the channel itself is untouched. Moving a channel into a neighborhood (arrange_neighborhood) moves it to that district instead.',
    input_schema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'The channel to move: id or name' },
        nextTo: { type: 'string', description: 'The channel to put it next to: id or name' },
      },
      required: ['channel', 'nextTo'],
    },
    kind: 'write',
    running: (i) => `Moving ${str(i.channel)} next to ${str(i.nextTo)}`,
    async run(input, ctx) {
      const [a, b] = await Promise.all([findOwnChannel(str(input.channel), ctx), findOwnChannel(str(input.nextTo), ctx)])
      if (!a || !b) return { content: `Couldn't find ${!a ? str(input.channel) : str(input.nextTo)} among their channels.`, isError: true }
      const { movePlotNextTo } = await import('./move')
      const out = await movePlotNextTo(ctx.userId, a.id, b.id)
      if ('error' in out) return { content: out.error, isError: true }
      return {
        content: `${a.name} is now right next to ${b.name}${out.swappedWith ? ` (it swapped lots with ${out.swappedWith})` : ''}.`,
        label: `Moved ${a.name} next to ${b.name}`,
        href: channelHref(a.id),
      }
    },
  },
  {
    name: 'restyle_plot',
    description: 'Change how a channel’s building looks in the city: a theme (decorations and colors), the kind of building, and/or its wall and roof colors. Only the look changes; the channel, its cards and its bot are untouched. Pick a building kind that suits the theme when the current one doesn’t (a cat theme reads best on a house, cafe or studio). Set reset to go back to how Kan drew it.',
    input_schema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'The channel’s id or name' },
        theme: { type: 'string', enum: [...Object.keys(PLOT_THEMES), 'none'], description: `One of: ${Object.entries(PLOT_THEMES).map(([k, v]) => `${k} (${v.split(':')[1]?.trim()})`).join('; ')}. "none" removes the theme.` },
        building: { type: 'string', enum: PLOT_BUILDINGS, description: 'The kind of building' },
        walls: { type: 'string', description: 'Wall color as #rrggbb' },
        roof: { type: 'string', description: 'Roof color as #rrggbb' },
        reset: { type: 'boolean', description: 'Back to Kan’s own look' },
      },
      required: ['channel'],
    },
    kind: 'write',
    running: (i) => `Restyling ${str(i.channel) || 'a building'}`,
    async run(input, ctx) {
      const ch = await findOwnChannel(str(input.channel), ctx)
      if (!ch) return { content: `No channel of theirs called "${str(input.channel)}". Check city_bots for the name.`, isError: true }
      const { ensureBot } = await import('@/lib/kan/bots/run')
      const bot = await ensureBot(ch.id, ch.ownerId)
      let next: PlotStyle = input.reset === true ? {} : parseStyle(bot.plotStyle)
      if (input.reset !== true) {
        const asked = cleanStyle({ theme: input.theme, building: input.building, walls: input.walls, roof: input.roof })
        next = { ...next, ...asked }
        if (input.theme === 'none') delete next.theme
        const bad = (['walls', 'roof'] as const).filter((k) => input[k] != null && !asked[k])
        if (bad.length) return { content: `${bad.join(' and ')} must be a hex color like #f28fae. Nothing changed.`, isError: true }
      }
      await db.update(channelBots).set({ plotStyle: Object.keys(next).length ? JSON.stringify(next) : null, updatedAt: new Date() }).where(eq(channelBots.channelId, ch.id))
      const desc = [next.theme && `${next.theme} theme`, next.building && ARCHETYPE_LABEL[next.building]?.toLowerCase(), next.walls && `${next.walls} walls`, next.roof && `${next.roof} roof`].filter(Boolean).join(', ')
      return {
        content: desc ? `${ch.name} now looks like: ${desc}. The city redraws it now.` : `${ch.name} is back to the way Kan drew it.`,
        label: desc ? `Restyled ${ch.name}: ${desc}` : `${ch.name} back to its own look`,
        href: channelHref(ch.id),
      }
    },
  },
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
      if (set.enabled) await (await import('@/lib/kan/attention/apply')).keepAwakeInPlan(ctx.userId, channelId)
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
    name: 'find_cards',
    description: 'Search card titles and summaries across ALL their channels at once, so you never have to ask which channel something is in. Use before moving or gathering cards ("move the cat app cards into Lennon").',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'A word or phrase; several words match cards containing any of them' },
        limit: { type: 'number', description: 'At most this many (default 40)' },
      },
      required: ['query'],
    },
    kind: 'read',
    running: (i) => `Looking everywhere for “${str(i.query).slice(0, 40)}”`,
    async run(input, ctx) {
      const words = str(input.query).toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length > 2).slice(0, 6)
      if (!words.length || !ctx.readable.length) return { content: 'Nothing to search for.' }
      const { cards } = await import('@/lib/db/schema')
      const { or, like } = await import('drizzle-orm')
      const rows = await db.query.cards.findMany({
        where: and(inArray(cards.channelId, ctx.readable), eq(cards.isArchived, false), or(...words.flatMap((w) => [like(cards.title, `%${w}%`), like(cards.summary, `%${w}%`)]))),
        columns: { id: true, title: true, channelId: true },
        limit: Math.min(80, Number(input.limit) || 40),
      })
      if (!rows.length) return { content: 'No cards matched.', label: 'Found nothing' }
      const names = new Map((await db.query.channels.findMany({ where: inArray(channels.id, [...new Set(rows.map((r) => r.channelId))]), columns: { id: true, name: true } })).map((c) => [c.id, c.name]))
      return {
        content: rows.map((r) => `- [cardId:${r.id}] "${r.title}" in ${names.get(r.channelId) ?? '?'} (channelId:${r.channelId})`).join('\n'),
        label: `Found ${rows.length} card${rows.length === 1 ? '' : 's'} across ${names.size} channel${names.size === 1 ? '' : 's'}`,
      }
    },
  },
  {
    name: 'move_cards_to_channel',
    description: 'Move cards into a different channel (move_card only moves between columns of one channel). Their threads, tasks and apps go with them. Use when they ask to move or gather cards somewhere else. Find the card ids with find_cards first.',
    input_schema: {
      type: 'object',
      properties: {
        cardIds: { type: 'array', items: { type: 'string' } },
        channelId: { type: 'string', description: 'Where they go' },
        columnName: { type: 'string', description: 'Which column there; the first column if left out' },
      },
      required: ['cardIds', 'channelId'],
    },
    kind: 'write',
    running: (i) => `Moving ${Array.isArray(i.cardIds) ? i.cardIds.length : 0} card${Array.isArray(i.cardIds) && i.cardIds.length === 1 ? '' : 's'}`,
    async run(input, ctx) {
      const { cards, columns, tasks, playgroundApps } = await import('@/lib/db/schema')
      const { canEditChannel } = await import('@/lib/api/permissions')
      const { asc, sql } = await import('drizzle-orm')
      const to = str(input.channelId)
      if (!(await canEditChannel(to, ctx.userId))) return { content: 'They can’t edit that channel.', isError: true }
      const cols = await db.query.columns.findMany({ where: eq(columns.channelId, to), orderBy: [asc(columns.position)], columns: { id: true, name: true } })
      const want = str(input.columnName).toLowerCase()
      const col = cols.find((c) => c.name.toLowerCase() === want) ?? cols[0]
      if (!col) return { content: 'That channel has no columns.', isError: true }
      const ids = (Array.isArray(input.cardIds) ? input.cardIds.map(str) : []).slice(0, 100)
      const found = ids.length ? await db.query.cards.findMany({ where: inArray(cards.id, ids), columns: { id: true, title: true, channelId: true } }) : []
      const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${cards.position}), -1)` }).from(cards).where(eq(cards.columnId, col.id))
      let position = Number(n) + 1
      const moved: string[] = []
      const skipped: string[] = []
      for (const c of found) {
        if (c.channelId === to) continue
        if (!(await canEditChannel(c.channelId, ctx.userId))) { skipped.push(c.title); continue }
        await db.update(cards).set({ channelId: to, columnId: col.id, position: position++, updatedAt: new Date() }).where(eq(cards.id, c.id))
        await db.update(tasks).set({ channelId: to }).where(eq(tasks.cardId, c.id))
        await db.update(playgroundApps).set({ channelId: to }).where(eq(playgroundApps.cardId, c.id))
        moved.push(c.title)
      }
      const ch = await db.query.channels.findFirst({ where: eq(channels.id, to), columns: { name: true } })
      return {
        content: `Moved ${moved.length} into ${ch?.name} → ${col.name}${moved.length ? `: ${moved.join('; ')}` : ''}.${skipped.length ? ` Couldn't move (no edit access): ${skipped.join('; ')}.` : ''}${found.length < ids.length ? ` ${ids.length - found.length} id(s) weren't found.` : ''}`,
        label: `Moved ${moved.length} card${moved.length === 1 ? '' : 's'} into ${ch?.name}`,
        href: channelHref(to),
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
    description: 'Have Kan read everything that came in since it last looked (chats, notes, shares, browsing) and work out how the city should change: which channels to start, quiet or mute, and where things belong. It decides and changes nothing; the plan waits at Town Hall for them. Costs about 20 cents. Only when they ask Kan to sort, file or look things over.',
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
    name: 'build_proposed',
    description: 'Build ONE of the new channels Kan proposed at Town Hall (the construction sites in the city), with what Kan meant to file into it, leaving the rest of the plan waiting. Use when they say to build a particular proposal ("build the Lennon one", "yes, put that up").',
    input_schema: { type: 'object', properties: { name: { type: 'string', description: 'The proposed channel’s name, as Town Hall shows it' } }, required: ['name'] },
    kind: 'write',
    running: (i) => `Putting up “${str(i.name).slice(0, 40)}”`,
    async run(input, ctx) {
      const passes = await db.query.attentionPasses.findMany({
        where: and(eq(attentionPasses.ownerId, ctx.userId), eq(attentionPasses.status, 'done')),
        orderBy: [desc(attentionPasses.startedAt)],
        limit: 3,
      })
      const pass = waitingPass(passes)
      if (!pass) return { content: 'Kan has nothing proposed right now.', isError: true }
      const { buildProposedArea } = await import('@/lib/kan/attention/apply')
      const r = await buildProposedArea(pass.id, ctx.userId, str(input.name))
      if ('error' in r) {
        const names = (pass.decisions?.areas ?? []).filter((a) => a.change === 'start').map((a) => a.name)
        return { content: `${r.error}.${names.length ? ` Proposed now: ${names.join(', ')}.` : ''}`, isError: true }
      }
      return { content: r.log.join('\n'), label: `Put up “${str(input.name)}”`, href: channelHref(r.channelId) }
    },
  },
  {
    name: 'read_plan',
    description: 'Read the plan waiting at Town Hall in full: what Kan noticed, each change it would make and why, what it would file where, what it is curious about, and what they already set aside. Use before talking them through it or changing it.',
    input_schema: { type: 'object', properties: {} },
    kind: 'read',
    running: () => 'Reading the plan',
    async run(_input, ctx) {
      const pass = waitingPass(await db.query.attentionPasses.findMany({
        where: and(eq(attentionPasses.ownerId, ctx.userId), eq(attentionPasses.status, 'done')),
        orderBy: [desc(attentionPasses.startedAt)],
        limit: 3,
      }))
      if (!pass?.decisions) return { content: 'There is no plan waiting at Town Hall.' }
      const { fitDecisions, listTopics } = await import('@/lib/kan/attention/topics')
      const d = fitDecisions(pass.decisions, await listTopics(ctx.userId)).decisions
      const verb = { start: 'Start', reshape: 'Reshape', quiet: 'Quiet', mute: 'Mute', wake: 'Wake', keep: 'Keep' } as const
      const filed = new Map<string, number>()
      for (const f of d.filings) filed.set(f.area, (filed.get(f.area) ?? 0) + 1)
      const name = new Map(d.areas.map((a) => [a.channelId ?? a.name, a.name]))
      const lines = [
        `What Kan told them: ${d.note}`,
        '', 'Changes:',
        ...d.areas.map((a) => `- ${verb[a.change]} “${a.name}”${a.bot ? ` (bot ${a.bot.on ? 'on' : 'off'})` : ''}: ${a.why}${a.purpose ? ` Purpose: ${a.purpose}` : ''}`),
        ...(filed.size ? ['', 'Filing:', ...[...filed].map(([area, n]) => `- ${n} thing${n === 1 ? '' : 's'} into ${name.get(area) ?? area}`)] : []),
        ...(d.questions?.length ? ['', 'Kan is curious about:', ...d.questions.map((q) => `- ${q.topic}: ${q.ask} (${q.why})`)] : []),
        ...(d.setAside?.length ? ['', 'They set aside:', ...d.setAside.map((x) => `- ${x.name}: ${x.why}`)] : []),
      ]
      return { content: lines.join('\n'), label: 'Read the plan' }
    },
  },
  {
    name: 'skip_plan_card',
    description: 'Take a card out of the plan waiting at Town Hall without doing it, so it leaves Town Hall right away. Use as soon as they disagree with one or tell you how they want it instead (they often come from its “Change it” button), then do what they asked in its place. Name it as Town Hall shows it: the space it changes, or the place it would file into. Every card about that place goes.',
    input_schema: { type: 'object', properties: { name: { type: 'string', description: 'The space the card is about, e.g. "Tech Stack"' } }, required: ['name'] },
    kind: 'write',
    running: (i) => `Taking “${str(i.name).slice(0, 40)}” out of the plan`,
    async run(input, ctx) {
      const want = str(input.name).trim()
      const pass = waitingPass(await db.query.attentionPasses.findMany({
        where: and(eq(attentionPasses.ownerId, ctx.userId), eq(attentionPasses.status, 'done')),
        orderBy: [desc(attentionPasses.startedAt)],
        limit: 3,
      }))
      if (!pass?.decisions) return { content: 'There is no plan waiting at Town Hall.', isError: true }
      const [{ fitDecisions, isAbout, listTopics }, { decidePlanStep }] = await Promise.all([import('@/lib/kan/attention/topics'), import('@/lib/kan/attention/apply')])
      const [bots, names, topics] = await Promise.all([
        db.query.channelBots.findMany({ where: eq(channelBots.ownerId, ctx.userId), columns: { channelId: true, enabled: true, everyHours: true } }),
        db.query.channels.findMany({ where: and(eq(channels.ownerId, ctx.userId), eq(channels.status, 'active')), columns: { id: true, name: true } }),
        listTopics(ctx.userId),
      ])
      const cards = planCards(fitDecisions(pass.decisions, topics).decisions, new Map(bots.map((b) => [b.channelId, b])), new Map(names.map((c) => [c.id, c.name])))
      const nameOf = (c: (typeof cards)[number]) => (c.kind === 'area' ? c.name : c.to)
      const hits = cards.filter((c) => isAbout(nameOf(c), want))
      if (!hits.length) return { content: `No card about “${want}”. Waiting now: ${cards.map(nameOf).join(', ') || 'nothing'}.`, isError: true }
      let left = cards.length
      for (const c of hits) {
        const r = await decidePlanStep(pass.id, ctx.userId, { kind: c.kind, key: c.key }, false)
        if ('error' in r) return { content: r.error, isError: true }
        left = r.left
      }
      return { content: `Took ${hits.length === 1 ? 'the card' : `${hits.length} cards`} about “${nameOf(hits[0])}” out of the plan. ${left ? `${left} left at Town Hall.` : 'Nothing is left at Town Hall.'}`, label: `Skipped “${nameOf(hits[0])}”` }
    },
  },
  {
    name: 'remember_about_work',
    description: 'Remember what they tell you about a project or topic in their life and the part you play in it, and take out of the waiting plan anything that goes against it. Use whenever they say what something is, that they build or run it elsewhere (“I’m building that in its own codebase”), that you should just know about it, help with it, or leave it alone. role: help (give it a space, bots, builds), aware (know about it, be curious and bring ideas, never build or run anything for it), hands_off (leave it out).',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The project or topic, as they name it' },
        role: { type: 'string', enum: ['help', 'aware', 'hands_off'] },
        note: { type: 'string', description: 'What they told you about it, close to their words: what it is, where it lives, what they want from you' },
      },
      required: ['name', 'role'],
    },
    kind: 'write',
    running: (i) => `Remembering ${str(i.name).slice(0, 40)}`,
    async run(input, ctx) {
      const role = str(input.role)
      if (role !== 'help' && role !== 'aware' && role !== 'hands_off') return { content: 'role must be help, aware or hands_off', isError: true }
      const name = str(input.name).trim()
      if (!name) return { content: 'Name the project or topic.', isError: true }
      const { rememberTopic, ROLE_LABEL } = await import('@/lib/kan/attention/topics')
      const r = await rememberTopic(ctx.userId, { name, role, note: str(input.note) || null })
      return {
        content: `Remembered: ${name}, ${ROLE_LABEL[role].toLowerCase()}.${r.setAside.length ? ` Took out of the plan: ${r.setAside.join(', ')}.` : ''}${role !== 'hands_off' && !r.topic.note ? ' You know little about it yet: say what you took out, then ask one curious question about it (what it is, who it’s for, where it stands).' : ''}`,
        label: `Remembered ${name}`,
      }
    },
  },
  {
    name: 'carry_out_plan',
    description: 'Carry out the plan Kan made at Town Hall: start the new channels it proposed, quiet or mute the ones it said, and file things where it said they belong. Only on their clear word ("do it", "go ahead").',
    input_schema: { type: 'object', properties: {} },
    kind: 'write',
    running: () => 'Rearranging the city',
    async run(_input, ctx) {
      const pass = waitingPass(await db.query.attentionPasses.findMany({
        where: and(eq(attentionPasses.ownerId, ctx.userId), eq(attentionPasses.status, 'done')),
        orderBy: [desc(attentionPasses.startedAt)],
        limit: 3,
      }))
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
  const here = f?.kind === 'inside' && f.channelId
    ? `They are inside the ${f.name} building (channelId:${f.channelId}), walking its rooms: each column is a room with its cards on the walls, its apps are arcade cabinets, and its resident works the front desk. "This", "here" and "in here" mean that channel. Anything they want changed in here (a library, a fireplace, different lights, the Done room first, pets that walk around and play, a cat tower, toys) is arrange_interior, and you do it yourself right now; never hand a change inside a building to Claude Code.`
    : f?.channelId
    ? `They are looking at ${f.name} (channelId:${f.channelId}) right now, so "this", "here" and "its bot" mean that channel.`
    : f?.kind === 'townhall' ? 'They are looking at Town Hall, where approvals, bot questions and Kan’s plan wait. To talk about the plan, read_plan first. When they push back on a card, skip_plan_card it first, then do what they asked instead (remember_about_work when it’s about your part in something, set_bot, move_cards_to_channel), so Town Hall changes in front of them.' : 'They are looking at the whole city.'
  return `

## Where they are
They are talking to you from Kan City: a map of their channels as a town. Each channel is a building, each folder a district, and each channel's bot is a little mushroom who lives there and goes to work on its schedule. Town Hall in the middle is where anything that needs them waits. ${here}
- This is where they run things now. Prefer doing it here over sending them to a board: you can switch bots on or off (set_bot), send one to work (run_bot_now), group channels into neighborhoods (arrange_neighborhood), sort what came in (sort_new_context), carry out the plan (carry_out_plan), approve or pass on builds, and change cards.
- Neighborhoods are folders and fences: bots help each other inside one and never reach outside it. Downtown (no folder) bots keep to their own channel.
- Never ask which channel something is in: find it with find_cards. To move cards between channels use move_cards_to_channel (move_card only changes columns).
- A new channel is a new building: when you make one, put it in the neighborhood it belongs to (arrange_neighborhood) if one fits, and say where it went up.
- Kan's plan is a draft they can change by talking. When they push back on part of it, or tell you what something is or where they work on it, use remember_about_work, then say what you took out. Be curious about what they're working on: knowing it is how you get useful, even when it isn't yours to build.
- They can move any building next to another just by asking: use move_plot. They can also tap Move on a building and pick a lot.
- They can change how any building looks just by asking ("make Lennon's building cat themed"): use restyle_plot. It only changes the look.
- Every building has an inside they can walk around. They can change it just by asking ("make the Ideas room a gallery", "open plan with party lights"): use arrange_interior.
- The city redraws as you act, so keep replies short; they can see the change happen.`
}
