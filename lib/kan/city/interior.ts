/**
 * Inside a building. Every channel's building has rooms you can walk around: a lobby
 * where its resident works the front desk, a room for each column with the cards up on
 * the walls, and an arcade when the channel has apps.
 *
 * The owner (directly, or by asking Kan) can rearrange it: the floor plan, how each
 * room shows its cards, the floor, the lights, a few things in the lobby, and the
 * order of the rooms. Like a plot's style, every field is optional and checked on the
 * way in, so nothing malformed ever reaches the renderer.
 *
 * The planner here is pure (no three.js), so the server, the tests and the scene all
 * agree on where every wall and room is.
 */

export const INTERIOR_PLANS = {
  hallway: 'A hallway down the middle with a room for each column off it',
  open: 'One big open hall: each column gets its own stretch of wall, split by low dividers',
  atrium: 'Rooms around a sunny courtyard with a fountain and trees',
} as const
export type InteriorPlan = keyof typeof INTERIOR_PLANS

export const ROOM_DISPLAYS = {
  board: 'Cork boards, each card pinned up as a note you can read',
  shelves: 'A library: each card is a book on the shelves',
  gallery: 'A gallery: each card hangs as a framed picture',
} as const
export type RoomDisplay = keyof typeof ROOM_DISPLAYS

export const FLOORS = {
  wood: 'Warm wooden planks',
  tile: 'Clean square tiles',
  carpet: 'Soft carpet',
  marble: 'Polished marble',
  grass: 'Indoor grass',
  checker: 'Black and white checkerboard',
} as const
export type Floor = keyof typeof FLOORS

export const LIGHTS = {
  warm: 'Warm and bright',
  daylight: 'Cool daylight',
  cozy: 'Dim and cozy, lamps glowing',
  party: 'Party lights sweeping colors around',
} as const
export type Light = keyof typeof LIGHTS

export const FEATURES = {
  fireplace: 'A crackling fireplace in the lobby',
  plants: 'Potted plants in the corners',
  fountain: 'A fountain in the lobby',
  piano: 'A piano',
  aquarium: 'A big fish tank',
  sofa: 'A comfy sofa and coffee table',
  lamps: 'Floor lamps',
  disco: 'A disco ball',
} as const
export type Feature = keyof typeof FEATURES
/** What a lobby has until someone says otherwise. */
export const DEFAULT_FEATURES: Feature[] = ['plants', 'sofa', 'lamps']

export interface RoomStyle {
  display?: RoomDisplay
  /** The room's accent (rug, sign, trim), #rrggbb. */
  color?: string
}

export interface InteriorStyle {
  plan?: InteriorPlan
  floor?: Floor
  light?: Light
  /** Wall color, #rrggbb. Defaults to the building's own. */
  walls?: string
  features?: Feature[]
  /** Per column, by its name (see roomKey). */
  rooms?: Record<string, RoomStyle>
  /** Column names, in the order their rooms come; any not named follow in board order. */
  order?: string[]
}

const HEX = /^#[0-9a-f]{6}$/i
const has = <T extends object>(o: T, k: unknown): k is keyof T => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k)

/** How a column is named in a style: trimmed, lowercase. */
export function roomKey(name: string) {
  return name.trim().toLowerCase().slice(0, 60)
}

/** Only what's known and well formed survives. */
export function cleanInterior(raw: unknown): InteriorStyle {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const out: InteriorStyle = {}
  if (has(INTERIOR_PLANS, r.plan)) out.plan = r.plan
  if (has(FLOORS, r.floor)) out.floor = r.floor
  if (has(LIGHTS, r.light)) out.light = r.light
  if (typeof r.walls === 'string' && HEX.test(r.walls)) out.walls = r.walls.toLowerCase()
  if (Array.isArray(r.features)) {
    const f = [...new Set(r.features.filter((x): x is Feature => has(FEATURES, x)))]
    if (f.length) out.features = f
  }
  if (r.rooms && typeof r.rooms === 'object' && !Array.isArray(r.rooms)) {
    const rooms: Record<string, RoomStyle> = {}
    for (const [k, v] of Object.entries(r.rooms as Record<string, unknown>).slice(0, 40)) {
      if (!v || typeof v !== 'object') continue
      const key = roomKey(k)
      const s = v as Record<string, unknown>
      const room: RoomStyle = {}
      if (has(ROOM_DISPLAYS, s.display)) room.display = s.display
      if (typeof s.color === 'string' && HEX.test(s.color)) room.color = s.color.toLowerCase()
      if (key && Object.keys(room).length) rooms[key] = room
    }
    if (Object.keys(rooms).length) out.rooms = rooms
  }
  if (Array.isArray(r.order)) {
    const o = [...new Set(r.order.filter((x): x is string => typeof x === 'string').map(roomKey).filter(Boolean))].slice(0, 40)
    if (o.length) out.order = o
  }
  return out
}

