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

/** The search for one group: their words for a missing tool or a tedious chore. */
export function focusFor(group: string): string {
  return `${group} asking "is there an app" OR "I wish there was a tool" OR "anyone know a simple way" OR complaining about a tedious task — forum threads, Reddit posts and app reviews`
}

/** The group for a given day, stepping through the list one a day. */
export function groupForDay(list: string[], date: Date): string {
  const day = Math.floor(date.getTime() / (24 * 60 * 60 * 1000))
  return list[((day % list.length) + list.length) % list.length]
}
