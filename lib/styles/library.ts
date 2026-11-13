/**
 * A channel of prompt cards, read as a library of visual styles.
 *
 * The Image Prompt Library channel's bot writes each find as a card whose thread
 * opens with "## Reusable prompt template" and a quoted template with slots
 * ([SUBJECT] or {product}). This reads those cards into styles the style playground
 * can show, and composes a print brief onto a style without rewriting the style's
 * own words. The channel stays the source of truth: nothing here is a copy.
 *
 * Pure: no database, so it's easy to test and to run in the browser.
 */

export type StyleStage = 'new' | 'testing' | 'tested' | 'curated' | 'aside'

export interface StyleRecord {
  cardId: string
  name: string
  /** The reusable template, as the card has it (slots and all). */
  template: string
  /** What the style should look like. */
  outcome: string
  tags: string[]
  /** Print and product uses the card lists. */
  uses: string[]
  /** Slot → example values, from the card's variables list. */
  variables: { name: string; examples: string }[]
  sourceUrl: string | null
  /** An example: the card's cover, or the latest image on its thread. */
  imageUrl: string | null
  stage: StyleStage
  columnName: string
  updatedAt: number | null
}

export interface StyleCardInput {
  id: string
  title: string
  columnName: string
  coverImageUrl?: string | null
  updatedAt?: number | null
  messages: { content?: string; imageUrls?: string[] }[]
}

/** Which testing state a column name means, for the channel's columns or anyone else's. */
export function stageOf(columnName: string): StyleStage {
  const n = columnName.toLowerCase()
  if (/set aside|reject|dislike|archive|not /.test(n)) return 'aside'
  if (/curated|library|like|keep|approved/.test(n)) return 'curated'
  if (/^tested|tested$|done/.test(n)) return 'tested'
  if (/test/.test(n)) return 'testing'
  return 'new'
}

function section(md: string, ...names: string[]): string {
  const parts = md.split(/^##\s+/m)
  for (const p of parts) {
    const head = p.split('\n')[0].trim().toLowerCase()
    if (names.some((n) => head.startsWith(n))) return p.slice(p.indexOf('\n') + 1).trim()
  }
  return ''
}

const unmd = (s: string) => s.replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim()

/** The quoted template under "Reusable prompt template", or null when the card isn't a style. */
export function templateOf(md: string): string | null {
  const body = section(md, 'reusable prompt', 'prompt template', 'prompt')
  if (!body) return null
  const quoted = body.split('\n').filter((l) => l.startsWith('>')).map((l) => l.replace(/^>\s?/, '')).join(' ').trim()
  const text = unmd(quoted || body.split('\n\n')[0])
  return text.length > 40 ? text : null
}

export function parseStyleCard(card: StyleCardInput): StyleRecord | null {
  const all = card.messages.map((m) => m.content ?? '').join('\n\n')
  const template = templateOf(all)
  if (!template) return null
  const tagLine = section(all, 'tags')
  const tags = [...tagLine.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()).filter(Boolean)
  const uses = section(all, 'product and print uses', 'product uses', 'print uses', 'uses')
    .split('\n').filter((l) => /^\s*[-*]\s+/.test(l)).map((l) => unmd(l.replace(/^\s*[-*]\s+/, ''))).slice(0, 8)
  const variables = section(all, 'useful variables', 'variables')
    .split('\n')
    .map((l) => l.match(/^\s*[-*]\s+\*\*([^*:]+):?\*\*:?\s*(.+)$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ name: m[1].trim(), examples: unmd(m[2]) }))
    .slice(0, 12)
  const source = all.match(/\*\*Source page:\*\*\s*\[[^\]]*\]\((https?:\/\/[^)]+)\)/)?.[1] ?? all.match(/\((https?:\/\/[^)\s]+)\)/)?.[1] ?? null
  const images = card.messages.flatMap((m) => [...(m.imageUrls ?? []), ...[...(m.content ?? '').matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)].map((x) => x[1])])
  return {
    cardId: card.id,
    name: card.title,
    template,
    outcome: unmd(section(all, 'expected visual outcome', 'visual outcome').split('\n\n')[0] ?? ''),
    tags,
    uses,
    variables,
    sourceUrl: source,
    imageUrl: card.coverImageUrl || images.at(-1) || null,
    stage: stageOf(card.columnName),
    columnName: card.columnName,
    updatedAt: card.updatedAt ?? null,
  }
}

// ── The print brief ───────────────────────────────────────────────────────

export type PrintFormat = 'flyer' | 'brochure' | 'poster' | 'postcard' | 'sign' | 'custom'
export type Aspect = '1:1' | '4:3' | '16:9' | '3:4' | '9:16'

export const FORMATS: { id: PrintFormat; label: string; aspect: Aspect; note: string }[] = [
  { id: 'flyer', label: 'Flyer', aspect: '3:4', note: 'a portrait flyer, read at arm’s length' },
  { id: 'poster', label: 'Poster', aspect: '3:4', note: 'a portrait poster, seen from across a room' },
  { id: 'postcard', label: 'Postcard', aspect: '4:3', note: 'the front of a landscape postcard' },
  { id: 'brochure', label: 'Brochure', aspect: '4:3', note: 'a brochure cover or panel image' },
  { id: 'sign', label: 'Sign', aspect: '16:9', note: 'a wide sign or banner, read in seconds from a distance' },
  { id: 'custom', label: 'Custom', aspect: '1:1', note: '' },
]

export interface PrintBrief {
  format: PrintFormat
  /** For custom: what the piece is. */
  custom?: string
  subject: string
  message?: string
  audience?: string
  constraints?: string
  aspect?: Aspect
}

/**
 * The style's template, untouched, followed by the piece it's for. The image model
 * fills the template's slots from the brief; the style's own words stay as written,
 * so a style tested once looks the same next time.
 */
export function composePrompt(style: Pick<StyleRecord, 'template' | 'name'>, brief: PrintBrief): string {
  const f = FORMATS.find((x) => x.id === brief.format) ?? FORMATS[0]
  const piece = brief.format === 'custom' ? (brief.custom?.trim() || 'a printed piece') : f.note
  const aspect = brief.aspect ?? f.aspect
  const lines = [
    `Style: ${style.name}.`,
    style.template,
    '',
    `Use this style for ${piece}. Fill every bracketed or braced slot above from this brief, and leave out any slot the brief doesn't need:`,
    `- Subject: ${brief.subject.trim() || 'choose something fitting'}`,
  ]
  if (brief.message?.trim()) lines.push(`- Message it should carry: ${brief.message.trim()}`)
  if (brief.audience?.trim()) lines.push(`- Who it's for: ${brief.audience.trim()}`)
  if (brief.constraints?.trim()) lines.push(`- Must: ${brief.constraints.trim()}`)
  lines.push(
    `- Aspect ratio: ${aspect}.`,
    'Make it a strong image for print: one clear focal point, room left for a headline and details to be set in type later, nothing important at the very edges. Render no text unless the brief gives exact words.',
  )
  return lines.join('\n')
}
