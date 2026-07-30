import { db } from '@/lib/db'
import { channels, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getLLMClientForUser, type LLMMessage } from '@/lib/ai/llm'
import { extractEmailConfig } from '@/lib/emails/extractEmailConfig'
import { sendComposedEmail } from '@/lib/emails/send'
import type { EmailConfig } from '@/lib/emails/dynamicRenderer'
import type { InstructionAction, InstructionCard } from '@/lib/types'

/**
 * What a run actually did, in the shape the email composer needs.
 *
 * Deliberately not the raw API response — the composer only needs titles and counts,
 * and passing whole card objects would push a lot of irrelevant text into the prompt.
 */
export interface ShroomRunOutcome {
  action: InstructionAction
  /**
   * Cards the run created. `body` is the card's actual text — without it the email can
   * only say how many cards appeared, which is the least interesting thing about them.
   * `cardId` becomes a deep link so the reader can open the card from the email.
   */
  created?: { title: string; body?: string; cardId?: string }[]
  createdArePending?: boolean
  /** Cards the run edited, with the text it wrote onto them. */
  modified?: { title: string; body?: string; cardId?: string }[]
  /** Cards the run relocated. */
  moved?: { title: string; toColumn: string; cardId?: string }[]
  /** A report action's findings. */
  report?: { headline: string; highlights: string[]; summary?: string; cardId?: string }
}

export type SendRunEmailResult =
  | { sent: true }
  | { sent: false; reason: string }

export function outcomeIsEmpty(outcome: ShroomRunOutcome): boolean {
  return (
    !outcome.report &&
    (outcome.created?.length ?? 0) === 0 &&
    (outcome.modified?.length ?? 0) === 0 &&
    (outcome.moved?.length ?? 0) === 0
  )
}

/**
 * Email the channel owner about a shroom run.
 *
 * The shroom stores a natural-language *brief*, not a template — so the email is
 * composed here, per run, from the brief plus what actually happened. A quiet run and
 * a busy one should not produce the same email, which is the whole reason this isn't
 * a saved template with {{placeholders}}.
 *
 * Never throws: a failed email must not fail the run that produced it. Callers can
 * ignore the result.
 */
export async function sendShroomRunEmail(
  instructionCard: InstructionCard,
  channelId: string,
  outcome: ShroomRunOutcome,
  /**
   * Who triggered the run. Must be the channel owner, since they're the recipient.
   *
   * `/api/run-instruction` takes the whole channel object from the request body, so
   * without this check any signed-in user could name someone else's channel and have
   * attacker-written text delivered to that owner's inbox. Requiring the two to match
   * means a shroom can only ever mail the person who set it off.
   */
  actingUserId?: string
): Promise<SendRunEmailResult> {
  try {
    const email = instructionCard.emailConfig
    if (!email?.enabled) return { sent: false, reason: 'not enabled' }
    if (!email.brief?.trim()) return { sent: false, reason: 'no brief set' }

    const skipWhenEmpty = email.skipWhenNothingHappened !== false
    if (skipWhenEmpty && outcomeIsEmpty(outcome)) {
      return { sent: false, reason: 'nothing happened' }
    }

    const channel = await db.query.channels.findFirst({
      where: eq(channels.id, channelId),
      columns: { id: true, name: true, ownerId: true },
    })
    if (!channel) return { sent: false, reason: 'channel not found' }
    if (actingUserId && actingUserId !== channel.ownerId) {
      return { sent: false, reason: 'only the channel owner receives shroom email' }
    }

    const owner = await db.query.users.findFirst({
      where: eq(users.id, channel.ownerId),
      columns: { email: true, name: true },
    })
    if (!owner?.email) return { sent: false, reason: 'owner has no email' }

    const baseUrl = process.env.NEXTAUTH_URL || 'https://kanthink.com'
    const boardUrl = `${baseUrl}/channel/${channel.id}`
    const cardUrl = (cardId: string) => `${baseUrl}/channel/${channel.id}/card/${cardId}`

    // Composed with the owner's own LLM access — they're the recipient and the one
    // whose key or quota this spends.
    const { client } = await getLLMClientForUser(channel.ownerId)

    let config: EmailConfig | null = null

    if (client) {
      try {
        const response = await client.complete(
          buildComposePrompt(instructionCard, channel.name, owner.name ?? null, boardUrl, outcome, cardUrl),
          // An email AST carrying a full analysis is verbose JSON. The 4096 default
          // truncated longer runs mid-tree, which parsed as nothing and silently
          // dropped the email to the generic fallback.
          { maxTokens: 16000 }
        )
        config = extractEmailConfig(response.content)
        if (!config) {
          console.error(
            `[shroom-email] Could not parse an email out of the model response for "${instructionCard.title}". ` +
            `First 400 chars: ${response.content.slice(0, 400)}`
          )
        }
      } catch (error) {
        console.error('[shroom-email] Compose failed, using fallback:', error)
      }
    } else {
      console.warn(`[shroom-email] No LLM available for channel owner; sending fallback for "${instructionCard.title}"`)
    }

    // The composed email is the point; this is the "something went wrong" path, and it
    // should look like it rather than quietly passing for the real thing.
    if (!config) {
      config = fallbackConfig(instructionCard, channel.name, boardUrl, outcome, cardUrl)
    }

    if (email.subjectHint?.trim() && !config.subject.trim()) {
      config.subject = email.subjectHint.trim()
    }

    const ok = await sendComposedEmail(owner.email, config)
    return ok ? { sent: true } : { sent: false, reason: 'transport failed' }
  } catch (error) {
    console.error('[shroom-email] Unexpected failure:', error)
    return { sent: false, reason: error instanceof Error ? error.message : 'unknown error' }
  }
}

