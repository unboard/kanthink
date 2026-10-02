/**
 * Where the scout looks each morning.
 *
 * A single generic search ("people asking for a tool") comes back with whatever the
 * web says most about tools, which is productivity software. So the brief carries a
 * "Look in:" line, the scout takes one group from it each morning in turn, and the
 * search names that group and the phrases people use when they want something that
 * doesn't exist. Change the line (or ask Kan to) and the rotation follows.
 */

export const DEFAULT_LOOK_IN = [
  'teachers',
  'homeschool parents',
  'youth sports coaches',
  'small landlords',
  'pet sitters and dog walkers',
  'food truck owners',
  'resellers and Etsy sellers',
  'wedding planning',
  'quilters and crafters',
  'house cleaners and cleaning businesses',
  'tutors',
  'event and party planners',
]

/** The groups named on the brief's "Look in:" line, or the defaults. */
export function lookInList(brief: string | null | undefined): string[] {
  const line = (brief || '').split('\n').map((l) => l.trim()).find((l) => /^look in\s*:/i.test(l))
  if (!line) return DEFAULT_LOOK_IN
  const groups = line.replace(/^look in\s*:/i, '').split(/[,;]/).map((g) => g.trim().replace(/\.$/, '')).filter(Boolean)
  return groups.length ? groups : DEFAULT_LOOK_IN
}

/** The search for one group: their words for a missing tool or a tedious chore, this year. */
export function focusFor(group: string, now = new Date()): string {
  const year = now.getFullYear()
  return `${group} asking "is there an app" OR "I wish there was a tool" OR "anyone know a simple way" OR complaining about a tedious task — forum threads, Reddit posts and app reviews from ${year - 1} or ${year}`
}

/**
 * The scout's focus for one run: a few different groups, each its own search, so a
 * morning's sparks don't all come from one corner of the web. Joined with "||",
 * which the shroom runner reads as separate searches.
 */
export function scoutFocus(list: string[], date: Date, count = 3): string {
  return groupsForDay(list, date, count).map((g) => focusFor(g, date)).join(' || ')
}

/** `count` different groups for a day, moving on by `count` each day. */
export function groupsForDay(list: string[], date: Date, count = 3): string[] {
  const n = Math.min(count, list.length)
  const day = Math.floor(date.getTime() / (24 * 60 * 60 * 1000))
  const start = (((day * n) % list.length) + list.length) % list.length
  return Array.from({ length: n }, (_, i) => list[(start + i) % list.length])
}

/** The group for a given day, stepping through the list one a day. */
export function groupForDay(list: string[], date: Date): string {
  const day = Math.floor(date.getTime() / (24 * 60 * 60 * 1000))
  return list[((day % list.length) + list.length) % list.length]
}
