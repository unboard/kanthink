/**
 * Which spark opens Home this morning, and how Kan says it.
 *
 * One spark at a time, never the same one twice, and never one older than a few
 * days — a stale spark reads as a backlog, which is exactly the dashboard feeling
 * this is meant to replace.
 */

export interface SparkCandidate {
  id: string
  title: string
  summary?: string | null
  messages?: { type?: string; content?: string }[] | null
  createdAt?: Date | null
  isArchived?: boolean | null
  isPendingReview?: boolean | null
}

export const SPARK_MAX_AGE_DAYS = 3

export function pickSpark(cards: SparkCandidate[], handled: string[], now: Date): SparkCandidate | null {
  const seen = new Set(handled)
  const oldest = now.getTime() - SPARK_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  const fresh = cards
    .filter((c) => !c.isArchived && !c.isPendingReview && !seen.has(c.id))
    .filter((c) => (c.createdAt ? c.createdAt.getTime() >= oldest : false))
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
  return fresh[0] ?? null
}

/** The scout's write-up, as plain text: the first message, else the summary. */
export function sparkBody(card: SparkCandidate): string {
  const first = (card.messages ?? []).find((m) => (m.content || '').trim())
  return ((first?.content || card.summary || '').trim())
}

function clip(text: string, max: number) {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const end = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('. '))
  return `${(end > max * 0.5 ? cut.slice(0, end + 1) : cut).trim()}…`
}

/**
 * Kan's opening message on Home. Markdown, because Home renders it with
 * ReactMarkdown like every other Kan reply.
 */
export function sparkMessage(card: SparkCandidate): string {
  const body = sparkBody(card)
  return [
    `Morning. Something the scouts found: **${card.title}**`,
    body ? clip(body, 900) : '',
    'Want me to put up a test page for it? Or tell me what you’d change, or pass.',
  ].filter(Boolean).join('\n\n')
}
