/**
 * Kan City: your channels as a city. Each folder is a district, each channel a plot
 * with a building that says what the channel is about (a café for the espresso log,
 * a schoolhouse for Scarlett's apps, a pond for the backyard pond), and Kan's Town
 * Hall sits in the middle, where anything that needs you waits.
 *
 * This file is pure: it decides what each building is and where it stands. The scene
 * draws it and the page fills it with what's happening. The same channels always get
 * the same city, so it stays a place you know your way around.
 */

export type Archetype =
  | 'tower' | 'datacenter' | 'library' | 'postoffice' | 'school' | 'studio' | 'arcade'
  | 'lab' | 'observatory' | 'office' | 'printshop' | 'clinic' | 'cafe' | 'bank'
  | 'park' | 'pond' | 'garage' | 'station' | 'house' | 'factory' | 'helpdesk' | 'depot'

/** What each kind of building is called, for the panel. */
export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  tower: 'Code tower',
  datacenter: 'Data center',
  library: 'Library',
  postoffice: 'Post office',
  school: 'Schoolhouse',
  studio: 'Studio',
  arcade: 'Arcade',
  lab: 'Idea lab',
  observatory: 'Observatory',
  office: 'Offices',
  printshop: 'Print shop',
  clinic: 'Clinic',
  cafe: 'Café',
  bank: 'Vault',
  park: 'Aviary park',
  pond: 'Pond',
  garage: 'Garage',
  station: 'Station',
  house: 'House',
  factory: 'Factory',
  helpdesk: 'Help desk',
  depot: 'Bot depot',
}

// First match wins, so the specific rules come before the broad ones. Stems match
// as prefixes (learn → learning, bird → birds); short words need a whole word.
const RULES: [RegExp, Archetype][] = [
  [/\b(bookmark|share inbox|quick ?save|inbox)/i, 'postoffice'],
  [/\b(bird|aviary|garden|wildlife|nature|hike|hiking|trail)/i, 'park'],
  [/\b(pond|fish|lake|aquarium|boat)/i, 'pond'],
  [/\b(espresso|coffee|café|cafe|bean|tea\b)/i, 'cafe'],
  [/\b(recipe|meal|cook|food|kitchen|restaurant|dinner)/i, 'cafe'],
  [/\b(learn|school|math|lesson|teach|class|grade|homework|kid)/i, 'school'],
  [/\b(health|wellness|medic|symptom|doctor|fitness|workout)/i, 'clinic'],
  [/\b(memory|vault|archive|bank|financ|budget|money|invest|tax\b)/i, 'bank'],
  [/\b(travel|trip|itinerar|flight|vacation)/i, 'station'],
  [/\b(print|flyer|direct mail|postcard|signage)/i, 'printshop'],
  [/\b(snow|roof|mow|car\b|truck|repair|tools?\b|garage|maker)/i, 'garage'],
  [/\b(support|help\b|faq|q&a)/i, 'helpdesk'],
  [/\b(grok|bots?\b|agents?\b)/i, 'depot'],
  [/\b(playground|arcade|game)/i, 'arcade'],
  [/\b(motion|video|record|film|music|podcast|ui\b|ux\b|inspiration|gallery|art\b|photo)/i, 'studio'],
  [/\b(stack|infra|server|data cent|database|github|repo)/i, 'datacenter'],
  [/\b(work\b|bug|code|engineer|architect|dev\b)/i, 'tower'],
  [/\b(idea|prd|feature|request|brainstorm|lab\b|concept)/i, 'lab'],
  [/\b(intel|research|market|target|venture|analy|data\b|disrupt|competit)/i, 'observatory'],
  [/\b(outreach|affiliate|growth|sales|lead|white label|marketing|partner|ops\b)/i, 'office'],
  [/\b(studio|factory|pipeline|production|money ideas)/i, 'factory'],
  [/\b(home|house|family|personal)/i, 'house'],
]

const FALLBACK: Archetype[] = ['office', 'house', 'lab', 'library']

/** A small, stable hash, so a channel's choices never change between visits. */
export function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * What building a channel gets. The name decides first, since that's how you think
 * of it; the description only breaks a tie when the name says nothing.
 */
