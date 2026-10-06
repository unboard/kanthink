/**
 * Checking a spark before it reaches you.
 *
 * The scout is told to use only recent posts and to date each one, but a model's
 * word is not a check. So every spark is audited after the scout writes it: links
 * are resolved from search redirects to the real posts, each quote's date is read,
 * Reddit posts are dated by their id where the stated date can't be trusted, and a
 * spark without at least two recent people behind it is rejected — with the reason
 * recorded, so the scout learns from it the same way it learns from yours.
 *
 * The parsing is pure and tested; the database work is at the bottom.
 */

export const FRESH_MONTHS = 12
export const MIN_FRESH_SOURCES = 2
export const CHECKED_MARKER = 'Sources checked:'

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
}

/** The month a line says it's from: "March 2026", "Mar. 2026", "2026-03". */
export function statedDate(line: string): Date | null {
  const named = line.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?,?\s+(20\d{2})\b/i)
  if (named) return new Date(Date.UTC(Number(named[2]), MONTHS[named[1].toLowerCase()], 15))
  const iso = line.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/)
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, 15))
  return null
}

/**
 * Reddit post ids are base-36 and count up. Six characters ran out at the end of
 * 2022, so a six-character id is a post from before 2023 whatever date was written
 * next to it.
 */
export function isPre2023Reddit(url: string): boolean {
  const m = url.match(/reddit\.com\/(?:r\/[^/]+\/)?comments\/([a-z0-9]+)/i)
  return !!m && m[1].length <= 6
}

/** One URL, compared without tracking noise. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    u.search = ''
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

export interface SourceLine {
  url: string
  date: Date | null
  fresh: boolean
  why: string
}

const URL_RE = /https?:\/\/[^\s)\]<>"]+/g

/** Each line of the write-up that cites a post: its link and whether it counts. */
export function readSources(content: string, now: Date, citedElsewhere: Set<string> = new Set(), pageDates: Map<string, Date> = new Map()): SourceLine[] {
  const cutoff = new Date(now)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - FRESH_MONTHS)
  const seen = new Set<string>()
  const out: SourceLine[] = []
  for (const line of content.split('\n')) {
    const url = line.match(URL_RE)?.[0]
    if (!url) continue
    if (PAID_LABEL.test(line.replace(/^[\s*\-•]+/, '').replace(/\*\*|__/g, ''))) continue
    const key = normalizeUrl(url)
    if (seen.has(key)) continue
    seen.add(key)
    const date = statedDate(line) ?? pageDates.get(key) ?? null
    let why = ''
    if (isPre2023Reddit(url)) why = 'a Reddit post from before 2023'
    else if (!date) why = 'no date given'
    else if (date < cutoff) why = `posted ${date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`
    else if (citedElsewhere.has(key)) why = 'already used by another spark'
    out.push({ url, date, fresh: !why, why })
  }
  return out
}

/**
 * The date a page says it was published, from the markup sites put there for
 * search engines and feeds. Earliest plausible one wins: a review page also carries
 * its "last updated" date, and the post is as old as its first one.
 */
export function pageDate(html: string): Date | null {
  const found: Date[] = []
  const patterns = [
    /"datePublished"\s*:\s*"([^"]+)"/gi,
    /"dateCreated"\s*:\s*"([^"]+)"/gi,
    /"uploadDate"\s*:\s*"([^"]+)"/gi,
    /property="article:published_time"\s+content="([^"]+)"/gi,
    /content="([^"]+)"\s+property="article:published_time"/gi,
    /<time[^>]+datetime="([^"]+)"/gi,
    /created-timestamp="([^"]+)"/gi,
  ]
  for (const re of patterns) {
    for (const m of html.matchAll(re)) {
      const d = new Date(m[1])
      if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 2005 && d.getTime() <= Date.now() + 86400000) found.push(d)
    }
  }
  return found.length ? new Date(Math.min(...found.map((d) => d.getTime()))) : null
}

export interface SparkVerdict {
  keep: boolean
  fresh: number
  total: number
  reason: string
}

