import type { Archetype } from './layout'

/**
 * How a plot looks when its owner (through Kan) has asked for something other than
 * what Kan picked. Every field is optional and checked on the way in, so a bad value
 * can never reach the renderer: an unknown theme or building is dropped, and colors
 * must be plain hex.
 */

export const PLOT_THEMES = {
  cat: 'Cat: ears on the roof, a tail down the wall, a cat napping up top, paw prints and yarn',
  candy: 'Candy: lollipops, gumdrops on the roof, candy-cane posts, pink and mint',
  garden: 'Garden: flower beds, a sunflower, green roof with bushes',
  space: 'Space: a rocket in the yard, a dish on the roof, a ringed planet and twinkling stars',
  castle: 'Castle: turrets with flags at the corners, battlements, gray stone',
  ocean: 'Ocean: a pool with jumping fish, shells and a starfish, sea blues',
  spooky: 'Spooky: glowing jack-o’-lanterns, bats circling the roof, a little ghost',
} as const
export type PlotTheme = keyof typeof PLOT_THEMES

export const PLOT_BUILDINGS: Archetype[] = [
  'tower', 'datacenter', 'library', 'postoffice', 'school', 'studio', 'arcade', 'lab', 'observatory', 'office',
  'printshop', 'clinic', 'cafe', 'bank', 'park', 'pond', 'garage', 'station', 'house', 'factory', 'helpdesk', 'depot',
]

export interface PlotStyle {
  theme?: PlotTheme
  building?: Archetype
  /** Wall color, #rrggbb. */
  walls?: string
  /** Roof color, #rrggbb. */
  roof?: string
}

const HEX = /^#[0-9a-f]{6}$/i

/** Only what's known and well formed survives; anything else is left out. */
export function cleanStyle(raw: unknown): PlotStyle {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const out: PlotStyle = {}
  if (typeof r.theme === 'string' && r.theme in PLOT_THEMES) out.theme = r.theme as PlotTheme
  if (typeof r.building === 'string' && (PLOT_BUILDINGS as string[]).includes(r.building)) out.building = r.building as Archetype
  if (typeof r.walls === 'string' && HEX.test(r.walls)) out.walls = r.walls.toLowerCase()
  if (typeof r.roof === 'string' && HEX.test(r.roof)) out.roof = r.roof.toLowerCase()
  return out
}

/** A stored style, read back safely: bad JSON is no style at all. */
export function parseStyle(text: string | null | undefined): PlotStyle {
  if (!text) return {}
  try { return cleanStyle(JSON.parse(text)) } catch { return {} }
}