/** A stored style, read back safely: bad JSON is no style at all. */
export function parseInterior(text: string | null | undefined): InteriorStyle {
  if (!text) return {}
  try { return cleanInterior(JSON.parse(text)) } catch { return {} }
}

// ---------- The floor plan ----------

/** A rectangle on the floor, x0 < x1 and z0 < z1. The way in is at the front (+z). */
export interface Rect { x0: number; z0: number; x1: number; z1: number }
/** A wall, or a gap in one, along x (z fixed) or along z (x fixed). */
export interface Seg { x0: number; z0: number; x1: number; z1: number }

/** Where one card (or app) goes: on a wall, facing into the room. */
export interface Slot { x: number; z: number; nx: number; nz: number }

export interface PlanRoom {
  id: string
  kind: 'lobby' | 'hall' | 'court' | 'column' | 'arcade'
  name: string
  rect: Rect
  columnId?: string
  display?: RoomDisplay
  color: string
  /** Its doorway, where its name hangs. */
  door?: { x: number; z: number; nx: number; nz: number }
  /** Wall spots for its things, best first. */
  slots: Slot[]
  /** How many things fit on one slot. */
  perSlot: number
  /** How many things it has, and how many are shown. */
  count: number
  shown: number
}

export interface Plan {
  plan: InteriorPlan
  rooms: PlanRoom[]
  walls: Seg[]
  /** Low dividers in an open hall: you can see over them, not walk through them. */
  dividers: Seg[]
  /** The way out, on the front wall. */
  entrance: { x: number; z: number }
  bounds: Rect
}

export interface PlanInput {
  columns: { id: string; name: string; cards: number }[]
  apps: number
  style: InteriorStyle
}

export const ROOM_COLORS = ['#a78bfa', '#f472b6', '#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#818cf8', '#2dd4bf', '#f97316', '#a3e635']

/** Things per unit of wall, by how they're shown. */
const PER_SLOT: Record<RoomDisplay | 'arcade', number> = { board: 2, gallery: 2, shelves: 10, arcade: 1 }
/** Past this, a room shows the newest and says how many more there are. */
export const ROOM_MAX = 40

/** A sensible way to show a column when nobody's said: done things on shelves, likes in frames, the rest on boards. */
export function defaultDisplay(name: string): RoomDisplay {
  const n = name.toLowerCase()
  if (/done|complete|archive|shipped|finished|read|past/.test(n)) return 'shelves'
  if (/like|love|favo|best|keep|gallery|inspir/.test(n)) return 'gallery'
  return 'board'
}

const LOBBY_W = 12
const LOBBY_D = 8
const DOOR = 2