/**
 * Whether the write-up shows anyone paying for this today: a "Paid today:" line with
 * an amount on it. Without one, it's a complaint, not a market.
 */
export function paidToday(content: string): string | null {
  const line = content.split('\n').map((l) => l.replace(/^[\s*\-•]+/, '').replace(/\*\*|__/g, '')).find((l) => PAID_LABEL.test(l))
  if (!line) return null
  return AMOUNT.test(line) ? line : null
}

const PAID_LABEL = /^paid today\b/i
const AMOUNT = /(\$|€|£)\s?\d|\d[\d,.]*\s?(k\b|usd|dollars|\/\s?(mo|month|yr|year|hr|hour)|(a|per)\s+(month|year|hour|seat|user|tech|location))/i

/**
 * What the app builder can't do, as it tends to be written. Checked against the
 * spark's tool and build lines only — the quotes may mention any software they like.
 */
const NEEDS_INTEGRATION = /\bintegrat|\bsyncs?\b|\bsyncing\b|\bapi\b|connects? (to|with)|plugs? into|\bsms\b|text messag|sends? (an? )?(texts?|emails?|reminders?|messages?)|automatically (emails|texts|posts|sends|publishes)|\bscrap(e|es|ing)\b|webhook|\bzapier\b|\bshopify\b|quickbooks|\bcrm\b|\bpos\b|google calendar|outlook|on a schedule|every (day|week|month) automatically/i

/**
 * Whether the spark says how the app builder would make it, and doesn't lean on
 * something it can't do. Returns the problem, or null when it passes.
 */
export function buildProblem(content: string): string | null {
  const lines = content.split('\n').map((l) => l.replace(/^[\s*\-•]+/, '').replace(/\*\*|__/g, ''))
  const build = lines.find((l) => /^build\b\s*[:—\-]/i.test(l))
  if (!build) return 'it doesn\'t say how the app builder would make it (no "Build:" line)'
  // The tool is the plain sentence just before the Build line.
  const at = lines.indexOf(build)
  const tool = lines.slice(Math.max(0, at - 2), at).filter((l) => l && !/^(paid today|size|reach)\b/i.test(l) && !/^"/.test(l)).join(' ')
  const hit = `${tool} ${build}`.match(NEEDS_INTEGRATION)
  return hit ? `it needs something the app builder can't do ("${hit[0].trim()}")` : null
}

export function sparkVerdict(sources: SourceLine[], content?: string): SparkVerdict {
  if (content !== undefined) {
    const build = buildProblem(content)
    if (build) return { keep: false, fresh: sources.filter((s) => s.fresh).length, total: sources.length, reason: build }
  }
  if (content !== undefined && !paidToday(content)) {
    return { keep: false, fresh: sources.filter((s) => s.fresh).length, total: sources.length, reason: 'no evidence anyone pays for this today (no "Paid today:" line with an amount)' }
  }
  const fresh = sources.filter((s) => s.fresh).length
  if (fresh >= MIN_FRESH_SOURCES) {
    return { keep: true, fresh, total: sources.length, reason: `${fresh} ${fresh === 1 ? 'post' : 'posts'} from the last ${FRESH_MONTHS} months` }
  }
  const problems = sources.filter((s) => !s.fresh).map((s) => s.why)
  const counted = [...new Set(problems)].join('; ')
  return {
    keep: false,
    fresh,
    total: sources.length,
    reason: sources.length === 0
      ? 'no posts cited'
      : `only ${fresh} of ${sources.length} cited posts are from the last ${FRESH_MONTHS} months${counted ? ` (${counted})` : ''}`,
  }
}

// ── Database ──

/** A source's publish date from the page itself. Reddit blocks servers, so it's skipped. */
async function fetchPageDate(url: string): Promise<Date | null> {
  if (/reddit\.com/.test(url)) return null
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(7000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KanthinkStudio/1.0; +https://www.kanthink.com)' },
    })
    if (!res.ok) return null
    return pageDate((await res.text()).slice(0, 600_000))
  } catch {
    return null
  }
}

