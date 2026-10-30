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
  isShareInbox?: boolean
  isStudio?: boolean
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
}

export const DOWNTOWN = 'Downtown'

/** How big a building is: log-scaled by cards, so a 178-card channel isn't a needle. */
export function sizeFor(cards: number): number {
  return Math.max(1, Math.min(8, Math.round(1 + Math.log2(1 + cards) * 0.95)))
}

/**
 * Lay the city out. Town Hall and the park take the two middle blocks; districts
 * grow outward from seeds around them, the busiest channels nearest the center and
 * the muted ones on the edge of town. A few lots stay free for what comes next.
 */
export function layoutCity(inputs: PlotInput[], opts: { freeLots?: number } = {}): CityLayout {
  const freeLots = opts.freeLots ?? 3
  const need = inputs.length + 8 + freeLots // + town hall block + park block
  // As few blocks as fit, a little wider than deep so it suits a screen.
  let bx = Math.max(3, Math.ceil(Math.sqrt(need / 4)))
  const bz = bx
  while ((bx * bz - 2) * 4 < need) bx++
  if ((bx - 1) * bz * 4 - 8 >= need && bx > bz) bx--
  const blocks = Math.max(bx, bz)
  const cols = bx * 2
  const rows = bz * 2
  const mx = Math.floor((bx - 1) / 2), mz = Math.floor((bz - 2) / 2)
  const townHall = { cx: mx * 2, cz: mz * 2 }
  const park = { cx: mx * 2, cz: (mz + 1) * 2 }

  const taken = new Set<string>()
  const key = (cx: number, cz: number) => `${cx},${cz}`
  for (const b of [townHall, park]) for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) taken.add(key(b.cx + dx, b.cz + dz))

  const center = { x: townHall.cx + 1, z: townHall.cz + 1 }
  const dist = (cx: number, cz: number) => Math.hypot(cx + 0.5 - center.x, cz + 0.5 - center.z)

  // Districts: folders in order of size, Downtown (no folder) first so it gets the middle.
  const groups = new Map<string, PlotInput[]>()
  for (const p of inputs) {
    const d = p.district ?? DOWNTOWN
    groups.set(d, [...(groups.get(d) ?? []), p])
  }
  // Folders claim their neighborhoods first, out toward the edges; Downtown (no
  // folder) fills in around Town Hall last, so it ends up in the middle.
  const names = [...groups.keys()].sort((a, b) => (a === DOWNTOWN ? 1 : b === DOWNTOWN ? -1 : (groups.get(b)!.length - groups.get(a)!.length) || a.localeCompare(b)))

  // A seed for each district, spread around the middle by angle.
  const radius = blocks * 0.8
  let angle = -Math.PI / 2
  const seeds = new Map<string, { x: number; z: number }>()
  const folderCount = names.filter((n) => n !== DOWNTOWN).length || 1
  for (const n of names) {
    const share = n === DOWNTOWN ? 0 : 1 / folderCount
    const a = angle + share * Math.PI
    angle += share * Math.PI * 2
    const r = n === DOWNTOWN ? 0 : radius
    seeds.set(n, { x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r })
  }

  const all: { cx: number; cz: number }[] = []
  for (let cz = 0; cz < rows; cz++) for (let cx = 0; cx < cols; cx++) if (!taken.has(key(cx, cz))) all.push({ cx, cz })

  const plots: Plot[] = []
  const districts: District[] = []
  names.forEach((n, di) => {
    const members = [...groups.get(n)!]
    // Busy first, muted last: they take the cells nearest the center of their district.
    const weight = (p: PlotInput) => (p.attention === 'muted' ? -1e15 : 0) + (p.attention === 'quiet' ? -1e14 : 0) + (p.lastActivityAt ?? 0)
    members.sort((a, b) => weight(b) - weight(a) || a.channelId.localeCompare(b.channelId))
    const seed = seeds.get(n)!
    const cells: { cx: number; cz: number }[] = []
    // Grow from the seed: always take the free cell that's closest to what we have,
    // leaning toward the middle of town, so a district stays in one piece.
    const grow = () => {
      let best: { cx: number; cz: number } | null = null
      let bestScore = Infinity
      for (const c of all) {
        if (taken.has(key(c.cx, c.cz))) continue
        const toSeed = Math.hypot(c.cx + 0.5 - seed.x, c.cz + 0.5 - seed.z)
        const touching = cells.length === 0 || cells.some((o) => Math.abs(o.cx - c.cx) + Math.abs(o.cz - c.cz) === 1)
        const score = toSeed + dist(c.cx, c.cz) * 0.25 + (touching ? 0 : 40)
        if (score < bestScore) { bestScore = score; best = c }
      }
      if (best) { taken.add(key(best.cx, best.cz)); cells.push(best) }
      return best
    }
    for (let i = 0; i < members.length; i++) if (!grow()) break
    // Hand out the cells: nearest the center of town to the busiest channel.
    const order = [...cells].sort((a, b) => dist(a.cx, a.cz) - dist(b.cx, b.cz))
    members.forEach((m, i) => {
      const c = order[i]
      if (!c) return
      plots.push({
        channelId: m.channelId,
        name: m.name,
        archetype: archetypeFor({ id: m.channelId, name: m.name, description: m.description, isShareInbox: m.isShareInbox, isStudio: m.isStudio }),
        cx: c.cx,
        cz: c.cz,
        district: n,
        size: sizeFor(m.cards),
      })
    })
    districts.push({ name: n, tint: di, cells })
  })

  // Free lots: the empty cells nearest the middle, so new things get built close in.
  const free = all.filter((c) => !taken.has(key(c.cx, c.cz))).sort((a, b) => dist(a.cx, a.cz) - dist(b.cx, b.cz)).slice(0, Math.max(freeLots, 0) + 6)

  return { cols, rows, plots, districts, townHall, park, free }
}