export function planInterior(input: PlanInput): Plan {
  const style = input.style
  const kind: InteriorPlan = style.plan ?? 'hallway'
  // Rooms in order: the arcade first (it's the fun one), then columns as asked, then the rest.
  const order = style.order ?? []
  const cols = [...input.columns].sort((a, b) => {
    const ia = order.indexOf(roomKey(a.name)), ib = order.indexOf(roomKey(b.name))
    return (ia < 0 ? 1e3 : ia) - (ib < 0 ? 1e3 : ib)
  })
  type Want = { id: string; kind: 'column' | 'arcade'; name: string; columnId?: string; display?: RoomDisplay; color: string; count: number; perSlot: number }
  const wants: Want[] = []
  if (input.apps > 0) wants.push({ id: 'arcade', kind: 'arcade', name: 'Arcade', color: '#ff3cac', count: input.apps, perSlot: PER_SLOT.arcade })
  cols.forEach((c, i) => {
    const rs = style.rooms?.[roomKey(c.name)]
    const display = rs?.display ?? defaultDisplay(c.name)
    wants.push({ id: `col:${c.id}`, kind: 'column', name: c.name, columnId: c.id, display, color: rs?.color ?? ROOM_COLORS[i % ROOM_COLORS.length], count: c.cards, perSlot: PER_SLOT[display] })
  })
  // Wall needed, in units.
  const units = (w: Want) => Math.ceil(Math.min(w.count, ROOM_MAX) / w.perSlot)

  const rooms: PlanRoom[] = []
  const openings: Seg[] = []
  const dividers: Seg[] = []
  const lobby: Rect = { x0: -LOBBY_W / 2, z0: 0, x1: LOBBY_W / 2, z1: LOBBY_D }
  openings.push({ x0: -DOOR / 2, z0: LOBBY_D, x1: DOOR / 2, z1: LOBBY_D })

  if (kind === 'open') {
    // One hall: zones stacked down the left and right walls, the lobby across the front.
    const W = 18
    const lens = wants.map((w) => Math.max(4, Math.min(14, units(w) + 2)))
    const sides: { at: number; list: number[] }[] = [{ at: 0, list: [] }, { at: 0, list: [] }]
    lens.forEach((len, i) => { const s = sides[0].at <= sides[1].at ? sides[0] : sides[1]; s.list.push(i); s.at += len })
    const depth = Math.max(10, sides[0].at, sides[1].at)
    const hall: Rect = { x0: -W / 2, z0: -depth, x1: W / 2, z1: LOBBY_D }
    rooms.push({ id: 'lobby', kind: 'lobby', name: 'Lobby', rect: { x0: -W / 2, z0: 0, x1: W / 2, z1: LOBBY_D }, color: '#a78bfa', slots: [], perSlot: 0, count: 0, shown: 0 })
    rooms.push({ id: 'hall', kind: 'hall', name: 'Hall', rect: { x0: -W / 2, z0: -depth, x1: W / 2, z1: 0 }, color: '#a78bfa', slots: [], perSlot: 0, count: 0, shown: 0 })
    // The lobby and the hall are one room: no wall between them.
    openings.push({ x0: -W / 2, z0: 0, x1: W / 2, z1: 0 })
    sides.forEach((s, si) => {
      let z = 0
      for (const i of s.list) {
        const w = wants[i], len = lens[i]
        const left = si === 0
        const rect: Rect = left ? { x0: -W / 2, z0: z - len, x1: -W / 2 + 4, z1: z } : { x0: W / 2 - 4, z0: z - len, x1: W / 2, z1: z }
        // Slots along its stretch of the outer wall, a step in from each end.
        const slots: Slot[] = []
        const x = left ? -W / 2 : W / 2
        for (let k = 1; k < len - 1; k++) slots.push({ x, z: z - k - 0.5, nx: left ? 1 : -1, nz: 0 })
        const shown = Math.min(w.count, ROOM_MAX, slots.length * w.perSlot)
        rooms.push({ ...w, rect, slots, shown, door: { x: left ? -W / 2 + 4.2 : W / 2 - 4.2, z: z - len / 2, nx: left ? 1 : -1, nz: 0 } })
        // A low divider where this zone meets the next.
        if (z - len > -depth) dividers.push(left ? { x0: -W / 2, z0: z - len, x1: -W / 2 + 2.6, z1: z - len } : { x0: W / 2 - 2.6, z0: z - len, x1: W / 2, z1: z - len })
        z -= len
      }
    })
    const walls = wallsOf([hall], openings)
    return { plan: kind, rooms, walls, dividers, entrance: { x: 0, z: LOBBY_D }, bounds: hall }
  }

  // Hallway or atrium: a corridor (or a courtyard) runs back from the lobby, rooms off both sides.
  const hallW = kind === 'atrium' ? 10 : 4
  const sizeOf = (w: Want) => Math.max(6, Math.min(11, Math.ceil((units(w) + 8) / 3)))
  const sizes = wants.map(sizeOf)
  // In a courtyard, one room closes off the far end.
  const endIdx = kind === 'atrium' && wants.length >= 3 ? wants.length - 1 : -1
  const sides: { at: number; list: number[] }[] = [{ at: 0, list: [] }, { at: 0, list: [] }]
  sizes.forEach((s, i) => { if (i === endIdx) return; const side = sides[0].at <= sides[1].at ? sides[0] : sides[1]; side.list.push(i); side.at += s })
  const L = Math.max(kind === 'atrium' ? 10 : 6, sides[0].at, sides[1].at)
  rooms.push({ id: 'lobby', kind: 'lobby', name: 'Lobby', rect: lobby, color: '#a78bfa', slots: [], perSlot: 0, count: 0, shown: 0 })
  const hall: Rect = { x0: -hallW / 2, z0: -L, x1: hallW / 2, z1: 0 }
  rooms.push({ id: 'hall', kind: kind === 'atrium' ? 'court' : 'hall', name: kind === 'atrium' ? 'Courtyard' : 'Hallway', rect: hall, color: '#a78bfa', slots: [], perSlot: 0, count: 0, shown: 0 })
  openings.push({ x0: -hallW / 2, z0: 0, x1: hallW / 2, z1: 0 })

  const rects: Rect[] = [lobby, hall]
  const pending: { w: Want; rect: Rect; door: Seg; inward: { nx: number; nz: number } }[] = []
  sides.forEach((s, si) => {
    let z = 0
    for (const i of s.list) {
      const w = wants[i], sz = sizes[i]
      const left = si === 0
      const rect: Rect = left ? { x0: -hallW / 2 - sz, z0: z - sz, x1: -hallW / 2, z1: z } : { x0: hallW / 2, z0: z - sz, x1: hallW / 2 + sz, z1: z }
      const zc = Math.round(z - sz / 2)
      const x = left ? -hallW / 2 : hallW / 2
      pending.push({ w, rect, door: { x0: x, z0: zc - DOOR / 2, x1: x, z1: zc + DOOR / 2 }, inward: { nx: left ? -1 : 1, nz: 0 } })
      z -= sz
    }
  })
  if (endIdx >= 0) {
    const w = wants[endIdx], sz = Math.max(sizes[endIdx], 8)
    const x0 = -Math.floor(sz / 2)
    pending.push({ w, rect: { x0, z0: -L - sz, x1: x0 + sz, z1: -L }, door: { x0: -DOOR / 2, z0: -L, x1: DOOR / 2, z1: -L }, inward: { nx: 0, nz: -1 } })
  }
  for (const p of pending) { rects.push(p.rect); openings.push(p.door) }
  const walls = wallsOf(rects, openings)
  const wallSet = edgeSet(walls)
  for (const p of pending) {
    const slots = slotsOf(p.rect, wallSet, p.door)
    const shown = Math.min(p.w.count, ROOM_MAX, slots.length * p.w.perSlot)
    const dx = (p.door.x0 + p.door.x1) / 2, dz = (p.door.z0 + p.door.z1) / 2
    // The name hangs on the outside of the doorway, facing whoever walks by.
    rooms.push({ ...p.w, rect: p.rect, slots, shown, door: { x: dx, z: dz, nx: -p.inward.nx, nz: -p.inward.nz } })
  }
  const all = rects.reduce((b, r) => ({ x0: Math.min(b.x0, r.x0), z0: Math.min(b.z0, r.z0), x1: Math.max(b.x1, r.x1), z1: Math.max(b.z1, r.z1) }), { ...lobby })
  return { plan: kind, rooms, walls, dividers, entrance: { x: 0, z: LOBBY_D }, bounds: all }
}