export function archetypeFor(ch: { id: string; name: string; description?: string | null; isShareInbox?: boolean; isStudio?: boolean }): Archetype {
  if (ch.isShareInbox) return 'postoffice'
  if (ch.isStudio) return 'factory'
  for (const [re, kind] of RULES) if (re.test(ch.name)) return kind
  for (const [re, kind] of RULES) if (re.test(ch.description ?? '')) return kind
  return FALLBACK[hash(ch.id) % FALLBACK.length]
}

export interface PlotInput {
  channelId: string
  name: string
  description?: string | null
  district: string | null
  cards: number
  lastActivityAt: number | null
  attention: 'active' | 'quiet' | 'muted' | null
  /** When the channel was made: older channels claim their lots first. */
  createdAt?: number | null
  isShareInbox?: boolean
  isStudio?: boolean
  /** A lot the owner moved it to, in unshifted cells (see CityLayout.origin). Claimed before anything else is placed. */
  pin?: { cx: number; cz: number } | null
}

export interface Plot {
  channelId: string
  name: string
  archetype: Archetype
  /** Grid cell. Cells come in 2×2 blocks with a road around each block. */
  cx: number
  cz: number
  district: string
  /** 1 to 8: how big the building is, from how much lives in the channel. */
  size: number
}

export interface District {
  name: string
  /** Index into the district palette. */
  tint: number
  cells: { cx: number; cz: number }[]
}

export interface CityLayout {
  /** Cells across and down. Always even, so blocks are whole. */
  cols: number
  rows: number
  plots: Plot[]
  districts: District[]
  /** The block Kan's Town Hall fills: its top-left cell. */
  townHall: { cx: number; cz: number }
  /** The park block, where idle bots go. */
  park: { cx: number; cz: number }
  /** Lots nobody has built on yet: room for what Kan starts next. */
  free: { cx: number; cz: number }[]
  /**
   * The shift applied so the corner is 0,0. It changes as the city grows, so a moved
   * plot is stored unshifted: shown cell + origin.
   */
  origin: { cx: number; cz: number }
}

export const DOWNTOWN = 'Downtown'

/** How big a building is: log-scaled by cards, so a 178-card channel isn't a needle. */
export function sizeFor(cards: number): number {
  return Math.max(1, Math.min(8, Math.round(1 + Math.log2(1 + cards) * 0.95)))
}

/**
 * Lay the city out. It has no edge: Town Hall and the park sit at the middle, and
 * every channel claims a lot in the order it was made, so a new channel only ever
 * adds a building at the edge of its district and never moves one you know. Each
 * folder's district grows from its own spot around Town Hall (picked from its name,
 * so it's always in the same direction); channels with no folder fill Downtown.
 * Muted channels are placed last, out on the edge of town.
 */
