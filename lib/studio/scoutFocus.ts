/**
 * Where the scout looks each morning, and what it looks for.
 *
 * The groups are the kinds of customer MyCreativeShop already serves — local small
 * businesses, churches, schools, campaigns, nonprofits — because those are people
 * the owner can actually reach. The question each search asks is where their money
 * goes today on the jobs around what they print and publish: the software they pay
 * for and its reviews, the freelancers they hire, the templates they buy, and what
 * they ask for in their own forums.
 *
 * The brief carries the "Look in:" line; change it (or ask Kan to) and the rotation
 * follows.
 */

export const DEFAULT_LOOK_IN = [
  'churches and ministries',
  'schools, PTOs and PTAs',
  'political campaigns and candidates',
  'nonprofits and charities',
  'real estate agents',
  'restaurants and cafes',
  'salons, barbers and spas',
  'contractors and home service businesses',
  'independent insurance agents',
  'small retail shops and boutiques',
  'youth sports leagues and clubs',
  'event planners and venues',
  'chambers of commerce and local associations',
  'daycares and preschools',
  'fitness studios and gyms',
  'dental and medical office managers (admin work only)',
]

/** The groups named on the brief's "Look in:" line, or the defaults. */
export function lookInList(brief: string | null | undefined): string[] {
  const line = (brief || '').split('\n').map((l) => l.trim()).find((l) => /^look in\s*:/i.test(l))
  if (!line) return DEFAULT_LOOK_IN
  const groups = line.replace(/^look in\s*:/i, '').split(/[,;]/).map((g) => g.trim().replace(/\.$/, '')).filter(Boolean)
  return groups.length ? groups : DEFAULT_LOOK_IN
}

/**
 * The search for one group: where their money goes today on the work around what
 * they print, publish and send out — and the paperwork and planning behind it.
 */
export function focusFor(group: string, now = new Date()): string {
  const year = now.getFullYear()
  return `${group}: recurring paperwork, planning, writing and publishing jobs they pay to get done today and still complain about — tools they pay for and their 1–3 star reviews (G2, Capterra, Chrome Web Store), jobs they hire freelancers for (Upwork, Fiverr), templates they buy (Etsy, Creative Market), and threads in their own communities asking for something better, from ${year - 1} or ${year}`
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