/** Keep one card's text from crowding out the rest of the run. */
function clip(text: string, max = 4000): string {
  const trimmed = text.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max)}\n…(truncated)` : trimmed
}

function describeOutcome(outcome: ShroomRunOutcome, cardUrl?: (id: string) => string): string {
  const parts: string[] = []
  const link = (id?: string) => (id && cardUrl ? `Card link: ${cardUrl(id)}` : null)

  if (outcome.report) {
    parts.push(`Report headline: ${outcome.report.headline}`)
    if (outcome.report.highlights.length > 0) {
      parts.push('Highlights:', ...outcome.report.highlights.map((h) => `- ${h}`))
    }
    if (outcome.report.summary) parts.push(`Summary: ${outcome.report.summary}`)
    const l = link(outcome.report.cardId)
    if (l) parts.push(l)
  }

  if (outcome.created?.length) {
    parts.push(
      outcome.createdArePending
        ? `Created ${outcome.created.length} card(s), waiting in the review queue for approval:`
        : `Created ${outcome.created.length} card(s):`
    )
    for (const c of outcome.created) {
      parts.push(`### ${c.title}`)
      if (c.body) parts.push(clip(c.body))
      const l = link(c.cardId)
      if (l) parts.push(l)
    }
  }

  if (outcome.modified?.length) {
    parts.push(`Updated ${outcome.modified.length} card(s):`)
    for (const c of outcome.modified) {
      parts.push(`### ${c.title}`)
      // The written text is the whole point of a modify run — a bare title tells the
      // reader nothing, and produced emails that looked like generic notifications.
      if (c.body) parts.push(clip(c.body))
      const l = link(c.cardId)
      if (l) parts.push(l)
    }
  }

  if (outcome.moved?.length) {
    parts.push(`Moved ${outcome.moved.length} card(s):`)
    for (const c of outcome.moved) {
      const l = link(c.cardId)
      parts.push(`- ${c.title} → ${c.toColumn}${l ? ` (${cardUrl!(c.cardId!)})` : ''}`)
    }
  }

  return parts.length > 0 ? parts.join('\n\n') : 'The run completed without changing anything.'
}

