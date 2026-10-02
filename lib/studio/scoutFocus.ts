/**
 * Where the scout looks each morning, and what it looks for.
 *
 * The question isn't "what do people complain about" — complaints are free. It's
 * "what do people already pay to get done, and where does what they pay for fall
 * short". So the groups are businesses and professionals who spend money on the
 * work, and each search goes after evidence of spending: what they pay for software
 * and what its reviews say, who they hire to do it by hand, which templates they
 * buy. Forums are one source among several, not the only one.
 *
 * The brief carries the "Look in:" line; change it (or ask Kan to) and the rotation
 * follows.
 */

export const DEFAULT_LOOK_IN = [
  'HVAC and plumbing contractors',
  'roofing and home improvement contractors',
  'cleaning companies',
  'landscaping and lawn care companies',
  'salons, barbers and med spas',
  'real estate agents and teams',
  'property managers',
  'bookkeepers and small accounting firms',
  'independent insurance agents',
  'wedding and event photographers',
  'event venues and caterers',
  'restaurants and food trucks',
  'Shopify and e-commerce stores',
  'Etsy and print-on-demand sellers',
  'coaches and consultants',
  'small marketing agencies',
  'auto repair shops',
  'print shops and sign makers',
  'gyms and fitness studios',
  'daycares and preschools',
  'law firms and solo attorneys (admin work only)',
  'recruiters and staffing agencies',
]

/** The groups named on the brief's "Look in:" line, or the defaults. */
export function lookInList(brief: string | null | undefined): string[] {
  const line = (brief || '').split('\n').map((l) => l.trim()).find((l) => /^look in\s*:/i.test(l))
  if (!line) return DEFAULT_LOOK_IN
  const groups = line.replace(/^look in\s*:/i, '').split(/[,;]/).map((g) => g.trim().replace(/\.$/, '')).filter(Boolean)
  return groups.length ? groups : DEFAULT_LOOK_IN
}

/**
 * The search for one group: where their money goes today. Paid software and its
 * reviews, freelancers they hire for the job, templates they buy, and the threads
 * where they ask for something better — recent ones only.
 */
export function focusFor(group: string, now = new Date()): string {
  const year = now.getFullYear()
  return `${group}: what they pay for today to run the business and still complain about — software they pay for and its 1–3 star reviews (G2, Capterra, Shopify App Store, Chrome Web Store), tasks they hire freelancers or virtual assistants to do by hand (Upwork, Fiverr), templates and tools they buy (Etsy, Gumroad), and threads where they ask for something better, from ${year - 1} or ${year}`
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
