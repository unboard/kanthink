import { db } from '@/lib/db'
import { channelBots, channels } from '@/lib/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { layoutCity, type PlotInput } from './layout'
import { cityFor } from './data'

/**
 * Moving plots around the city.
 *
 * A moved plot is pinned to its lot. Moving onto a lot someone else is on swaps the
 * two. Moving one away leaves a gap the layout would like to fill by shuffling its
 * neighbors along, so before saving, every plot that would shift is pinned where it
 * already is: you move one building, and only that one moves.
 */

type City = Exclude<Awaited<ReturnType<typeof cityFor>>, { empty: true }>
type Cell = { cx: number; cz: number }

const same = (a: Cell, b: Cell) => a.cx === b.cx && a.cz === b.cz
const raw = (c: Cell, origin: Cell): Cell => ({ cx: c.cx + origin.cx, cz: c.cz + origin.cz })

function inputsOf(city: City, pins: Map<string, Cell | null>): PlotInput[] {
  return city.plots.map((p) => ({
    channelId: p.channelId,
    name: p.name,
    description: p.description,
    district: p.folderId ? p.district : null,
    cards: p.cards,
    lastActivityAt: p.lastActivityAt,
    attention: p.attention,
    createdAt: p.createdAt,
    pin: pins.has(p.channelId) ? pins.get(p.channelId) : p.pinned ? raw({ cx: p.cx, cz: p.cz }, city.layout.origin) : null,
  }))
}

/**
 * Move a plot to a lot (in the cells the city is drawn with). An occupied lot swaps.
 * Only the owner's own channels move.
 */
export async function movePlot(userId: string, channelId: string, to: Cell): Promise<{ ok: true; swappedWith: string | null } | { error: string }> {
  const city = await cityFor(userId)
  if ('empty' in city) return { error: 'No city yet.' }
  const L = city.layout
  const mover = city.plots.find((p) => p.channelId === channelId)
  if (!mover) return { error: 'That plot isn’t in the city.' }
  if (!Number.isInteger(to.cx) || !Number.isInteger(to.cz)) return { error: 'That isn’t a lot.' }
  const inBlock = (b: Cell) => to.cx >= b.cx && to.cx <= b.cx + 1 && to.cz >= b.cz && to.cz <= b.cz + 1
  if (inBlock(L.townHall) || inBlock(L.park)) return { error: 'Town Hall and the park stay where they are.' }
  if (same(mover, to)) return { ok: true, swappedWith: null }

  const occupant = city.plots.find((p) => p.channelId !== channelId && same(p, to)) ?? null
  const ids = [channelId, ...(occupant ? [occupant.channelId] : [])]
  const owned = await db.query.channels.findMany({ where: and(inArray(channels.id, ids), eq(channels.ownerId, userId)), columns: { id: true, name: true } })
  if (!owned.some((c) => c.id === channelId)) return { error: 'Only your own channels can be moved.' }
  if (occupant && !owned.some((c) => c.id === occupant.channelId)) return { error: `${occupant.name} is shared with you, so it can’t be moved. Pick another lot.` }

  const pins = new Map<string, Cell | null>()
  pins.set(channelId, raw(to, L.origin))
  if (occupant) pins.set(occupant.channelId, raw(mover, L.origin))

  // Keep everyone else put: pin whoever would shift, and look again until nobody does.
  const was = new Map(city.plots.map((p) => [p.channelId, raw(p, L.origin)]))
  const ownedAll = new Set((await db.query.channels.findMany({ where: and(inArray(channels.id, city.plots.map((p) => p.channelId)), eq(channels.ownerId, userId)), columns: { id: true } })).map((c) => c.id))
  for (let round = 0; round < 6; round++) {
    const next = layoutCity(inputsOf(city, pins))
    let moved = 0
    for (const p of next.plots) {
      if (pins.has(p.channelId) || !ownedAll.has(p.channelId)) continue
      if (!same(raw(p, next.origin), was.get(p.channelId)!)) { pins.set(p.channelId, was.get(p.channelId)!); moved++ }
    }
    if (!moved) break
  }

  const { ensureBot } = await import('@/lib/kan/bots/run')
  for (const [id, cell] of pins) {
    if (!ownedAll.has(id) || !cell) continue
    await ensureBot(id, userId)
    await db.update(channelBots).set({ plotPin: `${cell.cx},${cell.cz}`, updatedAt: new Date() }).where(eq(channelBots.channelId, id))
  }
  return { ok: true, swappedWith: occupant?.name ?? null }
}

/**
 * Put one plot right next to another: the other lots of its block first (no road
 * between them), then a lot across the road. A free lot beats a swap.
 */
export async function movePlotNextTo(userId: string, channelId: string, nextToId: string): Promise<{ ok: true; swappedWith: string | null; to: Cell } | { error: string }> {
  if (channelId === nextToId) return { error: 'That’s the same plot.' }
  const city = await cityFor(userId)
  if ('empty' in city) return { error: 'No city yet.' }
  const L = city.layout
  const target = city.plots.find((p) => p.channelId === nextToId)
  const mover = city.plots.find((p) => p.channelId === channelId)
  if (!target || !mover) return { error: 'One of those isn’t in the city.' }
  const bx = Math.floor(target.cx / 2) * 2, bz = Math.floor(target.cz / 2) * 2
  const sameBlock = [[bx, bz], [bx + 1, bz], [bx, bz + 1], [bx + 1, bz + 1]].map(([cx, cz]) => ({ cx, cz })).filter((c) => !same(c, target))
  // Already neighbors: nothing to do.
  if (sameBlock.some((c) => same(c, mover))) return { ok: true, swappedWith: null, to: { cx: mover.cx, cz: mover.cz } }
  const across = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => ({ cx: target.cx + dx, cz: target.cz + dz })).filter((c) => !sameBlock.some((o) => same(o, c)))
  const blocked = (c: Cell) => [L.townHall, L.park].some((b) => c.cx >= b.cx && c.cx <= b.cx + 1 && c.cz >= b.cz && c.cz <= b.cz + 1)
  const owned = new Set((await db.query.channels.findMany({ where: and(inArray(channels.id, city.plots.map((p) => p.channelId)), eq(channels.ownerId, userId)), columns: { id: true } })).map((c) => c.id))
  const occupantOf = (c: Cell) => city.plots.find((p) => same(p, c))
  const rank = (c: Cell, near: number) => {
    if (blocked(c)) return Infinity
    const o = occupantOf(c)
    if (!o) return near
    if (o.channelId === nextToId || !owned.has(o.channelId)) return Infinity
    return near + 10
  }
  const choices = [...sameBlock.map((c) => ({ c, r: rank(c, 0) })), ...across.map((c) => ({ c, r: rank(c, 1) }))].filter((x) => x.r < Infinity).sort((a, b) => a.r - b.r)
  if (!choices.length) return { error: `There’s no lot next to ${target.name} that can be used.` }
  const out = await movePlot(userId, channelId, choices[0].c)
  return 'error' in out ? out : { ...out, to: choices[0].c }
}

/** Let the layout place it again (e.g. it changed neighborhoods). */
export async function unpinPlot(channelId: string) {
  await db.update(channelBots).set({ plotPin: null, updatedAt: new Date() }).where(eq(channelBots.channelId, channelId))
}