/** Follow a search-grounding redirect to the post it points at. */
async function resolveRedirect(url: string): Promise<string> {
  if (!/vertexaisearch\.cloud\.google\.com|grounding-api-redirect/.test(url)) return url
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(6000) })
    return res.headers.get('location') || url
  } catch {
    return url
  }
}

/**
 * Audit every unchecked spark waiting in a Studio. Returns what happened to each,
 * for the cron log. Safe to run twice: checked sparks carry a marker and are skipped.
 */
export async function auditStudioSparks(studio: { channelId: string; sparksColumnId: string }, now = new Date()) {
  const { db } = await import('@/lib/db')
  const { cards, cardRejections, tasks } = await import('@/lib/db/schema')
  const { and, eq } = await import('drizzle-orm')
  const { nanoid } = await import('nanoid')

  const all = await db.query.cards.findMany({ where: eq(cards.channelId, studio.channelId) })
  const contentOf = (c: (typeof all)[number]) => ((c.messages || []) as { content?: string }[]).map((m) => m.content || '').join('\n')
  const results: { title: string; kept: boolean; reason: string }[] = []

  const waiting = all.filter((c) => c.columnId === studio.sparksColumnId && !c.isArchived && !contentOf(c).includes(CHECKED_MARKER))
  for (const card of waiting) {
    const messages = [...((card.messages || []) as { id?: string; type?: string; content?: string; createdAt?: string }[])]
    const first = messages.findIndex((m) => (m.content || '').trim())
    if (first < 0) continue
    let content = messages[first].content || ''

    // Real links, not search redirects: readable, and comparable across sparks.
    const urls = [...new Set(content.match(URL_RE) ?? [])]
    for (const url of urls) {
      const real = await resolveRedirect(url)
      if (real !== url) content = content.split(url).join(real)
    }

    // Posts other sparks already stand on don't count twice.
    const elsewhere = new Set<string>()
    for (const other of all) {
      if (other.id === card.id) continue
      for (const u of contentOf(other).match(URL_RE) ?? []) elsewhere.add(normalizeUrl(u))
    }

    // Undated sources get their date from the page, where the page publishes one.
    const pageDates = new Map<string, Date>()
    for (const line of content.split('\n')) {
      const url = line.match(URL_RE)?.[0]
      if (!url || statedDate(line) || isPre2023Reddit(url)) continue
      const d = await fetchPageDate(url)
      if (d) pageDates.set(normalizeUrl(url), d)
    }

    const verdict = sparkVerdict(readSources(content, now, elsewhere, pageDates), content)
    if (!verdict.keep) {
      await db.insert(cardRejections).values({
        id: nanoid(),
        channelId: card.channelId,
        instructionCardId: card.createdByInstructionId ?? null,
        cardId: card.id,
        cardTitle: card.title,
        reason: 'not_relevant',
        feedback: `Rejected automatically: ${verdict.reason}. A spark must be something the app builder can make, show who pays what today with a figure, and have at least ${MIN_FRESH_SOURCES} different buyers posting in the last ${FRESH_MONTHS} months.`,
        createdBy: null,
        createdAt: new Date(),
      })
      await db.delete(tasks).where(eq(tasks.cardId, card.id))
      await db.delete(cards).where(and(eq(cards.id, card.id), eq(cards.channelId, card.channelId)))
      results.push({ title: card.title, kept: false, reason: verdict.reason })
      console.info(`[studio] rejected "${card.title}": ${verdict.reason}. Paid line: ${paidToday(content) ?? content.split('\n').find((l) => /paid/i.test(l)) ?? 'none'}`)
      continue
    }

    messages[first] = { ...messages[first], content: `${content.trim()}\n\n${CHECKED_MARKER} ${verdict.reason}.` }
    await db.update(cards).set({ messages: messages as typeof card.messages, updatedAt: new Date() }).where(eq(cards.id, card.id))
    results.push({ title: card.title, kept: true, reason: verdict.reason })
  }
  return results
}
