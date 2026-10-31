import { db } from '@/lib/db'
import { channelBots, channels, columns } from '@/lib/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import {
  cleanInterior, DEFAULT_FEATURES, FEATURES, FLOORS, INTERIOR_PLANS, LIGHTS, parseInterior, ROOM_DISPLAYS, roomKey, type InteriorStyle,
} from './interior'

/**
 * Rearranging the inside of a building: set directly from the redecorate panel, or
 * worked out from what the owner said ("make the Done room a library and light a
 * fire"). Only the owner's own channels, and only the layout: cards, columns and the
 * bot are never touched.
 */

async function ownChannel(userId: string, channelId: string) {
  return db.query.channels.findFirst({ where: and(eq(channels.id, channelId), eq(channels.ownerId, userId)), columns: { id: true, name: true, ownerId: true } })
}

export async function saveInterior(userId: string, channelId: string, raw: unknown): Promise<{ style: InteriorStyle } | { error: string }> {
  const ch = await ownChannel(userId, channelId)
  if (!ch) return { error: 'Only your own buildings can be rearranged.' }
  const style = cleanInterior(raw)
  const { ensureBot } = await import('@/lib/kan/bots/run')
  await ensureBot(ch.id, ch.ownerId)
  await db.update(channelBots).set({ interiorStyle: Object.keys(style).length ? JSON.stringify(style) : null, updatedAt: new Date() }).where(eq(channelBots.channelId, ch.id))
  return { style }
}

/** What there is to choose from, for Kan's prompts. */
export function interiorOptions() {
  const list = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${k} (${v})`).join('; ')
  return [
    `plan: ${list(INTERIOR_PLANS)}`,
    `display (per room): ${list(ROOM_DISPLAYS)}`,
    `floor: ${list(FLOORS)}`,
    `light: ${list(LIGHTS)}`,
    `features (any of): ${list(FEATURES)}`,
    'walls: a wall color as #rrggbb; rooms[column].color: a room’s accent as #rrggbb; order: column names, front room first',
  ].join('\n')
}

/**
 * Turn what the owner asked for into a new layout. Kan answers with the whole style
 * and a line to say; anything it gets wrong is dropped by cleanInterior.
 */
export async function askInterior(userId: string, channelId: string, ask: string): Promise<{ style: InteriorStyle; said: string } | { error: string }> {
  const ch = await ownChannel(userId, channelId)
  if (!ch) return { error: 'Only your own buildings can be rearranged.' }
  const [bot, cols] = await Promise.all([
    db.query.channelBots.findFirst({ where: eq(channelBots.channelId, channelId), columns: { interiorStyle: true } }),
    db.query.columns.findMany({ where: eq(columns.channelId, channelId), orderBy: [asc(columns.position)], columns: { name: true } }),
  ])
  const now = parseInterior(bot?.interiorStyle)
  const { getLLMClientForUser } = await import('@/lib/ai/llm')
  const { client } = await getLLMClientForUser(userId)
  if (!client) return { error: 'Kan can’t think right now. Try the buttons instead.' }
  let j: { change?: unknown; said?: unknown } = {}
  try {
    const res = await client.complete([{
      role: 'user',
      content: [
        `You are Kan, decorating the inside of the "${ch.name}" building in Kan City. Each column of the channel's board is a room; the cards are shown in it.`,
        `The rooms (columns), in board order: ${cols.map((c) => `"${c.name}"`).join(', ') || 'none yet'}`,
        `How it's laid out now: ${JSON.stringify({ ...now, features: now.features ?? DEFAULT_FEATURES })}`,
        `\nWhat you can set:\n${interiorOptions()}`,
        `\nThe owner asked: "${ask.slice(0, 600)}"`,
        '\nGive only the fields that change; anything you leave out stays as it is. Set a field to null to put it back to the default. For rooms, give only the rooms that change, by column name exactly as listed. features is the whole list you want. If they ask for something that isn’t on the list, get as close as the options allow and say so.',
        'Answer with JSON only: {"change": {only the fields that change}, "said": "one short, warm line about what you changed, under 20 words"}',
      ].join('\n'),
    }], { maxTokens: 3000 })
    j = JSON.parse(res.content.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
  } catch (err) {
    console.error('[city] redecorate', err)
    return { error: 'Kan couldn’t work that out. Try saying it another way.' }
  }
  const change = j.change && typeof j.change === 'object' ? j.change as Record<string, unknown> : {}
  // What changed, laid over what's there; null takes a field back to the default.
  const merged: Record<string, unknown> = { ...now }
  for (const [k, v] of Object.entries(change)) {
    if (v === null) delete merged[k]
    else if (k === 'rooms' && typeof v === 'object') {
      const rooms: Record<string, unknown> = { ...(now.rooms ?? {}) }
      for (const [rk, rv] of Object.entries(v as Record<string, unknown>)) {
        const key = roomKey(rk)
        if (rv === null) delete rooms[key]
        else if (rv && typeof rv === 'object') rooms[key] = { ...(now.rooms?.[key] ?? {}), ...(rv as object) }
      }
      merged.rooms = rooms
    } else merged[k] = v
  }
  // Room names come back as the model wrote them; keep only real columns.
  const known = new Set(cols.map((c) => roomKey(c.name)))
  const style = cleanInterior(merged)
  if (style.rooms) for (const k of Object.keys(style.rooms)) if (!known.has(k)) delete style.rooms[k]
  if (style.order) style.order = style.order.filter((k) => known.has(k))
  const saved = await saveInterior(userId, channelId, style)
  if ('error' in saved) return saved
  return { style: saved.style, said: typeof j.said === 'string' && j.said.trim() ? j.said.trim().slice(0, 200) : 'Done. Have a look around.' }
}