export function layoutCity(inputs: PlotInput[], opts: { freeLots?: number } = {}): CityLayout {
  const freeLots = opts.freeLots ?? 3
  const key = (cx: number, cz: number) => `${cx},${cz}`
  const taken = new Set<string>()
  // Town Hall's block and the park's block, one above the other.
  let townHall = { cx: 0, cz: 0 }
  let park = { cx: 0, cz: 2 }
  for (const b of [townHall, park]) for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) taken.add(key(b.cx + dx, b.cz + dz))
  const center = { x: 1, z: 2 }
  const dist = (cx: number, cz: number) => Math.hypot(cx + 0.5 - center.x, cz + 0.5 - center.z)

  // Oldest first, muted last; ids break ties so the order never depends on the input order.
  const ordered = [...inputs].sort((a, b) =>
    Number(a.attention === 'muted') - Number(b.attention === 'muted')
    || (a.createdAt ?? 0) - (b.createdAt ?? 0)
    || a.channelId.localeCompare(b.channelId))

  // Every district's seed: Downtown at the middle, folders out in a direction of their own.
  const seeds = new Map<string, { x: number; z: number }>()
  const seedOf = (n: string) => {
    let s = seeds.get(n)
    if (!s) {
      const a = (hash(`district:${n}`) / 2 ** 32) * Math.PI * 2
      const r = n === DOWNTOWN ? 0 : 4.5
      s = { x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r }
      seeds.set(n, s)
    }
    return s
  }

  // The land there is to build on. It's bigger than will ever be needed, and the
  // nearest free cell always wins, so how far it reaches never changes a choice.
  const reach = Math.ceil(Math.sqrt(inputs.length + 8 + freeLots) * 1.5) + 10
  const land: { cx: number; cz: number }[] = []
  for (let cz = -reach; cz <= reach; cz++) for (let cx = -reach; cx <= reach; cx++) if (!taken.has(key(cx, cz))) land.push({ cx, cz })

  // Moved plots claim their lots first, oldest first; a pin on Town Hall, the park or
  // another pin is ignored and that plot is placed as usual.
  const pinned = new Map<string, { cx: number; cz: number }>()
  for (const m of ordered) {
    if (!m.pin || !Number.isInteger(m.pin.cx) || !Number.isInteger(m.pin.cz) || taken.has(key(m.pin.cx, m.pin.cz))) continue
    taken.add(key(m.pin.cx, m.pin.cz))
    pinned.set(m.channelId, { cx: m.pin.cx, cz: m.pin.cz })
  }

  const cellsOf = new Map<string, { cx: number; cz: number }[]>()
  const districtNames: string[] = []
  const plots: Plot[] = []
  for (const m of ordered) {
    const n = m.district ?? DOWNTOWN
    if (!cellsOf.has(n)) { cellsOf.set(n, []); districtNames.push(n) }
    const cells = cellsOf.get(n)!
    const seed = seedOf(n)
    // The free cell closest to the seed, leaning toward the middle of town, and
    // touching the district so it stays in one piece.
    // A moved plot already has its lot.
    let best: { cx: number; cz: number } | null = pinned.get(m.channelId) ?? null
    let bestScore = Infinity
    for (const c of best ? [] : land) {
      if (taken.has(key(c.cx, c.cz))) continue
      const toSeed = Math.hypot(c.cx + 0.5 - seed.x, c.cz + 0.5 - seed.z)
      const touching = cells.length === 0 || cells.some((o) => Math.abs(o.cx - c.cx) + Math.abs(o.cz - c.cz) === 1)
      const score = toSeed + dist(c.cx, c.cz) * 0.25 + (touching ? 0 : 40)
      if (score < bestScore) { bestScore = score; best = c }
    }
    if (!best) continue
    taken.add(key(best.cx, best.cz))
    cells.push(best)
    plots.push({
      channelId: m.channelId,
      name: m.name,
      archetype: archetypeFor({ id: m.channelId, name: m.name, description: m.description, isShareInbox: m.isShareInbox, isStudio: m.isStudio }),
      cx: best.cx,
      cz: best.cz,
      district: n,
      size: sizeFor(m.cards),
    })
  }

  // Free lots: empty cells at the edge of what's built, nearest the middle first,
  // so new things go up close in and the city grows outward.
  const built = (cx: number, cz: number) => taken.has(key(cx, cz))
  let free = land
    .filter((c) => !built(c.cx, c.cz) && (built(c.cx + 1, c.cz) || built(c.cx - 1, c.cz) || built(c.cx, c.cz + 1) || built(c.cx, c.cz - 1)))
    .sort((a, b) => dist(a.cx, a.cz) - dist(b.cx, b.cz))
    .slice(0, Math.max(freeLots, 0) + 6)

  // Shift it all so the corner cell is 0,0, by whole blocks so blocks stay whole.
  const every = [...plots, ...free, townHall, { cx: park.cx + 1, cz: park.cz + 1 }]
  const ox = Math.floor(Math.min(...every.map((c) => c.cx)) / 2) * 2
  const oz = Math.floor(Math.min(...every.map((c) => c.cz)) / 2) * 2
  const move = <T extends { cx: number; cz: number }>(c: T): T => ({ ...c, cx: c.cx - ox, cz: c.cz - oz })
  const placed = plots.map(move)
  free = free.map(move)
  townHall = move(townHall)
  park = move(park)
  const even = (n: number) => n + (n % 2)
  const cols = even(Math.max(...[...placed, ...free, townHall, park].map((c) => c.cx)) + 2)
  const rows = even(Math.max(...[...placed, ...free, townHall, park].map((c) => c.cz)) + 2)

  const districts: District[] = districtNames.map((name, tint) => ({ name, tint, cells: cellsOf.get(name)!.map(move) }))
  return { cols, rows, plots: placed, districts, townHall, park, free, origin: { cx: ox, cz: oz } }
}