// ---------- Walls, as unit edges ----------

/** "h:x:z" is the edge from (x, z) to (x+1, z); "v:x:z" from (x, z) to (x, z+1). */
function edgesOfRect(r: Rect): string[] {
  const out: string[] = []
  for (let x = r.x0; x < r.x1; x++) out.push(`h:${x}:${r.z0}`, `h:${x}:${r.z1}`)
  for (let z = r.z0; z < r.z1; z++) out.push(`v:${r.x0}:${z}`, `v:${r.x1}:${z}`)
  return out
}

function edgesOfSeg(s: Seg): string[] {
  const out: string[] = []
  if (s.z0 === s.z1) for (let x = Math.min(s.x0, s.x1); x < Math.max(s.x0, s.x1); x++) out.push(`h:${x}:${s.z0}`)
  else for (let z = Math.min(s.z0, s.z1); z < Math.max(s.z0, s.z1); z++) out.push(`v:${s.x0}:${z}`)
  return out
}

function edgeSet(walls: Seg[]) {
  return new Set(walls.flatMap(edgesOfSeg))
}

/** Every room's outline, less the doorways, merged into straight runs. */
function wallsOf(rects: Rect[], openings: Seg[]): Seg[] {
  const set = new Set(rects.flatMap(edgesOfRect))
  for (const o of openings) for (const e of edgesOfSeg(o)) set.delete(e)
  const h = new Map<number, number[]>(), v = new Map<number, number[]>()
  for (const e of set) {
    const [k, a, b] = e.split(':')
    const x = Number(a), z = Number(b)
    if (k === 'h') h.set(z, [...(h.get(z) ?? []), x])
    else v.set(x, [...(v.get(x) ?? []), z])
  }
  const out: Seg[] = []
  for (const [z, xs] of h) for (const [a, b] of runs(xs)) out.push({ x0: a, z0: z, x1: b, z1: z })
  for (const [x, zs] of v) for (const [a, b] of runs(zs)) out.push({ x0: x, z0: a, x1: x, z1: b })
  return out
}

