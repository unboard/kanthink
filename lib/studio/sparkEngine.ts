import { db } from '@/lib/db'
import { cards } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { StudioRow } from './setup'
import { addSparkTasks, formatSignals, gatherSignals, type Signal, type SparkSignals } from './signals'

/**
 * The spark engine: money ideas from your own curiosity and expertise.
 *
 * It replaced a scout that searched the web for strangers' complaints and wrote up
 * whichever small-business tool had a price and two quotes behind it. Those passed
 * every check and were still not ideas anyone wanted to act on: nothing tied them to
 * the person reading them. These start from what you read, save and spend your
 * hours on, so each one can show what set it off and why you're the one to do it —
 * and each arrives with a first move small enough to do today, because an idea
 * without one is an idea that dies on the board.
 *
 * The parsing and the card's words are pure and tested; the model call and the
 * database work are at the bottom.
 */

export const SPARKS_PER_MORNING = 3

export type SparkKind = 'app' | 'product' | 'service' | 'content' | 'feature'

export interface SparkIdea {
  title: string
  hook: string
  kind: SparkKind
  /** Signal ids from the prompt ("R3", "B12") — checked against what was actually sent. */
  sparkedBy: string[]
  idea: string
  whyYou: string
  money: { who: string; how: string; price: string }
  firstMove: string
  nextSteps: string[]
  /** Where the test page should be shared first, specifically. */
  shareWhere: string
}

const KIND_LABEL: Record<SparkKind, string> = {
  app: 'An app',
  product: 'A product',
  service: 'A service',
  content: 'Content',
  feature: 'For Kanthink or MyCreativeShop',
}

export function buildSparkPrompt(s: SparkSignals, signalText: string, count = SPARKS_PER_MORNING): string {
  return `You are Kan, the person's sharpest business friend. Your one job: help them make money from what they're already curious about and good at.

Below is what they read, saved, spend their hours on and are working on. Find ${count} money opportunities in it. Look for:
- collisions: two things they care about that nobody has put together (a technique they keep reading about + a market they know cold)
- an unfair advantage: their expertise, their access (customers, data, a product they run, a distribution channel), or their tools
- something new this month that makes an old idea suddenly easy or cheap
- a pattern in their own time that others would pay to skip

Make them creative and specific. Never generic ("an AI tool for small businesses"). Each one should make them a little excited and a little impatient to try it. Mix the kinds: an app, a product or template pack, a service, content that earns, or a feature for something they already run — whatever the evidence points to. At least one should be startable this week with almost no building.

For each, a first move: one concrete thing they can do in under 30 minutes today that tests whether anyone cares — usually putting up the test page and sharing it somewhere specific. Then three next steps toward the first dollar.

${s.learned.length ? `WHAT THEY'VE TOLD YOU (follow these):\n${s.learned.map((l) => `- ${l}`).join('\n')}\n\n` : ''}${s.passes.length ? `IDEAS THEY PASSED ON, AND WHY (don't repeat the kind of mistake):\n${s.passes.slice(0, 20).map((l) => `- ${l.slice(0, 240)}`).join('\n')}\n\n` : ''}${s.history.length ? `ALREADY ON THEIR BOARD (never repeat or lightly reword these):\n${s.history.map((h) => `- ${h.title} (${h.stage})`).join('\n')}\n\n` : ''}${signalText}

Respond with JSON only, an array of ${count}:
[{"title": "2-4 plain words, the thing's name",
  "hook": "one sentence that makes them want it: what it is and the money in it",
  "kind": "app" | "product" | "service" | "content" | "feature",
  "sparkedBy": ["ids of the signals above that set it off, at least one, e.g. R3, B12"],
  "idea": "2-3 sentences: what it is, who it's for, what makes it different",
  "whyYou": "one sentence: the expertise, access or tool that gives them the edge",
  "money": {"who": "who pays", "how": "how it earns", "price": "a price to test, e.g. $29 a month"},
  "firstMove": "one thing to do today, under 30 minutes",
  "nextSteps": ["three short steps toward the first dollar"],
  "shareWhere": "the specific place to post the test page first, e.g. r/printing, the MyCreativeShop customer email, their X followers"}]
Only cite signal ids that appear above, and only in "sparkedBy": never write an id like R3 or T5 in the prose. Never invent facts about them: no user counts, revenue or other numbers unless a signal says so.`
}

