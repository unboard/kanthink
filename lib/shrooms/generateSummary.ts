import { db } from '@/lib/db'
import { channels, instructionCards } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getLLMClientForUser } from '@/lib/ai/llm'

/**
 * Write the one-line description shown on a shroom's card.
 *
 * `instructions` is written *to* the model — "Review the bookmark card. Add a note or
 * update the description with a deep analysis structured as follows: 1. A brief TL;DR…".
 * Printing that on a card is why they read like configuration rather than like a
 * description of a thing that does work for you.
 *
 * Never throws. A missing summary just falls back to the instructions on the card, which
 * is exactly where we were before.
 */
export async function generateShroomSummary(instructionId: string): Promise<string | null> {
  try {
    const shroom = await db.query.instructionCards.findFirst({
      where: eq(instructionCards.id, instructionId),
    })
    if (!shroom) return null

    const channel = await db.query.channels.findFirst({
      where: eq(channels.id, shroom.channelId),
      columns: { ownerId: true, name: true },
    })
    if (!channel) return null

    const { client } = await getLLMClientForUser(channel.ownerId)
    if (!client) return null

    const response = await client.complete(
      [
        {
          role: 'system',
          content: `You write the one-line description shown on an automation's card in a Kanban app.

Rules:
- One sentence, at most two. Under 30 words.
- Third person, present tense, starting with a verb: "Rewrites a card as a product brief…", "Sorts an idea into the column it belongs in…".
- Describe the TRANSFORMATION — what it does to a card and what comes out. Never say which column or how many cards. The same automation gets run on one card, on a selection, and on a whole column, so any scope you name will be wrong most of the time.
- The instructions may mention a column. Ignore it; that is where it usually runs, not what it does.
- Plain language. No jargon, no marketing, no "This shroom…", no restating the title.
- Reply with the sentence only. No quotes, no preamble.`,
        },
        {
          role: 'user',
          content: `Board: "${channel.name}"
Automation name: "${shroom.title}"
Action: ${shroom.action}

Its instructions (written for the model, not for a person):
"""
${shroom.instructions.slice(0, 2000)}
"""

Write the card description.`,
        },
      ],
      // One sentence needs very few tokens to write, but a reasoning model spends its
      // budget thinking first and only then starts writing. At 200 the whole allowance
      // could go to thinking, and what got saved was a fragment — including, seen in the
      // wild, a piece of the rule list above echoed back.
      { maxTokens: 4000 }
    )

    const summary = response.content.trim().replace(/^["']|["']$/g, '').trim()

    // A cut-off answer is not a summary. Saving one replaces a readable fallback with
    // an unreadable fragment, which is worse than having no summary at all.
    if (response.truncated || !isUsableSummary(summary)) {
      console.warn(`[shrooms] Discarded summary for ${instructionId}: ${
        response.truncated ? 'truncated' : `unusable (${JSON.stringify(summary.slice(0, 80))})`
      }`)
      return null
    }

    await db
      .update(instructionCards)
      .set({ summary, updatedAt: new Date() })
      .where(eq(instructionCards.id, instructionId))
    return summary
  } catch (error) {
    console.error('[shrooms] Summary generation failed:', error)
    return null
  }
}

/**
 * Reject the answers that are worse than no answer.
 *
 * The failure mode seen on real cards was a fragment starting mid-word, and text lifted
 * from the instruction block rather than written about it.
 */
export function isUsableSummary(summary: string): boolean {
  if (summary.length < 12 || summary.length > 400) return false
  // Starts mid-sentence: an ellipsis, a stray quote, or lowercase after no capital.
  if (/^[.…"'/,;:)\]}-]/.test(summary)) return false
  if (!/^[A-Z]/.test(summary)) return false
  // Echoed rules from the prompt rather than a description.
  if (/restating the title|third person|present tense|no preamble|one sentence/i.test(summary)) return false
  return true
}