function runs(ns: number[]): [number, number][] {
  const s = [...new Set(ns)].sort((a, b) => a - b)
  const out: [number, number][] = []
  for (const n of s) {
    const last = out[out.length - 1]
    if (last && last[1] === n) last[1] = n + 1
    else out.push([n, n + 1])
  }
  return out
}

/**
 * The spots along a room's walls, skipping the corners and either side of its door,
 * the far wall first so the first thing you see walking in is the room's best.
 */
function slotsOf(r: Rect, walls: Set<string>, door: Seg): Slot[] {
  const out: (Slot & { far: number })[] = []
  const dx = (door.x0 + door.x1) / 2, dz = (door.z0 + door.z1) / 2
  const nearDoor = (x: number, z: number) => Math.hypot(x - dx, z - dz) < DOOR / 2 + 1.2
  const push = (x: number, z: number, nx: number, nz: number) => {
    if (nearDoor(x, z)) return
    out.push({ x, z, nx, nz, far: Math.hypot(x - dx, z - dz) })
  }
  for (let x = r.x0 + 1; x < r.x1 - 1; x++) {
    if (walls.has(`h:${x}:${r.z0}`)) push(x + 0.5, r.z0, 0, 1)
    if (walls.has(`h:${x}:${r.z1}`)) push(x + 0.5, r.z1, 0, -1)
  }
  for (let z = r.z0 + 1; z < r.z1 - 1; z++) {
    if (walls.has(`v:${r.x0}:${z}`)) push(r.x0, z + 0.5, 1, 0)
    if (walls.has(`v:${r.x1}:${z}`)) push(r.x1, z + 0.5, -1, 0)
  }
  return out.sort((a, b) => b.far - a.far).map((s) => ({ x: s.x, z: s.z, nx: s.nx, nz: s.nz }))
}

/** The room a point on the floor is in: a column's room before the hall or lobby it opens off. */
export function roomAt(plan: Plan, x: number, z: number): PlanRoom | null {
  const inside = (r: Rect) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1
  return plan.rooms.find((r) => (r.kind === 'column' || r.kind === 'arcade') && inside(r.rect))
    ?? plan.rooms.find((r) => inside(r.rect)) ?? null
}