function asText(v: unknown, max = 600): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/** The model's reply, read strictly: anything malformed or unsourced is dropped. */
export function parseSparkIdeas(raw: string, known: Set<string>): SparkIdea[] {
  const body = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')
  const start = body.indexOf('[')
  const end = body.lastIndexOf(']')
  if (start < 0 || end < start) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(body.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const kinds: SparkKind[] = ['app', 'product', 'service', 'content', 'feature']
  const out: SparkIdea[] = []
  for (const item of parsed as Record<string, unknown>[]) {
    if (!item || typeof item !== 'object') continue
    const title = asText(item.title, 60)
    const hook = asText(item.hook, 300)
    const firstMove = asText(item.firstMove, 300)
    // Only what was actually in the prompt. An idea that can't point at anything of
    // theirs is exactly the generic kind this replaced.
    const sparkedBy = (Array.isArray(item.sparkedBy) ? item.sparkedBy : [])
      .map((x) => String(x).trim().toUpperCase())
      .filter((id, i, all) => known.has(id) && all.indexOf(id) === i)
    if (!title || !hook || !firstMove || sparkedBy.length === 0) continue
    const money = (item.money && typeof item.money === 'object' ? item.money : {}) as Record<string, unknown>
    out.push({
      title,
      hook,
      kind: kinds.includes(item.kind as SparkKind) ? (item.kind as SparkKind) : 'app',
      sparkedBy,
      idea: asText(item.idea),
      whyYou: asText(item.whyYou, 300),
      money: { who: asText(money.who, 200), how: asText(money.how, 300), price: asText(money.price, 80) },
      firstMove,
      nextSteps: (Array.isArray(item.nextSteps) ? item.nextSteps : []).map((x) => asText(x, 200)).filter(Boolean).slice(0, 3),
      shareWhere: asText(item.shareWhere, 200),
    })
  }
  return out
}

/** Drop ideas whose title is already on the board, however it's capitalized. */
export function freshIdeas(ideas: SparkIdea[], history: { title: string }[]): SparkIdea[] {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const seen = new Set(history.map((h) => norm(h.title)))
  return ideas.filter((i) => {
    const k = norm(i.title)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** A page title as a short link label: no "(1)" unread counts, entities or "/ X" suffix. */
export function cleanLabel(title: string): string {
  const t = title
    .replace(/^\(\d+\)\s*/, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<')
    .replace(/\s*\/\s*X$/, '')
    .replace(/[\[\]]/g, '')
    .trim()
  // An X post's title is "Name on X: "the whole post"": the name and the start of it.
  const post = t.match(/^(.+?) on X: "(.*)"?$/)
  const label = post ? `${post[1]}: ${post[2].replace(/"$/, '')}` : t
  return label.length > 70 ? `${label.slice(0, 67).replace(/\s+\S*$/, '')}…` : label
}

/**
 * The competitor check, kept to whole bullets. Search answers open with a line of
 * preamble and run long; cutting at a character count left a sentence hanging.
 */
export function trimLookAround(text: string, max = 1100): string | undefined {
  const lines = text.replace(/\r/g, '').split('\n')
  const firstBullet = lines.findIndex((l) => /^\s*[*\-•]\s+/.test(l))
  const body = (firstBullet > 0 ? lines.slice(firstBullet) : lines).join('\n').trim()
  const bullets = body.split(/\n(?=\s*[*\-•]\s+)/)
  let out = ''
  for (const bullet of bullets) {
    if (out && out.length + bullet.length + 1 > max) break
    out = out ? `${out}\n${bullet.trim()}` : bullet.trim()
  }
  return out ? out.slice(0, max * 2) : undefined
}

function sourceLink(s: Signal): string {
  const label = cleanLabel(s.label)
  if (s.kind === 'time') return `your ${s.minutes ?? ''} min on ${s.label}`.replace('  ', ' ')
  if (s.kind === 'channel') return `your board “${label}”`
  return s.url ? `[${label}](${s.url})` : `“${label}”`
}

/**
 * The card's write-up. Plain paragraphs and bold labels, no headings: the board shows
 * the first line as the preview, so the hook goes first.
 */
export function sparkContent(idea: SparkIdea, byId: Map<string, Signal>, outThere?: string): string {
  const sources = idea.sparkedBy.map((id) => byId.get(id)).filter((s): s is Signal => !!s)
  const lines = [
    idea.hook,
    `**Sparked by** ${sources.map(sourceLink).join(' · ')}`,
    idea.idea,
    idea.whyYou ? `**Why you:** ${idea.whyYou}` : '',
    `**${KIND_LABEL[idea.kind]}.** ${[idea.money.who && `${idea.money.who} pay`, idea.money.how].filter(Boolean).join(' — ')}${idea.money.price ? `. Test at ${idea.money.price}.` : ''}`,
    `**First move (today):** ${idea.firstMove}`,
    idea.shareWhere ? `**Share the test page in:** ${idea.shareWhere}` : '',
    outThere ? `**Out there already:**\n${outThere}` : '',
  ]
  return lines.filter(Boolean).join('\n\n')
}

// --- The run -----------------------------------------------------------------

/**
 * A quick look at who already sells something like it, and for how much. Optional:
 * a provider without web search, or a slow one, just means the card goes without.
 */
async function lookAround(llm: { webSearch?: (q: string, s?: string) => Promise<{ content: string }> }, idea: SparkIdea): Promise<string | undefined> {
  if (!llm.webSearch) return undefined
  try {
    const res = await Promise.race([
      llm.webSearch(
        `Who already sells something like this, and what do they charge? "${idea.title}": ${idea.idea}`,
        'Answer in at most 3 short bullet points: the closest existing products or services with their price, and the gap they leave. Include a link for each. If nothing close exists, say so in one bullet.',
      ),
      new Promise<null>((r) => setTimeout(() => r(null), 45_000)),
    ])
    return res?.content ? trimLookAround(res.content) : undefined
  } catch {
    return undefined
  }
}

/** This morning's sparks, written onto the Studio board for review. */
export async function runSparkEngine(studio: StudioRow, now = new Date(), count = SPARKS_PER_MORNING) {
  const s = await gatherSignals(studio, now)
  const { text, byId } = formatSignals(s)
  if (byId.size === 0) return { created: 0, detail: 'nothing to go on yet: no Kanwatch reads, bookmarks or boards' }

  const { getLLMClientForUser } = await import('@/lib/ai/llm')
  const { client, source, error } = await getLLMClientForUser(studio.userId, undefined, 'automations')
  if (!client) return { created: 0, detail: error || 'no AI provider' }

  let ideas: SparkIdea[] = []
  for (let attempt = 0; attempt < 2 && ideas.length === 0; attempt++) {
    const res = await client.complete([{ role: 'user', content: buildSparkPrompt(s, text, count) }], { maxTokens: 8192 })
    ideas = freshIdeas(parseSparkIdeas(res.content, new Set(byId.keys())), s.history).slice(0, count)
  }
  if (source === 'owner') {
    const { recordUsage } = await import('@/lib/usage')
    await recordUsage(studio.userId, 'studio-sparks').catch(() => {})
  }
  if (ideas.length === 0) return { created: 0, detail: 'the model returned nothing usable' }

  const outThere = await Promise.all(ideas.map((i) => lookAround(client, i)))

  // Pending review, at the end of the Sparks review bucket — the same shape a shroom
  // writes, so Home's spark card and the drawer's Approve/Pass work unchanged.
  const last = await db.query.cards.findFirst({
    where: and(eq(cards.columnId, studio.sparksColumnId), eq(cards.isPendingReview, true)),
    orderBy: [desc(cards.position)],
    columns: { position: true },
  })
  let position = (last?.position ?? -1) + 1
  const runId = nanoid()
  const created: string[] = []
  for (let i = 0; i < ideas.length; i++) {
    const idea = ideas[i]
    const id = nanoid()
    await db.insert(cards).values({
      id,
      channelId: studio.channelId,
      columnId: studio.sparksColumnId,
      title: idea.title,
      summary: idea.hook,
      messages: [{ id: nanoid(), type: 'ai_response', content: sparkContent(idea, byId, outThere[i]), createdAt: now.toISOString() }] as typeof cards.$inferInsert.messages,
      source: 'ai',
      position: position++,
      isPendingReview: true,
      reviewRunId: runId,
      createdByInstructionId: studio.scoutShroomId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    await addSparkTasks(studio.channelId, id, [idea.firstMove, ...idea.nextSteps])
    created.push(idea.title)
  }
  return { created: created.length, detail: created.join(', ') }
}