function buildComposePrompt(
  instructionCard: InstructionCard,
  channelName: string,
  ownerName: string | null,
  boardUrl: string,
  outcome: ShroomRunOutcome,
  cardUrl: (id: string) => string
): LLMMessage[] {
  const email = instructionCard.emailConfig!

  const systemPrompt = `You are Kan, the AI assistant in Kanthink. You are writing one email to the owner of a Kanban board about what their automation (a "shroom") just produced.

**The owner's brief is the specification for this email.** It is not a style hint on top of a fixed template — there is no template. Build whatever structure the brief asks for, out of the components below. If the brief asks for a table, build a table. If it asks for one paragraph, send one paragraph. If it asks for sections per card, build those sections.

**The run's output is the content.** The shroom generated real text — analyses, summaries, card bodies. That text is the substance of this email. Carry it through in full unless the brief says to condense; do not reduce it to "1 card was updated". An email that only reports counts has thrown away the thing worth sending.

You output the email as a JSON AST of React Email components, rendered inside a shared layout (Kanthink header and footer). Don't write your own greeting header or footer — the layout provides those.

## Default styles are applied automatically

Heading, Text, Button, Hr, th and td already carry Kanthink's design tokens. Use \`type\` and \`children\` only; add a \`style\` prop only to override a specific default.

## AST node format

- String: \`"Hello"\`
- Array: \`["Hello ", { "type": "strong", "children": "world" }]\`
- Element: \`{ "type": "ComponentName", "props": { ... }, "children": ... }\`

Available components — Text, Heading (\`as\` prop for h1-h6), Link (href), Button (href), Section, Row, Column, Hr, Markdown, and the HTML elements table, thead, tbody, tr, th, td, div, span, strong, em, br, p, a.

**Markdown is the easiest way to carry generated prose through.** The shroom's output often already has structure — headings, bullets, numbered lists. \`{ "type": "Markdown", "children": "...raw markdown..." }\` renders it faithfully in one node instead of hand-building dozens.

Design tokens: violet #7c3aed, dark #18181b, body #3f3f46, muted #71717a, surface #fafafa, border #e4e4e7.

## Output format

Reply with nothing but this block:

[EMAIL_TEMPLATE]
{"subject": "...", "previewText": "...", "body": [ ...nodes... ]}
[/EMAIL_TEMPLATE]

## Rules

- The brief governs tone, length, structure and what to include. Follow it literally.
- Report only what actually happened. Never invent cards, counts, or findings.
- Include the generated text itself, not a description of it.
- If the run genuinely did nothing, say so in a sentence. Don't pad.
- Subject lines are specific: "Deep analysis of 3 new bookmarks" beats "Your board update".
- When a card link is given for an item, link that item's heading or add a "View card"
  Button for it. A reader should be able to open the exact card, not just the board.
- End with a Button linking to ${boardUrl} unless the brief says otherwise.
- previewText is the inbox preview — one sentence that doesn't just repeat the subject.`

  const userPrompt = `Board: "${channelName}"${ownerName ? `\nOwner: ${ownerName}` : ''}
Automation: "${instructionCard.title}" (${outcome.action} action)
Board link: ${boardUrl}

The owner's brief for this email:
"""
${email.brief.trim()}
"""
${email.subjectHint?.trim() ? `\nSubject line steer: "${email.subjectHint.trim()}"\n` : ''}
What this run actually did:
"""
${describeOutcome(outcome, cardUrl)}
"""

Write the email.`

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
}

/**
 * Used when the model can't be reached or returns something unparseable.
 *
 * Still renders the run's actual output as markdown rather than a bare count — losing
 * the composition shouldn't also mean losing the content the shroom worked to produce.
 */
function fallbackConfig(
  instructionCard: InstructionCard,
  channelName: string,
  boardUrl: string,
  outcome: ShroomRunOutcome,
  cardUrl: (id: string) => string
): EmailConfig {
  const headline = outcome.report?.headline ?? `"${instructionCard.title}" ran on ${channelName}`

  return {
    subject: headline,
    previewText: `An update from your ${channelName} board`,
    body: [
      { type: 'Heading', children: headline },
      { type: 'Markdown', children: describeOutcome(outcome, cardUrl) },
      { type: 'Hr' },
      {
        type: 'Section',
        props: { style: { textAlign: 'center', margin: '16px 0' } },
        children: { type: 'Button', props: { href: boardUrl }, children: `Open ${channelName}` },
      },
    ],
  }
}
